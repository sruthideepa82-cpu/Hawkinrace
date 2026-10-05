import type { Point } from '../config/tracks';

/**
 * Knot spacing exponent for the Catmull-Rom spline.
 *
 * 0 is the textbook uniform form, which parameterises on segment index and
 * overshoots badly when control points are unevenly spaced -- on Hawkins Streets
 * that produced 90px-radius kinks in the middle of a corner the designer drew as
 * a gentle sweep. 0.5 is the centripetal form, which parameterises on chord
 * length and is guaranteed to have no cusps or self-intersections.
 */
const CENTRIPETAL_ALPHA = 0.5;

/** Squared distance guard, so coincident control points cannot divide by zero. */
const MIN_KNOT_GAP = 1e-4;

type Scalar = number;

function lerp(a: Scalar, b: Scalar, t: number): Scalar {
  return a + (b - a) * t;
}

/**
 * Centripetal Catmull-Rom across one segment (p1 -> p2).
 *
 * De Casteljau's construction over knots derived from chord lengths, rather than
 * the uniform closed-form. Same points in, same points out at the control
 * points -- it just stops the curve bulging between widely and narrowly spaced
 * points.
 */
function catmullRom(
  p0: Point,
  p1: Point,
  p2: Point,
  p3: Point,
  t0: number,
  t1: number,
  t2: number,
  t3: number,
  t: number,
): Point {
  const a1x = lerp(p0.x, p1.x, (t - t0) / (t1 - t0));
  const a1y = lerp(p0.y, p1.y, (t - t0) / (t1 - t0));
  const a2x = lerp(p1.x, p2.x, (t - t1) / (t2 - t1));
  const a2y = lerp(p1.y, p2.y, (t - t1) / (t2 - t1));
  const a3x = lerp(p2.x, p3.x, (t - t2) / (t3 - t2));
  const a3y = lerp(p2.y, p3.y, (t - t2) / (t3 - t2));

  const b1x = lerp(a1x, a2x, (t - t0) / (t2 - t0));
  const b1y = lerp(a1y, a2y, (t - t0) / (t2 - t0));
  const b2x = lerp(a2x, a3x, (t - t1) / (t3 - t1));
  const b2y = lerp(a2y, a3y, (t - t1) / (t3 - t1));

  return {
    x: lerp(b1x, b2x, (t - t1) / (t2 - t1)),
    y: lerp(b1y, b2y, (t - t1) / (t2 - t1)),
  };
}

/**
 * Redistributes a closed polyline into `count` points spaced evenly by arc
 * length.
 *
 * `smoothClosedLoop` places `samplesPerSegment` samples at equal *knot*
 * intervals, so its output is dense where the curve bends and sparse where it
 * runs straight -- spacing on Hawkins Streets varied by more than 2x. Everything
 * downstream reasons in arc length (lap distance, corner radius, gate placement),
 * and uneven spacing quietly biases all of it, so the polyline is resampled once
 * here to make `trackLength / count` a trustworthy spacing everywhere.
 */
export function resampleClosedPolyline(points: readonly Point[], count: number): Point[] {
  const n = points.length;
  if (n === 0 || count < 3) return points.slice();

  // Cumulative arc length around the closed loop, n + 1 entries so the wrap
  // segment has a length too.
  const cumulative = new Array<number>(n + 1);
  cumulative[0] = 0;
  for (let i = 0; i < n; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    cumulative[i + 1] = cumulative[i] + Math.hypot(b.x - a.x, b.y - a.y);
  }
  const total = cumulative[n];
  if (!(total > 0)) return points.slice();

  const out: Point[] = [];
  let seg = 0;
  for (let i = 0; i < count; i++) {
    const target = (i / count) * total;
    // Walk forward; targets are monotonic so this stays O(n + count).
    while (seg < n - 1 && cumulative[seg + 1] < target) seg++;
    const a = points[seg];
    const b = points[(seg + 1) % n];
    const segLen = cumulative[seg + 1] - cumulative[seg];
    const t = segLen > 0 ? Math.max(0, Math.min(1, (target - cumulative[seg]) / segLen)) : 0;
    out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  }
  return out;
}

/** Smooth a closed loop of control points into a dense polyline. */
export function smoothClosedLoop(points: readonly Point[], samplesPerSegment: number): Point[] {
  const n = points.length;
  const out: Point[] = [];
  const alpha = CENTRIPETAL_ALPHA;

  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n];
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    const p3 = points[(i + 2) % n];

    // Knots advance by the alpha-power of each chord, so unevenly spaced control
    // points no longer pull the curve into an overshoot.
    const d01 = Math.hypot(p1.x - p0.x, p1.y - p0.y) ** alpha;
    const d12 = Math.hypot(p2.x - p1.x, p2.y - p1.y) ** alpha;
    const d23 = Math.hypot(p3.x - p2.x, p3.y - p2.y) ** alpha;

    const t0 = 0;
    const t1 = t0 + Math.max(MIN_KNOT_GAP, d01);
    const t2 = t1 + Math.max(MIN_KNOT_GAP, d12);
    const t3 = t2 + Math.max(MIN_KNOT_GAP, d23);

    for (let s = 0; s < samplesPerSegment; s++) {
      const t = t1 + (s / samplesPerSegment) * (t2 - t1);
      out.push(catmullRom(p0, p1, p2, p3, t0, t1, t2, t3, t));
    }
  }
  return out;
}

export interface NearestResult {
  distance: number;
  point: Point;
  index: number;
  fraction: number; // 0..1 representing how far along the total track this is
}

/** Nearest point on a closed polyline to (x, y). */
export function nearestOnClosedPolyline(path: readonly Point[], x: number, y: number): NearestResult {
  let bestDist2 = Infinity;
  let best: Point = path[0];
  let bestIndex = 0;
  let bestT = 0;
  const n = path.length;
  for (let i = 0; i < n; i++) {
    const a = path[i];
    const b = path[(i + 1) % n];
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const len2 = abx * abx + aby * aby;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - a.x) * abx + (y - a.y) * aby) / len2));
    const px = a.x + abx * t;
    const py = a.y + aby * t;
    const d2 = (x - px) ** 2 + (y - py) ** 2;
    if (d2 < bestDist2) {
      bestDist2 = d2;
      best = { x: px, y: py };
      bestIndex = i;
      bestT = t;
    }
  }
  return { distance: Math.sqrt(bestDist2), point: best, index: bestIndex, fraction: (bestIndex + bestT) / n };
}

export function wrapIndex(i: number, length: number): number {
  return ((i % length) + length) % length;
}

/** Normalises any number into 0..1, so track positions can be compared safely. */
export function wrapFraction(f: number): number {
  const wrapped = f % 1;
  return wrapped < 0 ? wrapped + 1 : wrapped;
}

/** Shortest signed angular difference from `from` to `to`, in (-PI, PI]. */
export function angleDelta(from: number, to: number): number {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

/** Normalises an angle into (-PI, PI] so a stored angle cannot drift over time. */
export function wrapAngle(angle: number): number {
  return angleDelta(0, angle);
}

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function formatRaceTime(ms: number): string {
  const total = Math.max(0, ms);
  const minutes = Math.floor(total / 60000);
  const seconds = Math.floor((total % 60000) / 1000);
  const millis = Math.floor(total % 1000);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}
