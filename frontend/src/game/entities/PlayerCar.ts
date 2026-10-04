import Phaser from 'phaser';
import type { RaceCarConfig } from '../bridge';
import { createCarTuning } from '../config/carTuning';
import { CAR } from '../config/GameConfig';
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
    
    const pad = 10;
    
    // Shadow
    g.fillStyle(0x000000, 0.6).fillRoundedRect(pad - 4, pad + 4, w + 8, h + 8, 8);

    // Body glow
    g.fillStyle(color, 0.3).fillRoundedRect(pad - 5, pad - 5, w + 10, h + 10, 10);
    
    // Wheels
    g.fillStyle(0x111111);
    g.fillRoundedRect(pad + w * 0.15, pad - 2, w * 0.2, h + 4, 2);
    g.fillRoundedRect(pad + w * 0.65, pad - 2, w * 0.2, h + 4, 2);

    // Main Body
    g.fillStyle(color).fillRoundedRect(pad, pad, w, h, 8);
    // Roof/Hood accents
    g.fillStyle(0x000000, 0.2).fillRect(pad + w * 0.2, pad, w * 0.6, h);
    
    // Windshield & Rear Window
    g.fillStyle(0x050505).fillRoundedRect(pad + w * 0.45, pad + 2, w * 0.2, h - 4, 2); // Windshield
    g.fillRoundedRect(pad + w * 0.15, pad + 4, w * 0.1, h - 8, 2); // Rear Window

    // Headlights (glow + bulb)
    g.fillStyle(0xfff2b0, 0.5).fillCircle(pad + w, pad + h * 0.2, 10).fillCircle(pad + w, pad + h * 0.8, 10);
    g.fillStyle(0xffffff).fillRect(pad + w - 4, pad + h * 0.15, 4, h * 0.15).fillRect(pad + w - 4, pad + h * 0.7, 4, h * 0.15);
    
    // Taillights (glow + bulb)
    g.fillStyle(0xff0000, 0.6).fillCircle(pad, pad + h * 0.2, 8).fillCircle(pad, pad + h * 0.8, 8);
    g.fillStyle(0xff2e63).fillRect(pad, pad + h * 0.15, 3, h * 0.15).fillRect(pad, pad + h * 0.7, 3, h * 0.15);
    
    // The texture needs to be slightly larger to fit the shadow and glow
    g.generateTexture(key, w + 20, h + 20);
    g.destroy();
    return key;
  }

  sync(): void {
    this.sprite.setPosition(this.physics.x, this.physics.y).setRotation(this.physics.heading);
  }
}
