import Phaser from 'phaser';
import { LOW_METER, METERS, meterValue } from '../config/meterConfig';
import type { Simulation } from '../sim/Simulation';
import { drawIcon } from './icons';
import { UI_FONT, moodColor } from './MoodMeter';
import { mixColor } from '../render/WorldView';

const CELL_W = 144;
const CELL_H = 36;

/** Six need meters. They drain slowly and rise while Carley does something that feeds them. */
export class MeterPanel {
  private g: Phaser.GameObjects.Graphics;
  private labels: Phaser.GameObjects.Text[] = [];
  private shown: number[] = METERS.map(() => 70);
  private trend: number[] = METERS.map(() => 0);
  private lowState: boolean[] = METERS.map(() => false);
  private t = 0;

  constructor(scene: Phaser.Scene, private x = 418, private y = 14) {
    this.g = scene.add.graphics().setDepth(100);
    METERS.forEach((m) => {
      this.labels.push(scene.add.text(0, 0, m.label, { fontFamily: UI_FONT, fontSize: '12px', fontStyle: 'bold', color: '#6a4436' }).setDepth(101));
    });
  }

  update(dt: number, sim: Simulation): void {
    this.t += dt;
    const g = this.g;
    g.clear();
    g.fillStyle(0xfef6ef, 0.92);
    g.lineStyle(3, 0x855c4d, 1);
    g.fillRoundedRect(this.x, this.y, 440, 80, 18);
    g.strokeRoundedRect(this.x, this.y, 440, 80, 18);
    g.fillStyle(0xffffff, 0.5);
    g.fillRoundedRect(this.x + 6, this.y + 5, 428, 12, 8);

    METERS.forEach((m, i) => {
      const v = meterValue(sim.character.needs, m.key);
      const prev = this.shown[i];
      this.shown[i] += (v - prev) * (1 - Math.exp(-6 * dt));
      // rising / falling indicator (smoothed per-second change)
      const rate = dt > 0 ? (this.shown[i] - prev) / dt : 0;
      this.trend[i] += (rate - this.trend[i]) * (1 - Math.exp(-4 * dt));
      const col = i % 3;
      const row = Math.floor(i / 3);
      const cx = this.x + 10 + col * CELL_W;
      const cy = this.y + 6 + row * (CELL_H + 2);
      const low = this.shown[i] < LOW_METER;
      const flash = low ? 0.5 + 0.5 * Math.sin(this.t * 7) : 0;

      // icon disc
      g.fillStyle(mixColor(m.color, 0xffffff, 0.5), 1);
      g.lineStyle(2.2, low ? 0xc77860 : 0x855c4d, 1);
      g.fillCircle(cx + 15, cy + 18, 15);
      g.strokeCircle(cx + 15, cy + 18, 15);
      drawIcon(g, m.icon, cx + 15, cy + 18, 22, this.t);

      // bar
      const bx = cx + 36;
      const by = cy + 20;
      const bw = 92;
      const bh = 10;
      g.fillStyle(0xeeddd1, 1);
      g.fillRoundedRect(bx, by, bw, bh, 5);
      const fill = Math.max(bh, (bw * this.shown[i]) / 100);
      g.fillStyle(low ? mixColor(0xf47676, 0xf9b6b6, flash) : mixColor(m.color, moodColor(this.shown[i]), 0.0), 1);
      g.fillRoundedRect(bx, by, fill, bh, 5);
      g.fillStyle(0xffffff, 0.4);
      g.fillRoundedRect(bx + 3, by + 1.5, Math.max(2, fill - 6), 3, 1.5);
      g.lineStyle(1.8, low ? 0xc77860 : 0x855c4d, 1);
      g.strokeRoundedRect(bx, by, bw, bh, 5);

      // trend arrow
      const ax = bx + bw + 6;
      if (this.trend[i] > 0.8) {
        g.fillStyle(0x5ca567, 1);
        g.fillTriangle(ax, by + 8, ax + 8, by + 8, ax + 4, by);
      } else if (this.trend[i] < -0.15 && !low) {
        g.fillStyle(0xc6aba3, 1);
        g.fillTriangle(ax, by, ax + 8, by, ax + 4, by + 8);
      } else if (low) {
        g.fillStyle(0xc77860, 0.5 + 0.5 * flash);
        g.fillCircle(ax + 4, by + 4, 4);
      }
      this.labels[i].setPosition(bx, cy + 3);
      if (this.lowState[i] !== low) {
        this.lowState[i] = low;
        this.labels[i].setColor(low ? '#a76552' : '#6a4436');
      }
    });
  }
}
