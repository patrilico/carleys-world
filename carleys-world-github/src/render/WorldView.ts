import Phaser from 'phaser';
import { GAME_CONFIG } from '../config/gameConfig';
import { WALL_LEFT_X, BASKET, BED, FLOOR_Y, GARDEN_POT, LAMPS, WALL_OUTER_X, WINDOW_RECT, WORLD_H, WORLD_RIGHT_X, WORLD_W, ZONE_SPLIT_X } from '../config/worldLayout';
import { clamp, clamp01, lerp, smoothstep } from '../core/math';
import type { Plant } from '../entities/Plant';
import type { Simulation } from '../sim/Simulation';
import { ART_DEPTH } from './art';
import { COL, polyline, quad, shape, smoothClosed, star4, type P2 } from './draw';

// ----------------------------------------------------------------------------------------------------
//  colour helpers
// ----------------------------------------------------------------------------------------------------
export function mixColor(a: number, b: number, t: number): number {
  t = clamp01(t);
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t);
}

type SkyKey = [number, number, number];
const SKY_KEYS: SkyKey[] = [
  [0, 0x181f40, 0x36416d],
  [4.6, 0x212951, 0x404e7e],
  [5.9, 0x6874ab, 0xf6a98e],
  [7.3, 0x9bc9e5, 0xfbe3ca],
  [9, 0x8fc4e4, 0xdef0fa],
  [12, 0x71b5de, 0xcbe7f6],
  [16.5, 0x7fbce1, 0xd9ecf9],
  [18.4, 0x879cb8, 0xf7bd96],
  [19.7, 0x4e627c, 0xf48c7b],
  [20.9, 0x22264c, 0x474f84],
  [24, 0x181f40, 0x36416d]
];

function skyColors(hour: number): { top: number; bottom: number } {
  for (let i = 0; i < SKY_KEYS.length - 1; i++) {
    const a = SKY_KEYS[i];
    const b = SKY_KEYS[i + 1];
    if (hour >= a[0] && hour <= b[0]) {
      const t = (hour - a[0]) / (b[0] - a[0]);
      return { top: mixColor(a[1], b[1], t), bottom: mixColor(a[2], b[2], t) };
    }
  }
  return { top: SKY_KEYS[0][1], bottom: SKY_KEYS[0][2] };
}

/** Composite alpha layers (colour, alpha) into one for the outdoor light overlay. */
function compositeLayers(layers: [number, number][]): { color: number; alpha: number } {
  let color = 0;
  let alpha = 0;
  for (const [c, a] of layers) {
    if (a <= 0.001) continue;
    const total = alpha + a * (1 - alpha);
    color = alpha <= 0 ? c : mixColor(color, c, (a * (1 - alpha)) / total);
    alpha = total;
  }
  return { color, alpha };
}

// ----------------------------------------------------------------------------------------------------
//  Sky, celestial bodies, clouds
// ----------------------------------------------------------------------------------------------------
export class SkyView {
  private sky: Phaser.GameObjects.Graphics;
  private sun: Phaser.GameObjects.Graphics;
  private sunGlow: Phaser.GameObjects.Image;
  private moon: Phaser.GameObjects.Image;
  private stars: Phaser.GameObjects.Graphics;
  private clouds: { img: Phaser.GameObjects.Image; x: number; y: number; speed: number; thresh: number; scale: number }[] = [];
  private starPts: { x: number; y: number; r: number; p: number }[] = [];
  private hills: Phaser.GameObjects.Image;
  private t = 0;

  constructor(scene: Phaser.Scene) {
    this.sky = scene.add.graphics().setDepth(ART_DEPTH.sky);
    this.stars = scene.add.graphics().setDepth(ART_DEPTH.sky + 0.2);
    this.sunGlow = scene.add.image(0, 0, 'glow').setDepth(ART_DEPTH.celestial).setBlendMode(Phaser.BlendModes.ADD).setScale(2.6);
    this.sun = scene.add.graphics().setDepth(ART_DEPTH.celestial + 0.1);
    this.moon = scene.add.image(0, 0, 'moon').setDepth(ART_DEPTH.celestial);
    this.hills = scene.add.image(0, 270, 'hills').setOrigin(0, 0).setDepth(ART_DEPTH.hills);
    for (let i = 0; i < 80; i++) {
      this.starPts.push({ x: (i * 211 + 37) % WORLD_W, y: (i * 97 + 13) % 300 + 20, r: 1 + (i % 3) * 0.6, p: i * 1.7 });
    }
    for (let i = 0; i < 7; i++) {
      const img = scene.add.image(0, 0, `cloud${i % 3}`).setDepth(ART_DEPTH.clouds);
      this.clouds.push({ img, x: (i * 260) % (WORLD_W + 300) - 100, y: 60 + ((i * 53) % 150), speed: 5 + (i % 3) * 3, thresh: i / 7, scale: 0.8 + (i % 3) * 0.3 });
    }
  }

  update(dt: number, sim: Simulation): void {
    this.t += dt;
    const hour = sim.clock.hour;
    const w = sim.weather;
    const day = sim.clock.daylight;
    const { top, bottom } = skyColors(hour);
    // overcast / rain greys
    const grayTop = mixColor(0x1f2432, 0x99a6b5, day);
    const grayBot = mixColor(0x2e3444, 0xd2d9df, day);
    const overcast = clamp01(w.cloud * 0.8) * (1 - w.sun * 0.6);
    const rainDark = w.rain * 0.45;
    let ct = mixColor(top, grayTop, overcast * 0.75);
    let cb = mixColor(bottom, grayBot, overcast * 0.75);
    ct = mixColor(ct, 0x525c6e, rainDark);
    cb = mixColor(cb, 0x8b95a2, rainDark);
    const s = this.sky;
    s.clear();
    s.fillGradientStyle(ct, ct, cb, cb, 1);
    s.fillRect(0, 0, WORLD_W, 600);

    // stars
    const starA = clamp01((1 - day - 0.15) * 1.6) * (1 - clamp01(w.cloud * 0.85));
    const st = this.stars;
    st.clear();
    if (starA > 0.02) {
      for (const p of this.starPts) {
        const tw = 0.55 + 0.45 * Math.sin(this.t * 1.7 + p.p);
        star4(st, p.x, p.y, p.r * 2.2, 0xfbf4dc, starA * tw);
      }
    }

    // sun
    const sg = this.sun;
    sg.clear();
    const sunUp = sim.clock.sunUp;
    const prog = sim.clock.sunProgress;
    const sx = 80 + 1120 * prog;
    const sy = 395 - 300 * Math.sin(Math.PI * prog);
    const sunVis = sunUp ? clamp01(1 - w.cloud * 0.55 * (1 - w.sun) - w.rain * 0.7) : 0;
    this.sunGlow.setVisible(sunVis > 0.02);
    if (sunVis > 0.02) {
      const gold = sim.clock.goldenHour;
      const col = mixColor(0xf6e6a9, 0xf39d66, gold);
      this.sunGlow.setPosition(sx, sy).setTint(col).setAlpha(0.55 * sunVis);
      const rot = this.t * 0.15;
      sg.lineStyle(4, col, 0.55 * sunVis);
      for (let i = 0; i < 12; i++) {
        const a = rot + (i * Math.PI) / 6;
        sg.beginPath();
        sg.moveTo(sx + Math.cos(a) * 38, sy + Math.sin(a) * 38);
        sg.lineTo(sx + Math.cos(a) * (50 + (i % 2) * 9), sy + Math.sin(a) * (50 + (i % 2) * 9));
        sg.strokePath();
      }
      sg.fillStyle(col, sunVis);
      sg.fillCircle(sx, sy, 30);
      sg.lineStyle(3, 0xe6a263, 0.75 * sunVis);
      sg.strokeCircle(sx, sy, 30);
      sg.fillStyle(0xffffff, 0.35 * sunVis);
      sg.fillCircle(sx - 8, sy - 9, 8);
    }

    // moon
    const night = 1 - day;
    const mp = sim.clock.moonProgress;
    const mx = 110 + 1060 * mp;
    const my = 390 - 290 * Math.sin(Math.PI * mp);
    this.moon.setPosition(mx, my).setAlpha(clamp01((night - 0.25) * 1.5) * (1 - w.cloud * 0.6)).setVisible(night > 0.3);

    // clouds drift with the wind and fade with cover
    const wind = w.windStrength;
    for (const c of this.clouds) {
      c.x += (c.speed + wind * 70) * dt;
      if (c.x > WORLD_W + 200) c.x = -220;
      const vis = smoothstep(c.thresh - 0.1, c.thresh + 0.18, w.cloud);
      const dark = clamp01(w.rain * 0.8 + (1 - w.sun) * w.cloud * 0.35);
      c.img.setPosition(c.x, c.y + Math.sin(this.t * 0.2 + c.thresh * 9) * 3).setScale(c.scale * (1 + w.cloud * 0.3));
      c.img.setAlpha(vis * (0.75 + 0.2 * w.cloud));
      c.img.setTint(mixColor(0xffffff, 0x939cab, dark));
      c.img.setVisible(vis > 0.02);
    }
    void sim;
  }
}

// ----------------------------------------------------------------------------------------------------
//  House & decor (static art + dynamic lights, painting, props at rest)
// ----------------------------------------------------------------------------------------------------
export class HouseView {
  private lampGlow: Phaser.GameObjects.Image[] = [];
  private doorLight!: Phaser.GameObjects.Image;
  private glowMask!: Phaser.Display.Masks.GeometryMask;
  private roomGlow: Phaser.GameObjects.Image;
  private quilt: Phaser.GameObjects.Image;
  private canvasG: Phaser.GameObjects.Graphics;
  private props: Phaser.GameObjects.Graphics;
  private windowDim: Phaser.GameObjects.Rectangle;
  private nightDim: Phaser.GameObjects.Rectangle;
  private nightRamp: Phaser.GameObjects.Image;
  private dimRamp: Phaser.GameObjects.Image;
  private t = 0;

  constructor(private scene: Phaser.Scene) {
    this.nightDim = scene.add
      .rectangle(0, 60, 560, 600, 0x1b222c, 0)
      .setOrigin(0, 0)
      .setDepth(58);
    // sky/hills dim inside the window rect so night looks consistent with outdoors
    // the sky/hills behind and above the cottage get the same dimming as the outdoors overlay
    this.windowDim = scene.add.rectangle(0, 0, 560, FLOOR_Y, 0x131939, 0).setOrigin(0, 0).setDepth(4);
    this.nightRamp = scene.add.image(0, 0, 'houseShade').setOrigin(0, 0).setDepth(58).setAlpha(0).setTint(0x1b222c);
    this.dimRamp = scene.add.image(564, 0, 'shade').setOrigin(0, 0).setScale(-1, 1).setDepth(4).setAlpha(0);
    scene.add.image(0, 0, 'house').setOrigin(0, 0).setDepth(ART_DEPTH.house);
    scene.add.image(150, FLOOR_Y - 102 + 4, 'rug').setDepth(ART_DEPTH.house + 0.5).setVisible(false);
    scene.add.image(340, FLOOR_Y - 13, 'rug').setDepth(ART_DEPTH.house + 0.5);
    // furniture
    scene.add.image(BED.x - 8, FLOOR_Y - 110, 'bed').setOrigin(0, 0).setDepth(ART_DEPTH.furniture);
    scene.add.image(262, FLOOR_Y - 106, 'table').setOrigin(0.5, 0).setDepth(ART_DEPTH.furniture);
    scene.add.image(BASKET.x - 4, FLOOR_Y - 56, 'basket').setOrigin(0, 0).setDepth(ART_DEPTH.furniture + 0.2);
    scene.add.image(366, 496, 'armchair').setOrigin(0.5, 0).setScale(0.88).setDepth(ART_DEPTH.furniture);
    scene.add.image(452, FLOOR_Y - 160, 'easel').setOrigin(0.5, 0).setDepth(ART_DEPTH.furniture);
    this.canvasG = scene.add.graphics().setDepth(ART_DEPTH.furniture + 0.3);
    this.props = scene.add.graphics().setDepth(ART_DEPTH.furniture + 0.6);

    for (const l of LAMPS) {
      this.lampGlow.push(scene.add.image(l.x, l.y + 8, 'glow').setDepth(ART_DEPTH.glow).setBlendMode(Phaser.BlendModes.ADD).setScale(1.7).setTint(0xf5cf84).setAlpha(0.2));
    }
    {
      const m = scene.make.graphics({}, false);
      m.fillRect(WALL_LEFT_X + 2, 214, ZONE_SPLIT_X - 14 - WALL_LEFT_X, FLOOR_Y - 214);
      const mask = m.createGeometryMask();
      for (const gl of this.lampGlow) gl.setMask(mask);
      this.glowMask = mask;
    }
    this.roomGlow = scene.add.image(260, 420, 'glow').setDepth(ART_DEPTH.glow).setBlendMode(Phaser.BlendModes.ADD).setScale(4.2, 2.6).setTint(0xf6c88c).setAlpha(0.0);
    this.roomGlow.setMask(this.glowMask);
    this.quilt = scene.add.image(BED.x + 100, 551, 'quilt').setDepth(ART_DEPTH.quilt).setAlpha(0).setScale(0.64, 1);
  }

  update(dt: number, sim: Simulation, windowDimColor: number, windowDimAlpha: number): void {
    this.t += dt;
    const night = 1 - sim.clock.daylight;
    // warm interior light stays on and gets stronger as the outdoors darkens
    const flicker = 1 + Math.sin(this.t * 7.3) * 0.025 + Math.sin(this.t * 13.1) * 0.015;
    for (const g of this.lampGlow) g.setAlpha((0.14 + night * 0.2) * flicker);
    this.roomGlow.setAlpha(0.03 + night * 0.05);
    // gentle dimming of the whole interior at night, so the contrast with the dark garden is softer
    this.nightDim.setFillStyle(0x1b222c, 0);
    this.nightRamp.setAlpha(night * 0.3);
    this.windowDim.setFillStyle(windowDimColor, 0);
    this.dimRamp.setTint(windowDimColor).setAlpha(windowDimAlpha);

    // quilt covers her while she sleeps
    const a = sim.agent;
    const asleep = sim.brain.isSleeping || (a.posture === 'lying' && !sim.isOutdoors);
    this.quilt.setAlpha(Phaser.Math.Linear(this.quilt.alpha, asleep ? 0.97 : 0, 1 - Math.exp(-6 * dt)));
    this.quilt.setPosition(BED.x + 120, a.y - 12);

    this.drawPainting(sim);
    this.drawRestingProps(sim);
  }

  private drawPainting(sim: Simulation): void {
    const g = this.canvasG;
    g.clear();
    const cx = 452;
    const cy = 502;
    const w = 46;
    const h = 58;
    const x0 = cx - w / 2;
    const y0 = cy - h / 2;
    g.fillStyle(0xffffff, 1);
    g.fillRect(x0, y0, w, h);
    const p = sim.easel.progress;
    const seed = sim.easel.seed;
    const r = (n: number) => ((Math.sin(seed * 12.9898 + n * 78.233) * 43758.5453) % 1 + 1) % 1;
    const skyCols = [0xc8e4f6, 0xf7dbd3, 0xccdbf0, 0xfaeac7];
    const hillCols = [0xa3c99b, 0x90bc90, 0xb9ce9b];
    const sky = skyCols[Math.floor(r(1) * skyCols.length)];
    const hill = hillCols[Math.floor(r(2) * hillCols.length)];
    // layers fade in with progress
    g.fillStyle(sky, clamp01(p * 5));
    g.fillRect(x0 + 2, y0 + 2, w - 4, h - 4);
    if (p > 0.18) {
      g.fillStyle(hill, clamp01((p - 0.18) * 4));
      g.fillPoints(
        [
          { x: x0 + 2, y: y0 + h - 4 }, { x: x0 + 2, y: y0 + h * 0.62 }, { x: x0 + w * 0.35, y: y0 + h * 0.5 }, { x: x0 + w * 0.7, y: y0 + h * 0.64 },
          { x: x0 + w - 2, y: y0 + h * 0.55 }, { x: x0 + w - 2, y: y0 + h - 4 }
        ],
        true
      );
    }
    if (p > 0.42) {
      g.fillStyle(0xf1c46c, clamp01((p - 0.42) * 5));
      g.fillCircle(x0 + w * (0.25 + r(3) * 0.5), y0 + 14, 6.5);
    }
    if (p > 0.6) {
      const a = clamp01((p - 0.6) * 4);
      for (let i = 0; i < 5; i++) {
        const fx = x0 + 7 + i * 8 + r(i + 5) * 3;
        const fy = y0 + h - 10 - r(i + 9) * 8;
        g.lineStyle(1.5, 0x679b66, a);
        g.beginPath();
        g.moveTo(fx, y0 + h - 4);
        g.lineTo(fx, fy);
        g.strokePath();
        g.fillStyle([0xeba997, 0xf2dd77, 0xb1c9e8, 0xf5a384, 0x83b6eb][i], a);
        g.fillCircle(fx, fy, 3);
      }
    }
    if (p > 0.82) {
      g.fillStyle(0xffffff, clamp01((p - 0.82) * 5) * 0.85);
      g.fillEllipse(x0 + w * 0.65, y0 + 22, 14, 5);
    }
    g.lineStyle(2.4, COL.outline, 1);
    g.strokeRect(x0, y0, w, h);
    // wet wet brush mark while painting
    if (sim.agent.action === 'paint') {
      g.fillStyle(0xe6957d, 0.7);
      g.fillCircle(x0 + 8 + ((sim.easel.stroke * 7) % (w - 16)), y0 + 10 + ((sim.easel.stroke * 3.7) % (h - 24)), 2);
    }
  }

  private drawRestingProps(sim: Simulation): void {
    const g = this.props;
    g.clear();
    const prop = sim.agent.prop;
    // watering can on its stand when not in hand
    if (prop !== 'wateringCan') {
      g.save();
      g.translateCanvas(0, 0);
      const x = 562;
      const y = FLOOR_Y - 55;
      g.fillStyle(0x9bcfdc, 1);
      g.lineStyle(2, COL.outline, 1);
      g.fillRoundedRect(x, y - 15, 22, 16, 4);
      g.strokeRoundedRect(x, y - 15, 22, 16, 4);
      shape(g, [{ x: x + 21, y: y - 6 }, { x: x + 29, y: y - 18 }, { x: x + 32, y: y - 19 }, { x: x + 29, y: y - 14 }, { x: x + 23, y: y - 2 }], 0x9bcfdc, COL.outline, 2);
      g.lineStyle(3, COL.outline, 1);
      g.beginPath();
      g.arc(x + 1, y - 10, 7, -2.8, 0.7, false);
      g.strokePath();
      g.restore();
    }
    // phone on the little table when not in use
    if (prop !== 'phone') {
      g.fillStyle(0xeeb4a4, 1);
      g.lineStyle(1.8, COL.outline, 1);
      g.fillRoundedRect(272, FLOOR_Y - 50 - 5, 14, 6, 2);
      g.strokeRoundedRect(272, FLOOR_Y - 50 - 5, 14, 6, 2);
    }
    // brush rests on the easel tray when not in hand
    if (prop !== 'brush') {
      g.lineStyle(3, COL.outline, 1);
      g.beginPath();
      g.moveTo(436, FLOOR_Y - 66);
      g.lineTo(466, FLOOR_Y - 68);
      g.strokePath();
      g.lineStyle(1.6, 0xd0a265, 1);
      g.beginPath();
      g.moveTo(436, FLOOR_Y - 66);
      g.lineTo(466, FLOOR_Y - 68);
      g.strokePath();
    }
  }
}

// ----------------------------------------------------------------------------------------------------
//  Garden: ground, fence, plants, tree, shrubs, grass tufts, flowerpot, blanket
// ----------------------------------------------------------------------------------------------------
export class GardenView {
  private plantsG: Phaser.GameObjects.Graphics;
  private treeG: Phaser.GameObjects.Graphics;
  private frontG: Phaser.GameObjects.Graphics;
  private pot: Phaser.GameObjects.Image;
  private wobble = 0;
  private t = 0;
  /** swaying offset 0..1 of vegetation, exposed for effects */
  sway = 0;

  constructor(private scene: Phaser.Scene) {
    scene.add.image(0, FLOOR_Y - 36, 'ground').setOrigin(0, 0).setDepth(ART_DEPTH.ground);
    scene.add.image(WALL_OUTER_X, FLOOR_Y - 70, 'fence').setOrigin(0, 0).setDepth(ART_DEPTH.fenceBack);
    scene.add.image(1030, FLOOR_Y + 8, 'blanket').setOrigin(0.5, 1).setDepth(ART_DEPTH.ground + 1);
    scene.add.image(574, FLOOR_Y - 50, 'canStand').setOrigin(0.5, 0).setDepth(ART_DEPTH.ground + 1);
    this.pot = scene.add.image(GARDEN_POT.x + GARDEN_POT.w / 2, FLOOR_Y, 'gardenPot').setOrigin(0.5, 1).setDepth(ART_DEPTH.gardenBack + 4);
    this.plantsG = scene.add.graphics().setDepth(ART_DEPTH.gardenBack + 2);
    this.treeG = scene.add.graphics().setDepth(ART_DEPTH.tree);
    this.frontG = scene.add.graphics().setDepth(ART_DEPTH.foreground);
    // the first column of ground art (x < house edge) is hidden by the cottage floor, nothing to do
  }

  wobblePot(): void {
    this.wobble = 1;
  }

  private acc = 0;

  update(dtIn: number, sim: Simulation): void {
    // plants, tree and grass are many small paths: redraw at ~30Hz (their motion is slow and smooth)
    this.acc += dtIn;
    if (this.acc < 1 / 32) return;
    const dt = this.acc;
    this.acc = 0;
    this.t += dt;
    const wind = sim.weather.windStrength;
    this.sway = Math.sin(this.t * (1.3 + wind * 2.2)) * (0.15 + wind * 0.85);
    this.wobble = Math.max(0, this.wobble - dt * 0.7);
    this.pot.setRotation(Math.sin(this.t * 22) * 0.16 * this.wobble * this.wobble + this.sway * 0.01);
    this.drawPlants(sim, wind);
    this.drawTree(wind, sim);
    this.drawFront(wind);
  }

  private drawPlants(sim: Simulation, wind: number): void {
    const g = this.plantsG;
    g.clear();
    for (const p of sim.plants) this.drawPlant(g, p, wind);
  }

  private drawPlant(g: Phaser.GameObjects.Graphics, p: Plant, wind: number): void {
    const s = p.state;
    const base = FLOOR_Y - 4;
    const gr = clamp01(s.growth / 100);
    const h = 26 + gr * 36;
    const dry = clamp01((32 - s.moisture) / 32);
    const wilt = s.health < 35 ? 1 : clamp01((50 - s.health) / 30) * 0.6;
    const droop = Math.max(dry * 0.7, wilt);
    const sway = Math.sin(this.t * (1.5 + wind * 2) + p.x * 0.05) * (1.5 + wind * 6) + this.sway * 2;
    const topX = p.x + sway + droop * 15;
    const topY = base - h * (1 - droop * 0.32) + droop * 4;
    const stemCol = mixColor(0x79ad75, 0x9c9161, droop);
    const leafCol = mixColor(0x8ec088, 0xb19c68, droop);
    const ctrl: P2 = { x: p.x + sway * 0.3 + droop * 8, y: base - h * 0.62 };
    const pts = quad({ x: p.x, y: base }, ctrl, { x: topX, y: topY }, 10);
    polyline(g, pts, 6.4, COL.outlineSoft as number, 1);
    polyline(g, pts, 3.6, stemCol, 1);
    // leaves
    for (const [t, side] of [[0.32, -1], [0.55, 1]] as [number, number][]) {
      const q = pts[Math.round(t * 10)];
      const lx = q.x + side * 8;
      const ly = q.y - 3 + droop * 5;
      shape(g, [{ x: q.x, y: q.y }, { x: lx - side * 1, y: ly - 5 }, { x: lx + side * 4, y: ly }, { x: lx - side * 1, y: ly + 4 }], leafCol, COL.outlineSoft, 1.6);
    }
    const scale = 0.55 + gr * 0.55;
    // water droplets / pulse glow
    if (p.pulse > 0.02) {
      g.lineStyle(2.5, 0xf6e7a9, p.pulse * 0.9);
      g.strokeCircle(topX, topY, 16 + (1 - p.pulse) * 24);
      for (let i = 0; i < 4; i++) {
        const a = this.t * 2 + i * 1.57;
        star4(g, topX + Math.cos(a) * (12 + (1 - p.pulse) * 14), topY + Math.sin(a) * (12 + (1 - p.pulse) * 14) - (1 - p.pulse) * 8, 4, 0xffffff, p.pulse);
      }
    }
    const c = mixColor(p.color, 0xb09c7d, droop * 0.8);
    if (!s.flowering) {
      // bud
      g.fillStyle(mixColor(0x8ec088, c, 0.35), 1);
      g.lineStyle(1.8, COL.outlineSoft, 1);
      g.fillEllipse(topX, topY - 3, 8 * scale, 11 * scale);
      g.strokeEllipse(topX, topY - 3, 8 * scale, 11 * scale);
      g.fillStyle(c, 1);
      g.fillEllipse(topX, topY - 6, 4.5 * scale, 5.5 * scale);
      return;
    }
    this.flowerHead(g, p, topX, topY, scale, c, droop);
  }

  private flowerHead(g: Phaser.GameObjects.Graphics, p: Plant, x: number, y: number, sc: number, c: number, droop: number): void {
    const out = COL.outlineSoft as number;
    const dark = mixColor(c, 0x52423d, 0.35);
    switch (p.species) {
      case 'daisy': {
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2 + this.t * 0.05;
          g.save();
          g.translateCanvas(x, y);
          g.rotateCanvas(a);
          g.fillStyle(c, 1);
          g.lineStyle(1.4, out, 1);
          g.fillEllipse(0, -8 * sc, 5 * sc, 10 * sc);
          g.strokeEllipse(0, -8 * sc, 5 * sc, 10 * sc);
          g.restore();
        }
        g.fillStyle(0xefc05a, 1);
        g.fillCircle(x, y, 4.6 * sc);
        g.lineStyle(1.5, out, 1);
        g.strokeCircle(x, y, 4.6 * sc);
        break;
      }
      case 'sunflower': {
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          g.save();
          g.translateCanvas(x, y);
          g.rotateCanvas(a);
          g.fillStyle(0xefc05a, 1);
          g.lineStyle(1.4, out, 1);
          g.fillEllipse(0, -10 * sc, 6 * sc, 11 * sc);
          g.strokeEllipse(0, -10 * sc, 6 * sc, 11 * sc);
          g.restore();
        }
        g.fillStyle(0x845b3e, 1);
        g.fillCircle(x, y, 6.5 * sc);
        g.lineStyle(1.6, out, 1);
        g.strokeCircle(x, y, 6.5 * sc);
        g.fillStyle(0x5a3a28, 1);
        for (let i = 0; i < 5; i++) g.fillCircle(x + Math.cos(i * 1.26) * 3 * sc, y + Math.sin(i * 1.26) * 3 * sc, 1);
        break;
      }
      case 'rose': {
        g.fillStyle(c, 1);
        g.lineStyle(1.6, out, 1);
        g.fillCircle(x, y, 8.5 * sc);
        g.strokeCircle(x, y, 8.5 * sc);
        g.lineStyle(1.8, dark, 0.9);
        g.strokeCircle(x, y, 5.6 * sc);
        g.strokeCircle(x + 1, y - 0.5, 2.8 * sc);
        break;
      }
      case 'lavender': {
        for (let i = 0; i < 7; i++) {
          const yy = y + 8 * sc - i * 4.2 * sc;
          const xx = x + (i % 2 ? 2.2 : -2.2) * sc;
          g.fillStyle(i % 2 ? c : mixColor(c, 0xffffff, 0.25), 1);
          g.lineStyle(1.2, out, 1);
          g.fillEllipse(xx, yy, 5.5 * sc, 5.5 * sc);
          g.strokeEllipse(xx, yy, 5.5 * sc, 5.5 * sc);
        }
        break;
      }
      case 'pansy': {
        const petal = (dx: number, dy: number, col: number, r: number) => {
          g.fillStyle(col, 1);
          g.lineStyle(1.4, out, 1);
          g.fillCircle(x + dx * sc, y + dy * sc, r * sc);
          g.strokeCircle(x + dx * sc, y + dy * sc, r * sc);
        };
        petal(-4.5, -3.5, c, 5.2);
        petal(4.5, -3.5, c, 5.2);
        petal(-5.5, 2.5, mixColor(c, 0xffffff, 0.3), 4.6);
        petal(5.5, 2.5, mixColor(c, 0xffffff, 0.3), 4.6);
        petal(0, 5, 0xf7e6b0, 4.8);
        g.fillStyle(0x414c5a, 1);
        g.fillCircle(x, y, 2.2 * sc);
        break;
      }
      case 'tulip':
      default: {
        const pts = [{ x: x - 7 * sc, y: y - 8 * sc }, { x: x - 6 * sc, y: y + 3 * sc }, { x, y: y + 8 * sc }, { x: x + 6 * sc, y: y + 3 * sc }, { x: x + 7 * sc, y: y - 8 * sc }, { x: x + 3 * sc, y: y - 3 * sc }, { x, y: y - 10 * sc }, { x: x - 3 * sc, y: y - 3 * sc }];
        shape(g, smoothClosed(pts, 4), c, out, 1.8);
        g.lineStyle(1.4, dark, 0.8);
        g.beginPath();
        g.moveTo(x, y - 8 * sc);
        g.lineTo(x, y + 5 * sc);
        g.strokePath();
        break;
      }
    }
    void droop;
  }

  private drawTree(wind: number, sim: Simulation): void {
    const g = this.treeG;
    g.clear();
    const tx = 1176;
    const sway = Math.sin(this.t * (1.1 + wind * 1.8)) * (1.5 + wind * 7) + this.sway * 3;
    // trunk
    const trunk: P2[] = [
      { x: tx - 16, y: FLOOR_Y }, { x: tx - 11, y: 500 }, { x: tx - 9 + sway * 0.1, y: 410 }, { x: tx + 9 + sway * 0.1, y: 410 },
      { x: tx + 11, y: 500 }, { x: tx + 17, y: FLOOR_Y }, { x: tx + 2, y: FLOOR_Y - 6 }, { x: tx - 8, y: FLOOR_Y }
    ];
    shape(g, smoothClosed(trunk, 3), 0xc19a71, COL.outline, 2.6);
    g.lineStyle(2, 0xa17957, 0.8);
    g.beginPath();
    g.moveTo(tx - 4, FLOOR_Y - 10);
    g.lineTo(tx - 3, 440);
    g.moveTo(tx + 5, FLOOR_Y - 20);
    g.lineTo(tx + 4, 470);
    g.strokePath();
    // branches
    g.lineStyle(9, COL.outline, 1);
    g.beginPath();
    g.moveTo(tx, 440);
    g.lineTo(tx - 44 + sway * 0.4, 392);
    g.moveTo(tx, 430);
    g.lineTo(tx + 48 + sway * 0.4, 386);
    g.strokePath();
    g.lineStyle(5.4, 0xc19a71, 1);
    g.beginPath();
    g.moveTo(tx, 440);
    g.lineTo(tx - 44 + sway * 0.4, 392);
    g.moveTo(tx, 430);
    g.lineTo(tx + 48 + sway * 0.4, 386);
    g.strokePath();
    // canopy blobs
    const blobs: [number, number, number][] = [[0, -178, 64], [-54, -148, 48], [56, -152, 50], [-26, -214, 44], [34, -216, 42], [0, -128, 42], [-78, -110, 28], [80, -112, 30]];
    const base = FLOOR_Y;
    const drawBlobs = (grow: number, col: number, off: number) => {
      g.fillStyle(col, 1);
      blobs.forEach(([bx, by, br], i) => {
        const sw = sway * (0.5 + (-by - 100) / 160) + Math.sin(this.t * 1.7 + i) * (0.6 + wind * 2);
        g.fillCircle(tx + bx + sw + off, base + by + off * 0.6, br + grow);
      });
    };
    drawBlobs(3.2, COL.outline, 0);
    drawBlobs(0, 0x84b383, 0);
    drawBlobs(-8, 0x99c494, -6);
    drawBlobs(-26, 0xb2d2a4, -10);
    // blossoms / fruits
    for (let i = 0; i < 9; i++) {
      const a = i * 2.4;
      const bx = tx + Math.cos(a) * (28 + (i % 3) * 18) + sway * 0.9;
      const by = base - 180 + Math.sin(a) * (30 + (i % 4) * 12);
      g.fillStyle(0xf6d9d1, 1);
      g.fillCircle(bx, by, 4);
      g.fillStyle(0xeeb4a4, 1);
      g.fillCircle(bx, by, 1.8);
    }
    void sim;
    // shrub on the far right
    const shx = 1252;
    g.fillStyle(COL.outline, 1);
    g.fillCircle(shx, FLOOR_Y - 20, 29);
    g.fillCircle(shx - 24, FLOOR_Y - 12, 22);
    g.fillStyle(0x84b383, 1);
    g.fillCircle(shx + sway * 0.2, FLOOR_Y - 20, 26);
    g.fillCircle(shx - 24 + sway * 0.2, FLOOR_Y - 12, 19);
    g.fillStyle(0xb2d2a4, 1);
    g.fillCircle(shx - 5, FLOOR_Y - 28, 12);
    g.fillStyle(0xebaa97, 1);
    for (const [bx, by] of [[shx + 8, FLOOR_Y - 14], [shx - 10, FLOOR_Y - 26], [shx - 28, FLOOR_Y - 12], [shx + 14, FLOOR_Y - 28]]) g.fillCircle(bx, by, 2.8);
    // bush by the house corner
    const bx0 = 548;
    g.fillStyle(COL.outline, 1);
    g.fillCircle(bx0 + 10, FLOOR_Y - 14, 20);
    g.fillStyle(0x96bd90, 1);
    g.fillCircle(bx0 + 10 + sway * 0.15, FLOOR_Y - 14, 17);
    g.fillStyle(0xbad7ad, 1);
    g.fillCircle(bx0 + 4, FLOOR_Y - 19, 8);
  }

  private drawFront(wind: number): void {
    const g = this.frontG;
    g.clear();
    // swaying grass tufts + little wildflowers along the ground line
    for (let i = 0; i < 46; i++) {
      const x = WALL_OUTER_X + 18 + i * 16.5 + ((i * 37) % 9);
      if (x > WORLD_RIGHT_X + 10) break;
      const y = FLOOR_Y + 3 + ((i * 13) % 5);
      const s = Math.sin(this.t * (1.8 + wind * 2) + i * 0.7) * (1.5 + wind * 5);
      g.lineStyle(2.2, i % 3 === 0 ? 0x81af7b : 0x98c291, 1);
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x - 3 + s * 0.5, y - 9);
      g.moveTo(x, y);
      g.lineTo(x + s, y - 12);
      g.moveTo(x, y);
      g.lineTo(x + 3 + s * 0.6, y - 8);
      g.strokePath();
      if (i % 7 === 3) {
        g.fillStyle(0xffffff, 1);
        g.fillCircle(x + s, y - 13, 2.6);
        g.fillStyle(0xefc05a, 1);
        g.fillCircle(x + s, y - 13, 1.1);
      }
    }
  }
}

// ----------------------------------------------------------------------------------------------------
//  Weather: rain (outdoors only!), window rain, wind streaks, light overlay
// ----------------------------------------------------------------------------------------------------
interface Drop {
  x: number;
  y: number;
  len: number;
  speed: number;
}

export class WeatherView {
  private rainG: Phaser.GameObjects.Graphics;
  private splashG: Phaser.GameObjects.Graphics;
  private winRainG: Phaser.GameObjects.Graphics;
  private roofG: Phaser.GameObjects.Graphics;
  private skyRainG: Phaser.GameObjects.Graphics;
  private skyDrops: Drop[] = [];
  private roofDrops: { x: number; y: number; v: number }[] = [];
  private roofSplashes: { x: number; y: number; t: number }[] = [];
  private windG: Phaser.GameObjects.Graphics;
  private overlay: Phaser.GameObjects.Image;
  private drops: Drop[] = [];
  private winDrops: { x: number; y: number; v: number; len: number }[] = [];
  private splashes: { x: number; y: number; t: number }[] = [];
  private gustT = 0;
  private t = 0;
  /** exposed for the window dimmer */
  overlayColor = 0xffffff;
  overlayAlpha = 0;

  constructor(private scene: Phaser.Scene) {
    this.overlay = scene.add.image(500, 0, 'shade').setOrigin(0, 0).setDepth(ART_DEPTH.shade);
    this.rainG = scene.add.graphics().setDepth(ART_DEPTH.weather);
    this.splashG = scene.add.graphics().setDepth(ART_DEPTH.weather);
    this.windG = scene.add.graphics().setDepth(ART_DEPTH.weather - 0.1);
    this.winRainG = scene.add.graphics().setDepth(ART_DEPTH.hills + 0.8);
    this.roofG = scene.add.graphics().setDepth(ART_DEPTH.weather);
    // rain in the sky behind/above the cottage (hidden by the house itself)
    this.skyRainG = scene.add.graphics().setDepth(4.6);
    for (let i = 0; i < 90; i++) this.skyDrops.push({ x: Math.random() * (WALL_OUTER_X + 40), y: Math.random() * FLOOR_Y, len: 10 + Math.random() * 12, speed: 480 + Math.random() * 240 });
    const roofMask = scene.make.graphics({}, false);
    roofMask.fillTriangle(-18, 204, 270, 74, 554, 204);
    this.roofG.setMask(roofMask.createGeometryMask());
    for (let i = 0; i < 70; i++) this.roofDrops.push({ x: -10 + Math.random() * 560, y: 60 + Math.random() * 140, v: 380 + Math.random() * 200 });
    // rain is spatially masked to the outdoors (x >= cottage wall), the window rain to the window pane
    const outdoorMask = scene.make.graphics({}, false);
    outdoorMask.fillRect(WALL_OUTER_X, 0, WORLD_W - WALL_OUTER_X + 20, FLOOR_Y + 6);
    const rainMask = outdoorMask.createGeometryMask();
    this.rainG.setMask(rainMask);
    this.windG.setMask(rainMask);
    const winMask = scene.make.graphics({}, false);
    winMask.fillRect(WINDOW_RECT.x, WINDOW_RECT.y, WINDOW_RECT.w, WINDOW_RECT.h);
    this.winRainG.setMask(winMask.createGeometryMask());
    for (let i = 0; i < GAME_CONFIG.limits.maxRaindrops; i++) this.drops.push(this.newDrop(true));
    for (let i = 0; i < 16; i++) this.winDrops.push({ x: WINDOW_RECT.x + Math.random() * WINDOW_RECT.w, y: WINDOW_RECT.y + Math.random() * WINDOW_RECT.h, v: 20 + Math.random() * 40, len: 6 + Math.random() * 10 });
  }

  private newDrop(initial = false): Drop {
    return {
      x: WALL_OUTER_X + Math.random() * (WORLD_W - WALL_OUTER_X + 80) - 20,
      y: initial ? Math.random() * FLOOR_Y : -20 - Math.random() * 60,
      len: 12 + Math.random() * 14,
      speed: 520 + Math.random() * 260
    };
  }

  /** Called when the playful gust happens (visual streaks). */
  gust(): void {
    this.gustT = 1.6;
  }

  update(dt: number, sim: Simulation): void {
    this.t += dt;
    const w = sim.weather;
    const rainAmt = w.rain;
    const wind = w.windStrength;
    const lean = 40 + wind * 220;

    // --- outdoor rain ---
    const r = this.rainG;
    const sp = this.splashG;
    r.clear();
    sp.clear();
    if (rainAmt > 0.03) {
      const active = Math.round(this.drops.length * clamp01(rainAmt));
      r.lineStyle(1.8, 0xdcecf9, 0.7);
      r.beginPath();
      for (let i = 0; i < active; i++) {
        const d = this.drops[i];
        d.y += d.speed * dt;
        d.x += lean * dt;
        if (d.y > FLOOR_Y - (i % 5) * 3) {
          if (i % 3 === 0 && this.splashes.length < 60) this.splashes.push({ x: d.x, y: FLOOR_Y + 2 + (i % 4) * 2, t: 0 });
          Object.assign(d, this.newDrop());
          d.x = WALL_OUTER_X + Math.random() * (WORLD_W - WALL_OUTER_X) - 10;
        }
        const k = d.len / d.speed;
        r.moveTo(d.x, d.y);
        r.lineTo(d.x - lean * k, d.y - d.len);
      }
      r.strokePath();
      // little splashes
      sp.lineStyle(1.4, 0xe7f2fb, 0.8);
      for (let i = this.splashes.length - 1; i >= 0; i--) {
        const s = this.splashes[i];
        s.t += dt * 4;
        if (s.t >= 1) {
          this.splashes.splice(i, 1);
          continue;
        }
        sp.strokeEllipse(s.x, s.y, 4 + s.t * 10, 1.5 + s.t * 3);
      }
    } else if (this.splashes.length) this.splashes.length = 0;

    const sk = this.skyRainG;
    sk.clear();
    if (rainAmt > 0.03) {
      const active = Math.round(this.skyDrops.length * clamp01(rainAmt));
      sk.lineStyle(1.6, 0xdcecf9, 0.55);
      sk.beginPath();
      for (let i = 0; i < active; i++) {
        const d = this.skyDrops[i];
        d.y += d.speed * dt;
        d.x += lean * dt;
        if (d.y > FLOOR_Y) {
          d.y = -20 - Math.random() * 40;
          d.x = Math.random() * (WALL_OUTER_X + 40) - 40;
        }
        if (d.x > WALL_OUTER_X + 40) d.x -= WALL_OUTER_X + 80;
        const k = d.len / d.speed;
        sk.moveTo(d.x, d.y);
        sk.lineTo(d.x - lean * k, d.y - d.len);
      }
      sk.strokePath();
    }

    // --- rain falling on the roof (spatially masked to the roof, splashing on the tiles) ---
    const rg = this.roofG;
    rg.clear();
    if (rainAmt > 0.03) {
      const roofY = (x: number): number => (x < 270 ? 204 - ((x + 18) * 130) / 288 : 74 + ((x - 270) * 130) / 284);
      const active = Math.round(this.roofDrops.length * clamp01(rainAmt));
      rg.lineStyle(1.8, 0xe7f2fb, 0.85);
      rg.beginPath();
      for (let i = 0; i < active; i++) {
        const d = this.roofDrops[i];
        d.y += d.v * dt;
        d.x += lean * 0.5 * dt;
        const ry = roofY(d.x);
        if (d.y >= ry) {
          if (this.roofSplashes.length < 50 && i % 2 === 0) this.roofSplashes.push({ x: d.x, y: ry, t: 0 });
          d.x = -10 + Math.random() * 560;
          d.y = roofY(d.x) - 60 - Math.random() * 90;
        }
        rg.moveTo(d.x, d.y);
        rg.lineTo(d.x - lean * 0.03, d.y - 13);
      }
      rg.strokePath();
      rg.lineStyle(1.5, 0xffffff, 0.9);
      for (let i = this.roofSplashes.length - 1; i >= 0; i--) {
        const s = this.roofSplashes[i];
        s.t += dt * 4.5;
        if (s.t >= 1) {
          this.roofSplashes.splice(i, 1);
          continue;
        }
        rg.strokeEllipse(s.x, s.y - 1, 4 + s.t * 9, 1.5 + s.t * 3);
        rg.beginPath();
        rg.moveTo(s.x, s.y);
        rg.lineTo(s.x - 3 * s.t * 3, s.y - 5 * s.t * 2);
        rg.moveTo(s.x, s.y);
        rg.lineTo(s.x + 3 * s.t * 3, s.y - 5 * s.t * 2);
        rg.strokePath();
      }
      // the roof looks glossy and wet
      rg.fillStyle(0xc3d7e9, 0.16 * clamp01(rainAmt));
      rg.fillTriangle(-18, 204, 270, 74, 554, 204);
    } else this.roofSplashes.length = 0;

    // --- rain seen through the window (so the house stays dry but the weather is visible) ---
    const wr = this.winRainG;
    wr.clear();
    if (rainAmt > 0.03) {
      wr.lineStyle(1.8, 0xeaf3fb, 0.85 * clamp01(rainAmt * 1.5));
      wr.beginPath();
      for (const d of this.winDrops) {
        d.y += (d.v * 3 + rainAmt * 180) * dt;
        d.x += 6 * dt;
        if (d.y > WINDOW_RECT.y + WINDOW_RECT.h) {
          d.y = WINDOW_RECT.y - 10;
          d.x = WINDOW_RECT.x + Math.random() * WINDOW_RECT.w;
        }
        wr.moveTo(d.x, d.y);
        wr.lineTo(d.x - 1.5, d.y - d.len);
      }
      wr.strokePath();
      // drops sliding on the glass
      wr.fillStyle(0xe3f0fb, 0.65);
      for (let i = 0; i < 8; i++) {
        const gx = WINDOW_RECT.x + 8 + ((i * 53) % (WINDOW_RECT.w - 16));
        const gy = WINDOW_RECT.y + ((this.t * (8 + i * 2) + i * 40) % WINDOW_RECT.h);
        wr.fillEllipse(gx, gy, 3, 4.5);
      }
    }

    // --- wind streaks ---
    const wg = this.windG;
    wg.clear();
    this.gustT = Math.max(0, this.gustT - dt);
    const streak = Math.max(wind > 0.55 ? (wind - 0.55) * 2.2 : 0, this.gustT / 1.6);
    if (streak > 0.03) {
      wg.lineStyle(2.4, 0xffffff, 0.35 * streak);
      for (let i = 0; i < 7; i++) {
        const y = 140 + i * 56 + Math.sin(i * 3.1) * 20;
        const x = ((this.t * (300 + i * 40) + i * 190) % (WORLD_W + 400)) - 200 + WALL_OUTER_X * 0;
        const pts = [] as P2[];
        for (let k = 0; k < 6; k++) pts.push({ x: x + k * 22, y: y + Math.sin(k * 0.9 + this.t * 5 + i) * 6 });
        wg.strokePoints(pts as Phaser.Types.Math.Vector2Like[], false, false);
      }
    }

    // hidden layers skip rendering entirely (and their stencil masks) when there is nothing to draw
    const raining = rainAmt > 0.03;
    this.rainG.setVisible(raining);
    this.splashG.setVisible(raining);
    this.roofG.setVisible(raining);
    this.skyRainG.setVisible(raining);
    this.winRainG.setVisible(raining);
    this.windG.setVisible(streak > 0.03);

    // --- outdoor light overlay (does NOT touch the cottage interior) ---
    const day = sim.clock.daylight;
    const night = 1 - day;
    const layers: [number, number][] = [
      [0x121839, 0.5 * Math.pow(night, 1.1)],
      [0xf28e59, 0.2 * sim.clock.goldenHour * smoothstep(0.05, 0.4, day)],
      [0x828e9e, 0.18 * w.cloud * (1 - w.sun * 0.4) * day],
      [0x435065, 0.22 * rainAmt * (0.4 + 0.6 * day)]
    ];
    const comp = compositeLayers(layers);
    this.overlayColor = comp.color;
    this.overlayAlpha = comp.alpha;
    this.overlay.setTint(comp.color).setAlpha(comp.alpha);
  }
}

export { lerp, clamp };
