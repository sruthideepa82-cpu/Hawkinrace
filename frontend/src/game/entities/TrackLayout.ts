import type { Point, TrackDefinition } from '../config/tracks';
import { ROAD_BANDS } from '../config/tracks';
import { Gate } from '../systems/Gate';
import { nearestOnClosedPolyline, resampleClosedPolyline, smoothClosedLoop, wrapFraction, wrapIndex } from '../utils/geometry';
import type { CollisionResult } from './CarPhysics';

export interface SpawnPoint extends Point {
  heading: number;
}

export type SurfaceType = 'road' | 'kerb' | 'sidewalk' | 'grass';

export interface SurfaceData {
  type: SurfaceType;
  dragMultiplier: number;
}

/**
 * Speed penalty per surface, applied to acceleration, coasting drag and top
 * speed. Ordered from the fastest surface to the slowest.
 *
 * These are multipliers on the road's numbers, so the car is never faster on
 * anything: the kerb costs roughly half the acceleration, the pavement a bit
 * more, and the grass leaves barely half the top speed. Anything the car cannot
 * legally stand on is solid scenery and is handled by `resolveBoundary` instead.
 */
const SURFACE_DRAG: Readonly<Record<SurfaceType, number>> = {
  road: 1,
  kerb: 1.9,
  sidewalk: 2.6,
  grass: 3.6,
};

/** One shared (immutable) record per surface, so nothing can mutate them. */
const SURFACES: Readonly<Record<SurfaceType, SurfaceData>> = {
  road: { type: 'road', dragMultiplier: SURFACE_DRAG.road },
  kerb: { type: 'kerb', dragMultiplier: SURFACE_DRAG.kerb },
  sidewalk: { type: 'sidewalk', dragMultiplier: SURFACE_DRAG.sidewalk },
  grass: { type: 'grass', dragMultiplier: SURFACE_DRAG.grass },
};

/** The slowest of several surfaces, which is what a car touching all of them gets. */
function worstSurface(...surfaces: readonly SurfaceData[]): SurfaceData {
  let worst = surfaces[0];
  for (const surface of surfaces) {
    if (surface.dragMultiplier > worst.dragMultiplier) worst = surface;
  }
  return worst;
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
  /** Painted kerb outside the asphalt (px). */
  readonly kerbWidth: number;
  /** Pavement outside the kerb (px). */
  readonly sidewalkWidth: number;
  /** Drivable run-off outside the pavement, before scenery blocks the car (px). */
  readonly runoffWidth: number;
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
    this.kerbWidth = definition.kerbWidth ?? ROAD_BANDS.kerb;
    this.sidewalkWidth = definition.sidewalkWidth ?? ROAD_BANDS.sidewalk;
    this.runoffWidth = definition.runoffWidth ?? ROAD_BANDS.runoff;
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

  /** Half the asphalt width: the edge of the racing surface. */
  get roadHalfWidth(): number {
    return this.roadWidth / 2;
  }

  /** Outer edge of the painted kerb. */
  get kerbOuter(): number {
    return this.roadHalfWidth + this.kerbWidth;
  }

  /** Outer edge of the pavement. */
  get pavementOuter(): number {
    return this.kerbOuter + this.sidewalkWidth;
  }

  /**
   * How far from the centerline a car's centre may be before scenery stops it.
   *
   * This is the outside of the run-off, so the car is held in by buildings,
   * fences and trees rather than by a line that is not on screen. The car is
   * still fitted inside it by `resolveBoundary`, which is what stops a wheel
   * poking through a wall.
   */
  get corridorHalfWidth(): number {
    return this.pavementOuter + this.runoffWidth;
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
    // Gates span the whole drivable corridor, so a lap is only credited for a
    // crossing made on the road (kerb, pavement and run-off included) rather
    // than for a line crossed out in the scenery.
    return new Gate(this.centerline[i], this.directionAt(i), this.corridorHalfWidth);
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

  /**
   * Surface under a car, as a drag multiplier.
   *
   * With a heading and half-extents (the player's car), the worst surface under
   * any part of the footprint wins rather than the one under the centre: two
   * wheels on the kerb really do cost you, and a car whose nose has run onto
   * the pavement is on the pavement. Called without them, the surface under the
   * given point is used, which is what tooling and the AI want.
   */
  getSurface(
    x: number,
    y: number,
    heading?: number,
    halfLength?: number,
    halfWidth?: number,
  ): SurfaceData {
    const here = this.locate(x, y);
    const centre = this.surfaceAtDistance(here.distance);
    if (heading === undefined || halfLength === undefined || halfWidth === undefined) return centre;

    // How far the car's box reaches to either side of its own centreline.
    const reach = halfLength * Math.abs(Math.sin(heading)) + halfWidth * Math.abs(Math.cos(heading));
    if (reach <= 0) return centre;

    // Signed offset from the road, so the two extremes are `offset - reach` and
    // `offset + reach` rather than both being measured from the centre line.
    let offset = 0;
    if (here.distance > 1e-9) {
      const ox = (x - here.point.x) / here.distance;
      const oy = (y - here.point.y) / here.distance;
      offset = (x - here.point.x) * ox + (y - here.point.y) * oy;
    }

    const near = this.surfaceAtDistance(Math.max(0, Math.abs(offset) - reach));
    const far = this.surfaceAtDistance(Math.abs(offset) + reach);
    return worstSurface(centre, near, far);
  }

  private surfaceAtDistance(distance: number): SurfaceData {
    if (distance <= this.roadHalfWidth) return SURFACES.road;
    if (distance <= this.kerbOuter) return SURFACES.kerb;
    if (distance <= this.pavementOuter) return SURFACES.sidewalk;
    return SURFACES.grass;
  }

  /**
   * Returns a correction if a car at (x, y) heading `heading` would put any part
   * of its footprint past the edge of the drivable corridor.
   *
   * `halfLength`/`halfWidth` describe the car's box along and across its
   * heading. Projecting that box onto the direction of the barrier is what keeps
   * a corner or a wheel from poking through when the car is not parallel to the
   * road -- a single collision radius cannot, because the car is long and thin.
   *
   * The road is treated as the UNION of every corridor, not as one barrier: the
   * moment the car fits inside any part of it there is nothing to correct. That
   * is what makes the inside of a hairpin work, where two stretches of track
   * overlap and the nearest centerline is not always the road the car is on.
   * When it fits inside none of them, the smallest correction -- the nearest
   * barrier -- is applied, so a car caught between two walls is never shoved
   * back and forth between them or teleported across a corner.
   */
  resolveBoundary(
    x: number,
    y: number,
    heading: number,
    halfLength: number,
    halfWidth: number,
  ): CollisionResult | null {
    // Seating is a single scan in the common case, and only repeats when the
    // moved position is still not quite inside: the correction is made along one
    // segment's normal, so a car sitting square across the road can end up a
    // couple of pixels proud of the neighbouring sample it is now nearest. Two
    // extra passes settle it, and cost nothing at all while the car is on the
    // road, because that returns on the first segment it is tested against.
    let px = x;
    let py = y;
    let normal: CollisionResult | null = null;
    for (let pass = 0; pass < 4; pass++) {
      const seated = this.seat(px, py, heading, halfLength, halfWidth);
      if (!seated) break;
      px = seated.x;
      py = seated.y;
      normal = seated;
    }
    return normal;
  }

  /**
   * One pass of the boundary solve: the displacement and the inward normal that
   * fit the car inside the corridor, or null when it already fits. See
   * `resolveBoundary` for the union rule it applies.
   */
  private seat(
    x: number,
    y: number,
    heading: number,
    halfLength: number,
    halfWidth: number,
  ): CollisionResult | null {
    const limit = this.corridorHalfWidth;
    const n = this.centerline.length;
    const fx = Math.cos(heading);
    const fy = Math.sin(heading);

    let bestDepth = Infinity;
    let bestX = 0;
    let bestY = 0;

    for (let i = 0; i < n; i++) {
      const a = this.centerline[i];
      const b = this.centerline[(i + 1) % n];
      const abx = b.x - a.x;
      const aby = b.y - a.y;
      const len2 = abx * abx + aby * aby;
      const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - a.x) * abx + (y - a.y) * aby) / len2));
      const px = a.x + abx * t;
      const py = a.y + aby * t;
      const dx = x - px;
      const dy = y - py;
      const distance = Math.hypot(dx, dy);
      if (distance <= 1e-9) continue;

      // Support of the car's box along the outward direction: how far the
      // furthest corner reaches toward the barrier for the way the car points.
      const ox = dx / distance;
      const oy = dy / distance;
      const reach = halfLength * Math.abs(fx * ox + fy * oy) + halfWidth * Math.abs(fx * oy - fy * ox);
      const depth = distance + reach - limit;

      // The car fits inside this corridor, so it is on the road and nothing
      // pushes it anywhere. This has to be checked per segment rather than
      // against the nearest one: where the track passes close to itself the
      // nearest centerline is not always the road the car is driving on.
      if (depth <= 0) return null;

      if (depth < bestDepth) {
        bestDepth = depth;
        bestX = ox;
        bestY = oy;
      }
    }

    if (bestDepth === Infinity) return null;

    // Seat the whole car back inside the corridor it belongs to, along the
    // direction it was pushing against.
    return {
      x: x - bestX * bestDepth,
      y: y - bestY * bestDepth,
      nx: -bestX,
      ny: -bestY,
    };
  }
}
