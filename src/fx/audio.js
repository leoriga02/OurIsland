// Tiny procedural sound engine (WebAudio): ambience + interaction sounds, no assets needed.
export class Audio {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  unlock() {
    if (this.ctx) { this.ctx.resume?.(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.7;
    this.master.connect(this.ctx.destination);
    // noise buffer
    const len = this.ctx.sampleRate * 2;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this._ambience();
  }

  _ambience() {
    const c = this.ctx;
    // ocean surf: filtered noise with slow swell
    const src = c.createBufferSource(); src.buffer = this.noise; src.loop = true;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520;
    const g = c.createGain(); g.gain.value = 0.0;
    src.connect(lp); lp.connect(g); g.connect(this.master);
    src.start();
    this.surf = g;
    const lfo = c.createOscillator(); lfo.frequency.value = 0.11;
    const lg = c.createGain(); lg.gain.value = 0.05;
    lfo.connect(lg); lg.connect(g.gain); lfo.start();
    // wind
    const s2 = c.createBufferSource(); s2.buffer = this.noise; s2.loop = true; s2.playbackRate.value = 0.5;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 800; bp.Q.value = 0.6;
    const g2 = c.createGain(); g2.gain.value = 0.018;
    s2.connect(bp); bp.connect(g2); g2.connect(this.master); s2.start();
    this.nextBird = 2;
    this.nextCricket = 0;
    // soft music bus with an echo
    this.musicBus = c.createGain(); this.musicBus.gain.value = 0.055;
    const delay = c.createDelay(1); delay.delayTime.value = 0.42;
    const fb = c.createGain(); fb.gain.value = 0.38;
    const lpf = c.createBiquadFilter(); lpf.type = 'lowpass'; lpf.frequency.value = 2200;
    this.musicBus.connect(this.master);
    this.musicBus.connect(delay); delay.connect(lpf); lpf.connect(fb); fb.connect(delay); lpf.connect(this.master);
    this.nextNote = 3; this.phrase = 0; this.chord = 0;
  }

  _note(freq, when, vol = 1, dur = 1.6) {
    const c = this.ctx;
    for (const [mul, v] of [[1, 1], [2.01, 0.25], [4.0, 0.06]]) {
      const o = c.createOscillator(); o.type = 'sine';
      o.frequency.value = freq * mul;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(vol * v, when + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, when + dur / mul);
      o.connect(g); g.connect(this.musicBus);
      o.start(when); o.stop(when + dur + 0.1);
    }
  }

  _music(dt, night) {
    this.nextNote -= dt;
    if (this.nextNote > 0) return;
    const scale = night > 0.5 ? [220, 246.9, 293.7, 329.6, 392, 440] : [261.6, 293.7, 329.6, 392, 440, 523.3, 587.3];
    const t = this.ctx.currentTime + 0.05;
    this.phrase++;
    if (this.phrase % 9 === 0) { this.nextNote = 4 + Math.random() * 5; this.chord = (this.chord + 1) % 3; return; }
    const root = [0, 3, 1][this.chord];
    const i = Math.min(scale.length - 1, root + Math.floor(Math.random() * 4));
    this._note(scale[i], t, night > 0.5 ? 0.6 : 0.8);
    if (Math.random() < 0.3) this._note(scale[Math.max(0, i - 2)] / 2, t, 0.5, 2.4);
    this.nextNote = [0.45, 0.9, 0.9, 1.35][Math.floor(Math.random() * 4)];
  }

  update(dt, { coastDist = 0, night = 0, underCover = false } = {}) {
    if (!this.ctx) return;
    const near = Math.max(0, 1 - Math.max(0, coastDist) / 70);
    this.surf.gain.setTargetAtTime(0.03 + near * 0.11, this.ctx.currentTime, 0.5);
    this._music(dt, night);
    this.nextBird -= dt;
    if (this.nextBird < 0) {
      this.nextBird = 2 + Math.random() * 6;
      if (night < 0.5) this.bird(); else this.cricket();
    }
  }

  env(g, t0, a, d, peak) {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
  }

  tone(freq, dur, type = 'sine', vol = 0.2, slide = 0, delay = 0) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    const g = c.createGain();
    this.env(g, t, 0.005, dur, vol);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  hit(freq = 400, dur = 0.15, vol = 0.4, q = 1, type = 'bandpass') {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const s = c.createBufferSource(); s.buffer = this.noise;
    s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain();
    this.env(g, t, 0.003, dur, vol);
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }

  chop() { this.hit(700 + Math.random() * 200, 0.12, 0.5, 2); this.tone(160, 0.12, 'triangle', 0.25, -60); }
  mine() { this.hit(2500, 0.09, 0.35, 4); this.tone(900 + Math.random() * 300, 0.18, 'square', 0.05, -200); this.tone(320, 0.1, 'triangle', 0.2, -100); }
  swing() { this.hit(1200, 0.12, 0.08, 0.5, 'highpass'); }
  treeFall() { this.hit(250, 0.9, 0.5, 0.7, 'lowpass'); this.tone(90, 0.8, 'sine', 0.3, -40, 0.2); this.hit(180, 0.5, 0.6, 0.7, 'lowpass'); }
  pickup() { this.tone(660, 0.08, 'sine', 0.15, 200); this.tone(990, 0.1, 'sine', 0.1, 200, 0.05); }
  rustle() { this.hit(3000, 0.25, 0.15, 0.4, 'highpass'); }
  craft() { [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.25, 'triangle', 0.12, 0, i * 0.07)); }
  build() { this.hit(300, 0.2, 0.6, 1.2); this.tone(110, 0.25, 'triangle', 0.35, -30); this.hit(900, 0.08, 0.3, 3); }
  eat() { for (let i = 0; i < 3; i++) setTimeout(() => this.hit(1600, 0.06, 0.2, 2), i * 110); }
  drink() { for (let i = 0; i < 3; i++) this.tone(300 + i * 60, 0.12, 'sine', 0.12, 250, i * 0.16); }
  splash() { this.hit(900, 0.35, 0.25, 0.5, 'lowpass'); }
  step(surface) { this.hit(surface === 'sand' ? 1400 : 900, 0.07, 0.06, 0.8, 'lowpass'); }
  error() { this.tone(200, 0.15, 'square', 0.06, -60); }
  quest() { [659, 784, 988, 1318].forEach((f, i) => this.tone(f, 0.35, 'sine', 0.13, 0, i * 0.1)); }
  hurt() { this.tone(220, 0.2, 'sawtooth', 0.08, -120); }
  bird() {
    if (!this.ctx) return;
    const base = 1800 + Math.random() * 1500, n = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) this.tone(base + Math.random() * 400, 0.07, 'sine', 0.03, Math.random() < 0.5 ? 600 : -500, i * 0.11);
  }
  cricket() {
    for (let i = 0; i < 6; i++) this.tone(4200, 0.03, 'square', 0.008, 0, i * 0.06);
  }
}
