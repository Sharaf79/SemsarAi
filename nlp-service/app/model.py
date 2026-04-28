"""Intent classifier.

Two backends sit behind a single ``IntentClassifier`` interface:

* ``StubClassifier`` — regex + keyword heuristics. Always loadable. This is the
  Phase A classifier from the spec, and also the fallback when the DistilBERT
  weights aren't present (e.g. first boot before training has run).
* ``DistilBertClassifier`` — fine-tuned ``distilbert-base-multilingual-cased``
  loaded from ``MODEL_PATH``. Used in Phase B. If loading fails for any reason
  we fall back to the stub rather than 500-ing on every request — the service
  is still "useful without the LLM" by design.

Neither backend has any I/O beyond loading its own weights at boot.
"""
from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Protocol

from .schemas import Intent

logger = logging.getLogger(__name__)


INTENT_LABELS: tuple[Intent, ...] = (
    "search_properties",
    "search_drafts",
    "search_media",
)


class IntentClassifier(Protocol):
    name: str

    def predict(self, text: str) -> tuple[Intent, float]:
        ...


# ─── Stub: deterministic keyword classifier ────────────────────────────
_DRAFT_TOKENS = ("إعلاناتي", "اعلاناتي", "مسوداتي", "مسودة", "مسودات", "drafts", "my drafts", "غير منشور", "لم ينشر", "لسه مش")
_MEDIA_TOKENS = ("صور", "صورة", "فيديو", "فيديوهات", "photo", "photos", "image", "images", "media", "gallery")
_SEARCH_TOKENS = ("شقة", "شقه", "فيلا", "محل", "عقار", "عقارات", "إيجار", "ايجار", "للبيع", "apartment", "villa", "property", "for sale", "for rent", "rent")


class StubClassifier:
    name = "stub"

    def predict(self, text: str) -> tuple[Intent, float]:
        lower = text.lower()
        if any(t in lower for t in _DRAFT_TOKENS):
            return "search_drafts", 0.82
        if any(t in lower for t in _MEDIA_TOKENS):
            return "search_media", 0.78
        if any(t in lower for t in _SEARCH_TOKENS):
            return "search_properties", 0.88
        return "unclear", 0.35


# ─── DistilBERT wrapper ────────────────────────────────────────────────
class DistilBertClassifier:
    name = "distilbert"

    def __init__(self, model_path: Path) -> None:
        # Imported lazily — importing torch/transformers is slow, and we don't
        # want to pay that cost when the stub is doing the work.
        import torch
        from transformers import AutoModelForSequenceClassification, AutoTokenizer

        self._torch = torch
        self._tokenizer = AutoTokenizer.from_pretrained(str(model_path))
        self._model = AutoModelForSequenceClassification.from_pretrained(str(model_path))
        self._model.eval()
        # Labels are baked into the config during training (see training/train.py).
        # We still assert the order matches INTENT_LABELS so a rogue training run
        # can't silently shift classes.
        id2label = self._model.config.id2label
        resolved = tuple(id2label[i] for i in sorted(id2label))
        if resolved != INTENT_LABELS:
            raise RuntimeError(
                f"Model labels {resolved} do not match expected {INTENT_LABELS}. "
                "Re-run training/train.py."
            )

    def predict(self, text: str) -> tuple[Intent, float]:
        torch = self._torch
        with torch.no_grad():
            inputs = self._tokenizer(
                text,
                return_tensors="pt",
                truncation=True,
                max_length=128,
                padding=True,
            )
            logits = self._model(**inputs).logits[0]
            probs = torch.softmax(logits, dim=-1)
            confidence, idx = torch.max(probs, dim=-1)
            label = INTENT_LABELS[int(idx)]
            return label, float(confidence)


# ─── Loader ────────────────────────────────────────────────────────────

def load_classifier() -> IntentClassifier:
    """Pick the best classifier we can load.

    Resolution order:
      1. If ``USE_STUB_CLASSIFIER=true`` → StubClassifier (honours the Phase A
         setting so ops can force the stub without uninstalling torch).
      2. If ``MODEL_PATH`` exists and contains a trained model → DistilBertClassifier.
      3. Otherwise → StubClassifier.
    """
    if os.getenv("USE_STUB_CLASSIFIER", "true").lower() == "true":
        logger.info("USE_STUB_CLASSIFIER=true — using regex/keyword stub classifier")
        return StubClassifier()

    model_path = Path(os.getenv("MODEL_PATH", "./model")).resolve()
    if not (model_path / "config.json").exists():
        logger.warning(
            "Model path %s has no config.json — falling back to stub classifier. "
            "Run training/train.py to produce a real model.",
            model_path,
        )
        return StubClassifier()

    try:
        logger.info("Loading DistilBERT from %s", model_path)
        return DistilBertClassifier(model_path)
    except Exception:
        logger.exception("Failed to load DistilBERT — falling back to stub classifier")
        return StubClassifier()
