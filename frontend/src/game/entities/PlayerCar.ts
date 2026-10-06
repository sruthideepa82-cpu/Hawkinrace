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
  private youLabel!: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, config: RacerConfig, worldWidth: number, worldHeight: number) {
    super(scene, config);
    ensureParticleTexture(scene);

    // Tire marks layer (persists)
    this.tireMarks = scene.add.renderTexture(0, 0, worldWidth, worldHeight).setDepth(2);
    this.tireDots = [
      scene.add.circle(0, 0, 3, 0x111111, 0.1).setVisible(false),
      scene.add.circle(0, 0, 3, 0x111111, 0.1).setVisible(false),
    ];

    this.youLabel = scene.add.text(0, 0, 'YOU', {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#ffffff',
      backgroundColor: '#cc113388',
      padding: { x: 4, y: 2 }
    }).setOrigin(0.5, 1).setDepth(20);
  }

  override sync(physics: CarViewState, opts: CarViewOptions = {}): void {
    const { braking = false, speed = 0 } = opts;
    super.sync(physics, opts);

    // Sync YOU label
    this.youLabel.setPosition(physics.x, physics.y - 30);

    // Exhaust is now handled in CarView.ts sync()

    if (!braking || speed <= 50) return;

    // Tire marks
    const [p1x, p1y, p2x, p2y] = this.rearLights(physics);
    this.tireDots[0].setPosition(p1x, p1y);
    this.tireDots[1].setPosition(p2x, p2y);
    this.tireMarks.draw(this.tireDots);
  }
}