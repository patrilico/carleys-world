import Phaser from 'phaser';
import { paintFinish, paintFurniture, paintGround, paintHills, paintHouse, paintLights } from '../render/art';

/** Paints all static vector art into textures, then starts the world. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  create(): void {
    paintLights(this);
    paintHills(this);
    paintHouse(this);
    paintFurniture(this);
    paintGround(this);
    paintFinish(this);
    this.scene.start('WorldScene');
  }
}
