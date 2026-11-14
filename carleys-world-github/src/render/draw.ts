import type Phaser from 'phaser';

export interface P2 {
  x: number;
  y: number;
}

/** Colour palette shared by the character and props (soft pastel, warm brown outlines). */
export const COL = {
  outline: 0x6a4436,
  outlineSoft: 0x956d5c,
  skin: 0xfce5d5,
  skinShade: 0xfad1bd,
  blush: 0xedb2a0,
  hair: 0xf1ca74,
  hairLight: 0xf7e6ae,
  hairDark: 0xdaa856,
  hairDeep: 0xc8973e,
  brow: 0xb68844,
  irisTop: 0x5482c9,
  irisBottom: 0x97caee,
  pupil: 0x1f2f58,
  topPink: 0xeeb4a4,
  topPinkDark: 0xdd9b89,
  white: 0xffffff,
  cream: 0xfef6ef,
  shoe: 0x855c4d,
  sock: 0xffffff,
  bow: 0xe6947d,
  mouthInner: 0x875248,
  tongue: 0xeaa193,
  tear: 0xacd8f2
};

/** Catmull-Rom closed spline through points -> dense polyline. */
export function smoothClosed(pts: P2[], seg = 5): P2[] {
  const out: P2[] = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    for (let s = 0; s < seg; s++) {
      const t = s / seg;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push({
        x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3)
      });
    }
  }
  return out;
}

/** Catmull-Rom open spline. */
export function smoothOpen(pts: P2[], seg = 5): P2[] {
  const out: P2[] = [];
  const n = pts.length;
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(n - 1, i + 2)];
    for (let s = 0; s < seg; s++) {
      const t = s / seg;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push({
        x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3)
      });
    }
  }
  out.push(pts[n - 1]);
  return out;
}

/** Quadratic bezier sampled into points. */
export function quad(a: P2, c: P2, b: P2, n = 10): P2[] {
  const out: P2[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    out.push({ x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y });
  }
  return out;
}

export function shape(g: Phaser.GameObjects.Graphics, pts: P2[], fill: number, stroke: number | null, lw = 2, alpha = 1): void {
  g.fillStyle(fill, alpha);
  g.fillPoints(pts as Phaser.Types.Math.Vector2Like[], true, true);
  if (stroke !== null) {
    g.lineStyle(lw, stroke, alpha);
    g.strokePoints(pts as Phaser.Types.Math.Vector2Like[], true, true);
  }
}

/** Round-capped limb segment with outline. */
export function limb(g: Phaser.GameObjects.Graphics, a: P2, b: P2, w: number, fill: number, outline: number, ow = 1.8): void {
  g.lineStyle(w + ow * 2, outline, 1);
  g.beginPath();
  g.moveTo(a.x, a.y);
  g.lineTo(b.x, b.y);
  g.strokePath();
  g.fillStyle(outline, 1);
  g.fillCircle(a.x, a.y, w / 2 + ow);
  g.fillCircle(b.x, b.y, w / 2 + ow);
  g.lineStyle(w, fill, 1);
  g.beginPath();
  g.moveTo(a.x, a.y);
  g.lineTo(b.x, b.y);
  g.strokePath();
  g.fillStyle(fill, 1);
  g.fillCircle(a.x, a.y, w / 2);
  g.fillCircle(b.x, b.y, w / 2);
}

export function polyline(g: Phaser.GameObjects.Graphics, pts: P2[], w: number, color: number, alpha = 1): void {
  g.lineStyle(w, color, alpha);
  g.strokePoints(pts as Phaser.Types.Math.Vector2Like[], false, false);
}

export function star4(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, color: number, alpha = 1): void {
  g.fillStyle(color, alpha);
  g.fillPoints(
    [
      { x, y: y - r }, { x: x + r * 0.28, y: y - r * 0.28 }, { x: x + r, y }, { x: x + r * 0.28, y: y + r * 0.28 },
      { x, y: y + r }, { x: x - r * 0.28, y: y + r * 0.28 }, { x: x - r, y }, { x: x - r * 0.28, y: y - r * 0.28 }
    ],
    true,
    true
  );
}

export const rotPt = (p: P2, a: number): P2 => ({ x: p.x * Math.cos(a) - p.y * Math.sin(a), y: p.x * Math.sin(a) + p.y * Math.cos(a) });
