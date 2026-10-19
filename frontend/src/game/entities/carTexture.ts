import Phaser from 'phaser';

/**
 * Returns the key for the loaded car texture.
 */
export function ensureCarTexture(scene: Phaser.Scene, carId: string, _color: number): string {
  const key = `car-${carId}`;
  if (scene.textures.exists(key)) return key;
  // Fallback to first car if somehow missing
  return 'car-apex-vulcan';
}

/**
 * Extra paint schemes used to give opponents distinct liveries.
 *
 * The four chassis sprites are what the player picks between, so letting three
 * opponents run the same one as the player made the field hard to tell apart at
 * a glance -- especially at speed, or in the Upside Down's red light. These four
 * are separate painted cars that ship in `public/cars` but were never loaded.
 *
 * The order is fixed so a given grid slot always paints the same.
 */
export const LIVERY_KEYS: readonly string[] = ['livery-orange', 'livery-green', 'livery-blue', 'livery-red'];

/** The livery texture for opponent slot `index`, or null if none is loaded. */
export function liveryFor(scene: Phaser.Scene, index: number): string | null {
  const key = LIVERY_KEYS[index % LIVERY_KEYS.length];
  return scene.textures.exists(key) ? key : null;
}

/** Small soft dot used for exhaust and boost particles. */
export function ensureParticleTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists('particle-dot')) return;
  const g = scene.add.graphics();
  g.fillStyle(0xffffff, 1).fillCircle(4, 4, 4);
  g.generateTexture('particle-dot', 8, 8);
  g.destroy();
}