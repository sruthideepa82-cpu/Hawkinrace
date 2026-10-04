import Phaser from 'phaser';
import { COLORS } from '../config/GameConfig';
import type { TrackLayout } from './TrackLayout';

const TRACK_TEXTURE = 'track-base';

/** Draws a TrackLayout procedurally into one static texture. */
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

    // Grass with cheap deterministic speckle.
    g.fillStyle(0x05040a).fillRect(0, 0, W, H); // Darker grass for night theme
    g.fillStyle(COLORS.grassDetail);
    let seed = 1337;
    const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < 2500; i++) g.fillRect(rand() * W, rand() * H, 10 + rand() * 30, 3 + rand() * 6);

    // Helper functions for environment props
    const drawTree = (x: number, y: number) => {
      g.fillStyle(0x0a110a, 0.9);
      g.fillCircle(x, y, 20 + rand() * 15);
      g.fillStyle(0x050a05, 0.9);
      g.fillCircle(x + 5, y + 5, 15 + rand() * 10);
    };

    const drawHouse = (x: number, y: number) => {
      // For simplicity in TrackRenderer graphics, draw houses unrotated but differently proportioned based on position,
      // or compute basic rotated points.
      const w = 80, h = 60;
      g.fillStyle(0x1a1525);
      g.fillRect(x - w/2, y - h/2, w, h);
      g.fillStyle(0x110d18);
      g.fillRect(x - w/2 + 5, y - h/2 + 5, w - 10, h - 10); // Roof slope shading
      g.fillStyle(rand() > 0.5 ? 0xffb02e : 0x555555);
      g.fillRect(x - 5, y - 5, 10, 15);
    };

    const drawParkedCar = (x: number, y: number, angle: number) => {
      const w = 40, h = 20;
      // Since it's parked, we can align it with the angle by rotating the drawing via matrix if supported, 
      // but Phaser graphics lacks transform matrix stack. We will draw a simple colored blip.
      g.fillStyle(rand() > 0.5 ? 0xff2e63 : 0x9b5cff); // Random neon car
      // A simple rotated rectangle approximation:
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      const hw = w/2, hh = h/2;
      g.fillPoints([
        { x: x + hw*c - hh*s, y: y + hw*s + hh*c },
        { x: x - hw*c - hh*s, y: y - hw*s + hh*c },
        { x: x - hw*c + hh*s, y: y - hw*s - hh*c },
        { x: x + hw*c + hh*s, y: y + hw*s - hh*c }
      ], true);
      
      // Roof
      g.fillStyle(0x111111);
      const r_hw = w/4, r_hh = h/3;
      g.fillPoints([
        { x: x + r_hw*c - r_hh*s, y: y + r_hw*s + r_hh*c },
        { x: x - r_hw*c - r_hh*s, y: y - r_hw*s + r_hh*c },
        { x: x - r_hw*c + r_hh*s, y: y - r_hw*s - r_hh*c },
        { x: x + r_hw*c + r_hh*s, y: y + r_hw*s - r_hh*c }
      ], true);
    };

    // Scatter environment objects away from the road
    for (let i = 0; i < 800; i++) {
      const px = rand() * W;
      const py = rand() * H;
      // Check distance from road
      let nearRoad = false;
      for (const p of centerline) {
        const dx = p.x - px;
        const dy = p.y - py;
        if (dx * dx + dy * dy < (half + 120) * (half + 120)) {
          nearRoad = true;
          break;
        }
      }
      
      if (!nearRoad) {
        if (rand() < 0.8) drawTree(px, py);
        else drawHouse(px, py);
      }
    }

    // Neon glow, edge line, then asphalt (dense circles = smooth thick stroke).
    const stamp = (radius: number, color: number, alpha = 1) => {
      g.fillStyle(color, alpha);
      for (const p of centerline) g.fillCircle(p.x, p.y, radius);
    };
    stamp(half + 30, COLORS.roadEdge, 0.05);
    stamp(half + 14, COLORS.roadEdge, 0.08);
    stamp(half + 5, COLORS.roadEdge);
    stamp(half, COLORS.road);

    // Dashed center line.
    g.lineStyle(4, COLORS.roadCenterLine, 0.6);
    for (let i = 0; i < centerline.length; i++) {
      if (Math.floor(i / 3) % 2 !== 0) continue;
      const a = centerline[i];
      const b = centerline[(i + 1) % centerline.length];
      g.lineBetween(a.x, a.y, b.x, b.y);
    }

    TrackRenderer.drawFinishLine(g, layout);

    // Street lights and parked cars near road edge
    g.fillStyle(0x000000);
    for (let i = 0; i < centerline.length; i += 12) {
      const p = centerline[i];
      const next = centerline[(i + 1) % centerline.length];
      const dx = next.x - p.x;
      const dy = next.y - p.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      const nx = -dy / len;
      const ny = dx / len;
      
      const side = (i % 24 === 0) ? 1 : -1;
      const dist = half + 40; // Just outside the road
      const ox = p.x + nx * dist * side;
      const oy = p.y + ny * dist * side;

      if (rand() < 0.4) {
        // Street light
        g.fillStyle(0x222222);
        g.fillCircle(ox, oy, 8);
        g.fillStyle(0xfff5b0, 0.4);
        g.fillCircle(ox, oy, 60); // Glow
        g.fillStyle(0xffffff, 0.9);
        g.fillCircle(ox, oy, 4);
      } else if (rand() < 0.2) {
        // Parked car
        const angle = Math.atan2(dy, dx);
        drawParkedCar(ox, oy, angle);
      }
    }

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
        const u = (c - cols / 2) * cell; // across the road
        const v = (r - rows / 2) * cell; // along the road
        const corner = (du: number, dv: number) => ({
          x: center.x + normal.x * (u + du) + direction.x * (v + dv),
          y: center.y + normal.y * (u + du) + direction.y * (v + dv),
        });
        g.fillStyle((r + c) % 2 === 0 ? COLORS.finishLight : COLORS.finishDark);
        g.fillPoints([corner(0, 0), corner(cell, 0), corner(cell, cell), corner(0, cell)], true);
      }
    }
  }
}
