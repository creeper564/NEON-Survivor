'use strict';

/* ============================================================
   AudioEngine
   Sons 100% procéduraux via Web Audio API. Aucun fichier
   externe. Doit être initialisé après une interaction
   utilisateur (contrainte navigateur).
============================================================ */
class AudioEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.sfxGain = null;
    this.muted = false;
    this.sfxVolume = 0.6;
  }

  init() {
    if (this.ctx) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 1;
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = this.sfxVolume;
      this.sfxGain.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);
    } catch (e) {
      this.ctx = null;
    }
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  setVolume(v) {
    this.sfxVolume = clampNum(v, 0, 1);
    if (this.sfxGain) this.sfxGain.gain.value = this.sfxVolume;
  }

  setMuted(m) { this.muted = m; }

  tone(freq, dur, type, volume, freqEnd, delay) {
    if (this.muted || !this.ctx) return;
    delay = delay || 0;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t0 + dur);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(volume || 0.3, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  noise(dur, volume, delay) {
    if (this.muted || !this.ctx) return;
    delay = delay || 0;
    const bufferSize = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume || 0.2, this.ctx.currentTime + delay);
    gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + delay + dur);
    src.connect(gain);
    gain.connect(this.sfxGain);
    src.start(this.ctx.currentTime + delay);
  }

  shoot() { this.tone(880, 0.08, 'square', 0.15, 600); }
  impact() { this.tone(200, 0.08, 'square', 0.18, 80); }
  explosion() { this.noise(0.35, 0.3); this.tone(90, 0.3, 'sawtooth', 0.2, 40); }
  xpPickup() { this.tone(1200, 0.06, 'sine', 0.12, 1600); }
  levelUp() {
    this.tone(523, 0.12, 'sine', 0.25, 0, 0);
    this.tone(659, 0.12, 'sine', 0.25, 0, 0.1);
    this.tone(784, 0.2, 'sine', 0.28, 0, 0.2);
  }
  uiClick() { this.tone(400, 0.05, 'square', 0.12, 500); }
  bossRoar() { this.tone(80, 0.6, 'sawtooth', 0.3, 50); this.noise(0.5, 0.2, 0.05); }
  gameOver() { this.tone(300, 0.3, 'sawtooth', 0.25, 100); this.tone(200, 0.4, 'sawtooth', 0.25, 60, 0.25); }
  crit() { this.tone(1500, 0.1, 'square', 0.2, 2200); }
}

const audioEngine = new AudioEngine();
