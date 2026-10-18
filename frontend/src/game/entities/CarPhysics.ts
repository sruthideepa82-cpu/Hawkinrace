import type { CarTuning } from '../config/carTuning';
import { angleDelta, clamp, wrapAngle } from '../utils/geometry';

export interface InputState {
  accelerate: boolean;
  brake: boolean;
  /** -1 = left, 0 = straight, 1 = right */
  steer: number;
  /** True while the driver wants the nitro boost. */
  nitro: boolean;
  /** True when the driver activates the supernatural ability. */
  ability: boolean;
}

export const NO_INPUT: InputState = { accelerate: false, brake: false, steer: 0, nitro: false, ability: false };

export interface CollisionResult {
  x: number;
  y: number;
  /** Unit normal pointing back toward the road. */
  nx: number;
  ny: number;
}

const approach = (value: number, target: number, maxDelta: number): number =>
  value < target ? Math.min(value + maxDelta, target) : Math.max(value - maxDelta, target);

const clamp01 = (value: number): number => (value < 0 ? 0 : value > 1 ? 1 : value);

/**
 * Pure arcade car dynamics (no Phaser). Heading 0 faces +x; y grows downward.
 * The car keeps its momentum: steering rotates the body, and tyre grip then
 * gradually swings the velocity toward the new heading.
 *
 * Every handling number comes from `CarTuning`, and every term is integrated
 * against `dt` (or exponentially, which is exact for any `dt`), so the car
 * behaves identically at 30, 60 or 144 fps.
 */
export class CarPhysics {
  x = 0;
  y = 0;
  heading = 0;
  vx = 0;
  vy = 0;
  /** Smoothed steering wheel position, -1..1. */
  steerValue = 0;
  /**
   * Which way along a barrier the wall assist last chose to send the car
   * (+1 / -1). Latched rather than re-decided every frame: see `alignToWall`.
   */
  private wallDir: 1 | -1 = 1;

  constructor(readonly tuning: CarTuning) {}

  reset(x: number, y: number, heading: number): void {
    this.x = x;
    this.y = y;
    this.heading = heading;
    this.vx = 0;
    this.vy = 0;
    this.steerValue = 0;
    this.wallDir = 1;
  }

  /** Signed speed along the car's facing direction (px/s). */
  get forwardSpeed(): number {
    return this.vx * Math.cos(this.heading) + this.vy * Math.sin(this.heading);
  }

  get speed(): number {
    return Math.hypot(this.vx, this.vy);
  }

  /**
   * @param dragMultiplier surface penalty (1 = road).
   * @param nitro 0..1 how hard the boost is currently applied.
   * @param abilityBoost additional multiplier from supernatural ability.
   */
  step(dt: number, input: InputState, dragMultiplier: number = 1, nitro: number = 0, abilityBoost: number = 1): void {
    const t = this.tuning;

    // 1. Steering smoothing. The wheel turns toward the key at one rate and
    //    self-centres faster than that, so releasing the key straightens the car
    //    rather than leaving it holding the lock it had on the last input.
    const steerTarget = clamp(input.steer, -1, 1);
    const returning = Math.abs(steerTarget) < Math.abs(this.steerValue);
    const steerRateLimit = returning ? t.steerReturn : t.steerResponse;
    this.steerValue = approach(this.steerValue, steerTarget, steerRateLimit * dt);

    // 2. Speed-based steering
    const fwd0 = this.forwardSpeed;
    const abs0 = Math.abs(fwd0);

    // Weak at a standstill, full authority through the mid range, faded at top
    // speed. The low-speed floor matters: a car pressed nose-first into a wall has
    // all of its speed killed, and without any authority it could never rotate off
    // the wall and would be stuck for good.
    const peakSpeed = t.maxSpeed * t.steerPeakSpeedRatio;
    let steerAuthority = 0;
    if (abs0 > 0.5) {
      const lowSpeedRamp = t.lowSpeedSteerFloor + (1 - t.lowSpeedSteerFloor) * Math.min(1, abs0 / peakSpeed);
      const topFade = abs0 <= peakSpeed
        ? 0
        : t.highSpeedSteerLoss * Math.min(1, (abs0 - peakSpeed) / Math.max(1e-6, t.maxSpeed - peakSpeed));
      steerAuthority = lowSpeedRamp * (1 - topFade);
    }

    // Reverse steering flips direction naturally since the car moves backwards
    const steerDir = fwd0 >= 0 ? 1 : -1;
    this.heading = wrapAngle(
      this.heading + this.steerValue * t.steerRate * steerAuthority * steerDir * dt,
    );

    // 3. Split velocity into forward / lateral
    const fx = Math.cos(this.heading);
    const fy = Math.sin(this.heading);
    const rx = -fy;
    const ry = fx;
    let fwd = this.vx * fx + this.vy * fy;
    let lat = this.vx * rx + this.vy * ry;

    // 4. Acceleration & braking
    if (input.accelerate && !input.brake) {
      if (fwd < 0) {
        // Throttle while rolling backwards brakes first, exactly like the brake
        // pedal does. Reversing is never something a single pedal does to a
        // moving car: it has to be asked for, or driven out of.
        fwd = Math.min(0, fwd + t.brakeForce * dt);
      } else {
        // Progressive acceleration (weaker near max speed)
        const ratio = Math.min(fwd / (t.maxSpeed * abilityBoost), 1);
        const boost = 1 + (t.nitroAccelBoost - 1) * clamp01(nitro);
        fwd += t.acceleration * boost * abilityBoost * (1 - ratio * ratio * 0.8) * dt / dragMultiplier;
      }
    } else if (input.brake) {
      // Strong intentional braking, all the way down to a standstill.
      if (fwd > t.reverseSwitchSpeed) {
        fwd = Math.max(0, fwd - t.brakeForce * dt);
      } else {
        // Stopped (or nearly): the pedal now asks for reverse. Acceleration
        // tapers as the reverse cap approaches, so reverse has a top speed
        // rather than a step change into it.
        const room = clamp01(1 - -fwd / t.maxReverseSpeed);
        fwd -= t.reverseAcceleration * (0.35 + 0.65 * room) * dt;
      }
    } else {
      // Coasting (Momentum)
      const decel = (t.coastFriction + t.drag * Math.abs(fwd)) * dragMultiplier * dt;
      if (Math.abs(fwd) <= decel) {
        fwd = 0;
      } else {
        fwd -= Math.sign(fwd) * decel;
      }
    }

    // Off-road affects top speed too; nitro raises the ceiling.
    const nitroSpeed = 1 + (t.nitroSpeedBoost - 1) * clamp01(nitro);
    const effectiveMaxSpeed = (t.maxSpeed * nitroSpeed * abilityBoost) / Math.sqrt(dragMultiplier);
    fwd = clamp(fwd, -t.maxReverseSpeed, effectiveMaxSpeed);

    // 5. Drift / Lateral sliding
    // Lateral grip bleeds off sideways movement over time. The exponential is
    // exact for any dt, so the slide looks the same at every frame rate.
    lat *= Math.exp(-t.lateralGrip * dt);

    // Apply back to global velocity
    this.vx = fx * fwd + rx * lat;
    this.vy = fy * fwd + ry * lat;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
  }

  /**
   * Apply hard boundary collision.
   *
   * The car is seated exactly on the barrier and the velocity component driving
   * it into the wall is removed, so it slides along the barrier instead of
   * bouncing off it. `dt` is required because both the friction scrub and the
   * bounce are rates: applied per call they would triple in strength every time
   * the frame rate doubled, and a car scraping along a wall would stop dead
   * rather than lose a little speed.
   */
  applyCollision(hit: CollisionResult, dt: number): void {
    // Prevent moving into the boundary
    this.x = hit.x;
    this.y = hit.y;

    // Normal component of the velocity, against the barrier.
    const vn = this.vx * hit.nx + this.vy * hit.ny;
    if (vn >= 0) return; // Moving away from the wall

    const t = this.tuning;
    // Remove the component driving into the barrier and return a little of it,
    // so a square hit nudges the car back off the wall while a glancing one
    // simply slides.
    const bounce = 1 + t.wallBounce;
    this.vx -= hit.nx * vn * bounce;
    this.vy -= hit.ny * vn * bounce;

    // Friction scrub from the wall hit, as a per-second rate.
    const scrub = Math.pow(t.wallFriction, Math.max(0, dt));
    this.vx *= scrub;
    this.vy *= scrub;
  }

  /**
   * Wall assist. Eases the nose toward the barrier the car is leaning on, so a
   * car held against the edge under power steers itself straight and slides free
   * instead of grinding its nose into the wall. `nx`/`ny` is the barrier normal,
   * pointing back toward the road. Only the heading moves, never the speed.
   *
   * Which way ALONG the barrier to go is latched rather than chosen fresh each
   * frame. The obvious test -- "take whichever direction is within 90 degrees
   * of the nose" -- is exactly wrong for a car sitting square against a wall:
   * the nose is then on the boundary of both answers, the sampled normal jitters
   * by a fraction of a degree between two centreline points, and the car flips
   * its target 180 degrees every frame and never rotates at all. A dead band
   * around square means the chosen direction only changes once the car has
   * actually started to go that way.
   */
  alignToWall(nx: number, ny: number, rate: number, dt: number): void {
    // The barrier runs perpendicular to its normal.
    const ax = -ny;
    const ay = nx;
    const along = Math.cos(this.heading) * ax + Math.sin(this.heading) * ay;
    const COMMITTED = 0.35; // ~20 degrees of lean before the choice may change
    if (along > COMMITTED) this.wallDir = 1;
    else if (along < -COMMITTED) this.wallDir = -1;

    const target = Math.atan2(ay * this.wallDir, ax * this.wallDir);
    this.heading = wrapAngle(this.heading + clamp(angleDelta(this.heading, target), -rate * dt, rate * dt));
  }
}