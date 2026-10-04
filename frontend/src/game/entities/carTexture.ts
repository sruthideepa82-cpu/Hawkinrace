import type Phaser from 'phaser';
import { CAR } from '../config/GameConfig';

/**
 * Generates the top-down car sprite. Shared by the player and the AI grid so a
 * chassis always looks the same, whichever driver is in it.
 */
export function ensureCarTexture(scene: Phaser.Scene, carId: string, color: number): string {
  // The colour is part of the key so two drivers sharing a chassis still get
  // visibly different cars.
  const key = `car-${carId}-${color}`;
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

  g.fillStyle(color);

  // Main Body based on chassis id
  if (carId === 'night-runner') {
    g.fillPoints([{x: pad, y: pad + 4}, {x: pad + w, y: pad + 8}, {x: pad + w + 4, y: pad + h/2}, {x: pad + w, y: pad + h - 8}, {x: pad, y: pad + h - 4}], true);
    g.fillStyle(0x050505).fillPoints([{x: pad + w*0.4, y: pad + 4}, {x: pad + w*0.6, y: pad + 6}, {x: pad + w*0.6, y: pad + h - 6}, {x: pad + w*0.4, y: pad + h - 4}], true);
  } else if (carId === 'hawk-xr') {
    g.fillRoundedRect(pad, pad - 2, w, h + 4, 4);
    g.fillStyle(0x111111).fillRect(pad + w*0.2, pad - 2, w*0.6, h + 4);
    g.fillStyle(0xffffff).fillRect(pad + 5, pad + h/2 - 2, w - 10, 4);
    g.fillStyle(0x050505).fillRect(pad + w * 0.45, pad - 2, w * 0.15, h + 4);
  } else {
    g.fillRoundedRect(pad, pad, w, h, 8);
    g.fillStyle(0x000000, 0.2).fillRect(pad + w * 0.2, pad, w * 0.6, h);
    g.fillStyle(0x050505).fillRoundedRect(pad + w * 0.45, pad + 2, w * 0.2, h - 4, 2);
    g.fillRoundedRect(pad + w * 0.15, pad + 4, w * 0.1, h - 8, 2);
  }

  // Headlights
  g.fillStyle(0xfff2b0, 0.5).fillCircle(pad + w, pad + h * 0.2, 10).fillCircle(pad + w, pad + h * 0.8, 10);
  g.fillStyle(0xffffff).fillRect(pad + w - 4, pad + h * 0.15, 4, h * 0.15).fillRect(pad + w - 4, pad + h * 0.7, 4, h * 0.15);

  // Tail lights
  g.fillStyle(0xff0000, 0.6).fillCircle(pad, pad + h * 0.2, 8).fillCircle(pad, pad + h * 0.8, 8);
  g.fillStyle(0xff2e63).fillRect(pad, pad + h * 0.15, 3, h * 0.15).fillRect(pad, pad + h * 0.7, 3, h * 0.15);

  g.generateTexture(key, w + 20, h + 20);
  g.destroy();
  return key;
}

/** Small soft dot used for exhaust and boost particles. */
export function ensureParticleTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists('particle-dot')) return;
  const g = scene.add.graphics();
  g.fillStyle(0xffffff, 1).fillCircle(4, 4, 4);
  g.generateTexture('particle-dot', 8, 8);
  g.destroy();
}