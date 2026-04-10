import json
import time
import logging
from typing import Dict, Any, Optional
from google import genai
from google.genai import types
from google.genai.errors import APIError

from src.config import get_settings

logger = logging.getLogger(__name__)

class GeminiService:
    def __init__(self):
        settings = get_settings()
        self.client = genai.Client(api_key=settings.GEMINI_API_KEY)
        self.model_name = "gemini-2.5-flash"
        
    def send_message(self, prompt: str, system_instruction: str, expected_schema: Optional[type] = None) -> Dict[str, Any]:
        """
        Sends a message to Gemini and returns parsed JSON.
        Implements 3x exponential backoff on failure.
        """
        retries = 3
        backoffs = [1, 2, 4]
        
        config_args = {
            "system_instruction": system_instruction,
            "response_mime_type": "application/json"
        }
        
        if expected_schema:
            config_args["response_schema"] = expected_schema

        config = types.GenerateContentConfig(**config_args)

        for attempt in range(retries):
            try:
                response = self.client.models.generate_content(
                    model=self.model_name,
                    contents=prompt,
                    config=config
                )
                
                # Parse JSON
                if response.text:
                    return json.loads(response.text)
                return {}
                
            except APIError as e:
                status_code = getattr(e, "code", 500)
                if status_code == 429 or status_code >= 500:
                    if attempt < retries - 1:
                        logger.warning(f"Gemini API error {status_code}, retrying in {backoffs[attempt]}s...")
                        time.sleep(backoffs[attempt])
                        continue
                logger.error(f"Gemini API error exhausted retries: {e}")
                raise
            except json.JSONDecodeError as e:
                logger.error(f"Failed to parse Gemini JSON output: {e} - Content: {response.text}")
                raise ValueError("Invalid JSON output from model")
                
        raise Exception("Failed to get response from Gemini")
