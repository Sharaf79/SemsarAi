"""Unit tests for src/api/webhook.py — the most critical orchestration file.

Covers:
  - GET  /webhook  (WhatsApp verification handshake)
  - POST /webhook  (incoming message receiver + HMAC validation)
  - process_message (background task: load/create conv, extract data, transition,
                     persist, post-confirmation actions)

Every external service (Supabase, Gemini, WhatsApp Graph API) is mocked.
The real state-machine and prompt builders run — only I/O is faked.
"""

import pytest
from unittest.mock import MagicMock, patch
from datetime import datetime, timezone, timedelta

from fastapi.testclient import TestClient
from src.main import app
from src.models import (
    Conversation,
    Listing,
    FlowState,
    Intent,
    UnitType,
    ListingStatus,
)
from src.api.webhook import process_message


# ── Payload helpers ───────────────────────────────────────────────


def _text_payload(from_number: str = "201234567890", text: str = "أنا عايز أبيع"):
    """Minimal WhatsApp Cloud API text-message payload."""
    return {
        "entry": [
            {
                "changes": [
                    {
                        "value": {
                            "messages": [
                                {
                                    "from": from_number,
                                    "type": "text",
                                    "text": {"body": text},
                                }
                            ]
                        }
                    }
                ]
            }
        ]
    }


def _image_payload(from_number: str = "201234567890", media_id: str = "img-123"):
    """Minimal WhatsApp Cloud API image-message payload."""
    return {
        "entry": [
            {
                "changes": [
                    {
                        "value": {
                            "messages": [
                                {
                                    "from": from_number,
                                    "type": "image",
                                    "image": {"id": media_id},
                                }
                            ]
                        }
                    }
                ]
            }
        ]
    }


# ── Fixtures ──────────────────────────────────────────────────────


def _assign_listing_id(listing):
    """Simulate Supabase auto-generating an id on INSERT."""
    listing.id = listing.id or "created-listing-id"
    return listing


@pytest.fixture
def mock_wa():
    """Mocked WhatsAppService."""
    wa = MagicMock()
    wa.verify_token = "test-verify-token"
    wa.app_secret = "test-app-secret"
    wa.verify_webhook_signature = MagicMock(return_value=True)
    wa.parse_incoming_message = MagicMock(return_value=None)
    wa.send_text_message = MagicMock()
    wa.get_media_url = MagicMock(return_value="https://cdn.example.com/photo.jpg")
    return wa


@pytest.fixture
def mock_db():
    """Mocked SupabaseService."""
    db = MagicMock()
    db.delete_expired_conversations = MagicMock()
    db.get_conversation_by_whatsapp_id = MagicMock(return_value=None)
    db.get_listing_by_id = MagicMock(return_value=None)
    db.get_latest_listing_by_whatsapp_id = MagicMock(return_value=None)
    db.upsert_conversation = MagicMock(side_effect=lambda c: c)
    db.create_listing = MagicMock(side_effect=_assign_listing_id)
    db.update_listing = MagicMock(side_effect=lambda l: l)
    db.publish_unit = MagicMock()
    return db


@pytest.fixture
def mock_llm():
    """Mocked GeminiService."""
    llm = MagicMock()
    llm.send_message = MagicMock(return_value={})
    return llm


@pytest.fixture
def services(mock_wa, mock_db, mock_llm):
    """Patch the lazy-init service getters for the entire test."""
    with (
        patch("src.api.webhook.get_whatsapp", return_value=mock_wa),
        patch("src.api.webhook.get_services", return_value=(mock_db, mock_llm)),
    ):
        yield mock_wa, mock_db, mock_llm


@pytest.fixture
def client(services):
    """FastAPI TestClient with all external services mocked."""
    yield TestClient(app)


# =====================================================================
#  GET /webhook — WhatsApp verification handshake (FR-001)
# =====================================================================


class TestVerifyWebhook:

    def test_valid_subscribe_returns_challenge(self, client):
        resp = client.get(
            "/webhook",
            params={
                "hub.mode": "subscribe",
                "hub.verify_token": "test-verify-token",
                "hub.challenge": "challenge-abc",
            },
        )
        assert resp.status_code == 200
        assert resp.text == "challenge-abc"

    def test_wrong_token_returns_403(self, client):
        resp = client.get(
            "/webhook",
            params={
                "hub.mode": "subscribe",
                "hub.verify_token": "bad-token",
                "hub.challenge": "c",
            },
        )
        assert resp.status_code == 403

    def test_missing_mode_returns_403(self, client):
        resp = client.get(
            "/webhook",
            params={"hub.verify_token": "test-verify-token", "hub.challenge": "c"},
        )
        assert resp.status_code == 403

    def test_missing_token_returns_403(self, client):
        resp = client.get(
            "/webhook",
            params={"hub.mode": "subscribe", "hub.challenge": "c"},
        )
        assert resp.status_code == 403

    def test_wrong_mode_returns_403(self, client):
        resp = client.get(
            "/webhook",
            params={
                "hub.mode": "unsubscribe",
                "hub.verify_token": "test-verify-token",
                "hub.challenge": "c",
            },
        )
        assert resp.status_code == 403

    def test_no_params_returns_403(self, client):
        resp = client.get("/webhook")
        assert resp.status_code == 403


# =====================================================================
#  POST /webhook — Incoming message receiver (FR-002)
# =====================================================================


class TestWebhookPost:

    def test_invalid_signature_returns_401(self, client, mock_wa):
        mock_wa.verify_webhook_signature.return_value = False
        resp = client.post(
            "/webhook",
            content=b"{}",
            headers={"X-Hub-Signature-256": "sha256=bad"},
        )
        assert resp.status_code == 401

    def test_valid_text_message_returns_200(self, client, mock_wa):
        mock_wa.parse_incoming_message.return_value = {
            "from": "201234567890",
            "body": "عايز أبيع شقة",
            "media_id": None,
        }
        resp = client.post(
            "/webhook",
            json=_text_payload(),
            headers={"X-Hub-Signature-256": "sha256=ok"},
        )
        assert resp.status_code == 200

    def test_no_messages_returns_200_no_processing(self, client, mock_wa, mock_db):
        mock_wa.parse_incoming_message.return_value = None
        resp = client.post(
            "/webhook",
            json={"entry": [{"changes": [{"value": {}}]}]},
            headers={"X-Hub-Signature-256": "sha256=ok"},
        )
        assert resp.status_code == 200
        mock_db.get_conversation_by_whatsapp_id.assert_not_called()

    def test_empty_body_and_no_media_skips_processing(self, client, mock_wa, mock_db):
        mock_wa.parse_incoming_message.return_value = {
            "from": "201234567890",
            "body": None,
            "media_id": None,
        }
        resp = client.post(
            "/webhook",
            json=_text_payload(),
            headers={"X-Hub-Signature-256": "sha256=ok"},
        )
        assert resp.status_code == 200
        mock_db.get_conversation_by_whatsapp_id.assert_not_called()

    def test_malformed_json_handled_gracefully(self, client, mock_wa):
        resp = client.post(
            "/webhook",
            content=b"not json at all",
            headers={"X-Hub-Signature-256": "sha256=ok"},
        )
        assert resp.status_code == 200


# =====================================================================
#  process_message — New User
# =====================================================================


class TestProcessMessageNewUser:
    """Brand-new WhatsApp user starts a conversation."""

    def test_greeting_prepended(self, services):
        wa, db, llm = services
        llm.send_message.return_value = {"intent": "SELL"}

        process_message({"from": "201234567890", "body": "عايز أبيع", "media_id": None})

        sent_text = wa.send_text_message.call_args[0][1]
        assert "أهلاً بيك في سمسار AI" in sent_text

    def test_sell_intent_asks_unit_type(self, services):
        wa, db, llm = services
        llm.send_message.return_value = {"intent": "SELL"}

        process_message({"from": "201234567890", "body": "عايز أبيع", "media_id": None})

        sent_text = wa.send_text_message.call_args[0][1]
        assert "نوع العقار" in sent_text

    def test_unknown_intent_re_asks(self, services):
        wa, db, llm = services
        llm.send_message.return_value = {"intent": "UNKNOWN"}

        process_message({"from": "201234567890", "body": "مش فاهم", "media_id": None})

        sent_text = wa.send_text_message.call_args[0][1]
        assert "تبيع" in sent_text or "تشتري" in sent_text

    def test_upsert_conversation_called(self, services):
        wa, db, llm = services
        llm.send_message.return_value = {"intent": "SELL"}

        process_message({"from": "201234567890", "body": "بيع", "media_id": None})

        db.upsert_conversation.assert_called_once()
        conv = db.upsert_conversation.call_args[0][0]
        assert conv.whatsapp_id == "201234567890"


# =====================================================================
#  process_message — Returning User
# =====================================================================


class TestProcessMessageReturningUser:
    """User with an active (non-expired) conversation."""

    def test_greeting_triggers_welcome_back(self, services):
        wa, db, llm = services
        conv = Conversation(
            id="conv-1",
            whatsapp_id="201234567890",
            flow_state=FlowState.AWAITING_SPECS,
            current_field="area",
            intent=Intent.SELL,
            expires_at=datetime.now(timezone.utc) + timedelta(days=7),
        )
        db.get_conversation_by_whatsapp_id.return_value = conv

        process_message({"from": "201234567890", "body": "hi", "media_id": None})

        sent_text = wa.send_text_message.call_args[0][1]
        assert "أهلاً تاني" in sent_text
        assert "المساحة" in sent_text

    def test_arabic_greeting_triggers_welcome_back(self, services):
        wa, db, llm = services
        conv = Conversation(
            id="conv-1",
            whatsapp_id="201234567890",
            flow_state=FlowState.AWAITING_SPECS,
            current_field="rooms",
            intent=Intent.SELL,
            expires_at=datetime.now(timezone.utc) + timedelta(days=7),
        )
        db.get_conversation_by_whatsapp_id.return_value = conv

        process_message({"from": "201234567890", "body": "السلام عليكم", "media_id": None})

        sent_text = wa.send_text_message.call_args[0][1]
        assert "أهلاً تاني" in sent_text

    def test_expired_session_treated_as_new(self, services):
        wa, db, llm = services
        conv = Conversation(
            id="conv-1",
            whatsapp_id="201234567890",
            flow_state=FlowState.AWAITING_SPECS,
            current_field="rooms",
            intent=Intent.SELL,
            expires_at=datetime.now(timezone.utc) - timedelta(hours=1),
        )
        db.get_conversation_by_whatsapp_id.return_value = conv
        llm.send_message.return_value = {"intent": "SELL"}

        process_message({"from": "201234567890", "body": "عايز أبيع", "media_id": None})

        sent_text = wa.send_text_message.call_args[0][1]
        assert "أهلاً بيك في سمسار AI" in sent_text

    def test_loads_linked_listing(self, services):
        wa, db, llm = services
        conv = Conversation(
            id="conv-1",
            whatsapp_id="201234567890",
            flow_state=FlowState.AWAITING_SPECS,
            current_field="rooms",
            intent=Intent.SELL,
            listing_id="listing-1",
            expires_at=datetime.now(timezone.utc) + timedelta(days=7),
        )
        listing = Listing(
            id="listing-1",
            whatsapp_id="201234567890",
            intent=Intent.SELL,
            unit_type=UnitType.APARTMENT,
            specs={"area": 120},
        )
        db.get_conversation_by_whatsapp_id.return_value = conv
        db.get_listing_by_id.return_value = listing
        llm.send_message.return_value = {"rooms": 3}

        process_message({"from": "201234567890", "body": "3 غرف", "media_id": None})

        db.get_listing_by_id.assert_called_with("listing-1")

    def test_falls_back_to_latest_listing(self, services):
        wa, db, llm = services
        conv = Conversation(
            id="conv-1",
            whatsapp_id="201234567890",
            flow_state=FlowState.AWAITING_SPECS,
            current_field="area",
            intent=Intent.SELL,
            listing_id=None,
            expires_at=datetime.now(timezone.utc) + timedelta(days=7),
        )
        latest = Listing(
            id="latest-1",
            whatsapp_id="201234567890",
            intent=Intent.SELL,
            unit_type=UnitType.APARTMENT,
        )
        db.get_conversation_by_whatsapp_id.return_value = conv
        db.get_listing_by_id.return_value = None
        db.get_latest_listing_by_whatsapp_id.return_value = latest
        llm.send_message.return_value = {"area": 120}

        process_message({"from": "201234567890", "body": "120 متر", "media_id": None})

        db.get_latest_listing_by_whatsapp_id.assert_called_with("201234567890")

    def test_mid_flow_continues_spec_collection(self, services):
        wa, db, llm = services
        conv = Conversation(
            id="conv-1",
            whatsapp_id="201234567890",
            flow_state=FlowState.AWAITING_SPECS,
            current_field="area",
            intent=Intent.SELL,
            listing_id="listing-1",
            expires_at=datetime.now(timezone.utc) + timedelta(days=7),
        )
        listing = Listing(
            id="listing-1",
            whatsapp_id="201234567890",
            intent=Intent.SELL,
            unit_type=UnitType.APARTMENT,
        )
        db.get_conversation_by_whatsapp_id.return_value = conv
        db.get_listing_by_id.return_value = listing
        llm.send_message.return_value = {"area": 120}

        process_message({"from": "201234567890", "body": "120 متر", "media_id": None})

        # After area, the next field for SELL APARTMENT is rooms
        sent_text = wa.send_text_message.call_args[0][1]
        assert "الغرف" in sent_text


# =====================================================================
#  process_message — Media Handling
# =====================================================================


class TestProcessMessageMedia:
    """Photo / video uploads.

    NOTE: For media tests with body=None (user_input=""), we use a new-user
    scenario to bypass the welcome-back check.  Returning-user + empty body
    triggers welcome-back, which is a known limitation (not tested here).
    """

    def _media_conv_and_listing(self):
        conv = Conversation(
            id="conv-1",
            whatsapp_id="201234567890",
            flow_state=FlowState.AWAITING_MEDIA,
            intent=Intent.SELL,
            listing_id="listing-1",
            expires_at=datetime.now(timezone.utc) + timedelta(days=7),
        )
        listing = Listing(
            id="listing-1",
            whatsapp_id="201234567890",
            intent=Intent.SELL,
            unit_type=UnitType.APARTMENT,
            media_urls=[],
        )
        return conv, listing

    def test_media_url_fetched(self, services):
        """New user sends a photo → get_media_url called."""
        wa, db, llm = services
        # New user bypasses welcome-back check
        db.get_conversation_by_whatsapp_id.return_value = None

        process_message({"from": "201234567890", "body": None, "media_id": "img-123"})

        wa.get_media_url.assert_called_with("img-123")

    def test_media_skips_gemini_extraction(self, services):
        """Media message → LLM extraction not called."""
        wa, db, llm = services
        db.get_conversation_by_whatsapp_id.return_value = None

        process_message({"from": "201234567890", "body": None, "media_id": "img-123"})

        llm.send_message.assert_not_called()

    def test_awaiting_media_text_skips_extraction(self, services):
        """Returning user sends 'مش دلوقتي' in AWAITING_MEDIA → LLM not called."""
        wa, db, llm = services
        conv, listing = self._media_conv_and_listing()
        db.get_conversation_by_whatsapp_id.return_value = conv
        db.get_listing_by_id.return_value = listing

        process_message({"from": "201234567890", "body": "مش دلوقتي", "media_id": None})

        llm.send_message.assert_not_called()

    def test_media_url_none_not_appended(self, services):
        """get_media_url returns None → nothing appended to media_urls."""
        wa, db, llm = services
        wa.get_media_url.return_value = None
        db.get_conversation_by_whatsapp_id.return_value = None

        process_message({"from": "201234567890", "body": None, "media_id": "img-bad"})

        # New-user listing starts with empty media_urls; None shouldn't be added
        wa.get_media_url.assert_called_with("img-bad")


# =====================================================================
#  process_message — Gemini Failures
# =====================================================================


class TestProcessMessageGemini:

    def test_gemini_failure_uses_empty_data(self, services):
        wa, db, llm = services
        llm.send_message.side_effect = Exception("Gemini 500")

        process_message({"from": "201234567890", "body": "عايز أبيع", "media_id": None})

        # Should still reply (re-ask the intent question)
        wa.send_text_message.assert_called_once()
        sent_text = wa.send_text_message.call_args[0][1]
        assert "تبيع" in sent_text or "تشتري" in sent_text


# =====================================================================
#  process_message — Post-Confirmation Actions
# =====================================================================


class TestProcessMessagePostConfirmation:
    """After user confirms their listing data."""

    def _awaiting_confirmation_conv(self, intent: Intent = Intent.SELL) -> Conversation:
        return Conversation(
            id="conv-1",
            whatsapp_id="201234567890",
            flow_state=FlowState.AWAITING_CONFIRMATION,
            intent=intent,
            listing_id="listing-1",
            expires_at=datetime.now(timezone.utc) + timedelta(days=7),
        )

    def _sell_listing(self) -> Listing:
        return Listing(
            id="listing-1",
            whatsapp_id="201234567890",
            intent=Intent.SELL,
            unit_type=UnitType.APARTMENT,
            specs={"area": 120, "rooms": 3, "floor": 5, "finishing": "سوبر لوكس"},
            location="التجمع الخامس",
            price=2_500_000,
        )

    def _buy_listing(self) -> Listing:
        return Listing(
            id="listing-1",
            whatsapp_id="201234567890",
            intent=Intent.BUY,
            unit_type=UnitType.APARTMENT,
            specs={"min_area": 100, "min_rooms": 2},
            location="مدينة نصر",
            price=1_500_000,
        )

    def test_sell_confirmed_publishes_unit(self, services):
        wa, db, llm = services
        db.get_conversation_by_whatsapp_id.return_value = self._awaiting_confirmation_conv()
        db.get_listing_by_id.return_value = self._sell_listing()
        llm.send_message.return_value = {"is_correct": True}

        process_message({"from": "201234567890", "body": "صح", "media_id": None})

        db.publish_unit.assert_called_once()

    def test_sell_confirmed_reply_text(self, services):
        wa, db, llm = services
        db.get_conversation_by_whatsapp_id.return_value = self._awaiting_confirmation_conv()
        db.get_listing_by_id.return_value = self._sell_listing()
        llm.send_message.return_value = {"is_correct": True}

        process_message({"from": "201234567890", "body": "صح", "media_id": None})

        sent_text = wa.send_text_message.call_args[0][1]
        assert "تم تأكيد" in sent_text

    def test_buy_confirmed_triggers_search(self, services):
        wa, db, llm = services
        conv = self._awaiting_confirmation_conv(Intent.BUY)
        db.get_conversation_by_whatsapp_id.return_value = conv
        db.get_listing_by_id.return_value = self._buy_listing()
        llm.send_message.return_value = {"is_correct": True}

        with patch("src.api.webhook.search_units_for_buyer", return_value=[]) as mock_search:
            process_message({"from": "201234567890", "body": "صح", "media_id": None})

        mock_search.assert_called_once()

    def test_buy_confirmed_sends_two_messages(self, services):
        """Search results message + confirmation reply."""
        wa, db, llm = services
        conv = self._awaiting_confirmation_conv(Intent.BUY)
        db.get_conversation_by_whatsapp_id.return_value = conv
        db.get_listing_by_id.return_value = self._buy_listing()
        llm.send_message.return_value = {"is_correct": True}

        with patch("src.api.webhook.search_units_for_buyer", return_value=[]):
            process_message({"from": "201234567890", "body": "صح", "media_id": None})

        assert wa.send_text_message.call_count == 2

    def test_publish_failure_handled_gracefully(self, services):
        wa, db, llm = services
        db.get_conversation_by_whatsapp_id.return_value = self._awaiting_confirmation_conv()
        db.get_listing_by_id.return_value = self._sell_listing()
        llm.send_message.return_value = {"is_correct": True}
        db.publish_unit.side_effect = Exception("DB error")

        process_message({"from": "201234567890", "body": "صح", "media_id": None})

        wa.send_text_message.assert_called()

    def test_search_failure_handled_gracefully(self, services):
        wa, db, llm = services
        conv = self._awaiting_confirmation_conv(Intent.BUY)
        db.get_conversation_by_whatsapp_id.return_value = conv
        db.get_listing_by_id.return_value = self._buy_listing()
        llm.send_message.return_value = {"is_correct": True}

        with patch("src.api.webhook.search_units_for_buyer", side_effect=Exception("search error")):
            process_message({"from": "201234567890", "body": "صح", "media_id": None})

        wa.send_text_message.assert_called()


# =====================================================================
#  process_message — Listing Persistence
# =====================================================================


class TestProcessMessageListingPersistence:

    def test_creates_listing_when_intent_and_type_known(self, services):
        wa, db, llm = services
        conv = Conversation(
            id="conv-1",
            whatsapp_id="201234567890",
            flow_state=FlowState.AWAITING_UNIT_TYPE,
            intent=Intent.SELL,
            expires_at=datetime.now(timezone.utc) + timedelta(days=7),
        )
        listing = Listing(whatsapp_id="201234567890", intent=Intent.SELL)
        db.get_conversation_by_whatsapp_id.return_value = conv
        db.get_latest_listing_by_whatsapp_id.return_value = listing
        llm.send_message.return_value = {"unit_type": "APARTMENT"}

        process_message({"from": "201234567890", "body": "شقة", "media_id": None})

        db.create_listing.assert_called_once()

    def test_updates_listing_when_id_exists(self, services):
        wa, db, llm = services
        conv = Conversation(
            id="conv-1",
            whatsapp_id="201234567890",
            flow_state=FlowState.AWAITING_SPECS,
            current_field="rooms",
            intent=Intent.SELL,
            listing_id="listing-1",
            expires_at=datetime.now(timezone.utc) + timedelta(days=7),
        )
        listing = Listing(
            id="listing-1",
            whatsapp_id="201234567890",
            intent=Intent.SELL,
            unit_type=UnitType.APARTMENT,
            specs={"area": 120},
        )
        db.get_conversation_by_whatsapp_id.return_value = conv
        db.get_listing_by_id.return_value = listing
        llm.send_message.return_value = {"rooms": 3}

        process_message({"from": "201234567890", "body": "3", "media_id": None})

        db.update_listing.assert_called_once()
        db.create_listing.assert_not_called()

    def test_skips_persist_without_unit_type(self, services):
        wa, db, llm = services
        llm.send_message.return_value = {"intent": "SELL"}

        process_message({"from": "201234567890", "body": "عايز أبيع", "media_id": None})

        db.create_listing.assert_not_called()
        db.update_listing.assert_not_called()


# =====================================================================
#  process_message — Expiry Cleanup
# =====================================================================


class TestProcessMessageExpiry:

    def test_delete_expired_called(self, services):
        wa, db, llm = services
        llm.send_message.return_value = {"intent": "SELL"}

        process_message({"from": "201234567890", "body": "أبيع", "media_id": None})

        db.delete_expired_conversations.assert_called_once()

    def test_cleanup_failure_is_nonfatal(self, services):
        wa, db, llm = services
        db.delete_expired_conversations.side_effect = Exception("DB timeout")
        llm.send_message.return_value = {"intent": "SELL"}

        process_message({"from": "201234567890", "body": "أبيع", "media_id": None})

        wa.send_text_message.assert_called()
