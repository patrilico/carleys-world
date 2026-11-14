import Phaser from 'phaser';
import { GAME_CONFIG } from '../config/gameConfig';
import { FLOOR_Y, WORLD_RIGHT_X } from '../config/worldLayout';
import { clamp01 } from '../core/math';
import type { Simulation } from '../sim/Simulation';
import type { CarleyView } from './CarleyView';
import { star4 } from './draw';
import type { GardenView, WeatherView } from './WorldView';

type PKind = 'star' | 'dot' | 'petal' | 'leaf' | 'drop' | 'heart' | 'note' | 'puff' | 'ring';

interface Particle {
  kind: PKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: number;
  g: number;
  rot: number;
  vr: number;
}

const BUTTERFLY_COLORS: [number, number][] = [
  [0xeeb4a4, 0xf7dbd3], [0xacd0f2, 0xdeedfa], [0xf2c878, 0xf9ebc1], [0xa7c2e5, 0xcfdef1], [0x92cb9c, 0xcae9d0]
];

/** Pooled particles, insects, water stream and emotion indicators drawn above the world. */
export class EffectsView {
  private pg: Phaser.GameObjects.Graphics;
  private insectG: Phaser.GameObjects.Graphics;
  private flyG: Phaser.GameObjects.Graphics;
  private indicatorText: Phaser.GameObjects.Text;
  private pool: Particle[] = [];
  private t = 0;
  private indicator: { kind: string; t: number; dur: number } | null = null;
  private waterAcc = 0;
  private noteAcc = 0;
  private indColor = '';

  constructor(
    private scene: Phaser.Scene,
    private sim: Simulation,
    private carley: CarleyView,
    private garden: GardenView,
    private weather: WeatherView
  ) {
    this.insectG = scene.add.graphics().setDepth(45);
    this.flyG = scene.add.graphics().setDepth(46);
    this.pg = scene.add.graphics().setDepth(76);
    this.indicatorText = scene.add
      .text(0, 0, '!', { fontFamily: '"Trebuchet MS", Arial, sans-serif', fontSize: '34px', fontStyle: 'bold', color: '#e3876c', stroke: '#ffffff', strokeThickness: 6 })
      .setOrigin(0.5)
      .setDepth(78)
      .setAlpha(0);
    this.wire();
  }

  private spawn(p: Partial<Particle> & { kind: PKind; x: number; y: number }): void {
    if (this.pool.length >= GAME_CONFIG.limits.maxSparkles) this.pool.shift();
    this.pool.push({ vx: 0, vy: 0, life: 0, max: 1, size: 4, color: 0xffffff, g: 0, rot: 0, vr: 0, ...p });
  }

  burst(x: number, y: number, n: number, colors: number[], kind: PKind = 'star', speed = 90, life = 0.9, gravity = 0): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.35 + Math.random() * 0.8);
      this.spawn({
        kind, x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - speed * 0.2, max: life * (0.7 + Math.random() * 0.6),
        size: 3 + Math.random() * 4, color: colors[i % colors.length], g: gravity, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 6
      });
    }
  }

  private wire(): void {
    const bus = this.sim.bus;
    const sim = this.sim;
    bus.on('effect', (e) => {
      switch (e.kind) {
        case 'sparkles': this.burst(e.x, e.y, 26, [0xffffff, 0xf4d995, 0xf3cdc2, 0xc8e5f6], 'star', 120, 1.1); break;
        case 'heal':
          this.burst(e.x, e.y, 34, [0xf8eab7, 0xffffff, 0xf3cdc2, 0xb5dfbc], 'star', 110, 1.4);
          for (let i = 0; i < 8; i++) this.spawn({ kind: 'heart', x: e.x + (Math.random() - 0.5) * 50, y: e.y + 10, vy: -30 - Math.random() * 30, vx: (Math.random() - 0.5) * 20, max: 1.6, size: 6 + Math.random() * 3, color: 0xebaa97 });
          break;
        case 'bloom': this.burst(e.x, e.y, 24, [0xeeb4a4, 0xf6d9d1, 0xf7e6b0, 0xb1c9e8], 'petal', 90, 1.4, 60); break;
        case 'puff': this.burst(e.x, e.y, 6, [0xffffff, 0xd6dce3], 'puff', 30, 0.5); break;
        case 'gust': this.weather.gust(); this.leaves(10); break;
        case 'splash': this.burst(e.x, e.y, 6, [0xc8e2f6], 'drop', 70, 0.5, 400); break;
        case 'notice': this.indicator = { kind: '!', t: 0, dur: 1 }; break;
        case 'poof': this.burst(e.x, e.y, 8, [0xffffff], 'puff', 40, 0.6); break;
      }
    });
    bus.on('windGust', () => {
      this.weather.gust();
      if (sim.weather.gust > 0.5) this.leaves(8);
    });
    bus.on('plantWatered', ({ index }) => {
      const p = sim.plants[index];
      this.burst(p.x, FLOOR_Y - 40, 6, [0xc8e2f6, 0xffffff], 'drop', 40, 0.7, 200);
    });
    bus.on('playfulDisturbance', ({ kind }) => {
      if (kind.includes('flowerpot')) this.garden.wobblePot();
      this.burst(sim.agent.x, sim.agent.y - 100, 8, [0xf4d995, 0xffffff], 'star', 80, 0.8);
    });
    bus.on('emotionChanged', ({ to }) => {
      if (to === 'surprised') this.indicator = { kind: '!', t: 0, dur: 1.1 };
      else if (to === 'curious') this.indicator = { kind: '?', t: 0, dur: 1.3 };
      else if (to === 'delighted') this.hearts(3);
      else if (to === 'angry') this.indicator = { kind: '#', t: 0, dur: 1.4 };
    });
    bus.on('mosquitoRemoved', ({ cause }) => {
      if (cause === 'swatted') this.burst(sim.agent.x + 30, sim.agent.y - 90, 8, [0xffffff, 0xf4d995], 'star', 70, 0.5);
    });
    bus.on('discovery', () => this.burst(sim.agent.x, sim.agent.y - 110, 14, [0xf4d995, 0xffffff], 'star', 90, 1));
    bus.on('plantBloomed', () => {});
    bus.on('thought', () => {});
  }

  private hearts(n: number): void {
    const h = this.carley.world.head;
    for (let i = 0; i < n; i++) this.spawn({ kind: 'heart', x: h.x + (i - 1) * 14, y: h.y - 40, vy: -26 - Math.random() * 14, vx: (Math.random() - 0.5) * 12, max: 1.3, size: 5 + Math.random() * 2, color: 0xe99f8a });
  }

  private leaves(n: number): void {
    for (let i = 0; i < n; i++) {
      this.spawn({
        kind: 'leaf', x: 1100 + Math.random() * 140, y: 330 + Math.random() * 120, vx: -120 - Math.random() * 100, vy: 10 + Math.random() * 40,
        max: 2.4 + Math.random(), size: 5 + Math.random() * 3, color: [0x84b383, 0xb2d2a4, 0xf1c2b4][i % 3], rot: Math.random() * 6, vr: (Math.random() - 0.5) * 8
      });
    }
  }

  update(dt: number): void {
    this.t += dt;
    const sim = this.sim;
    this.drawInsects();
    this.waterStream(dt);
    this.ambientParticles(dt);
    this.drawParticles(dt);
    this.drawIndicator(dt);
  }

  private waterStream(dt: number): void {
    const sim = this.sim;
    const a = sim.agent;
    if (a.action === 'water' && a.prop === 'wateringCan') {
      this.waterAcc += dt * 70;
      const sp = this.carley.world.spout;
      while (this.waterAcc >= 1) {
        this.waterAcc -= 1;
        this.spawn({ kind: 'drop', x: sp.x, y: sp.y, vx: a.facing * (28 + Math.random() * 30), vy: 20 + Math.random() * 40, max: 1.4, size: 2.4 + Math.random() * 1.2, color: 0xb9ddf4, g: 900 });
      }
    } else this.waterAcc = 0;
  }

  private ambientParticles(dt: number): void {
    const sim = this.sim;
    const a = sim.agent;
    if (a.action === 'hum' || a.action === 'tinyDance') {
      this.noteAcc += dt;
      if (this.noteAcc > 0.7) {
        this.noteAcc = 0;
        const h = this.carley.world.head;
        this.spawn({ kind: 'note', x: h.x + 22, y: h.y - 24, vx: 18, vy: -34, max: 1.6, size: 6, color: [0xe99f8a, 0x91b7ed, 0xefb95d][Math.floor(Math.random() * 3)] });
      }
    }
    // sparkles while a flower is in magical bloom, petals drifting in wind
    if (sim.weather.windStrength > 0.7 && Math.random() < dt * 3) this.leaves(1);
  }

  private drawParticles(dt: number): void {
    const g = this.pg;
    g.clear();
    for (let i = this.pool.length - 1; i >= 0; i--) {
      const p = this.pool[i];
      p.life += dt;
      if (p.life >= p.max) {
        this.pool.splice(i, 1);
        continue;
      }
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      if (p.kind === 'drop' && p.y >= FLOOR_Y - 2) {
        p.life = p.max;
        continue;
      }
      const t = p.life / p.max;
      const a = clamp01(1 - t * t);
      switch (p.kind) {
        case 'star': star4(g, p.x, p.y, p.size * (1 - t * 0.4), p.color, a); break;
        case 'dot': g.fillStyle(p.color, a); g.fillCircle(p.x, p.y, p.size * 0.5); break;
        case 'drop': g.fillStyle(p.color, 0.9 * a); g.fillEllipse(p.x, p.y, p.size, p.size * 1.6); break;
        case 'puff': g.fillStyle(p.color, a * 0.8); g.fillCircle(p.x, p.y, p.size * (0.6 + t * 1.2)); break;
        case 'petal':
        case 'leaf': {
          g.save();
          g.translateCanvas(p.x, p.y);
          g.rotateCanvas(p.rot);
          g.fillStyle(p.color, a);
          g.fillEllipse(0, 0, p.size * 1.8, p.size * 0.9);
          g.restore();
          break;
        }
        case 'heart': {
          const s = p.size;
          g.fillStyle(p.color, a);
          g.fillCircle(p.x - s * 0.5, p.y - s * 0.3, s * 0.6);
          g.fillCircle(p.x + s * 0.5, p.y - s * 0.3, s * 0.6);
          g.fillTriangle(p.x - s * 1.04, p.y - s * 0.05, p.x + s * 1.04, p.y - s * 0.05, p.x, p.y + s * 1.15);
          break;
        }
        case 'note': {
          g.fillStyle(p.color, a);
          g.fillEllipse(p.x, p.y, p.size * 1.3, p.size);
          g.lineStyle(2, p.color, a);
          g.beginPath();
          g.moveTo(p.x + p.size * 0.55, p.y);
          g.lineTo(p.x + p.size * 0.55, p.y - p.size * 2.2);
          g.lineTo(p.x + p.size * 1.4, p.y - p.size * 1.6);
          g.strokePath();
          break;
        }
        default: break;
      }
    }
  }

  private drawIndicator(dt: number): void {
    const txt = this.indicatorText;
    const ind = this.indicator;
    if (!ind) {
      txt.setAlpha(0);
      return;
    }
    ind.t += dt;
    if (ind.t >= ind.dur) {
      this.indicator = null;
      txt.setAlpha(0);
      return;
    }
    const k = ind.t / ind.dur;
    const pop = k < 0.15 ? k / 0.15 : 1;
    const h = this.carley.world.head;
    txt.setText(ind.kind === '#' ? '!!' : ind.kind);
    const col = ind.kind === '?' ? '#8398eb' : '#e3876c';
    if (col !== this.indColor) {
      this.indColor = col;
      txt.setColor(col);
    }
    txt.setPosition(h.x + 30, h.y - 46 - Math.sin(k * Math.PI) * 6);
    txt.setScale(0.4 + 0.7 * easeOutBack(pop));
    txt.setAlpha(clamp01(1 - Math.max(0, k - 0.7) / 0.3));
  }

  private drawInsects(): void {
    const sim = this.sim;
    const g = this.insectG;
    const f = this.flyG;
    g.clear();
    f.clear();
    for (const m of sim.mosquitoes) {
      const jx = Math.sin(this.t * 62 + m.id * 3) * 1.4;
      const jy = Math.cos(this.t * 53 + m.id) * 1.2;
      const x = m.x + jx;
      const y = m.y + jy;
      const fade = m.fade;
      const flap = Math.sin(this.t * 80 + m.id) * 0.5 + 0.5;
      const dir = m.vx >= 0 ? 1 : -1;
      g.fillStyle(0xdde9f9, 0.7 * fade);
      g.fillEllipse(x - 1 * dir, y - 5 - flap * 2, 9, 3 + flap * 4);
      g.fillEllipse(x + 2 * dir, y - 4 - flap * 2, 8, 3 + flap * 3);
      g.fillStyle(0x41464c, fade);
      g.fillEllipse(x, y, 9, 4.2);
      g.fillEllipse(x + 5 * dir, y - 0.5, 4.2, 3.4);
      g.lineStyle(1.2, 0x41464c, fade);
      g.beginPath();
      g.moveTo(x + 7 * dir, y);
      g.lineTo(x + 12 * dir, y + 2);
      g.moveTo(x - 2, y + 2);
      g.lineTo(x - 4, y + 7);
      g.moveTo(x + 1, y + 2);
      g.lineTo(x + 1, y + 7);
      g.moveTo(x + 3, y + 2);
      g.lineTo(x + 5, y + 6);
      g.strokePath();
      if (m.state === 'orbit' || m.state === 'seek') {
        // tiny "bzzz" arcs
        g.lineStyle(1, 0x7b8491, 0.45 * fade);
        g.strokeCircle(x, y, 8 + (this.t * 20 % 6));
      }
    }
    for (const b of sim.butterflies) {
      const [c1, c2] = BUTTERFLY_COLORS[b.hue % BUTTERFLY_COLORS.length];
      const flap = b.state === 'perched' ? 0.35 + 0.2 * Math.sin(this.t * 3 + b.id) : 0.2 + 0.8 * Math.abs(Math.sin(this.t * 9 + b.id * 2));
      const a = b.fade;
      const w = 11 * flap + 2;
      const x = b.x;
      const y = b.y;
      f.fillStyle(c1, a);
      f.lineStyle(1.5, 0x6a4436, a);
      f.fillEllipse(x - w * 0.55, y - 3, w, 11);
      f.fillEllipse(x + w * 0.55, y - 3, w, 11);
      f.strokeEllipse(x - w * 0.55, y - 3, w, 11);
      f.strokeEllipse(x + w * 0.55, y - 3, w, 11);
      f.fillStyle(c2, a);
      f.fillEllipse(x - w * 0.45, y + 4, w * 0.8, 8);
      f.fillEllipse(x + w * 0.45, y + 4, w * 0.8, 8);
      f.lineStyle(2.4, 0x6a4436, a);
      f.beginPath();
      f.moveTo(x, y - 6);
      f.lineTo(x, y + 8);
      f.moveTo(x, y - 6);
      f.lineTo(x - 3, y - 12);
      f.moveTo(x, y - 6);
      f.lineTo(x + 3, y - 12);
      f.strokePath();
      if (b.friendly) star4(f, x + 10, y - 12, 3, 0xffffff, 0.5 * a * (0.5 + 0.5 * Math.sin(this.t * 6 + b.id)));
    }
    void WORLD_RIGHT_X;
  }
}

function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}
