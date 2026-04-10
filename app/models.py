"""
Pydantic request / response schemas for the /chat endpoint.
"""
from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    """Incoming user message."""
    user_id: str = Field(
        ...,
        description="WhatsApp phone number or unique session identifier.",
        examples=["201012345678"],
    )
    message: str = Field(
        ...,
        description="Free-text message from the user (Arabic, Franco-Arab, or mixed).",
        examples=["عايز أبيع شقة"],
    )


class ChatResponse(BaseModel):
    """Bot reply returned by /chat."""
    reply: str = Field(
        ...,
        description="Semsar AI response in standard Arabic.",
    )
    user_id: str = Field(
        ...,
        description="Echo-back of the requester's ID.",
    )
    options: list[str] = Field(
        default=[],
        description="Clickable quick-reply options extracted from the reply.",
    )
