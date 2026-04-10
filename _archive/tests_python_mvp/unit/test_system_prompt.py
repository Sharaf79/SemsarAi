"""Tests for src/prompts/system_prompt.py — Constitution persona prompt."""

from src.prompts.system_prompt import build_system_prompt


class TestBuildSystemPrompt:
    def test_returns_nonempty_string(self):
        prompt = build_system_prompt()
        assert isinstance(prompt, str)
        assert len(prompt) > 50

    def test_contains_semsar_ai_identity(self):
        prompt = build_system_prompt()
        assert "Semsar AI" in prompt or "سمسار" in prompt

    def test_contains_privacy_firewall(self):
        prompt = build_system_prompt()
        assert "Privacy" in prompt or "privacy" in prompt.lower()

    def test_contains_one_at_a_time_instruction(self):
        prompt = build_system_prompt()
        assert "ONE" in prompt or "one" in prompt.lower()

    def test_contains_no_hallucination_instruction(self):
        prompt = build_system_prompt()
        assert "Pending" in prompt or "hallucin" in prompt.lower()

    def test_contains_ammiya_instruction(self):
        prompt = build_system_prompt()
        assert "Egyptian Arabic" in prompt or "Ammiya" in prompt or "عامية" in prompt

    def test_contains_json_extraction_instruction(self):
        prompt = build_system_prompt()
        assert "JSON" in prompt
