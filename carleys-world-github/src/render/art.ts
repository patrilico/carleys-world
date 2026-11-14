import Phaser from 'phaser';
import { BASKET, BED, DOOR_TOP_Y, FLOOR_Y, GARDEN_POT, WALL_LEFT_X, WALL_OUTER_X, WINDOW_RECT, WORLD_H, WORLD_W, ZONE_SPLIT_X } from '../config/worldLayout';

const OUT = '#855c4d';
const OUT_SOFT = 'rgba(138,90,72,0.7)';

type Ctx = CanvasRenderingContext2D;

function canvas(scene: Phaser.Scene, key: string, w: number, h: number): Ctx {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const tex = scene.textures.createCanvas(key, w, h);
  return tex!.getContext();
}

function refresh(scene: Phaser.Scene, key: string): void {
  (scene.textures.get(key) as Phaser.Textures.CanvasTexture).refresh();
}

function rr(c: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function fillOut(c: Ctx, fill: string | CanvasGradient, lw = 2.5, stroke = OUT): void {
  c.fillStyle = fill;
  c.fill();
  c.lineWidth = lw;
  c.strokeStyle = stroke;
  c.lineJoin = 'round';
  c.stroke();
}

function lin(c: Ctx, x0: number, y0: number, x1: number, y1: number, stops: [number, string][]): CanvasGradient {
  const g = c.createLinearGradient(x0, y0, x1, y1);
  for (const [o, col] of stops) g.addColorStop(o, col);
  return g;
}

// ---------------------------------------------------------------------------------------------------------
//  Landscape: distant hills + trees (sits behind everything outdoors, and shows through the window)
// ---------------------------------------------------------------------------------------------------------
export function paintHills(scene: Phaser.Scene): void {
  const c = canvas(scene, 'hills', WORLD_W, 330);
  // mid green hills
  const mid = lin(c, 0, 150, 0, 330, [[0, '#bad4aa'], [1, '#99bf94']]);
  c.beginPath();
  c.moveTo(0, 210);
  c.bezierCurveTo(180, 140, 330, 160, 500, 215);
  c.bezierCurveTo(640, 255, 800, 150, 980, 180);
  c.bezierCurveTo(1100, 200, 1200, 170, 1280, 190);
  c.lineTo(1280, 330);
  c.lineTo(0, 330);
  c.closePath();
  c.fillStyle = mid;
  c.fill();
  // lollipop trees on the hills
  const trees: [number, number, number][] = [[640, 200, 1], [700, 196, 0.8], [880, 168, 1.1], [1010, 178, 0.9], [1190, 176, 1.2], [90, 190, 1], [560, 214, 0.7]];
  for (const [x, y, s] of trees) {
    c.fillStyle = '#b3957d';
    c.fillRect(x - 2 * s, y, 4 * s, 22 * s);
    c.beginPath();
    c.arc(x, y - 4 * s, 15 * s, 0, Math.PI * 2);
    c.fillStyle = '#84b383';
    c.fill();
    c.beginPath();
    c.arc(x - 4 * s, y - 8 * s, 7 * s, 0, Math.PI * 2);
    c.fillStyle = '#a1c99d';
    c.fill();
  }
  // front rolling meadow band
  const front = lin(c, 0, 250, 0, 330, [[0, '#b0cda0'], [1, '#9cc091']]);
  c.beginPath();
  c.moveTo(0, 262);
  c.bezierCurveTo(200, 236, 420, 270, 640, 250);
  c.bezierCurveTo(860, 232, 1060, 268, 1280, 244);
  c.lineTo(1280, 330);
  c.lineTo(0, 330);
  c.closePath();
  c.fillStyle = front;
  c.fill();
  refresh(scene, 'hills');
}

// ---------------------------------------------------------------------------------------------------------
//  Cottage cutaway (roof, walls with window hole, floor, doorway, decor)
// ---------------------------------------------------------------------------------------------------------
export function paintHouse(scene: Phaser.Scene): void {
  const W = 580;
  const c = canvas(scene, 'house', W, WORLD_H);
  const ceilY = 214;

  // ---- back wall (wallpaper) with a hole for the window ----
  const wallpaper = lin(c, 0, ceilY, 0, 560, [[0, '#fceee0'], [1, '#fbe1d0']]);
  c.fillStyle = wallpaper;
  const wx0 = WALL_LEFT_X;
  const wx1 = ZONE_SPLIT_X - 12;
  const win = WINDOW_RECT;
  c.fillRect(wx0, ceilY, wx1 - wx0, win.y - ceilY);
  c.fillRect(wx0, win.y, win.x - wx0, win.h);
  c.fillRect(win.x + win.w, win.y, wx1 - (win.x + win.w), win.h);
  c.fillRect(wx0, win.y + win.h, wx1 - wx0, FLOOR_Y - win.y - win.h);
  // wallpaper stripes + tiny flowers (skip the window hole)
  c.save();
  c.beginPath();
  c.rect(wx0, ceilY, wx1 - wx0, FLOOR_Y - ceilY);
  c.rect(win.x, win.y, win.w, win.h);
  c.clip('evenodd');
  c.fillStyle = 'rgba(255,200,180,0.35)';
  for (let x = wx0 + 10; x < wx1; x += 34) c.fillRect(x, ceilY, 12, FLOOR_Y - ceilY);
  for (let y = ceilY + 24; y < 500; y += 46) {
    for (let x = wx0 + 28; x < wx1; x += 68) {
      c.fillStyle = 'rgba(255,150,170,0.45)';
      c.beginPath();
      c.arc(x + ((y / 46) % 2) * 34, y, 3, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = 'rgba(255,225,150,0.7)';
      c.beginPath();
      c.arc(x + ((y / 46) % 2) * 34, y, 1.2, 0, Math.PI * 2);
      c.fill();
    }
  }
  c.restore();
  // wainscot
  c.fillStyle = '#f3d4cc';
  c.fillRect(wx0, 520, wx1 - wx0, FLOOR_Y - 520);
  c.strokeStyle = 'rgba(190,130,120,0.5)';
  c.lineWidth = 1.5;
  for (let x = wx0 + 22; x < wx1; x += 22) {
    c.beginPath();
    c.moveTo(x, 526);
    c.lineTo(x, FLOOR_Y);
    c.stroke();
  }
  c.fillStyle = '#fef4ed';
  c.fillRect(wx0, 516, wx1 - wx0, 8);
  c.strokeStyle = OUT_SOFT;
  c.strokeRect(wx0, 516, wx1 - wx0, 8);
  // baseboard
  c.fillStyle = '#fef4ed';
  c.fillRect(wx0, FLOOR_Y - 9, wx1 - wx0, 9);

  // ---- floor ----
  const fl = lin(c, 0, FLOOR_Y, 0, FLOOR_Y + 50, [[0, '#e6c19a'], [1, '#d0a57b']]);
  c.fillStyle = fl;
  c.fillRect(0, FLOOR_Y, WALL_OUTER_X + 14, 52);
  c.strokeStyle = 'rgba(140,90,60,0.35)';
  c.lineWidth = 1.5;
  for (let x = 0; x < WALL_OUTER_X + 14; x += 58) {
    c.beginPath();
    c.moveTo(x, FLOOR_Y);
    c.lineTo(x - 10, FLOOR_Y + 52);
    c.stroke();
  }
  c.beginPath();
  c.moveTo(0, FLOOR_Y + 20);
  c.lineTo(WALL_OUTER_X + 14, FLOOR_Y + 20);
  c.stroke();
  c.fillStyle = '#c19168';
  c.fillRect(0, FLOOR_Y + 50, WALL_OUTER_X + 14, 6);
  // foundation
  c.fillStyle = '#c4b3a7';
  c.fillRect(0, FLOOR_Y + 56, WALL_OUTER_X + 14, WORLD_H - FLOOR_Y - 56);
  c.strokeStyle = 'rgba(120,95,80,0.4)';
  for (let y = FLOOR_Y + 70; y < WORLD_H; y += 22) {
    c.beginPath();
    c.moveTo(0, y);
    c.lineTo(WALL_OUTER_X + 14, y);
    c.stroke();
  }

  // ---- ceiling beam ----
  c.beginPath();
  c.rect(0, 190, WALL_OUTER_X + 14, 26);
  fillOut(c, lin(c, 0, 190, 0, 216, [[0, '#d1a57c'], [1, '#bc8b64']]), 2.5);
  c.strokeStyle = 'rgba(120,70,40,0.35)';
  c.lineWidth = 1.5;
  for (let x = 40; x < WALL_OUTER_X; x += 90) {
    c.beginPath();
    c.moveTo(x, 194);
    c.lineTo(x + 30, 212);
    c.stroke();
  }

  // ---- left wall post ----
  c.beginPath();
  c.rect(0, 190, WALL_LEFT_X + 2, FLOOR_Y - 190 + 8);
  fillOut(c, lin(c, 0, 0, WALL_LEFT_X, 0, [[0, '#c89a70'], [1, '#ddb790']]), 2.5);
  // ---- right wall above the doorway ----
  c.beginPath();
  c.rect(ZONE_SPLIT_X - 14, 190, 28, DOOR_TOP_Y - 190);
  fillOut(c, lin(c, ZONE_SPLIT_X - 14, 0, ZONE_SPLIT_X + 14, 0, [[0, '#ddb790'], [1, '#c79a70']]), 2.5);
  // ---- door: teal frame, arched trim, open leaf swung outward, lantern, step ----
  const dx = ZONE_SPLIT_X;
  // open door leaf (perspective: hinged on the outer post, swung toward the viewer)
  c.beginPath();
  c.moveTo(dx + 17, DOOR_TOP_Y + 14);
  c.lineTo(dx + 50, DOOR_TOP_Y + 24);
  c.lineTo(dx + 50, FLOOR_Y - 8);
  c.lineTo(dx + 17, FLOOR_Y);
  c.closePath();
  fillOut(c, lin(c, dx + 17, 0, dx + 50, 0, [[0, '#8ac5bc'], [1, '#6baca3']]), 2.6);
  c.strokeStyle = 'rgba(40,110,100,0.55)';
  c.lineWidth = 1.8;
  for (const [y0, y1] of [[DOOR_TOP_Y + 32, DOOR_TOP_Y + 66], [DOOR_TOP_Y + 80, FLOOR_Y - 22]] as [number, number][]) {
    c.beginPath();
    c.moveTo(dx + 23, y0);
    c.lineTo(dx + 44, y0 + 5);
    c.lineTo(dx + 44, y1 - 2);
    c.lineTo(dx + 23, y1 + 2);
    c.closePath();
    c.stroke();
  }
  // little round window + knob on the leaf
  c.beginPath();
  c.ellipse(dx + 33, DOOR_TOP_Y + 49, 6, 8, 0, 0, Math.PI * 2);
  fillOut(c, '#dcf1f9', 1.8);
  c.beginPath();
  c.arc(dx + 45, DOOR_TOP_Y + 98, 3, 0, Math.PI * 2);
  fillOut(c, '#f1c46c', 1.6);
  // hinges
  c.fillStyle = '#e5b458';
  for (const hy of [DOOR_TOP_Y + 30, FLOOR_Y - 26]) c.fillRect(dx + 15, hy, 5, 9);
  // frame posts and lintel
  c.beginPath();
  c.rect(dx - 17, DOOR_TOP_Y - 4, 36, 18);
  fillOut(c, '#99cfc6', 2.5);
  c.beginPath();
  c.rect(dx - 17, DOOR_TOP_Y + 14, 7, FLOOR_Y - DOOR_TOP_Y - 14);
  fillOut(c, '#99cfc6', 2.2);
  c.beginPath();
  c.rect(dx + 12, DOOR_TOP_Y + 14, 7, FLOOR_Y - DOOR_TOP_Y - 14);
  fillOut(c, '#99cfc6', 2.2);
  // decorative trim above the door with a keystone
  c.beginPath();
  c.moveTo(dx - 24, DOOR_TOP_Y - 4);
  c.quadraticCurveTo(dx, DOOR_TOP_Y - 34, dx + 26, DOOR_TOP_Y - 4);
  c.lineTo(dx + 19, DOOR_TOP_Y - 4);
  c.quadraticCurveTo(dx, DOOR_TOP_Y - 24, dx - 17, DOOR_TOP_Y - 4);
  c.closePath();
  fillOut(c, '#fdf3ea', 2.2);
  c.beginPath();
  c.rect(dx - 4, DOOR_TOP_Y - 26, 8, 12);
  fillOut(c, '#f7dbd3', 1.8);
  // doorstep
  c.beginPath();
  rr(c, dx - 22, FLOOR_Y - 2, 48, 9, 3);
  fillOut(c, '#d7ccc4', 2);
  // lantern on the outer wall
  c.strokeStyle = OUT;
  c.lineWidth = 2.4;
  c.beginPath();
  c.moveTo(dx + 14, 372);
  c.lineTo(dx + 36, 372);
  c.lineTo(dx + 36, 380);
  c.stroke();
  c.beginPath();
  rr(c, dx + 29, 380, 14, 20, 4);
  fillOut(c, '#f6dfa9', 2);
  c.fillStyle = '#e5b458';
  c.fillRect(dx + 28, 377, 16, 4);
  c.fillRect(dx + 28, 399, 16, 4);

  // chimney
  c.beginPath();
  rr(c, 420, 76, 34, 110, 4);
  fillOut(c, '#e3b6a5', 2.5);
  c.beginPath();
  rr(c, 414, 68, 46, 14, 4);
  fillOut(c, '#fdf0e6', 2.5);

  // ---- roof (cutaway gable) ----
  c.save();
  c.beginPath();
  c.moveTo(-18, 200);
  c.lineTo(WALL_OUTER_X / 2 + 8, 78);
  c.lineTo(WALL_OUTER_X + 30, 200);
  c.closePath();
  c.fillStyle = lin(c, 0, 78, 0, 200, [[0, '#edb4a2'], [1, '#e09687']]);
  c.fill();
  c.clip();
  // tile rows
  for (let row = 0; row < 8; row++) {
    const y = 86 + row * 15.5;
    c.strokeStyle = 'rgba(160,80,70,0.4)';
    c.lineWidth = 1.6;
    for (let x = -30 + (row % 2) * 14; x < WALL_OUTER_X + 40; x += 28) {
      c.beginPath();
      c.arc(x + 14, y, 14, 0.15 * Math.PI, 0.85 * Math.PI);
      c.stroke();
    }
  }
  c.restore();
  c.beginPath();
  c.moveTo(-18, 200);
  c.lineTo(WALL_OUTER_X / 2 + 8, 78);
  c.lineTo(WALL_OUTER_X + 30, 200);
  c.closePath();
  c.lineWidth = 3;
  c.strokeStyle = OUT;
  c.lineJoin = 'round';
  c.stroke();
  // fascia board
  c.beginPath();
  c.moveTo(-22, 200);
  c.lineTo(WALL_OUTER_X + 34, 200);
  c.lineTo(WALL_OUTER_X + 34, 211);
  c.lineTo(-22, 211);
  c.closePath();
  fillOut(c, '#fdf0e6', 2.5);
  // ---- window frame, curtains, sill ----
  paintWindow(c);

  // ---- wall decor ----
  paintFrame(c, 62, 352, 54, 66, 'sun');
  paintFrame(c, 132, 400, 38, 38, 'heart');
  // bookshelf above the armchair
  c.beginPath();
  rr(c, 340, 404, 64, 8, 2);
  fillOut(c, '#d1a57c', 2.2);
  const books = ['#eeb5a4', '#9fc7ef', '#f2c878', '#b0cda0', '#a7c2e5', '#f5a384', '#8bc8c5', '#f1c1b4'];
  let bx = 346;
  for (let i = 0; i < 5; i++) {
    const bh = 26 + ((i * 7) % 10);
    c.beginPath();
    c.rect(bx, 404 - bh, 9, bh);
    fillOut(c, books[i], 1.8);
    bx += 10.5;
  }
  // lamp sconces
  for (const [lx, ly] of [[140, 360], [440, 360]] as [number, number][]) {
    if (lx === 440) continue;
    paintLamp(c, lx, ly);
  }
  paintLamp(c, 484, 360);
  // string of fairy lights along the beam
  c.strokeStyle = 'rgba(138,90,72,0.8)';
  c.lineWidth = 1.8;
  c.beginPath();
  c.moveTo(30, 218);
  c.bezierCurveTo(120, 252, 200, 252, 262, 218);
  c.bezierCurveTo(330, 252, 410, 252, 494, 218);
  c.stroke();
  const bulbCols = ['#f5d6cd', '#f7e8b0', '#d0ecf7', '#c3d5ee'];
  for (let i = 0; i < 9; i++) {
    const t = i / 8;
    const bx2 = 40 + t * 440;
    const by2 = 218 + Math.sin(t * Math.PI * 2) * 0 + 24 * Math.sin((t * 2 % 1) * Math.PI) * 0.95;
    c.beginPath();
    c.arc(bx2, by2 + 3, 4, 0, Math.PI * 2);
    c.fillStyle = bulbCols[i % 4];
    c.fill();
    c.strokeStyle = OUT_SOFT;
    c.lineWidth = 1.2;
    c.stroke();
  }
  refresh(scene, 'house');
  // silhouette of the cottage (window and doorway stay empty) used to dim ONLY the house at night
  {
    const src = scene.textures.get('house').getSourceImage() as CanvasImageSource;
    const sc = canvas(scene, 'houseShade', W, WORLD_H);
    sc.drawImage(src, 0, 0);
    sc.globalCompositeOperation = 'source-in';
    sc.fillStyle = '#ffffff';
    sc.fillRect(0, 0, W, WORLD_H);
    refresh(scene, 'houseShade');
  }
}

function paintLamp(c: Ctx, x: number, y: number): void {
  c.strokeStyle = OUT;
  c.lineWidth = 2.5;
  c.beginPath();
  c.moveTo(x, y + 26);
  c.lineTo(x, y + 6);
  c.stroke();
  c.beginPath();
  c.moveTo(x - 13, y + 8);
  c.lineTo(x + 13, y + 8);
  c.lineTo(x + 8, y - 12);
  c.lineTo(x - 8, y - 12);
  c.closePath();
  fillOut(c, '#faeac7', 2.5);
  c.beginPath();
  c.arc(x, y + 8, 4, 0, Math.PI * 2);
  c.fillStyle = '#f4d995';
  c.fill();
}

function paintFrame(c: Ctx, x: number, y: number, w: number, h: number, kind: 'sun' | 'heart'): void {
  c.beginPath();
  rr(c, x, y, w, h, 5);
  fillOut(c, '#fdf4ea', 3);
  c.beginPath();
  rr(c, x + 5, y + 5, w - 10, h - 10, 3);
  c.fillStyle = kind === 'sun' ? '#d1eaf7' : '#f8e0d9';
  c.fill();
  c.strokeStyle = OUT_SOFT;
  c.lineWidth = 1.5;
  c.stroke();
  if (kind === 'sun') {
    c.fillStyle = '#f1c46c';
    c.beginPath();
    c.arc(x + w * 0.65, y + h * 0.35, 7, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#b0cda0';
    c.beginPath();
    c.moveTo(x + 5, y + h - 5);
    c.quadraticCurveTo(x + w * 0.4, y + h * 0.5, x + w - 5, y + h - 5);
    c.fill();
  } else {
    c.fillStyle = '#e99f8a';
    const cx = x + w / 2;
    const cy = y + h / 2;
    c.beginPath();
    c.arc(cx - 5, cy - 3, 6, 0, Math.PI * 2);
    c.arc(cx + 5, cy - 3, 6, 0, Math.PI * 2);
    c.moveTo(cx - 10.5, cy - 1);
    c.lineTo(cx, cy + 12);
    c.lineTo(cx + 10.5, cy - 1);
    c.fill();
  }
}

function paintWindow(c: Ctx): void {
  const { x, y, w, h } = WINDOW_RECT;
  // outer frame
  c.lineWidth = 3;
  c.strokeStyle = OUT;
  c.lineJoin = 'round';
  c.strokeRect(x - 7, y - 7, w + 14, h + 14);
  c.lineWidth = 8;
  c.strokeStyle = '#fef6ef';
  c.strokeRect(x - 3, y - 3, w + 6, h + 6);
  c.lineWidth = 2.5;
  c.strokeStyle = OUT;
  c.strokeRect(x, y, w, h);
  // mullions
  c.fillStyle = '#fef6ef';
  c.fillRect(x + w / 2 - 3, y, 6, h);
  c.fillRect(x, y + h / 2 - 3, w, 6);
  c.lineWidth = 1.8;
  c.strokeRect(x + w / 2 - 3, y, 6, h);
  c.strokeRect(x, y + h / 2 - 3, w, 6);
  // glass sheen
  c.fillStyle = 'rgba(255,255,255,0.22)';
  for (let i = 0; i < 2; i++) {
    c.beginPath();
    c.moveTo(x + 10 + i * 56, y + 6);
    c.lineTo(x + 26 + i * 56, y + 6);
    c.lineTo(x + 8 + i * 56, y + 50);
    c.lineTo(x - 2 + i * 56, y + 50);
    c.closePath();
    c.fill();
  }
  // sill
  c.beginPath();
  rr(c, x - 14, y + h + 5, w + 28, 10, 3);
  fillOut(c, '#ebcfad', 2.5);
  // flower pot on the sill
  c.beginPath();
  rr(c, x + 14, y + h - 9, 20, 14, 3);
  fillOut(c, '#f7b497', 2);
  c.fillStyle = '#86bb84';
  c.beginPath();
  c.arc(x + 24, y + h - 8, 11, Math.PI, 0);
  c.fill();
  c.strokeStyle = '#679b66';
  c.lineWidth = 2;
  for (const sx of [18, 25, 31]) {
    c.beginPath();
    c.moveTo(x + 24, y + h - 8);
    c.lineTo(x + sx, y + h - 20);
    c.stroke();
  }
  for (const [fx, fy, col] of [[x + 18, y + h - 20, '#eba997'], [x + 25, y + h - 23, '#f7e6b0'], [x + 31, y + h - 19, '#b1c9e8']] as [number, number, string][]) {
    c.fillStyle = col;
    c.beginPath();
    c.arc(fx, fy, 3.4, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = OUT_SOFT;
    c.lineWidth = 1;
    c.stroke();
  }
  // curtains + valance
  for (const side of [-1, 1]) {
    const cx = side < 0 ? x - 8 : x + w + 8;
    c.beginPath();
    c.moveTo(cx - side * 2, y - 12);
    c.quadraticCurveTo(cx + side * 22, y + h * 0.5, cx + side * 6, y + h + 2);
    c.lineTo(cx - side * 30, y + h + 2);
    c.quadraticCurveTo(cx - side * 12, y + h * 0.5, cx - side * 22, y - 12);
    c.closePath();
    fillOut(c, lin(c, cx - 28, 0, cx + 28, 0, [[0, '#f3cabf'], [1, '#eeb4a4']]), 2.5);
    c.strokeStyle = 'rgba(210,100,130,0.5)';
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(cx - side * 12, y - 4);
    c.quadraticCurveTo(cx - side * 2, y + h * 0.5, cx - side * 14, y + h);
    c.stroke();
    // tie-back
    c.beginPath();
    rr(c, cx - 13, y + h * 0.58, 22, 5, 2);
    fillOut(c, '#f7e6b0', 1.8);
  }
  c.beginPath();
  rr(c, x - 22, y - 20, w + 44, 14, 6);
  fillOut(c, '#f1c2b4', 2.5);
  for (let i = 0; i < 9; i++) {
    c.beginPath();
    c.arc(x - 16 + i * ((w + 32) / 8), y - 6, 6, 0, Math.PI);
    fillOut(c, '#f4d0c6', 1.8);
  }
}

// ---------------------------------------------------------------------------------------------------------
//  Furniture (static, behind Carley)
// ---------------------------------------------------------------------------------------------------------
export function paintFurniture(scene: Phaser.Scene): void {
  // bed
  {
    const w = BED.w + 30;
    const h = 110;
    const c = canvas(scene, 'bed', w, h);
    const x0 = 8;
    const top = h - (FLOOR_Y - BED.topY) - 0;
    // headboard
    c.beginPath();
    rr(c, x0 - 4, top - 56, 16, 56 + (FLOOR_Y - BED.topY) - 2, 6);
    fillOut(c, lin(c, 0, 0, 16, 0, [[0, '#d1a57c'], [1, '#bc8b64']]), 2.8);
    c.beginPath();
    rr(c, x0 + BED.w - 6, top - 24, 12, 24 + (FLOOR_Y - BED.topY) - 2, 5);
    fillOut(c, '#c79a70', 2.8);
    // frame
    c.beginPath();
    rr(c, x0 + 8, top + 8, BED.w - 12, FLOOR_Y - BED.topY - 8, 4);
    fillOut(c, '#d1a57c', 2.8);
    // mattress
    c.beginPath();
    rr(c, x0 + 6, top - 4, BED.w - 8, 16, 7);
    fillOut(c, '#fef8f3', 2.8);
    // quilt (pastel w/ scallops)
    c.beginPath();
    rr(c, x0 + 40, top - 7, BED.w - 44, 14, 6);
    fillOut(c, lin(c, 0, 0, BED.w, 0, [[0, '#b7cdea'], [1, '#bdd4f4']]), 2.5);
    c.fillStyle = 'rgba(255,255,255,0.55)';
    for (let i = 0; i < 6; i++) {
      c.beginPath();
      c.arc(x0 + 54 + i * 18, top, 3, 0, Math.PI * 2);
      c.fill();
    }
    // pillow
    c.beginPath();
    rr(c, x0 + 12, top - 14, 34, 16, 8);
    fillOut(c, '#f8e0d9', 2.6);
    c.strokeStyle = 'rgba(220,130,160,0.6)';
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(x0 + 20, top - 7);
    c.lineTo(x0 + 38, top - 7);
    c.stroke();
    refresh(scene, 'bed');
  }
  // side table with vase (behind the window)
  {
    const c = canvas(scene, 'table', 90, 110);
    // legs
    c.strokeStyle = OUT;
    c.lineWidth = 3;
    for (const lx of [24, 66]) {
      c.beginPath();
      c.moveTo(lx, 62);
      c.lineTo(lx + (lx < 45 ? -4 : 4), 106);
      c.stroke();
      c.strokeStyle = '#bc8b64';
      c.lineWidth = 6;
      c.beginPath();
      c.moveTo(lx, 62);
      c.lineTo(lx + (lx < 45 ? -4 : 4), 106);
      c.stroke();
      c.strokeStyle = OUT;
      c.lineWidth = 3;
    }
    c.beginPath();
    c.ellipse(45, 58, 38, 9, 0, 0, Math.PI * 2);
    fillOut(c, lin(c, 0, 50, 0, 68, [[0, '#ebcfad'], [1, '#d5ae85']]), 2.8);
    c.beginPath();
    rr(c, 8, 60, 74, 6, 3);
    c.fillStyle = '#bc8b64';
    c.fill();
    // vase with flowers
    c.beginPath();
    c.moveTo(36, 54);
    c.quadraticCurveTo(28, 38, 38, 30);
    c.lineTo(52, 30);
    c.quadraticCurveTo(62, 38, 54, 54);
    c.closePath();
    fillOut(c, '#c8e2f6', 2.4);
    for (const [fx, fy, col, s] of [[40, 16, '#eba997', 6], [48, 12, '#f7e6b0', 6], [54, 20, '#b1c9e8', 5], [45, 22, '#f7b497', 5]] as [number, number, string, number][]) {
      c.strokeStyle = '#76aa75';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(45, 32);
      c.lineTo(fx, fy);
      c.stroke();
      c.beginPath();
      c.arc(fx, fy, s, 0, Math.PI * 2);
      fillOut(c, col, 1.6);
      c.fillStyle = '#faf0cd';
      c.beginPath();
      c.arc(fx, fy, 2, 0, Math.PI * 2);
      c.fill();
    }
    refresh(scene, 'table');
  }
  // toy basket (solid)
  {
    const c = canvas(scene, 'basket', 52, 56);
    const bw = BASKET.w + 8;
    const bh = FLOOR_Y - BASKET.topY;
    // toys poking out
    c.beginPath();
    c.arc(18, 12, 7, 0, Math.PI * 2);
    fillOut(c, '#eeb5a4', 2);
    c.beginPath();
    rr(c, 26, 4, 12, 12, 3);
    fillOut(c, '#9fc7ef', 2);
    c.fillStyle = '#fff';
    c.font = 'bold 9px sans-serif';
    c.fillText('A', 29, 14);
    c.beginPath();
    rr(c, 2, 14, bw, bh + 8, 6);
    fillOut(c, lin(c, 0, 14, 0, 14 + bh, [[0, '#e8ca92'], [1, '#d0a765']]), 2.5);
    c.strokeStyle = 'rgba(140,90,50,0.55)';
    c.lineWidth = 1.5;
    for (let i = 1; i < 4; i++) {
      c.beginPath();
      c.moveTo(4, 14 + i * 8);
      c.lineTo(bw, 14 + i * 8);
      c.stroke();
    }
    for (let i = 1; i < 5; i++) {
      c.beginPath();
      c.moveTo(2 + i * (bw / 5), 16);
      c.lineTo(2 + i * (bw / 5), 14 + bh + 6);
      c.stroke();
    }
    refresh(scene, 'basket');
  }
  // armchair (back + seat)
  {
    const c = canvas(scene, 'armchair', 110, 120);
    // back
    c.beginPath();
    rr(c, 14, 8, 68, 78, 22);
    fillOut(c, lin(c, 0, 8, 0, 86, [[0, '#f3cdc2'], [1, '#eeb4a4']]), 3);
    c.fillStyle = 'rgba(255,255,255,0.35)';
    for (let i = 0; i < 3; i++) {
      c.beginPath();
      c.arc(32 + i * 16, 36, 3.5, 0, Math.PI * 2);
      c.fill();
    }
    // seat
    c.beginPath();
    rr(c, 8, 74, 80, 30, 12);
    fillOut(c, lin(c, 0, 74, 0, 104, [[0, '#f5d5cc'], [1, '#efbcad']]), 3);
    // armrests
    for (const ax of [2, 80]) {
      c.beginPath();
      rr(c, ax, 62, 16, 46, 8);
      fillOut(c, '#f0c0b2', 3);
    }
    // legs
    c.fillStyle = '#bc8b64';
    for (const lx of [14, 78]) {
      c.fillRect(lx, 106, 8, 12);
      c.strokeStyle = OUT;
      c.lineWidth = 2;
      c.strokeRect(lx, 106, 8, 12);
    }
    // cushion
    c.beginPath();
    rr(c, 34, 66, 26, 16, 6);
    fillOut(c, '#f7e6b0', 2.4);
    refresh(scene, 'armchair');
  }
  // easel
  {
    const c = canvas(scene, 'easel', 80, 160);
    c.strokeStyle = OUT;
    c.lineCap = 'round';
    for (const [x1, y1, x2, y2] of [[20, 154, 34, 20], [60, 154, 46, 20], [40, 154, 40, 24]]) {
      c.lineWidth = 8;
      c.strokeStyle = OUT;
      c.beginPath();
      c.moveTo(x1, y1);
      c.lineTo(x2, y2);
      c.stroke();
      c.lineWidth = 4.5;
      c.strokeStyle = '#d1a57c';
      c.beginPath();
      c.moveTo(x1, y1);
      c.lineTo(x2, y2);
      c.stroke();
    }
    // tray
    c.beginPath();
    rr(c, 14, 96, 52, 7, 2);
    fillOut(c, '#e1b88d', 2.4);
    // paint pots on tray
    for (const [px, col] of [[22, '#eba997'], [34, '#83b6eb'], [46, '#f2dd77'], [58, '#91c591']] as [number, string][]) {
      c.beginPath();
      rr(c, px - 4, 88, 8, 8, 2);
      fillOut(c, col, 1.6);
    }
    refresh(scene, 'easel');
  }
  // rug
  {
    const c = canvas(scene, 'rug', 240, 26);
    c.beginPath();
    c.ellipse(120, 13, 116, 10, 0, 0, Math.PI * 2);
    fillOut(c, lin(c, 0, 0, 240, 0, [[0, '#f6d9d1'], [0.5, '#f9e3be'], [1, '#dce9f9']]), 2.4);
    c.beginPath();
    c.ellipse(120, 13, 92, 6.5, 0, 0, Math.PI * 2);
    c.strokeStyle = 'rgba(255,255,255,0.8)';
    c.lineWidth = 2;
    c.stroke();
    refresh(scene, 'rug');
  }
  // quilt overlay (drawn above her while she sleeps)
  {
    const c = canvas(scene, 'quilt', 120, 40);
    c.beginPath();
    c.moveTo(6, 30);
    c.quadraticCurveTo(0, 8, 22, 6);
    c.lineTo(100, 8);
    c.quadraticCurveTo(116, 12, 114, 30);
    c.closePath();
    fillOut(c, lin(c, 0, 0, 120, 0, [[0, '#b7cdea'], [1, '#b6d1f3']]), 2.6);
    c.fillStyle = 'rgba(255,255,255,0.55)';
    for (let i = 0; i < 6; i++) for (let j = 0; j < 2; j++) {
      c.beginPath();
      c.arc(24 + i * 15, 14 + j * 10, 2.6, 0, Math.PI * 2);
      c.fill();
    }
    c.strokeStyle = 'rgba(255,255,255,0.9)';
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(14, 8);
    c.quadraticCurveTo(60, 2, 102, 9);
    c.stroke();
    refresh(scene, 'quilt');
  }
  // watering-can stand
  {
    const c = canvas(scene, 'canStand', 70, 50);
    c.beginPath();
    rr(c, 4, 18, 62, 10, 3);
    fillOut(c, '#e1b88d', 2.4);
    c.beginPath();
    rr(c, 8, 28, 8, 22, 2);
    fillOut(c, '#d1a57c', 2.2);
    c.beginPath();
    rr(c, 54, 28, 8, 22, 2);
    fillOut(c, '#d1a57c', 2.2);
    refresh(scene, 'canStand');
  }
  // blanket
  {
    const c = canvas(scene, 'blanket', 190, 30);
    c.beginPath();
    c.moveTo(14, 22);
    c.lineTo(34, 4);
    c.lineTo(166, 4);
    c.lineTo(182, 22);
    c.closePath();
    fillOut(c, '#f8e2db', 2.6);
    c.save();
    c.clip();
    c.fillStyle = 'rgba(255,150,185,0.55)';
    for (let x = 14; x < 190; x += 20) c.fillRect(x, 0, 10, 30);
    c.fillStyle = 'rgba(255,150,185,0.4)';
    for (let y = 4; y < 24; y += 10) c.fillRect(0, y, 190, 5);
    c.restore();
    c.beginPath();
    c.moveTo(14, 22);
    c.lineTo(34, 4);
    c.lineTo(166, 4);
    c.lineTo(182, 22);
    c.closePath();
    c.lineWidth = 2.6;
    c.strokeStyle = OUT;
    c.stroke();
    // tassels
    c.strokeStyle = '#eeb4a4';
    c.lineWidth = 2;
    for (let x = 18; x < 182; x += 12) {
      c.beginPath();
      c.moveTo(x, 22);
      c.lineTo(x - 1, 27);
      c.stroke();
    }
    refresh(scene, 'blanket');
  }
  // garden pot (solid obstacle)
  {
    const c = canvas(scene, 'gardenPot', GARDEN_POT.w + 24, 70);
    const pw = GARDEN_POT.w;
    const ph = FLOOR_Y - GARDEN_POT.topY;
    const ox = 12;
    // flowers
    for (const [fx, fy, col] of [[ox + pw / 2 - 8, 14, '#eba997'], [ox + pw / 2 + 4, 8, '#f7e6b0'], [ox + pw / 2 + 12, 18, '#b1c9e8']] as [number, number, string][]) {
      c.strokeStyle = '#76aa75';
      c.lineWidth = 2.4;
      c.beginPath();
      c.moveTo(ox + pw / 2, 70 - ph);
      c.lineTo(fx, fy + 4);
      c.stroke();
      c.beginPath();
      c.arc(fx, fy, 6, 0, Math.PI * 2);
      fillOut(c, col, 1.8);
      c.fillStyle = '#f8eab7';
      c.beginPath();
      c.arc(fx, fy, 2.2, 0, Math.PI * 2);
      c.fill();
    }
    c.fillStyle = '#86bb84';
    c.beginPath();
    c.ellipse(ox + pw / 2, 70 - ph + 3, pw / 2 + 4, 7, 0, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.moveTo(ox - 2, 70 - ph);
    c.lineTo(ox + pw + 2, 70 - ph);
    c.lineTo(ox + pw - 5, 70);
    c.lineTo(ox + 5, 70);
    c.closePath();
    fillOut(c, lin(c, 0, 70 - ph, 0, 70, [[0, '#f7b497'], [1, '#e6947a']]), 2.6);
    c.fillStyle = 'rgba(255,255,255,0.35)';
    c.fillRect(ox + 3, 70 - ph + 4, 6, ph - 10);
    refresh(scene, 'gardenPot');
  }
}

// ---------------------------------------------------------------------------------------------------------
//  Ground, fence, stepping stones
// ---------------------------------------------------------------------------------------------------------
export function paintGround(scene: Phaser.Scene): void {
  const gh = WORLD_H - FLOOR_Y + 40;
  const c = canvas(scene, 'ground', WORLD_W, gh);
  const gx0 = WALL_OUTER_X - 8;
  // grass strip
  c.fillStyle = lin(c, 0, 36, 0, gh, [[0, '#b2d19b'], [0.35, '#9dc18b'], [1, '#78a474']]);
  c.fillRect(gx0, 36, WORLD_W - gx0, gh - 36);
  // grass edge (scallops)
  c.fillStyle = '#c0d9a0';
  c.beginPath();
  c.moveTo(gx0, 40);
  for (let x = gx0; x < WORLD_W + 20; x += 16) c.quadraticCurveTo(x + 8, 28 + ((x / 16) % 2) * 3, x + 16, 40);
  c.lineTo(WORLD_W, 48);
  c.lineTo(gx0, 48);
  c.closePath();
  c.fill();
  c.strokeStyle = 'rgba(80,140,80,0.5)';
  c.lineWidth = 1.5;
  for (let i = 0; i < 90; i++) {
    const x = gx0 + ((i * 97) % (WORLD_W - gx0));
    const y = 54 + ((i * 53) % (gh - 70));
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x - 2, y - 5);
    c.moveTo(x, y);
    c.lineTo(x + 2, y - 5);
    c.stroke();
  }
  // flowerbed soil mound
  c.beginPath();
  c.ellipse(765, 44, 190, 12, 0, 0, Math.PI * 2);
  fillOut(c, lin(c, 0, 32, 0, 56, [[0, '#a17356'], [1, '#845a44']]), 2.4);
  c.fillStyle = 'rgba(70,40,25,0.25)';
  for (let i = 0; i < 24; i++) {
    c.beginPath();
    c.arc(595 + i * 15.5, 43 + ((i * 7) % 5) - 2, 1.8, 0, Math.PI * 2);
    c.fill();
  }
  // stepping stones from the door
  for (let i = 0; i < 4; i++) {
    c.beginPath();
    c.ellipse(548 + i * 17, 47 + (i % 2) * 5, 11, 4.2, 0, 0, Math.PI * 2);
    fillOut(c, '#e6dcd2', 1.8);
  }
  // blanket shadow patch
  c.fillStyle = 'rgba(70,120,70,0.18)';
  c.beginPath();
  c.ellipse(1030, 46, 98, 7, 0, 0, Math.PI * 2);
  c.fill();
  refresh(scene, 'ground');

  // fence
  const f = canvas(scene, 'fence', WORLD_W - WALL_OUTER_X, 70);
  f.fillStyle = '#fef6ef';
  f.strokeStyle = OUT;
  f.lineWidth = 2.4;
  f.lineJoin = 'round';
  for (let x = 8; x < WORLD_W - WALL_OUTER_X; x += 26) {
    f.beginPath();
    f.moveTo(x, 70);
    f.lineTo(x, 18);
    f.lineTo(x + 9, 8);
    f.lineTo(x + 18, 18);
    f.lineTo(x + 18, 70);
    f.closePath();
    f.fill();
    f.stroke();
  }
  f.fillStyle = '#f3e4d6';
  for (const y of [28, 52]) {
    f.fillRect(0, y, WORLD_W - WALL_OUTER_X, 7);
    f.strokeRect(0, y, WORLD_W - WALL_OUTER_X, 7);
  }
  refresh(scene, 'fence');
}

// ---------------------------------------------------------------------------------------------------------
//  Soft light textures
// ---------------------------------------------------------------------------------------------------------
export function paintLights(scene: Phaser.Scene): void {
  // radial glow
  {
    const c = canvas(scene, 'glow', 256, 256);
    const g = c.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.45)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 256, 256);
    refresh(scene, 'glow');
  }
  // outdoor shade overlay with a soft left edge
  {
    const c = canvas(scene, 'shade', WORLD_W - ZONE_SPLIT_X + 40, WORLD_H);
    const g = c.createLinearGradient(0, 0, 60, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(1, 'rgba(255,255,255,1)');
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, WORLD_W, WORLD_H);
    c.globalCompositeOperation = 'destination-in';
    const mask = c.createLinearGradient(0, 0, 64, 0);
    mask.addColorStop(0, 'rgba(0,0,0,0)');
    mask.addColorStop(1, 'rgba(0,0,0,1)');
    c.fillStyle = mask;
    c.fillRect(0, 0, WORLD_W, WORLD_H);
    void g;
    refresh(scene, 'shade');
  }
  // warm door-light on the grass at night
  {
    const c = canvas(scene, 'doorLight', 220, 120);
    const g = c.createLinearGradient(0, 0, 220, 0);
    g.addColorStop(0, 'rgba(255,214,140,0.9)');
    g.addColorStop(1, 'rgba(255,214,140,0)');
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(0, 18);
    c.lineTo(220, 60);
    c.lineTo(220, 120);
    c.lineTo(0, 120);
    c.closePath();
    c.fill();
    refresh(scene, 'doorLight');
  }
  // moon (crescent with glow)
  {
    const c = canvas(scene, 'moon', 120, 120);
    const g = c.createRadialGradient(60, 60, 8, 60, 60, 58);
    g.addColorStop(0, 'rgba(255,250,220,0.55)');
    g.addColorStop(1, 'rgba(255,250,220,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 120, 120);
    c.save();
    c.beginPath();
    c.arc(60, 60, 24, 0, Math.PI * 2);
    c.fillStyle = '#fbf4dc';
    c.fill();
    c.globalCompositeOperation = 'destination-out';
    c.beginPath();
    c.arc(72, 52, 21, 0, Math.PI * 2);
    c.fill();
    c.restore();
    c.strokeStyle = 'rgba(200,190,150,0.7)';
    c.lineWidth = 1.5;
    c.beginPath();
    c.arc(60, 60, 24, 0.6, 2.9);
    c.stroke();
    refresh(scene, 'moon');
  }
  // clouds
  for (let k = 0; k < 3; k++) {
    const c = canvas(scene, `cloud${k}`, 260, 110);
    const blobs: [number, number, number][] =
      k === 0
        ? [[60, 70, 36], [110, 52, 44], [160, 60, 40], [205, 74, 30], [130, 82, 40]]
        : k === 1
        ? [[50, 72, 30], [95, 56, 38], [145, 64, 34], [190, 78, 24], [110, 84, 34]]
        : [[70, 74, 32], [120, 50, 42], [170, 66, 36], [215, 80, 26], [150, 86, 36]];
    c.fillStyle = 'rgba(120,140,170,0.25)';
    for (const [x, y, r] of blobs) {
      c.beginPath();
      c.arc(x, y + 6, r, 0, Math.PI * 2);
      c.fill();
    }
    c.fillStyle = '#ffffff';
    for (const [x, y, r] of blobs) {
      c.beginPath();
      c.arc(x, y, r, 0, Math.PI * 2);
      c.fill();
    }
    const g = c.createLinearGradient(0, 40, 0, 110);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(1, 'rgba(170,190,215,0.35)');
    c.fillStyle = g;
    c.globalCompositeOperation = 'source-atop';
    c.fillRect(0, 0, 260, 110);
    c.globalCompositeOperation = 'source-over';
    refresh(scene, `cloud${k}`);
  }
}

/** Subtle paper grain and warm vignette laid over the whole scene. */
export function paintFinish(scene: Phaser.Scene): void {
  const g = canvas(scene, 'grain', 256, 256);
  const img = g.createImageData(256, 256);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 90 + Math.random() * 120;
    img.data[i] = v;
    img.data[i + 1] = v * 0.94;
    img.data[i + 2] = v * 0.86;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  refresh(scene, 'grain');
  const v = canvas(scene, 'vignette', WORLD_W, WORLD_H);
  const grad = v.createRadialGradient(WORLD_W / 2, WORLD_H / 2, WORLD_H * 0.45, WORLD_W / 2, WORLD_H / 2, WORLD_W * 0.62);
  grad.addColorStop(0, 'rgba(60,35,20,0)');
  grad.addColorStop(1, 'rgba(60,35,20,0.5)');
  v.fillStyle = grad;
  v.fillRect(0, 0, WORLD_W, WORLD_H);
  refresh(scene, 'vignette');
}

export const ART_DEPTH = {
  sky: 0, celestial: 1, hills: 2, clouds: 3, fenceBack: 8, house: 10, furniture: 12, glow: 13, ground: 20, gardenBack: 24, tree: 26, fenceFront: 28,
  carley: 50, quilt: 55, foreground: 60, shade: 70, nightGlow: 72, weather: 74, thought: 80
};
