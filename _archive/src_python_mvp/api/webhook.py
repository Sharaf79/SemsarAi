from fastapi import APIRouter, Request, Response, BackgroundTasks
from typing import Dict, Any
from datetime import datetime, timezone
import logging

from src.models import Conversation, Listing, FlowState, Intent, UnitType, ListingStatus
from src.services.whatsapp_service import WhatsAppService
from src.services.supabase_service import SupabaseService
from src.services.gemini_service import GeminiService
from src.services.state_machine import transition, generate_welcome_back, generate_question
from src.services.search_service import search_units_for_buyer, format_search_results
from src.prompts.system_prompt import build_system_prompt
from src.prompts.extraction_prompt import build_extraction_prompt

router = APIRouter()
logger = logging.getLogger(__name__)

# Lazy-init to avoid import-time config errors
_whatsapp_service = None
_supabase_service = None
_gemini_service = None

def get_whatsapp():
    global _whatsapp_service
    if not _whatsapp_service:
        _whatsapp_service = WhatsAppService()
    return _whatsapp_service

def get_services():
    global _supabase_service, _gemini_service
    if not _supabase_service:
        _supabase_service = SupabaseService()
    if not _gemini_service:
        _gemini_service = GeminiService()
    return _supabase_service, _gemini_service

@router.get("/webhook")
async def verify_webhook(request: Request):
    wa = get_whatsapp()
    mode = request.query_params.get("hub.mode")
    token = request.query_params.get("hub.verify_token")
    challenge = request.query_params.get("hub.challenge")

    if mode and token:
        if mode == "subscribe" and token == wa.verify_token:
            return Response(content=challenge, media_type="text/plain", status_code=200)
    return Response(status_code=403)

@router.post("/webhook")
async def webhook(request: Request, background_tasks: BackgroundTasks):
    wa = get_whatsapp()
    body = await request.body()
    signature = request.headers.get("X-Hub-Signature-256")

    if not wa.verify_webhook_signature(body, signature):
        return Response(status_code=401)

    try:
        payload = await request.json()
        parsed = wa.parse_incoming_message(payload)

        if parsed and (parsed["body"] or parsed["media_id"]):
            background_tasks.add_task(process_message, parsed)

    except Exception as e:
        logger.error(f"Error processing webhook: {e}")

    return Response(status_code=200)


def process_message(parsed_msg: Dict[str, Any]):
    """Synchronous background task — runs off the request thread."""
    db, llm = get_services()
    wa = get_whatsapp()
    from_number = parsed_msg["from"]
    user_input = parsed_msg.get("body") or ""
    media_id = parsed_msg.get("media_id")

    # ── Expiry cleanup ────────────────────────────────────────────
    try:
        db.delete_expired_conversations()
    except Exception as e:
        logger.warning(f"Expiry cleanup failed (non-fatal): {e}")

    # ── Load or create conversation ───────────────────────────────
    conv = db.get_conversation_by_whatsapp_id(from_number)
    is_new_user = conv is None
    listing = None

    if conv:
        # Check in-app expiry
        if conv.expires_at and conv.expires_at < datetime.now(timezone.utc):
            conv = None  # treat as new
            is_new_user = True
        else:
            # Load linked listing
            if conv.listing_id:
                listing = db.get_listing_by_id(conv.listing_id)
            if not listing:
                listing = db.get_latest_listing_by_whatsapp_id(from_number)

    if conv is None:
        conv = Conversation(whatsapp_id=from_number)

    if listing is None:
        listing = Listing(whatsapp_id=from_number)

    # ── Welcome-back for returning mid-flow users ─────────────────
    if not is_new_user and conv.flow_state not in (FlowState.AWAITING_INTENT, FlowState.CONFIRMED):
        if user_input.strip().lower() in ("", "hi", "hello", "السلام عليكم", "اهلا", "مرحبا"):
            field = conv.current_field or conv.flow_state.value.lower()
            question = generate_question(field) if conv.current_field else generate_question("intent")
            wa.send_text_message(from_number, generate_welcome_back(question))
            db.upsert_conversation(conv)  # refresh expires_at
            return

    # ── Determine which field Gemini should extract ───────────────
    field_to_extract = conv.current_field or "intent"
    if conv.flow_state == FlowState.AWAITING_INTENT:
        field_to_extract = "intent"
    elif conv.flow_state == FlowState.AWAITING_UNIT_TYPE:
        field_to_extract = "unit_type"
    elif conv.flow_state == FlowState.AWAITING_MEDIA:
        field_to_extract = "media"
    elif conv.flow_state == FlowState.AWAITING_CONFIRMATION:
        field_to_extract = "is_correct"

    # ── Extract structured data ───────────────────────────────────
    extracted_data: Dict[str, Any] = {}

    if media_id:
        extracted_data["has_media"] = True
        media_url = wa.get_media_url(media_id)
        if media_url:
            listing.media_urls.append(media_url)
    elif user_input and conv.flow_state != FlowState.AWAITING_MEDIA:
        try:
            schema, prompt = build_extraction_prompt(conv.flow_state, field_to_extract, user_input)
            sys_prompt = build_system_prompt()
            extracted_data = llm.send_message(prompt, sys_prompt, expected_schema=schema)
        except Exception as e:
            logger.error(f"Gemini extraction failed: {e}")
            extracted_data = {}

    # ── Greeting for brand-new users ──────────────────────────────
    greeting = ""
    if is_new_user:
        greeting = "أهلاً بيك في سمسار AI! أنا هنا أساعدك في كل حاجة عقارات.\n"

    # ── State Machine transition ──────────────────────────────────
    conv, listing, reply_text = transition(conv, listing, user_input, extracted_data)

    # ── Persist listing (only create once intent & unit_type are known) ──
    if listing.intent and listing.unit_type:
        if not listing.id:
            listing = db.create_listing(listing)
        else:
            listing = db.update_listing(listing)
        conv.listing_id = listing.id

    # ── Persist conversation ──────────────────────────────────────
    db.upsert_conversation(conv)

    # ── Post-confirmation actions ─────────────────────────────────
    if conv.flow_state == FlowState.CONFIRMED and listing.id:
        if listing.intent in (Intent.SELL, Intent.RENT, Intent.LEASE):
            # FR-018: Publish SELL/RENT to units table
            try:
                db.publish_unit(listing)
            except Exception as e:
                logger.error(f"Failed to publish unit: {e}")
        elif listing.intent == Intent.BUY:
            # FR-019: Search for matching units and send results
            try:
                matches = search_units_for_buyer(listing, db)
                search_reply = format_search_results(matches)
                wa.send_text_message(from_number, search_reply)
            except Exception as e:
                logger.error(f"Search failed: {e}")

    # ── Send reply ────────────────────────────────────────────────
    wa.send_text_message(from_number, greeting + reply_text)
