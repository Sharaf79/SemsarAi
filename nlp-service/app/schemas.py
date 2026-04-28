from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

Intent = Literal["search_properties", "search_drafts", "search_media", "unclear"]
PropertyTypeSlot = Literal["SALE", "RENT"]
PropertyKindSlot = Literal[
    "APARTMENT",
    "VILLA",
    "SHOP",
    "OFFICE",
    "SUMMER_RESORT",
    "COMMERCIAL",
    "LAND_BUILDING",
]


class Slots(BaseModel):
    propertyType: Optional[PropertyTypeSlot] = None
    propertyKind: Optional[PropertyKindSlot] = None
    bedrooms: Optional[int] = None
    minPrice: Optional[int] = None
    maxPrice: Optional[int] = None
    governorate: Optional[str] = None
    city: Optional[str] = None
    district: Optional[str] = None


class AnalyzeRequest(BaseModel):
    text: str = Field(min_length=1, max_length=500)


class AnalyzeResponse(BaseModel):
    intent: Intent
    confidence: float = Field(ge=0.0, le=1.0)
    slots: Slots
    # Which backend produced the intent — useful for debugging, never surfaced to users.
    classifier: Literal["stub", "distilbert"] = "stub"


class HealthResponse(BaseModel):
    status: Literal["ok", "degraded"]
    modelLoaded: bool
    classifier: Literal["stub", "distilbert"]
