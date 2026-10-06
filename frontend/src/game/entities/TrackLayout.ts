import type { Point, TrackDefinition } from '../config/tracks';
import { Gate } from '../systems/Gate';
import { nearestOnClosedPolyline, resampleClosedPolyline, smoothClosedLoop, wrapFraction, wrapIndex } from '../utils/geometry';
import type { CollisionResult } from './CarPhysics';

export interface SpawnPoint extends Point {
  heading: number;
}

export type SurfaceType = 'road' | 'sidewalk' | 'grass';

export interface SurfaceData {
  type: SurfaceType;
  dragMultiplier: number;
}

/** A point on the centerline with its frame, used for steering and progress. */
export interface TrackSample {
  /** Point on the centerline. */
  point: Point;
  /** Unit tangent pointing forward along the racing direction. */
  tangent: Point;
  /** Unit normal, rotated +90 degrees from the tangent. */
  normal: Point;
  /** Position normalised over one lap (0..1). */
  fraction: number;
  /** Index into `centerline`. */
  index: number;
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
  /** Total centerline arc length (px), i.e. the length of one lap. */
  readonly trackLength: number;
  /** Arc length travelled to reach each centerline sample (n + 1 entries). */
  readonly cumulative: readonly number[];
  /** Lap position of the finish line (0..1). */
  readonly finishFraction: number;
  /** Lap position of each checkpoint (0..1), in the order they must be passed. */
  readonly checkpointFractions: readonly number[];

  constructor(readonly definition: TrackDefinition) {
    this.roadWidth = definition.roadWidth;
    this.worldWidth = definition.worldWidth;
    this.worldHeight = definition.worldHeight;
    // Smooth, then redistribute to even arc-length spacing: every lookup below
    // (lap distance, corner radius, gate placement) assumes a uniform step.
    const smoothed = smoothClosedLoop(definition.controlPoints, definition.samplesPerSegment);
    this.centerline = resampleClosedPolyline(smoothed, smoothed.length);

    const n = this.centerline.length;
    const finishIndex = wrapIndex(definition.finishSampleOffset, n);
    this.finishGate = this.gateAt(finishIndex);

    this.checkpoints = [];
    const gateFractions: number[] = [];
    for (let k = 1; k <= definition.checkpointCount; k++) {
      const idx = wrapIndex(finishIndex + Math.round((k * n) / (definition.checkpointCount + 1)), n);
      this.checkpoints.push(this.gateAt(idx));
      gateFractions.push(idx / n);
    }
    this.checkpointFractions = gateFractions;

    this.finishFraction = finishIndex / n;

    // Arc-length table so progress can be measured in real px rather than index
    // steps, which matters because control-point spacing is not uniform.
    const cumulative = new Array<number>(n + 1);
    cumulative[0] = 0;
    for (let i = 0; i < n; i++) {
      const a = this.centerline[i];
      const b = this.centerline[(i + 1) % n];
      cumulative[i + 1] = cumulative[i] + Math.hypot(b.x - a.x, b.y - a.y);
    }
    this.cumulative = cumulative;
    this.trackLength = cumulative[n];

    const spawnIndex = wrapIndex(finishIndex - definition.spawnSamplesBehind, n);
    const dir = this.directionAt(spawnIndex);
    this.spawn = { ...this.centerline[spawnIndex], heading: Math.atan2(dir.y, dir.x) };
  }

  /** Gates (checkpoints + finish line) a car must clear per lap. */
  get gatesPerLap(): number {
    return this.checkpoints.length + 1;
  }

  /** Where a world point sits: distance from the road plus its lap position. */
  locate(x: number, y: number) {
    return nearestOnClosedPolyline(this.centerline, x, y);
  }

  /** Lap position (0..1) of a world point. */
  fractionAt(x: number, y: number): number {
    return this.locate(x, y).fraction;
  }

  /**
   * Signed sideways position relative to the centerline, positive to the
   * driver's right. Matches the sign convention of `sampleAtFraction`, so a lane
   * offset and a car's actual offset can be compared directly.
   */
  lateralOffsetAt(x: number, y: number): number {
    const here = this.locate(x, y);
    const tangent = this.directionAt(here.index);
    // Normal is the tangent turned a quarter turn; with y pointing down this is
    // the driver's right.
    return (x - here.point.x) * -tangent.y + (y - here.point.y) * tangent.x;
  }

  /**
   * Arc length from the finish line to a lap position, measured forward. The
   * finish line is 0, so this is "distance covered since crossing the line".
   */
  distanceFromFinish(fraction: number): number {
    return wrapFraction(fraction - this.finishFraction) * this.trackLength;
  }

  /**
   * Sample the centerline at a lap position, optionally shifted sideways.
   * `lateralOffset` is positive to the driver's right.
   */
  sampleAtFraction(fraction: number, lateralOffset: number = 0): TrackSample {
    const n = this.centerline.length;
    const target = wrapFraction(fraction) * this.trackLength;

    // Binary search the arc-length table for the segment containing `target`.
    let lo = 0;
    let hi = n;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (this.cumulative[mid] <= target) lo = mid;
      else hi = mid;
    }
    const a = this.centerline[lo];
    const b = this.centerline[wrapIndex(lo + 1, n)];
    const segLen = Math.max(1e-6, this.cumulative[lo + 1] - this.cumulative[lo]);
    const t = Math.max(0, Math.min(1, (target - this.cumulative[lo]) / segLen));

    const tangent = this.directionAt(lo);
    const normal = { x: -tangent.y, y: tangent.x };
    return {
      point: {
        x: a.x + (b.x - a.x) * t + normal.x * lateralOffset,
        y: a.y + (b.y - a.y) * t + normal.y * lateralOffset,
      },
      tangent,
      normal,
      fraction,
      index: lo,
    };
  }

  /** Point `distance` px ahead of `fraction`, optionally shifted sideways. */
  pointAhead(fraction: number, distance: number, lateralOffset: number = 0): Point {
    return this.sampleAtFraction(fraction + distance / this.trackLength, lateralOffset).point;
  }

  /**
   * Arc length index of the centerline sample at a lap position.
   *
   * `sampleAtFraction` computes this too, but the corner scan below walks tens
   * of positions per car per frame and only needs the index, so it uses this to
   * avoid building a sample object each time.
   */
  private indexAtFraction(fraction: number): number {
    const n = this.centerline.length;
    const target = wrapFraction(fraction) * this.trackLength;
    let lo = 0;
    let hi = n;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (this.cumulative[mid] <= target) lo = mid;
      else hi = mid;
    }
    return lo;
  }

  /**
   * Radius of the tightest corner within the next `distance` px. Infinity means
   * the span is effectively straight, which is what the AI looks for before
   * committing to full throttle or nitro.
   *
   * Sampled at the centerline's own spacing, and the *largest* heading change
   * wins. Both details matter: a coarser step walks straight past a tight corner
   * that sits between two samples, and taking the smallest change instead of the
   * largest reports the gentlest window in range -- so a straight between two
   * corners reads as "flat" and sends the car into the next corner at full speed.
   */
  cornerRadiusAhead(fraction: number, distance: number): number {
    const step = Math.max(8, this.trackLength / this.centerline.length);
    let tightest = 0;
    let prev = this.directionAt(this.indexAtFraction(fraction));
    for (let d = step; d <= distance; d += step) {
      const dir = this.directionAt(this.indexAtFraction(fraction + d / this.trackLength));
      const cross = prev.x * dir.y - prev.y * dir.x;
      const dot = Math.max(-1, Math.min(1, prev.x * dir.x + prev.y * dir.y));
      // One step cannot turn through more than half a right angle before the
      // sampled window is describing a hairpin we cannot brake for anyway.
      tightest = Math.max(tightest, Math.abs(Math.atan2(cross, dot)));
      prev = dir;
    }
    if (tightest < 1e-3) return Number.POSITIVE_INFINITY;
    return step / tightest;
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

  /**
   * Returns a correction if a car at (x, y) heading `heading` would put any part
   * of its footprint past the road edge (buildings/fences).
   *
   * `halfLength`/`halfWidth` describe the car's box along and across its
   * heading. Projecting that box onto the direction of the barrier is what keeps
   * a corner or a wheel from poking through when the car is not parallel to the
   * road -- a single collision radius cannot, because the car is long and thin.
   */
  resolveBoundary(
    x: number,
    y: number,
    heading: number,
    halfLength: number,
    halfWidth: number,
  ): CollisionResult | null {
    const { distance, point } = nearestOnClosedPolyline(this.centerline, x, y);
    if (distance === 0) return null;

    const ox = (x - point.x) / distance;
    const oy = (y - point.y) / distance;
    // Support of the car's box along the outward direction: how far the furthest
    // corner reaches toward the barrier for the way the car is pointing.
    const fx = Math.cos(heading);
    const fy = Math.sin(heading);
    const reach = halfLength * Math.abs(fx * ox + fy * oy) + halfWidth * Math.abs(fx * oy - fy * ox);
    const limit = this.roadWidth / 2 - reach;
    if (distance <= limit) return null;

    return { x: point.x + ox * limit, y: point.y + oy * limit, nx: -ox, ny: -oy };
  }
}
