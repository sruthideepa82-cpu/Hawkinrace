/**
 * Headless track-edge verification harness.
 *
 * Checks the two things that were reported about hitting the side of the road:
 * the whole car must stay on the asphalt rather than a corner clipping through
 * the kerb, and a car held against the edge under power must ease straight and
 * slide free instead of getting stuck on it.
 *
 * Both `TrackLayout` and `CarPhysics` are Phaser-free, so this runs the real
 * code. Run with:
 *   node --experimental-transform-types --import ./tools/register.mjs \
 *     tools/wallCollision.ts
 */
import { TrackLayout } from '../src/game/entities/TrackLayout';
import { getTrackDefinition } from '../src/game/config/tracks';
import { CarPhysics, type InputState } from '../src/game/entities/CarPhysics';
import { getCarTuning } from '../src/game/config/carTuning';
import { CAR } from '../src/game/config/GameConfig';
import { angleDelta } from '../src/game/utils/geometry';

const STEP = 1 / 120;
const HALF_LENGTH = CAR.width / 2 + CAR.footprintPadding;
const HALF_WIDTH = CAR.height / 2 + CAR.footprintPadding;
const EPS = 1e-6;

let failures = 0;
let checks = 0;

function check(label: string, condition: boolean, detail = ''): void {
  checks++;
  if (condition) {
    console.log(`  PASS  ${label}`);
  } else {
    failures++;
    console.log(`  FAIL  ${label}${detail ? ` -> ${detail}` : ''}`);
  }
}

const layout = new TrackLayout(getTrackDefinition('hawkins-streets'));
const half = layout.roadWidth / 2;

/** How far past the asphalt edge the car's footprint reaches (<= 0 is on it). */
function overhang(x: number, y: number, heading: number): number {
  const here = layout.locate(x, y);
  if (here.distance === 0) return 0;
  const ox = (x - here.point.x) / here.distance;
  const oy = (y - here.point.y) / here.distance;
  const fx = Math.cos(heading);
  const fy = Math.sin(heading);
  const reach = HALF_LENGTH * Math.abs(fx * ox + fy * oy) + HALF_WIDTH * Math.abs(fx * oy - fy * ox);
  return here.distance + reach - half;
}

// ------------------------------------------------------- the footprint stays on
console.log('\n[edge] the whole car is kept on the asphalt, at any angle');
{
  let worst = -Infinity;
  let tested = 0;
  // Sweep both sides of the road and every heading, starting well past the edge.
  for (const fraction of [0.08, 0.25, 0.5, 0.73, 0.91]) {
    for (const side of [1, -1]) {
      const sample = layout.sampleAtFraction(fraction, 0);
      const outX = sample.normal.x * side;
      const outY = sample.normal.y * side;
      for (let i = 0; i < 36; i++) {
        const heading = (i / 36) * Math.PI * 2;
        const startX = sample.point.x + outX * (half + 150);
        const startY = sample.point.y + outY * (half + 150);
        const hit = layout.resolveBoundary(startX, startY, heading, HALF_LENGTH, HALF_WIDTH);
        if (!hit) continue;
        tested++;
        worst = Math.max(worst, overhang(hit.x, hit.y, heading));
      }
    }
  }
  check('the boundary was actually exercised', tested > 100, `${tested} cases`);
  check('no heading leaves any part of the car past the edge', worst <= EPS,
    `worst overhang ${worst.toFixed(4)}px`);
}

// --------------------------------------------------------- no false positives
console.log('\n[edge] a car on the road is left alone');
{
  const sample = layout.sampleAtFraction(0.5, 0);
  const onLine = layout.resolveBoundary(sample.point.x, sample.point.y, 0.7, HALF_LENGTH, HALF_WIDTH);
  check('a car on the centreline is not corrected', onLine === null);

  const inside = layout.resolveBoundary(
    sample.point.x + sample.normal.x * (half - 60),
    sample.point.y + sample.normal.y * (half - 60),
    Math.atan2(sample.normal.y, sample.normal.x),
    HALF_LENGTH,
    HALF_WIDTH,
  );
  check('a car inside the edge is not corrected', inside === null);
}

// ----------------------------------------------------------- the wall assist
console.log('\n[assist] a car held against the edge under power slides free');
{
  /**
   * Drives a car nose-first at the barrier with the throttle pinned and reports
   * what happened. `assist` toggles the wall assist so the fix can be shown to
   * make the difference rather than assumed.
   */
  function ram(assist: boolean, seconds: number) {
    const sample = layout.sampleAtFraction(0.5, 0);
    const outX = sample.normal.x;
    const outY = sample.normal.y;
    const startDist = half - 90;

    const car = new CarPhysics(getCarTuning('falcon-gt'));
    car.reset(
      sample.point.x + outX * startDist,
      sample.point.y + outY * startDist,
      Math.atan2(outY, outX), // nose pointed straight at the barrier
    );
    const start = { x: car.x, y: car.y };

    const input: InputState = { accelerate: true, brake: false, steer: 0, nitro: false };
    const steps = Math.round(seconds / STEP);
    let contacts = 0;
    let worst = -Infinity;
    for (let i = 0; i < steps; i++) {
      car.step(STEP, input, 1, 0);
      const hit = layout.resolveBoundary(car.x, car.y, car.heading, HALF_LENGTH, HALF_WIDTH);
      if (hit) {
        // Mirrors RaceSession: ease the nose, then clamp against the barrier for
        // the heading the car ends up with.
        if (assist) car.alignToWall(hit.nx, hit.ny, CAR.wallAssistRate, STEP);
        const seated = layout.resolveBoundary(car.x, car.y, car.heading, HALF_LENGTH, HALF_WIDTH);
        car.applyCollision(seated ?? hit);
        contacts++;
      }
      worst = Math.max(worst, overhang(car.x, car.y, car.heading));
    }

    // How far the nose is from running along the barrier (0 = parallel to it).
    const along = Math.atan2(outX, -outY);
    const dev = Math.abs(angleDelta(car.heading, along));
    return {
      car,
      contacts,
      worst,
      travelled: Math.hypot(car.x - start.x, car.y - start.y),
      fromLineDeg: (Math.min(dev, Math.PI - dev) / Math.PI) * 180,
    };
  }

  const stuck = ram(false, 4);
  const freed = ram(true, 4);

  check('without the assist the car is pinned (baseline)', stuck.car.speed < 25,
    `${stuck.car.speed.toFixed(1)}px/s`);
  check('with the assist the car picks up speed', freed.car.speed > 120,
    `${freed.car.speed.toFixed(1)}px/s`);
  check('the assist turns the nose along the barrier', freed.fromLineDeg < 25,
    `${freed.fromLineDeg.toFixed(0)}deg off the barrier`);
  check('the car actually escapes along the road', freed.travelled > 80,
    `travelled ${freed.travelled.toFixed(0)}px`);
  check('the assist still keeps the whole car on the asphalt', freed.worst <= EPS,
    `worst overhang ${freed.worst.toFixed(4)}px`);
  check('the assist only ever helps', freed.car.speed > stuck.car.speed,
    `${freed.car.speed.toFixed(1)} vs ${stuck.car.speed.toFixed(1)}`);
}

// ------------------------------------------------------------------- summary
console.log(`\n=== ${checks - failures}/${checks} checks passed ===`);
if (failures > 0) {
  console.log(`${failures} FAILED\n`);
  process.exit(1);
}
console.log('ALL CHECKS PASSED\n');
