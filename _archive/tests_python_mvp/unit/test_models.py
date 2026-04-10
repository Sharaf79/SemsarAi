"""Tests for src/models/ — Conversation, Listing, Unit, and all enums."""

import pytest
from datetime import datetime, timezone
from src.models import (
    Conversation, Listing, Unit,
    FlowState, Intent, UnitType, ListingStatus,
)


# ── FlowState Enum ───────────────────────────────────────────────


class TestFlowState:
    def test_has_six_states(self):
        assert len(FlowState) == 6

    def test_awaiting_intent_value(self):
        assert FlowState.AWAITING_INTENT.value == "AWAITING_INTENT"

    def test_awaiting_unit_type_value(self):
        assert FlowState.AWAITING_UNIT_TYPE.value == "AWAITING_UNIT_TYPE"

    def test_awaiting_specs_value(self):
        assert FlowState.AWAITING_SPECS.value == "AWAITING_SPECS"

    def test_awaiting_media_value(self):
        assert FlowState.AWAITING_MEDIA.value == "AWAITING_MEDIA"

    def test_awaiting_confirmation_value(self):
        assert FlowState.AWAITING_CONFIRMATION.value == "AWAITING_CONFIRMATION"

    def test_confirmed_value(self):
        assert FlowState.CONFIRMED.value == "CONFIRMED"

    def test_is_str_enum(self):
        assert isinstance(FlowState.AWAITING_INTENT, str)


# ── Intent Enum ──────────────────────────────────────────────────


class TestIntent:
    def test_buy(self):
        assert Intent.BUY.value == "BUY"

    def test_sell(self):
        assert Intent.SELL.value == "SELL"

    def test_rent(self):
        assert Intent.RENT.value == "RENT"

    def test_lease(self):
        assert Intent.LEASE.value == "LEASE"

    def test_has_four_values(self):
        assert len(Intent) == 4

    def test_is_str_enum(self):
        assert isinstance(Intent.BUY, str)


# ── UnitType Enum ────────────────────────────────────────────────


class TestUnitType:
    def test_apartment(self):
        assert UnitType.APARTMENT.value == "APARTMENT"

    def test_land(self):
        assert UnitType.LAND.value == "LAND"

    def test_villa(self):
        assert UnitType.VILLA.value == "VILLA"

    def test_commercial(self):
        assert UnitType.COMMERCIAL.value == "COMMERCIAL"

    def test_has_four_values(self):
        assert len(UnitType) == 4


# ── ListingStatus Enum ───────────────────────────────────────────


class TestListingStatus:
    def test_draft(self):
        assert ListingStatus.DRAFT.value == "DRAFT"

    def test_confirmed(self):
        assert ListingStatus.CONFIRMED.value == "CONFIRMED"

    def test_has_two_values(self):
        assert len(ListingStatus) == 2


# ── Conversation Model ───────────────────────────────────────────


class TestConversation:
    def test_defaults(self):
        c = Conversation(whatsapp_id="201234567890")
        assert c.flow_state == FlowState.AWAITING_INTENT
        assert c.current_field is None
        assert c.intent is None
        assert c.listing_id is None
        assert c.id is None

    def test_full_fields(self, sample_conversation):
        c = sample_conversation(
            intent=Intent.SELL,
            flow_state=FlowState.AWAITING_SPECS,
            current_field="area",
            listing_id="listing-1",
        )
        assert c.intent == Intent.SELL
        assert c.flow_state == FlowState.AWAITING_SPECS
        assert c.current_field == "area"
        assert c.listing_id == "listing-1"
        assert c.whatsapp_id == "201234567890"

    def test_accepts_all_intent_values(self):
        for intent in Intent:
            c = Conversation(whatsapp_id="test", intent=intent)
            assert c.intent == intent

    def test_accepts_all_flow_states(self):
        for fs in FlowState:
            c = Conversation(whatsapp_id="test", flow_state=fs)
            assert c.flow_state == fs

    def test_timestamps_nullable(self):
        c = Conversation(whatsapp_id="test")
        assert c.created_at is None
        assert c.updated_at is None
        assert c.expires_at is None


# ── Listing Model ────────────────────────────────────────────────


class TestListing:
    def test_defaults(self):
        l = Listing(whatsapp_id="201234567890")
        assert l.status == ListingStatus.DRAFT
        assert l.specs == {}
        assert l.media_urls == []
        assert l.intent is None
        assert l.unit_type is None
        assert l.location is None
        assert l.price is None

    def test_full_fields(self, sample_listing):
        l = sample_listing()
        assert l.id == "listing-uuid-1"
        assert l.whatsapp_id == "201234567890"
        assert l.intent == Intent.SELL
        assert l.unit_type == UnitType.APARTMENT
        assert l.specs["area"] == 120
        assert l.location == "التجمع الخامس"
        assert l.price == 2_500_000
        assert l.status == ListingStatus.DRAFT

    def test_specs_is_mutable_dict(self):
        l = Listing(whatsapp_id="test")
        l.specs["area"] = 100
        assert l.specs["area"] == 100

    def test_media_urls_appendable(self):
        l = Listing(whatsapp_id="test")
        l.media_urls.append("https://example.com/photo.jpg")
        assert len(l.media_urls) == 1


# ── Unit Model ───────────────────────────────────────────────────


class TestUnit:
    def test_defaults(self):
        u = Unit(
            listing_id="lid",
            whatsapp_id="201234567890",
            intent=Intent.SELL,
            unit_type=UnitType.APARTMENT,
        )
        assert u.is_active is True
        assert u.specs == {}
        assert u.media_urls == []
        assert u.location is None
        assert u.price is None

    def test_full_fields(self, sample_unit):
        u = sample_unit()
        assert u.id == "unit-uuid-1"
        assert u.listing_id == "listing-uuid-1"
        assert u.intent == Intent.SELL
        assert u.unit_type == UnitType.APARTMENT
        assert u.is_active is True
        assert u.price == 2_500_000

    def test_inactive_unit(self, sample_unit):
        u = sample_unit(is_active=False)
        assert u.is_active is False


# ── Module Exports ───────────────────────────────────────────────


class TestModuleExports:
    def test_all_symbols_importable(self):
        from src.models import (
            Conversation, Listing, Unit,
            FlowState, Intent, UnitType, ListingStatus,
        )
        assert Conversation is not None
        assert Listing is not None
        assert Unit is not None
        assert FlowState is not None
        assert Intent is not None
        assert UnitType is not None
        assert ListingStatus is not None
