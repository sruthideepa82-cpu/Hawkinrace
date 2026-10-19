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
  protected shadow!: Phaser.GameObjects.Image;
  protected brakeLights!: Phaser.GameObjects.Graphics;
  protected headlights!: Phaser.GameObjects.Graphics;
  private nitroGlow!: Phaser.GameObjects.Image;
  /**
   * Exhaust flame left behind while the boost is held. Emits ONLY while
   * boosting and stops the moment it is not, so the trail can never outlive the
   * boost and leave a car trailing light with nothing to justify it.
   */
  private nitroTrail!: Phaser.GameObjects.Particles.ParticleEmitter;
  protected exhaustEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor(
    protected readonly scene: Phaser.Scene,
    readonly config: RacerConfig,
    /**
     * Optional texture override. The player always uses their chosen chassis;
     * opponents are given a distinct livery so four cars on the same road are
     * readable at a glance. Null falls back to the chassis sprite.
     */
    readonly liveryKey: string | null = null,
  ) {
    const textureKey = this.liveryKey ?? ensureCarTexture(scene, config.carId, config.color);
    this.sprite = scene.add.image(0, 0, textureKey).setDepth(10);
    // Scale the car sprite to roughly 84 pixels wide (the size of the old procedural texture)
    this.sprite.setScale(84 / this.sprite.width);
    this.shadow = scene.add.image(0, 0, this.sprite.texture.key)
      .setDepth(9)
      .setTint(0x000000)
      .setAlpha(0.5)
      .setScale(this.sprite.scaleX);

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
      .setBlendMode(Phaser.BlendModes.ADD)
      .setScale(this.sprite.scaleX);

    // The boost flame. Two emitters at the rear corners so it reads as coming
    // out of the exhausts rather than from the middle of the car, and tinted
    // into the game's neon palette so it matches the brake lights and the
    // ability bar rather than looking like a borrowed asset.
    this.nitroTrail = scene.add
      .particles(0, 0, 'particle-dot', {
        speed: { min: 40, max: 130 },
        angle: { min: 0, max: 360 },
        scale: { start: 0.85, end: 0 },
        alpha: { start: 0.85, end: 0 },
        tint: [0x9b5cff, 0xff2e63, 0xffd166],
        lifespan: { min: 220, max: 420 },
        frequency: 26,
        blendMode: 'ADD',
        emitting: false,
      })
      .setDepth(9);
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
    this.shadow.setPosition(vx - 4, vy + 4).setRotation(heading);
    this.nitroGlow.setPosition(vx, vy).setRotation(heading).setAlpha(opts.boosting ? 0.55 : 0);
    this.nitroGlow.setTint(opts.boosting ? 0x9b5cff : 0xffffff);

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

    // Boost flame. The emitter is driven straight off the same `boosting` flag that
    // lit the glow, so the trail and the glow always start and stop together and
    // neither can be left running by a car that is no longer boosting.
    const boosting = opts.boosting === true;
    if (boosting) {
      const cos = Math.cos(heading);
      const sin = Math.sin(heading);
      for (const side of [-1, 1]) {
        this.nitroTrail.setPosition(x - cos * 26 - sin * 7 * side, y - sin * 26 + cos * 7 * side);
        this.nitroTrail.emitParticle(1);
      }
      this.nitroTrail.setConfig({ frequency: boosting ? 26 : -1 });
    } else {
      this.nitroTrail.setConfig({ frequency: -1 });
    }

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
    this.shadow.destroy();
    this.brakeLights.destroy();
    this.headlights.destroy();
    this.exhaustEmitter.destroy();
    this.nitroGlow.destroy();
    this.nitroTrail.destroy();
  }
}

/** Phaser view of an AI opponent. No tyre marks or exhaust: four cars must stay cheap. */
export class AiCarView extends CarView {}