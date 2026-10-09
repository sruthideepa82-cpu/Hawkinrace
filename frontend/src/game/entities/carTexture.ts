import Phaser from 'phaser';

/**
 * Returns the key for the loaded car texture.
 */
export function ensureCarTexture(scene: Phaser.Scene, carId: string, color: number): string {
  const key = `car-${carId}`;
  if (scene.textures.exists(key)) return key;
  // Fallback to first car if somehow missing
  return 'car-apex-vulcan';
}

/** Small soft dot used for exhaust and boost particles. */
export function ensureParticleTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists('particle-dot')) return;
  const g = scene.add.graphics();
  g.fillStyle(0xffffff, 1).fillCircle(4, 4, 4);
  g.generateTexture('particle-dot', 8, 8);
  g.destroy();
}