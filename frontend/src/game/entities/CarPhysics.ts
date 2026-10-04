import { createCarTuning, type CarTuning } from '../config/carTuning';

export interface InputState {
  accelerate: boolean;
  brake: boolean;
  /** -1 = left, 0 = straight, 1 = right */
  steer: number;
}

export const NO_INPUT: InputState = { accelerate: false, brake: false, steer: 0 };

export interface CollisionResult {
  x: number;
  y: number;
  /** Unit normal pointing back toward the road. */
  nx: number;
  ny: number;
}

const approach = (value: number, target: number, maxDelta: number): number =>
  value < target ? Math.min(value + maxDelta, target) : Math.max(value - maxDelta, target);

/**
 * Pure arcade car dynamics (no Phaser). Heading 0 faces +x; y grows downward.
 * The car keeps its momentum: steering rotates the body, and tyre grip then
 * gradually swings the velocity toward the new heading.
 */
export class CarPhysics {
  x = 0;
  y = 0;
  heading = 0;
  vx = 0;
  vy = 0;
  /** Smoothed steering wheel position, -1..1. */
  steerValue = 0;

  constructor(readonly tuning: CarTuning = createCarTuning()) {}

  reset(x: number, y: number, heading: number): void {
    this.x = x;
    this.y = y;
    this.heading = heading;
    this.vx = 0;
    this.vy = 0;
    this.steerValue = 0;
  }

  /** Signed speed along the car's facing direction (px/s). */
  get forwardSpeed(): number {
    return this.vx * Math.cos(this.heading) + this.vy * Math.sin(this.heading);
  }

  get speed(): number {
    return Math.hypot(this.vx, this.vy);
  }

  step(dt: number, input: InputState, dragMultiplier: number = 1): void {
    const t = this.tuning;

    // 1. Wheel position moves gradually toward the key, never snaps.
    const rate = input.steer === 0 ? t.steerReturn : t.steerResponse;
    this.steerValue = approach(this.steerValue, input.steer, rate * dt);

    // 2. Yaw: no turning on the spot, best near peak speed, weaker flat-out.
    const fwd0 = this.forwardSpeed;
    const abs0 = Math.abs(fwd0);
    const ramp = Math.min(abs0 / t.steerPeakSpeed, 1);
    const topFade = Math.max(0, (abs0 - t.steerPeakSpeed) / (t.maxSpeed - t.steerPeakSpeed));
    const authority = ramp * (1 - t.highSpeedSteerLoss * Math.min(topFade, 1));
    this.heading += this.steerValue * t.maxSteerRate * authority * (fwd0 >= 0 ? 1 : -1) * dt;

    // 3. Split velocity into the car's current forward / sideways axes.
    const fx = Math.cos(this.heading);
    const fy = Math.sin(this.heading);
    const rx = -fy;
    const ry = fx;
    let fwd = this.vx * fx + this.vy * fy;
    let lat = this.vx * rx + this.vy * ry;

    // 4. Pedals. Brake wins if both are held.
    const throttle = input.accelerate && !input.brake;
    if (throttle) {
      if (fwd < 0) {
        fwd += t.brakeDeceleration * dt; // stop rolling backwards first
      } else {
        const ratio = Math.min(fwd / t.maxSpeed, 1);
        // Off-road cuts max acceleration
        fwd += t.acceleration * Math.max(0.08, 1 - ratio * ratio) * dt * (1 / dragMultiplier);
      }
    } else if (input.brake) {
      if (fwd > t.reverseSwitchSpeed) {
        fwd = Math.max(0, fwd - t.brakeDeceleration * dt); // brake first
      } else {
        fwd -= t.reverseAcceleration * dt; // slow enough: reverse
      }
    } else {
      const decel = (t.coastFriction + t.drag * Math.abs(fwd)) * dragMultiplier * dt;
      fwd = Math.abs(fwd) <= decel ? 0 : fwd - Math.sign(fwd) * decel;
    }
    
    // Also apply drag multiplier to max speed if it's very high (like grass)
    const effectiveMaxSpeed = t.maxSpeed / Math.sqrt(dragMultiplier);
    fwd = Math.max(-t.maxReverseSpeed, Math.min(effectiveMaxSpeed, fwd));

    // 5. Tyre grip bleeds off sideways sliding.
    lat *= Math.exp(-t.lateralGrip * dt);

    this.vx = fx * fwd + rx * lat;
    this.vy = fy * fwd + ry * lat;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
  }

  /** Move to the corrected position; head-on hits lose speed, sliding barely does. */
  applyCollision(hit: CollisionResult): void {
    this.x = hit.x;
    this.y = hit.y;
    const vn = this.vx * hit.nx + this.vy * hit.ny;
    if (vn >= 0) return;
    const impact = -vn;
    const speed = Math.max(this.speed, 1);
    const keep = 1 - this.tuning.wallScrub * (impact / speed);
    const tx = this.vx - vn * hit.nx;
    const ty = this.vy - vn * hit.ny;
    this.vx = tx * keep + hit.nx * impact * this.tuning.wallBounce;
    this.vy = ty * keep + hit.ny * impact * this.tuning.wallBounce;
  }
}
