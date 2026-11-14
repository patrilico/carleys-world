import type Phaser from 'phaser';
import type { FaceOutput, Pose } from '../systems/AnimationController';
import type { PropId } from '../core/types';
import type { HairModel } from './HairModel';
import { COL, limb, polyline, quad, rotPt, shape, smoothClosed, star4, type P2 } from './draw';

export const HIP_Y = -28;
const NECK_Y = -23.5;
const HEAD_CY = -27;

export interface Joints {
  /** all in container-local coordinates (feet origin, facing +x) */
  head: P2;
  rHand: P2;
  lHand: P2;
  spout: P2;
  brush: P2;
  rForearmAngle: number;
}

const smoothCache = new Map<string, P2[]>();
/** Static outlines (torso, head, fringe) never change, so the spline is computed once. */
function cachedSmooth(key: string, pts: P2[], seg: number): P2[] {
  let r = smoothCache.get(key);
  if (!r) {
    r = smoothClosed(pts, seg);
    smoothCache.set(key, r);
  }
  return r;
}

const armDir = (a: number, side: number): P2 => ({ x: side * Math.sin(a), y: Math.cos(a) });

/**
 * Layered vector rendering of Carley: back hair, legs, skirt, torso, arms, head, face, front hair, bow, props.
 * The face is drawn procedurally from continuous parameters so any expression blends smoothly.
 */
export class CarleyRenderer {
  readonly joints: Joints = {
    head: { x: 0, y: 0 }, rHand: { x: 0, y: 0 }, lHand: { x: 0, y: 0 }, spout: { x: 0, y: 0 }, brush: { x: 0, y: 0 }, rForearmAngle: 0
  };

  draw(g: Phaser.GameObjects.Graphics, pose: Pose, face: FaceOutput, hair: HairModel, prop: PropId, time: number, windSway = 0, stache = 0): void {
    g.clear();
    g.save();
    g.translateCanvas(pose.ox, pose.oy);
    g.scaleCanvas(pose.sx, pose.sy);
    g.translateCanvas(0, HIP_Y);
    g.rotateCanvas(pose.rot);
    g.translateCanvas(0, -HIP_Y);

    // ---- joint maths (mirrors the canvas transform chain) ----
    const cr = Math.cos(pose.rot);
    const sr = Math.sin(pose.rot);
    const ct = Math.cos(pose.torso);
    const st = Math.sin(pose.torso);
    const fromTorso = (p: P2): P2 => {
      const x = p.x * ct - p.y * st;
      const y = p.x * st + p.y * ct + HIP_Y;
      const yy = y - HIP_Y;
      const rx = x * cr - yy * sr;
      const ry = x * sr + yy * cr + HIP_Y;
      return { x: rx * pose.sx + pose.ox, y: ry * pose.sy + pose.oy };
    };

    // arm skeleton in torso frame
    const arm = (side: number, a: number, e: number) => {
      const s: P2 = { x: side * 10.5, y: -22 };
      const d1 = armDir(a, side);
      const el: P2 = { x: s.x + d1.x * 11, y: s.y + d1.y * 11 };
      const d2 = armDir(a + e, side);
      const wr: P2 = { x: el.x + d2.x * 11, y: el.y + d2.y * 11 };
      return { s, el, wr, d2, ang: a + e };
    };
    const L = arm(-1, pose.aLs, pose.aLe);
    const R = arm(1, pose.aRs, pose.aRe);

    // head centre in torso frame
    const headOff = rotPt({ x: 0, y: HEAD_CY }, pose.headTilt);
    const headT: P2 = { x: pose.headX + headOff.x, y: NECK_Y + pose.headY + headOff.y };
    this.joints.head = fromTorso(headT);
    this.joints.rHand = fromTorso(R.wr);
    this.joints.lHand = fromTorso(L.wr);
    this.joints.rForearmAngle = R.ang;
    // spout tip of the watering can (hand-relative geometry, see drawProp)
    const spoutLocal = rotPt({ x: 26, y: -3 }, pose.propRot);
    this.joints.spout = fromTorso({ x: R.wr.x + spoutLocal.x, y: R.wr.y + spoutLocal.y });
    const bt = rotPt({ x: 2.4, y: -19.5 }, 0.55);
    this.joints.brush = fromTorso({ x: R.wr.x + bt.x, y: R.wr.y + bt.y });

    // =============== layers ===============
    this.backHair(g, pose, hair, time, windSway);
    this.legs(g, pose);
    this.skirt(g, pose);

    g.save();
    g.translateCanvas(0, HIP_Y);
    g.rotateCanvas(pose.torso);
    // neck lives in the torso frame so the head can bob/tilt without ever detaching
    g.fillStyle(COL.skinShade, 1);
    g.lineStyle(1.8, COL.outline, 1);
    g.fillRect(-4.5, -35, 9, 12);
    g.strokeRect(-4.5, -35, 9, 12);
    this.torso(g);
    const lFront = L.wr.y < -26 || L.el.y < -30;
    const rFront = R.wr.y < -26 || R.el.y < -30;
    if (!lFront) this.drawArm(g, L, -1);
    if (!rFront) this.drawArm(g, R, 1);
    if (prop && !rFront && prop !== 'book') this.drawProp(g, prop, L, R, pose, time);
    // head frame
    g.save();
    g.translateCanvas(pose.headX, NECK_Y + pose.headY);
    g.rotateCanvas(pose.headTilt);
    this.neckAndHead(g);
    this.faceFeatures(g, face, time);
    if (stache > 0.02) {
      g.save();
      g.translateCanvas(0, HEAD_CY);
      g.fillStyle(0xffffff, Math.min(1, stache * 1.4));
      g.lineStyle(1.4, 0xc7ccd3, Math.min(1, stache * 1.4));
      g.fillEllipse(-4, 12.5, 9, 5);
      g.fillEllipse(4, 12.5, 9, 5);
      g.strokeEllipse(-4, 12.5, 9, 5);
      g.strokeEllipse(4, 12.5, 9, 5);
      g.restore();
    }
    this.frontHair(g, hair, time, windSway);
    g.restore();
    if (lFront) this.drawArm(g, L, -1);
    if (rFront) this.drawArm(g, R, 1);
    if (prop && (rFront || prop === 'book')) this.drawProp(g, prop, L, R, pose, time);
    g.restore();

    g.restore();
  }

  // ------------------------------------------------------------------ body parts

  private legs(g: Phaser.GameObjects.Graphics, p: Pose): void {
    const leg = (side: number, h: number, k: number) => {
      const hip: P2 = { x: side * 6.2, y: HIP_Y + 1 };
      const knee: P2 = { x: hip.x + Math.sin(h) * 13, y: hip.y + Math.cos(h) * 13 };
      const sa = h - k;
      const ank: P2 = { x: knee.x + Math.sin(sa) * 13, y: knee.y + Math.cos(sa) * 13 };
      limb(g, hip, knee, 7.5, COL.skin, COL.outline, 1.7);
      limb(g, knee, ank, 7, COL.sock, COL.outline, 1.7);
      // sock band
      const mid: P2 = { x: knee.x + (ank.x - knee.x) * 0.35, y: knee.y + (ank.y - knee.y) * 0.35 };
      g.fillStyle(COL.topPink, 1);
      g.fillCircle(mid.x, mid.y, 3.6);
      // shoe
      g.save();
      g.translateCanvas(ank.x + 2.2, ank.y + 2.2);
      g.rotateCanvas(-sa * 0.45);
      g.fillStyle(COL.outline, 1);
      g.fillEllipse(0, 0, 17, 10);
      g.fillStyle(COL.shoe, 1);
      g.fillEllipse(0, 0, 14.5, 7.8);
      g.fillStyle(0xb28269, 1);
      g.fillEllipse(0.8, -1.4, 8, 3);
      g.restore();
    };
    // draw the leg that is further back first (smaller hip angle)
    if (p.lLh < p.lRh) {
      leg(-1, p.lLh, p.lLk);
      leg(1, p.lRh, p.lRk);
    } else {
      leg(1, p.lRh, p.lRk);
      leg(-1, p.lLh, p.lLk);
    }
  }

  private skirt(g: Phaser.GameObjects.Graphics, p: Pose): void {
    const fl = 3 + p.skirt * 6;
    const waistY = HIP_Y - 1;
    const hemY = HIP_Y + 12 - Math.min(1, (p.lLh + p.lRh) / 2.6) * 3;
    const pts: P2[] = [
      { x: -11, y: waistY }, { x: -14 - fl * 0.5, y: HIP_Y + 5 }, { x: -18 - fl, y: hemY },
      { x: -10, y: hemY + 2.5 }, { x: -3, y: hemY - 0.5 }, { x: 4, y: hemY + 2.5 }, { x: 11, y: hemY - 0.5 }, { x: 18 + fl, y: hemY },
      { x: 14 + fl * 0.5, y: HIP_Y + 5 }, { x: 11, y: waistY }
    ];
    shape(g, smoothClosed(pts, 4), COL.cream, COL.outline, 2);
    // pink trim
    polyline(g, smoothClosed(pts.slice(2, 8), 4).slice(0, 18), 2.2, COL.topPink, 0.9);
    // soft fold lines
    g.lineStyle(1.3, 0xeedcce, 0.9);
    g.beginPath();
    g.moveTo(-4, waistY + 3);
    g.lineTo(-7 - fl * 0.4, hemY);
    g.moveTo(4, waistY + 3);
    g.lineTo(7 + fl * 0.4, hemY);
    g.strokePath();
  }

  private torso(g: Phaser.GameObjects.Graphics): void {
    const pts: P2[] = [
      { x: -10, y: 1 }, { x: -11.5, y: -11 }, { x: -11.2, y: -21 }, { x: -7, y: -26.5 }, { x: 7, y: -26.5 },
      { x: 11.2, y: -21 }, { x: 11.5, y: -11 }, { x: 10, y: 1 }
    ];
    shape(g, cachedSmooth('torso', pts, 4), COL.topPink, COL.outline, 2);
    // shading near the waist
    g.fillStyle(COL.topPinkDark, 0.55);
    g.fillRect(-9.5, -5, 19, 5);
    // waist band
    g.fillStyle(COL.cream, 1);
    g.fillRect(-10.2, -2.5, 20.4, 4);
    g.lineStyle(1.6, COL.outline, 1);
    g.strokeRect(-10.2, -2.5, 20.4, 4);
    // sailor collar
    shape(g, [{ x: -8.5, y: -26 }, { x: 0, y: -16 }, { x: 8.5, y: -26 }, { x: 6, y: -27.5 }, { x: 0, y: -21 }, { x: -6, y: -27.5 }], COL.white, COL.outline, 1.6);
    // ribbon bow on the chest
    g.fillStyle(COL.bow, 1);
    g.lineStyle(1.5, COL.outline, 1);
    g.fillTriangle(0, -16.5, -6.5, -20.5, -6.5, -12.5);
    g.fillTriangle(0, -16.5, 6.5, -20.5, 6.5, -12.5);
    g.strokeTriangle(0, -16.5, -6.5, -20.5, -6.5, -12.5);
    g.strokeTriangle(0, -16.5, 6.5, -20.5, 6.5, -12.5);
    g.fillStyle(COL.topPinkDark, 1);
    g.fillCircle(0, -16.5, 2.3);
  }

  private drawArm(g: Phaser.GameObjects.Graphics, A: { s: P2; el: P2; wr: P2; d2: P2 }, side: number): void {
    const sleeveEnd: P2 = { x: A.s.x + (A.el.x - A.s.x) * 0.55, y: A.s.y + (A.el.y - A.s.y) * 0.55 };
    limb(g, A.s, A.el, 6.8, COL.skin, COL.outline, 1.7);
    limb(g, A.el, A.wr, 6.2, COL.skin, COL.outline, 1.7);
    // puffy pink sleeve
    limb(g, A.s, sleeveEnd, 9.5, COL.topPink, COL.outline, 1.7);
    void side;
    // hand
    g.fillStyle(COL.outline, 1);
    g.fillCircle(A.wr.x, A.wr.y, 5.6);
    g.fillStyle(COL.skin, 1);
    g.fillCircle(A.wr.x, A.wr.y, 4.0);
  }

  private neckAndHead(g: Phaser.GameObjects.Graphics): void {
    const pts: P2[] = [
      { x: 0, y: -53 }, { x: 17, y: -50.5 }, { x: 27.5, y: -40 }, { x: 29.5, y: -27 }, { x: 26.5, y: -14.5 }, { x: 17, y: -5.5 },
      { x: 0, y: -1.8 }, { x: -17, y: -5.5 }, { x: -26.5, y: -14.5 }, { x: -29.5, y: -27 }, { x: -27.5, y: -40 }, { x: -17, y: -50.5 }
    ];
    shape(g, cachedSmooth('head', pts, 6), COL.skin, COL.outline, 2.2);
    // little ears peeking out
    g.fillStyle(COL.skin, 1);
    g.lineStyle(1.8, COL.outline, 1);
    g.fillEllipse(-29.5, -24, 5, 8);
    g.fillEllipse(29.5, -24, 5, 8);
  }

  // ------------------------------------------------------------------ hair

  private backHair(g: Phaser.GameObjects.Graphics, pose: Pose, hair: HairModel, time: number, windSway: number): void {
    g.save();
    g.translateCanvas(0, HIP_Y);
    g.rotateCanvas(pose.torso);
    g.translateCanvas(pose.headX, NECK_Y + pose.headY);
    g.rotateCanvas(pose.headTilt);
    const s = 0; // hair keeps its shape when lying down
    const ox = hair.ox;
    const oy = hair.oy;
    const tier = (i: number, hw: number, y: number, o: number) => {
      const sy = y * (1 - s) + (-50 - i * 11) * s;
      const sx = hw * (1 + 0.28 * s * i);
      return { hw: sx, y: sy + oy[o] * (1 - s * 0.6), x: ox[o] };
    };
    const t0 = tier(0, 37, -42, 0);
    const t1 = tier(1, 40.5, -15, 0);
    const t2 = tier(2, 40, 9, 1);
    const t3 = tier(3, 37, 28, 2);
    const wob = Math.sin(time * 2.3) * 1.4 + windSway * 3;
    const bottomY = 42 * (1 - s) + (-92) * s;
    const pts: P2[] = [
      { x: 0, y: -62 },
      { x: 22, y: -59 },
      { x: t0.hw, y: t0.y },
      { x: t1.hw + t1.x, y: t1.y },
      { x: t2.hw + t2.x, y: t2.y },
      { x: t3.hw + t3.x + 3, y: t3.y },
      { x: 31 + ox[3] + wob * 0.6, y: bottomY + oy[3] - 2 },
      { x: 15 + ox[3] * 0.9, y: bottomY - 6 + oy[3] },
      { x: 0 + ox[3] * 0.8, y: bottomY + 2 + oy[3] },
      { x: -15 + ox[3] * 0.9 + wob * 0.3, y: bottomY - 6 + oy[3] },
      { x: -31 + ox[3] + wob * 0.6, y: bottomY - 2 + oy[3] },
      { x: -t3.hw + t3.x - 3, y: t3.y },
      { x: -t2.hw + t2.x, y: t2.y },
      { x: -t1.hw + t1.x, y: t1.y },
      { x: -t0.hw, y: t0.y },
      { x: -22, y: -59 }
    ];
    const poly = smoothClosed(pts, 5);
    shape(g, poly, COL.hair, COL.outline, 2.2);
    // shading toward the lower inside + highlight strands
    g.lineStyle(2.4, COL.hairDark, 0.9);
    g.beginPath();
    for (const side of [-1, 1]) {
      g.moveTo(side * 24, -30);
      g.lineTo(side * (28 + ox[1] * 0.6), 4 + oy[1]);
      g.lineTo(side * (26 + ox[2]), 26 + oy[2]);
    }
    g.strokePath();
    g.lineStyle(2, COL.hairLight, 0.8);
    g.beginPath();
    g.moveTo(-31, -22);
    g.lineTo(-33 + ox[1] * 0.5, 4 + oy[1]);
    g.moveTo(33, -20);
    g.lineTo(34 + ox[1] * 0.5, 6 + oy[1]);
    g.strokePath();
    g.restore();
  }

  private frontHair(g: Phaser.GameObjects.Graphics, hair: HairModel, time: number, windSway: number): void {
    const sway = hair.ox[0] * 0.35 + windSway;
    // main cap + fringe
    const cap: P2[] = [
      { x: 31, y: -28 }, { x: 31, y: -43 }, { x: 22, y: -55.5 }, { x: 0, y: -61 }, { x: -22, y: -55.5 }, { x: -31, y: -43 }, { x: -31, y: -28 },
      { x: -27, y: -36 }, { x: -22, y: -46 }, { x: -17, y: -40 }, { x: -11, y: -46.5 }, { x: -5.5, y: -40.5 }, { x: 0, y: -47 },
      { x: 5, y: -39 }, { x: 11, y: -46 }, { x: 16.5, y: -39.5 }, { x: 22, y: -46.5 }, { x: 27, y: -37 }
    ];
    shape(g, cachedSmooth('cap', cap, 4), COL.hair, COL.outline, 2.2);
    // highlight arc on top
    g.lineStyle(3, COL.hairLight, 0.9);
    g.beginPath();
    g.arc(0, -36, 26, -2.55, -1.05, false);
    g.strokePath();
    // parting + strand lines
    g.lineStyle(1.6, COL.hairDark, 0.85);
    g.beginPath();
    g.moveTo(0, -58);
    g.lineTo(0, -48);
    g.moveTo(-14, -54);
    g.lineTo(-12, -46);
    g.moveTo(14, -54);
    g.lineTo(12, -46);
    g.strokePath();

    // side locks framing the face (they sway with the hair)
    for (const side of [-1, 1]) {
      const sx = hair.ox[1] * 0.5 * side * 0 + sway * 0.5;
      const lock: P2[] = [
        { x: side * 30.5, y: -44 }, { x: side * 33, y: -26 }, { x: side * 33.5 + sx, y: -6 }, { x: side * 30 + sx * 1.3, y: 9 },
        { x: side * 26 + sx * 1.1, y: 1 }, { x: side * 26, y: -14 }, { x: side * 24.5, y: -30 }, { x: side * 25, y: -41 }
      ];
      shape(g, smoothClosed(lock, 4), COL.hair, COL.outline, 2);
      g.lineStyle(1.6, COL.hairDark, 0.8);
      g.beginPath();
      g.moveTo(side * 30, -30);
      g.lineTo(side * 31 + sx, -2);
      g.strokePath();
    }

    // ahoge (cute antenna curl)
    const sw = Math.sin(time * 2.1) * 1.5 + sway * 1.5;
    const curl = [{ x: 0, y: -60 }, { x: 3 + sw * 0.5, y: -68 }, { x: 8 + sw, y: -72 }, { x: 11 + sw, y: -68.5 }];
    g.lineStyle(5.4, COL.outline, 1);
    g.strokePoints(curl as Phaser.Types.Math.Vector2Like[], false, false);
    g.lineStyle(3, COL.hair, 1);
    g.strokePoints(curl as Phaser.Types.Math.Vector2Like[], false, false);

    // bow
    this.bow(g, -21, -57);
  }

  private bow(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
    g.save();
    g.translateCanvas(x, y);
    g.rotateCanvas(-0.35);
    for (const side of [-1, 1]) {
      const pts: P2[] = [{ x: 0, y: 0 }, { x: side * 7, y: -7 }, { x: side * 12, y: -5 }, { x: side * 12.5, y: 5 }, { x: side * 7, y: 7 }];
      shape(g, smoothClosed(pts, 4), COL.bow, COL.outline, 1.8);
      g.lineStyle(1.3, 0xeeb4a4, 0.9);
      g.beginPath();
      g.moveTo(side * 3, 0);
      g.lineTo(side * 9, 0);
      g.strokePath();
    }
    g.fillStyle(0xeba997, 1);
    g.lineStyle(1.8, COL.outline, 1);
    g.fillCircle(0, 0, 3.4);
    g.strokeCircle(0, 0, 3.4);
    g.restore();
  }

  // ------------------------------------------------------------------ face

  private faceFeatures(g: Phaser.GameObjects.Graphics, f: FaceOutput, time: number): void {
    g.save();
    g.translateCanvas(0, HEAD_CY);
    const open = Math.max(0, f.eyeOpen * (1 - f.blink));

    // blush first (under features)
    if (f.blush > 0.02) {
      g.fillStyle(COL.blush, Math.min(0.85, f.blush * 0.78));
      g.fillEllipse(-19.5, 10, 12, 7);
      g.fillEllipse(19.5, 10, 12, 7);
      if (f.blush > 0.7) {
        g.lineStyle(1.2, 0xd9937e, 0.7);
        g.beginPath();
        for (const sd of [-1, 1]) {
          for (let i = 0; i < 3; i++) {
            g.moveTo(sd * (16 + i * 3.2), 12);
            g.lineTo(sd * (17.5 + i * 3.2), 8);
          }
        }
        g.strokePath();
      }
    }

    // eyes
    for (const side of [-1, 1]) this.eye(g, side, f, open, time);

    // brows
    const by = -13 - f.browRaise * 4.5;
    for (const side of [-1, 1]) {
      const asym = side === 1 ? f.browAsym * 5 : 0;
      const outer: P2 = { x: side * 19.5, y: by + f.browAngle * 2.2 - asym * 0.4 };
      const inner: P2 = { x: side * 5.8, y: by - f.browAngle * 4.8 - asym };
      const ctrl: P2 = { x: side * 12.5, y: (outer.y + inner.y) / 2 - 2.6 + (f.browAngle < -0.2 ? 3.6 : 0) };
      polyline(g, quad(outer, ctrl, inner, 8), 3, COL.brow, 1);
    }

    // nose
    g.lineStyle(1.6, COL.outlineSoft, 0.9);
    g.beginPath();
    g.moveTo(-1.3, 10.4);
    g.lineTo(0.4, 11.6);
    g.lineTo(1.6, 10.6);
    g.strokePath();

    this.mouth(g, f);

    // tears
    if (f.tears > 0.05) {
      const t = f.tears;
      for (const side of [-1, 1]) {
        const ex = side * 12.5 + side * 2;
        g.lineStyle(3.2, COL.tear, 0.85 * Math.min(1, t * 1.6));
        g.beginPath();
        g.moveTo(ex, 11);
        g.lineTo(ex + side * 0.5, 11 + 6 + t * 12);
        g.strokePath();
        const dropY = 12 + ((time * 26 + (side + 1) * 7) % 22);
        g.fillStyle(COL.tear, 0.9 * Math.min(1, t * 2));
        g.fillCircle(ex + side * 0.6, dropY + 6, 2.3);
      }
    }
    // sweat drop
    if (f.sweat > 0.1) {
      const sx = 25;
      const sy = -19 + Math.sin(time * 3) * 0.8;
      g.fillStyle(COL.tear, Math.min(1, f.sweat));
      g.lineStyle(1.3, 0x80b3d7, Math.min(1, f.sweat));
      g.fillCircle(sx, sy + 3, 3.1);
      g.fillTriangle(sx - 2.7, sy + 2, sx + 2.7, sy + 2, sx, sy - 4.5);
    }
    // anger vein
    if (f.anger > 0.3) {
      const a = Math.min(1, f.anger);
      const p = 1 + Math.sin(time * 14) * 0.12 * a;
      g.lineStyle(2.6, 0xcd6f5c, a);
      g.beginPath();
      g.moveTo(20 - 4.5 * p, -25 - 4.5 * p);
      g.lineTo(20 + 4.5 * p, -25 + 4.5 * p);
      g.moveTo(20 + 4.5 * p, -25 - 4.5 * p);
      g.lineTo(20 - 4.5 * p, -25 + 4.5 * p);
      g.strokePath();
    }
    g.restore();
  }

  private eye(g: Phaser.GameObjects.Graphics, side: number, f: FaceOutput, open: number, time: number): void {
    const ex = side * 12.5;
    const ey = 3;
    const smile = Math.min(1, f.eyeSmile);
    const lashColor = 0x4a2e24;
    if (open < 0.2 || smile > 0.55) {
      // closed: happy '^' arc or sleepy '‿' arc
      const up = smile > 0.55;
      const a: P2 = { x: ex - 8.5, y: ey + (up ? 3 : -1.5) };
      const b: P2 = { x: ex + 8.5, y: ey + (up ? 3 : -1.5) };
      const c: P2 = { x: ex, y: ey + (up ? -8 : 7) };
      polyline(g, quad(a, c, b, 9), 3.4, lashColor, 1);
      if (!up) {
        // little lashes on a sleeping eye
        g.lineStyle(1.8, lashColor, 1);
        g.beginPath();
        g.moveTo(ex + side * 8, ey - 0.5);
        g.lineTo(ex + side * 11.5, ey - 2.4);
        g.strokePath();
      }
      return;
    }
    const rx = 9.6;
    const ry = 11.8 * Math.min(1.2, open);
    g.fillStyle(0xffffff, 1);
    g.fillEllipse(ex, ey, rx * 2, ry * 2);
    // iris follows gaze
    const gx = f.gazeX * 2.8;
    const gy = f.gazeY * 2.4;
    const irx = 8.3 * (0.92 + f.pupil * 0.08);
    const iry = Math.min(ry - 0.6, 10.6 * (0.94 + f.pupil * 0.06));
    g.fillStyle(COL.irisTop, 1);
    g.fillEllipse(ex + gx, ey + gy + 0.6, irx * 2, iry * 2);
    g.fillStyle(COL.irisBottom, 1);
    g.fillEllipse(ex + gx, ey + gy + iry * 0.38, irx * 1.62, iry * 1.05);
    g.fillStyle(COL.pupil, 1);
    const pr = 4.1 * f.pupil;
    g.fillEllipse(ex + gx, ey + gy + 0.4, pr * 2, Math.min(iry * 1.1, pr * 2.7));
    // highlights
    g.fillStyle(0xffffff, 1);
    g.fillCircle(ex + gx - 3.4, ey + gy - iry * 0.38, 3.1);
    g.fillCircle(ex + gx + 3.4, ey + gy + iry * 0.42, 1.5);
    if (f.sparkle > 0.55) star4(g, ex + gx + 4.6, ey + gy - iry * 0.4, 2.4 + Math.sin(time * 5 + side) * 0.5, 0xffffff, Math.min(1, f.sparkle));
    // upper lid / lash line
    const left: P2 = { x: ex - rx - 0.4, y: ey - ry * 0.25 };
    const right: P2 = { x: ex + rx + 0.4, y: ey - ry * 0.25 };
    const top: P2 = { x: ex, y: ey - ry * 1.42 };
    polyline(g, quad(left, top, right, 12), 3.2, lashColor, 1);
    // outer lash flick
    g.lineStyle(2.2, lashColor, 1);
    g.beginPath();
    g.moveTo(ex + side * (rx + 0.2), ey - ry * 0.25);
    g.lineTo(ex + side * (rx + 3.4), ey - ry * 0.25 - 2.6);
    g.strokePath();
    // soft lower lid
    g.lineStyle(1.3, 0x855c4f, 0.55);
    g.beginPath();
    g.arc(ex, ey, Math.max(ry, rx) * 0.98, 0.45, 2.7, false);
    g.strokePath();
    // droopy upper lid for tired
    if (open < 0.6) {
      g.fillStyle(COL.skin, 0.85);
      g.fillEllipse(ex, ey - ry * 0.95, rx * 2.15, ry * (1.2 - open) * 0.9);
      polyline(g, quad(left, { x: ex, y: ey - ry * 0.55 - (0.6 - open) * 6 }, right, 10), 3, lashColor, 1);
    }
  }

  private mouth(g: Phaser.GameObjects.Graphics, f: FaceOutput): void {
    const my = 17;
    const hw = 5.6 * f.mouthWidth;
    const c = f.mouthCurve;
    const o = Math.min(1, f.mouthOpen);
    const skew = f.mouthSkew * 1.6;
    const left: P2 = { x: -hw, y: my - c * 2.2 + skew };
    const right: P2 = { x: hw, y: my - c * 2.2 - skew };
    const ctrlTop: P2 = { x: 0, y: my + c * 4.6 };
    const top = quad(left, ctrlTop, right, 10);
    if (o > 0.08) {
      const ctrlBot: P2 = { x: 0, y: my + c * 4.6 + 3 + o * 12 };
      const bot = quad(left, ctrlBot, right, 10).reverse();
      const poly = [...top, ...bot];
      g.fillStyle(COL.mouthInner, 1);
      g.fillPoints(poly as Phaser.Types.Math.Vector2Like[], true, true);
      if (o > 0.3) {
        g.fillStyle(COL.tongue, 1);
        g.fillEllipse(0, my + c * 4 + 3 + o * 7.5, hw * 1.2, 3 + o * 3.6);
      }
      if (c > 0.3 && o > 0.15) {
        g.fillStyle(0xffffff, 1);
        g.fillPoints([...top, ...top.map((p) => ({ x: p.x * 0.92, y: p.y + 2.8 })).reverse()] as Phaser.Types.Math.Vector2Like[], true, true);
      }
      g.lineStyle(2, 0x844545, 1);
      g.strokePoints(poly as Phaser.Types.Math.Vector2Like[], true, true);
    } else {
      polyline(g, top, 2.4, 0x854f4f, 1);
      if (c > 0.6) {
        g.lineStyle(1.5, 0xc38e80, 0.9);
        g.beginPath();
        g.moveTo(-hw - 1.5, my - c * 2.2 - 1.5 + skew);
        g.lineTo(-hw - 0.4, my - c * 2.2 + 1.2 + skew);
        g.moveTo(hw + 1.5, my - c * 2.2 - 1.5 - skew);
        g.lineTo(hw + 0.4, my - c * 2.2 + 1.2 - skew);
        g.strokePath();
      }
    }
  }

  // ------------------------------------------------------------------ props

  private drawProp(
    g: Phaser.GameObjects.Graphics,
    prop: PropId,
    L: { wr: P2; ang: number },
    R: { wr: P2; ang: number },
    pose: Pose,
    time: number
  ): void {
    if (!prop) return;
    g.save();
    switch (prop) {
      case 'wateringCan': {
        g.translateCanvas(R.wr.x, R.wr.y);
        g.rotateCanvas(pose.propRot);
        // body
        g.fillStyle(0x9bcfdc, 1);
        g.lineStyle(2, COL.outline, 1);
        g.fillRoundedRect(-1, 1, 22, 17, 4);
        g.strokeRoundedRect(-1, 1, 22, 17, 4);
        g.fillStyle(0xc2e6ee, 1);
        g.fillRoundedRect(1, 3, 6, 11, 2);
        // spout
        const sp: P2[] = [{ x: 20, y: 11 }, { x: 28, y: -1 }, { x: 31, y: -2 }, { x: 28, y: 3 }, { x: 22, y: 15 }];
        shape(g, sp, 0x9bcfdc, COL.outline, 2);
        g.fillStyle(0x6db0c2, 1);
        g.fillEllipse(31, -2.5, 4, 7);
        // handle
        g.lineStyle(3, COL.outline, 1);
        g.beginPath();
        g.arc(0, 5, 7, -2.8, 0.7, false);
        g.strokePath();
        g.lineStyle(1.5, 0xffffff, 0.8);
        g.beginPath();
        g.arc(0, 5, 7, -2.6, -1.2, false);
        g.strokePath();
        break;
      }
      case 'phone': {
        g.translateCanvas(R.wr.x - 3, R.wr.y - 3);
        g.rotateCanvas(0.12);
        g.fillStyle(0xeba997, 1);
        g.lineStyle(2, COL.outline, 1);
        g.fillRoundedRect(-6, -13, 12, 24, 4);
        g.strokeRoundedRect(-6, -13, 12, 24, 4);
        g.fillStyle(0x343c45, 1);
        g.fillRoundedRect(-4, -10, 8, 16, 2);
        g.fillStyle(0xacdbf2, 0.9);
        g.fillRoundedRect(-3, -9, 6, 6, 1.5);
        g.fillStyle(0xffffff, 1);
        g.fillCircle(0, 8, 1.4);
        g.lineStyle(1.6, 0xffffff, 0.8);
        g.beginPath();
        g.arc(-6, -10, 6, 3.4, 4.9, false);
        g.strokePath();
        // fingers wrapped around it
        g.fillStyle(COL.outline, 1);
        g.fillCircle(5, 3, 3.6);
        g.fillStyle(COL.skin, 1);
        g.fillCircle(5, 3, 2.4);
        break;
      }
      case 'milk': {
        g.translateCanvas(R.wr.x - 1, R.wr.y + 2);
        g.rotateCanvas(pose.propRot);
        const lvl = 1 - Math.min(1, pose.aux) * 0.9;
        const glass: P2[] = [{ x: -6, y: -17 }, { x: 6, y: -17 }, { x: 4.6, y: 2 }, { x: -4.6, y: 2 }];
        shape(g, glass, 0xebf5fc, COL.outline, 2);
        const h = 17 * lvl;
        shape(g, [{ x: -5.4, y: 1 - h }, { x: 5.4, y: 1 - h }, { x: 4.4, y: 1 }, { x: -4.4, y: 1 }], 0xffffff, null);
        g.lineStyle(1.4, 0xffffff, 0.9);
        g.beginPath();
        g.moveTo(-3.5, -14);
        g.lineTo(-3, -2);
        g.strokePath();
        g.fillStyle(COL.outline, 1);
        g.fillCircle(5, -4, 4);
        g.fillStyle(COL.skin, 1);
        g.fillCircle(5, -4, 2.8);
        break;
      }
      case 'book': {
        const mx = (L.wr.x + R.wr.x) / 2;
        const my = (L.wr.y + R.wr.y) / 2 + 4;
        g.translateCanvas(mx, my);
        // open book facing us (pages visible), slightly tilted by the page-flip phase
        const lp: P2[] = [{ x: -1.2, y: -9 }, { x: -17, y: -11 }, { x: -17.5, y: 8 }, { x: -1.2, y: 10 }];
        const rp: P2[] = [{ x: 1.2, y: -9 }, { x: 17, y: -11 }, { x: 17.5, y: 8 }, { x: 1.2, y: 10 }];
        shape(g, [{ x: -19, y: -12 }, { x: 19, y: -12 }, { x: 19, y: 10 }, { x: -19, y: 10 }], 0x7d8ec8, COL.outline, 2);
        shape(g, lp, 0xfefcf6, COL.outline, 1.5);
        shape(g, rp, 0xfefcf6, COL.outline, 1.5);
        g.lineStyle(1, 0xc7beb0, 0.9);
        g.beginPath();
        for (let i = 0; i < 4; i++) {
          g.moveTo(-14, -6 + i * 4);
          g.lineTo(-4, -5 + i * 4);
          g.moveTo(4, -5 + i * 4);
          g.lineTo(14, -6 + i * 4);
        }
        g.strokePath();
        const flip = pose.aux;
        if (flip > 0.02 && flip < 0.98) {
          const w = 16 * Math.cos(flip * Math.PI);
          const lift = Math.sin(flip * Math.PI) * 6;
          shape(g, [{ x: 1.2, y: -9 - lift }, { x: 1.2 + w, y: -11 - lift }, { x: 1.2 + w, y: 8 - lift }, { x: 1.2, y: 10 - lift }], 0xffffff, COL.outline, 1.5);
        }
        break;
      }
      case 'brush': {
        g.translateCanvas(R.wr.x, R.wr.y);
        g.rotateCanvas(0.55);
        g.lineStyle(3.2, COL.outline, 1);
        g.beginPath();
        g.moveTo(-2, 4);
        g.lineTo(2, -17);
        g.strokePath();
        g.lineStyle(1.8, 0xd0a265, 1);
        g.beginPath();
        g.moveTo(-2, 4);
        g.lineTo(2, -17);
        g.strokePath();
        g.fillStyle(0xe6957d, 1);
        g.lineStyle(1.5, COL.outline, 1);
        g.fillEllipse(2.4, -19.5, 5, 7);
        g.strokeEllipse(2.4, -19.5, 5, 7);
        // palette in the other hand
        g.restore();
        g.save();
        g.translateCanvas(L.wr.x, L.wr.y);
        g.fillStyle(0xe1c395, 1);
        g.lineStyle(1.8, COL.outline, 1);
        g.fillEllipse(0, 4, 18, 12);
        g.strokeEllipse(0, 4, 18, 12);
        g.fillStyle(0xe6957d, 1);
        g.fillCircle(-4, 2, 2);
        g.fillStyle(0x83b6eb, 1);
        g.fillCircle(1, 1, 2);
        g.fillStyle(0xf2dd77, 1);
        g.fillCircle(5, 4, 2);
        void time;
        break;
      }
      default:
        break;
    }
    g.restore();
  }
}
