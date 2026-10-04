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

    // Night atmosphere grass
    g.fillStyle(0x05040a).fillRect(0, 0, W, H);
    let seed = 1337;
    const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

    // Regions: 
    // Forest: x > 1500, y < 1000
    // Residential: x < 1500
    const isForest = (x: number, y: number) => x > 1600 && y < 1200;

    // --- DRAW ENVIRONMENT HELPERS ---
    const drawTree = (x: number, y: number) => {
      g.fillStyle(0x0a110a, 0.9);
      g.fillCircle(x, y, 20 + rand() * 20);
      g.fillStyle(0x050a05, 0.9);
      g.fillCircle(x + 5, y + 5, 15 + rand() * 15);
      if (rand() < 0.3) {
        g.fillStyle(0x020502, 0.8).fillCircle(x - 5, y + 10, 10 + rand() * 10);
      }
    };

    const drawHouse = (x: number, y: number) => {
      const w = 70 + rand() * 30;
      const h = 50 + rand() * 20;
      g.fillStyle(0x1a1525).fillRect(x - w/2, y - h/2, w, h); // Main building
      g.fillStyle(0x110d18).fillRect(x - w/2 + 5, y - h/2 + 5, w - 10, h - 10); // Roof
      // Driveway
      g.fillStyle(0x0a0a0f).fillRect(x - w/4, y + h/2, w/2, 40); 
      // Glowing windows
      const winColor = rand() > 0.4 ? 0xffb02e : 0x333344;
      g.fillStyle(winColor).fillRect(x - w/4, y - h/4, 10, 12).fillRect(x + w/4 - 10, y - h/4, 10, 12);
      // Fences
      if (rand() > 0.5) {
        g.lineStyle(2, 0x111111);
        g.strokeRect(x - w/2 - 10, y - h/2 - 10, w + 20, h + 30);
      }
    };

    const drawWaterTower = (x: number, y: number) => {
      g.fillStyle(0x0a0a0f).fillRect(x - 10, y - 100, 20, 100); // Pillar
      g.fillStyle(0x1a1525).fillEllipse(x, y - 120, 100, 40); // Tank
      g.fillStyle(0xff0000, 0.8).fillCircle(x, y - 145, 4); // Red warning light
      g.fillStyle(0xff0000, 0.2).fillCircle(x, y - 145, 20); // Glow
    };

    const drawParkedCar = (x: number, y: number, angle: number) => {
      const w = 40, h = 20;
      g.fillStyle(rand() > 0.5 ? 0xff2e63 : 0x9b5cff); 
      const c = Math.cos(angle), s = Math.sin(angle);
      const hw = w/2, hh = h/2;
      g.fillPoints([{ x: x + hw*c - hh*s, y: y + hw*s + hh*c }, { x: x - hw*c - hh*s, y: y - hw*s + hh*c }, { x: x - hw*c + hh*s, y: y - hw*s - hh*c }, { x: x + hw*c + hh*s, y: y + hw*s - hh*c }], true);
      g.fillStyle(0x111111);
      const r_hw = w/4, r_hh = h/3;
      g.fillPoints([{ x: x + r_hw*c - r_hh*s, y: y + r_hw*s + r_hh*c }, { x: x - r_hw*c - r_hh*s, y: y - r_hw*s + r_hh*c }, { x: x - r_hw*c + r_hh*s, y: y - r_hw*s - r_hh*c }, { x: x + r_hw*c + r_hh*s, y: y + r_hw*s - r_hh*c }], true);
    };

    const drawTelephonePole = (x: number, y: number) => {
      g.fillStyle(0x080808).fillCircle(x, y, 6);
      g.fillRect(x - 12, y - 2, 24, 4); // Crossbar
    };

    // --- BACKGROUND SCATTER ---
    for (let i = 0; i < 1500; i++) {
      const px = rand() * W, py = rand() * H;
      let nearRoad = false;
      for (const p of centerline) {
        if (Math.abs(p.x - px) + Math.abs(p.y - py) < half + 140) {
          nearRoad = true; break;
        }
      }
      if (!nearRoad) {
        if (isForest(px, py) || rand() < 0.6) drawTree(px, py);
        else drawHouse(px, py);
      }
    }

    // Place Water Tower manually far from road
    drawWaterTower(400, 400);

    // --- ROAD DRAWING ---
    // Edge glow and asphalt
    const stamp = (radius: number, color: number, alpha = 1) => {
      g.fillStyle(color, alpha);
      for (const p of centerline) g.fillCircle(p.x, p.y, radius);
    };
    stamp(half + 40, COLORS.roadEdge, 0.04);
    stamp(half + 16, COLORS.roadEdge, 0.08);
    stamp(half + 4, COLORS.roadEdge);
    stamp(half, COLORS.road);

    // Wet patches on road
    g.fillStyle(0x11111c, 0.3);
    for (const p of centerline) {
      if (rand() < 0.1) g.fillEllipse(p.x + (rand() - 0.5) * half, p.y + (rand() - 0.5) * half, 40 + rand() * 60, 20 + rand() * 40);
    }

    // Dashed center line
    g.lineStyle(4, COLORS.roadCenterLine, 0.6);
    for (let i = 0; i < centerline.length; i++) {
      if (Math.floor(i / 4) % 2 !== 0) continue;
      const a = centerline[i], b = centerline[(i + 1) % centerline.length];
      g.lineBetween(a.x, a.y, b.x, b.y);
    }

    // --- PROPS ALONG ROAD EDGE ---
    for (let i = 0; i < centerline.length; i += 12) {
      const p = centerline[i];
      const next = centerline[(i + 1) % centerline.length];
      const dx = next.x - p.x, dy = next.y - p.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      const nx = -dy / len, ny = dx / len;
      const side = (i % 24 === 0) ? 1 : -1;
      const dist = half + 30 + rand() * 20;
      const ox = p.x + nx * dist * side, oy = p.y + ny * dist * side;

      if (isForest(ox, oy)) {
        if (rand() < 0.8) drawTree(ox, oy); // Dense trees at forest edge
        // Dirt shoulders
        g.fillStyle(0x1c1511, 0.4).fillCircle(ox, oy, 20);
      } else {
        if (rand() < 0.2) {
          // Street light
          g.fillStyle(0x222222).fillCircle(ox, oy, 8);
          g.fillStyle(0xfff5b0, 0.3).fillCircle(ox, oy, 80); // Large pool of light
          g.fillStyle(0xffffff, 0.9).fillCircle(ox, oy, 4);
        } else if (rand() < 0.15) {
          drawTelephonePole(ox, oy);
        } else if (rand() < 0.1) {
          drawParkedCar(ox, oy, Math.atan2(dy, dx));
        } else if (rand() < 0.1) {
          drawHouse(ox + nx * 50 * side, oy + ny * 50 * side); // Houses facing road
        }
      }
    }

    // Start Grid Area
    const startP = layout.finishGate.center;
    g.fillStyle(0xffffff, 0.8).fillRect(startP.x - half, startP.y - 20, roadWidth, 8); // Start line thick
    for (let grid = 1; grid <= 4; grid++) {
      const offset = grid * 120;
      g.lineStyle(2, 0xffffff, 0.5);
      g.strokeRect(startP.x - 40, startP.y + offset, 80, 40); // Grid slot
    }
    // Starting Lights Gantry
    g.fillStyle(0x111111).fillRect(startP.x - half - 20, startP.y - 10, roadWidth + 40, 20);
    g.fillStyle(0x050505).fillRect(startP.x - half - 30, startP.y - 15, 15, 30).fillRect(startP.x + half + 15, startP.y - 15, 15, 30);
    // Unlit bulbs
    for(let i=0; i<4; i++) g.fillStyle(0x330000).fillCircle(startP.x - 60 + i*40, startP.y, 6);

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
