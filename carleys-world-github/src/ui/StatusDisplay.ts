import Phaser from 'phaser';
import type { Simulation } from '../sim/Simulation';
import { cloud } from './icons';
import { UI_FONT } from './MoodMeter';
import { star4 } from '../render/draw';
import { drawIcon } from './icons';

const PHASE_LABEL: Record<string, string> = { night: 'Night', dawn: 'Dawn', morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening' };
const WEATHER_LABEL: Record<string, string> = { sunny: 'Sunny', cloudy: 'Cloudy', rainy: 'Rainy', windy: 'Windy' };

export interface HudButton {
  id: string;
  x: number;
  y: number;
  r: number;
}

/** Top-right HUD: weather indicator, time of day with sun/moon track, day counter, and pause/settings buttons. */
export class StatusDisplay {
  private g: Phaser.GameObjects.Graphics;
  private weatherText: Phaser.GameObjects.Text;
  private timeText: Phaser.GameObjects.Text;
  private dayText: Phaser.GameObjects.Text;
  private speedText: Phaser.GameObjects.Text;
  private autoText: Phaser.GameObjects.Text;
  readonly buttons: HudButton[] = [
    { id: 'auto', x: 1166, y: 40, r: 18 },
    { id: 'pause', x: 1208, y: 40, r: 18 },
    { id: 'settings', x: 1250, y: 40, r: 18 }
  ];
  hover: string | null = null;

  constructor(private scene: Phaser.Scene) {
    this.g = scene.add.graphics().setDepth(100);
    const style = { fontFamily: UI_FONT, color: '#6a4436' };
    this.weatherText = scene.add.text(968, 16, '', { ...style, fontSize: '16px', fontStyle: 'bold' }).setDepth(101);
    this.timeText = scene.add.text(968, 38, '', { ...style, fontSize: '22px', fontStyle: 'bold' }).setDepth(101);
    this.dayText = scene.add.text(968, 64, '', { ...style, fontSize: '12px', color: '#866b5e' }).setDepth(101);
    this.autoText = scene.add.text(1166, 64, 'Auto', { fontFamily: UI_FONT, fontSize: '11px', fontStyle: 'bold', color: '#606b79' }).setOrigin(0.5).setDepth(101);
    this.speedText = scene.add.text(1100, 66, '', { ...style, fontSize: '12px', color: '#ae796a', fontStyle: 'bold' }).setDepth(101);
  }

  update(dt: number, sim: Simulation, time: number): void {
    const g = this.g;
    g.clear();
    const x = 868;
    const y = 14;
    g.fillStyle(0xfef6ef, 0.92);
    g.lineStyle(3, 0x855c4d, 1);
    g.fillRoundedRect(x, y, 266, 80, 18);
    g.strokeRoundedRect(x, y, 266, 80, 18);
    g.fillStyle(0xffffff, 0.5);
    g.fillRoundedRect(x + 6, y + 5, 254, 14, 9);

    // weather icon
    const ix = x + 48;
    const iy = y + 40;
    const w = sim.weather;
    const type = w.type;
    if (type === 'sunny') drawIcon(g, 'sun', ix, iy, 52, time);
    else if (type === 'cloudy') {
      drawIcon(g, 'sun', ix + 10, iy - 8, 34, time);
      cloud(g, ix - 2, iy + 4, 22, 0xeaeef4);
    } else if (type === 'rainy') drawIcon(g, 'rain', ix, iy, 50, time);
    else drawIcon(g, 'wind', ix, iy, 50, time);

    this.weatherText.setText(WEATHER_LABEL[type]).setX(x + 92);
    this.timeText.setText(sim.clockLabel).setX(x + 92);
    this.dayText.setText(`Day ${sim.clock.day + 1} · ${PHASE_LABEL[sim.clock.phase]}`).setX(x + 92);

    // 24h track with sun/moon marker
    const tx = x + 92;
    const ty = y + 66;
    const tw = 158;
    for (let i = 0; i < 24; i++) {
      const h = i + 0.5;
      const light = Math.max(0, Math.min(1, (Math.sin(((h - 6) / 24) * Math.PI * 2) + 0.35) / 1.2));
      const col = light > 0.5 ? 0xf4d695 : light > 0.2 ? 0xf5b484 : 0x7b82bb;
      g.fillStyle(col, 1);
      g.fillRect(tx + (tw / 24) * i, ty, tw / 24 + 0.6, 6);
    }
    g.lineStyle(1.6, 0x855c4d, 1);
    g.strokeRoundedRect(tx, ty, tw, 6, 3);
    const mx = tx + (tw * sim.clock.hour) / 24;
    const night = sim.clock.daylight < 0.3;
    if (night) {
      g.fillStyle(0xfaeecd, 1);
      g.fillCircle(mx, ty + 3, 6);
      g.fillStyle(0xf6dfa9, 1);
      g.fillCircle(mx + 2.5, ty + 1, 5);
      g.lineStyle(1.6, 0x855c4d, 1);
    } else {
      g.fillStyle(0xf1c46c, 1);
      g.fillCircle(mx, ty + 3, 6);
      g.lineStyle(1.8, 0xe6a263, 1);
      g.strokeCircle(mx, ty + 3, 6);
    }
    if (night) star4(g, mx - 11, ty - 4, 2.5, 0xf6dfa9, 0.8 + 0.2 * Math.sin(time * 4));

    // speed badge
    this.speedText.setText(sim.timeScale !== 1 ? `${sim.timeScale}× time` : '').setX(x + 196).setY(y + 17);

    this.autoText.setText(sim.autopilot ? 'Auto: on' : 'Auto: off');
    // round buttons
    for (const b of this.buttons) {
      const hovered = this.hover === b.id;
      const on = b.id === 'auto' && sim.autopilot;
      g.fillStyle(on ? 0xc5e5c7 : hovered ? 0xf8e2db : 0xfef6ef, 0.96);
      g.lineStyle(3, 0x855c4d, 1);
      g.fillCircle(b.x, b.y, b.r);
      g.strokeCircle(b.x, b.y, b.r);
      drawIcon(g, b.id === 'pause' ? (sim.paused ? 'play' : 'pause') : b.id === 'auto' ? 'auto' : 'gear', b.x, b.y, 24);
    }
    void dt;
  }

  hitTest(x: number, y: number): string | null {
    for (const b of this.buttons) if (Math.hypot(x - b.x, y - b.y) <= b.r) return b.id;
    return null;
  }
}
