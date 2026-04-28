"""SemsarAI NLP sidecar.

Single responsibility: ``text → {intent, confidence, slots}``. No DB, no
outbound HTTP, no persistent state — see spec §3.1 for the hard contract.
"""
from __future__ import annotations

import logging
import os

from fastapi import FastAPI

from .health import make_router
from .model import StubClassifier, load_classifier
from .schemas import AnalyzeRequest, AnalyzeResponse, Slots
from .slot_extractor import extract_slots

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger("nlp-service")

app = FastAPI(title="SemsarAI NLP", version="0.1.0")

_classifier = load_classifier()
_model_loaded = not isinstance(_classifier, StubClassifier)

app.include_router(make_router(_classifier.name, _model_loaded))


@app.post("/nlp/analyze", response_model=AnalyzeResponse)
def analyze(req: AnalyzeRequest) -> AnalyzeResponse:
    intent, confidence = _classifier.predict(req.text)

    # Slot extraction is independent of the classifier; we always run it.
    slots: Slots = extract_slots(req.text)

    # Guard against the stub (or a very under-confident real model) tagging a
    # question that has zero relevant slots as a search. This keeps the
    # low-confidence fallback in NestJS honest.
    if intent == "search_properties" and _is_slot_free(slots) and not _looks_like_search(req.text):
        intent = "unclear"
        confidence = min(confidence, 0.4)

    return AnalyzeResponse(
        intent=intent,
        confidence=round(confidence, 4),
        slots=slots,
        classifier=_classifier.name,  # type: ignore[arg-type]
    )


def _is_slot_free(slots: Slots) -> bool:
    return not any(
        getattr(slots, f) is not None
        for f in ("propertyType", "propertyKind", "bedrooms", "minPrice", "maxPrice", "governorate", "city", "district")
    )


_SEARCH_HINT_TOKENS = ("عايز", "أريد", "اريد", "ابحث", "أبحث", "ودّي", "محتاج", "want", "looking for", "need", "search", "find")


def _looks_like_search(text: str) -> bool:
    lower = text.lower()
    return any(t in lower for t in _SEARCH_HINT_TOKENS)
