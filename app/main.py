"""
Semsar AI — FastAPI application entry-point.

Run locally:
    uvicorn app.main:app --reload --port 8000
"""
from contextlib import asynccontextmanager
import logging
import re
from pathlib import Path

import httpx
from fastapi import FastAPI, Query, Request, Response
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from app.core.config import get_settings
from app.models import ChatRequest, ChatResponse
from app.services import gemini as gemini_service
from app.services.supabase_search import search_units, format_search_results

# ── NestJS backend URL ────────────────────────────────────────────
NESTJS_URL = "http://localhost:3000"

# ── In-memory conversation sessions (user_id → list of turns) ────────
# Each turn: {"role": "user"|"model", "text": str}
_sessions: dict[str, list[dict]] = {}
MAX_HISTORY = 40  # keep last 40 turns (20 exchanges) per session


def _extract_options(text: str) -> list[str]:
    """
    Pull numbered / bulleted list items out of the bot reply to render
    as clickable quick-reply buttons in the UI.
    Matches:
      1. بيع عقار   ;   ٢. شراء   ;   - شقة   ;   • أرض
    """
    pattern = re.compile(
        r'^(?:[\d\u0660-\u0669]+[.)\-]|[-\u2022*])\ +(.+)',
        re.MULTILINE,
    )
    return [m.group(1).strip() for m in pattern.finditer(text)]


# ── Logging ───────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
)
logger = logging.getLogger(__name__)


# ── Lifespan (startup / shutdown hooks) ───────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("🚀 Semsar AI starting up…")
    get_settings()
    yield
    logger.info("🛑 Semsar AI shutting down.")


# ── FastAPI app ───────────────────────────────────────────────────
app = FastAPI(
    title="Semsar AI",
    description=(
        "سمسار AI — Egyptian real-estate broker on WhatsApp. "
        "Conversational intake for buy / sell / rent."
    ),
    version="0.1.0",
    lifespan=lifespan,
)


# ── Static files ──────────────────────────────────────────────────
_static_dir = Path(__file__).parent / "static"
app.mount("/static", StaticFiles(directory=str(_static_dir)), name="static")


# ── Health check ──────────────────────────────────────────────────
@app.get("/")
def health():
    return {"status": "healthy", "service": "Semsar AI"}


# ── Chat UI ───────────────────────────────────────────────────────
@app.get("/ui", response_class=HTMLResponse)
def chat_ui():
    """Serve the browser-based chat interface."""
    html_file = _static_dir / "chat.html"
    return HTMLResponse(content=html_file.read_text(encoding="utf-8"))


# ── WhatsApp Webhook verification (GET) ──────────────────────────
@app.get("/webhook")
def verify_webhook(
    mode: str | None = Query(None, alias="hub.mode"),
    token: str | None = Query(None, alias="hub.verify_token"),
    challenge: str | None = Query(None, alias="hub.challenge"),
):
    """
    Meta sends a GET request with hub.mode, hub.verify_token, and
    hub.challenge.  We MUST return the challenge value as **raw plain
    text** (not JSON-wrapped) — otherwise Meta rejects the callback.
    """
    settings = get_settings()

    if mode == "subscribe" and token == settings.WHATSAPP_VERIFY_TOKEN:
        logger.info("✅ Webhook verified successfully")
        return Response(content=challenge, media_type="text/plain")

    logger.warning("❌ Webhook verification failed (mode=%s)", mode)
    return Response(content="Forbidden", status_code=403)


# ── WhatsApp Webhook incoming messages (POST) ────────────────────
@app.post("/webhook")
async def webhook(request: Request):
    """
    Receives incoming WhatsApp messages from Meta.
    Returns 200 immediately so Meta doesn't retry.
    Actual processing will be added in a future iteration.
    """
    body = await request.json()
    logger.info("📩 Webhook POST received: %s", str(body)[:200])

    # TODO: parse message, run state-machine, reply via WhatsApp API
    return Response(content="EVENT_RECEIVED", status_code=200)


# ── Onboarding proxy → NestJS ─────────────────────────────────────
@app.post("/api/ensure-user")
async def ensure_user(request: Request):
    """Proxy POST /api/ensure-user → NestJS backend (DEV-ONLY)."""
    body = await request.json()
    async with httpx.AsyncClient() as client:
        resp = await client.post(f"{NESTJS_URL}/api/ensure-user", json=body)
        return JSONResponse(content=resp.json(), status_code=resp.status_code)


@app.post("/onboarding/start")
async def onboarding_start(request: Request):
    """Proxy POST /onboarding/start → NestJS backend."""
    body = await request.json()
    async with httpx.AsyncClient() as client:
        resp = await client.post(f"{NESTJS_URL}/onboarding/start", json=body)
        return JSONResponse(content=resp.json(), status_code=resp.status_code)


@app.get("/onboarding/question")
async def onboarding_question(userId: str = Query(...)):
    """Proxy GET /onboarding/question → NestJS backend."""
    async with httpx.AsyncClient() as client:
        resp = await client.get(f"{NESTJS_URL}/onboarding/question", params={"userId": userId})
        return JSONResponse(content=resp.json(), status_code=resp.status_code)


@app.post("/onboarding/answer")
async def onboarding_answer(request: Request):
    """Proxy POST /onboarding/answer → NestJS backend."""
    body = await request.json()
    async with httpx.AsyncClient() as client:
        resp = await client.post(f"{NESTJS_URL}/onboarding/answer", json=body)
        return JSONResponse(content=resp.json(), status_code=resp.status_code)


@app.get("/onboarding/review")
async def onboarding_review(userId: str = Query(...)):
    """Proxy GET /onboarding/review → NestJS backend."""
    async with httpx.AsyncClient() as client:
        resp = await client.get(f"{NESTJS_URL}/onboarding/review", params={"userId": userId})
        return JSONResponse(content=resp.json(), status_code=resp.status_code)


@app.post("/onboarding/edit")
async def onboarding_edit(request: Request):
    """Proxy POST /onboarding/edit → NestJS backend."""
    body = await request.json()
    async with httpx.AsyncClient() as client:
        resp = await client.post(f"{NESTJS_URL}/onboarding/edit", json=body)
        return JSONResponse(content=resp.json(), status_code=resp.status_code)


@app.post("/onboarding/submit")
async def onboarding_submit(request: Request):
    """Proxy POST /onboarding/submit → NestJS backend."""
    body = await request.json()
    async with httpx.AsyncClient() as client:
        resp = await client.post(f"{NESTJS_URL}/onboarding/submit", json=body)
        return JSONResponse(content=resp.json(), status_code=resp.status_code)


@app.post("/onboarding/upload-media")
async def onboarding_upload_media(request: Request):
    """Proxy POST /onboarding/upload-media → NestJS backend."""
    body = await request.json()
    async with httpx.AsyncClient() as client:
        resp = await client.post(f"{NESTJS_URL}/onboarding/upload-media", json=body)
        return JSONResponse(content=resp.json(), status_code=resp.status_code)


# ── Location proxy → NestJS ───────────────────────────────────────
@app.get("/locations/governorates")
async def locations_governorates():
    """Proxy GET /locations/governorates → NestJS backend."""
    async with httpx.AsyncClient() as client:
        resp = await client.get(f"{NESTJS_URL}/locations/governorates")
        return JSONResponse(content=resp.json(), status_code=resp.status_code)


@app.get("/locations/cities")
async def locations_cities(governorateId: int = Query(...)):
    """Proxy GET /locations/cities → NestJS backend."""
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{NESTJS_URL}/locations/cities",
            params={"governorateId": governorateId},
        )
        return JSONResponse(content=resp.json(), status_code=resp.status_code)


@app.get("/locations/districts")
async def locations_districts(cityId: int = Query(...)):
    """Proxy GET /locations/districts → NestJS backend."""
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{NESTJS_URL}/locations/districts",
            params={"cityId": cityId},
        )
        return JSONResponse(content=resp.json(), status_code=resp.status_code)


# ── Conversation engine proxy → NestJS ───────────────────────────
@app.post("/conversation/message")
async def conversation_message(request: Request):
    """Proxy POST /conversation/message → NestJS ConversationEngine."""
    body = await request.json()
    async with httpx.AsyncClient() as client:
        resp = await client.post(f"{NESTJS_URL}/conversation/message", json=body)
        return JSONResponse(content=resp.json(), status_code=resp.status_code)


# ── /chat endpoint ────────────────────────────────────────────────
@app.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest):
    """
    Accept a user message, maintain conversation history per user_id,
    and return Semsar AI reply + detected quick-reply options.
    """
    logger.info("💬  [%s] %s", req.user_id, req.message[:80])

    # Get or create session history
    history = _sessions.setdefault(req.user_id, [])

    try:
        reply = gemini_service.chat_with_history(history, req.message)
    except Exception as exc:
        logger.error("Gemini error: %s", exc)
        reply = "حدثت مشكلة تقنية، يرجى المحاولة مجدداً 🙏"

    # Append both turns to history and trim
    history.append({"role": "user", "text": req.message})
    history.append({"role": "model", "text": reply})
    if len(history) > MAX_HISTORY:
        _sessions[req.user_id] = history[-MAX_HISTORY:]

    logger.info("🤖  [%s] %s", req.user_id, reply[:80])

    options = _extract_options(reply)
    return ChatResponse(reply=reply, user_id=req.user_id, options=options)


# ── Reset session ─────────────────────────────────────────────────
@app.delete("/chat/{user_id}")
def reset_session(user_id: str):
    """Clear conversation history for a user (start over)."""
    _sessions.pop(user_id, None)
    return {"cleared": user_id}


# ── /search placeholder endpoint ─────────────────────────────────
@app.get("/search")
def search(
    unit_type: str = "APARTMENT",
    location: str | None = None,
    budget: float | None = None,
):
    """
    Placeholder buyer-search endpoint (FR-019).

    Queries the `units` table for matching active listings.
    Currently returns an empty list until the DB is seeded.
    """
    results = search_units(
        unit_type=unit_type,
        location=location,
        budget=budget,
    )
    return {
        "results": results,
        "formatted": format_search_results(results),
    }
