from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta, timezone
from supabase import create_client, Client
from src.config import get_settings
from src.models import Conversation, Listing

class SupabaseService:
    def __init__(self):
        settings = get_settings()
        self.client: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)

    def get_conversation_by_whatsapp_id(self, whatsapp_id: str) -> Optional[Conversation]:
        response = self.client.table("conversations").select("*").eq("whatsapp_id", whatsapp_id).execute()
        if response.data:
            return Conversation(**response.data[0])
        return None

    def get_listing_by_id(self, listing_id: str) -> Optional[Listing]:
        response = self.client.table("listings").select("*").eq("id", listing_id).execute()
        if response.data:
            return Listing(**response.data[0])
        return None

    def get_latest_listing_by_whatsapp_id(self, whatsapp_id: str) -> Optional[Listing]:
        response = (self.client.table("listings").select("*")
                    .eq("whatsapp_id", whatsapp_id)
                    .order("created_at", desc=True)
                    .limit(1).execute())
        if response.data:
            return Listing(**response.data[0])
        return None

    def upsert_conversation(self, conversation: Conversation) -> Conversation:
        data = conversation.model_dump(exclude_none=True)
        if 'id' not in data or not data['id']:
            data.pop('id', None)

        now = datetime.now(timezone.utc)
        data["updated_at"] = now.isoformat()
        data["expires_at"] = (now + timedelta(days=7)).isoformat()
        response = self.client.table("conversations").upsert(data, on_conflict="whatsapp_id").execute()
        return Conversation(**response.data[0])

    def create_listing(self, listing: Listing) -> Listing:
        data = listing.model_dump(exclude_none=True)
        if 'id' not in data or not data['id']:
            data.pop('id', None)

        response = self.client.table("listings").insert(data).execute()
        return Listing(**response.data[0])

    def update_listing(self, listing: Listing) -> Listing:
        if not listing.id:
            raise ValueError("Listing must have an ID to be updated")

        data = listing.model_dump(exclude_none=True)
        data["updated_at"] = datetime.now(timezone.utc).isoformat()
        response = self.client.table("listings").update(data).eq("id", listing.id).execute()
        return Listing(**response.data[0])

    def publish_unit(self, listing: Listing) -> None:
        """Publish a CONFIRMED SELL/RENT listing to the units table."""
        self.client.table("units").insert({
            "listing_id": listing.id,
            "whatsapp_id": listing.whatsapp_id,
            "intent": listing.intent.value if listing.intent else "SELL",
            "unit_type": listing.unit_type.value if listing.unit_type else "APARTMENT",
            "specs": listing.specs,
            "location": listing.location,
            "price": listing.price,
            "media_urls": listing.media_urls,
            "is_active": True
        }).execute()

    def delete_expired_conversations(self) -> None:
        now = datetime.now(timezone.utc).isoformat()
        self.client.table("conversations").delete().lt("expires_at", now).neq("flow_state", "CONFIRMED").execute()
