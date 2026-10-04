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

    g.fillStyle(0x05040a).fillRect(0, 0, W, H);
    let seed = 1337;
    const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

    const getZone = (x: number, y: number): 'downtown' | 'residential' | 'edge' => {
      if (x < 2000 && y > 1000) return 'downtown';
      if (x > 2400) return 'residential';
      return 'edge';
    };

    const drawTree = (x: number, y: number) => {
      g.fillStyle(0x02030a, 0.9);
      g.fillCircle(x, y, 25 + rand() * 20);
      g.fillStyle(0x0a0c1a, 0.9);
      g.fillCircle(x + 5, y + 5, 15 + rand() * 15);
    };

    const drawBush = (x: number, y: number) => {
      g.fillStyle(0x03050c, 0.9);
      g.fillCircle(x, y, 10 + rand() * 10);
    };

    const drawShop = (x: number, y: number, facingRight: boolean) => {
      const w = 80 + rand() * 40;
      const h = 60 + rand() * 30;
      g.fillStyle(0x110b1a).fillRect(x - w/2, y - h/2, w, h);
      g.fillStyle(0x09050d).fillRect(x - w/2 + 5, y - h/2 + 5, w - 10, h - 10);
      const neonColor = rand() > 0.5 ? 0xff2a5f : 0x00f0ff;
      const glowDir = facingRight ? w/2 : -w/2;
      g.fillStyle(neonColor, 0.8).fillRect(x + glowDir - (facingRight ? 5 : 0), y - 10, 5, 20);
      g.fillStyle(neonColor, 0.1).fillCircle(x + glowDir, y, 60);
    };

    const drawHouse = (x: number, y: number, facingRight: boolean) => {
      const w = 70 + rand() * 20;
      const h = 50 + rand() * 15;
      g.fillStyle(0x1a1525).fillRect(x - w/2, y - h/2, w, h);
      g.fillStyle(0x110d18).fillRect(x - w/2 + 5, y - h/2 + 5, w - 10, h - 10);
      const driveDir = facingRight ? w/2 + 10 : -w/2 - 30;
      g.fillStyle(0x0a0a0f).fillRect(x + driveDir, y, 20, 40); // Driveway
      const porchColor = 0xffb02e;
      g.fillStyle(porchColor, 0.6).fillCircle(x + (facingRight ? w/2 : -w/2), y, 5); // Porch light
      g.fillStyle(porchColor, 0.1).fillCircle(x + (facingRight ? w/2 : -w/2), y, 40);
      if (rand() > 0.5) {
        g.lineStyle(2, 0x111111);
        g.strokeRect(x - w/2 - 10, y - h/2 - 10, w + 20, h + 20); // Fence
      }
    };

    const drawWaterTower = (x: number, y: number) => {
      g.fillStyle(0x05030a).fillRect(x - 15, y - 120, 30, 120);
      g.fillStyle(0x0f0b1a).fillEllipse(x, y - 130, 120, 50);
      g.fillStyle(0xff0000, 0.8).fillCircle(x, y - 160, 5);
      g.fillStyle(0xff0000, 0.2).fillCircle(x, y - 160, 30);
    };

    const drawParkedCar = (x: number, y: number, angle: number) => {
      const w = 40, h = 20;
      g.fillStyle(0x221133);
      const c = Math.cos(angle), s = Math.sin(angle);
      const hw = w/2, hh = h/2;
      g.fillPoints([{ x: x + hw*c - hh*s, y: y + hw*s + hh*c }, { x: x - hw*c - hh*s, y: y - hw*s + hh*c }, { x: x - hw*c + hh*s, y: y - hw*s - hh*c }, { x: x + hw*c + hh*s, y: y + hw*s - hh*c }], true);
    };

    const drawStreetLamp = (x: number, y: number) => {
      g.fillStyle(0x111111).fillCircle(x, y, 6);
      g.fillStyle(0xff2a5f, 0.15).fillCircle(x, y, 100);
      g.fillStyle(0xff2a5f, 0.6).fillCircle(x, y, 5);
    };

    // Environment Scatter
    for (let i = 0; i < 2000; i++) {
      const px = rand() * W, py = rand() * H;
      let distToRoad = 9999;
      for (const p of centerline) {
        const d = Math.abs(p.x - px) + Math.abs(p.y - py);
        if (d < distToRoad) distToRoad = d;
      }
      
      if (distToRoad > half + 100) {
        const zone = getZone(px, py);
        if (zone === 'downtown') {
          if (distToRoad < half + 300) drawShop(px, py, px < W/2);
          else if (rand() < 0.2) drawTree(px, py);
        } else if (zone === 'residential') {
          if (distToRoad < half + 250) drawHouse(px, py, px < W/2);
          else if (rand() < 0.5) drawTree(px, py);
        } else {
          // Edge / Forest
          if (rand() < 0.7) drawTree(px, py);
          else drawBush(px, py);
        }
      }
    }

    // Place Water Tower in Edge zone
    drawWaterTower(1400, 900);

    // 3. Draw Road
    const stamp = (radius: number, color: number, alpha = 1) => {
      g.fillStyle(color, alpha);
      for (const p of centerline) g.fillCircle(p.x, p.y, radius);
    };
    
    stamp(half + 40, 0x110c1f, 1.0); // Sidewalk
    stamp(half + 5, 0x2a1c40, 1.0);  // Curb
    stamp(half, 0x0a0a0f, 1.0);      // Asphalt
    
    // Road wear / puddles
    for (const p of centerline) {
      if (rand() < 0.3) {
        g.fillStyle(0x161622, 0.4).fillEllipse(p.x + (rand()-0.5)*half, p.y + (rand()-0.5)*half, rand()*80+40, rand()*40+20);
      }
      const zone = getZone(p.x, p.y);
      if (zone === 'downtown' && rand() < 0.15) {
        g.fillStyle(0xff2a5f, 0.1).fillEllipse(p.x, p.y, 120, 40); // Neon reflections
      }
    }

    // Center lines
    g.lineStyle(4, 0xcc9900, 0.6);
    for (let i = 0; i < centerline.length; i++) {
      if (Math.floor(i / 3) % 2 !== 0) continue;
      const a = centerline[i], b = centerline[(i + 1) % centerline.length];
      g.lineBetween(a.x, a.y, b.x, b.y);
    }

    // 4. Props along road edge
    const poles: Point[] = [];
    for (let i = 0; i < centerline.length; i += 12) {
      const p = centerline[i];
      const next = centerline[(i + 1) % centerline.length];
      const dx = next.x - p.x, dy = next.y - p.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      const nx = -dy / len, ny = dx / len;
      const side = (i % 24 === 0) ? 1 : -1;
      const ox = p.x + nx * (half + 25) * side;
      const oy = p.y + ny * (half + 25) * side;

      const zone = getZone(p.x, p.y);
      
      if (zone === 'downtown') {
        if (rand() < 0.3) {
          drawStreetLamp(ox, oy);
          if (rand() < 0.6) drawParkedCar(ox - nx * 15, oy - ny * 15, Math.atan2(dy, dx));
        } else if (rand() < 0.2) {
          poles.push({ x: ox, y: oy });
          g.fillStyle(0x050505).fillCircle(ox, oy, 4);
        }
      } else if (zone === 'residential') {
        if (rand() < 0.2) {
          drawStreetLamp(ox, oy);
        } else if (rand() < 0.4) {
          g.fillStyle(0x442211).fillRect(ox - 2, oy - 2, 4, 10); // Mailbox
        }
      } else {
        if (rand() < 0.2) {
          poles.push({ x: ox, y: oy });
          g.fillStyle(0x050505).fillCircle(ox, oy, 4);
        } else if (rand() < 0.5) {
          drawBush(ox, oy);
        }
      }
    }

    // Wires
    g.lineStyle(1, 0x000000, 0.6);
    for (let i = 0; i < poles.length - 1; i++) {
      if (Math.hypot(poles[i].x - poles[i+1].x, poles[i].y - poles[i+1].y) < 400) {
        g.lineBetween(poles[i].x, poles[i].y, poles[i+1].x, poles[i+1].y);
      }
    }

    // Start Grid Area
    const { center: startP, direction: startDir, normal: startNorm } = layout.finishGate;
    
    // Helper to get point on start line grid
    const getGridPos = (forwardOffset: number, sideOffset: number) => ({
      x: startP.x + startDir.x * forwardOffset + startNorm.x * sideOffset,
      y: startP.y + startDir.y * forwardOffset + startNorm.y * sideOffset
    });

    g.fillStyle(0xffffff, 0.8);
    // Draw thick white line exactly at the gate
    g.fillPoints([
      getGridPos(-4, -half), getGridPos(4, -half),
      getGridPos(4, half), getGridPos(-4, half)
    ], true);
    
    // Draw starting slots
    g.lineStyle(2, 0xffffff, 0.5);
    for (let grid = 1; grid <= 4; grid++) {
      // Cars spawn backwards from the finish line
      const backOffset = -grid * 120;
      // Stagger them slightly left and right
      const sideOffset = (grid % 2 === 0) ? -40 : 40;
      
      const p1 = getGridPos(backOffset, sideOffset - 20);
      const p2 = getGridPos(backOffset + 80, sideOffset - 20);
      const p3 = getGridPos(backOffset + 80, sideOffset + 20);
      const p4 = getGridPos(backOffset, sideOffset + 20);
      
      g.beginPath();
      g.moveTo(p1.x, p1.y);
      g.lineTo(p2.x, p2.y);
      g.lineTo(p3.x, p3.y);
      g.lineTo(p4.x, p4.y);
      g.closePath();
      g.strokePath();
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
