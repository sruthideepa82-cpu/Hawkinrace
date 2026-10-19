/**
 * Screen-space atmosphere: fog bands and drifting motes.
 *
 * Both are deliberately cheap, because they run every frame on a laptop:
 *
 *  - Fog is a handful of tinted rectangles in the HUD-independent world space,
 *    never a filter. No full-screen post-processing at all.
 *  - Motes reuse the single existing particle dot and are capped per theme
 *    (50-100). The emitter is created once; only its position tracks the
 *    camera, so there is no per-frame allocation.
 *
 * Nothing here touches game state. The class is created by GameScene, ignores
 * everything except the camera, and is destroyed with the scene.
 */

import Phaser from 'phaser';
import type { WorldTheme } from '../config/worldTheme';
import { ensureParticleTexture } from '../entities/carTexture';

export class Atmosphere {
  private fogLayers: Phaser.GameObjects.Rectangle[] = [];
  private motes?: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly theme: WorldTheme,
    width: number,
    height: number,
  ) {
    this.buildFog(width, height);
    this.buildMotes(width, height);
  }

  /**
   * Fog as stacked translucent sheets anchored to the world, not the screen.
   *
   * Anchoring to the camera in `update` keeps a sheet the same thickness on
   * screen regardless of zoom, which is what stops it swallowing the road when
   * the camera pulls back for speed.
   */
  private buildFog(width: number, height: number): void {
    const { color, alpha, band, layers } = this.theme.fog;
    const bandHeight = height * (band[1] - band[0]);
    for (let i = 0; i < layers; i++) {
      const rect = this.scene.add
        .rectangle(0, 0, width * 3, bandHeight, color, alpha)
        .setOrigin(0.5, 0)
        .setDepth(6)
        .setScrollFactor(0);
      // Each sheet is slightly stronger and higher than the last, which is what
      // gives the haze depth rather than one flat wash.
      rect.setAlpha(alpha * (0.5 + (i / Math.max(1, layers - 1)) * 0.5));
      this.fogLayers.push(rect);
    }
  }

  private buildMotes(width: number, height: number): void {
    const m = this.theme.motes;
    ensureParticleTexture(this.scene);
    this.motes = this.scene.add
      .particles(0, 0, 'particle-dot', {
        x: { min: -width * 0.6, max: width * 1.6 },
        y: { min: -height * 0.2, max: height * 1.1 },
        lifespan: m.lifespanMs,
        speedY: m.rise ? { min: -m.speedY[1], max: -m.speedY[0] } : { min: m.speedY[0], max: m.speedY[1] },
        speedX: { min: m.speedX[0], max: m.speedX[1] },
        scale: { min: m.scale[0], max: m.scale[1] },
        alpha: { start: m.alpha, end: 0 },
        tint: m.tint,
        quantity: m.count,
        frequency: m.count > 80 ? 90 : 130,
        blendMode: Phaser.BlendModes.ADD,
      })
      .setDepth(7)
      .setScrollFactor(0);
  }

  /** Called once a frame. Only repositions; it never allocates. */
  update(camera: Phaser.Cameras.Scene2D.Camera, width: number, height: number): void {
    const scrollX = camera.scrollX;
    const scrollY = camera.scrollY;

    for (let i = 0; i < this.fogLayers.length; i++) {
      const rect = this.fogLayers[i];
      // Offset each sheet slightly so they drift relative to one another.
      const bias = i * 26;
      rect.setPosition(scrollX + width / 2, scrollY + height * this.theme.fog.band[0] + bias);
    }

    if (this.motes) {
      this.motes.setPosition(scrollX + width / 2, scrollY + height * 0.5);
    }
  }

  destroy(): void {
    this.fogLayers.forEach((r) => r.destroy());
    this.fogLayers = [];
    this.motes?.destroy();
    this.motes = undefined;
  }
}