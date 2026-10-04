import Phaser from 'phaser';
import type { RacerConfig } from '../config/racers';
import { CarView, type CarViewOptions, type CarViewState } from './CarView';
import { ensureParticleTexture } from './carTexture';

/**
 * Phaser view of the player's car. Adds tyre marks and an exhaust plume on top of
 * the shared car view; the physics itself lives in `CarPhysics`.
 */
export class PlayerCar extends CarView {
  private tireMarks!: Phaser.GameObjects.RenderTexture;
  /** Reusable dots stamped into `tireMarks` (created once, never per frame). */
  private tireDots: Phaser.GameObjects.Arc[] = [];
  private exhaustEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor(scene: Phaser.Scene, config: RacerConfig, worldWidth: number, worldHeight: number) {
    super(scene, config);
    ensureParticleTexture(scene);

    // Tire marks layer (persists)
    this.tireMarks = scene.add.renderTexture(0, 0, worldWidth, worldHeight).setDepth(2);
    this.tireDots = [
      scene.add.circle(0, 0, 3, 0x111111, 0.1).setVisible(false),
      scene.add.circle(0, 0, 3, 0x111111, 0.1).setVisible(false),
    ];

    this.exhaustEmitter = scene.add
      .particles(0, 0, 'particle-dot', {
        scale: { start: 0.2, end: 0 },
        alpha: { start: 0.5, end: 0 },
        speed: 20,
        lifespan: 400,
        blendMode: 'ADD',
        emitting: false,
      })
      .setDepth(9);
  }

  override sync(physics: CarViewState, opts: CarViewOptions = {}): void {
    const { braking = false, accelerating = false, speed = 0 } = opts;
    super.sync(physics, opts);

    // Exhaust
    if (accelerating && speed < 150) {
      this.exhaustEmitter.setPosition(
        physics.x - Math.cos(physics.heading) * 20,
        physics.y - Math.sin(physics.heading) * 20,
      );
      this.exhaustEmitter.emitParticle(1);
    }

    if (!braking || speed <= 50) return;

    // Tire marks
    const [p1x, p1y, p2x, p2y] = this.rearLights(physics);
    this.tireDots[0].setPosition(p1x, p1y);
    this.tireDots[1].setPosition(p2x, p2y);
    this.tireMarks.draw(this.tireDots);
  }
}