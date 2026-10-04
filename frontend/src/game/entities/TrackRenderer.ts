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
    g.fillStyle(COLORS.grass).fillRect(0, 0, W, H);
    g.fillStyle(COLORS.grassDetail);
    let seed = 1337;
    const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < 2500; i++) g.fillRect(rand() * W, rand() * H, 10 + rand() * 30, 3 + rand() * 6);

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
