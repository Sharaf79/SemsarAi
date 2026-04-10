"""
Configuration — loads environment variables via python-dotenv.
"""
import os
from dotenv import load_dotenv

load_dotenv()  # reads .env at project root


class Settings:
    """Validated environment settings. Raises on missing required keys."""

    GEMINI_API_KEY: str
    SUPABASE_URL: str
    SUPABASE_KEY: str
    WHATSAPP_TOKEN: str
    WHATSAPP_PHONE_NUMBER_ID: str
    WHATSAPP_APP_SECRET: str
    WHATSAPP_VERIFY_TOKEN: str

    def __init__(self) -> None:
        self.GEMINI_API_KEY = self._require("GEMINI_API_KEY")
        self.SUPABASE_URL = self._require("SUPABASE_URL")
        self.SUPABASE_KEY = self._require("SUPABASE_KEY")
        self.WHATSAPP_TOKEN = self._require("WHATSAPP_TOKEN")
        self.WHATSAPP_PHONE_NUMBER_ID = self._require("WHATSAPP_PHONE_NUMBER_ID")
        self.WHATSAPP_APP_SECRET = self._require("WHATSAPP_APP_SECRET")
        self.WHATSAPP_VERIFY_TOKEN = self._require("WHATSAPP_VERIFY_TOKEN")

    @staticmethod
    def _require(key: str) -> str:
        value = os.getenv(key)
        if not value:
            raise ValueError(f"Missing required environment variable: {key}")
        return value


# Module-level singleton — import `settings` anywhere.
_settings: Settings | None = None


def get_settings() -> Settings:
    global _settings
    if _settings is None:
        _settings = Settings()
    return _settings
