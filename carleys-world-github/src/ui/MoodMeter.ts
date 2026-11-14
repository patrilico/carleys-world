import Phaser from 'phaser';
import { ACTIVITY_LABEL } from '../config/activityConfig';
import { clamp01 } from '../core/math';
import type { Simulation } from '../sim/Simulation';
import { mixColor } from '../render/WorldView';

export const UI_FONT = '"Trebuchet MS", "Segoe UI", Verdana, sans-serif';

const STOPS: [number, number][] = [
  [0, 0xf47676], [24, 0xf3a86a], [42, 0xf1c46c], [58, 0xb9c781], [72, 0x78bd88], [88, 0xeba997], [100, 0xe6937d]
];

export function moodColor(v: number): number {
  for (let i = 0; i < STOPS.length - 1; i++) {
    const [a, ca] = STOPS[i];
    const [b, cb] = STOPS[i + 1];
    if (v >= a && v <= b) return mixColor(ca, cb, (v - a) / (b - a));
  }
  return STOPS[STOPS.length - 1][1];
}

const REACTION_TEXT: Record<string, string> = {
  rainSurprise: 'Caught in the rain!',
  mosquito: 'Battling a mosquito',
  injury: 'Ouch - she hurt herself',
  heal: 'Feeling the healing magic',
  windGust: 'Windswept',
  stumble: 'Wobbling!',
  startled: 'Startled!',
  butterfly: 'Admiring a butterfly',
  bloom: 'Admiring a bloom',
  discovery: 'Found something neat!',
  sunEmerged: 'Welcoming the sun',
  noticeRain: 'Watching the rain',
  relief: 'Relieved',
  love: 'Feeling loved',
  milk: 'Enjoying a glass of milk'
};

/** Top-left HUD: smoothed happiness meter driven by the real mood composite, plus a mini face and description. */
export class MoodMeter {
  private g: Phaser.GameObjects.Graphics;
  private title: Phaser.GameObjects.Text;
  private sub: Phaser.GameObjects.Text;
  private streak: Phaser.GameObjects.Text;
  private shown = 60;
  private bounce = 0;
  private lastLabel = '';
  private blink = 0;

  constructor(private scene: Phaser.Scene, private x = 18, private y = 14) {
    this.g = scene.add.graphics().setDepth(100);
    this.title = scene.add.text(x + 82, y + 7, '', { fontFamily: UI_FONT, fontSize: '19px', fontStyle: 'bold', color: '#6a4436' }).setDepth(101);
    this.streak = scene.add.text(x + 380, y + 11, '', { fontFamily: UI_FONT, fontSize: '12px', fontStyle: 'bold', color: '#ae796a' }).setOrigin(1, 0).setDepth(101);
    this.sub = scene.add.text(x + 82, y + 58, '', { fontFamily: UI_FONT, fontSize: '13px', color: '#866b5e' }).setDepth(101);
  }

  private description(sim: Simulation): string {
    const b = sim.brain;
    const emo = sim.emotion.effective;
    if (b.reaction) return `${emo} · ${REACTION_TEXT[b.reaction.def.id] ?? b.reaction.def.id}`;
    if (b.isSleeping) return `${emo} · Sleeping`;
    return `${emo} · ${ACTIVITY_LABEL[sim.character.currentActivity]}`;
  }

  update(dt: number, sim: Simulation, time: number): void {
    const target = sim.emotion.mood.value;
    this.shown += (target - this.shown) * (1 - Math.exp(-3 * dt));
    const label = sim.emotion.mood.label;
    if (label !== this.lastLabel) {
      this.lastLabel = label;
      this.bounce = 1;
    }
    this.bounce = Math.max(0, this.bounce - dt * 2.4);
    this.blink = (time % 4 < 0.12) ? 1 : 0;
    const g = this.g;
    const x = this.x;
    const y = this.y;
    g.clear();
    // panel
    g.fillStyle(0xfef6ef, 0.92);
    g.lineStyle(3, 0x855c4d, 1);
    g.fillRoundedRect(x, y, 390, 80, 18);
    g.strokeRoundedRect(x, y, 390, 80, 18);
    g.fillStyle(0xffffff, 0.5);
    g.fillRoundedRect(x + 6, y + 5, 378, 14, 9);

    // mini face
    const fx = x + 42;
    const fy = y + 42 - Math.sin(this.bounce * Math.PI) * 5;
    const v = this.shown;
    const col = moodColor(v);
    g.fillStyle(0x855c4d, 1);
    g.fillCircle(fx, fy, 29);
    g.fillStyle(mixColor(0xfce5d5, col, 0.18), 1);
    g.fillCircle(fx, fy, 26.5);
    const k = (v - 50) / 50; // -1 .. 1
    g.fillStyle(0x4a2e24, 1);
    if (this.blink || k > 0.82) {
      g.lineStyle(2.6, 0x4a2e24, 1);
      g.beginPath();
      g.arc(fx - 9, fy - 3, 4.5, Math.PI * 1.1, Math.PI * 1.9, false);
      g.arc(fx + 9, fy - 3, 4.5, Math.PI * 1.1, Math.PI * 1.9, false);
      g.strokePath();
    } else {
      g.fillEllipse(fx - 9, fy - 3, 6, 8);
      g.fillEllipse(fx + 9, fy - 3, 6, 8);
      g.fillStyle(0xffffff, 1);
      g.fillCircle(fx - 10, fy - 5, 1.8);
      g.fillCircle(fx + 8, fy - 5, 1.8);
    }
    g.lineStyle(2.6, 0x844545, 1);
    g.beginPath();
    const my = fy + 10;
    g.moveTo(fx - 8, my - k * 2);
    g.lineTo(fx - 4, my + k * 2.2);
    g.lineTo(fx + 4, my + k * 2.2);
    g.lineTo(fx + 8, my - k * 2);
    g.strokePath();
    if (k > 0.2) {
      g.fillStyle(0xedb2a0, 0.7 * k);
      g.fillEllipse(fx - 16, fy + 5, 9, 5);
      g.fillEllipse(fx + 16, fy + 5, 9, 5);
    }
    if (k < -0.35) {
      g.fillStyle(0xacd8f2, 0.9);
      g.fillCircle(fx - 15, fy + 8 + ((time * 14) % 8), 2.2);
    }

    // bar
    const bx = x + 82;
    const by = y + 34;
    const bw = 292;
    const bh = 18;
    g.fillStyle(0xeeddd1, 1);
    g.fillRoundedRect(bx, by, bw, bh, 9);
    const fw = Math.max(bh, (bw * clamp01(v / 100)));
    g.fillStyle(col, 1);
    g.fillRoundedRect(bx, by, fw, bh, 9);
    g.fillStyle(0xffffff, 0.4);
    g.fillRoundedRect(bx + 4, by + 2, fw - 8, 5, 3);
    g.lineStyle(2.4, 0x855c4d, 1);
    g.strokeRoundedRect(bx, by, bw, bh, 9);
    // threshold ticks
    g.lineStyle(1.4, 0x855c4d, 0.45);
    for (const t of [22, 40, 56, 70, 85]) {
      g.beginPath();
      g.moveTo(bx + (bw * t) / 100, by + bh - 5);
      g.lineTo(bx + (bw * t) / 100, by + bh);
      g.strokePath();
    }

    this.title.setText(`${label}`).setScale(1 + this.bounce * 0.12);
    this.sub.setText(this.description(sim));
    const hours = sim.happyStreak / sim.secondsPerHour;
    const d = Math.floor(hours / 24);
    const h = Math.floor(hours % 24);
    this.streak.setText(`Happy streak: ${d > 0 ? `${d}d ` : ''}${h}h`);
  }
}
