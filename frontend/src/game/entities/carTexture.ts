import Phaser from 'phaser';
import { CAR } from '../config/GameConfig';

/**
 * Generates the top-down car sprite. Shared by the player and the AI grid so a
 * chassis always looks the same, whichever driver is in it.
 */
export function ensureCarTexture(scene: Phaser.Scene, carId: string, color: number): string {
  const key = `car-${carId}-${color}`;
  if (scene.textures.exists(key)) return key;

  const { width: w, height: h } = CAR;
  const pad = 12; // padding for shadow/glow
  
  // Faux 3D light calculation helpers (top-down, front is right)
  const darken = (c: number, amt: number) => Phaser.Display.Color.IntegerToColor(c).darken(amt).color;
  const lighten = (c: number, amt: number) => Phaser.Display.Color.IntegerToColor(c).lighten(amt).color;
  
  const roofColor = lighten(color, 15);
  const sideColor = darken(color, 10);
  const backColor = darken(color, 25);
  const frontColor = lighten(color, 5);
  const windowColor = 0x1a1525;
  const bumperColor = 0x111111;

  const g = scene.add.graphics();

  // Shadow
  g.fillStyle(0x000000, 0.5).fillRoundedRect(pad - 4, pad + 6, w + 8, h + 8, 4);

  // Wheels (4 rectangles)
  g.fillStyle(0x0a0a0a);
  const ww = w * 0.18; // wheel width
  const wh = h * 0.25; // wheel height/protrusion
  g.fillRoundedRect(pad + w * 0.15, pad - wh*0.8, ww, wh, 2); // Rear left
  g.fillRoundedRect(pad + w * 0.15, pad + h - wh*0.2, ww, wh, 2); // Rear right
  g.fillRoundedRect(pad + w * 0.7, pad - wh*0.8, ww, wh, 2); // Front left
  g.fillRoundedRect(pad + w * 0.7, pad + h - wh*0.2, ww, wh, 2); // Front right

  // Main Chassis (Base body)
  g.fillStyle(sideColor);
  g.fillRoundedRect(pad, pad, w, h, 4);
  
  // Front slope / Hood
  g.fillStyle(frontColor);
  g.fillPoints([{x: pad + w * 0.6, y: pad}, {x: pad + w, y: pad + 2}, {x: pad + w, y: pad + h - 2}, {x: pad + w * 0.6, y: pad + h}], true);

  // Rear slope / Trunk
  g.fillStyle(backColor);
  g.fillPoints([{x: pad, y: pad + 2}, {x: pad + w * 0.2, y: pad}, {x: pad + w * 0.2, y: pad + h}, {x: pad, y: pad + h - 2}], true);

  // Cabin (Roof and Windows)
  const cx = pad + w * 0.35; // Cabin start X
  const cw = w * 0.35;       // Cabin width
  const cy = pad + h * 0.15; // Cabin Y inset
  const ch = h * 0.7;        // Cabin height
  
  // Windshield
  g.fillStyle(0x000000); // Window rim
  g.fillPoints([{x: cx + cw, y: cy}, {x: cx + cw + w*0.15, y: cy + h*0.05}, {x: cx + cw + w*0.15, y: cy + ch - h*0.05}, {x: cx + cw, y: cy + ch}], true);
  g.fillStyle(windowColor); // Window glass
  g.fillPoints([{x: cx + cw, y: cy + 1}, {x: cx + cw + w*0.12, y: cy + h*0.08}, {x: cx + cw + w*0.12, y: cy + ch - h*0.08}, {x: cx + cw, y: cy + ch - 1}], true);
  
  // Rear window
  g.fillStyle(0x000000);
  g.fillPoints([{x: cx - w*0.1, y: cy + h*0.05}, {x: cx, y: cy}, {x: cx, y: cy + ch}, {x: cx - w*0.1, y: cy + ch - h*0.05}], true);
  g.fillStyle(windowColor);
  g.fillPoints([{x: cx - w*0.08, y: cy + h*0.08}, {x: cx, y: cy + 1}, {x: cx, y: cy + ch - 1}, {x: cx - w*0.08, y: cy + ch - h*0.08}], true);

  // Side windows
  g.fillStyle(windowColor);
  g.fillRect(cx + 2, cy - 2, cw - 4, 3);
  g.fillRect(cx + 2, cy + ch - 1, cw - 4, 3);

  // Roof
  g.fillStyle(roofColor);
  g.fillRoundedRect(cx, cy, cw, ch, 2);

  // Bumpers
  g.fillStyle(bumperColor);
  g.fillRect(pad + w - 2, pad + 4, 3, h - 8); // Front bumper
  g.fillRect(pad - 1, pad + 4, 3, h - 8);     // Rear bumper

  // Spoiler (if not the heavy/truck car)
  if (carId !== 'truck') {
    g.fillStyle(0x222222);
    g.fillRect(pad - 4, pad + 2, 6, h - 4); // Spoiler wing
    g.fillStyle(color);
    g.fillRect(pad - 3, pad + 3, 4, h - 6); // Spoiler paint
  }

  // Headlights
  g.fillStyle(0xfff5cc);
  g.fillRect(pad + w - 3, pad + h * 0.15, 3, h * 0.15);
  g.fillRect(pad + w - 3, pad + h * 0.7, 3, h * 0.15);
  
  // Headlight glows (subtle)
  g.fillStyle(0xfff5cc, 0.3);
  g.fillCircle(pad + w + 2, pad + h * 0.2, 6);
  g.fillCircle(pad + w + 2, pad + h * 0.8, 6);

  // Taillights
  g.fillStyle(0xff1133);
  g.fillRect(pad - 1, pad + h * 0.15, 2, h * 0.2);
  g.fillRect(pad - 1, pad + h * 0.65, 2, h * 0.2);

  g.generateTexture(key, w + pad * 2, h + pad * 2);
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