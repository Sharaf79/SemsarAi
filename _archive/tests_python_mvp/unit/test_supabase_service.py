"""Tests for src/services/supabase_service.py — CRUD with mocked Supabase client."""

import pytest
from unittest.mock import patch, MagicMock
from datetime import datetime, timezone, timedelta
from src.models import Conversation, Listing, FlowState, Intent, UnitType, ListingStatus


def _make_service(mock_client):
    """Create SupabaseService with injected mock client."""
    with patch("src.services.supabase_service.get_settings") as mock_settings:
        mock_settings.return_value.SUPABASE_URL = "https://test.supabase.co"
        mock_settings.return_value.SUPABASE_KEY = "test-key"
        with patch("src.services.supabase_service.create_client", return_value=mock_client):
            from src.services.supabase_service import SupabaseService
            return SupabaseService()


def _chain_mock(data=None):
    """Creates a chainable mock that returns data on .execute()."""
    chain = MagicMock()
    result = MagicMock()
    result.data = data if data is not None else []
    
    # All chainable methods return the chain itself
    for method in ["select", "insert", "update", "upsert", "delete",
                    "eq", "neq", "lt", "lte", "ilike", "order", "limit"]:
        getattr(chain, method).return_value = chain
    chain.execute.return_value = result
    return chain


# ── get_conversation_by_whatsapp_id ──────────────────────────────


class TestGetConversationByWhatsappId:
    def test_found_returns_conversation(self):
        mock_client = MagicMock()
        chain = _chain_mock([{
            "id": "conv-1",
            "whatsapp_id": "201234567890",
            "flow_state": "AWAITING_INTENT",
            "current_field": None,
            "intent": None,
            "listing_id": None,
            "created_at": "2026-03-28T00:00:00+00:00",
            "updated_at": "2026-03-28T00:00:00+00:00",
            "expires_at": "2026-04-04T00:00:00+00:00",
        }])
        mock_client.table.return_value = chain

        svc = _make_service(mock_client)
        conv = svc.get_conversation_by_whatsapp_id("201234567890")
        assert conv is not None
        assert conv.whatsapp_id == "201234567890"
        assert conv.flow_state == FlowState.AWAITING_INTENT

    def test_not_found_returns_none(self):
        mock_client = MagicMock()
        chain = _chain_mock([])
        mock_client.table.return_value = chain

        svc = _make_service(mock_client)
        conv = svc.get_conversation_by_whatsapp_id("nonexistent")
        assert conv is None


# ── get_listing_by_id ────────────────────────────────────────────


class TestGetListingById:
    def test_found_returns_listing(self):
        mock_client = MagicMock()
        chain = _chain_mock([{
            "id": "listing-1",
            "whatsapp_id": "201234567890",
            "intent": "SELL",
            "unit_type": "APARTMENT",
            "specs": {"area": 120},
            "location": "التجمع",
            "price": 2000000,
            "media_urls": [],
            "status": "DRAFT",
            "created_at": "2026-03-28T00:00:00+00:00",
            "updated_at": "2026-03-28T00:00:00+00:00",
        }])
        mock_client.table.return_value = chain

        svc = _make_service(mock_client)
        listing = svc.get_listing_by_id("listing-1")
        assert listing is not None
        assert listing.intent == Intent.SELL

    def test_not_found_returns_none(self):
        mock_client = MagicMock()
        chain = _chain_mock([])
        mock_client.table.return_value = chain

        svc = _make_service(mock_client)
        assert svc.get_listing_by_id("nonexistent") is None


# ── get_latest_listing_by_whatsapp_id ────────────────────────────


class TestGetLatestListingByWhatsappId:
    def test_returns_most_recent(self):
        mock_client = MagicMock()
        chain = _chain_mock([{
            "id": "listing-latest",
            "whatsapp_id": "201234567890",
            "intent": "SELL",
            "unit_type": "APARTMENT",
            "specs": {},
            "location": None,
            "price": None,
            "media_urls": [],
            "status": "DRAFT",
            "created_at": "2026-03-29T00:00:00+00:00",
            "updated_at": "2026-03-29T00:00:00+00:00",
        }])
        mock_client.table.return_value = chain

        svc = _make_service(mock_client)
        listing = svc.get_latest_listing_by_whatsapp_id("201234567890")
        assert listing is not None
        assert listing.id == "listing-latest"

    def test_no_listings_returns_none(self):
        mock_client = MagicMock()
        chain = _chain_mock([])
        mock_client.table.return_value = chain

        svc = _make_service(mock_client)
        assert svc.get_latest_listing_by_whatsapp_id("201234567890") is None


# ── upsert_conversation ──────────────────────────────────────────


class TestUpsertConversation:
    def test_upserts_and_returns_conversation(self):
        mock_client = MagicMock()
        chain = _chain_mock([{
            "id": "conv-new",
            "whatsapp_id": "201234567890",
            "flow_state": "AWAITING_INTENT",
            "current_field": None,
            "intent": None,
            "listing_id": None,
            "created_at": "2026-03-29T00:00:00+00:00",
            "updated_at": "2026-03-29T00:00:00+00:00",
            "expires_at": "2026-04-05T00:00:00+00:00",
        }])
        mock_client.table.return_value = chain

        svc = _make_service(mock_client)
        conv = Conversation(whatsapp_id="201234567890")
        result = svc.upsert_conversation(conv)
        assert result.whatsapp_id == "201234567890"

    def test_sets_updated_at_and_expires_at(self):
        mock_client = MagicMock()
        chain = _chain_mock([{
            "id": "conv-1",
            "whatsapp_id": "201234567890",
            "flow_state": "AWAITING_INTENT",
            "current_field": None,
            "intent": None,
            "listing_id": None,
            "created_at": "2026-03-29T00:00:00+00:00",
            "updated_at": "2026-03-29T12:00:00+00:00",
            "expires_at": "2026-04-05T12:00:00+00:00",
        }])
        mock_client.table.return_value = chain

        svc = _make_service(mock_client)
        conv = Conversation(whatsapp_id="201234567890")
        svc.upsert_conversation(conv)

        # Verify upsert was called with updated_at and expires_at
        upsert_call = chain.upsert.call_args
        data = upsert_call[0][0]
        assert "updated_at" in data
        assert "expires_at" in data


# ── create_listing ───────────────────────────────────────────────


class TestCreateListing:
    def test_inserts_and_returns_with_id(self):
        mock_client = MagicMock()
        chain = _chain_mock([{
            "id": "listing-new-uuid",
            "whatsapp_id": "201234567890",
            "intent": "SELL",
            "unit_type": "APARTMENT",
            "specs": {},
            "location": None,
            "price": None,
            "media_urls": [],
            "status": "DRAFT",
            "created_at": "2026-03-29T00:00:00+00:00",
            "updated_at": "2026-03-29T00:00:00+00:00",
        }])
        mock_client.table.return_value = chain

        svc = _make_service(mock_client)
        listing = Listing(whatsapp_id="201234567890", intent=Intent.SELL, unit_type=UnitType.APARTMENT)
        result = svc.create_listing(listing)
        assert result.id == "listing-new-uuid"


# ── update_listing ───────────────────────────────────────────────


class TestUpdateListing:
    def test_updates_existing_listing(self):
        mock_client = MagicMock()
        chain = _chain_mock([{
            "id": "listing-1",
            "whatsapp_id": "201234567890",
            "intent": "SELL",
            "unit_type": "APARTMENT",
            "specs": {"area": 150},
            "location": "المعادي",
            "price": 3000000,
            "media_urls": [],
            "status": "DRAFT",
            "created_at": "2026-03-28T00:00:00+00:00",
            "updated_at": "2026-03-29T00:00:00+00:00",
        }])
        mock_client.table.return_value = chain

        svc = _make_service(mock_client)
        listing = Listing(
            id="listing-1",
            whatsapp_id="201234567890",
            intent=Intent.SELL,
            unit_type=UnitType.APARTMENT,
            specs={"area": 150},
        )
        result = svc.update_listing(listing)
        assert result.specs["area"] == 150

    def test_no_id_raises_value_error(self):
        mock_client = MagicMock()
        svc = _make_service(mock_client)
        listing = Listing(whatsapp_id="201234567890")
        with pytest.raises(ValueError, match="must have an ID"):
            svc.update_listing(listing)


# ── publish_unit ─────────────────────────────────────────────────


class TestPublishUnit:
    def test_inserts_correct_data(self):
        mock_client = MagicMock()
        chain = _chain_mock([{}])
        mock_client.table.return_value = chain

        svc = _make_service(mock_client)
        listing = Listing(
            id="listing-1",
            whatsapp_id="201234567890",
            intent=Intent.SELL,
            unit_type=UnitType.APARTMENT,
            specs={"area": 120, "rooms": 3},
            location="التجمع",
            price=2_500_000,
            media_urls=["https://example.com/photo.jpg"],
        )
        svc.publish_unit(listing)

        # Verify insert called on units table
        mock_client.table.assert_called_with("units")
        insert_data = chain.insert.call_args[0][0]
        assert insert_data["listing_id"] == "listing-1"
        assert insert_data["intent"] == "SELL"
        assert insert_data["unit_type"] == "APARTMENT"
        assert insert_data["is_active"] is True
        assert insert_data["price"] == 2_500_000


# ── delete_expired_conversations ─────────────────────────────────


class TestDeleteExpiredConversations:
    def test_calls_delete_with_correct_filters(self):
        mock_client = MagicMock()
        chain = _chain_mock([])
        mock_client.table.return_value = chain

        svc = _make_service(mock_client)
        svc.delete_expired_conversations()

        mock_client.table.assert_called_with("conversations")
        chain.delete.assert_called_once()
