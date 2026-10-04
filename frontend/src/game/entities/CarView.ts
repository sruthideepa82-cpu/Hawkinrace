import Phaser from 'phaser';
import type { RacerConfig } from '../config/racers';
import { ensureCarTexture } from './carTexture';

export interface CarViewState {
  x: number;
  y: number;
  heading: number;
}

/** Optional per-frame visual effects, supplied by whoever drives the car. */
export interface CarViewOptions {
  braking?: boolean;
  boosting?: boolean;
  accelerating?: boolean;
  speed?: number;
}

/**
 * Phaser view of one car on the grid. Handles the sprite and brake lights for
 * every racer; the player's car extends this with tyre marks and exhaust.
 */
export class CarView {
  readonly sprite: Phaser.GameObjects.Image;
  protected brakeLights!: Phaser.GameObjects.Graphics;
  private nitroGlow!: Phaser.GameObjects.Image;

  constructor(
    protected readonly scene: Phaser.Scene,
    readonly config: RacerConfig,
  ) {
    this.sprite = scene.add.image(0, 0, ensureCarTexture(scene, config.carId, config.color)).setDepth(10);
    this.brakeLights = scene.add.graphics().setDepth(11);
    this.nitroGlow = scene.add
      .image(0, 0, this.sprite.texture.key)
      .setDepth(9)
      .setTint(0xffffff)
      .setAlpha(0)
      .setBlendMode(Phaser.BlendModes.ADD);
  }

  /** Points the view at the racer's live physics state. */
  sync(physics: CarViewState, opts: CarViewOptions = {}): void {
    const { x, y, heading } = physics;
    this.sprite.setPosition(x, y).setRotation(heading);
    this.nitroGlow.setPosition(x, y).setRotation(heading).setAlpha(opts.boosting ? 0.55 : 0);

    this.brakeLights.clear();
    if (!opts.braking) return;

    const [p1x, p1y, p2x, p2y] = this.rearLights(physics);
    this.brakeLights.fillStyle(0xff0000, 0.9).fillCircle(p1x, p1y, 6).fillCircle(p2x, p2y, 6);
    this.brakeLights.fillStyle(0xffaaaa, 0.6).fillCircle(p1x, p1y, 12).fillCircle(p2x, p2y, 12);
  }

  /** Rear-light positions, reused by the player car for tyre marks. */
  protected rearLights(physics: { x: number; y: number; heading: number }): [number, number, number, number] {
    const { x, y, heading } = physics;
    const bx = x - Math.cos(heading) * 15;
    const by = y - Math.sin(heading) * 15;
    return [
      bx - Math.sin(heading) * 8,
      by + Math.cos(heading) * 8,
      bx + Math.sin(heading) * 8,
      by - Math.cos(heading) * 8,
    ];
  }

  destroy(): void {
    this.sprite.destroy();
    this.brakeLights.destroy();
    this.nitroGlow.destroy();
  }
}

/** Phaser view of an AI opponent. No tyre marks or exhaust: four cars must stay cheap. */
export class AiCarView extends CarView {}