"""Tests for src/config.py — Settings + singleton."""

import pytest
import os


class TestSettings:
    """Tests for Settings class."""

    def test_all_env_vars_loaded(self, mock_env):
        from src.config import Settings
        s = Settings()
        assert s.GEMINI_API_KEY == "test-gemini-key"
        assert s.SUPABASE_URL == "https://test.supabase.co"
        assert s.SUPABASE_KEY == "test-supabase-key"
        assert s.WHATSAPP_TOKEN == "test-whatsapp-token"
        assert s.WHATSAPP_PHONE_NUMBER_ID == "123456789"
        assert s.WHATSAPP_APP_SECRET == "test-app-secret"
        assert s.WHATSAPP_VERIFY_TOKEN == "test-verify-token"

    def test_missing_gemini_key_raises(self, mock_env, monkeypatch):
        monkeypatch.delenv("GEMINI_API_KEY")
        from src.config import Settings
        with pytest.raises(ValueError, match="GEMINI_API_KEY"):
            Settings()

    def test_missing_supabase_url_raises(self, mock_env, monkeypatch):
        monkeypatch.delenv("SUPABASE_URL")
        from src.config import Settings
        with pytest.raises(ValueError, match="SUPABASE_URL"):
            Settings()

    def test_missing_whatsapp_token_raises(self, mock_env, monkeypatch):
        monkeypatch.delenv("WHATSAPP_TOKEN")
        from src.config import Settings
        with pytest.raises(ValueError, match="WHATSAPP_TOKEN"):
            Settings()

    def test_missing_whatsapp_phone_id_raises(self, mock_env, monkeypatch):
        monkeypatch.delenv("WHATSAPP_PHONE_NUMBER_ID")
        from src.config import Settings
        with pytest.raises(ValueError, match="WHATSAPP_PHONE_NUMBER_ID"):
            Settings()

    def test_missing_whatsapp_app_secret_raises(self, mock_env, monkeypatch):
        monkeypatch.delenv("WHATSAPP_APP_SECRET")
        from src.config import Settings
        with pytest.raises(ValueError, match="WHATSAPP_APP_SECRET"):
            Settings()

    def test_missing_whatsapp_verify_token_raises(self, mock_env, monkeypatch):
        monkeypatch.delenv("WHATSAPP_VERIFY_TOKEN")
        from src.config import Settings
        with pytest.raises(ValueError, match="WHATSAPP_VERIFY_TOKEN"):
            Settings()

    def test_missing_supabase_key_raises(self, mock_env, monkeypatch):
        monkeypatch.delenv("SUPABASE_KEY")
        from src.config import Settings
        with pytest.raises(ValueError, match="SUPABASE_KEY"):
            Settings()

    def test_get_required_returns_value(self, mock_env):
        from src.config import Settings
        s = Settings()
        # The _get_required method returns the env value
        assert s._get_required("GEMINI_API_KEY") == "test-gemini-key"

    def test_get_required_empty_string_raises(self, mock_env, monkeypatch):
        monkeypatch.setenv("GEMINI_API_KEY", "")
        from src.config import Settings
        with pytest.raises(ValueError, match="GEMINI_API_KEY"):
            Settings()


class TestGetSettings:
    """Tests for get_settings singleton."""

    def test_returns_settings_instance(self, mock_env):
        from src.config import get_settings
        s = get_settings()
        assert s.GEMINI_API_KEY == "test-gemini-key"

    def test_singleton_returns_same_object(self, mock_env):
        from src.config import get_settings
        s1 = get_settings()
        s2 = get_settings()
        assert s1 is s2

    def test_singleton_reset_gives_new_object(self, mock_env):
        import src.config as cfg
        from src.config import get_settings
        s1 = get_settings()
        cfg._settings = None
        s2 = get_settings()
        assert s1 is not s2
