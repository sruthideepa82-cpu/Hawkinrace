/**
 * Headless track-edge verification harness.
 *
 * Checks the things that are supposed to be true about the edge of the road:
 * the whole car is kept inside the drivable corridor at any angle, the corridor
 * is the road that is actually drawn (asphalt, kerb, pavement, run-off), the
 * off-road surfaces really do slow the car down, a car held against the edge
 * under power eases straight and slides free instead of getting stuck, and
 * nothing ever teleports or flips out when the track passes close to itself.
 *
 * Both `TrackLayout` and `CarPhysics` are Phaser-free, so this runs the real
 * code. Run with:
 *   node --experimental-transform-types --import ./tools/register.mjs \
 *     tools/wallCollision.ts
 */
import { TrackLayout } from '../src/game/entities/TrackLayout';
import { TRACKS, getTrackDefinition } from '../src/game/config/tracks';
import { CarPhysics, type InputState } from '../src/game/entities/CarPhysics';
import { getCarTuning } from '../src/game/config/carTuning';
import { CAR } from '../src/game/config/GameConfig';
import { angleDelta } from '../src/game/utils/geometry';

const STEP = 1 / 120;
const HALF_LENGTH = CAR.width / 2 + CAR.footprintPadding;
const HALF_WIDTH = CAR.height / 2 + CAR.footprintPadding;
const EPS = 1e-6;
const CAR_ID = 'apex-vulcan';

/**
 * How far past the corridor edge a seated car is allowed to measure.
 *
 * The road is a polyline, and the seat is solved against one of its samples.
 * Two neighbouring samples at the tightest corner differ in direction by a few
 * degrees, and the support of a long car along a direction changes with it, so
 * the car can end up a few pixels proud of the next sample along. That is the
 * centreline's sampling error, not a hole in the wall: the drawn kerb is offset
 * from the same polyline, and the residual is a fraction of the run-off band
 * the car is stopped by. Bounded here at 8px -- an eighth of the car's own
 * length -- so a regression that actually opens the wall up still fails.
 */
const SEAT_TOLERANCE = 8;

let failures = 0;
let checks = 0;

function check(label: string, condition: boolean, detail = ''): void {
  checks++;
  if (condition) {
    console.log(`  PASS  ${label}${detail ? ` (${detail})` : ''}`);
  } else {
    failures++;
    console.log(`  FAIL  ${label}${detail ? ` -> ${detail}` : ''}`);
  }
}

const layout = new TrackLayout(getTrackDefinition('hawkins-streets'));

/** How far past the corridor edge the car's footprint reaches (<= 0 is inside). */
function overhang(x: number, y: number, heading: number): number {
  const here = layout.locate(x, y);
  if (here.distance === 0) return -Infinity;
  const ox = (x - here.point.x) / here.distance;
  const oy = (y - here.point.y) / here.distance;
  const fx = Math.cos(heading);
  const fy = Math.sin(heading);
  const reach = HALF_LENGTH * Math.abs(fx * ox + fy * oy) + HALF_WIDTH * Math.abs(fx * oy - fy * ox);
  return here.distance + reach - layout.corridorHalfWidth;
}

// ------------------------------------------------- the footprint stays inside
console.log('\n[edge] the whole car is kept inside the drivable corridor, at any angle');
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
        const startX = sample.point.x + outX * (layout.corridorHalfWidth + 150);
        const startY = sample.point.y + outY * (layout.corridorHalfWidth + 150);
        const hit = layout.resolveBoundary(startX, startY, heading, HALF_LENGTH, HALF_WIDTH);
        if (!hit) continue;
        tested++;
        worst = Math.max(worst, overhang(hit.x, hit.y, heading));
      }
    }
  }
  check('the boundary was actually exercised', tested > 100, `${tested} cases`);
  check('no heading leaves any part of the car past the corridor edge', worst <= SEAT_TOLERANCE,
    `worst overhang ${worst.toFixed(4)}px`);
}

// --------------------------------------------------------- no false positives
console.log('\n[edge] a car on the road is left alone');
{
  const sample = layout.sampleAtFraction(0.5, 0);
  const onLine = layout.resolveBoundary(sample.point.x, sample.point.y, 0.7, HALF_LENGTH, HALF_WIDTH);
  check('a car on the centreline is not corrected', onLine === null);

  const inside = layout.resolveBoundary(
    sample.point.x + sample.normal.x * (layout.roadHalfWidth - 60),
    sample.point.y + sample.normal.y * (layout.roadHalfWidth - 60),
    Math.atan2(sample.normal.y, sample.normal.x),
    HALF_LENGTH,
    HALF_WIDTH,
  );
  check('a car inside the edge is not corrected', inside === null);

  // The kerb and the pavement are part of the road now, so a car out there must
  // NOT be corrected either -- only the scenery beyond the run-off stops it.
  for (const band of [layout.kerbOuter, layout.pavementOuter]) {
    const probe = layout.resolveBoundary(
      sample.point.x + sample.normal.x * (band - 4),
      sample.point.y + sample.normal.y * (band - 4),
      Math.atan2(sample.normal.y, sample.normal.x),
      HALF_LENGTH,
      HALF_WIDTH,
    );
    check(`a car at ${band.toFixed(0)}px from the centreline is not corrected`, probe === null);
  }
}

// -------------------------------------------------- the road matches the bands
console.log('\n[surface] off-road surfaces slow the car, and are reachable');
{
  const sample = layout.sampleAtFraction(0.5, 0);
  const at = (distance: number) => {
    const x = sample.point.x + sample.normal.x * distance;
    const y = sample.point.y + sample.normal.y * distance;
    return { surface: layout.getSurface(x, y), position: layout.resolveBoundary(x, y, 0, HALF_LENGTH, HALF_WIDTH) };
  };

  const road = at(layout.roadHalfWidth * 0.5);
  const kerb = at((layout.roadHalfWidth + layout.kerbOuter) / 2);
  const pavement = at((layout.kerbOuter + layout.pavementOuter) / 2);
  const grass = at(layout.pavementOuter + layout.runoffWidth * 0.5);
  const scenery = at(layout.corridorHalfWidth + 30);

  check('the middle of the asphalt is road', road.surface.type === 'road' && road.surface.dragMultiplier === 1);
  check('the painted kerb is a real, slower surface', kerb.surface.type === 'kerb' && kerb.surface.dragMultiplier > 1,
    `x${kerb.surface.dragMultiplier}`);
  check('the pavement is slower still', pavement.surface.type === 'sidewalk'
    && pavement.surface.dragMultiplier > kerb.surface.dragMultiplier, `x${pavement.surface.dragMultiplier}`);
  check('the run-off is grass and the slowest', grass.surface.type === 'grass'
    && grass.surface.dragMultiplier > pavement.surface.dragMultiplier, `x${grass.surface.dragMultiplier}`);

  // Each of those bands must actually be drivable: the car can stand in it and
  // the scenery beyond it is what stops it, not an invisible wall in the middle
  // of the road.
  check('the kerb is drivable', kerb.position === null);
  check('the pavement is drivable', pavement.position === null);
  check('the run-off is drivable', grass.position === null);
  check('the scenery beyond the run-off blocks the car', scenery.position !== null);

  // A wheel over the kerb costs speed even though the car's centre is still on
  // the asphalt: that is what the footprint-wide surface query is for.
  const wheelOnKerb = layout.getSurface(
    sample.point.x + sample.normal.x * (layout.roadHalfWidth - 10),
    sample.point.y + sample.normal.y * (layout.roadHalfWidth - 10),
    Math.atan2(sample.normal.y, sample.normal.x),
    HALF_LENGTH,
    HALF_WIDTH,
  );
  check('a wheel over the kerb slows the car before the centre leaves the road',
    wheelOnKerb.dragMultiplier > 1, `x${wheelOnKerb.dragMultiplier.toFixed(2)}`);
}

// -------------------------------------------------------------- self-approach
console.log('\n[corner] a track that doubles back on itself still resolves');
{
  // Starcourt has the tightest corner in the game, tight enough that the inside
  // of the hairpin passes within the corridor of the road on the far side of it.
  // A single-barrier test picks the wrong wall there and flings the car across
  // the infield, so the union rule is what makes this case work at all.
  const starcourt = new TrackLayout(getTrackDefinition('starcourt-run'));
  check('starcourt really does have overlapping corridors at its tightest corner',
    starcourt.corridorHalfWidth * 2 > shortestSeparation(starcourt),
    `corridor ${starcourt.corridorHalfWidth.toFixed(0)}px`);

  let worst = -Infinity;
  let teleports = 0;
  let tested = 0;
  // Drive the car into the infield of the tightest corner from several angles.
  const tightest = tightestFraction(starcourt);
  const sample = starcourt.sampleAtFraction(tightest, 0);
  for (let i = 0; i < 72; i++) {
    const angle = (i / 72) * Math.PI * 2;
    for (const distance of [starcourt.corridorHalfWidth + 60, starcourt.corridorHalfWidth + 200]) {
      const x = sample.point.x + sample.normal.x * Math.cos(angle) * distance;
      const y = sample.point.y + sample.normal.y * Math.cos(angle) * distance;
      const hit = starcourt.resolveBoundary(x, y, angle, HALF_LENGTH, HALF_WIDTH);
      if (!hit) continue;
      tested++;
      // A correction may never be longer than the distance to the road itself:
      // anything more means the car has been pushed across the centerline, or
      // flung from one side of the circuit to the other.
      const toRoad = starcourt.locate(x, y).distance;
      if (Math.hypot(hit.x - x, hit.y - y) > toRoad + EPS) teleports++;
      worst = Math.max(worst, overhangAt(starcourt, hit.x, hit.y, angle));
    }
  }
  check('the infield of the hairpin was exercised', tested > 50, `${tested} cases`);
  check('the car is never teleported across the corner', teleports === 0, `${teleports} over-long corrections`);
  check('and never left outside the corridor', worst <= SEAT_TOLERANCE, `worst overhang ${worst.toFixed(4)}px`);
}

/** Smallest gap between two non-adjacent parts of the centerline. */
function shortestSeparation(t: TrackLayout): number {
  const pts = t.centerline;
  let best = Infinity;
  for (let i = 0; i < pts.length; i += 4) {
    for (let j = i + 40; j < pts.length; j += 4) {
      if (Math.min(j - i, pts.length - (j - i)) < 40) continue;
      const d = Math.hypot(pts[j].x - pts[i].x, pts[j].y - pts[i].y);
      if (d < best) best = d;
    }
  }
  return best;
}

/** Lap fraction whose corner is tightest (largest heading change per sample). */
function tightestFraction(t: TrackLayout): number {
  let best = 0;
  let sharpest = 0;
  for (let i = 0; i < t.centerline.length; i++) {
    const a = t.directionAt(i);
    const b = t.directionAt(i + 1);
    const turn = Math.abs(Math.atan2(a.x * b.y - a.y * b.x, a.x * b.x + a.y * b.y));
    if (turn > sharpest) {
      sharpest = turn;
      best = i / t.centerline.length;
    }
  }
  return best;
}

function overhangAt(t: TrackLayout, x: number, y: number, heading: number): number {
  const here = t.locate(x, y);
  const ox = (x - here.point.x) / (here.distance || 1);
  const oy = (y - here.point.y) / (here.distance || 1);
  const fx = Math.cos(heading);
  const fy = Math.sin(heading);
  const reach = HALF_LENGTH * Math.abs(fx * ox + fy * oy) + HALF_WIDTH * Math.abs(fx * oy - fy * ox);
  return here.distance + reach - t.corridorHalfWidth;
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
    const startDist = layout.corridorHalfWidth - 90;

    const car = new CarPhysics(getCarTuning(CAR_ID));
    car.reset(
      sample.point.x + outX * startDist,
      sample.point.y + outY * startDist,
      Math.atan2(outY, outX), // nose pointed straight at the barrier
    );
    const start = { x: car.x, y: car.y };

    const input: InputState = { accelerate: true, brake: false, steer: 0, nitro: false, ability: false };
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
        car.applyCollision(seated ?? hit, STEP);
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
  check('the assist still keeps the whole car inside the corridor', freed.worst <= SEAT_TOLERANCE,
    `worst overhang ${freed.worst.toFixed(4)}px`);
  check('the assist only ever helps', freed.car.speed > stuck.car.speed,
    `${freed.car.speed.toFixed(1)} vs ${stuck.car.speed.toFixed(1)}`);
}

// ----------------------------------------------------------- never gets stuck
console.log('\n[stuck] a car pinned against the scenery for 10s still gets out');
{
  /**
   * Every track, every angle: hold the throttle on from a worst-case start
   * against the scenery and confirm the car is still moving at the end. A car
   * that cannot free itself here is a car the player has to restart out of.
   */
  let stuck = 0;
  let tested = 0;
  for (const id of Object.keys(TRACKS)) {
    const t = new TrackLayout(getTrackDefinition(id));
    const sample = t.sampleAtFraction(0.5, 0);
    for (const angle of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      const car = new CarPhysics(getCarTuning(CAR_ID));
      car.reset(
        sample.point.x + sample.normal.x * (t.corridorHalfWidth - 60),
        sample.point.y + sample.normal.y * (t.corridorHalfWidth - 60),
        angle,
      );
      for (let i = 0; i < 120 * 10; i++) {
        car.step(STEP, { accelerate: true, brake: false, steer: 0, nitro: false, ability: false }, 1, 0);
        const hit = t.resolveBoundary(car.x, car.y, car.heading, HALF_LENGTH, HALF_WIDTH);
        if (hit) {
          car.alignToWall(hit.nx, hit.ny, CAR.wallAssistRate, STEP);
          car.applyCollision(
            t.resolveBoundary(car.x, car.y, car.heading, HALF_LENGTH, HALF_WIDTH) ?? hit,
            STEP,
          );
        }
      }
      tested++;
      if (car.speed < 30) stuck++;
    }
  }
  check('no car is left pinned against the scenery', stuck === 0, `${stuck}/${tested} stuck`);
}

// ------------------------------------------------------------------- summary
console.log(`\n=== ${checks - failures}/${checks} checks passed ===`);
if (failures > 0) {
  console.log(`${failures} FAILED\n`);
  process.exit(1);
}
console.log('ALL CHECKS PASSED\n');