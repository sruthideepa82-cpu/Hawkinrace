import Phaser from 'phaser';
import type { TrackLayout } from './TrackLayout';
import type { Point } from '../config/tracks';

const TRACK_TEXTURE = 'track-base';

export class TrackRenderer {
  constructor(scene: Phaser.Scene, layout: TrackLayout) {
    if (!scene.textures.exists(TRACK_TEXTURE)) {
      TrackRenderer.bake(scene, layout);
    }
    scene.add.image(0, 0, TRACK_TEXTURE).setOrigin(0, 0).setDepth(0);
  }

  private static bake(scene: Phaser.Scene, layout: TrackLayout): void {
    const { worldWidth: W, worldHeight: H, roadWidth, centerline } = layout;
    const half = roadWidth / 2;
    const g = scene.add.graphics();

    // 1. Base Environment: Dark navy/purple night
    g.fillStyle(0x05040a).fillRect(0, 0, W, H);
    let seed = 1337;
    const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

    // Track sections based on X/Y (roughly matching the shape)
    const isForest = (x: number, y: number) => x > 1800 || y < 600;
    const isTown = (x: number, y: number) => !isForest(x, y);

    // 2. Draw Environment Background (Houses, Trees, Fog)
    const drawTree = (x: number, y: number) => {
      g.fillStyle(0x02030a, 0.9); // Dark blue-black trees
      g.fillCircle(x, y, 25 + rand() * 20);
      g.fillStyle(0x0a0c1a, 0.9); // Slight moonlight highlight
      g.fillCircle(x + 5, y + 5, 15 + rand() * 15);
    };

    const drawBuilding = (x: number, y: number, facingRight: boolean) => {
      const w = 80 + rand() * 40;
      const h = 60 + rand() * 30;
      
      // Building base
      g.fillStyle(0x110b1a).fillRect(x - w/2, y - h/2, w, h);
      g.fillStyle(0x09050d).fillRect(x - w/2 + 5, y - h/2 + 5, w - 10, h - 10); // Roof

      // Neon storefront glow
      const neonColor = rand() > 0.5 ? 0xff2a5f : 0x00f0ff; // Pink or Cyan
      const glowDir = facingRight ? w/2 : -w/2;
      
      // Glowing windows/signs
      g.fillStyle(neonColor, 0.8).fillRect(x + glowDir - (facingRight ? 5 : 0), y - 10, 5, 20);
      g.fillStyle(neonColor, 0.1).fillCircle(x + glowDir, y, 60); // Light pool
    };

    const drawWaterTower = (x: number, y: number) => {
      g.fillStyle(0x05030a).fillRect(x - 15, y - 120, 30, 120); // Pillar
      g.fillStyle(0x0f0b1a).fillEllipse(x, y - 130, 120, 50); // Tank
      g.fillStyle(0xff0000, 0.8).fillCircle(x, y - 160, 5); // Red beacon
      g.fillStyle(0xff0000, 0.2).fillCircle(x, y - 160, 30); // Glow
    };

    const drawParkedCar = (x: number, y: number, angle: number) => {
      const w = 40, h = 20;
      g.fillStyle(0x221133); // Dark silhouette
      const c = Math.cos(angle), s = Math.sin(angle);
      const hw = w/2, hh = h/2;
      g.fillPoints([{ x: x + hw*c - hh*s, y: y + hw*s + hh*c }, { x: x - hw*c - hh*s, y: y - hw*s + hh*c }, { x: x - hw*c + hh*s, y: y - hw*s - hh*c }, { x: x + hw*c + hh*s, y: y + hw*s - hh*c }], true);
    };

    const drawStreetLamp = (x: number, y: number) => {
      g.fillStyle(0x111111).fillCircle(x, y, 6); // Post
      g.fillStyle(0xff2a5f, 0.15).fillCircle(x, y, 100); // Neon pink light pool
      g.fillStyle(0xff2a5f, 0.6).fillCircle(x, y, 5); // Bulb
    };

    // Scatter background elements
    for (let i = 0; i < 1500; i++) {
      const px = rand() * W, py = rand() * H;
      let distToRoad = 9999;
      for (const p of centerline) {
        const d = Math.abs(p.x - px) + Math.abs(p.y - py);
        if (d < distToRoad) distToRoad = d;
      }
      
      if (distToRoad > half + 100) { // Off road
        if (isForest(px, py) || rand() < 0.4) drawTree(px, py);
        else if (distToRoad < half + 300) drawBuilding(px, py, px < 1350); // Buildings face road roughly
      }
    }

    // Place Water Tower in a specific spot visible from main street
    drawWaterTower(1400, 250);

    // 3. Draw Road (Wet Asphalt)
    const stamp = (radius: number, color: number, alpha = 1) => {
      g.fillStyle(color, alpha);
      for (const p of centerline) g.fillCircle(p.x, p.y, radius);
    };
    
    // Sidewalk / Road edge
    stamp(half + 40, 0x110c1f, 1.0); // Sidewalk concrete
    stamp(half + 5, 0x2a1c40, 1.0);  // Curb highlight
    stamp(half, 0x0a0a0f, 1.0);      // Dark wet asphalt
    
    // Wet road reflections
    for (const p of centerline) {
      if (rand() < 0.3) {
        const rw = rand() * 80 + 40;
        const rh = rand() * 40 + 20;
        g.fillStyle(0x161622, 0.4).fillEllipse(p.x + (rand()-0.5)*half, p.y + (rand()-0.5)*half, rw, rh);
      }
    }

    // Neon reflections on wet patches
    for (const p of centerline) {
      if (isTown(p.x, p.y) && rand() < 0.15) {
        g.fillStyle(0xff2a5f, 0.1).fillEllipse(p.x, p.y, 120, 40);
      }
    }

    // Yellow Center Lines
    g.lineStyle(4, 0xcc9900, 0.6);
    for (let i = 0; i < centerline.length; i++) {
      if (Math.floor(i / 3) % 2 !== 0) continue;
      const a = centerline[i], b = centerline[(i + 1) % centerline.length];
      g.lineBetween(a.x, a.y, b.x, b.y);
    }

    // 4. Props along the road (Lamps, Poles)
    const poles: Point[] = [];
    
    for (let i = 0; i < centerline.length; i += 10) {
      const p = centerline[i];
      const next = centerline[(i + 1) % centerline.length];
      const dx = next.x - p.x, dy = next.y - p.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      const nx = -dy / len, ny = dx / len;
      const side = (i % 20 === 0) ? 1 : -1;
      const ox = p.x + nx * (half + 25) * side;
      const oy = p.y + ny * (half + 25) * side;

      if (isTown(p.x, p.y)) {
        if (rand() < 0.25) {
          drawStreetLamp(ox, oy);
          if (rand() < 0.5) drawParkedCar(ox - nx * 10, oy - ny * 10, Math.atan2(dy, dx));
        } else if (rand() < 0.2) {
          poles.push({ x: ox, y: oy });
          g.fillStyle(0x050505).fillCircle(ox, oy, 4); // Telephone pole
        }
      } else {
        if (rand() < 0.6) drawTree(ox + nx * 20 * side, oy + ny * 20 * side);
      }
    }

    // Draw overhead wires connecting poles
    g.lineStyle(1, 0x000000, 0.6);
    for (let i = 0; i < poles.length - 1; i++) {
      if (Math.hypot(poles[i].x - poles[i+1].x, poles[i].y - poles[i+1].y) < 300) {
        g.lineBetween(poles[i].x, poles[i].y, poles[i+1].x, poles[i+1].y);
      }
    }

    // 5. Start/Finish Line
    TrackRenderer.drawFinishLine(g, layout);

    g.generateTexture(TRACK_TEXTURE, W, H);
    g.destroy();
  }

  private static drawFinishLine(g: Phaser.GameObjects.Graphics, layout: TrackLayout): void {
    const { center, direction, normal } = layout.finishGate;
    const cols = 16;
    const rows = 2;
    const cell = layout.roadWidth / cols;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const u = (c - cols / 2) * cell;
        const v = (r - rows / 2) * cell;
        const corner = (du: number, dv: number) => ({
          x: center.x + normal.x * (u + du) + direction.x * (v + dv),
          y: center.y + normal.y * (u + du) + direction.y * (v + dv),
        });
        g.fillStyle((r + c) % 2 === 0 ? 0xffffff : 0x111111, 0.8);
        g.fillPoints([corner(0, 0), corner(cell, 0), corner(cell, cell), corner(0, cell)], true);
      }
    }
  }
}
