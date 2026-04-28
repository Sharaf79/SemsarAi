"""Hybrid slot extractor: regex for numerics, keyword maps for enums,
fuzzy match for locations. Deliberately no token-level Arabic NER — too fragile
for the small closed domain we're working in.

Everything here is a pure function of the input string so the NLP service can
stay stateless.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Optional

from rapidfuzz import fuzz, process

from .schemas import PropertyKindSlot, PropertyTypeSlot, Slots


# ─── Digit normalisation ───────────────────────────────────────────────
_ARABIC_INDIC = str.maketrans("٠١٢٣٤٥٦٧٨٩", "0123456789")
_PERSIAN = str.maketrans("۰۱۲۳۴۵۶۷۸۹", "0123456789")


def _normalise_digits(text: str) -> str:
    return text.translate(_ARABIC_INDIC).translate(_PERSIAN)


# ─── Property type (SALE/RENT) ─────────────────────────────────────────
_SALE_TOKENS = ("للبيع", "بيع", "اشترى", "اشتري", "اشتراء", "شراء", "تمليك", "sale", "buy", "for sale")
_RENT_TOKENS = ("للإيجار", "للايجار", "إيجار", "ايجار", "استئجار", "rent", "for rent", "lease")


def _detect_type(text: str) -> Optional[PropertyTypeSlot]:
    lower = text.lower()
    sale_hit = any(tok in lower for tok in _SALE_TOKENS)
    rent_hit = any(tok in lower for tok in _RENT_TOKENS)
    if sale_hit and not rent_hit:
        return "SALE"
    if rent_hit and not sale_hit:
        return "RENT"
    return None


# ─── Property kind ─────────────────────────────────────────────────────
_KIND_MAP: tuple[tuple[PropertyKindSlot, tuple[str, ...]], ...] = (
    ("APARTMENT", ("شقة", "شقه", "شقق", "apartment", "flat")),
    ("VILLA", ("فيلا", "فيلات", "دوبلكس", "قصر", "villa", "duplex")),
    ("SHOP", ("محل", "محلات", "دكان", "shop", "store")),
    ("OFFICE", ("مكتب", "مكاتب", "office")),
    ("SUMMER_RESORT", ("شاليه", "منتجع", "قرية سياحية", "summer", "resort", "chalet")),
    ("COMMERCIAL", ("تجاري", "تجارى", "commercial")),
    ("LAND_BUILDING", ("أرض", "ارض", "أراضي", "اراضي", "مبنى", "مباني", "عمارة", "land", "plot", "building")),
)


def _detect_kind(text: str) -> Optional[PropertyKindSlot]:
    lower = text.lower()
    for kind, tokens in _KIND_MAP:
        if any(tok in lower for tok in tokens):
            return kind
    return None


# ─── Bedrooms ──────────────────────────────────────────────────────────
_WORD_NUMBER = {
    "غرفة": 1,
    "غرفه": 1,
    "اوضة": 1,
    "أوضة": 1,
    "غرفتين": 2,
    "اوضتين": 2,
    "أوضتين": 2,
    "ثلاث": 3,
    "تلات": 3,
    "أربع": 4,
    "اربع": 4,
    "خمس": 5,
    "ست": 6,
    "سبع": 7,
}

_BEDROOM_RE = re.compile(
    r"(\d+)\s*(?:غرف|غرفة|غرفه|اوض|أوض|br|bed|bedrooms?|rooms?)",
    re.IGNORECASE,
)


def _detect_bedrooms(raw: str, normalised: str) -> Optional[int]:
    match = _BEDROOM_RE.search(normalised)
    if match:
        try:
            n = int(match.group(1))
            if 1 <= n <= 20:
                return n
        except ValueError:
            pass

    for word, value in _WORD_NUMBER.items():
        if word in raw:
            return value
    return None


# ─── Price ─────────────────────────────────────────────────────────────
# Units recognised after a number.
_UNIT_MULTIPLIER: tuple[tuple[str, int], ...] = (
    ("مليون", 1_000_000),
    ("مليار", 1_000_000_000),
    ("الف", 1_000),
    ("ألف", 1_000),
    ("m", 1_000_000),
    ("k", 1_000),
)

_NUMBER_WITH_UNIT = re.compile(
    r"(\d+(?:[.,]\d+)?)\s*(مليون|مليار|الف|ألف|m|k)",
    re.IGNORECASE,
)

# Comparatives — "تحت 2 مليون" → max, "فوق 500 ألف" → min, "بين 1 و 2 مليون" → both
_MAX_HINTS = ("تحت", "أقل من", "اقل من", "حتى", "حد أقصى", "حد اقصى", "under", "below", "max", "up to")
_MIN_HINTS = ("فوق", "أكثر من", "اكثر من", "على الأقل", "على الاقل", "من", "above", "over", "min", "starting")


@dataclass
class _PriceHit:
    value: int
    start: int
    end: int


def _collect_price_hits(text: str) -> list[_PriceHit]:
    hits: list[_PriceHit] = []
    for match in _NUMBER_WITH_UNIT.finditer(text):
        num_str = match.group(1).replace(",", ".")
        try:
            number = float(num_str)
        except ValueError:
            continue
        unit = match.group(2).lower()
        multiplier = next((m for u, m in _UNIT_MULTIPLIER if u == unit), 1)
        value = int(number * multiplier)
        hits.append(_PriceHit(value=value, start=match.start(), end=match.end()))
    return hits


def _detect_price(normalised: str) -> tuple[Optional[int], Optional[int]]:
    hits = _collect_price_hits(normalised)
    if not hits:
        return None, None

    lower = normalised.lower()

    def _hint_before(pos: int, hints: tuple[str, ...]) -> bool:
        window = lower[max(0, pos - 20) : pos]
        return any(h in window for h in hints)

    min_price: Optional[int] = None
    max_price: Optional[int] = None

    for hit in hits:
        if _hint_before(hit.start, _MAX_HINTS):
            max_price = hit.value if max_price is None else min(max_price, hit.value)
        elif _hint_before(hit.start, _MIN_HINTS):
            min_price = hit.value if min_price is None else max(min_price, hit.value)

    # "between X and Y" style — two hits, no explicit direction.
    if min_price is None and max_price is None and len(hits) >= 2:
        ordered = sorted(h.value for h in hits)
        min_price, max_price = ordered[0], ordered[-1]
    elif min_price is None and max_price is None and len(hits) == 1:
        # Lone price without hints — treat as a ceiling, which matches "عايز شقة
        # بـ مليون" in everyday Egyptian usage.
        max_price = hits[0].value

    return min_price, max_price


# ─── Location matching ─────────────────────────────────────────────────
# Egyptian-only on purpose. The spec forbids Gulf/Levant cities from leaking
# into slot values, so we keep the list scoped.
EGYPT_GOVERNORATES = (
    "القاهرة", "الجيزة", "الإسكندرية", "الاسكندرية", "القليوبية", "الشرقية",
    "الدقهلية", "البحر الأحمر", "الغربية", "المنوفية", "البحيرة", "كفر الشيخ",
    "دمياط", "بورسعيد", "الإسماعيلية", "الاسماعيلية", "السويس", "شمال سيناء",
    "جنوب سيناء", "بني سويف", "الفيوم", "المنيا", "أسيوط", "سوهاج", "قنا",
    "الأقصر", "أسوان", "مطروح", "الوادي الجديد",
)

EGYPT_CITIES_DISTRICTS = (
    "المعادي", "الزمالك", "مدينة نصر", "مصر الجديدة", "وسط البلد", "الدقي",
    "المهندسين", "6 أكتوبر", "ست أكتوبر", "السادس من أكتوبر", "الشيخ زايد",
    "التجمع الخامس", "التجمع الأول", "العاصمة الإدارية", "مدينتي", "القطامية",
    "المقطم", "حلوان", "فيصل", "الهرم", "العجوزة", "شبرا", "عين شمس",
    "المطرية", "الشروق", "العبور", "بدر", "الرحاب", "التجمع", "سموحة",
    "سيدي جابر", "المنتزه", "العجمي", "الهانوفيل", "المعمورة", "رأس البر",
    "الغردقة", "شرم الشيخ", "دهب", "مرسى علم", "العين السخنة", "الساحل الشمالي",
    "مارينا", "العلمين",
)


def _fuzzy_location_match(text: str, candidates: tuple[str, ...], threshold: int = 85) -> Optional[str]:
    # rapidfuzz.process.extractOne returns (choice, score, idx) or None.
    result = process.extractOne(text, candidates, scorer=fuzz.partial_ratio)
    if result and result[1] >= threshold:
        return result[0]
    return None


def _detect_location(text: str) -> tuple[Optional[str], Optional[str], Optional[str]]:
    # Prefer exact substring matches before fuzzy — fuzzy is a fallback for
    # misspellings, not the primary path.
    governorate: Optional[str] = next((g for g in EGYPT_GOVERNORATES if g in text), None)
    city_or_district: Optional[str] = next((c for c in EGYPT_CITIES_DISTRICTS if c in text), None)

    if governorate is None:
        governorate = _fuzzy_location_match(text, EGYPT_GOVERNORATES)
    if city_or_district is None:
        city_or_district = _fuzzy_location_match(text, EGYPT_CITIES_DISTRICTS)

    # The schema distinguishes city vs district; without a richer gazetteer we
    # pack the hit into `city` and let the backend reconcile against the real
    # locations table.
    return governorate, city_or_district, None


# ─── Public API ────────────────────────────────────────────────────────

def extract_slots(raw_text: str) -> Slots:
    normalised = _normalise_digits(raw_text)
    property_type = _detect_type(raw_text)
    property_kind = _detect_kind(raw_text)
    bedrooms = _detect_bedrooms(raw_text, normalised)
    min_price, max_price = _detect_price(normalised)
    governorate, city, district = _detect_location(raw_text)
    return Slots(
        propertyType=property_type,
        propertyKind=property_kind,
        bedrooms=bedrooms,
        minPrice=min_price,
        maxPrice=max_price,
        governorate=governorate,
        city=city,
        district=district,
    )
