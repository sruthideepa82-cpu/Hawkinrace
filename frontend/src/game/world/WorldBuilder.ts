/**
 * Bakes a track's static world into a single texture.
 *
 * The previous renderer scattered ~2,500 random candidates and rejected any
 * that landed too near the road, measuring each one against every centerline
 * sample. That is about 2.25 million iterations per bake, on top of the fact
 * that it used a Manhattan distance to a polyline -- a metric that is wrong for
 * anything but an axis-aligned road, so props could sit on the racing surface.
 *
 * This places props as BANDS walked along the centerline instead
 * (`config/worldTheme`). Each band knows how far beyond the drivable corridor
 * it sits, so nothing can land on the road by construction and the cost is
 * O(samples x bands).
 *
 * Everything is drawn into one Graphics object and baked once per track, keyed
 * by id, so a restart or a retry reuses the texture instead of rebuilding it.
 */

import Phaser from 'phaser';
import type { TrackLayout } from '../entities/TrackLayout';
import type { Point } from '../config/tracks';
import { getTheme, type WorldTheme } from '../config/worldTheme';
import { drawProp } from './propKit';

/** Small deterministic PRNG, so a track always bakes the same town. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable per-track seed, so a given track always looks the same. */
function seedFor(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export class WorldBuilder {
  private constructor() {}

  /**
   * Ensures the baked world image for this track exists and is on screen.
   * Returns the texture key so callers can reason about what was drawn.
   */
  static build(scene: Phaser.Scene, layout: TrackLayout): string {
    const key = `world-${layout.definition.id}`;
    if (!scene.textures.exists(key)) {
      WorldBuilder.bake(scene, layout, key);
    }
    if (!scene.textures.exists(`${key}-image`)) {
      scene.add.image(0, 0, key).setOrigin(0, 0).setDepth(0);
    }
    return key;
  }

  private static bake(scene: Phaser.Scene, layout: TrackLayout, key: string): void {
    const theme = getTheme(layout.definition.id);
    const rand = mulberry32(seedFor(layout.definition.id));
    const { worldWidth: W, worldHeight: H, centerline } = layout;
    const g = scene.add.graphics();

    const p = theme.palette;
    const corridor = layout.corridorHalfWidth;

    // ---- Ground -----------------------------------------------------------
    g.fillStyle(p.void, 1).fillRect(0, 0, W, H);
    // Soft blotches so the ground is not a flat void. Cheap: a few dozen ellipses.
    const blotches = Math.round((W * H) / 26000);
    for (let i = 0; i < blotches; i++) {
      g.fillStyle(p.voidAlt, 0.16 + rand() * 0.2);
      g.fillEllipse(
        rand() * W,
        rand() * H,
        180 + rand() * 420,
        140 + rand() * 300,
      );
    }

    // ---- Road shoulders ---------------------------------------------------
    // Offset polylines for each band of the road cross-section. Built from the
    // same widths the collision code uses, so the visible road IS the drivable
    // road. See `TrackLayout.corridorHalfWidth`.
    const offsetsAt = (dist: number) =>
      centerline.map((pt, i) => {
        const prev = centerline[(i - 1 + centerline.length) % centerline.length];
        const next = centerline[(i + 1) % centerline.length];
        const dx = next.x - prev.x;
        const dy = next.y - prev.y;
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len;
        const ny = dx / len;
        return { x: pt.x + nx * dist, y: pt.y + ny * dist };
      });

    const fillBand = (outer: number, inner: number, color: number, alpha = 1) => {
      const o = offsetsAt(outer);
      const i2 = offsetsAt(inner);
      g.fillStyle(color, alpha);
      g.fillPoints([...o, ...[...i2].reverse()], true, true);
    };

    // Drivable run-off, then pavement, then kerb, then asphalt. Drawn widest
    // first so each narrower band paints on top.
    fillBand(corridor, layout.pavementOuter, p.runoff, 1);
    fillBand(layout.pavementOuter, layout.kerbOuter, p.pavement, 1);
    fillBand(layout.kerbOuter, layout.roadHalfWidth, p.kerb, 1);
    fillBand(layout.roadHalfWidth, 0, p.road, 1);

    // ---- Road shadow ------------------------------------------------------
    // A soft dark edge under the tarmac so it sits above the ground rather
    // than looking painted onto it.
    if (theme.roadShadow) {
      for (let i = 0; i < centerline.length; i += 2) {
        const pt = centerline[i];
        const prev = centerline[(i - 1 + centerline.length) % centerline.length];
        const next = centerline[(i + 1) % centerline.length];
        const dx = next.x - prev.x;
        const dy = next.y - prev.y;
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len;
        const ny = dx / len;
        g.fillStyle(0x000000, 0.16);
        g.fillCircle(pt.x + nx * (layout.pavementOuter + 4), pt.y + ny * (layout.pavementOuter + 4), layout.pavementOuter * 0.5);
      }
    }

    // ---- Road wear --------------------------------------------------------
    for (let i = 0; i < centerline.length; i += 4) {
      const pt = centerline[i];
      if (rand() > 0.45) continue;
      g.fillStyle(p.roadWear, 0.28 + rand() * 0.3);
      g.fillEllipse(
        pt.x + (rand() - 0.5) * layout.roadHalfWidth,
        pt.y + (rand() - 0.5) * layout.roadHalfWidth,
        40 + rand() * 90,
        18 + rand() * 40,
      );
    }

    // ---- Kerb stripes -----------------------------------------------------
    // Alternating blocks along the kerb band, on both sides. The offsets are
    // computed once and reused: `offsetsAt` walks the whole centerline, so
    // calling it inside the loop would be quadratic for no reason.
    {
      const half = layout.roadHalfWidth;
      const outerL = offsetsAt(layout.kerbOuter);
      const innerL = offsetsAt(half);
      const innerR = offsetsAt(-half);
      const outerR = offsetsAt(-layout.kerbOuter);
      const step = 3;
      for (let i = 0; i < centerline.length; i += step * 2) {
        const j = (i + step) % centerline.length;
        if (j === i) break;
        g.fillStyle(p.kerbStripe, 0.5);
        g.fillPoints([outerL[i], outerL[j], innerL[j], innerL[i]], true, true);
        g.fillPoints([outerR[i], outerR[j], innerR[j], innerR[i]], true, true);
      }
    }

    // ---- Markings ---------------------------------------------------------
    if (theme.laneMarkings) {
      // Solid edge lines just inside the asphalt.
      const edgeL = offsetsAt(layout.roadHalfWidth - 7);
      const edgeR = offsetsAt(-(layout.roadHalfWidth - 7));
      g.lineStyle(3, p.edgeLine, 0.5);
      WorldBuilder.strokeLoop(g, edgeL);
      WorldBuilder.strokeLoop(g, edgeR);

      // Dashed centre line.
      g.lineStyle(4, p.laneLine, 0.62);
      const dashEvery = 10;
      for (let i = 0; i < centerline.length; i += dashEvery * 2) {
        const a = centerline[i];
        const b = centerline[Math.min(i + dashEvery, centerline.length - 1)];
        g.lineBetween(a.x, a.y, b.x, b.y);
      }
    }

    // ---- Props, as bands --------------------------------------------------
    // Each band is a row offset laterally from the corridor edge. Walking the
    // centerline is what makes this cheap, and starting beyond `corridor` is
    // what guarantees nothing lands on the racing surface.
    const neon = NeonFor(theme);
    for (const band of theme.bands) {
      const spacing = Math.max(1, band.spacing);
      for (let i = 0; i < centerline.length; i += spacing) {
        const j = (i + spacing) % centerline.length;
        const a = centerline[i];
        const b = centerline[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len;
        const ny = dx / len;
        const angle = Math.atan2(dy, dx);

        for (const side of band.bothSides ? [1, -1] : [1]) {
          if (rand() > band.fill) continue;
          const off = corridor + band.offset[0] + rand() * (band.offset[1] - band.offset[0]);
          const scale = (band.scale[0] + rand() * (band.scale[1] - band.scale[0])) * (1 + (rand() - 0.5) * band.jitter);
          // A little scatter along the road so the row is not a dotted line.
          const along = (rand() - 0.5) * len;
          const px = a.x + nx * off * side + (dx / len) * along;
          const py = a.y + ny * off * side + (dy / len) * along;
          drawProp(g, band.kind, px, py, Math.max(0.35, scale), angle, rand, { neon, lampColor: lampColorFor(theme) });
        }
      }
    }

    // ---- Checkpoints ------------------------------------------------------
    for (let k = 1; k < layout.definition.checkpointCount; k++) {
      const idx = Math.floor((k * centerline.length) / layout.definition.checkpointCount);
      const a = centerline[idx];
      const b = centerline[(idx + 1) % centerline.length];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      const half = layout.roadHalfWidth;
      g.lineStyle(5, neon[0], 0.9);
      g.lineBetween(a.x + nx * half, a.y + ny * half, a.x - nx * half, a.y - ny * half);
      // Posts either side, so a checkpoint is visible from a distance.
      g.fillStyle(neon[0], 0.22).fillCircle(a.x + nx * (half + 12), a.y + ny * (half + 12), 26);
      g.fillStyle(neon[0], 0.22).fillCircle(a.x - nx * (half + 12), a.y - ny * (half + 12), 26);
      g.fillStyle(neon[0], 0.95).fillCircle(a.x + nx * (half + 12), a.y + ny * (half + 12), 6);
      g.fillStyle(neon[0], 0.95).fillCircle(a.x - nx * (half + 12), a.y - ny * (half + 12), 6);
    }

    // ---- Start / finish ---------------------------------------------------
    WorldBuilder.drawFinish(scene, g, layout, theme, p.finishLine);

    g.generateTexture(key, W, H);
    g.destroy();
  }

  /** Strokes a closed loop through a set of offset points. */
  private static strokeLoop(g: Phaser.GameObjects.Graphics, pts: readonly Point[]): void {
    if (pts.length < 2) return;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      g.lineBetween(a.x, a.y, b.x, b.y);
    }
  }

  /** Chequered start/finish, drawn as real squares so it reads as a flag. */
  private static drawFinish(
    scene: Phaser.Scene,
    g: Phaser.GameObjects.Graphics,
    layout: TrackLayout,
    theme: WorldTheme,
    finishColor: number,
  ): void {
    const idx = layout.definition.finishSampleOffset;
    const n = layout.centerline.length;
    const a = layout.centerline[((idx % n) + n) % n];
    const b = layout.centerline[(((idx + 1) % n) + n) % n];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const half = layout.roadHalfWidth;

    // Two rows of chequers across the full width.
    const depth = 26;
    const cols = 12;
    const cell = (half * 2) / cols;
    for (let row = 0; row < 2; row++) {
      for (let c = 0; c < cols; c++) {
        const l0 = -half + c * cell;
        const l1 = l0 + cell;
        const d0 = (row * depth) / 2;
        const d1 = ((row + 1) * depth) / 2;
        const p0 = { x: a.x + nx * l0 + (dx / len) * d0, y: a.y + ny * l0 + (dy / len) * d0 };
        const p1 = { x: a.x + nx * l1 + (dx / len) * d0, y: a.y + ny * l1 + (dy / len) * d0 };
        const p2 = { x: a.x + nx * l1 + (dx / len) * d1, y: a.y + ny * l1 + (dy / len) * d1 };
        const p3 = { x: a.x + nx * l0 + (dx / len) * d1, y: a.y + ny * l0 + (dy / len) * d1 };
        g.fillStyle((row + c) % 2 === 0 ? 0x0a0a0f : finishColor, 1);
        g.fillPoints([p0, p1, p2, p3], true, true);
      }
    }

    // Gantry either side, so the finish is unmistakable at speed.
    g.fillStyle(finishColor, 0.14).fillCircle(a.x, a.y, half * 1.3);
    g.lineStyle(3, finishColor, 0.85);
    g.lineBetween(
      a.x + nx * (half + 18), a.y + ny * (half + 18),
      a.x - nx * (half + 18), a.y - ny * (half + 18),
    );
    g.fillStyle(finishColor, 0.9);
    g.fillCircle(a.x + nx * (half + 18), a.y + ny * (half + 18), 7);
    g.fillCircle(a.x - nx * (half + 18), a.y - ny * (half + 18), 7);

    void scene;
    void theme;
  }
}

/** The neon accents a theme scatters: signs, checkpoint posts, highlights. */
function NeonFor(theme: WorldTheme): readonly number[] {
  switch (theme.id) {
    case 'upside-down': return [0xff2a4a, 0xff5a72, 0xc01430];
    case 'hawkins-forest': return [0x6fe0b0, 0x8affc8, 0x2f9c6a];
    case 'starcourt-run': return [0x00e5ff, 0xff4df0, 0xffee00];
    case 'hawkins-lab': return [0xffb02e, 0xd8b23a, 0x6fd0ff];
    default: return [0xff2a5f, 0x00f0ff, 0xffb02e];
  }
}

/** Sodium orange in town, cold white in the Lab, sick green in the forest. */
function lampColorFor(theme: WorldTheme): number {
  switch (theme.id) {
    case 'hawkins-forest': return 0x6fe0b0;
    case 'hawkins-lab': return 0xdfe8ff;
    case 'upside-down': return 0xff2a4a;
    case 'starcourt-run': return 0x00e5ff;
    default: return 0xffb02e;
  }
}