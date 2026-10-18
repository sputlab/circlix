/* ==========================================================================
   Circlix — v1.2.1
   Sound feedback — tiny synthesized cues via the Web Audio API.
   No audio files: everything is generated on the fly, so the game stays
   a fully self-contained deliverable.
   ========================================================================== */

(function () {
  'use strict';

  let ctx = null;
  let enabled = true;

  const STORAGE_KEY = 'cc_sound_enabled';
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved !== null) enabled = saved === '1';

  function ensureCtx() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    return ctx;
  }

  /**
   * Plays a short synthesized tone.
   * @param {number} freq starting frequency (Hz)
   * @param {number} duration seconds
   * @param {OscillatorType} type waveform
   * @param {number} peakGain 0..1
   * @param {number} [glideTo] optional end frequency for a pitch glide
   */
  function tone(freq, duration, type, peakGain, glideTo) {
    if (!enabled) return;
    const c = ensureCtx();
    if (!c) return;
    try {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, c.currentTime);
      if (glideTo) {
        osc.frequency.exponentialRampToValueAtTime(glideTo, c.currentTime + duration);
      }
      gain.gain.setValueAtTime(0.0001, c.currentTime);
      gain.gain.exponentialRampToValueAtTime(peakGain, c.currentTime + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + duration);
      osc.connect(gain).connect(c.destination);
      osc.start();
      osc.stop(c.currentTime + duration + 0.03);
    } catch (e) {
      // Audio blocked or unsupported — fail silently, never break gameplay.
    }
  }

  // --- correct actions -------------------------------------------------
  function playTargetHit(combo = 0) {
    // bright chime with harmonic pitch rise on streak combos
    const pitchMul = Math.min(1.65, Math.pow(1.045, Math.max(0, combo)));
    const baseFreq = 660 * pitchMul;
    const peakFreq = 900 * pitchMul;
    const chime2 = 990 * pitchMul;

    tone(baseFreq, 0.09, 'sine', 0.22, peakFreq);
    setTimeout(() => tone(chime2, 0.08, 'sine', 0.17, undefined), 42);
  }

  function playDodge() {
    // soft, subtle tick — a lighter cue than the target chime
    tone(520, 0.05, 'triangle', 0.09);
  }

  function playExtraLife() {
    // triumphant ascending three-note arpeggio — clearly distinct from
    // the two-note target chime, reserved for the rarer "+1 vita" event
    tone(523, 0.09, 'sine', 0.2, 659);
    setTimeout(() => tone(659, 0.09, 'sine', 0.18, 784), 70);
    setTimeout(() => tone(784, 0.12, 'sine', 0.2, 1046), 140);
  }

  function playSlow() {
    // descending "time slows down" glide
    tone(500, 0.32, 'sine', 0.16, 220);
  }

  function playBigBonus() {
    // the rare +2-lives segment: bigger and warmer than playExtraLife,
    // with a low supporting note so it reads as a "jackpot" moment
    tone(220, 0.3, 'triangle', 0.16, 220);
    tone(659, 0.1, 'sine', 0.2, 880);
    setTimeout(() => tone(880, 0.1, 'sine', 0.2, 1046), 80);
    setTimeout(() => tone(1046, 0.16, 'sine', 0.22, 1318), 160);
  }

  function playBomb() {
    // a short, punchy explosion: a low thumping sub-hit plus a fast
    // downward-sweeping crackle, distinct from every other cue
    tone(90, 0.28, 'sawtooth', 0.28, 35);
    tone(55, 0.22, 'sine', 0.22, 30);
    setTimeout(() => tone(600, 0.1, 'square', 0.1, 120), 15);
  }

  // --- mistake -----------------------------------------------------------
  function playHit() {
    tone(170, 0.24, 'sawtooth', 0.24, 65);
  }

  // --- misc ---------------------------------------------------------------
  function unlock() {
    ensureCtx();
  }

  function setEnabled(v) {
    enabled = !!v;
    localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
  }

  function isEnabled() {
    return enabled;
  }

  window.CCSound = { playTargetHit, playDodge, playExtraLife, playSlow, playBigBonus, playBomb, playHit, unlock, setEnabled, isEnabled };
})();
