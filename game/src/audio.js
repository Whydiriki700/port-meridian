// Procedural sound for Port Meridian: every effect and the harbour pad loop are
// synthesised with WebAudio, so the game ships no audio files and stays offline.

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.master = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.musicTimer = 0;
    this.chordStep = 0;
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      this.startEngine();
      this.startSiren();
    } catch (err) {
      this.ctx = null;
    }
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.5, this.ctx.currentTime, 0.05);
    }
  }

  tone(freq, dur, type, vol, slideTo) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  noise(dur, vol, lowFreq) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = lowFreq || 1800;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t);
  }

  gunshot() {
    this.noise(0.16, 0.5, 2600);
    this.tone(140, 0.1, 'square', 0.18, 50);
  }

  punch() {
    this.noise(0.08, 0.3, 700);
    this.tone(90, 0.09, 'sine', 0.3, 45);
  }

  pickup() {
    this.tone(660, 0.09, 'triangle', 0.25);
    setTimeout(() => this.tone(990, 0.14, 'triangle', 0.25), 70);
  }

  cash() {
    this.tone(880, 0.07, 'square', 0.12);
    setTimeout(() => this.tone(1320, 0.12, 'square', 0.12), 60);
  }

  crash(intensity) {
    this.noise(0.25, Math.min(0.6, 0.2 + intensity * 0.4), 900);
    this.tone(70, 0.22, 'sawtooth', 0.2, 35);
  }

  doorSlam() {
    this.noise(0.06, 0.25, 500);
    this.tone(120, 0.08, 'sine', 0.2, 60);
  }

  glassBreak() {
    this.noise(0.2, 0.3, 5200);
    this.tone(2100, 0.12, 'triangle', 0.1, 900);
  }

  missionSting(success) {
    if (!this.ctx) return;
    const notes = success ? [523, 659, 784, 1046] : [392, 330, 262];
    notes.forEach((n, i) => setTimeout(() => this.tone(n, 0.22, 'triangle', 0.22), i * 110));
  }

  startEngine() {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.value = 40;
    gain.gain.value = 0;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    osc.start();
    this.engineOsc = osc;
    this.engineGain = gain;
  }

  setEngine(speedRatio, driving) {
    if (!this.ctx || !this.engineOsc) return;
    const t = this.ctx.currentTime;
    const target = driving ? 0.05 + speedRatio * 0.05 : 0;
    this.engineOsc.frequency.setTargetAtTime(42 + speedRatio * 95, t, 0.08);
    this.engineGain.gain.setTargetAtTime(this.muted ? 0 : target, t, 0.1);
  }

  startSiren() {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = 700;
    gain.gain.value = 0;
    osc.connect(gain);
    gain.connect(this.master);
    osc.start();
    this.sirenOsc = osc;
    this.sirenGain = gain;
  }

  setSiren(active, time) {
    if (!this.ctx || !this.sirenOsc) return;
    const t = this.ctx.currentTime;
    if (active) {
      this.sirenOsc.frequency.setTargetAtTime(650 + Math.sin(time * 5.2) * 190, t, 0.03);
      this.sirenGain.gain.setTargetAtTime(this.muted ? 0 : 0.028, t, 0.1);
    } else {
      this.sirenGain.gain.setTargetAtTime(0, t, 0.1);
    }
  }

  // Slow harbour pad: a four-chord loop played on soft triangles.
  updateMusic(dt) {
    if (!this.ctx || this.muted) return;
    this.musicTimer -= dt;
    if (this.musicTimer > 0) return;
    this.musicTimer = 3.6;
    const chords = [
      [220, 261.6, 329.6],
      [174.6, 220, 261.6],
      [196, 246.9, 293.7],
      [164.8, 196, 246.9],
    ];
    const chord = chords[this.chordStep % chords.length];
    this.chordStep += 1;
    for (const freq of chord) this.tone(freq, 3.4, 'triangle', 0.035);
    this.tone(chord[0] / 2, 3.4, 'sine', 0.04);
  }
}
