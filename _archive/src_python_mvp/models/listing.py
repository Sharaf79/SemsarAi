from enum import Enum
from typing import Optional, List, Dict, Any
from datetime import datetime
from pydantic import BaseModel

class Intent(str, Enum):
    BUY = "BUY"
    SELL = "SELL"
    RENT = "RENT"
    LEASE = "LEASE"

class UnitType(str, Enum):
    APARTMENT = "APARTMENT"
    LAND = "LAND"
    VILLA = "VILLA"
    COMMERCIAL = "COMMERCIAL"

class ListingStatus(str, Enum):
    DRAFT = "DRAFT"
    CONFIRMED = "CONFIRMED"

class Listing(BaseModel):
    id: Optional[str] = None
    whatsapp_id: str
    intent: Optional[Intent] = None
    unit_type: Optional[UnitType] = None
    specs: Dict[str, Any] = {}
    location: Optional[str] = None
    price: Optional[float] = None
    media_urls: List[str] = []
    status: ListingStatus = ListingStatus.DRAFT
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
