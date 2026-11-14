import Phaser from 'phaser';
import { approach, clamp } from '../core/math';
import type { Simulation } from '../sim/Simulation';
import { AnimationController, FaceController } from '../systems/AnimationController';
import { CarleyRenderer } from './CarleyRenderer';
import { HairModel } from './HairModel';
import { COL, star4 } from './draw';

/** Phaser presentation of Carley: shadow, layered character graphics, sleep Zs, healing glow, mood icons. */
export class CarleyView {
  readonly container: Phaser.GameObjects.Container;
  readonly anim = new AnimationController();
  readonly face = new FaceController();
  readonly hair = new HairModel();
  readonly renderer = new CarleyRenderer();
  private shadow: Phaser.GameObjects.Graphics;
  private g: Phaser.GameObjects.Graphics;
  private fx: Phaser.GameObjects.Graphics;
  private zs: Phaser.GameObjects.Text[] = [];
  private facingScale = 1;
  private time = 0;
  private prevRot = 0;
  private prevHeadX = 0;
  /** world-space joints for effects (spout, brush tip, head) */
  readonly world = { head: { x: 0, y: 0 }, spout: { x: 0, y: 0 }, brush: { x: 0, y: 0 }, rHand: { x: 0, y: 0 } };

  constructor(private scene: Phaser.Scene, depth = 50) {
    this.shadow = scene.add.graphics().setDepth(depth - 1);
    this.container = scene.add.container(0, 0).setDepth(depth);
    this.g = scene.add.graphics();
    this.fx = scene.add.graphics();
    this.container.add([this.g]);
    this.fx.setDepth(depth + 1);
    for (let i = 0; i < 3; i++) {
      const t = scene.add
        .text(0, 0, 'Z', { fontFamily: '"Trebuchet MS", Arial, sans-serif', fontSize: `${16 + i * 4}px`, fontStyle: 'bold', color: '#ffffff', stroke: '#8ba1d9', strokeThickness: 4 })
        .setOrigin(0.5)
        .setAlpha(0)
        .setDepth(depth + 2);
      this.zs.push(t);
    }
  }

  update(dt: number, sim: Simulation): void {
    this.time += dt;
    const a = sim.agent;
    const emo = sim.emotion;

    this.anim.update(dt, a, emo.effective, emo.intensity);
    const head = this.world.head;
    this.face.update(dt, emo.effective, emo.intensity, a.face, head, a.facing);

    // facing flip (lying poses are mirrored by lieDir instead)
    const targetFacing = a.posture === 'lying' ? 1 : a.facing;
    this.facingScale = approach(this.facingScale, targetFacing, 16, dt);
    this.container.setPosition(a.x, a.y);
    // mirror without ever flattening: the sprite only narrows slightly while she swings around
    const fs = this.facingScale;
    const shown = (fs < 0 ? -1 : 1) * (0.88 + 0.12 * Math.min(1, Math.abs(fs)));
    this.container.setScale(shown, 1 + (1 - Math.min(1, Math.abs(fs))) * 0.02);

    // hair secondary motion
    const wind = sim.isOutdoors ? sim.weather.windStrength : 0.05;
    this.hair.update(dt, a.body.vx, a.body.vy, this.facingScale >= 0 ? 1 : -1, wind, (this.anim.pose.headTilt - this.prevRot) / Math.max(dt, 1e-3) * 0.02);
    this.prevRot = this.anim.pose.headTilt;
    if (Math.abs(a.facing - Math.sign(this.facingScale)) > 0 && Math.abs(this.facingScale) < 0.6) this.hair.kick(a.facing * 5, 0);
    this.prevHeadX = a.x;

    this.renderer.draw(this.g, this.anim.pose, this.face.out, this.hair, a.prop, this.time, wind * Math.sin(this.time * 1.7) * 0.6, a.stache);

    // world-space joints for effects
    const j = this.renderer.joints;
    const toWorld = (p: { x: number; y: number }) => ({ x: a.x + p.x * shown, y: a.y + p.y });
    const hw = toWorld(j.head);
    this.world.head.x = hw.x;
    this.world.head.y = hw.y;
    const sw = toWorld(j.spout);
    this.world.spout.x = sw.x;
    this.world.spout.y = sw.y;
    const bw = toWorld(j.brush);
    this.world.brush.x = bw.x;
    this.world.brush.y = bw.y;
    const rh = toWorld(j.rHand);
    this.world.rHand.x = rh.x;
    this.world.rHand.y = rh.y;

    this.drawShadow(a.x, a.y);
    this.drawFx(sim, dt);
    this.updateZs(sim);
  }

  private drawShadow(x: number, y: number): void {
    const s = this.shadow;
    s.clear();
    const airborne = clamp((y - this.container.y) , 0, 0);
    void airborne;
    const lying = this.anim.isLying;
    s.fillStyle(0x2f363f, 0.18);
    s.fillEllipse(x + (lying ? this.anim.pose.rot * -18 * 0 : 0), y + 1, lying ? 120 : 52, lying ? 12 : 11);
  }

  private drawFx(sim: Simulation, dt: number): void {
    const fx = this.fx;
    fx.clear();
    const a = sim.agent;
    // healing glow: soft rings + rising sparkles around her
    if (a.glow > 0.02) {
      const cx = this.container.x;
      const cy = this.container.y - 56;
      const g = a.glow;
      for (let i = 0; i < 3; i++) {
        const r = 36 + i * 16 + (1 - g) * 34;
        fx.lineStyle(3 - i * 0.7, 0xf8eab7, g * (0.7 - i * 0.2));
        fx.strokeCircle(cx, cy, r);
      }
      fx.fillStyle(0xfaf0ce, g * 0.28);
      fx.fillCircle(cx, cy, 52 + (1 - g) * 20);
      for (let i = 0; i < 7; i++) {
        const ang = this.time * 1.6 + (i * Math.PI * 2) / 7;
        const rr = 40 + Math.sin(this.time * 3 + i) * 8;
        star4(fx, cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr * 1.2 - (1 - g) * 20, 4 + (i % 3), i % 2 ? 0xffffff : 0xf4d995, g);
      }
    }
    void dt;
  }

  private updateZs(sim: Simulation): void {
    const sleeping = sim.brain.isSleeping;
    const head = this.world.head;
    for (let i = 0; i < this.zs.length; i++) {
      const z = this.zs[i];
      if (!sleeping) {
        z.setAlpha(approach(z.alpha, 0, 8, 0.016));
        continue;
      }
      const t = (this.time * 0.45 + i / this.zs.length) % 1;
      z.setPosition(head.x + 22 + t * 26 + Math.sin(t * 6 + i) * 4, head.y - 18 - t * 50);
      z.setAlpha(Math.sin(t * Math.PI) * 0.95);
      z.setScale(0.7 + t * 0.7);
    }
  }

  destroy(): void {
    this.container.destroy();
    this.shadow.destroy();
    this.fx.destroy();
    for (const z of this.zs) z.destroy();
  }
}

export { COL };
