import type { Point, TrackDefinition } from '../config/tracks';
import { Gate } from '../systems/Gate';
import { nearestOnClosedPolyline, smoothClosedLoop, wrapIndex } from '../utils/geometry';
import type { CollisionResult } from './CarPhysics';

export interface SpawnPoint extends Point {
  heading: number;
}

export type SurfaceType = 'road' | 'sidewalk' | 'grass';

export interface SurfaceData {
  type: SurfaceType;
  dragMultiplier: number;
}

/** Pure track data + queries (no Phaser), so it can be tested and re-skinned. */
export class TrackLayout {
  readonly centerline: Point[];
  readonly roadWidth: number;
  readonly worldWidth: number;
  readonly worldHeight: number;
  readonly finishGate: Gate;
  readonly checkpoints: Gate[];
  readonly spawn: SpawnPoint;

  constructor(readonly definition: TrackDefinition) {
    this.roadWidth = definition.roadWidth;
    this.worldWidth = definition.worldWidth;
    this.worldHeight = definition.worldHeight;
    this.centerline = smoothClosedLoop(definition.controlPoints, definition.samplesPerSegment);

    const n = this.centerline.length;
    const finishIndex = wrapIndex(definition.finishSampleOffset, n);
    this.finishGate = this.gateAt(finishIndex);

    this.checkpoints = [];
    for (let k = 1; k <= definition.checkpointCount; k++) {
      const idx = finishIndex + Math.round((k * n) / (definition.checkpointCount + 1));
      this.checkpoints.push(this.gateAt(wrapIndex(idx, n)));
    }

    const spawnIndex = wrapIndex(finishIndex - definition.spawnSamplesBehind, n);
    const dir = this.directionAt(spawnIndex);
    this.spawn = { ...this.centerline[spawnIndex], heading: Math.atan2(dir.y, dir.x) };
  }

  /** Unit tangent of the centerline at sample i. */
  directionAt(i: number): Point {
    const n = this.centerline.length;
    const a = this.centerline[wrapIndex(i - 1, n)];
    const b = this.centerline[wrapIndex(i + 1, n)];
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
  }

  private gateAt(i: number): Gate {
    // Make gates wide enough to cover the sidewalks and edge tolerances
    return new Gate(this.centerline[i], this.directionAt(i), this.roadWidth / 2 + 80);
  }

  getAntiGravityTwist(x: number, y: number): number {
    const ranges = this.definition.antiGravityRanges;
    if (!ranges || ranges.length === 0) return 0;

    const { fraction } = nearestOnClosedPolyline(this.centerline, x, y);
    
    for (const r of ranges) {
      // Add blend zone (0.05 of track) for smooth transition
      const blend = 0.05;
      if (fraction >= r.start - blend && fraction <= r.end + blend) {
        if (fraction < r.start) {
          // Smoothly ramp up
          const t = (fraction - (r.start - blend)) / blend;
          // Ease in-out
          const ease = t * t * (3 - 2 * t);
          return r.twist * ease;
        } else if (fraction > r.end) {
          // Smoothly ramp down
          const t = ((r.end + blend) - fraction) / blend;
          const ease = t * t * (3 - 2 * t);
          return r.twist * ease;
        } else {
          return r.twist;
        }
      }
    }
    return 0;
  }

  getSurface(x: number, y: number): SurfaceData {
    const { distance } = nearestOnClosedPolyline(this.centerline, x, y);
    const half = this.roadWidth / 2;
    if (distance <= half) return { type: 'road', dragMultiplier: 1 };
    if (distance <= half + 40) return { type: 'sidewalk', dragMultiplier: 1.5 };
    return { type: 'grass', dragMultiplier: 3.0 };
  }

  /** Returns a correction if a circle at (x, y) hits a hard boundary (buildings/fences). */
  resolveBoundary(x: number, y: number, radius: number): CollisionResult | null {
    // Hard limit is the outer edge of the sidewalk
    const half = this.roadWidth / 2;
    const hardLimit = half + 40 - radius;
    const { distance, point } = nearestOnClosedPolyline(this.centerline, x, y);
    if (distance <= hardLimit || distance === 0) return null;
    const ox = (x - point.x) / distance;
    const oy = (y - point.y) / distance;
    return { x: point.x + ox * hardLimit, y: point.y + oy * hardLimit, nx: -ox, ny: -oy };
  }
}
