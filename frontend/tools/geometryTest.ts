/**
 * Geometry unit tests.
 *
 * `smoothClosedLoop` feeds every other system: lap progress, the AI's corner
 * speed, checkpoint placement and the camera all measure arc length along the
 * result. A spline that silently stops passing through its control points or
 * balloons in length turns all of that into nonsense, and the symptom shows up
 * hundreds of lines away -- so it is checked directly here.
 */
import { smoothClosedLoop } from '../src/game/utils/geometry';
import { TrackLayout } from '../src/game/entities/TrackLayout';
import { TRACKS } from '../src/game/config/tracks';
import { nearestOnClosedPolyline } from '../src/game/utils/geometry';

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail = ''): void {
  if (ok) {
    passed++;
    console.log(`  PASS  ${name}${detail ? ` (${detail})` : ''}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}${detail ? ` (${detail})` : ''}`);
  }
}

console.log('=== [spline] smoothClosedLoop ===');

// A square: the curve must pass exactly through every corner.
const square = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 100 },
  { x: 0, y: 100 },
];
const sq = smoothClosedLoop(square, 16);
check('emits samplesPerSegment per control point', sq.length === 4 * 16, `${sq.length} points`);

let maxCornerError = 0;
for (const cp of square) {
  const near = nearestOnClosedPolyline(sq, cp.x, cp.y);
  maxCornerError = Math.max(maxCornerError, near.distance);
}
check('passes exactly through every control point', maxCornerError < 1e-6, `max error ${maxCornerError.toExponential(2)}px`);

// A circle sampled as control points: the curve should hug the true circle.
const circleCps = Array.from({ length: 12 }, (_, i) => {
  const a = (i / 12) * Math.PI * 2;
  return { x: 200 * Math.cos(a), y: 200 * Math.sin(a) };
});
const circle = smoothClosedLoop(circleCps, 32);
let minRadius = Infinity;
let maxRadius = 0;
for (const p of circle) {
  const r = Math.hypot(p.x, p.y);
  minRadius = Math.min(minRadius, r);
  maxRadius = Math.max(maxRadius, r);
}
// Centripetal parameterisation pulls a circle slightly inward between control
// points, but never outside it -- uniform Catmull-Rom overshoots outward.
check('circle never bulges outside its control points', maxRadius <= 200 + 1e-6, `max r ${maxRadius.toFixed(3)}`);
check('circle stays reasonably close to the true radius', minRadius > 190, `min r ${minRadius.toFixed(2)}`);

console.log('\n=== [tracks] built centerlines ===');
for (const def of Object.values(TRACKS)) {
  const layout = new TrackLayout(def);
  const tag = `${def.id}`;

  // Every control point must lie on the centerline.
  let worst = 0;
  for (const cp of def.controlPoints) {
    const near = nearestOnClosedPolyline(layout.centerline, cp.x, cp.y);
    worst = Math.max(worst, near.distance);
  }
  check(`${tag}: passes through all control points`, worst < 2, `max ${worst.toFixed(3)}px`);

  // The loop must close: first and last samples should nearly coincide in space
  // and the polyline should not double back on itself.
  const first = layout.centerline[0];
  const last = layout.centerline[layout.centerline.length - 1];
  const gapToFirst = Math.hypot(last.x - layout.centerline[1].x, last.y - layout.centerline[1].y);
  check(`${tag}: no duplicated wrap sample`, gapToFirst > 1, `gap ${gapToFirst.toFixed(1)}px`);

  // Length must be a sane multiple of the straight-line control polygon.
  let polyline = 0;
  for (let i = 0; i < def.controlPoints.length; i++) {
    const a = def.controlPoints[i];
    const b = def.controlPoints[(i + 1) % def.controlPoints.length];
    polyline += Math.hypot(b.x - a.x, b.y - a.y);
  }
  const ratio = layout.trackLength / polyline;
  check(
    `${tag}: length within 1.0-1.6x the control polygon`,
    ratio > 1 && ratio < 1.6,
    `length ${layout.trackLength.toFixed(0)} vs polygon ${polyline.toFixed(0)} (${ratio.toFixed(2)}x)`,
  );

  // Every centerline point must be a finite number inside the world bounds.
  const bad = layout.centerline.find(
    (p) => !Number.isFinite(p.x) || !Number.isFinite(p.y) ||
      p.x < -200 || p.y < -200 || p.x > def.worldWidth + 200 || p.y > def.worldHeight + 200,
  );
  check(`${tag}: no samples outside the world`, bad === undefined, bad ? `bad sample ${bad.x},${bad.y}` : '');

  // Sample spacing must be uniform enough that arc-length lookups are trustworthy.
  let minGap = Infinity;
  let maxGap = 0;
  for (let i = 0; i < layout.centerline.length; i++) {
    const a = layout.centerline[i];
    const b = layout.centerline[(i + 1) % layout.centerline.length];
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    minGap = Math.min(minGap, d);
    maxGap = Math.max(maxGap, d);
  }
  check(`${tag}: sample spacing is even`, maxGap / minGap < 1.35, `${minGap.toFixed(2)}..${maxGap.toFixed(2)}px`);

  // The tightest corner must be driveable on a road of this width.
  let tightest = Infinity;
  for (let f = 0; f < 1; f += 0.002) {
    const r = layout.cornerRadiusAhead(f, 160);
    if (r < tightest) tightest = r;
  }
  check(
    `${tag}: tightest corner radius exceeds the road half-width`,
    tightest > layout.roadWidth / 2,
    `tightest ${tightest.toFixed(0)}px vs half-road ${(layout.roadWidth / 2).toFixed(0)}px`,
  );
}

console.log(`\n=== ${passed}/${passed + failed} geometry checks passed ===`);
if (failed > 0) process.exit(1);