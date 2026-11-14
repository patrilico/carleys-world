import Phaser from 'phaser';
import { GAME_CONFIG } from '../config/gameConfig';
import { FLOOR_Y, SOLIDS, WALL_LEFT_X, WORLD_RIGHT_X } from '../config/worldLayout';
import { approach } from '../core/math';
import type { CharacterBody } from '../entities/Carley';

const BODY_W = 22;
const BODY_H = 86;

/**
 * Carley's Arcade Physics body: gravity, ground and furniture collisions, world bounds.
 * The AI sets a desired horizontal velocity; this class handles acceleration and hopping.
 */
export class ArcadeCharacterBody implements CharacterBody {
  readonly obj: Phaser.GameObjects.Rectangle;
  readonly arcade: Phaser.Physics.Arcade.Body;
  readonly solids: Phaser.Physics.Arcade.StaticGroup;
  vx = 0;
  vy = 0;
  onGround = true;
  blocked = false;
  private desired = 0;
  private hopLock = 0;
  private airVx = 0;

  constructor(scene: Phaser.Scene, x: number) {
    // static colliders: furniture platforms and the door lintel
    this.solids = scene.physics.add.staticGroup();
    for (const s of SOLIDS) {
      const r = scene.add.rectangle(s.x + s.w / 2, s.y + s.h / 2, s.w, s.h, 0x000000, 0);
      scene.physics.add.existing(r, true);
      this.solids.add(r);
    }
    this.obj = scene.add.rectangle(x, FLOOR_Y - BODY_H / 2, BODY_W, BODY_H, 0xec1313, 0);
    scene.physics.add.existing(this.obj);
    this.arcade = this.obj.body as Phaser.Physics.Arcade.Body;
    this.arcade.setGravityY(GAME_CONFIG.physics.gravity);
    this.arcade.setMaxVelocity(500, 1100);
    this.arcade.setCollideWorldBounds(true);
    scene.physics.world.setBounds(WALL_LEFT_X + BODY_W / 2 + 2, 0, WORLD_RIGHT_X - WALL_LEFT_X - BODY_W / 2, FLOOR_Y);
    scene.physics.add.collider(this.obj, this.solids);
  }

  get x(): number {
    return this.obj.x;
  }
  set x(v: number) {
    this.obj.x = v;
  }
  get y(): number {
    return this.arcade.bottom;
  }
  set y(_v: number) {
    /* driven by physics */
  }

  setVelocityX(vx: number): void {
    this.desired = vx;
  }

  hop(vx: number, vy: number): void {
    if (this.hopLock > 0) return;
    this.arcade.setVelocityY(vy);
    this.airVx = vx;
    this.arcade.setVelocityX(vx);
    this.hopLock = 0.35;
    this.onGround = false;
  }

  teleport(x: number, y = FLOOR_Y): void {
    this.arcade.reset(x, y - BODY_H / 2);
    this.desired = 0;
    this.vx = 0;
    this.vy = 0;
  }

  update(dt: number): void {
    const b = this.arcade;
    this.hopLock = Math.max(0, this.hopLock - dt);
    this.onGround = b.blocked.down || b.touching.down;
    const grounded = this.onGround && this.hopLock <= 0;
    if (grounded) {
      b.setVelocityX(approach(b.velocity.x, this.desired, 16, dt));
    } else if (!this.onGround) {
      // in the air she keeps steering toward her desired direction, gently
      const target = Math.abs(this.desired) > 1 ? Math.sign(this.desired) * Math.max(Math.abs(this.airVx), 90) : this.airVx;
      b.setVelocityX(approach(b.velocity.x, target, 6, dt));
    }
    this.vx = b.velocity.x;
    this.vy = b.velocity.y;
    const pushing = Math.abs(this.desired) > 1;
    const hit = (b.touching.left && this.desired < 0) || (b.touching.right && this.desired > 0) || (b.blocked.left && this.desired < 0) || (b.blocked.right && this.desired > 0);
    this.blocked = pushing && hit;
    if (this.onGround) this.airVx = 0;
  }
}
