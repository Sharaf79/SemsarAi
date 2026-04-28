# NLP training

Fine-tunes `distilbert-base-multilingual-cased` on the intent dataset in
`dataset.jsonl` and writes the result to `../model/`.

```bash
cd nlp-service
pip install -r requirements.txt
python training/train.py
```

Then restart the service with `USE_STUB_CLASSIFIER=false` and it will load the
fine-tuned model from `./model` automatically.

The dataset is engineering's bootstrap set (~70 examples) — product will expand
it to ~300 before Phase B per spec §15 decision 4.
