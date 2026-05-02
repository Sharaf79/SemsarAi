/**
 * T24: Optional sound cue hook.
 * Plays a subtle tone when AI starts thinking.
 *
 * Usage:
 *   const play = useThinkingSound();
 *   // Called automatically when store.aiThinking transitions false → true
 */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  return audioCtx;
}

function playThinkingTone(): void {
  try {
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.15);

    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.2);
  } catch {
    // AudioContext may not be available (e.g. SSR, permissions)
  }
}

/**
 * Returns a function that plays the thinking tone.
 * Can also be used as a reactive hook with useEffect.
 */
export function useThinkingSound(): () => void {
  return playThinkingTone;
}

export default useThinkingSound;
