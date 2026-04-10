from enum import Enum
from typing import Optional
from datetime import datetime
from pydantic import BaseModel, Field
from src.models.listing import Intent

class FlowState(str, Enum):
    AWAITING_INTENT = "AWAITING_INTENT"
    AWAITING_UNIT_TYPE = "AWAITING_UNIT_TYPE"
    AWAITING_SPECS = "AWAITING_SPECS"
    AWAITING_MEDIA = "AWAITING_MEDIA"
    AWAITING_CONFIRMATION = "AWAITING_CONFIRMATION"
    CONFIRMED = "CONFIRMED"

class Conversation(BaseModel):
    id: Optional[str] = None
    whatsapp_id: str
    flow_state: FlowState = FlowState.AWAITING_INTENT
    current_field: Optional[str] = None
    intent: Optional[Intent] = None
    listing_id: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None
