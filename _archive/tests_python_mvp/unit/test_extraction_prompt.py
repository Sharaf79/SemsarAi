"""Tests for src/prompts/extraction_prompt.py — field extraction prompts."""

import pytest
from src.models import FlowState
from src.prompts.extraction_prompt import build_extraction_prompt


class TestBuildExtractionPrompt:
    def test_returns_tuple_of_schema_and_prompt(self):
        schema, prompt = build_extraction_prompt(FlowState.AWAITING_INTENT, "intent", "عايز ابيع")
        assert isinstance(schema, dict)
        assert isinstance(prompt, str)

    def test_intent_schema_has_enum(self):
        schema, _ = build_extraction_prompt(FlowState.AWAITING_INTENT, "intent", "test")
        props = schema.get("properties", {})
        assert "intent" in props
        assert "enum" in props["intent"]
        assert "BUY" in props["intent"]["enum"]
        assert "SELL" in props["intent"]["enum"]
        assert "RENT" in props["intent"]["enum"]
        assert "UNKNOWN" in props["intent"]["enum"]

    def test_unit_type_schema_has_enum(self):
        schema, _ = build_extraction_prompt(FlowState.AWAITING_UNIT_TYPE, "unit_type", "شقة")
        props = schema.get("properties", {})
        assert "unit_type" in props
        assert "APARTMENT" in props["unit_type"]["enum"]
        assert "LAND" in props["unit_type"]["enum"]

    def test_area_schema_is_number(self):
        schema, _ = build_extraction_prompt(FlowState.AWAITING_SPECS, "area", "120 متر")
        props = schema.get("properties", {})
        assert props["area"]["type"] == "number"

    def test_rooms_schema_is_integer(self):
        schema, _ = build_extraction_prompt(FlowState.AWAITING_SPECS, "rooms", "3 غرف")
        props = schema.get("properties", {})
        assert props["rooms"]["type"] == "integer"

    def test_location_schema_is_string(self):
        schema, _ = build_extraction_prompt(FlowState.AWAITING_SPECS, "location", "التجمع")
        props = schema.get("properties", {})
        assert props["location"]["type"] == "string"

    def test_price_schema_is_number(self):
        schema, _ = build_extraction_prompt(FlowState.AWAITING_SPECS, "price", "2 مليون")
        props = schema.get("properties", {})
        assert props["price"]["type"] == "number"

    def test_is_correct_schema_has_boolean_and_correction_field(self):
        schema, _ = build_extraction_prompt(FlowState.AWAITING_CONFIRMATION, "is_correct", "صح")
        props = schema.get("properties", {})
        assert props["is_correct"]["type"] == "boolean"
        assert "correction_field" in props

    def test_awaiting_confirmation_uses_is_correct_config(self):
        schema, _ = build_extraction_prompt(FlowState.AWAITING_CONFIRMATION, "anything", "صح")
        props = schema.get("properties", {})
        assert "is_correct" in props

    def test_unknown_field_uses_fallback(self):
        schema, prompt = build_extraction_prompt(FlowState.AWAITING_SPECS, "some_new_field", "data")
        props = schema.get("properties", {})
        assert "some_new_field" in props

    def test_prompt_includes_user_message(self):
        _, prompt = build_extraction_prompt(FlowState.AWAITING_INTENT, "intent", "عايز اشتري شقة")
        assert "عايز اشتري شقة" in prompt

    # ── Verify all 17 known fields have configs ──────────────────

    KNOWN_FIELDS = [
        "intent", "unit_type", "area", "rooms", "floor", "finishing",
        "location", "price", "budget", "min_area", "min_rooms",
        "monthly_budget", "duration", "total_area", "legal_status",
        "zoning", "is_correct",
    ]

    @pytest.mark.parametrize("field", KNOWN_FIELDS)
    def test_known_field_has_config(self, field):
        # Use appropriate flow state for the field
        if field == "is_correct":
            flow_state = FlowState.AWAITING_CONFIRMATION
        elif field == "intent":
            flow_state = FlowState.AWAITING_INTENT
        elif field == "unit_type":
            flow_state = FlowState.AWAITING_UNIT_TYPE
        else:
            flow_state = FlowState.AWAITING_SPECS
        
        schema, prompt = build_extraction_prompt(flow_state, field, "test input")
        assert schema is not None
        assert len(prompt) > 10

    def test_floor_schema_is_integer(self):
        schema, _ = build_extraction_prompt(FlowState.AWAITING_SPECS, "floor", "الدور التالت")
        props = schema.get("properties", {})
        assert props["floor"]["type"] == "integer"

    def test_finishing_schema_is_string(self):
        schema, _ = build_extraction_prompt(FlowState.AWAITING_SPECS, "finishing", "سوبر لوكس")
        props = schema.get("properties", {})
        assert props["finishing"]["type"] == "string"

    def test_budget_schema_is_number(self):
        schema, _ = build_extraction_prompt(FlowState.AWAITING_SPECS, "budget", "مليون")
        props = schema.get("properties", {})
        assert props["budget"]["type"] == "number"

    def test_min_area_schema_is_number(self):
        schema, _ = build_extraction_prompt(FlowState.AWAITING_SPECS, "min_area", "100")
        props = schema.get("properties", {})
        assert props["min_area"]["type"] == "number"

    def test_min_rooms_schema_is_integer(self):
        schema, _ = build_extraction_prompt(FlowState.AWAITING_SPECS, "min_rooms", "2")
        props = schema.get("properties", {})
        assert props["min_rooms"]["type"] == "integer"

    def test_monthly_budget_schema_is_number(self):
        schema, _ = build_extraction_prompt(FlowState.AWAITING_SPECS, "monthly_budget", "8000")
        props = schema.get("properties", {})
        assert props["monthly_budget"]["type"] == "number"

    def test_duration_schema_is_string(self):
        schema, _ = build_extraction_prompt(FlowState.AWAITING_SPECS, "duration", "سنة")
        props = schema.get("properties", {})
        assert props["duration"]["type"] == "string"

    def test_total_area_schema_is_number(self):
        schema, _ = build_extraction_prompt(FlowState.AWAITING_SPECS, "total_area", "500")
        props = schema.get("properties", {})
        assert props["total_area"]["type"] == "number"

    def test_legal_status_schema_is_string(self):
        schema, _ = build_extraction_prompt(FlowState.AWAITING_SPECS, "legal_status", "مسجل")
        props = schema.get("properties", {})
        assert props["legal_status"]["type"] == "string"

    def test_zoning_schema_is_string(self):
        schema, _ = build_extraction_prompt(FlowState.AWAITING_SPECS, "zoning", "سكني")
        props = schema.get("properties", {})
        assert props["zoning"]["type"] == "string"
