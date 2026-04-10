"""
Supabase search — placeholder for FR-019 buyer matching.

Replace the stub implementation with real Supabase queries once the
`units` table is populated.
"""
import logging
from typing import Any

logger = logging.getLogger(__name__)


def search_units(
    unit_type: str,
    location: str | None = None,
    budget: float | None = None,
    min_area: float | None = None,
    min_rooms: int | None = None,
    limit: int = 5,
) -> list[dict[str, Any]]:
    """
    Search the `units` table for active properties matching a buyer's
    criteria.  Returns up to *limit* results.

    TODO: wire to real Supabase client once DB is seeded.
    """
    logger.info(
        "search_units called — unit_type=%s location=%s budget=%s "
        "min_area=%s min_rooms=%s (placeholder, returning empty)",
        unit_type, location, budget, min_area, min_rooms,
    )
    # ── Placeholder: return an empty list until real DB is connected ──
    return []


def format_search_results(units: list[dict[str, Any]]) -> str:
    """Format matching units into an Ammiya WhatsApp message."""
    if not units:
        return (
            "مفيش حاجة مطابقة لطلبك دلوقتي، بس سجلنا طلبك "
            "وهنبلغك أول ما يظهر حاجة مناسبة 👍"
        )

    lines = ["لقينا العروض دي اللي ممكن تناسبك:"]
    for i, u in enumerate(units, 1):
        loc = u.get("location") or "مكان غير محدد"
        line = f"{i}. {u.get('unit_type', '')} في {loc}"
        if u.get("price"):
            line += f" بسعر {u['price']:,.0f} جنيه"
        specs = u.get("specs") or {}
        if specs.get("area"):
            line += f"، مساحة {specs['area']} م²"
        lines.append(line)

    return "\n".join(lines)
