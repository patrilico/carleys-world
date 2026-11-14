import type { SfxId } from '../core/EventBus';
import { clamp, clamp01 } from '../core/math';
import type { Simulation } from '../sim/Simulation';
import { DEFAULT_SETTINGS, type Settings } from './SaveSystem';

type Channel = 'ambience' | 'sfx' | 'voice' | 'music';

const VOICE_IDS: SfxId[] = ['surprise', 'happy', 'laugh', 'giggle', 'sad', 'irritated', 'ouch', 'sigh', 'yawn', 'hum'];

/**
 * Procedural WebAudio: no asset files. Ambience layers (outdoor, indoor, rain, mosquito) follow the simulation;
 * short synthesized effects and non-verbal vocalizations play on events. Starts only after a user gesture.
 */
export class AudioSystem {
  settings: Settings = { ...DEFAULT_SETTINGS };
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private chan = {} as Record<Channel, GainNode>;
  private noise!: AudioBuffer;
  private outdoorGain!: GainNode;
  private indoorGain!: GainNode;
  private rainGain!: GainNode;
  private rainFilter!: BiquadFilterNode;
  private buzzGain!: GainNode;
  private buzzOsc!: OscillatorNode;
  private nextBird = 2;
  private nextTick = 0;
  private lastSfx = new Map<SfxId, number>();
  private unlocked = false;
  private outdoorMix = 0;
  private sim: Simulation | null = null;
  private clockT = 0;
  private dropAcc = 0;

  /** Call once; audio starts on the first user gesture (autoplay policy). */
  attach(sim: Simulation, settings: Settings): void {
    this.sim = sim;
    this.settings = { ...settings };
    const unlock = (): void => {
      this.ensure();
      this.ctx?.resume().catch(() => {});
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) this.ctx.suspend().catch(() => {});
      else if (this.unlocked) this.ctx.resume().catch(() => {});
    });
    sim.bus.on('sfx', (e) => this.play(e.id, e.volume ?? 1));
  }

  get ready(): boolean {
    return !!this.ctx && this.unlocked;
  }

  setSettings(s: Settings): void {
    this.settings = { ...s };
    this.applyVolumes();
  }

  private ensure(): void {
    if (this.ctx) return;
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
    } catch {
      return;
    }
    const ctx = this.ctx;
    this.unlocked = true;
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    for (const c of ['ambience', 'sfx', 'voice', 'music'] as Channel[]) {
      this.chan[c] = ctx.createGain();
      this.chan[c].connect(this.master);
    }
    this.applyVolumes();
    // shared noise buffer
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.buildAmbience();
  }

  private applyVolumes(): void {
    if (!this.ctx) return;
    const s = this.settings;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(s.muted ? 0 : s.master, t, 0.05);
    this.chan.ambience.gain.setTargetAtTime(s.ambience, t, 0.05);
    this.chan.sfx.gain.setTargetAtTime(s.sfx, t, 0.05);
    this.chan.voice.gain.setTargetAtTime(s.voice, t, 0.05);
    this.chan.music.gain.setTargetAtTime(s.music * 0.5, t, 0.2);
  }

  private loopNoise(): AudioBufferSourceNode {
    const src = this.ctx!.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    return src;
  }

  private buildAmbience(): void {
    const ctx = this.ctx!;
    // outdoor: soft wind bed
    const wind = this.loopNoise();
    const wf = ctx.createBiquadFilter();
    wf.type = 'lowpass';
    wf.frequency.value = 650;
    this.outdoorGain = ctx.createGain();
    this.outdoorGain.gain.value = 0;
    wind.connect(wf).connect(this.outdoorGain).connect(this.chan.ambience);
    wind.start();
    // indoor: warm hum
    this.indoorGain = ctx.createGain();
    this.indoorGain.gain.value = 0;
    for (const f of [110, 164.8, 220.5]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = 0.02;
      o.connect(g).connect(this.indoorGain);
      o.start();
    }
    this.indoorGain.connect(this.chan.ambience);
    // rain
    const rain = this.loopNoise();
    this.rainFilter = ctx.createBiquadFilter();
    this.rainFilter.type = 'lowpass';
    this.rainFilter.frequency.value = 5000;
    const rainHp = ctx.createBiquadFilter();
    rainHp.type = 'highpass';
    rainHp.frequency.value = 500;
    this.rainGain = ctx.createGain();
    this.rainGain.gain.value = 0;
    rain.connect(rainHp).connect(this.rainFilter).connect(this.rainGain).connect(this.chan.ambience);
    rain.start();
    // mosquito buzz
    this.buzzOsc = ctx.createOscillator();
    this.buzzOsc.type = 'sawtooth';
    this.buzzOsc.frequency.value = 420;
    const vib = ctx.createOscillator();
    vib.frequency.value = 11;
    const vibG = ctx.createGain();
    vibG.gain.value = 40;
    vib.connect(vibG).connect(this.buzzOsc.frequency);
    const bf = ctx.createBiquadFilter();
    bf.type = 'bandpass';
    bf.frequency.value = 900;
    bf.Q.value = 1.2;
    this.buzzGain = ctx.createGain();
    this.buzzGain.gain.value = 0;
    this.buzzOsc.connect(bf).connect(this.buzzGain).connect(this.chan.sfx);
    this.buzzOsc.start();
    vib.start();
  }

  /** Per-frame ambience mix following the simulation. */
  update(dt: number): void {
    const ctx = this.ctx;
    const sim = this.sim;
    if (!ctx || !sim || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    const x = sim.agent.x;
    this.outdoorMix = clamp01((x - 470) / 90);
    const out = this.outdoorMix;
    const day = sim.clock.daylight;
    const wind = sim.weather.windStrength;
    // when indoors the outside is still faintly audible (through the walls)
    const outdoorLevel = (0.5 + wind * 0.5) * (0.04 + 0.07 * out + 0.03 * wind) * (0.5 + 0.5 * day);
    this.outdoorGain.gain.setTargetAtTime(outdoorLevel, t, 0.3);
    this.indoorGain.gain.setTargetAtTime((1 - out) * 0.8 + 0.12, t, 0.5);
    const rain = sim.weather.rain;
    this.rainGain.gain.setTargetAtTime(rain * (0.16 + 0.3 * out), t, 0.25);
    this.rainFilter.frequency.setTargetAtTime(1100 + out * 5500, t, 0.2);
    // individual drops pattering (muffled roof drumming indoors)
    if (rain > 0.05) {
      this.dropAcc += dt * rain * (30 + 30 * out);
      while (this.dropAcc >= 1) {
        this.dropAcc -= 1;
        const f = out > 0.5 ? 2500 + Math.random() * 4500 : 600 + Math.random() * 700;
        this.noiseBurst('ambience', 0.03 + Math.random() * 0.03, (0.05 + 0.05 * Math.random()) * (out > 0.5 ? 1 : 0.7), f, 3, out > 0.5 ? 'bandpass' : 'lowpass');
      }
    }

    // mosquito buzz follows the closest live mosquito (only audible when outdoors / nearby)
    let nearest = 9999;
    for (const m of sim.mosquitoes) {
      if (m.state === 'dying') continue;
      const d = Math.hypot(m.x - x, m.y - (sim.agent.y - 70));
      nearest = Math.min(nearest, d);
    }
    const buzz = nearest < 420 ? clamp01(1 - nearest / 420) * (0.25 + 0.75 * out) * 0.09 : 0;
    this.buzzGain.gain.setTargetAtTime(buzz, t, 0.08);
    this.buzzOsc.frequency.setTargetAtTime(400 + Math.min(120, 200 - nearest * 0.2), t, 0.1);

    // birds by day outdoors; clock tick indoors
    this.clockT += dt;
    if (this.clockT >= this.nextBird && day > 0.45 && out > 0.1 && !sim.weather.raining) {
      this.nextBird = this.clockT + 3 + Math.random() * 7;
      this.birdSong(0.04 + 0.05 * out);
    }
    this.music(dt);
  }

  // ------------------------------------------------------------------ synthesized sounds

  private env(g: GainNode, t: number, a: number, d: number, peak: number): void {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  private tone(chan: Channel, freq: number, dur: number, vol: number, type: OscillatorType = 'sine', slideTo?: number, vibrato = 0, delay = 0): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    const g = ctx.createGain();
    this.env(g, t, Math.min(0.02, dur * 0.2), dur, vol);
    o.connect(g).connect(this.chan[chan]);
    if (vibrato > 0) {
      const l = ctx.createOscillator();
      l.frequency.value = 6;
      const lg = ctx.createGain();
      lg.gain.value = vibrato;
      l.connect(lg).connect(o.frequency);
      l.start(t);
      l.stop(t + dur + 0.1);
    }
    o.start(t);
    o.stop(t + dur + 0.15);
  }

  private noiseBurst(chan: Channel, dur: number, vol: number, freq: number, q = 1, type: BiquadFilterType = 'bandpass', delay = 0, sweepTo?: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    this.env(g, t, Math.min(0.03, dur * 0.3), dur, vol);
    s.connect(f).connect(g).connect(this.chan[chan]);
    s.start(t, Math.random());
    s.stop(t + dur + 0.1);
  }

  /** Cute vowel-like voice: sawtooth through two formant filters, with pitch slide and vibrato. */
  private voice(freq: number, dur: number, vol: number, vowel: 'ah' | 'eh' | 'oh' | 'oo' | 'ee' | 'mm', slideTo?: number, vibrato = 0, delay = 0): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const F: Record<string, [number, number]> = { ah: [850, 1350], eh: [600, 1900], oh: [500, 900], oo: [330, 800], ee: [300, 2500], mm: [250, 1100] };
    const [f1, f2] = F[vowel];
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(60, slideTo), t + dur);
    const out = ctx.createGain();
    this.env(out, t, Math.min(0.03, dur * 0.25), dur, vol);
    for (const [f, q, gain] of [[f1, 5, 1], [f2, 6, 0.55]] as [number, number, number][]) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = f;
      bp.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = gain * 2.2;
      o.connect(bp).connect(g).connect(out);
    }
    out.connect(this.chan.voice);
    if (vibrato > 0) {
      const l = ctx.createOscillator();
      l.frequency.value = 6.5;
      const lg = ctx.createGain();
      lg.gain.value = vibrato;
      l.connect(lg).connect(o.frequency);
      l.start(t);
      l.stop(t + dur + 0.1);
    }
    o.start(t);
    o.stop(t + dur + 0.15);
  }

  // ---- soft generative background music: music-box melody over a warm pad ----
  private musicNext = 0;
  private musicStep = 0;
  private musicBus: GainNode | null = null;
  private static readonly CHORDS: { pad: number[]; tones: number[] }[] = [
    { pad: [261.6, 329.6, 392], tones: [523.3, 659.3, 784, 1046.5] },
    { pad: [220, 261.6, 329.6], tones: [440, 523.3, 659.3, 880] },
    { pad: [174.6, 220, 261.6], tones: [440, 523.3, 698.5, 880] },
    { pad: [196, 246.9, 293.7], tones: [392, 493.9, 587.3, 784] }
  ];

  private ensureMusicBus(): GainNode {
    if (this.musicBus) return this.musicBus;
    const ctx = this.ctx!;
    const bus = ctx.createGain();
    bus.gain.value = 1;
    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0.34;
    const fb = ctx.createGain();
    fb.gain.value = 0.32;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2400;
    bus.connect(this.chan.music);
    bus.connect(delay);
    delay.connect(lp).connect(fb).connect(delay);
    lp.connect(this.chan.music);
    this.musicBus = bus;
    return bus;
  }

  private musicNote(freq: number, t: number, dur: number, vol: number, kind: 'pluck' | 'pad'): void {
    const ctx = this.ctx!;
    const bus = this.ensureMusicBus();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    if (kind === 'pluck') {
      o.type = 'sine';
      o.frequency.value = freq;
      const o2 = ctx.createOscillator();
      o2.type = 'sine';
      o2.frequency.value = freq * 2.01;
      const g2 = ctx.createGain();
      g2.gain.value = 0.22;
      o2.connect(g2).connect(g);
      o2.start(t);
      o2.stop(t + dur + 0.1);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    } else {
      o.type = 'triangle';
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vol, t + dur * 0.35);
      g.gain.linearRampToValueAtTime(0.0001, t + dur);
    }
    o.connect(g).connect(bus);
    o.start(t);
    o.stop(t + dur + 0.1);
  }

  private music(_dt: number): void {
    const ctx = this.ctx;
    const sim = this.sim;
    if (!ctx || !sim || ctx.state !== 'running' || this.settings.music <= 0) return;
    if (this.musicNext < ctx.currentTime) this.musicNext = ctx.currentTime + 0.5;
    const night = 1 - sim.clock.daylight;
    const beat = 60 / (78 - night * 14);
    while (this.musicNext < ctx.currentTime + 0.4) {
      const step = this.musicStep++;
      const chord = AudioSystem.CHORDS[Math.floor(step / 4) % 4];
      const t = this.musicNext;
      if (step % 4 === 0) {
        for (const f of chord.pad) this.musicNote(f, t, beat * 4.2, 0.03, 'pad');
        this.musicNote(chord.pad[0] / 2, t, beat * 1.6, 0.05, 'pluck');
      }
      if (Math.random() < 0.72) {
        const f = chord.tones[Math.floor(Math.random() * chord.tones.length)];
        this.musicNote(f, t + (Math.random() < 0.3 ? beat * 0.5 : 0), beat * 1.5, 0.05, 'pluck');
      }
      this.musicNext += beat;
    }
  }

  private birdSong(vol: number): void {
    const n = 2 + Math.floor(Math.random() * 3);
    const base = 1500 + Math.random() * 900;
    for (let i = 0; i < n; i++) {
      this.tone('ambience', base + i * 90, 0.1, vol * 0.6, 'sine', base * (1.15 + Math.random() * 0.25), 10, i * 0.15);
    }
  }

  private tick(vol: number): void {
    this.noiseBurst('ambience', 0.025, vol, 2200, 4, 'bandpass');
  }

  /** Throttled per-sound so rapid repeats (footsteps) stay pleasant. */
  play(id: SfxId, volume = 1): void {
    if (!this.ctx || !this.unlocked || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const gap = id === 'footstep' ? 0.16 : id === 'sparkle' ? 0.05 : 0.12;
    if (now - (this.lastSfx.get(id) ?? -1) < gap) return;
    this.lastSfx.set(id, now);
    const v = volume;
    const ch: Channel = VOICE_IDS.includes(id) ? 'voice' : 'sfx';
    void ch;
    const indoors = (this.sim?.agent.x ?? 0) < 512;
    switch (id) {
      case 'footstep':
        this.noiseBurst('sfx', 0.07, 0.07 * v, indoors ? 500 : 300, 0.8, 'lowpass');
        this.tone('sfx', indoors ? 110 : 80, 0.06, 0.05 * v, 'sine', 60);
        break;
      case 'water': this.noiseBurst('sfx', 3.4, 0.07, 2200, 0.7, 'bandpass', 0, 1800); break;
      case 'page': this.noiseBurst('sfx', 0.28, 0.07, 2800, 0.9, 'bandpass', 0, 1200); break;
      case 'surprise': this.voice(520, 0.16, 0.16, 'eh', 900); this.voice(900, 0.12, 0.1, 'ah', 700, 0, 0.14); break;
      case 'happy': this.voice(640, 0.14, 0.15, 'ah', 760, 8); this.voice(860, 0.26, 0.15, 'ee', 940, 12, 0.14); break;
      case 'laugh':
        for (let i = 0; i < 5; i++) this.voice(780 - i * 30, 0.09, 0.14, 'ah', 650 - i * 30, 0, i * 0.12);
        break;
      case 'giggle':
        for (let i = 0; i < 3; i++) this.voice(900 - i * 40, 0.07, 0.13, 'eh', 760 - i * 40, 0, i * 0.1);
        break;
      case 'hum': this.voice(440, 0.4, 0.12, 'mm', 466, 7); this.voice(523, 0.4, 0.12, 'mm', 554, 7, 0.45); this.voice(494, 0.55, 0.12, 'mm', 440, 7, 0.9); break;
      case 'sad': this.voice(560, 0.6, 0.14, 'oh', 340, 14); break;
      case 'irritated': this.noiseBurst('voice', 0.2, 0.06, 900, 1, 'lowpass'); this.voice(300, 0.22, 0.14, 'oh', 200); break;
      case 'ouch': this.voice(820, 0.2, 0.18, 'ah', 420); this.voice(560, 0.2, 0.12, 'oh', 330, 0, 0.12); break;
      case 'sigh': this.noiseBurst('voice', 0.9, 0.05, 1500, 0.6, 'lowpass', 0, 500); this.voice(480, 0.8, 0.07, 'ah', 320, 6); break;
      case 'yawn': this.voice(340, 0.8, 0.1, 'ah', 560, 8); this.voice(560, 0.6, 0.09, 'oh', 260, 8, 0.8); break;
      case 'heal':
        [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone('sfx', f, 0.5, 0.07, 'sine', undefined, 5, i * 0.1));
        this.noiseBurst('sfx', 0.9, 0.03, 6000, 2, 'highpass');
        break;
      case 'magic':
      case 'sparkle':
        for (let i = 0; i < 6; i++) this.tone('sfx', 880 + Math.random() * 1500, 0.28, 0.05, 'sine', undefined, 0, i * 0.06);
        break;
      case 'bloom': this.tone('sfx', 988, 0.25, 0.07, 'sine'); this.tone('sfx', 1319, 0.3, 0.06, 'sine', undefined, 0, 0.1); break;
      case 'gulp':
        for (let i = 0; i < 5; i++) this.tone('sfx', 190 - i * 8, 0.09, 0.12, 'sine', 110, 0, i * 0.5);
        break;
      case 'swat': this.noiseBurst('sfx', 0.08, 0.16 * v, 1800, 0.8, 'bandpass'); this.tone('sfx', 150, 0.06, 0.07, 'sine', 90); break;
      case 'splash': this.noiseBurst('sfx', 0.18, 0.06, 2600, 1, 'highpass'); break;
      case 'wind': this.noiseBurst('sfx', 1.2, 0.08, 500, 0.7, 'bandpass', 0, 2200); break;
      case 'pop': this.tone('sfx', 820, 0.07, 0.12, 'sine', 180); break;
      case 'thud': this.tone('sfx', 90, 0.2, 0.2, 'sine', 45); this.noiseBurst('sfx', 0.1, 0.08, 300, 1, 'lowpass'); break;
      case 'chirp': this.birdSong(0.05); break;
      case 'brush': this.noiseBurst('sfx', 0.15, 0.03, 3000, 1, 'bandpass'); break;
      case 'phone':
        for (let i = 0; i < 3; i++) this.tone('sfx', 1000 + (i % 2) * 90, 0.12, 0.05, 'sine', undefined, 0, i * 0.18);
        break;
    }
  }

  /** Simple UI click used by the toolbar. */
  click(): void {
    this.tone('sfx', 700, 0.06, 0.07, 'sine', 1000);
  }

  destroy(): void {
    this.ctx?.close().catch(() => {});
  }
}

export { clamp };
