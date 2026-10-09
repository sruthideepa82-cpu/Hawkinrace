import Phaser from 'phaser';
import type { TrackLayout } from './TrackLayout';
import type { Point } from '../config/tracks';

export class TrackRenderer {
  constructor(scene: Phaser.Scene, layout: TrackLayout) {
    const textureKey = "track-" + layout.definition.id;
    if (!scene.textures.exists(textureKey)) {
      TrackRenderer.bake(scene, layout, textureKey);
    }
    scene.add.image(0, 0, textureKey).setOrigin(0, 0).setDepth(0);
  }

  private static bake(scene: Phaser.Scene, layout: TrackLayout, textureKey: string): void {
    const { worldWidth: W, worldHeight: H, roadWidth, centerline } = layout;
    const trackId = layout.definition.id;
    const half = roadWidth / 2;
    const g = scene.add.graphics();

    let seed = 1337;
    const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

    // 1. Background Void
    if (trackId === 'upside-down') {
      g.fillStyle(0x0f0005).fillRect(0, 0, W, H);
      for (let i = 0; i < 50; i++) {
        g.fillStyle(0x330011, rand() * 0.3);
        g.fillEllipse(rand() * W, rand() * H, rand() * 800 + 400, rand() * 400 + 200);
      }
    } else if (trackId === 'hawkins-forest') {
      g.fillStyle(0x020308).fillRect(0, 0, W, H);
      for (let i = 0; i < 100; i++) {
        g.fillStyle(0x0a1122, rand() * 0.2);
        g.fillEllipse(rand() * W, rand() * H, rand() * 600 + 300, rand() * 300 + 150);
      }
    } else if (trackId === 'starcourt-run') {
      g.fillStyle(0x0a0515).fillRect(0, 0, W, H);
    } else if (trackId === 'hawkins-lab') {
      g.fillStyle(0x05080c).fillRect(0, 0, W, H);
    } else { // hawkins-streets
      g.fillStyle(0x05040a).fillRect(0, 0, W, H);
    }

    // 2. Props & Scatter Helpers
    const drawTree = (x: number, y: number, isDark = false) => {
      g.fillStyle(isDark ? 0x010204 : 0x02030a, 0.9);
      g.fillCircle(x, y, 25 + rand() * 20);
      g.fillStyle(isDark ? 0x050711 : 0x0a0c1a, 0.9);
      g.fillCircle(x + 5, y + 5, 15 + rand() * 15);
    };
    
    const drawPineTree = (x: number, y: number) => {
      g.fillStyle(0x020408, 0.95);
      const size = 30 + rand() * 20;
      g.fillPoints([{x, y: y-size}, {x: x-size*0.7, y: y+size}, {x: x+size*0.7, y: y+size}], true);
      g.fillStyle(0x081122, 0.7);
      g.fillPoints([{x, y: y-size}, {x: x, y: y+size}, {x: x+size*0.7, y: y+size}], true);
    };

    const drawBush = (x: number, y: number) => {
      g.fillStyle(0x03050c, 0.9);
      g.fillCircle(x, y, 10 + rand() * 10);
    };

    const drawShop = (x: number, y: number, facingRight: boolean) => {
      const w = 80 + rand() * 40, h = 60 + rand() * 30;
      g.fillStyle(0x110b1a).fillRect(x - w/2, y - h/2, w, h);
      g.fillStyle(0x09050d).fillRect(x - w/2 + 5, y - h/2 + 5, w - 10, h - 10);
      const neonColor = rand() > 0.5 ? 0xff2a5f : 0x00f0ff;
      const glowDir = facingRight ? w/2 : -w/2;
      g.fillStyle(neonColor, 0.8).fillRect(x + glowDir - (facingRight ? 5 : 0), y - 10, 5, 20);
      g.fillStyle(neonColor, 0.1).fillCircle(x + glowDir, y, 60);
    };

    const drawHouse = (x: number, y: number, facingRight: boolean) => {
      const w = 70 + rand() * 20, h = 50 + rand() * 15;
      g.fillStyle(0x1a1525).fillRect(x - w/2, y - h/2, w, h);
      g.fillStyle(0x110d18).fillRect(x - w/2 + 5, y - h/2 + 5, w - 10, h - 10);
      const driveDir = facingRight ? w/2 + 10 : -w/2 - 30;
      g.fillStyle(0x0a0a0f).fillRect(x + driveDir, y, 20, 40);
      const porchColor = 0xffb02e;
      g.fillStyle(porchColor, 0.6).fillCircle(x + (facingRight ? w/2 : -w/2), y, 5);
      g.fillStyle(porchColor, 0.1).fillCircle(x + (facingRight ? w/2 : -w/2), y, 40);
    };
    
    const drawMallStore = (x: number, y: number) => {
      const w = 100 + rand() * 50, h = 80 + rand() * 40;
      g.fillStyle(0x0f0a1a).fillRect(x - w/2, y - h/2, w, h);
      g.lineStyle(2, 0xff00ff, 0.5);
      g.strokeRect(x - w/2, y - h/2, w, h);
      const colors = [0xff00ff, 0x00ffff, 0xffee00];
      const c = colors[Math.floor(rand() * colors.length)];
      g.fillStyle(c, 0.2).fillCircle(x, y, 80);
      g.fillStyle(c, 0.8).fillRect(x - 20, y - 5, 40, 10);
    };
    
    const drawConcreteBlock = (x: number, y: number) => {
      const w = 60 + rand() * 40, h = 60 + rand() * 40;
      g.fillStyle(0x151820).fillRect(x - w/2, y - h/2, w, h);
      g.fillStyle(0x0a0c11).fillRect(x - w/2 + 5, y - h/2 + 5, w - 10, h - 10);
      g.fillStyle(0xff0000, 0.3).fillCircle(x, y - h/2, 10); // red warning light
      g.fillStyle(0xff0000, 0.9).fillCircle(x, y - h/2, 2);
    };

    const drawWaterTower = (x: number, y: number) => {
      g.fillStyle(0x05030a).fillRect(x - 15, y - 120, 30, 120);
      g.fillStyle(0x0f0b1a).fillEllipse(x, y - 130, 120, 50);
      g.fillStyle(0xff0000, 0.8).fillCircle(x, y - 160, 5);
      g.fillStyle(0xff0000, 0.2).fillCircle(x, y - 160, 30);
    };

    const drawFloatingRock = (x: number, y: number) => {
      g.fillStyle(0x1a0f14, 1.0);
      const size = 30 + rand() * 50;
      g.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const r = size * (0.7 + rand() * 0.6);
        const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
        if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
      }
      g.closePath();
      g.fillPath();
      g.lineStyle(2, 0xff1144, 0.3);
      g.lineBetween(x - size/2, y, x + size/2, y + (rand()-0.5)*size);
    };

    const drawTwistedRoot = (x: number, y: number) => {
      g.lineStyle(8 + rand() * 12, 0x0a0505, 1);
      g.beginPath();
      g.moveTo(x, y);
      let cx = x, cy = y;
      for (let i = 0; i < 4; i++) {
        cx += (rand() - 0.5) * 100;
        cy += (rand() - 0.5) * 100;
        g.lineTo(cx, cy);
      }
      g.strokePath();
    };

    // Environment Scatter
    for (let i = 0; i < 2500; i++) {
      const px = rand() * W, py = rand() * H;
      let distToRoad = 9999;
      for (const p of centerline) {
        const d = Math.abs(p.x - px) + Math.abs(p.y - py);
        if (d < distToRoad) distToRoad = d;
      }
      
      if (distToRoad > half + 100) {
        if (trackId === 'upside-down') {
          if (distToRoad < half + 400 && rand() < 0.3) {
            if (rand() < 0.6) drawTwistedRoot(px, py);
            else drawFloatingRock(px, py);
          } else if (rand() < 0.05) {
             drawFloatingRock(px, py);
          }
        } else if (trackId === 'starcourt-run') {
          if (distToRoad < half + 400 && rand() < 0.1) drawMallStore(px, py);
        } else if (trackId === 'hawkins-forest') {
          if (distToRoad < half + 600 && rand() < 0.6) drawPineTree(px, py);
          else if (rand() < 0.2) drawTree(px, py, true);
        } else if (trackId === 'hawkins-lab') {
          if (distToRoad < half + 400 && rand() < 0.15) drawConcreteBlock(px, py);
        } else {
          // hawkins-streets
          const zone = (px < 2000 && py > 1000) ? 'downtown' : (px > 2400 ? 'residential' : 'edge');
          if (zone === 'downtown') {
            if (distToRoad < half + 300 && rand() < 0.4) drawShop(px, py, px < W/2);
            else if (rand() < 0.2) drawTree(px, py);
          } else if (zone === 'residential') {
            if (distToRoad < half + 250 && rand() < 0.4) drawHouse(px, py, px < W/2);
            else if (rand() < 0.5) drawTree(px, py);
          } else {
            if (rand() < 0.7) drawTree(px, py);
            else drawBush(px, py);
          }
        }
      }
    }

    if (trackId === 'hawkins-streets') drawWaterTower(1400, 900);

    // 3. Draw Road
    const leftPoints: Point[] = [];
    const rightPoints: Point[] = [];
    const curbLeftPoints: Point[] = [];
    const curbRightPoints: Point[] = [];
    const sidewalkLeftPoints: Point[] = [];
    const sidewalkRightPoints: Point[] = [];

    const numPoints = centerline.length;
    for (let i = 0; i < numPoints; i++) {
      const p = centerline[i];
      const prev = centerline[(i - 1 + numPoints) % numPoints];
      const next = centerline[(i + 1) % numPoints];
      
      const dx = next.x - prev.x, dy = next.y - prev.y;
      const len = Math.hypot(dx, dy);
      const nx = -dy / len, ny = dx / len;
      
      leftPoints.push({ x: p.x + nx * half, y: p.y + ny * half });
      rightPoints.push({ x: p.x - nx * half, y: p.y - ny * half });
      
      curbLeftPoints.push({ x: p.x + nx * (half + 8), y: p.y + ny * (half + 8) });
      curbRightPoints.push({ x: p.x - nx * (half + 8), y: p.y - ny * (half + 8) });
      
      const swW = trackId === 'hawkins-forest' ? 20 : 40;
      sidewalkLeftPoints.push({ x: p.x + nx * (half + swW), y: p.y + ny * (half + swW) });
      sidewalkRightPoints.push({ x: p.x - nx * (half + swW), y: p.y - ny * (half + swW) });
    }

    const drawPoly = (leftSide: Point[], rightSide: Point[], color: number, alpha: number = 1.0) => {
      g.fillStyle(color, alpha);
      const pts = [...leftSide, ...[...rightSide].reverse()];
      g.fillPoints(pts, true, true);
    };

    if (trackId === 'upside-down') {
      drawPoly(sidewalkLeftPoints, sidewalkRightPoints, 0x0a0505);
      drawPoly(curbLeftPoints, curbRightPoints, 0xffffff);
      drawPoly(leftPoints, rightPoints, 0x050508);
    } else if (trackId === 'starcourt-run') {
      drawPoly(sidewalkLeftPoints, sidewalkRightPoints, 0x0f0b1a); // Dark mall floor
      drawPoly(curbLeftPoints, curbRightPoints, 0x00ffff); // Cyan curb
      drawPoly(leftPoints, rightPoints, 0x111118); // Smooth tarmac
    } else if (trackId === 'hawkins-forest') {
      drawPoly(sidewalkLeftPoints, sidewalkRightPoints, 0x020305); // Dirt edge
      drawPoly(curbLeftPoints, curbRightPoints, 0x333333); // Grey barrier
      drawPoly(leftPoints, rightPoints, 0x0a0b11); // Dark narrow asphalt
    } else if (trackId === 'hawkins-lab') {
      drawPoly(sidewalkLeftPoints, sidewalkRightPoints, 0x111318); // Concrete
      drawPoly(curbLeftPoints, curbRightPoints, 0xffcc00); // Yellow warning curb
      drawPoly(leftPoints, rightPoints, 0x0f1115); // Concrete road
    } else {
      drawPoly(sidewalkLeftPoints, sidewalkRightPoints, 0x110c1f);
      drawPoly(curbLeftPoints, curbRightPoints, 0xffffff);
      drawPoly(leftPoints, rightPoints, 0x0a0a0f);
    }
    
    // Road wear / reflections
    for (let i = 0; i < numPoints; i += 5) {
      const p = centerline[i];
      if (trackId === 'upside-down') {
        if (rand() < 0.4) g.fillStyle(0x11111a, 0.4).fillEllipse(p.x + (rand()-0.5)*half, p.y + (rand()-0.5)*half, rand()*80+40, rand()*40+20);
        if (rand() < 0.15) g.fillStyle(0xff1133, 0.15).fillEllipse(p.x, p.y, 100, 30);
      } else if (trackId === 'starcourt-run') {
        if (rand() < 0.3) g.fillStyle(0xff00ff, 0.05).fillEllipse(p.x, p.y, 150, 50);
        if (rand() < 0.3) g.fillStyle(0x00ffff, 0.05).fillEllipse(p.x + 50, p.y, 100, 40);
      } else if (trackId === 'hawkins-forest') {
        if (rand() < 0.2) g.fillStyle(0x050811, 0.5).fillEllipse(p.x, p.y, 80, 40); // Puddles
      } else if (trackId === 'hawkins-lab') {
        if (rand() < 0.2) g.fillStyle(0x222222, 0.2).fillEllipse(p.x, p.y, 100, 30); // Scuff marks
      } else {
        if (rand() < 0.2) g.fillStyle(0x161622, 0.3).fillEllipse(p.x + (rand()-0.5)*half, p.y + (rand()-0.5)*half, rand()*80+40, rand()*40+20);
        const zone = (p.x < 2000 && p.y > 1000) ? 'downtown' : 'other';
        if (zone === 'downtown' && rand() < 0.1) g.fillStyle(0xff2a5f, 0.1).fillEllipse(p.x, p.y, 120, 40);
      }
    }

    // Center lines
    if (trackId === 'starcourt-run') g.lineStyle(6, 0xff00ff, 0.8);
    else if (trackId === 'hawkins-lab') g.lineStyle(6, 0xffffff, 0.5);
    else g.lineStyle(6, 0xffcc00, 0.8);

    if (trackId !== 'upside-down') { // No lines in upside down
      for (let i = 0; i < numPoints; i++) {
        if (Math.floor(i / 3) % 2 !== 0) continue;
        const a = centerline[i], b = centerline[(i + 1) % numPoints];
        g.lineBetween(a.x, a.y, b.x, b.y);
      }
    }

    // 4. Props along road edge
    const poles: Point[] = [];
    if (trackId === 'hawkins-streets') {
      for (let i = 0; i < centerline.length; i += 12) {
        const p = centerline[i], next = centerline[(i + 1) % centerline.length];
        const dx = next.x - p.x, dy = next.y - p.y;
        const len = Math.hypot(dx, dy), nx = -dy / len, ny = dx / len;
        const side = (i % 24 === 0) ? 1 : -1;
        const ox = p.x + nx * (half + 25) * side, oy = p.y + ny * (half + 25) * side;

        const zone = (p.x < 2000 && p.y > 1000) ? 'downtown' : (p.x > 2400 ? 'residential' : 'edge');
        if (zone === 'downtown') {
          if (rand() < 0.3) {
            g.fillStyle(0x111111).fillCircle(ox, oy, 6);
            g.fillStyle(0xff2a5f, 0.15).fillCircle(ox, oy, 100);
            g.fillStyle(0xff2a5f, 0.6).fillCircle(ox, oy, 5);
          } else if (rand() < 0.2) {
            poles.push({ x: ox, y: oy });
            g.fillStyle(0x050505).fillCircle(ox, oy, 4);
          }
        }
      }
      g.lineStyle(1, 0x000000, 0.6);
      for (let i = 0; i < poles.length - 1; i++) {
        if (Math.hypot(poles[i].x - poles[i+1].x, poles[i].y - poles[i+1].y) < 400) {
          g.lineBetween(poles[i].x, poles[i].y, poles[i+1].x, poles[i+1].y);
        }
      }
    }

    // 5. Checkpoints / Gates
    g.lineStyle(4, 0xff174f, 1);
    for (let i = 1; i < layout.definition.checkpointCount; i++) {
      const idx = Math.floor((i * numPoints) / layout.definition.checkpointCount);
      const p = centerline[idx], next = centerline[(idx + 1) % numPoints];
      const dx = next.x - p.x, dy = next.y - p.y;
      const len = Math.hypot(dx, dy), nx = -dy / len, ny = dx / len;
      g.lineBetween(p.x + nx * half, p.y + ny * half, p.x - nx * half, p.y - ny * half);
      
      if (trackId === 'starcourt-run') {
        g.fillStyle(0x00ffff, 0.5).fillCircle(p.x + nx * (half+10), p.y + ny * (half+10), 15);
        g.fillStyle(0x00ffff, 0.5).fillCircle(p.x - nx * (half+10), p.y - ny * (half+10), 15);
      } else {
        g.fillStyle(0xff174f, 0.3).fillCircle(p.x + nx * (half+10), p.y + ny * (half+10), 10);
        g.fillStyle(0xff174f, 0.3).fillCircle(p.x - nx * (half+10), p.y - ny * (half+10), 10);
      }
    }

    // Start/Finish Line
    const fIdx = layout.definition.finishSampleOffset;
    const fP = centerline[fIdx], fNext = centerline[(fIdx + 1) % numPoints];
    const fDx = fNext.x - fP.x, fDy = fNext.y - fP.y;
    const fLen = Math.hypot(fDx, fDy), fNx = -fDy / fLen, fNy = fDx / fLen;
    g.lineStyle(10, 0xffffff, 1);
    g.lineBetween(fP.x + fNx * half, fP.y + fNy * half, fP.x - fNx * half, fP.y - fNy * half);

    // Generate Texture
    g.generateTexture(textureKey, W, H);
    g.destroy();
  }
}
