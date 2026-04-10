import hmac
import hashlib
import json
import logging
from typing import Dict, Any, Optional, Tuple
import httpx

from src.config import get_settings

logger = logging.getLogger(__name__)

class WhatsAppService:
    def __init__(self):
        settings = get_settings()
        self.token = settings.WHATSAPP_TOKEN
        self.phone_number_id = settings.WHATSAPP_PHONE_NUMBER_ID
        self.app_secret = settings.WHATSAPP_APP_SECRET
        self.verify_token = settings.WHATSAPP_VERIFY_TOKEN
        self.api_version = "v21.0"
        self.base_url = f"https://graph.facebook.com/{self.api_version}"

    def verify_webhook_signature(self, payload: bytes, signature_header: str) -> bool:
        if not signature_header or not signature_header.startswith("sha256="):
            return False
            
        expected_signature = hmac.new(
            self.app_secret.encode('utf-8'),
            payload,
            hashlib.sha256
        ).hexdigest()
        
        provided_signature = signature_header.split("sha256=")[1]
        return hmac.compare_digest(expected_signature, provided_signature)

    def parse_incoming_message(self, payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        try:
            entry = payload.get("entry", [])[0]
            changes = entry.get("changes", [])[0]
            value = changes.get("value", {})
            messages = value.get("messages", [])
            
            if not messages:
                return None
                
            msg = messages[0]
            from_number = msg.get("from")
            msg_type = msg.get("type")
            
            result = {
                "from": from_number,
                "type": msg_type,
                "body": None,
                "media_id": None
            }
            
            if msg_type == "text":
                result["body"] = msg.get("text", {}).get("body")
            elif msg_type in ["image", "video"]:
                result["media_id"] = msg.get(msg_type, {}).get("id")
                
            return result
        except (IndexError, KeyError) as e:
            logger.error(f"Error parsing WhatsApp payload: {e}")
            return None

    def send_text_message(self, to_number: str, message: str) -> None:
        url = f"{self.base_url}/{self.phone_number_id}/messages"
        headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json"
        }
        data = {
            "messaging_product": "whatsapp",
            "to": to_number,
            "type": "text",
            "text": {
                "body": message
            }
        }
        
        response = httpx.post(url, headers=headers, json=data)
        response.raise_for_status()

    def get_media_url(self, media_id: str) -> Optional[str]:
        url = f"{self.base_url}/{media_id}"
        headers = {
            "Authorization": f"Bearer {self.token}"
        }
        
        response = httpx.get(url, headers=headers)
        if response.status_code == 200:
            data = response.json()
            return data.get("url")
        return None
