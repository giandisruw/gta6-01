// Sound, all synthesized with WebAudio — no audio files, no network. Engine hum, sirens,
// gunshots, pickups, mission jingles and a laid-back sun-soaked music loop.
export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let musicTimer = null;
  let muted = false;
  let started = false;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      return true;
    } catch {
      return false;
    }
  }

  /** Call from the first user gesture; browsers block audio before one. */
  function unlock() {
    if (!ensure()) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    if (started) return;
    started = true;
    startEngine();
    startMusic();
  }

  function startEngine() {
    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 55;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    engineOsc.connect(filter);
    filter.connect(engineGain);
    engineGain.connect(master);
    engineOsc.start();
  }

  /** Engine pitch follows speed; call every frame with 0..1. */
  function engine(speedRatio, driving) {
    if (!ctx || !engineOsc) return;
    const target = driving ? 0.05 + speedRatio * 0.09 : 0.0;
    engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.1);
    engineOsc.frequency.setTargetAtTime(50 + speedRatio * 130, ctx.currentTime, 0.1);
  }

  function blip(freq, dur, type, vol, slideTo) {
    if (!ctx || muted) return;
    try {
      const o = ctx.createOscillator();
      o.type = type || 'sine';
      o.frequency.value = freq;
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
      const g = ctx.createGain();
      g.gain.value = vol || 0.2;
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      o.connect(g);
      g.connect(master);
      o.start();
      o.stop(ctx.currentTime + dur);
    } catch { /* audio is best-effort */ }
  }

  function noise(dur, vol, filterFreq) {
    if (!ctx || muted) return;
    try {
      const len = Math.floor(ctx.sampleRate * dur);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = filterFreq || 1200;
      const g = ctx.createGain();
      g.gain.value = vol || 0.3;
      src.connect(f);
      f.connect(g);
      g.connect(master);
      src.start();
    } catch { /* best-effort */ }
  }

  // A simple two-bar chord loop: Am7 — Fmaj7 — Cmaj7 — G, one soft pad note per beat.
  const CHORDS = [[220, 261.6, 329.6], [174.6, 220, 261.6], [196, 246.9, 293.7], [164.8, 196, 246.9]];
  let beat = 0;
  function startMusic() {
    if (musicTimer !== null) return;
    musicTimer = window.setInterval(() => {
      if (muted || !ctx) return;
      const chord = CHORDS[Math.floor(beat / 4) % CHORDS.length];
      const root = chord[beat % chord.length];
      blip(root / 2, 0.9, 'triangle', 0.05);
      if (beat % 8 === 4) blip(root, 0.3, 'sine', 0.04);
      beat += 1;
    }, 420);
  }

  function siren(on) {
    if (!ctx || muted) return;
    if (on && !siren.osc) {
      siren.osc = ctx.createOscillator();
      siren.osc.type = 'sine';
      siren.osc.frequency.value = 750;
      const g = ctx.createGain();
      g.gain.value = 0.045;
      siren.osc.connect(g);
      g.connect(master);
      siren.osc.start();
      siren.lfo = ctx.createOscillator();
      siren.lfo.frequency.value = 0.6;
      const lg = ctx.createGain();
      lg.gain.value = 220;
      siren.lfo.connect(lg);
      lg.connect(siren.osc.frequency);
      siren.lfo.start();
      siren.gain = g;
    } else if (!on && siren.osc) {
      try { siren.osc.stop(); siren.lfo.stop(); } catch { /* already stopped */ }
      siren.osc = null;
      siren.lfo = null;
    }
  }

  return {
    unlock,
    engine,
    shoot() { noise(0.14, 0.4, 2400); blip(160, 0.08, 'square', 0.15, 60); },
    punch() { noise(0.08, 0.25, 900); },
    crash() { noise(0.3, 0.5, 700); },
    pickup() { blip(660, 0.12, 'sine', 0.22); window.setTimeout(() => blip(990, 0.18, 'sine', 0.22), 90); },
    cash() { blip(880, 0.1, 'triangle', 0.2); window.setTimeout(() => blip(1320, 0.22, 'triangle', 0.2), 100); },
    mission() { [523, 659, 784, 1047].forEach((f, i) => window.setTimeout(() => blip(f, 0.25, 'triangle', 0.22), i * 110)); },
    fail() { blip(220, 0.4, 'sawtooth', 0.15, 110); },
    click() { blip(440, 0.06, 'sine', 0.15); },
    siren,
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      if (!muted) siren(false);
      return muted;
    },
    isMuted() { return muted; },
  };
}
