"""
Gemini 2.5 Flash service — chat completion with 3× exponential backoff (FR-013).
"""
import json
import time
import logging
from typing import Any

from google import genai
from google.genai import types
from google.genai.errors import APIError

from app.core.config import get_settings
from app.core.prompts import SYSTEM_PROMPT

logger = logging.getLogger(__name__)

_client: genai.Client | None = None


def _get_client() -> genai.Client:
    global _client
    if _client is None:
        _client = genai.Client(api_key=get_settings().GEMINI_API_KEY)
    return _client


def chat(user_message: str, *, model: str = "gemini-2.5-flash") -> str:
    """
    Send a user message to Gemini with the Semsar AI system prompt.
    Stateless single-turn call. Use chat_with_history() for multi-turn.
    """
    return chat_with_history([], user_message, model=model)


def chat_with_history(
    history: list[dict],
    user_message: str,
    *,
    model: str = "gemini-2.5-flash",
) -> str:
    """
    Multi-turn chat: pass conversation history so Gemini remembers context.

    history is a list of {"role": "user"|"model", "text": str} dicts.
    Returns the assistant's reply text.
    Retries up to 3× on 429 / 5xx with exponential backoff.
    """
    client = _get_client()

    # Build contents list from history + new user message
    contents: list[dict] = []
    for turn in history:
        contents.append({
            "role": turn["role"],
            "parts": [{"text": turn["text"]}],
        })
    contents.append({"role": "user", "parts": [{"text": user_message}]})

    config = types.GenerateContentConfig(
        system_instruction=SYSTEM_PROMPT,
    )

    backoffs = [1, 2, 4]
    last_error: Exception | None = None

    for attempt in range(3):
        try:
            response = client.models.generate_content(
                model=model,
                contents=contents,
                config=config,
            )
            return response.text or ""

        except APIError as exc:
            last_error = exc
            code = getattr(exc, "code", 500)
            if code == 429 or code >= 500:
                if attempt < 2:
                    wait = backoffs[attempt]
                    logger.warning(
                        "Gemini %s (attempt %d/3), retrying in %ds…",
                        code, attempt + 1, wait,
                    )
                    time.sleep(wait)
                    continue
            raise

    logger.error("Gemini API failed after 3 retries: %s", last_error)
    return "حدثت مشكلة تقنية، يرجى المحاولة مجدداً 🙏"


def extract_json(
    user_message: str,
    extraction_hint: str,
    schema: dict[str, Any] | None = None,
    *,
    model: str = "gemini-2.5-flash",
) -> dict[str, Any]:
    """
    Send a user message and get back structured JSON (for field extraction).

    Parameters
    ----------
    user_message : str
        The raw Arabic text from the user.
    extraction_hint : str
        Arabic instruction telling the model *what* to extract.
    schema : dict | None
        Optional JSON-schema dict passed as `response_schema` for
        constrained decoding.

    Returns parsed dict or {} on failure.
    """
    client = _get_client()

    prompt = f"{extraction_hint}\n\nUser Message: \"{user_message}\"\n\nاستخرج القيمة بالضبط حسب الـ schema. لو مش موجودة رجّع null أو UNKNOWN."

    config_args: dict[str, Any] = {
        "system_instruction": SYSTEM_PROMPT,
        "response_mime_type": "application/json",
    }
    if schema:
        config_args["response_schema"] = schema

    config = types.GenerateContentConfig(**config_args)

    backoffs = [1, 2, 4]

    for attempt in range(3):
        try:
            response = client.models.generate_content(
                model=model,
                contents=prompt,
                config=config,
            )
            if response.text:
                return json.loads(response.text)
            return {}

        except APIError as exc:
            code = getattr(exc, "code", 500)
            if (code == 429 or code >= 500) and attempt < 2:
                time.sleep(backoffs[attempt])
                continue
            logger.error("Gemini extract_json failed: %s", exc)
            return {}
        except json.JSONDecodeError as exc:
            logger.error("Gemini returned invalid JSON: %s", exc)
            return {}

    return {}
