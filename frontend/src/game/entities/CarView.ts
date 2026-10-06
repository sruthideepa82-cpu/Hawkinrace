import Phaser from 'phaser';
import type { RacerConfig } from '../config/racers';
import { ensureCarTexture, ensureParticleTexture } from './carTexture';

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
  protected headlights!: Phaser.GameObjects.Graphics;
  private nitroGlow!: Phaser.GameObjects.Image;
  protected exhaustEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor(
    protected readonly scene: Phaser.Scene,
    readonly config: RacerConfig,
  ) {
    this.sprite = scene.add.image(0, 0, ensureCarTexture(scene, config.carId, config.color)).setDepth(10);
    this.brakeLights = scene.add.graphics().setDepth(11);
    this.headlights = scene.add.graphics().setDepth(11);
    
    ensureParticleTexture(scene);
    
    this.exhaustEmitter = scene.add
      .particles(0, 0, 'particle-dot', {
        scale: { start: 0.2, end: 0 },
        alpha: { start: 0.4, end: 0 },
        speed: { min: 10, max: 30 },
        lifespan: 500,
        blendMode: 'ADD',
        emitting: false,
      })
      .setDepth(9);
      
    this.nitroGlow = scene.add
      .image(0, 0, this.sprite.texture.key)
      .setDepth(9)
      .setTint(0xffffff)
      .setAlpha(0)
      .setBlendMode(Phaser.BlendModes.ADD);
  }

  sync(physics: CarViewState, opts: CarViewOptions = {}): void {
    const { x, y, heading } = physics;
    
    // Idle vibration
    let vx = x;
    let vy = y;
    const isIdling = opts.speed === undefined || opts.speed < 5;
    if (isIdling) {
      vx += (Math.random() - 0.5) * 0.5;
      vy += (Math.random() - 0.5) * 0.5;
    }

    this.sprite.setPosition(vx, vy).setRotation(heading);
    this.nitroGlow.setPosition(vx, vy).setRotation(heading).setAlpha(opts.boosting ? 0.55 : 0);

    // Headlights
    this.headlights.clear();
    const [h1x, h1y, h2x, h2y] = this.frontLights(physics);
    this.headlights.fillStyle(0xffffff, 0.8).fillCircle(h1x, h1y, 3).fillCircle(h2x, h2y, 3);
    this.headlights.fillStyle(0xffffff, 0.2).fillCircle(h1x, h1y, 25).fillCircle(h2x, h2y, 25);
    
    // Headlight cones
    this.headlights.fillStyle(0xffffff, 0.05);
    this.headlights.beginPath();
    this.headlights.moveTo(h1x, h1y);
    this.headlights.lineTo(h1x + Math.cos(heading - 0.2) * 150, h1y + Math.sin(heading - 0.2) * 150);
    this.headlights.lineTo(h1x + Math.cos(heading + 0.2) * 150, h1y + Math.sin(heading + 0.2) * 150);
    this.headlights.fillPath();
    
    this.headlights.beginPath();
    this.headlights.moveTo(h2x, h2y);
    this.headlights.lineTo(h2x + Math.cos(heading - 0.2) * 150, h2y + Math.sin(heading - 0.2) * 150);
    this.headlights.lineTo(h2x + Math.cos(heading + 0.2) * 150, h2y + Math.sin(heading + 0.2) * 150);
    this.headlights.fillPath();

    // Exhaust
    if (isIdling || (opts.accelerating && opts.speed! < 150)) {
      this.exhaustEmitter.setPosition(
        x - Math.cos(heading) * 20,
        y - Math.sin(heading) * 20,
      );
      this.exhaustEmitter.emitParticle(isIdling ? (Math.random() > 0.5 ? 1 : 0) : 1);
    }

    this.brakeLights.clear();
    if (!opts.braking) return;

    const [p1x, p1y, p2x, p2y] = this.rearLights(physics);
    this.brakeLights.fillStyle(0xff0000, 0.9).fillCircle(p1x, p1y, 6).fillCircle(p2x, p2y, 6);
    this.brakeLights.fillStyle(0xffaaaa, 0.6).fillCircle(p1x, p1y, 12).fillCircle(p2x, p2y, 12);
  }

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

  protected frontLights(physics: { x: number; y: number; heading: number }): [number, number, number, number] {
    const { x, y, heading } = physics;
    const fx = x + Math.cos(heading) * 15;
    const fy = y + Math.sin(heading) * 15;
    return [
      fx - Math.sin(heading) * 8,
      fy + Math.cos(heading) * 8,
      fx + Math.sin(heading) * 8,
      fy - Math.cos(heading) * 8,
    ];
  }

  destroy(): void {
    this.sprite.destroy();
    this.brakeLights.destroy();
    this.headlights.destroy();
    this.exhaustEmitter.destroy();
    this.nitroGlow.destroy();
  }
}

/** Phaser view of an AI opponent. No tyre marks or exhaust: four cars must stay cheap. */
export class AiCarView extends CarView {}