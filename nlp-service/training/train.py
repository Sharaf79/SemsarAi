"""Fine-tune distilbert-base-multilingual-cased on the seed intent dataset.

Usage (from nlp-service/):

    python training/train.py

Outputs ``./model/`` — a directory consumable by
``transformers.AutoModelForSequenceClassification.from_pretrained``.

CPU-friendly: 3 epochs, batch 16, ~300 examples → finishes in a few minutes on
a laptop. Re-runnable: delete ``./model`` first if you want a clean slate.
"""
from __future__ import annotations

import json
import os
import random
from pathlib import Path

import torch
from torch.utils.data import Dataset
from transformers import (
    AutoModelForSequenceClassification,
    AutoTokenizer,
    DataCollatorWithPadding,
    Trainer,
    TrainingArguments,
)

BASE_MODEL = os.getenv("BASE_MODEL", "distilbert-base-multilingual-cased")
DATASET_PATH = Path(__file__).parent / "dataset.jsonl"
OUTPUT_DIR = Path(os.getenv("MODEL_PATH", Path(__file__).parent.parent / "model"))

INTENT_LABELS = ("search_properties", "search_drafts", "search_media")
LABEL2ID = {label: i for i, label in enumerate(INTENT_LABELS)}
ID2LABEL = {i: label for label, i in LABEL2ID.items()}


class IntentDataset(Dataset):
    def __init__(self, rows, tokenizer):
        self.rows = rows
        self.tokenizer = tokenizer

    def __len__(self):
        return len(self.rows)

    def __getitem__(self, idx):
        row = self.rows[idx]
        enc = self.tokenizer(
            row["text"],
            truncation=True,
            max_length=128,
        )
        enc["labels"] = LABEL2ID[row["intent"]]
        return enc


def load_dataset(path: Path) -> list[dict]:
    rows: list[dict] = []
    with path.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            rows.append(json.loads(line))
    random.Random(42).shuffle(rows)
    return rows


def main() -> None:
    rows = load_dataset(DATASET_PATH)
    split = int(len(rows) * 0.9)
    train_rows, eval_rows = rows[:split], rows[split:]

    tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL)
    model = AutoModelForSequenceClassification.from_pretrained(
        BASE_MODEL,
        num_labels=len(INTENT_LABELS),
        id2label=ID2LABEL,
        label2id=LABEL2ID,
    )

    train_ds = IntentDataset(train_rows, tokenizer)
    eval_ds = IntentDataset(eval_rows, tokenizer)

    args = TrainingArguments(
        output_dir=str(OUTPUT_DIR / "trainer-tmp"),
        num_train_epochs=3,
        per_device_train_batch_size=16,
        per_device_eval_batch_size=16,
        learning_rate=5e-5,
        weight_decay=0.01,
        logging_steps=5,
        eval_strategy="epoch" if eval_rows else "no",
        save_strategy="no",
        report_to=[],
        seed=42,
    )

    trainer = Trainer(
        model=model,
        args=args,
        train_dataset=train_ds,
        eval_dataset=eval_ds if eval_rows else None,
        tokenizer=tokenizer,
        data_collator=DataCollatorWithPadding(tokenizer),
    )

    trainer.train()

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    model.save_pretrained(OUTPUT_DIR)
    tokenizer.save_pretrained(OUTPUT_DIR)
    print(f"Model saved to {OUTPUT_DIR}")

    if eval_rows:
        metrics = trainer.evaluate()
        print("Eval metrics:", metrics)


if __name__ == "__main__":
    main()
