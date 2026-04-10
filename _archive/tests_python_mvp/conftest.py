import pytest
from unittest.mock import MagicMock, patch
from datetime import datetime, timezone, timedelta
from src.models import (
    Conversation, Listing, Unit,
    FlowState, Intent, UnitType, ListingStatus,
)


# ── Sample Data Factories ────────────────────────────────────────


@pytest.fixture
def sample_conversation():
    """Factory for Conversation objects."""
    def _make(**overrides):
        defaults = dict(
            id="conv-uuid-1",
            whatsapp_id="201234567890",
            flow_state=FlowState.AWAITING_INTENT,
            current_field=None,
            intent=None,
            listing_id=None,
            created_at=datetime(2026, 3, 28, tzinfo=timezone.utc),
            updated_at=datetime(2026, 3, 28, tzinfo=timezone.utc),
            expires_at=datetime(2026, 4, 4, tzinfo=timezone.utc),
        )
        defaults.update(overrides)
        return Conversation(**defaults)
    return _make


@pytest.fixture
def sample_listing():
    """Factory for Listing objects."""
    def _make(**overrides):
        defaults = dict(
            id="listing-uuid-1",
            whatsapp_id="201234567890",
            intent=Intent.SELL,
            unit_type=UnitType.APARTMENT,
            specs={"area": 120, "rooms": 3, "floor": 5, "finishing": "سوبر لوكس"},
            location="التجمع الخامس",
            price=2_500_000,
            media_urls=[],
            status=ListingStatus.DRAFT,
            created_at=datetime(2026, 3, 28, tzinfo=timezone.utc),
            updated_at=datetime(2026, 3, 28, tzinfo=timezone.utc),
        )
        defaults.update(overrides)
        return Listing(**defaults)
    return _make


@pytest.fixture
def sample_unit():
    """Factory for Unit objects."""
    def _make(**overrides):
        defaults = dict(
            id="unit-uuid-1",
            listing_id="listing-uuid-1",
            whatsapp_id="201234567890",
            intent=Intent.SELL,
            unit_type=UnitType.APARTMENT,
            specs={"area": 120, "rooms": 3},
            location="التجمع الخامس",
            price=2_500_000,
            media_urls=[],
            is_active=True,
            created_at=datetime(2026, 3, 28, tzinfo=timezone.utc),
            updated_at=datetime(2026, 3, 28, tzinfo=timezone.utc),
        )
        defaults.update(overrides)
        return Unit(**defaults)
    return _make


# ── Mock Settings ─────────────────────────────────────────────────


TEST_ENV = {
    "GEMINI_API_KEY": "test-gemini-key",
    "SUPABASE_URL": "https://test.supabase.co",
    "SUPABASE_KEY": "test-supabase-key",
    "WHATSAPP_TOKEN": "test-whatsapp-token",
    "WHATSAPP_PHONE_NUMBER_ID": "123456789",
    "WHATSAPP_APP_SECRET": "test-app-secret",
    "WHATSAPP_VERIFY_TOKEN": "test-verify-token",
}


@pytest.fixture
def mock_env(monkeypatch):
    """Set all required env vars for Settings."""
    for k, v in TEST_ENV.items():
        monkeypatch.setenv(k, v)
    # Reset singleton so each test gets a fresh Settings
    import src.config as cfg
    cfg._settings = None
    yield
    cfg._settings = None


# ── Supabase Mock Builder ────────────────────────────────────────


class FakeQueryBuilder:
    """Chainable mock that simulates supabase-py query builder."""

    def __init__(self, data=None):
        self._data = data if data is not None else []

    def select(self, *a, **kw):
        return self

    def insert(self, data, **kw):
        self._data = [data] if isinstance(data, dict) else data
        return self

    def update(self, data, **kw):
        if self._data:
            for row in self._data:
                row.update(data)
        return self

    def upsert(self, data, **kw):
        self._data = [data] if isinstance(data, dict) else data
        return self

    def delete(self):
        return self

    def eq(self, *a, **kw):
        return self

    def neq(self, *a, **kw):
        return self

    def lt(self, *a, **kw):
        return self

    def lte(self, *a, **kw):
        return self

    def ilike(self, *a, **kw):
        return self

    def order(self, *a, **kw):
        return self

    def limit(self, *a, **kw):
        return self

    def execute(self):
        resp = MagicMock()
        resp.data = self._data
        return resp


@pytest.fixture
def fake_supabase_client():
    """Returns a mock Supabase client whose .table() returns FakeQueryBuilder."""
    client = MagicMock()
    client._table_data = {}  # table_name → list of rows

    def table(name):
        return FakeQueryBuilder(client._table_data.get(name, []))

    client.table = table
    return client
