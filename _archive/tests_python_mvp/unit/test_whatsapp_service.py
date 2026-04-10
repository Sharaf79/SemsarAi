"""Tests for src/services/whatsapp_service.py — signature, parse, send, media."""

import pytest
import hmac
import hashlib
import json
from unittest.mock import patch, MagicMock


def _make_service():
    """Create a WhatsAppService with mocked settings."""
    with patch("src.services.whatsapp_service.get_settings") as mock_settings:
        s = mock_settings.return_value
        s.WHATSAPP_TOKEN = "test-token"
        s.WHATSAPP_PHONE_NUMBER_ID = "123456789"
        s.WHATSAPP_APP_SECRET = "test-secret"
        s.WHATSAPP_VERIFY_TOKEN = "test-verify"
        from src.services.whatsapp_service import WhatsAppService
        return WhatsAppService()


# ── verify_webhook_signature ─────────────────────────────────────


class TestVerifyWebhookSignature:
    def test_valid_signature_returns_true(self):
        svc = _make_service()
        payload = b'{"test": "data"}'
        expected = hmac.new(b"test-secret", payload, hashlib.sha256).hexdigest()
        header = f"sha256={expected}"
        assert svc.verify_webhook_signature(payload, header) is True

    def test_invalid_signature_returns_false(self):
        svc = _make_service()
        payload = b'{"test": "data"}'
        header = "sha256=0000000000000000000000000000000000000000000000000000000000000000"
        assert svc.verify_webhook_signature(payload, header) is False

    def test_missing_header_returns_false(self):
        svc = _make_service()
        assert svc.verify_webhook_signature(b"data", None) is False

    def test_empty_header_returns_false(self):
        svc = _make_service()
        assert svc.verify_webhook_signature(b"data", "") is False

    def test_malformed_header_no_prefix_returns_false(self):
        svc = _make_service()
        assert svc.verify_webhook_signature(b"data", "md5=abc123") is False


# ── parse_incoming_message ───────────────────────────────────────


class TestParseIncomingMessage:
    def _text_payload(self, from_number="201234567890", body="أهلاً"):
        return {
            "entry": [{
                "changes": [{
                    "value": {
                        "messages": [{
                            "from": from_number,
                            "type": "text",
                            "text": {"body": body}
                        }]
                    }
                }]
            }]
        }

    def _image_payload(self, media_id="media-123"):
        return {
            "entry": [{
                "changes": [{
                    "value": {
                        "messages": [{
                            "from": "201234567890",
                            "type": "image",
                            "image": {"id": media_id}
                        }]
                    }
                }]
            }]
        }

    def _video_payload(self, media_id="vid-456"):
        return {
            "entry": [{
                "changes": [{
                    "value": {
                        "messages": [{
                            "from": "201234567890",
                            "type": "video",
                            "video": {"id": media_id}
                        }]
                    }
                }]
            }]
        }

    def test_text_message_parsed(self):
        svc = _make_service()
        result = svc.parse_incoming_message(self._text_payload())
        assert result["from"] == "201234567890"
        assert result["type"] == "text"
        assert result["body"] == "أهلاً"
        assert result["media_id"] is None

    def test_image_message_parsed(self):
        svc = _make_service()
        result = svc.parse_incoming_message(self._image_payload())
        assert result["from"] == "201234567890"
        assert result["type"] == "image"
        assert result["media_id"] == "media-123"
        assert result["body"] is None

    def test_video_message_parsed(self):
        svc = _make_service()
        result = svc.parse_incoming_message(self._video_payload())
        assert result["type"] == "video"
        assert result["media_id"] == "vid-456"

    def test_no_messages_returns_none(self):
        svc = _make_service()
        payload = {"entry": [{"changes": [{"value": {"messages": []}}]}]}
        assert svc.parse_incoming_message(payload) is None

    def test_malformed_payload_returns_none(self):
        svc = _make_service()
        assert svc.parse_incoming_message({}) is None

    def test_empty_entry_returns_none(self):
        svc = _make_service()
        assert svc.parse_incoming_message({"entry": []}) is None

    def test_different_from_number(self):
        svc = _make_service()
        result = svc.parse_incoming_message(self._text_payload(from_number="201111111111"))
        assert result["from"] == "201111111111"


# ── send_text_message ────────────────────────────────────────────


class TestSendTextMessage:
    @patch("src.services.whatsapp_service.httpx.post")
    def test_correct_post_to_graph_api(self, mock_post):
        svc = _make_service()
        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_post.return_value = mock_response

        svc.send_text_message("201234567890", "أهلاً بيك")

        mock_post.assert_called_once()
        call_args = mock_post.call_args
        url = call_args[0][0]
        assert "123456789/messages" in url
        assert "v21.0" in url

        sent_json = call_args[1]["json"]
        assert sent_json["messaging_product"] == "whatsapp"
        assert sent_json["to"] == "201234567890"
        assert sent_json["text"]["body"] == "أهلاً بيك"

    @patch("src.services.whatsapp_service.httpx.post")
    def test_correct_auth_header(self, mock_post):
        svc = _make_service()
        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_post.return_value = mock_response

        svc.send_text_message("201234567890", "test")
        headers = mock_post.call_args[1]["headers"]
        assert headers["Authorization"] == "Bearer test-token"

    @patch("src.services.whatsapp_service.httpx.post")
    def test_http_error_raises(self, mock_post):
        svc = _make_service()
        mock_response = MagicMock()
        mock_response.raise_for_status.side_effect = Exception("HTTP 500")
        mock_post.return_value = mock_response

        with pytest.raises(Exception, match="HTTP 500"):
            svc.send_text_message("201234567890", "test")


# ── get_media_url ────────────────────────────────────────────────


class TestGetMediaUrl:
    @patch("src.services.whatsapp_service.httpx.get")
    def test_200_returns_url(self, mock_get):
        svc = _make_service()
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"url": "https://cdn.whatsapp.com/photo.jpg"}
        mock_get.return_value = mock_response

        url = svc.get_media_url("media-123")
        assert url == "https://cdn.whatsapp.com/photo.jpg"

    @patch("src.services.whatsapp_service.httpx.get")
    def test_non_200_returns_none(self, mock_get):
        svc = _make_service()
        mock_response = MagicMock()
        mock_response.status_code = 404
        mock_get.return_value = mock_response

        url = svc.get_media_url("media-nonexistent")
        assert url is None

    @patch("src.services.whatsapp_service.httpx.get")
    def test_correct_auth_header(self, mock_get):
        svc = _make_service()
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"url": "https://example.com"}
        mock_get.return_value = mock_response

        svc.get_media_url("media-123")
        headers = mock_get.call_args[1]["headers"]
        assert headers["Authorization"] == "Bearer test-token"
