import type { Point } from '../config/tracks';

/** Catmull-Rom interpolation of one segment (p1 -> p2). */
function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

/** Smooth a closed loop of control points into a dense polyline. */
export function smoothClosedLoop(points: readonly Point[], samplesPerSegment: number): Point[] {
  const n = points.length;
  const out: Point[] = [];
  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n];
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    const p3 = points[(i + 2) % n];
    for (let s = 0; s < samplesPerSegment; s++) {
      const t = s / samplesPerSegment;
      out.push({ x: catmullRom(p0.x, p1.x, p2.x, p3.x, t), y: catmullRom(p0.y, p1.y, p2.y, p3.y, t) });
    }
  }
  return out;
}

export interface NearestResult {
  distance: number;
  point: Point;
}

/** Nearest point on a closed polyline to (x, y). */
export function nearestOnClosedPolyline(path: readonly Point[], x: number, y: number): NearestResult {
  let bestDist2 = Infinity;
  let best: Point = path[0];
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
    }
  }
  return { distance: Math.sqrt(bestDist2), point: best };
}

export function wrapIndex(i: number, length: number): number {
  return ((i % length) + length) % length;
}

export function formatRaceTime(ms: number): string {
  const total = Math.max(0, ms);
  const minutes = Math.floor(total / 60000);
  const seconds = Math.floor((total % 60000) / 1000);
  const millis = Math.floor(total % 1000);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}
