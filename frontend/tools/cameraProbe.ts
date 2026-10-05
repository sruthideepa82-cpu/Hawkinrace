/**
 * Headless camera verification harness.
 *
 * Flies the real CameraRig against the real CarPhysics with a stub camera that
 * reproduces Phaser's rotated-camera projection, so the two complaints that
 * prompted the rig's rewrite can be asserted instead of eyeballed:
 *
 *   - the camera used to sit a speed-scaled distance *ahead* of the car, so it
 *     pulled away as you accelerated and swung wide when you turned, which is
 *     how the car ended up hidden at the edge of the screen;
 *   - the world used to be locked 1:1 to the car's heading, so every steering
 *     input spun the whole background.
 *
 * The rig is deliberately Phaser-free at runtime, which is what makes this
 * possible. Run with:
 *   node --experimental-transform-types --import ./tools/register.mjs \
 *     tools/cameraProbe.ts
 */
import { CameraRig, type CameraTarget } from '../src/game/entities/CameraRig';
import { CarPhysics, type InputState } from '../src/game/entities/CarPhysics';
import { getCarTuning, type CarTuning } from '../src/game/config/carTuning';
import { CAMERA } from '../src/game/config/GameConfig';
import { angleDelta, clamp } from '../src/game/utils/geometry';

const STEP = 1 / 120;
const WIDTH = 1280;
const HEIGHT = 720;
const DEG = Math.PI / 180;
/** Duplicated from the rig; the probe needs it to measure the rotation lag. */
const FORWARD_TO_SCREEN_UP = -Math.PI / 2;

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

/**
 * A camera that projects world points the way Phaser's rotated camera does, so
 * "is the car on screen" can be answered in pixels.
 */
class StubCamera implements CameraTarget {
  readonly width = WIDTH;
  readonly height = HEIGHT;
  scrollX = 0;
  scrollY = 0;
  zoom = 1;
  rotation = 0;

  setZoom(value: number): this {
    this.zoom = value;
    return this;
  }

  setRotation(radians: number): this {
    this.rotation = radians;
    return this;
  }

  centerOn(x: number, y: number): this {
    this.scrollX = x - this.width / 2;
    this.scrollY = y - this.height / 2;
    return this;
  }

  /** The probe steps at a fixed rate and does not care about the zoom blend. */
  zoomTo(zoom: number): this {
    this.zoom = zoom;
    return this;
  }

  shake(): this {
    return this;
  }

  /** Where a world point lands on screen, in pixels. */
  screen(x: number, y: number): { x: number; y: number } {
    const midX = this.scrollX + this.width / 2;
    const midY = this.scrollY + this.height / 2;
    const dx = x - midX;
    const dy = y - midY;
    const c = Math.cos(this.rotation);
    const s = Math.sin(this.rotation);
    return {
      x: this.width / 2 + this.zoom * (dx * c - dy * s),
      y: this.height / 2 + this.zoom * (dx * s + dy * c),
    };
  }
}

interface Frame {
  screenX: number;
  screenY: number;
  /** Signed speed of the car at the frame (px/s). */
  speed: number;
  /** How fast the camera rotation moved this frame (rad/s). */
  rotRate: number;
  /** Degrees the world trails the car's heading by. */
  deviationDeg: number;
}

const noInput: InputState = { accelerate: false, brake: false, steer: 0, nitro: false };
const throttle: InputState = { accelerate: true, brake: false, steer: 0, nitro: false };
const steer = (s: number): InputState => ({ accelerate: true, brake: false, steer: s, nitro: false });

/** Drives the car and the rig together for `seconds`, sampling every frame. */
function fly(opts: {
  tuning?: CarTuning;
  view?: number;
  seconds: number;
  input: (t: number, car: CarPhysics) => InputState;
  twist?: (t: number) => number;
}): { frames: Frame[]; cam: StubCamera; car: CarPhysics; rig: CameraRig } {
  const cam = new StubCamera();
  const rig = new CameraRig(cam);
  const car = new CarPhysics(opts.tuning ?? getCarTuning('falcon-gt'));
  car.reset(0, 0, 0);
  for (let i = 0; i < (opts.view ?? 0); i++) rig.cycle();
  rig.snap(car);

  const frames: Frame[] = [];
  const steps = Math.round(opts.seconds / STEP);
  let prevRotation = rig.screenRotation;
  for (let i = 0; i < steps; i++) {
    const t = i * STEP;
    car.step(STEP, opts.input(t, car), 1, 0);
    rig.update(car, car.speed, STEP * 1000, opts.twist?.(t) ?? 0);

    const ideal = FORWARD_TO_SCREEN_UP - car.heading;
    const at = cam.screen(car.x, car.y);
    frames.push({
      screenX: at.x,
      screenY: at.y,
      speed: car.speed,
      rotRate: Math.abs(angleDelta(prevRotation, rig.screenRotation)) / STEP,
      deviationDeg: Math.abs(angleDelta(rig.screenRotation, ideal)) / DEG,
    });
    prevRotation = rig.screenRotation;
  }
  return { frames, cam, car, rig };
}

/** Pixels the car's centre must stay inside for the car to be plainly visible. */
const SAFE = { left: 80, right: WIDTH - 80, top: 60, bottom: HEIGHT - 60 };

function boxViolations(frames: readonly Frame[]): string[] {
  return frames
    .filter((f) => f.screenX < SAFE.left || f.screenX > SAFE.right || f.screenY < SAFE.top || f.screenY > SAFE.bottom)
    .map((f) => `(${f.screenX.toFixed(0)},${f.screenY.toFixed(0)})`);
}

const worst = (frames: readonly Frame[], pick: (f: Frame) => number): number =>
  frames.reduce((m, f) => Math.max(m, pick(f)), 0);

// ---------------------------------------------------------------- the anchor
console.log('\n[anchor] the car holds its spot on screen as it accelerates');
{
  const { frames } = fly({ tuning: getCarTuning('hawk-xr'), seconds: 9, input: () => throttle });
  const expectedY = HEIGHT / 2 + (CAMERA.views[0].anchor * HEIGHT) / 2;
  const last = frames[frames.length - 1];
  const ys = frames.map((f) => f.screenY);
  const xs = frames.map((f) => f.screenX);

  check('car reaches top speed', last.speed > CAMERA.speedThreshold, `${last.speed.toFixed(0)}px/s`);
  check('car settles on its screen anchor',
    Math.abs(last.screenY - expectedY) < 8,
    `y ${last.screenY.toFixed(1)} vs ${expectedY.toFixed(1)}`);
  // The old rig placed the camera further ahead the faster you drove, which slid
  // the car down the screen (and eventually off it). The spot must not drift.
  check('screen spot does not creep with speed',
    Math.max(...ys) - Math.min(...ys) < 10,
    `band ${(Math.max(...ys) - Math.min(...ys)).toFixed(1)}px`);
  check('car stays centred while driving straight',
    Math.max(...xs.map((x) => Math.abs(x - WIDTH / 2))) < 10,
    `worst ${worst(frames, (f) => Math.abs(f.screenX - WIDTH / 2)).toFixed(1)}px`);
}

// ------------------------------------------------------------- hard cornering
console.log('\n[cornering] the car stays in frame and the world stays readable');
{
  const tunings: [string, CarTuning][] = [
    ['falcon-gt', getCarTuning('falcon-gt')],
    ['night-runner', getCarTuning('night-runner')],
    ['hawk-xr', getCarTuning('hawk-xr')],
  ];
  for (const [name, tuning] of tunings) {
    // Flat out, then slam between full left and full right, then brake.
    const { frames } = fly({
      tuning,
      seconds: 12,
      input: (t) => {
        if (t < 4) return throttle;
        if (t < 10) return steer(Math.sin(t * 4) > 0 ? 1 : -1);
        return { accelerate: false, brake: true, steer: 0, nitro: false };
      },
    });
    const outside = boxViolations(frames);
    check(`${name}: car never leaves the safe area`, outside.length === 0,
      `${outside.length} frames, first ${outside[0] ?? '-'}`);
    check(`${name}: world never rotates faster than the cap`,
      worst(frames, (f) => f.rotRate) <= CAMERA.maxRotateSpeed + 0.05,
      `peak ${worst(frames, (f) => f.rotRate).toFixed(2)} vs ${CAMERA.maxRotateSpeed}`);
  }
}

// ------------------------------------------------------------------- the spin
console.log('\n[spin] a full-lock donut does not whip the view');
{
  const { frames } = fly({
    tuning: getCarTuning('night-runner'),
    seconds: 10,
    input: (t) => steer(1, t < 1),
  });
  const outside = boxViolations(frames);
  check('car never leaves the safe area while spinning', outside.length === 0,
    `${outside.length} frames`);
  check('spin still respects the rotation cap',
    worst(frames, (f) => f.rotRate) <= CAMERA.maxRotateSpeed + 0.05,
    `peak ${worst(frames, (f) => f.rotRate).toFixed(2)}`);
  // The camera may lag the car, but it must keep it in view rather than letting
  // it drift off behind the rotation.
  check('world never trails the car by a wild angle',
    worst(frames, (f) => f.deviationDeg) < 180,
    `peak ${worst(frames, (f) => f.deviationDeg).toFixed(0)}deg`);
}

// --------------------------------------------------------------- the dead zone
console.log('\n[dead zone] small corrections leave the background perfectly still');
{
  const cam = new StubCamera();
  const rig = new CameraRig(cam);
  const car = new CarPhysics(getCarTuning('falcon-gt'));
  car.reset(0, 0, 0);
  rig.snap(car);

  const dead = CAMERA.views[0].angleDeadZoneDeg;
  let movedInsideZone = 0;
  for (const deg of [1, 3, 6, dead - 0.5]) {
    car.heading = deg * DEG;
    const before = rig.screenRotation;
    rig.update(car, 0, STEP * 1000, 0);
    if (Math.abs(angleDelta(before, rig.screenRotation)) > 1e-9) movedInsideZone++;
  }
  check('heading change inside the dead zone does not move the world', movedInsideZone === 0,
    `${movedInsideZone} of 4 leaked`);

  // Just past the zone the world must ease, not jump: one frame of rotation has
  // to be a small fraction of the excess, not all of it.
  car.heading = (dead + 8) * DEG;
  const before = rig.screenRotation;
  rig.update(car, 0, STEP * 1000, 0);
  const stepDeg = Math.abs(angleDelta(before, rig.screenRotation)) / DEG;
  check('crossing the dead zone eases rather than snapping',
    stepDeg > 0 && stepDeg < 4,
    `${stepDeg.toFixed(2)}deg in one frame`);
}

// -------------------------------------------------------------- anti-gravity
console.log('\n[twist] the anti-gravity roll is rate limited too');
{
  const { frames } = fly({
    seconds: 6,
    input: () => throttle,
    // A hairpin of a roll: swings the world through a full half turn.
    twist: (t) => clamp((t - 1) * (Math.PI / 2), 0, Math.PI),
  });
  check('anti-gravity twist never exceeds the rotation cap',
    worst(frames, (f) => f.rotRate) <= CAMERA.maxRotateSpeed + 0.05,
    `peak ${worst(frames, (f) => f.rotRate).toFixed(2)}`);
  const outside = boxViolations(frames);
  check('car stays in frame through the twist', outside.length === 0, `${outside.length} frames`);
}

// --------------------------------------------------------------- the presets
console.log('\n[views] cycling keeps each preset behaving');
{
  const cam = new StubCamera();
  const rig = new CameraRig(cam);
  const car = new CarPhysics(getCarTuning('falcon-gt'));
  car.reset(0, 0, 0);
  rig.snap(car);
  check('starts on CHASE', rig.viewName === 'CHASE', rig.viewName);

  // MAP: no rotation at all, and the car centred rather than low in the frame.
  rig.cycle();
  check('cycles to HOOD', rig.viewName === 'HOOD', rig.viewName);
  rig.cycle();
  check('cycles to MAP', rig.viewName === 'MAP', rig.viewName);

  car.heading = 1.2;
  for (let i = 0; i < 240; i++) rig.update(car, 0, STEP * 1000, 0);
  const at = cam.screen(car.x, car.y);
  check('MAP ignores the car heading', Math.abs(rig.screenRotation) < 1e-9,
    `${rig.screenRotation}`);
  check('MAP centres the car', Math.abs(at.x - WIDTH / 2) < 1 && Math.abs(at.y - HEIGHT / 2) < 1,
    `(${at.x.toFixed(1)},${at.y.toFixed(1)})`);

  // And back round to CHASE, which should re-align the world with the car.
  rig.cycle();
  check('cycles back to CHASE', rig.viewName === 'CHASE', rig.viewName);
  for (let i = 0; i < 600; i++) rig.update(car, 0, STEP * 1000, 0);
  const dev = Math.abs(angleDelta(rig.screenRotation, FORWARD_TO_SCREEN_UP - car.heading)) / DEG;
  check('CHASE realigns the world with the car', dev < CAMERA.views[0].angleDeadZoneDeg + 1,
    `${dev.toFixed(1)}deg`);
}

// ------------------------------------------------------------------- summary
console.log(`\n=== ${checks - failures}/${checks} checks passed ===`);
if (failures > 0) {
  console.log(`${failures} FAILED\n`);
  process.exit(1);
}
console.log('ALL CHECKS PASSED\n');
