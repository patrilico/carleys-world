import type Phaser from 'phaser';
import { star4 } from '../render/draw';

const OUT = 0x6a4436;

/** Draws a power / status icon centred at (x, y) inside a `s`-sized box using only vector shapes. */
export function drawIcon(g: Phaser.GameObjects.Graphics, icon: string, x: number, y: number, s: number, t = 0): void {
  const r = s / 2;
  switch (icon) {
    case 'sun': {
      g.lineStyle(3, 0xe6a263, 1);
      for (let i = 0; i < 8; i++) {
        const a = t * 0.5 + (i * Math.PI) / 4;
        g.beginPath();
        g.moveTo(x + Math.cos(a) * r * 0.62, y + Math.sin(a) * r * 0.62);
        g.lineTo(x + Math.cos(a) * r * 0.95, y + Math.sin(a) * r * 0.95);
        g.strokePath();
      }
      g.fillStyle(0xf1c46c, 1);
      g.fillCircle(x, y, r * 0.5);
      g.lineStyle(2.4, 0xe6a263, 1);
      g.strokeCircle(x, y, r * 0.5);
      g.fillStyle(0xffffff, 0.6);
      g.fillCircle(x - r * 0.15, y - r * 0.17, r * 0.15);
      break;
    }
    case 'heart': {
      heart(g, x, y + 1, r * 0.95, 0xe99f8a, OUT);
      star4(g, x + r * 0.62, y - r * 0.6, r * 0.28, 0xf6e7a9, 1);
      break;
    }
    case 'bug': {
      // friendly shoo: swatted mosquito with motion lines
      mosquito(g, x + 2, y + 1, r * 0.9, 0x74a389);
      g.lineStyle(2.2, 0xffffff, 0.9);
      g.beginPath();
      g.moveTo(x - r * 0.95, y - r * 0.4);
      g.lineTo(x - r * 0.55, y - r * 0.3);
      g.moveTo(x - r * 0.95, y + r * 0.1);
      g.lineTo(x - r * 0.6, y + r * 0.1);
      g.strokePath();
      break;
    }
    case 'milk': {
      const outer = [{ x: x - r * 0.5, y: y - r * 0.75 }, { x: x + r * 0.5, y: y - r * 0.75 }, { x: x + r * 0.38, y: y + r * 0.8 }, { x: x - r * 0.38, y: y + r * 0.8 }];
      g.fillStyle(0xebf5fc, 1);
      g.lineStyle(2.6, OUT, 1);
      g.fillPoints(outer, true);
      g.strokePoints(outer, true, true);
      g.fillStyle(0xffffff, 1);
      g.fillPoints([{ x: x - r * 0.44, y: y - r * 0.25 }, { x: x + r * 0.44, y: y - r * 0.25 }, { x: x + r * 0.37, y: y + r * 0.72 }, { x: x - r * 0.37, y: y + r * 0.72 }], true);
      g.fillStyle(0xacd0f2, 1);
      g.fillCircle(x - r * 0.2, y + r * 0.2, r * 0.07);
      star4(g, x + r * 0.7, y - r * 0.55, r * 0.25, 0xf6e7a9, 1);
      break;
    }
    case 'mosquito': mosquito(g, x, y, r * 0.95, 0x5c636c); break;
    case 'flower': {
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 - Math.PI / 2 + t * 0.1;
        g.fillStyle(0xeeb4a4, 1);
        g.lineStyle(2, OUT, 1);
        g.fillCircle(x + Math.cos(a) * r * 0.42, y + Math.sin(a) * r * 0.42 - 1, r * 0.34);
        g.strokeCircle(x + Math.cos(a) * r * 0.42, y + Math.sin(a) * r * 0.42 - 1, r * 0.34);
      }
      g.fillStyle(0xf1cf74, 1);
      g.fillCircle(x, y - 1, r * 0.28);
      g.lineStyle(2, OUT, 1);
      g.strokeCircle(x, y - 1, r * 0.28);
      break;
    }
    case 'butterfly': {
      const f = 0.8 + 0.2 * Math.sin(t * 6);
      for (const sd of [-1, 1]) {
        g.fillStyle(0xa7c2e5, 1);
        g.lineStyle(2, OUT, 1);
        g.fillEllipse(x + sd * r * 0.42 * f, y - r * 0.2, r * 0.8 * f, r * 0.9);
        g.strokeEllipse(x + sd * r * 0.42 * f, y - r * 0.2, r * 0.8 * f, r * 0.9);
        g.fillStyle(0xf3cdc2, 1);
        g.fillEllipse(x + sd * r * 0.32 * f, y + r * 0.35, r * 0.55 * f, r * 0.55);
        g.strokeEllipse(x + sd * r * 0.32 * f, y + r * 0.35, r * 0.55 * f, r * 0.55);
      }
      g.lineStyle(3, OUT, 1);
      g.beginPath();
      g.moveTo(x, y - r * 0.5);
      g.lineTo(x, y + r * 0.55);
      g.strokePath();
      break;
    }
    case 'rain': {
      cloud(g, x, y - r * 0.15, r, 0xa6b5c9);
      g.lineStyle(3, 0x73a8dc, 1);
      for (let i = 0; i < 3; i++) {
        g.beginPath();
        g.moveTo(x - r * 0.45 + i * r * 0.45, y + r * 0.35 + ((t * 8 + i * 3) % 4));
        g.lineTo(x - r * 0.55 + i * r * 0.45, y + r * 0.8 + ((t * 8 + i * 3) % 4));
        g.strokePath();
      }
      break;
    }
    case 'wind': {
      g.lineStyle(3.4, 0x7dbac6, 1);
      swirl(g, x - r * 0.1, y - r * 0.35, r * 0.95, 0);
      swirl(g, x + r * 0.1, y + r * 0.05, r * 0.8, 1);
      swirl(g, x - r * 0.2, y + r * 0.45, r * 0.7, 0);
      break;
    }
    case 'boo': {
      g.fillStyle(0xffffff, 1);
      g.lineStyle(2.4, OUT, 1);
      g.beginPath();
      g.moveTo(x - r * 0.7, y + r * 0.8);
      g.lineTo(x - r * 0.7, y - r * 0.1);
      g.arc(x, y - r * 0.1, r * 0.7, Math.PI, 0, false);
      g.lineTo(x + r * 0.7, y + r * 0.8);
      g.lineTo(x + r * 0.35, y + r * 0.55);
      g.lineTo(x, y + r * 0.8);
      g.lineTo(x - r * 0.35, y + r * 0.55);
      g.closePath();
      g.fillPath();
      g.strokePath();
      g.fillStyle(OUT, 1);
      g.fillEllipse(x - r * 0.25, y - r * 0.15, r * 0.2, r * 0.3);
      g.fillEllipse(x + r * 0.25, y - r * 0.15, r * 0.2, r * 0.3);
      g.fillStyle(0xe99f8a, 1);
      g.fillEllipse(x, y + r * 0.2, r * 0.28, r * 0.28);
      break;
    }
    case 'pause': {
      g.fillStyle(0x606b79, 1);
      g.fillRoundedRect(x - r * 0.5, y - r * 0.55, r * 0.34, r * 1.1, 3);
      g.fillRoundedRect(x + r * 0.16, y - r * 0.55, r * 0.34, r * 1.1, 3);
      break;
    }
    case 'play': {
      g.fillStyle(0x606b79, 1);
      g.fillTriangle(x - r * 0.4, y - r * 0.6, x - r * 0.4, y + r * 0.6, x + r * 0.6, y);
      break;
    }
    case 'gear': {
      g.fillStyle(0x606b79, 1);
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        g.fillCircle(x + Math.cos(a) * r * 0.62, y + Math.sin(a) * r * 0.62, r * 0.2);
      }
      g.fillCircle(x, y, r * 0.55);
      g.fillStyle(0xffffff, 1);
      g.fillCircle(x, y, r * 0.22);
      break;
    }
    case 'bug2': {
      g.fillStyle(0x606b79, 1);
      g.fillEllipse(x, y, r, r * 1.2);
      break;
    }
    case 'bed': {
      g.fillStyle(0xd1a57c, 1);
      g.lineStyle(2.2, OUT, 1);
      g.fillRoundedRect(x - r * 0.95, y - r * 0.6, r * 0.28, r * 1.35, 3);
      g.strokeRoundedRect(x - r * 0.95, y - r * 0.6, r * 0.28, r * 1.35, 3);
      g.fillStyle(0xfef8f3, 1);
      g.fillRoundedRect(x - r * 0.75, y + r * 0.05, r * 1.7, r * 0.4, 4);
      g.strokeRoundedRect(x - r * 0.75, y + r * 0.05, r * 1.7, r * 0.4, 4);
      g.fillStyle(0xb7cdea, 1);
      g.fillRoundedRect(x - r * 0.15, y - r * 0.1, r * 1.1, r * 0.5, 4);
      g.strokeRoundedRect(x - r * 0.15, y - r * 0.1, r * 1.1, r * 0.5, 4);
      g.fillStyle(0xf8e0d9, 1);
      g.fillRoundedRect(x - r * 0.68, y - r * 0.2, r * 0.5, r * 0.3, 4);
      g.strokeRoundedRect(x - r * 0.68, y - r * 0.2, r * 0.5, r * 0.3, 4);
      break;
    }
    case 'paint': {
      g.fillStyle(0xe1c395, 1);
      g.lineStyle(2.2, OUT, 1);
      g.fillEllipse(x - r * 0.1, y + r * 0.1, r * 1.5, r * 1.15);
      g.strokeEllipse(x - r * 0.1, y + r * 0.1, r * 1.5, r * 1.15);
      for (const [dx, dy, c] of [[-0.45, -0.1, 0xe6957d], [-0.05, -0.28, 0x83b6eb], [0.3, -0.05, 0xf2dd77], [-0.35, 0.3, 0x91c591]] as [number, number, number][]) {
        g.fillStyle(c, 1);
        g.fillCircle(x + dx * r, y + dy * r, r * 0.14);
      }
      g.lineStyle(3.2, OUT, 1);
      g.beginPath();
      g.moveTo(x + r * 0.35, y + r * 0.7);
      g.lineTo(x + r * 0.85, y - r * 0.7);
      g.strokePath();
      g.fillStyle(0xe6957d, 1);
      g.fillCircle(x + r * 0.88, y - r * 0.78, r * 0.16);
      break;
    }
    case 'book': {
      g.fillStyle(0x7d8ec8, 1);
      g.lineStyle(2.2, OUT, 1);
      g.fillRoundedRect(x - r * 0.9, y - r * 0.6, r * 1.8, r * 1.25, 4);
      g.strokeRoundedRect(x - r * 0.9, y - r * 0.6, r * 1.8, r * 1.25, 4);
      g.fillStyle(0xfefcf6, 1);
      g.fillRoundedRect(x - r * 0.78, y - r * 0.48, r * 0.74, r * 1.0, 3);
      g.fillRoundedRect(x + r * 0.04, y - r * 0.48, r * 0.74, r * 1.0, 3);
      g.lineStyle(1.4, 0xc7beb0, 1);
      g.beginPath();
      for (let i = 0; i < 3; i++) {
        g.moveTo(x - r * 0.65, y - r * 0.25 + i * r * 0.25);
        g.lineTo(x - r * 0.18, y - r * 0.25 + i * r * 0.25);
        g.moveTo(x + r * 0.18, y - r * 0.25 + i * r * 0.25);
        g.lineTo(x + r * 0.65, y - r * 0.25 + i * r * 0.25);
      }
      g.strokePath();
      break;
    }
    case 'can': {
      g.fillStyle(0x9bcfdc, 1);
      g.lineStyle(2.2, OUT, 1);
      g.fillRoundedRect(x - r * 0.65, y - r * 0.1, r * 1.1, r * 0.85, 5);
      g.strokeRoundedRect(x - r * 0.65, y - r * 0.1, r * 1.1, r * 0.85, 5);
      const spout = [{ x: x + r * 0.4, y: y + r * 0.5 }, { x: x + r * 0.85, y: y - r * 0.5 }, { x: x + r * 1.0, y: y - r * 0.5 }, { x: x + r * 0.9, y: y - r * 0.3 }, { x: x + r * 0.45, y: y + r * 0.7 }];
      g.fillPoints(spout, true);
      g.strokePoints(spout, true, true);
      g.lineStyle(3, OUT, 1);
      g.beginPath();
      g.arc(x - r * 0.7, y + r * 0.2, r * 0.4, -2.6, 0.9, false);
      g.strokePath();
      g.fillStyle(0x8eb4d9, 1);
      for (const [dx, dy] of [[0.95, 0.0], [1.0, 0.35], [0.8, 0.6]] as [number, number][]) g.fillCircle(x + dx * r, y + dy * r + r * 0.1, r * 0.07);
      break;
    }
    case 'phone': {
      g.fillStyle(0xeba997, 1);
      g.lineStyle(2.4, OUT, 1);
      g.fillRoundedRect(x - r * 0.45, y - r * 0.85, r * 0.9, r * 1.7, 6);
      g.strokeRoundedRect(x - r * 0.45, y - r * 0.85, r * 0.9, r * 1.7, 6);
      g.fillStyle(0x343c45, 1);
      g.fillRoundedRect(x - r * 0.33, y - r * 0.68, r * 0.66, r * 1.2, 3);
      heart(g, x, y - r * 0.12, r * 0.28, 0xe99f8a, 0x343c45);
      g.fillStyle(0xffffff, 1);
      g.fillCircle(x, y + r * 0.68, r * 0.08);
      break;
    }
    case 'zzz': {
      g.lineStyle(3.2, 0x6a88ae, 1);
      for (const [dx, dy, k] of [[-0.55, 0.3, 0.5], [-0.05, -0.1, 0.65], [0.45, -0.5, 0.8]] as [number, number, number][]) {
        const px = x + dx * r;
        const py = y + dy * r;
        const w = r * k * 0.7;
        g.beginPath();
        g.moveTo(px - w / 2, py - w / 2);
        g.lineTo(px + w / 2, py - w / 2);
        g.lineTo(px - w / 2, py + w / 2);
        g.lineTo(px + w / 2, py + w / 2);
        g.strokePath();
      }
      break;
    }
    case 'moon': {
      const pts: { x: number; y: number }[] = [];
      for (let i = 0; i <= 16; i++) {
        const a = -2.0 + (i / 16) * 4.0;
        pts.push({ x: x + Math.cos(a) * r * 0.75, y: y + Math.sin(a) * r * 0.75 });
      }
      for (let i = 16; i >= 0; i--) {
        const a = -1.6 + (i / 16) * 3.2;
        pts.push({ x: x + r * 0.3 + Math.cos(a) * r * 0.62, y: y + Math.sin(a) * r * 0.62 });
      }
      g.fillStyle(0xf8eab7, 1);
      g.fillPoints(pts, true);
      g.lineStyle(2, OUT, 1);
      g.strokePoints(pts, true, true);
      star4(g, x + r * 0.55, y - r * 0.45, r * 0.22, 0xf6e7a9, 1);
      break;
    }
    case 'chat': {
      g.fillStyle(0xffffff, 1);
      g.lineStyle(2.4, OUT, 1);
      g.fillRoundedRect(x - r * 0.85, y - r * 0.7, r * 1.7, r * 1.2, 8);
      g.strokeRoundedRect(x - r * 0.85, y - r * 0.7, r * 1.7, r * 1.2, 8);
      g.fillTriangle(x - r * 0.4, y + r * 0.45, x - r * 0.1, y + r * 0.45, x - r * 0.55, y + r * 0.85);
      heart(g, x, y - r * 0.12, r * 0.4, 0xe99f8a, OUT);
      break;
    }
    case 'star': {
      const pts: { x: number; y: number }[] = [];
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const rad = i % 2 === 0 ? r * 0.85 : r * 0.38;
        pts.push({ x: x + Math.cos(a) * rad, y: y + Math.sin(a) * rad + r * 0.05 });
      }
      g.fillStyle(0xf1c46c, 1);
      g.fillPoints(pts, true);
      g.lineStyle(2.4, OUT, 1);
      g.strokePoints(pts, true, true);
      break;
    }
    case 'leaf': {
      const pts = [{ x: x - r * 0.7, y: y + r * 0.6 }, { x: x - r * 0.5, y: y - r * 0.2 }, { x: x + r * 0.1, y: y - r * 0.75 }, { x: x + r * 0.8, y: y - r * 0.7 }, { x: x + r * 0.7, y: y + r * 0.0 }, { x: x + r * 0.1, y: y + r * 0.6 }];
      g.fillStyle(0x9cc291, 1);
      g.fillPoints(pts, true);
      g.lineStyle(2.4, OUT, 1);
      g.strokePoints(pts, true, true);
      g.beginPath();
      g.moveTo(x - r * 0.6, y + r * 0.7);
      g.lineTo(x + r * 0.5, y - r * 0.45);
      g.strokePath();
      break;
    }
    case 'auto': {
      g.lineStyle(3, 0x606b79, 1);
      g.beginPath();
      g.arc(x, y, r * 0.55, 0.4, 2.9, false);
      g.strokePath();
      g.beginPath();
      g.arc(x, y, r * 0.55, 3.55, 6.05, false);
      g.strokePath();
      g.fillStyle(0x606b79, 1);
      g.fillTriangle(x - r * 0.62, y + r * 0.35, x - r * 0.25, y + r * 0.6, x - r * 0.85, y + r * 0.7);
      g.fillTriangle(x + r * 0.62, y - r * 0.35, x + r * 0.25, y - r * 0.6, x + r * 0.85, y - r * 0.7);
      break;
    }
    default:
      break;
  }
}

export function heart(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, fill: number, outline: number): void {
  g.fillStyle(outline, 1);
  g.fillCircle(x - r * 0.34, y - r * 0.2, r * 0.46);
  g.fillCircle(x + r * 0.34, y - r * 0.2, r * 0.46);
  g.fillTriangle(x - r * 0.78, y - r * 0.02, x + r * 0.78, y - r * 0.02, x, y + r * 0.85);
  g.fillStyle(fill, 1);
  g.fillCircle(x - r * 0.34, y - r * 0.2, r * 0.38);
  g.fillCircle(x + r * 0.34, y - r * 0.2, r * 0.38);
  g.fillTriangle(x - r * 0.7, y, x + r * 0.7, y, x, y + r * 0.76);
  g.fillStyle(0xffffff, 0.55);
  g.fillCircle(x - r * 0.42, y - r * 0.32, r * 0.1);
}

export function cloud(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, col: number): void {
  g.fillStyle(col, 1);
  g.lineStyle(2.2, OUT, 1);
  for (const [dx, dy, rr] of [[-0.45, 0.1, 0.35], [0, -0.15, 0.48], [0.46, 0.1, 0.34]] as [number, number, number][]) {
    g.fillCircle(x + dx * r, y + dy * r, rr * r);
  }
  g.fillRoundedRect(x - 0.8 * r, y - 0.02 * r, 1.6 * r, 0.42 * r, r * 0.2);
  g.strokeCircle(x, y - 0.15 * r, 0.48 * r);
  g.fillStyle(0xffffff, 0.35);
  g.fillCircle(x - 0.15 * r, y - 0.3 * r, 0.14 * r);
}

function swirl(g: Phaser.GameObjects.Graphics, x: number, y: number, len: number, dir: number): void {
  g.beginPath();
  g.moveTo(x - len * 0.5, y);
  g.lineTo(x + len * 0.35, y);
  g.arc(x + len * 0.35, y - len * 0.16, len * 0.16, Math.PI / 2, dir ? -Math.PI * 0.2 : -Math.PI * 1.1, true);
  g.strokePath();
}

function mosquito(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, col: number): void {
  g.fillStyle(0xeaf1fb, 0.9);
  g.lineStyle(1.8, OUT, 1);
  g.fillEllipse(x - r * 0.15, y - r * 0.55, r * 0.7, r * 0.5);
  g.fillEllipse(x + r * 0.2, y - r * 0.6, r * 0.7, r * 0.5);
  g.strokeEllipse(x - r * 0.15, y - r * 0.55, r * 0.7, r * 0.5);
  g.strokeEllipse(x + r * 0.2, y - r * 0.6, r * 0.7, r * 0.5);
  g.fillStyle(col, 1);
  g.lineStyle(2, OUT, 1);
  g.fillEllipse(x - r * 0.1, y + r * 0.05, r * 0.9, r * 0.5);
  g.strokeEllipse(x - r * 0.1, y + r * 0.05, r * 0.9, r * 0.5);
  g.fillCircle(x + r * 0.42, y - r * 0.05, r * 0.24);
  g.strokeCircle(x + r * 0.42, y - r * 0.05, r * 0.24);
  g.lineStyle(2, OUT, 1);
  g.beginPath();
  g.moveTo(x + r * 0.6, y);
  g.lineTo(x + r * 0.98, y + r * 0.12);
  for (const lx of [-0.4, -0.1, 0.2]) {
    g.moveTo(x + lx * r, y + r * 0.25);
    g.lineTo(x + (lx - 0.12) * r, y + r * 0.6);
  }
  g.strokePath();
}
