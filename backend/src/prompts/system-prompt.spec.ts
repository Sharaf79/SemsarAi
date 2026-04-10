/**
 * Tests for system-prompt.ts — ported 1:1 from Python test_system_prompt.py
 */
import { buildSystemPrompt } from './system-prompt';

describe('buildSystemPrompt', () => {
  it('returns non-empty string', () => {
    const prompt = buildSystemPrompt();
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(50);
  });

  it('contains Semsar AI identity', () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toMatch(/Semsar AI|سمسار/);
  });

  it('contains privacy firewall', () => {
    const prompt = buildSystemPrompt();
    expect(prompt.toLowerCase()).toContain('privacy');
  });

  it('contains one-at-a-time instruction', () => {
    const prompt = buildSystemPrompt();
    expect(prompt.toLowerCase()).toMatch(/one/i);
  });

  it('contains no-hallucination instruction', () => {
    const prompt = buildSystemPrompt();
    expect(prompt.toLowerCase()).toMatch(/pending|hallucin/);
  });

  it('contains Ammiya instruction', () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toMatch(/Egyptian Arabic|Ammiya|عامية/);
  });

  it('contains JSON extraction instruction', () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toContain('JSON');
  });
});
