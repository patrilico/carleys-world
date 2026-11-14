import Phaser from 'phaser';
import { COMMANDS } from '../systems/CommandSystem';
import { METER_BY_KEY } from '../config/meterConfig';
import { mixColor } from '../render/WorldView';
import type { Simulation } from '../sim/Simulation';
import { drawIcon } from './icons';
import { UI_FONT } from './MoodMeter';

const BTN_W = 104;
const BTN_H = 70;
const GAP = 10;
const Y = 642;

/** Bottom command bar: tell Carley what to do. Shows what each action fills, availability and the active command. */
export class ActionToolbar {
  private g: Phaser.GameObjects.Graphics;
  private labels: Phaser.GameObjects.Text[] = [];
  private keys: Phaser.GameObjects.Text[] = [];
  private tipName: Phaser.GameObjects.Text;
  private tipHint: Phaser.GameObjects.Text;
  private toastText: Phaser.GameObjects.Text;
  private toastT = 0;
  private pulses: { i: number; t: number; ok: boolean }[] = [];
  private labelColors: string[] = COMMANDS.map(() => '');
  private tipColor = '';
  private t = 0;
  hover = -1;
  private x0 = (1280 - (COMMANDS.length * BTN_W + (COMMANDS.length - 1) * GAP)) / 2;

  constructor(scene: Phaser.Scene, private sim: Simulation) {
    this.g = scene.add.graphics().setDepth(100);
    const base = { fontFamily: UI_FONT, color: '#6a4436' };
    COMMANDS.forEach((d, i) => {
      const cx = this.x0 + i * (BTN_W + GAP) + BTN_W / 2;
      this.labels.push(scene.add.text(cx, Y + 55, d.name, { ...base, fontSize: '13px', fontStyle: 'bold' }).setOrigin(0.5).setDepth(101));
      this.keys.push(scene.add.text(cx - BTN_W / 2 + 8, Y + 4, String(i + 1), { ...base, fontSize: '11px', color: '#b29b8d' }).setDepth(101));
    });
    this.tipName = scene.add.text(0, 0, '', { ...base, fontSize: '16px', fontStyle: 'bold' }).setDepth(111).setVisible(false);
    this.tipHint = scene.add.text(0, 0, '', { ...base, fontSize: '12px', color: '#ae796a', fontStyle: 'bold' }).setDepth(111).setVisible(false);
    this.toastText = scene.add.text(640, Y - 22, '', { fontFamily: UI_FONT, fontSize: '17px', fontStyle: 'bold', color: '#ffffff', stroke: '#6a4436', strokeThickness: 5 }).setOrigin(0.5).setDepth(120).setAlpha(0);
  }

  hitTest(x: number, y: number): number {
    if (y < Y || y > Y + BTN_H) return -1;
    for (let i = 0; i < COMMANDS.length; i++) {
      const bx = this.x0 + i * (BTN_W + GAP);
      if (x >= bx && x <= bx + BTN_W) return i;
    }
    return -1;
  }

  overToolbar(_x: number, y: number): boolean {
    return y >= Y - 12;
  }

  toast(msg: string, ok = true): void {
    this.toastText.setText(msg).setColor(ok ? '#ffffff' : '#fcd9d9').setAlpha(1);
    this.toastT = 2.4;
  }

  press(i: number): void {
    const def = COMMANDS[i];
    if (!def) return;
    const res = this.sim.commands.issue(def.id);
    this.pulses.push({ i, t: 0, ok: res.ok });
    this.toast(res.message, res.ok);
  }

  update(dt: number, ptr: { x: number; y: number }): void {
    this.t += dt;
    const g = this.g;
    g.clear();
    const pw = COMMANDS.length * BTN_W + (COMMANDS.length - 1) * GAP + 32;
    const px = this.x0 - 16;
    g.fillStyle(0xfef6ef, 0.94);
    g.lineStyle(3, 0x855c4d, 1);
    g.fillRoundedRect(px, Y - 8, pw, BTN_H + 16, 20);
    g.strokeRoundedRect(px, Y - 8, pw, BTN_H + 16, 20);
    g.fillStyle(0xffffff, 0.5);
    g.fillRoundedRect(px + 8, Y - 3, pw - 16, 10, 6);

    this.hover = this.hitTest(ptr.x, ptr.y);
    COMMANDS.forEach((d, i) => {
      const bx = this.x0 + i * (BTN_W + GAP);
      const cx = bx + BTN_W / 2;
      const hovered = this.hover === i;
      const active = this.sim.commands.isActive(d.id);
      const block = active ? null : this.sim.commands.blockReason(d.id);
      const lift = active ? -5 : hovered && !block ? -3 : 0;
      const by = Y + lift;

      g.fillStyle(0x855c4d, 0.15);
      g.fillRoundedRect(bx + 2, by + 4, BTN_W, BTN_H, 14);
      g.fillStyle(active ? 0xf9eabe : 0xfef9f5, 1);
      g.lineStyle(active ? 4 : 3, active ? 0xe6a263 : 0x855c4d, 1);
      g.fillRoundedRect(bx, by, BTN_W, BTN_H, 14);
      g.strokeRoundedRect(bx, by, BTN_W, BTN_H, 14);
      g.fillStyle(mixColor(d.color, 0xffffff, 0.55), block ? 0.5 : 1);
      g.fillCircle(cx, by + 24, 21);
      drawIcon(g, d.icon, cx, by + 24, 36, this.t);
      const lab = this.labels[i];
      lab.setText(active && d.kind === 'activity' ? 'Stop' : d.name).setPosition(cx, by + 55);
      const want = active ? '#a76452' : '#6a4436';
      if (this.labelColors[i] !== want) {
        this.labelColors[i] = want;
        lab.setColor(want); // setColor re-renders the text, so only when it changes
      }
      this.keys[i].setPosition(bx + 8, by + 4);
      if (block) {
        g.fillStyle(0xe6dcd6, 0.62);
        g.fillRoundedRect(bx, by, BTN_W, BTN_H, 14);
      }
      if (active) {
        const pulse = 0.5 + 0.5 * Math.sin(this.t * 6);
        g.lineStyle(3, 0xf1c46c, 0.5 + 0.5 * pulse);
        g.strokeRoundedRect(bx - 4, by - 4, BTN_W + 8, BTN_H + 8, 17);
      }
    });

    for (let k = this.pulses.length - 1; k >= 0; k--) {
      const p = this.pulses[k];
      p.t += dt * 2.4;
      if (p.t >= 1) {
        this.pulses.splice(k, 1);
        continue;
      }
      const bx = this.x0 + p.i * (BTN_W + GAP);
      g.lineStyle(4, p.ok ? 0xf1c46c : 0xf69393, 1 - p.t);
      g.strokeRoundedRect(bx - p.t * 14, Y - p.t * 14, BTN_W + p.t * 28, BTN_H + p.t * 28, 14 + p.t * 10);
    }

    if (this.toastT > 0) {
      this.toastT -= dt;
      this.toastText.setAlpha(Math.min(1, this.toastT / 0.6)).setY(Y - 26 - (2.4 - this.toastT) * 3);
    } else this.toastText.setAlpha(0);

    const tip = this.hover >= 0 ? COMMANDS[this.hover] : null;
    this.tipName.setVisible(!!tip);
    this.tipHint.setVisible(!!tip);
    if (tip) {
      const w = 300;
      const h = 62;
      const cx = this.x0 + this.hover * (BTN_W + GAP) + BTN_W / 2;
      const tx = Math.max(10, Math.min(1280 - w - 10, cx - w / 2));
      const ty = Y - h - 24;
      g.fillStyle(0xfef6ef, 0.98);
      g.lineStyle(3, 0x855c4d, 1);
      g.fillRoundedRect(tx, ty, w, h, 14);
      g.strokeRoundedRect(tx, ty, w, h, 14);
      g.fillStyle(tip.color, 1);
      g.fillRoundedRect(tx, ty, 8, h, 4);
      this.tipName.setText(tip.name).setPosition(tx + 20, ty + 8);
      const active = this.sim.commands.isActive(tip.id);
      const block = active ? null : this.sim.commands.blockReason(tip.id);
      this.tipHint
        .setText(active && tip.kind === 'activity' ? 'Click again to stop' : block ? `Not now: ${block}` : `Feeds: ${METER_BY_KEY[tip.meter].label}`)
        .setPosition(tx + 20, ty + 34);
      const tc = block ? '#a76552' : '#46754d';
      if (tc !== this.tipColor) {
        this.tipColor = tc;
        this.tipHint.setColor(tc);
      }
    }
  }
}
