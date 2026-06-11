/** WebAudio bus: procedural SFX + baked clips + music zones. iOS-safe unlock. */

export class AudioBus {
  ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private clips = new Map<string, AudioBuffer>();
  private musicSource: AudioBufferSourceNode | null = null;
  private currentMusic = "";
  private unlocked = false;

  constructor() {
    const unlock = () => {
      if (this.unlocked) return;
      this.unlocked = true;
      this.ctx = new (window.AudioContext ||
        (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext!)();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.8;
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.45;
      this.musicGain.connect(this.master);
      this.ctx.resume();
      window.dispatchEvent(new Event("audio-unlocked"));
    };
    for (const ev of ["pointerdown", "keydown", "touchstart"]) {
      window.addEventListener(ev, unlock, { once: false, passive: true });
    }
  }

  async load(name: string, url: string) {
    const res = await fetch(url);
    const buf = await res.arrayBuffer();
    const tryDecode = () => {
      if (!this.ctx) return;
      this.ctx.decodeAudioData(buf.slice(0)).then((d) => this.clips.set(name, d));
    };
    if (this.ctx) tryDecode();
    else window.addEventListener("audio-unlocked", tryDecode, { once: true });
  }

  playClip(name: string, volume = 1, rate = 1) {
    if (!this.ctx || !this.master) return;
    const buf = this.clips.get(name);
    if (!buf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = this.ctx.createGain();
    g.gain.value = volume;
    src.connect(g).connect(this.master);
    src.start();
  }

  /** loop music clip with 2s crossfade between zones */
  playMusic(name: string) {
    if (!this.ctx || !this.musicGain || this.currentMusic === name) return;
    const buf = this.clips.get(name);
    if (!buf) return;
    this.currentMusic = name;
    const old = this.musicSource;
    const oldGain = this.musicGain;
    if (old) {
      oldGain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 2);
      setTimeout(() => old.stop(), 2100);
    }
    const g = this.ctx.createGain();
    g.gain.value = 0;
    g.gain.linearRampToValueAtTime(0.45, this.ctx.currentTime + 2);
    g.connect(this.master!);
    this.musicGain = g;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.connect(g);
    src.start();
    this.musicSource = src;
  }

  // ---------- procedural SFX ----------
  private blip(freq: number, dur: number, type: OscillatorType, vol: number, sweep = 1) {
    if (!this.ctx || !this.master) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * sweep), this.ctx.currentTime + dur);
    g.gain.value = vol;
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
    o.connect(g).connect(this.master);
    o.start();
    o.stop(this.ctx.currentTime + dur);
  }

  private noise(dur: number, vol: number, lowpass = 2000) {
    if (!this.ctx || !this.master) return;
    const n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = lowpass;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(f).connect(g).connect(this.master);
    src.start();
  }

  coin() {
    this.blip(1100 + Math.random() * 250, 0.12, "square", 0.12, 1.4);
  }
  jump() {
    this.blip(300, 0.18, "sine", 0.2, 2.2);
  }
  hit() {
    this.noise(0.12, 0.4, 1200);
    this.blip(160, 0.1, "sawtooth", 0.2, 0.6);
  }
  clink() {
    this.blip(2200, 0.08, "triangle", 0.18, 0.9);
  }
  hurt() {
    this.blip(220, 0.25, "sawtooth", 0.3, 0.4);
  }
  shockwave() {
    this.noise(0.7, 0.7, 500);
    this.blip(80, 0.6, "sine", 0.5, 0.3);
  }
  pickup() {
    this.blip(660, 0.1, "sine", 0.2, 1.5);
    setTimeout(() => this.blip(990, 0.15, "sine", 0.2, 1.2), 90);
  }
  splash() {
    this.noise(0.4, 0.35, 900);
  }
}
