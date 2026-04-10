from typing import Optional, List, Dict, Any
from datetime import datetime
from pydantic import BaseModel
from src.models.listing import Intent, UnitType

class Unit(BaseModel):
    id: Optional[str] = None
    listing_id: str
    whatsapp_id: str
    intent: Intent
    unit_type: UnitType
    specs: Dict[str, Any] = {}
    location: Optional[str] = None
    price: Optional[float] = None
    media_urls: List[str] = []
    is_active: bool = True
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
