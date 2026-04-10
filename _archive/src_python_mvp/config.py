import os
from dotenv import load_dotenv

load_dotenv()

class Settings:
    def __init__(self):
        self.GEMINI_API_KEY = self._get_required("GEMINI_API_KEY")
        self.SUPABASE_URL = self._get_required("SUPABASE_URL")
        self.SUPABASE_KEY = self._get_required("SUPABASE_KEY")
        self.WHATSAPP_TOKEN = self._get_required("WHATSAPP_TOKEN")
        self.WHATSAPP_PHONE_NUMBER_ID = self._get_required("WHATSAPP_PHONE_NUMBER_ID")
        self.WHATSAPP_APP_SECRET = self._get_required("WHATSAPP_APP_SECRET")
        self.WHATSAPP_VERIFY_TOKEN = self._get_required("WHATSAPP_VERIFY_TOKEN")

    def _get_required(self, key: str) -> str:
        value = os.getenv(key)
        if not value:
            raise ValueError(f"Missing required environment variable: {key}")
        return value

_settings = None

def get_settings() -> Settings:
    global _settings
    if _settings is None:
        _settings = Settings()
    return _settings
