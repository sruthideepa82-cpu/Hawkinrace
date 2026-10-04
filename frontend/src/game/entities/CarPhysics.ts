import type { CarTuning } from '../config/carTuning';

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

  constructor(readonly tuning: CarTuning) {}

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

    // 1. Steering smoothing
    const steerTarget = input.steer;
    const steerRateLimit = 4.0; // How fast wheel turns
    this.steerValue = approach(this.steerValue, steerTarget, steerRateLimit * dt);

    // 2. Speed-based Steering
    const fwd0 = this.forwardSpeed;
    const abs0 = Math.abs(fwd0);
    
    // Steering is weak at low speeds, responsive at mid, and requires more control at top speed
    let steerAuthority = 0;
    if (abs0 > 5) {
      const peakSpeed = t.maxSpeed * 0.4;
      if (abs0 <= peakSpeed) {
        steerAuthority = abs0 / peakSpeed; // Ramps up
      } else {
        // Slowly fades out at very high speeds, keeping a minimum authority of 50%
        steerAuthority = 1.0 - 0.5 * ((abs0 - peakSpeed) / (t.maxSpeed - peakSpeed));
      }
    }
    
    // Reverse steering flips direction naturally since the car moves backwards
    const steerDir = fwd0 >= 0 ? 1 : -1;
    this.heading += this.steerValue * t.steerRate * steerAuthority * steerDir * dt;

    // 3. Split velocity into forward / lateral
    const fx = Math.cos(this.heading);
    const fy = Math.sin(this.heading);
    const rx = -fy;
    const ry = fx;
    let fwd = this.vx * fx + this.vy * fy;
    let lat = this.vx * rx + this.vy * ry;

    // 4. Acceleration & Braking
    if (input.accelerate && !input.brake) {
      if (fwd < 0) {
        fwd += t.brakeForce * dt; // Braking while reversing
      } else {
        // Progressive acceleration (weaker near max speed)
        const ratio = Math.min(fwd / t.maxSpeed, 1);
        fwd += t.acceleration * (1 - ratio * ratio * 0.8) * dt * (1 / dragMultiplier);
      }
    } else if (input.brake) {
      // Strong intentional braking
      if (fwd > 15) { // If moving forward, brake hard
        fwd = Math.max(0, fwd - t.brakeForce * dt);
      } else {
        // If stopped, reverse slowly
        fwd -= t.reverseAcceleration * dt;
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
    
    // Off-road affects top speed too
    const effectiveMaxSpeed = t.maxSpeed / Math.sqrt(dragMultiplier);
    fwd = Math.max(-t.maxReverseSpeed, Math.min(effectiveMaxSpeed, fwd));

    // 5. Drift / Lateral sliding
    // Lateral grip bleeds off sideways movement over time.
    lat *= Math.exp(-t.lateralGrip * dt);

    // Apply back to global velocity
    this.vx = fx * fwd + rx * lat;
    this.vy = fy * fwd + ry * lat;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
  }

  /** Apply hard boundary collision. */
  applyCollision(hit: CollisionResult): void {
    // Prevent moving into the boundary
    this.x = hit.x;
    this.y = hit.y;

    // Project velocity along the wall tangent
    const vn = this.vx * hit.nx + this.vy * hit.ny;
    if (vn >= 0) return; // Moving away from the wall
    
    // Kill the velocity component pointing into the wall (allow sliding along it)
    // No bounce or vibration, just solid slide.
    this.vx -= hit.nx * vn;
    this.vy -= hit.ny * vn;
    
    // Slight friction scrub from the wall hit
    const scrub = 0.95; 
    this.vx *= scrub;
    this.vy *= scrub;
  }
}
