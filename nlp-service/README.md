# SemsarAI NLP Service

Stateless FastAPI sidecar that turns Arabic/English real-estate queries into
`{intent, slots, confidence}`. See `specs/005-semsarai-chat/spec.md` for the
full contract.

## Run locally

```bash
cd nlp-service
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # defaults are fine for dev
uvicorn app.main:app --host 0.0.0.0 --port 8001
```

With `USE_STUB_CLASSIFIER=true` (the default), the service uses regex +
keyword heuristics and starts instantly. Flip it to `false` after running
`python training/train.py` to load the fine-tuned DistilBERT model.

## Endpoints

- `GET  /health`       → `{status, modelLoaded, classifier}`
- `POST /nlp/analyze`  → `{intent, confidence, slots}`
