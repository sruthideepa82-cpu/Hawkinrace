import Phaser from 'phaser';
import type { RaceCarConfig } from '../bridge';
import { createCarTuning } from '../config/carTuning';
import { CAR, COLORS } from '../config/GameConfig';
import { CarPhysics } from './CarPhysics';

/** Phaser view of the player's car. Swap the texture for artwork later. */
export class PlayerCar {
  readonly physics: CarPhysics;
  readonly sprite: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene, car: RaceCarConfig) {
    this.physics = new CarPhysics(createCarTuning(car.stats));
    const key = PlayerCar.ensureTexture(scene, car.color);
    this.sprite = scene.add.image(0, 0, key).setDepth(10);
  }

  private static ensureTexture(scene: Phaser.Scene, color: number): string {
    const key = `car-${color.toString(16)}`;
    if (scene.textures.exists(key)) return key;
    const { width: w, height: h } = CAR;
    const g = scene.add.graphics();
    g.fillStyle(color).fillRoundedRect(0, 0, w, h, 6);
    g.fillStyle(COLORS.carAccent).fillRect(w * 0.68, h * 0.4, w * 0.3, h * 0.2);
    g.fillStyle(COLORS.carWindow).fillRoundedRect(w * 0.3, 3, w * 0.34, h - 6, 3);
    g.fillStyle(0xfff2b0).fillRect(w - 4, 3, 4, 5).fillRect(w - 4, h - 8, 4, 5);
    g.fillStyle(0x7a0f2a).fillRect(0, 3, 3, 5).fillRect(0, h - 8, 3, 5);
    g.generateTexture(key, w, h);
    g.destroy();
    return key;
  }

  sync(): void {
    this.sprite.setPosition(this.physics.x, this.physics.y).setRotation(this.physics.heading);
  }
}
