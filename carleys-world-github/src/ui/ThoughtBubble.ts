import Phaser from 'phaser';
import type { Simulation } from '../sim/Simulation';
import { UI_FONT } from './MoodMeter';

interface Bubble {
  text: string;
  t: number;
  dur: number;
  priority: number;
}

/** Thought/speech bubble floating above Carley's head: infrequent, context-sensitive, never stacked. */
export class ThoughtBubble {
  private g: Phaser.GameObjects.Graphics;
  private txt: Phaser.GameObjects.Text;
  private cur: Bubble | null = null;
  private queued: Bubble | null = null;
  private bob = 0;

  constructor(private scene: Phaser.Scene, private sim: Simulation, private headPos: () => { x: number; y: number }) {
    this.g = scene.add.graphics().setDepth(90);
    this.txt = scene.add
      .text(0, 0, '', { fontFamily: UI_FONT, fontSize: '17px', fontStyle: 'bold', color: '#6a4436', align: 'center' })
      .setOrigin(0.5)
      .setDepth(91);
    sim.bus.on('thought', (e) => this.show(e.text, e.priority, e.durationMs));
  }

  private show(text: string, priority: number, durationMs?: number): void {
    const b: Bubble = { text, t: 0, dur: durationMs ? durationMs / 1000 : 1.8 + text.length * 0.055, priority };
    if (this.cur && this.cur.t < this.cur.dur && this.cur.priority >= priority && this.cur.t < this.cur.dur - 0.3) {
      this.queued = b;
      return;
    }
    this.cur = b;
  }

  update(dt: number): void {
    const g = this.g;
    g.clear();
    this.bob += dt;
    if (!this.cur) {
      this.txt.setAlpha(0);
      return;
    }
    const b = this.cur;
    b.t += dt;
    if (b.t >= b.dur) {
      this.cur = this.queued;
      this.queued = null;
      this.txt.setAlpha(0);
      return;
    }
    const k = b.t / b.dur;
    const fadeIn = Math.min(1, b.t / 0.18);
    const fadeOut = Math.min(1, (b.dur - b.t) / 0.3);
    const a = Math.min(fadeIn, fadeOut);
    const pop = fadeIn < 1 ? 0.7 + 0.3 * fadeIn : 1;
    const h = this.headPos();
    this.txt.setText(b.text);
    const w = this.txt.width + 34;
    const hh = this.txt.height + 22;
    let x = h.x + 26;
    x = Math.max(w / 2 + 8, Math.min(1280 - w / 2 - 8, x));
    const y = h.y - 88 + Math.sin(this.bob * 2.4) * 2.5;
    // tail bubbles lead down to her head
    g.fillStyle(0xffffff, 0.96 * a);
    g.lineStyle(3, 0x855c4d, a);
    const tailX = h.x + 10;
    const tailY = h.y - 40;
    g.fillCircle(tailX + (x - tailX) * 0.1, tailY + (y - tailY) * 0.15, 4.5 * pop);
    g.strokeCircle(tailX + (x - tailX) * 0.1, tailY + (y - tailY) * 0.15, 4.5 * pop);
    g.fillCircle(tailX + (x - tailX) * 0.22, tailY + (y - tailY) * 0.45, 7 * pop);
    g.strokeCircle(tailX + (x - tailX) * 0.22, tailY + (y - tailY) * 0.45, 7 * pop);
    g.fillRoundedRect(x - (w * pop) / 2, y - (hh * pop) / 2, w * pop, hh * pop, 18 * pop);
    g.strokeRoundedRect(x - (w * pop) / 2, y - (hh * pop) / 2, w * pop, hh * pop, 18 * pop);
    this.txt.setPosition(x, y).setAlpha(a).setScale(pop);
    void k;
  }
}
