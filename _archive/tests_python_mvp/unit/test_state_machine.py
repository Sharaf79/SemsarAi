"""Tests for src/services/state_machine.py — field sequences, transitions, questions."""

import pytest
from src.models import (
    Conversation, Listing, FlowState, Intent, UnitType, ListingStatus,
)
from src.services.state_machine import (
    FIELD_SEQUENCES,
    get_next_field,
    generate_question,
    format_summary_card,
    generate_welcome_back,
    transition,
)


# ── FIELD_SEQUENCES ──────────────────────────────────────────────


class TestFieldSequences:
    def test_sell_apartment_sequence(self):
        seq = FIELD_SEQUENCES[(Intent.SELL, UnitType.APARTMENT)]
        assert seq == ["area", "rooms", "floor", "finishing", "location", "price"]

    def test_sell_land_sequence(self):
        seq = FIELD_SEQUENCES[(Intent.SELL, UnitType.LAND)]
        assert seq == ["total_area", "legal_status", "zoning", "location", "price"]

    def test_buy_apartment_sequence(self):
        seq = FIELD_SEQUENCES[(Intent.BUY, UnitType.APARTMENT)]
        assert seq == ["location", "budget", "min_area", "min_rooms"]

    def test_buy_land_sequence(self):
        seq = FIELD_SEQUENCES[(Intent.BUY, UnitType.LAND)]
        assert seq == ["location", "budget", "min_area"]

    def test_rent_apartment_sequence(self):
        seq = FIELD_SEQUENCES[(Intent.RENT, UnitType.APARTMENT)]
        assert seq == ["location", "monthly_budget", "duration", "rooms"]

    def test_lease_apartment_sequence(self):
        seq = FIELD_SEQUENCES[(Intent.LEASE, UnitType.APARTMENT)]
        assert seq == ["location", "monthly_budget", "duration", "rooms"]

    def test_total_defined_sequences(self):
        assert len(FIELD_SEQUENCES) == 6


# ── get_next_field ───────────────────────────────────────────────


class TestGetNextField:
    def test_returns_first_field_when_current_is_none(self):
        nf = get_next_field(Intent.SELL, UnitType.APARTMENT, None)
        assert nf == "area"

    def test_returns_next_field_in_sequence(self):
        nf = get_next_field(Intent.SELL, UnitType.APARTMENT, "area")
        assert nf == "rooms"

    def test_returns_last_field(self):
        nf = get_next_field(Intent.SELL, UnitType.APARTMENT, "finishing")
        assert nf == "location"

    def test_returns_none_at_end_of_sequence(self):
        nf = get_next_field(Intent.SELL, UnitType.APARTMENT, "price")
        assert nf is None

    def test_returns_first_when_current_not_in_sequence(self):
        nf = get_next_field(Intent.SELL, UnitType.APARTMENT, "nonexistent")
        assert nf == "area"

    def test_returns_none_for_unsupported_combo(self):
        nf = get_next_field(Intent.SELL, UnitType.VILLA, None)
        assert nf is None

    def test_buy_land_sequence_traversal(self):
        assert get_next_field(Intent.BUY, UnitType.LAND, None) == "location"
        assert get_next_field(Intent.BUY, UnitType.LAND, "location") == "budget"
        assert get_next_field(Intent.BUY, UnitType.LAND, "budget") == "min_area"
        assert get_next_field(Intent.BUY, UnitType.LAND, "min_area") is None


# ── generate_question ────────────────────────────────────────────


class TestGenerateQuestion:
    KNOWN_FIELDS = [
        "intent", "unit_type", "area", "rooms", "floor", "finishing",
        "location", "price", "total_area", "legal_status", "zoning",
        "budget", "min_area", "min_rooms", "monthly_budget", "duration",
    ]

    @pytest.mark.parametrize("field", KNOWN_FIELDS)
    def test_known_field_returns_nonempty_question(self, field):
        q = generate_question(field)
        assert isinstance(q, str)
        assert len(q) > 5

    def test_intent_question_in_ammiya(self):
        q = generate_question("intent")
        assert "تبيع" in q or "تشتري" in q or "تأجر" in q

    def test_unknown_field_returns_fallback(self):
        q = generate_question("unknown_xyz")
        assert "unknown_xyz" in q

    def test_location_question(self):
        q = generate_question("location")
        assert "المكان" in q or "فين" in q


# ── format_summary_card ──────────────────────────────────────────


class TestFormatSummaryCard:
    def test_sell_apartment_all_fields(self, sample_listing):
        listing = sample_listing(
            specs={"area": 120, "rooms": 3, "floor": 5, "finishing": "سوبر لوكس"},
            location="التجمع الخامس",
            price=2_500_000,
        )
        card = format_summary_card(listing)
        assert "ملخص" in card
        assert "120" in card
        assert "3" in card
        assert "5" in card
        assert "سوبر لوكس" in card
        assert "التجمع الخامس" in card
        assert "2500000" in card
        assert "صح ولا" in card

    def test_missing_fields_show_pending(self, sample_listing):
        listing = sample_listing(specs={}, location=None, price=None)
        card = format_summary_card(listing)
        assert "معلق" in card

    def test_buy_apartment_summary(self, sample_listing):
        listing = sample_listing(
            intent=Intent.BUY,
            unit_type=UnitType.APARTMENT,
            specs={"min_area": 100, "min_rooms": 2},
            location="المعادي",
            price=1_500_000,
        )
        card = format_summary_card(listing)
        assert "BUY" in card
        assert "APARTMENT" in card
        assert "صح ولا" in card

    def test_rent_apartment_summary(self, sample_listing):
        listing = sample_listing(
            intent=Intent.RENT,
            unit_type=UnitType.APARTMENT,
            specs={"rooms": 2, "monthly_budget": 8000, "duration": "سنة"},
            location="مدينة نصر",
            price=8000,
        )
        card = format_summary_card(listing)
        assert "RENT" in card

    def test_sell_land_summary(self, sample_listing):
        listing = sample_listing(
            intent=Intent.SELL,
            unit_type=UnitType.LAND,
            specs={"total_area": 500, "legal_status": "مسجل", "zoning": "سكني"},
            location="أكتوبر",
            price=5_000_000,
        )
        card = format_summary_card(listing)
        assert "LAND" in card
        assert "مسجل" in card


# ── generate_welcome_back ────────────────────────────────────────


class TestGenerateWelcomeBack:
    def test_contains_greeting(self):
        msg = generate_welcome_back("المساحة كام متر؟")
        assert "أهلاً تاني" in msg

    def test_contains_question(self):
        msg = generate_welcome_back("المساحة كام متر؟")
        assert "المساحة كام متر؟" in msg


# ── transition — AWAITING_INTENT ─────────────────────────────────


class TestTransitionAwaitingIntent:
    def _make(self, sample_conversation, sample_listing):
        conv = sample_conversation(flow_state=FlowState.AWAITING_INTENT)
        listing = sample_listing(id=None, intent=None, unit_type=None, specs={})
        return conv, listing

    def test_valid_sell_moves_to_unit_type(self, sample_conversation, sample_listing):
        conv, listing = self._make(sample_conversation, sample_listing)
        conv, listing, reply = transition(conv, listing, "عايز ابيع", {"intent": "SELL"})
        assert conv.flow_state == FlowState.AWAITING_UNIT_TYPE
        assert conv.intent == Intent.SELL
        assert listing.intent == Intent.SELL

    def test_valid_buy_moves_to_unit_type(self, sample_conversation, sample_listing):
        conv, listing = self._make(sample_conversation, sample_listing)
        conv, listing, reply = transition(conv, listing, "عايز اشتري", {"intent": "BUY"})
        assert conv.flow_state == FlowState.AWAITING_UNIT_TYPE
        assert conv.intent == Intent.BUY

    def test_valid_rent_moves_to_unit_type(self, sample_conversation, sample_listing):
        conv, listing = self._make(sample_conversation, sample_listing)
        conv, listing, reply = transition(conv, listing, "عايز اأجر", {"intent": "RENT"})
        assert conv.flow_state == FlowState.AWAITING_UNIT_TYPE
        assert conv.intent == Intent.RENT

    def test_unknown_intent_stays(self, sample_conversation, sample_listing):
        conv, listing = self._make(sample_conversation, sample_listing)
        conv, listing, reply = transition(conv, listing, "مش عارف", {"intent": "UNKNOWN"})
        assert conv.flow_state == FlowState.AWAITING_INTENT

    def test_empty_extracted_stays(self, sample_conversation, sample_listing):
        conv, listing = self._make(sample_conversation, sample_listing)
        conv, listing, reply = transition(conv, listing, "hello", {})
        assert conv.flow_state == FlowState.AWAITING_INTENT

    def test_invalid_enum_value_stays(self, sample_conversation, sample_listing):
        conv, listing = self._make(sample_conversation, sample_listing)
        conv, listing, reply = transition(conv, listing, "xyz", {"intent": "INVALID"})
        assert conv.flow_state == FlowState.AWAITING_INTENT


# ── transition — AWAITING_UNIT_TYPE ──────────────────────────────


class TestTransitionAwaitingUnitType:
    def _make(self, sample_conversation, sample_listing, intent=Intent.SELL):
        conv = sample_conversation(
            flow_state=FlowState.AWAITING_UNIT_TYPE,
            intent=intent,
        )
        listing = sample_listing(id=None, intent=intent, unit_type=None, specs={})
        return conv, listing

    def test_valid_apartment_moves_to_specs(self, sample_conversation, sample_listing):
        conv, listing = self._make(sample_conversation, sample_listing)
        conv, listing, reply = transition(conv, listing, "شقة", {"unit_type": "APARTMENT"})
        assert conv.flow_state == FlowState.AWAITING_SPECS
        assert listing.unit_type == UnitType.APARTMENT
        assert conv.current_field == "area"  # first field for SELL+APARTMENT

    def test_valid_land_moves_to_specs(self, sample_conversation, sample_listing):
        conv, listing = self._make(sample_conversation, sample_listing)
        conv, listing, reply = transition(conv, listing, "أرض", {"unit_type": "LAND"})
        assert conv.flow_state == FlowState.AWAITING_SPECS
        assert listing.unit_type == UnitType.LAND
        assert conv.current_field == "total_area"  # first field for SELL+LAND

    def test_unknown_type_stays(self, sample_conversation, sample_listing):
        conv, listing = self._make(sample_conversation, sample_listing)
        conv, listing, reply = transition(conv, listing, "مش عارف", {"unit_type": "UNKNOWN"})
        assert conv.flow_state == FlowState.AWAITING_UNIT_TYPE

    def test_unsupported_combo_gives_error(self, sample_conversation, sample_listing):
        conv, listing = self._make(sample_conversation, sample_listing, intent=Intent.BUY)
        conv, listing, reply = transition(conv, listing, "فيلا", {"unit_type": "VILLA"})
        # VILLA is valid enum but (BUY, VILLA) has no FIELD_SEQUENCES → error
        assert "مش مدعوم" in reply

    def test_buy_apartment_first_field_is_location(self, sample_conversation, sample_listing):
        conv, listing = self._make(sample_conversation, sample_listing, intent=Intent.BUY)
        conv, listing, reply = transition(conv, listing, "شقة", {"unit_type": "APARTMENT"})
        assert conv.current_field == "location"


# ── transition — AWAITING_SPECS ──────────────────────────────────


class TestTransitionAwaitingSpecs:
    def test_stores_area_in_specs(self, sample_conversation, sample_listing):
        conv = sample_conversation(
            flow_state=FlowState.AWAITING_SPECS,
            intent=Intent.SELL,
            current_field="area",
        )
        listing = sample_listing(id=None, intent=Intent.SELL, unit_type=UnitType.APARTMENT, specs={})
        conv, listing, reply = transition(conv, listing, "120 متر", {"area": 120})
        assert listing.specs["area"] == 120
        assert conv.current_field == "rooms"

    def test_stores_location_in_listing(self, sample_conversation, sample_listing):
        conv = sample_conversation(
            flow_state=FlowState.AWAITING_SPECS,
            intent=Intent.SELL,
            current_field="location",
        )
        listing = sample_listing(
            id=None, intent=Intent.SELL, unit_type=UnitType.APARTMENT,
            specs={"area": 120, "rooms": 3, "floor": 5, "finishing": "سوبر لوكس"},
        )
        conv, listing, reply = transition(conv, listing, "التجمع", {"location": "التجمع"})
        assert listing.location == "التجمع"

    def test_stores_price_in_listing(self, sample_conversation, sample_listing):
        conv = sample_conversation(
            flow_state=FlowState.AWAITING_SPECS,
            intent=Intent.SELL,
            current_field="price",
        )
        listing = sample_listing(
            id=None, intent=Intent.SELL, unit_type=UnitType.APARTMENT,
            specs={"area": 120, "rooms": 3, "floor": 5, "finishing": "سوبر لوكس"},
            location="التجمع",
        )
        conv, listing, reply = transition(conv, listing, "مليونين", {"price": 2000000})
        assert listing.price == 2000000

    def test_last_field_sell_goes_to_media(self, sample_conversation, sample_listing):
        conv = sample_conversation(
            flow_state=FlowState.AWAITING_SPECS,
            intent=Intent.SELL,
            current_field="price",
        )
        listing = sample_listing(
            id=None, intent=Intent.SELL, unit_type=UnitType.APARTMENT,
            specs={"area": 120, "rooms": 3, "floor": 5, "finishing": "سوبر لوكس"},
            location="التجمع",
        )
        conv, listing, reply = transition(conv, listing, "2 مليون", {"price": 2000000})
        assert conv.flow_state == FlowState.AWAITING_MEDIA
        assert "صور" in reply or "فيديو" in reply

    def test_last_field_buy_skips_media(self, sample_conversation, sample_listing):
        conv = sample_conversation(
            flow_state=FlowState.AWAITING_SPECS,
            intent=Intent.BUY,
            current_field="min_rooms",
        )
        listing = sample_listing(
            id=None, intent=Intent.BUY, unit_type=UnitType.APARTMENT,
            specs={"min_area": 100},
            location="المعادي",
            price=1_500_000,
        )
        conv, listing, reply = transition(conv, listing, "2", {"min_rooms": 2})
        assert conv.flow_state == FlowState.AWAITING_CONFIRMATION
        assert "ملخص" in reply

    def test_no_extracted_value_re_asks(self, sample_conversation, sample_listing):
        conv = sample_conversation(
            flow_state=FlowState.AWAITING_SPECS,
            intent=Intent.SELL,
            current_field="area",
        )
        listing = sample_listing(id=None, intent=Intent.SELL, unit_type=UnitType.APARTMENT, specs={})
        conv, listing, reply = transition(conv, listing, "مش فاهم", {})
        assert conv.flow_state == FlowState.AWAITING_SPECS
        assert conv.current_field == "area"

    def test_stores_budget_in_price(self, sample_conversation, sample_listing):
        conv = sample_conversation(
            flow_state=FlowState.AWAITING_SPECS,
            intent=Intent.BUY,
            current_field="budget",
        )
        listing = sample_listing(
            id=None, intent=Intent.BUY, unit_type=UnitType.APARTMENT,
            specs={}, location="المعادي",
        )
        conv, listing, reply = transition(conv, listing, "مليون ونص", {"budget": 1500000})
        assert listing.price == 1500000


# ── transition — AWAITING_MEDIA ──────────────────────────────────


class TestTransitionAwaitingMedia:
    def _make(self, sample_conversation, sample_listing):
        conv = sample_conversation(
            flow_state=FlowState.AWAITING_MEDIA,
            intent=Intent.SELL,
        )
        listing = sample_listing(intent=Intent.SELL, unit_type=UnitType.APARTMENT)
        return conv, listing

    def test_skip_with_mesh_halokty(self, sample_conversation, sample_listing):
        conv, listing = self._make(sample_conversation, sample_listing)
        conv, listing, reply = transition(conv, listing, "مش دلوقتي", {})
        assert conv.flow_state == FlowState.AWAITING_CONFIRMATION
        assert "ملخص" in reply

    def test_skip_with_la(self, sample_conversation, sample_listing):
        conv, listing = self._make(sample_conversation, sample_listing)
        conv, listing, reply = transition(conv, listing, "لا", {})
        assert conv.flow_state == FlowState.AWAITING_CONFIRMATION

    def test_media_received(self, sample_conversation, sample_listing):
        conv, listing = self._make(sample_conversation, sample_listing)
        conv, listing, reply = transition(conv, listing, "", {"has_media": True})
        assert conv.flow_state == FlowState.AWAITING_CONFIRMATION

    def test_other_text_still_advances(self, sample_conversation, sample_listing):
        conv, listing = self._make(sample_conversation, sample_listing)
        conv, listing, reply = transition(conv, listing, "تمام", {})
        assert conv.flow_state == FlowState.AWAITING_CONFIRMATION


# ── transition — AWAITING_CONFIRMATION ───────────────────────────


class TestTransitionAwaitingConfirmation:
    def _make(self, sample_conversation, sample_listing):
        conv = sample_conversation(
            flow_state=FlowState.AWAITING_CONFIRMATION,
            intent=Intent.SELL,
        )
        listing = sample_listing(intent=Intent.SELL, unit_type=UnitType.APARTMENT)
        return conv, listing

    def test_confirm_moves_to_confirmed(self, sample_conversation, sample_listing):
        conv, listing = self._make(sample_conversation, sample_listing)
        conv, listing, reply = transition(conv, listing, "صح", {"is_correct": True})
        assert conv.flow_state == FlowState.CONFIRMED
        assert listing.status == ListingStatus.CONFIRMED
        assert "تم" in reply

    def test_correction_goes_back_to_specs(self, sample_conversation, sample_listing):
        conv, listing = self._make(sample_conversation, sample_listing)
        conv, listing, reply = transition(
            conv, listing, "عايز أغير المساحة",
            {"is_correct": False, "correction_field": "area"},
        )
        assert conv.flow_state == FlowState.AWAITING_SPECS
        assert conv.current_field == "area"

    def test_no_data_re_asks(self, sample_conversation, sample_listing):
        conv, listing = self._make(sample_conversation, sample_listing)
        conv, listing, reply = transition(conv, listing, "hmm", {})
        assert conv.flow_state == FlowState.AWAITING_CONFIRMATION
        assert "صح ولا" in reply
