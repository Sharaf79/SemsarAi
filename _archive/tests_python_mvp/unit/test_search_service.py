"""Tests for src/services/search_service.py — search + format results."""

import pytest
from unittest.mock import MagicMock
from src.models import Listing, Unit, Intent, UnitType, ListingStatus
from src.services.search_service import search_units_for_buyer, format_search_results


def _make_mock_supabase(units_data=None):
    """Build a mock SupabaseService with chainable query builder."""
    mock_svc = MagicMock()
    chain = MagicMock()
    result = MagicMock()
    result.data = units_data if units_data is not None else []
    
    for method in ["select", "eq", "ilike", "lte", "order", "limit"]:
        getattr(chain, method).return_value = chain
    chain.execute.return_value = result
    mock_svc.client.table.return_value = chain
    return mock_svc


# ── search_units_for_buyer ───────────────────────────────────────


class TestSearchUnitsForBuyer:
    def test_returns_matching_units(self):
        units_data = [{
            "id": "u1",
            "listing_id": "l1",
            "whatsapp_id": "2019999",
            "intent": "SELL",
            "unit_type": "APARTMENT",
            "specs": {"area": 120},
            "location": "التجمع",
            "price": 2000000,
            "media_urls": [],
            "is_active": True,
            "created_at": "2026-03-28T00:00:00+00:00",
            "updated_at": "2026-03-28T00:00:00+00:00",
        }]
        mock_db = _make_mock_supabase(units_data)
        listing = Listing(
            whatsapp_id="201234567890",
            intent=Intent.BUY,
            unit_type=UnitType.APARTMENT,
            location="التجمع",
            price=2_500_000,
        )
        results = search_units_for_buyer(listing, mock_db)
        assert len(results) == 1
        assert results[0].id == "u1"

    def test_filters_by_unit_type(self):
        mock_db = _make_mock_supabase([])
        listing = Listing(
            whatsapp_id="201234567890",
            intent=Intent.BUY,
            unit_type=UnitType.LAND,
        )
        search_units_for_buyer(listing, mock_db)
        # Verify eq was called with unit_type
        chain = mock_db.client.table.return_value
        calls = [str(c) for c in chain.eq.call_args_list]
        assert any("LAND" in c for c in calls)

    def test_filters_by_location_ilike(self):
        mock_db = _make_mock_supabase([])
        listing = Listing(
            whatsapp_id="201234567890",
            intent=Intent.BUY,
            unit_type=UnitType.APARTMENT,
            location="المعادي",
        )
        search_units_for_buyer(listing, mock_db)
        chain = mock_db.client.table.return_value
        chain.ilike.assert_called_once()

    def test_filters_by_budget(self):
        mock_db = _make_mock_supabase([])
        listing = Listing(
            whatsapp_id="201234567890",
            intent=Intent.BUY,
            unit_type=UnitType.APARTMENT,
            price=1_500_000,
        )
        search_units_for_buyer(listing, mock_db)
        chain = mock_db.client.table.return_value
        chain.lte.assert_called_once()

    def test_no_matches_returns_empty_list(self):
        mock_db = _make_mock_supabase([])
        listing = Listing(
            whatsapp_id="201234567890",
            intent=Intent.BUY,
            unit_type=UnitType.APARTMENT,
        )
        results = search_units_for_buyer(listing, mock_db)
        assert results == []

    def test_no_location_skips_ilike_filter(self):
        mock_db = _make_mock_supabase([])
        listing = Listing(
            whatsapp_id="201234567890",
            intent=Intent.BUY,
            unit_type=UnitType.APARTMENT,
            location=None,
        )
        search_units_for_buyer(listing, mock_db)
        chain = mock_db.client.table.return_value
        chain.ilike.assert_not_called()

    def test_no_budget_skips_lte_filter(self):
        mock_db = _make_mock_supabase([])
        listing = Listing(
            whatsapp_id="201234567890",
            intent=Intent.BUY,
            unit_type=UnitType.APARTMENT,
            price=None,
        )
        search_units_for_buyer(listing, mock_db)
        chain = mock_db.client.table.return_value
        chain.lte.assert_not_called()


# ── format_search_results ────────────────────────────────────────


class TestFormatSearchResults:
    def test_formats_multiple_units(self):
        units = [
            Unit(
                id="u1", listing_id="l1", whatsapp_id="x",
                intent=Intent.SELL, unit_type=UnitType.APARTMENT,
                location="التجمع", price=2000000, specs={"area": 120},
            ),
            Unit(
                id="u2", listing_id="l2", whatsapp_id="y",
                intent=Intent.SELL, unit_type=UnitType.APARTMENT,
                location="المعادي", price=1500000, specs={},
            ),
        ]
        result = format_search_results(units)
        assert "1." in result
        assert "2." in result
        assert "التجمع" in result
        assert "المعادي" in result
        assert "2000000" in result

    def test_empty_returns_no_match_message(self):
        result = format_search_results([])
        assert "مفيش" in result

    def test_missing_location_shows_placeholder(self):
        units = [
            Unit(
                id="u1", listing_id="l1", whatsapp_id="x",
                intent=Intent.SELL, unit_type=UnitType.APARTMENT,
                location=None, price=1000000, specs={},
            ),
        ]
        result = format_search_results(units)
        assert "غير محدد" in result

    def test_unit_with_area_in_specs(self):
        units = [
            Unit(
                id="u1", listing_id="l1", whatsapp_id="x",
                intent=Intent.SELL, unit_type=UnitType.APARTMENT,
                location="مصر الجديدة", price=3000000,
                specs={"area": 200},
            ),
        ]
        result = format_search_results(units)
        assert "200" in result
        assert "متر" in result

    def test_no_phone_numbers_in_output(self):
        """Privacy Firewall: phone numbers must NEVER appear in results."""
        units = [
            Unit(
                id="u1", listing_id="l1", whatsapp_id="201234567890",
                intent=Intent.SELL, unit_type=UnitType.APARTMENT,
                location="التجمع", price=2000000, specs={},
            ),
        ]
        result = format_search_results(units)
        assert "201234567890" not in result
        assert "whatsapp" not in result.lower()
