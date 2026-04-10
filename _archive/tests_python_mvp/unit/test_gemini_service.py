"""Tests for src/services/gemini_service.py — LLM extraction with mocked client."""

import pytest
import json
from unittest.mock import patch, MagicMock, PropertyMock
from google.genai.errors import APIError


class TestGeminiServiceInit:
    @patch("src.services.gemini_service.get_settings")
    @patch("src.services.gemini_service.genai.Client")
    def test_init_creates_client_with_api_key(self, mock_client_cls, mock_settings):
        mock_settings.return_value.GEMINI_API_KEY = "test-key"
        from src.services.gemini_service import GeminiService
        svc = GeminiService()
        mock_client_cls.assert_called_once_with(api_key="test-key")
        assert svc.model_name == "gemini-2.5-flash"


class TestGeminiSendMessage:
    def _make_service(self):
        """Create a GeminiService with mocked client."""
        with patch("src.services.gemini_service.get_settings") as mock_settings:
            mock_settings.return_value.GEMINI_API_KEY = "test-key"
            with patch("src.services.gemini_service.genai.Client") as mock_cls:
                mock_client = MagicMock()
                mock_cls.return_value = mock_client
                from src.services.gemini_service import GeminiService
                svc = GeminiService()
                return svc, mock_client

    def test_successful_json_extraction(self):
        svc, mock_client = self._make_service()
        mock_response = MagicMock()
        mock_response.text = '{"intent": "SELL"}'
        mock_client.models.generate_content.return_value = mock_response

        result = svc.send_message("test prompt", "system prompt")
        assert result == {"intent": "SELL"}

    def test_with_schema_constraint(self):
        svc, mock_client = self._make_service()
        mock_response = MagicMock()
        mock_response.text = '{"area": 120}'
        mock_client.models.generate_content.return_value = mock_response

        schema = {"type": "object", "properties": {"area": {"type": "number"}}}
        result = svc.send_message("test", "sys", expected_schema=schema)
        assert result == {"area": 120}

    def test_empty_response_returns_empty_dict(self):
        svc, mock_client = self._make_service()
        mock_response = MagicMock()
        mock_response.text = None
        mock_client.models.generate_content.return_value = mock_response

        result = svc.send_message("test", "sys")
        assert result == {}

    @patch("src.services.gemini_service.time.sleep")
    def test_retry_on_429_succeeds_on_second_try(self, mock_sleep):
        svc, mock_client = self._make_service()

        error_429 = APIError(429, {"error": "Rate limited"})

        mock_response = MagicMock()
        mock_response.text = '{"intent": "BUY"}'

        mock_client.models.generate_content.side_effect = [
            error_429,
            mock_response,
        ]

        result = svc.send_message("test", "sys")
        assert result == {"intent": "BUY"}
        assert mock_sleep.call_count == 1
        mock_sleep.assert_called_with(1)  # first backoff

    @patch("src.services.gemini_service.time.sleep")
    def test_retry_on_500_succeeds_on_third_try(self, mock_sleep):
        svc, mock_client = self._make_service()

        error_500 = APIError(500, {"error": "Server error"})

        mock_response = MagicMock()
        mock_response.text = '{"rooms": 3}'

        mock_client.models.generate_content.side_effect = [
            error_500,
            error_500,
            mock_response,
        ]

        result = svc.send_message("test", "sys")
        assert result == {"rooms": 3}
        assert mock_sleep.call_count == 2

    @patch("src.services.gemini_service.time.sleep")
    def test_all_retries_exhausted_raises(self, mock_sleep):
        svc, mock_client = self._make_service()

        error_429 = APIError(429, {"error": "Rate limited"})

        mock_client.models.generate_content.side_effect = [
            error_429, error_429, error_429,
        ]

        with pytest.raises(APIError):
            svc.send_message("test", "sys")

    def test_non_retryable_error_raises_immediately(self):
        svc, mock_client = self._make_service()

        error_400 = APIError(400, {"error": "Bad request"})

        mock_client.models.generate_content.side_effect = error_400

        with pytest.raises(APIError):
            svc.send_message("test", "sys")
        # Should not retry — only 1 call
        assert mock_client.models.generate_content.call_count == 1

    def test_invalid_json_raises_value_error(self):
        svc, mock_client = self._make_service()
        mock_response = MagicMock()
        mock_response.text = "not json at all"
        mock_client.models.generate_content.return_value = mock_response

        with pytest.raises(ValueError, match="Invalid JSON"):
            svc.send_message("test", "sys")
