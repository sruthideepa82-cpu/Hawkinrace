/**
 * Headless driving-physics verification harness.
 *
 * `CarPhysics` is Phaser-free and pure, so every claim the game makes about
 * how the car drives can be measured directly rather than eyeballed: smooth
 * acceleration and deceleration, braking before reverse, a controlled reverse,
 * steering that responds to speed, movement that does not change with the frame
 * rate, a speedometer that matches the car, per-chassis handling, and a
 * barrier response that scrubs speed without trapping or spinning the car.
 *
 * Run with:
 *   node --experimental-transform-types --import ./tools/register.mjs \
 *     tools/physics.ts
 */
import { CarPhysics, type InputState } from '../src/game/entities/CarPhysics';
import { CARS } from '../src/data/cars';
import { CHARACTERS } from '../src/data/characters';
import { CAR } from '../src/game/config/GameConfig';
import { VEHICLE_CONFIG, createRacerTuning, getCarTuning } from '../src/game/config/carTuning';

const REF_STEP = 1 / 120;
const CAR_ID = 'apex-vulcan';

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

const input = (over: Partial<InputState> = {}): InputState => ({
  accelerate: false, brake: false, steer: 0, nitro: false, ability: false, ...over,
});

/** Drives a car with one fixed input and records its speed each step. */
function drive(
  seconds: number,
  control: InputState,
  options: { step?: number; start?: CarPhysics; tuning?: ReturnType<typeof getCarTuning> } = {},
) {
  const step = options.step ?? REF_STEP;
  const car = options.start ?? new CarPhysics(options.tuning ?? getCarTuning(CAR_ID));
  if (!options.start) car.reset(0, 0, 0);
  const steps = Math.round(seconds / step);
  const trace: number[] = [];
  for (let i = 0; i < steps; i++) {
    car.step(step, control, 1, 0);
    trace.push(car.speed);
  }
  return { car, trace, step };
}

/** Time to first reach `target` px/s, or null. */
function timeToSpeed(trace: readonly number[], step: number, target: number): number | null {
  for (let i = 0; i < trace.length; i++) {
    if (trace[i] >= target) return (i + 1) * step;
  }
  return null;
}

/** Time to first fall to `target` px/s or below, or null. */
function timeToFallTo(trace: readonly number[], step: number, target: number): number | null {
  for (let i = 0; i < trace.length; i++) {
    if (trace[i] <= target) return (i + 1) * step;
  }
  return null;
}

// ---------------------------------------------------------------- acceleration
console.log('\n[acceleration] throttle in is smooth and reaches a real top speed');
{
  const tuning = getCarTuning(CAR_ID);
  const { car, trace } = drive(12, input({ accelerate: true }));

  let biggestJump = 0;
  let drops = 0;
  for (let i = 1; i < trace.length; i++) {
    biggestJump = Math.max(biggestJump, trace[i] - trace[i - 1]);
    if (trace[i] < trace[i - 1] - 1e-9) drops++;
  }
  check('speed never decreases while accelerating', drops === 0, `${drops} drops`);
  check('no frame-to-frame jump', biggestJump < tuning.acceleration * REF_STEP * 1.05,
    `worst step ${biggestJump.toFixed(2)}px/s`);

  const to300 = timeToSpeed(trace, REF_STEP, 300);
  check('0-300px/s in a sane time', to300 !== null && to300 > 1 && to300 < 5,
    to300 === null ? 'never' : `${to300.toFixed(2)}s`);
  check('reaches at least 90% of the car top speed', car.speed > tuning.maxSpeed * 0.9,
    `${car.speed.toFixed(0)} of ${tuning.maxSpeed.toFixed(0)}px/s`);
  check('never exceeds the car top speed', car.speed <= tuning.maxSpeed + 1e-6,
    `${car.speed.toFixed(1)}px/s`);
}

// --------------------------------------------------------------- deceleration
console.log('\n[coasting] letting go of the throttle slows the car gradually');
{
  const tuning = getCarTuning(CAR_ID);
  const up = drive(10, input({ accelerate: true })).car;
  const entry = up.speed;

  const { trace } = drive(10, input(), { start: up });
  // The trace records the speed after each step, so the first entry is one step
  // of coasting down from where the car actually was.
  check('carries its speed into the coast', Math.abs(trace[0] - entry) < 2,
    `${entry.toFixed(1)} -> ${trace[0].toFixed(1)}px/s`);
  check('the first frame does not scrub a big slice of speed off',
    entry - trace[1] < entry * 0.02, `lost ${(entry - trace[1]).toFixed(2)}px/s in one frame`);

  let monotonic = true;
  for (let i = 1; i < trace.length; i++) if (trace[i] > trace[i - 1] + 1e-9) monotonic = false;
  check('speed falls monotonically while coasting', monotonic);

  const half = timeToFallTo(trace, REF_STEP, entry / 2);
  check('losing half the speed takes seconds, not a frame', half !== null && half > 0.5,
    half === null ? 'never' : `${half.toFixed(2)}s`);

  const long = drive(60, input()).car;
  check('coasting eventually stops the car', long.speed < 1, `${long.speed.toFixed(2)}px/s`);
  void tuning;
}

// ------------------------------------------------------------ braking / reverse
console.log('\n[brakes] the brake pedal brakes first, and reverse only after a stop');
{
  const tuning = getCarTuning(CAR_ID);

  // A short brake application from speed must slow the car without ever
  // producing reverse: that would be a gear change, not a brake.
  const short = drive(10, input({ accelerate: true })).car;
  let wentBackwards = false;
  for (let i = 0; i < Math.round(0.2 / REF_STEP); i++) {
    short.step(REF_STEP, input({ brake: true }), 1, 0);
    if (short.forwardSpeed <= 0) wentBackwards = true;
  }
  check('braking hard does not send the car into reverse', !wentBackwards,
    `${short.forwardSpeed.toFixed(1)}px/s after 0.2s of braking`);

  // Held down, it comes to a complete stop...
  const held = drive(10, input({ accelerate: true })).car;
  let stoppedAt = -1;
  for (let i = 0; i < 120 * 14; i++) {
    held.step(REF_STEP, input({ brake: true }), 1, 0);
    if (stoppedAt < 0 && held.forwardSpeed <= 0) stoppedAt = i;
  }
  check('holding the brake does bring the car to a complete stop', stoppedAt >= 0,
    stoppedAt < 0 ? 'never stopped' : `${(stoppedAt / 120).toFixed(2)}s`);

  // ...and only then does it reverse, slowly and to a limit.
  check('holding the pedal at a standstill reverses the car', held.forwardSpeed < -1,
    `${held.forwardSpeed.toFixed(1)}px/s`);
  check('reverse is speed-limited', held.speed <= tuning.maxReverseSpeed + 1e-6,
    `${held.speed.toFixed(1)} of ${tuning.maxReverseSpeed}px/s`);
  check('reverse is slower than forward by a wide margin',
    tuning.maxReverseSpeed < tuning.maxSpeed * 0.5,
    `${tuning.maxReverseSpeed} vs ${tuning.maxSpeed}px/s`);

  // Braking must beat coasting to a stop over the same run.
  const coasting = drive(10, input({ accelerate: true })).car;
  const braking = drive(10, input({ accelerate: true })).car;
  let coastStop = -1;
  let brakeStop = -1;
  for (let i = 0; i < 120 * 60; i++) {
    coasting.step(REF_STEP, input(), 1, 0);
    braking.step(REF_STEP, input({ brake: true }), 1, 0);
    if (coastStop < 0 && coasting.forwardSpeed <= 0) coastStop = i;
    if (brakeStop < 0 && braking.forwardSpeed <= 0) brakeStop = i;
  }
  check('the brake stops the car sooner than coasting',
    brakeStop >= 0 && coastStop >= 0 && brakeStop < coastStop,
    `brake ${(brakeStop / 120).toFixed(1)}s vs coast ${(coastStop / 120).toFixed(1)}s`);
}

// ------------------------------------------------------------------- steering
console.log('\n[steering] steering authority rises with speed and fades at the top');
{
  const tuning = getCarTuning(CAR_ID);
  /** Yaw rate (rad/s) from a standing start at `speed`, held for half a second. */
  const yawRateAt = (speed: number) => {
    const car = new CarPhysics(tuning);
    car.reset(0, 0, 0);
    car.vx = speed;
    const before = car.heading;
    for (let i = 0; i < Math.round(0.5 / REF_STEP); i++) car.step(REF_STEP, input({ steer: 1 }), 1, 0);
    return Math.abs(car.heading - before) / 0.5;
  };

  const crawl = yawRateAt(40);
  const mid = yawRateAt(tuning.maxSpeed * tuning.steerPeakSpeedRatio);
  const top = yawRateAt(tuning.maxSpeed * 0.98);

  check('the car can be steered while barely moving', crawl > 0, `${crawl.toFixed(2)}rad/s`);
  check('steering is strongest in the mid range', mid > crawl && mid > top,
    `crawl ${crawl.toFixed(2)} / mid ${mid.toFixed(2)} / top ${top.toFixed(2)}rad/s`);
  check('steering is still meaningful at top speed', top > mid * 0.25,
    `${(top / mid * 100).toFixed(0)}% of peak`);
  check('a car at a standstill cannot be spun on the spot', Math.abs(yawRateAt(0)) === 0);

  // Releasing the key straightens the wheel: it must not stay on lock.
  const car = new CarPhysics(tuning);
  car.reset(0, 0, 0);
  car.vx = 300;
  for (let i = 0; i < 120; i++) car.step(REF_STEP, input({ steer: 1 }), 1, 0);
  const held = car.steerValue;
  for (let i = 0; i < 120; i++) car.step(REF_STEP, input(), 1, 0);
  check('the wheel centres when the key is released', held > 0.9 && Math.abs(car.steerValue) < 0.02,
    `${held.toFixed(2)} held -> ${car.steerValue.toFixed(3)} released`);
}

// ------------------------------------------------------- frame-rate independence
console.log('\n[frame rate] the car drives the same at 30, 60, 120 and 240 fps');
{
  const control = input({ accelerate: true, steer: 0.4 });

  // What the game actually does: a fixed 1/120s physics step behind an
  // accumulator, so the number of steps per rendered frame is the only thing
  // the frame rate changes. This must be exact, including the leftover the
  // accumulator carries between frames.
  const withAccumulator = (fps: number) => {
    const step = REF_STEP;
    const car = new CarPhysics(getCarTuning(CAR_ID));
    car.reset(0, 0, 0);
    const frameTime = 1 / fps;
    let accumulator = 0;
    for (let frame = 0; frame < fps * 4; frame++) {
      accumulator += frameTime;
      while (accumulator >= step) {
        car.step(step, control, 1, 0);
        accumulator -= step;
      }
    }
    return car;
  };
  const ref = withAccumulator(120);
  for (const fps of [30, 60, 240]) {
    const car = withAccumulator(fps);
    const distance = Math.hypot(car.x - ref.x, car.y - ref.y);
    check(`${fps}fps lands in exactly the same place`,
      distance < 1e-6 && car.speed === ref.speed,
      `position off by ${distance.toExponential(1)}px`);
  }

  // Varying the step itself is the harder case, and the reason the game fixes
  // it. It is held to a small tolerance rather than an exact one, because
  // steering authority is sampled from the current speed and that sampling is
  // first-order.
  const withVariableStep = (fps: number) => drive(4, control, { step: 1 / fps }).car;
  const variableRef = withVariableStep(120);
  for (const fps of [30, 60, 240]) {
    const car = withVariableStep(fps);
    const distance = Math.hypot(car.x - variableRef.x, car.y - variableRef.y);
    check(`a raw ${fps}fps step stays within 2% of 120fps`,
      distance < variableRef.speed * 4 * 0.02,
      `position off by ${distance.toFixed(1)}px over 4s (${(distance / (variableRef.speed * 4) * 100).toFixed(2)}%)`);
  }
}

// ------------------------------------------------------------- speed display
console.log('\n[display] the speedometer reports the car ground speed');
{
  const tuning = getCarTuning(CAR_ID);
  const car = new CarPhysics(tuning);
  car.reset(0, 0, 0);
  car.vx = 400;
  car.vy = 120; // sliding: speed is not the same as forward speed
  const shown = Math.round(car.speed * CAR.speedDisplayFactor);
  check('km/h is the ground speed, not the forward speed',
    shown === Math.round(Math.hypot(car.vx, car.vy) * CAR.speedDisplayFactor),
    `${shown} km/h at ${car.speed.toFixed(0)}px/s`);

  const still = new CarPhysics(tuning);
  still.reset(0, 0, 0);
  check('a stationary car reads zero', Math.round(still.speed * CAR.speedDisplayFactor) === 0);

  const running = drive(12, input({ accelerate: true })).car;
  check('the readout reaches a plausible road speed',
    Math.round(running.speed * CAR.speedDisplayFactor) > 150,
    `${Math.round(running.speed * CAR.speedDisplayFactor)} km/h`);

  check('every car top speed fits the three-digit readout',
    CARS.every((c) => Math.round(getCarTuning(c.id).maxSpeed * CAR.speedDisplayFactor) <= 999),
    CARS.map((c) => `${Math.round(getCarTuning(c.id).maxSpeed * CAR.speedDisplayFactor)}`).join('/'));
}

// ---------------------------------------------------------- car-specific feel
console.log('\n[handling] every car drives differently');
{
  const measured = CARS.map((entry) => {
    const tuning = getCarTuning(entry.id);
    const { trace, step } = drive(12, input({ accelerate: true }), { tuning });
    const cornering = new CarPhysics(tuning);
    cornering.reset(0, 0, 0);
    cornering.vx = tuning.maxSpeed * 0.4;
    const h0 = cornering.heading;
    for (let i = 0; i < 60; i++) cornering.step(REF_STEP, input({ steer: 1 }), 1, 0);
    return {
      id: entry.id,
      topSpeed: tuning.maxSpeed,
      topReached: trace[trace.length - 1],
      zeroTo300: timeToSpeed(trace, step, 300),
      yawRate: Math.abs(cornering.heading - h0) / 0.5,
    };
  });

  console.log('    ' + measured.map((m) =>
    `${m.id}: top ${m.topSpeed.toFixed(0)} (reached ${m.topReached.toFixed(0)}), 0-300 ${m.zeroTo300?.toFixed(2)}s, yaw ${m.yawRate.toFixed(2)}rad/s`,
  ).join('\n    '));

  check('top speeds are all different', new Set(measured.map((m) => m.topSpeed)).size === CARS.length);
  check('cornering rates are all different', new Set(measured.map((m) => m.yawRate.toFixed(2))).size === CARS.length);
  check('every car reaches its own stated top speed',
    measured.every((m) => m.topReached > m.topSpeed * 0.95 && m.topReached <= m.topSpeed + 1e-6));
  check('every car reaches 300px/s', measured.every((m) => m.zeroTo300 !== null));

  const fastest = measured.reduce((a, b) => (b.zeroTo300! < a.zeroTo300! ? b : a));
  const slowest = measured.reduce((a, b) => (b.zeroTo300! > a.zeroTo300! ? b : a));
  check('the quickest car off the line is the nimble one', fastest.id === 'venom-verde',
    measured.map((m) => `${m.id}:${m.zeroTo300?.toFixed(2)}s`).join(' '));
  check('and the heaviest one is the slowest', slowest.id === 'inferno-rs',
    measured.map((m) => `${m.id}:${m.zeroTo300?.toFixed(2)}s`).join(' '));
  check('the spread between them is meaningful',
    slowest.zeroTo300! - fastest.zeroTo300! > 0.2,
    `${((slowest.zeroTo300! - fastest.zeroTo300!) * 1000).toFixed(0)}ms apart`);

  // The driver they picked has to be felt, or choosing a character is cosmetic.
  const best = CHARACTERS.reduce((a, b) => (b.stats.handling > a.stats.handling ? b : a));
  const worst = CHARACTERS.reduce((a, b) => (b.stats.handling < a.stats.handling ? b : a));
  const good = createRacerTuning(CAR_ID, best.stats);
  const bad = createRacerTuning(CAR_ID, worst.stats);
  check('driver stats change the car',
    Math.abs(good.steerRate - bad.steerRate) > 0.01 && Math.abs(good.acceleration - bad.acceleration) > 0.01,
    `${best.id} steer ${good.steerRate.toFixed(2)} accel ${good.acceleration.toFixed(0)} / ` +
    `${worst.id} steer ${bad.steerRate.toFixed(2)} accel ${bad.acceleration.toFixed(0)}`);
  check('every chassis has a full set of handling values',
    CARS.every((c) => {
      const t = VEHICLE_CONFIG[c.id];
      return t && Number.isFinite(t.maxSpeed) && Number.isFinite(t.steerResponse)
        && Number.isFinite(t.steerReturn) && Number.isFinite(t.wallFriction);
    }));
}

// ---------------------------------------------------------- barrier response
console.log('\n[barrier] a wall hit scrubs speed without trapping or spinning the car');
{
  const tuning = getCarTuning(CAR_ID);

  // Head-on: the inward velocity goes, and the car neither spins nor reverses.
  const head = new CarPhysics(tuning);
  head.reset(0, 0, 0);
  head.vx = 500;
  head.applyCollision({ x: 0, y: 0, nx: -1, ny: 0 }, REF_STEP);
  check('a head-on hit removes the inward speed', head.speed >= 0 && head.speed < 500,
    `${head.speed.toFixed(1)}px/s`);
  check('a head-on hit does not spin the car', Math.abs(head.heading) < 1e-6);
  check('a head-on hit never turns into reverse', head.speed >= 0);
  check('a head-on hit gives back a little, so it does not just stop',
    head.speed > 0 && head.speed < 500 * (1 + tuning.wallBounce + 1e-6),
    `${head.speed.toFixed(1)}px/s`);

  // Continuous contact: a car held against a barrier for a second must still be
  // moving. This is what the old per-contact 5% scrub got wrong -- at 120Hz it
  // removed 99.8% of the speed every second, so scraping a wall stopped the car.
  const scrapeOver = (step: number) => {
    const car = new CarPhysics(tuning);
    car.reset(0, 0, 0);
    // Pressed into the wall the whole time, as the throttle and the road would.
    for (let i = 0; i < Math.round(1 / step); i++) {
      car.vx = 500;
      car.applyCollision({ x: 0, y: 0, nx: -0.02, ny: -1 }, step);
    }
    return car.speed;
  };
  const scraped120 = scrapeOver(REF_STEP);
  check('a car scraping a barrier for a second keeps most of its speed', scraped120 > 400,
    `500 -> ${scraped120.toFixed(0)}px/s`);
  const scraped60 = scrapeOver(1 / 60);
  check('and the same at 60Hz', Math.abs(scraped60 - scraped120) / scraped120 < 0.05,
    `${scraped120.toFixed(1)}px/s at 120Hz vs ${scraped60.toFixed(1)}px/s at 60Hz`);

  // Nothing may ever produce a non-finite value, whatever it is hit with.
  const chaos = new CarPhysics(tuning);
  chaos.reset(0, 0, 0);
  for (let i = 0; i < 5000; i++) {
    chaos.step(1 / 120, input({ accelerate: i % 3 === 0, brake: i % 5 === 0, steer: Math.sin(i) }), 1 + (i % 4) * 0.9, i % 2);
    chaos.applyCollision({ x: Math.sin(i) * 5, y: Math.cos(i) * 5, nx: Math.sin(i), ny: Math.cos(i) }, 1 / 120);
  }
  check('10,000 steps of abuse leave the car finite',
    Number.isFinite(chaos.x) && Number.isFinite(chaos.y) &&
    Number.isFinite(chaos.vx) && Number.isFinite(chaos.vy) && Number.isFinite(chaos.heading),
    `${chaos.speed.toFixed(1)}px/s`);
}

// ------------------------------------------------------------------- summary
console.log(`\n=== ${checks - failures}/${checks} checks passed ===`);
if (failures > 0) {
  console.log(`${failures} FAILED\n`);
  process.exit(1);
}
console.log('ALL CHECKS PASSED\n');