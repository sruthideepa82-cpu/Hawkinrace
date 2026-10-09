import type { AiProfile } from '../config/racers';
import type { CarTuning } from '../config/carTuning';
import type { CarPhysics, InputState } from '../entities/CarPhysics';
import type { TrackLayout } from '../entities/TrackLayout';
import { angleDelta, clamp } from '../utils/geometry';

/** A rival car the driver needs to react to. */
export interface AiRival {
  physics: CarPhysics;
  /** True when this rival is further along the race than the AI car. */
  aheadInRace: boolean;
}

const NO_STEER: InputState = { accelerate: false, brake: false, steer: 0, nitro: false, ability: false };

/**
 * Largest velocity-vs-heading slide angle (tan) we accept in a corner. See
 * `slideLimit` for why this exists, and `tools/cornerSweep.ts` for the
 * measurement that chose the value.
 */
const MAX_SLIDE_ANGLE_TAN = 0.2;

/** Lateral acceleration budget used by the constant-a corner limit. */
const GRIP_ACCEL = 55;

/** Cross-track steering gain. Higher snaps back to the line harder. */
const CROSS_TRACK_GAIN = 1.6;

/**
 * Steering lookahead, as a fraction of the upcoming corner's radius.
 *
 * Looking `R * k` px ahead points the aim point `k` radians round the corner, so
 * the controller settles with a standing heading error of `k` and cuts the apex
 * by roughly `R * k / 2`. At k = 0.35 that is a 68px cut on Hawkins Streets'
 * 391px sweep, which on a 220px road puts the car on the kerb; 0.18 keeps it
 * inside the asphalt while still giving the nose error enough lead to turn in.
 */
const MAX_LOOKAHEAD_RADIANS = 0.18;

/**
 * Lane drift speed, radians per decision tick. Slow on purpose: the target lane
 * is re-chosen every 0.18s, and a fast sine there makes the car weave across the
 * road several times a lap instead of settling on a line.
 */
const LANE_WANDER_RATE = 0.18;

/** How far ahead the lookahead radius is measured, in px. */
const LOOKAHEAD_RADIUS_WINDOW = 160;

/** Heading error beyond this (radians) counts as pointing the wrong way. */
const WRONG_WAY_ANGLE = 2.2;

/**
 * Per-frame internals of the driver, published for `tools/` to explain a run.
 * Debug only -- nothing in the game reads this.
 */
export interface AiDebug {
  fraction: number;
  roadDistance: number;
  lateral: number;
  laneTarget: number;
  laneOffset: number;
  crossTrack: number;
  noseError: number;
  steer: number;
  radius: number;
  targetSpeed: number;
  speed: number;
  onRoad: boolean;
  braking: boolean;
  reversing: boolean;
  blockedBy: number;
}

/**
 * Racing AI for one opponent.
 *
 * The driver is never on rails: every frame it reads the real centerline, works
 * out how far it has drifted and how far its nose points from the road, and
 * returns the same `InputState` a human produces. Corner speed comes from the
 * measured radius of the upcoming corner, so the same policy works on any
 * track, including the anti-gravity one, where the centerline is unchanged and
 * only the camera rolls.
 */
export class AiDriver {
  /** Set by tooling to inspect decisions; see `AiDebug`. */
  onDebug: ((state: AiDebug) => void) | null = null;
  /** Seconds spent crawling before the driver tries to reverse out. */
  private stuckFor = 0;
  /** Seconds left of a deliberate reverse manoeuvre. */
  private reverseFor = 0;
  /** Seconds of nitro still committed to. */
  private nitroFor = 0;
  /** Seconds until the next decision tick. */
  private decideIn = 0;
  /** Smoothed lane offset from the centerline, in px. */
  private laneOffset = 0;
  private laneTarget = 0;
  /** Rolling randomness so two identically-tuned drivers do not drive in lockstep. */
  private wander: number;

  constructor(
    private readonly profile: AiProfile,
    private readonly tuning: CarTuning,
  ) {
    this.wander = profile.seed * Math.PI * 2;
  }

  update(
    dt: number,
    layout: TrackLayout,
    self: CarPhysics,
    rivals: readonly AiRival[],
    nitroAvailable: boolean,
  ): InputState {
    const here = layout.locate(self.x, self.y);
    const halfRoad = layout.roadWidth / 2;
    const speed = self.forwardSpeed;
    const lateral = layout.lateralOffsetAt(self.x, self.y);
    const recovering = here.distance > halfRoad + 10;

    // Direction the road points at the car, and how far the nose is off it.
    const roadTangent = layout.directionAt(here.index);
    const headingError = angleDelta(self.heading, Math.atan2(roadTangent.y, roadTangent.x));
    const wrongWay = Math.abs(headingError) > WRONG_WAY_ANGLE;

    // Reverse manoeuvre: back out of a wall, or swing the nose round when the car
    // ended up facing back down the track. A forward turn at a 180 degree heading
    // error just circles the car, so reversing is the only way out.
    if (this.reverseFor > 0) {
      this.reverseFor -= dt;
      // Reversing flips the steering sign inside CarPhysics, so negate the error
      // to swing the nose back toward the road.
      const steerOut = clamp(-headingError * 2.2, -1, 1);
      this.publish({
        fraction: here.fraction,
        roadDistance: here.distance,
        lateral,
        laneTarget: this.laneTarget,
        laneOffset: this.laneOffset,
        crossTrack: 0,
        noseError: headingError,
        steer: steerOut,
        radius: Number.POSITIVE_INFINITY,
        targetSpeed: 0,
        speed,
        onRoad: !recovering,
        braking: true,
        reversing: true,
        blockedBy: 0,
      });
      return {
        accelerate: false,
        brake: true,
        steer: steerOut,
        nitro: false,
        ability: false,
      };
    }

    // Unstick. This runs whether or not we are on the road: a car wedged
    // nose-first into a barrier is both slow AND off-line, and treating those as
    // mutually exclusive left it stuck there permanently.
    if (Math.abs(speed) < 30) this.stuckFor += dt;
    else this.stuckFor = 0;

    if (this.stuckFor > this.profile.stuckSeconds || (wrongWay && Math.abs(speed) < 90)) {
      this.stuckFor = 0;
      this.reverseFor = wrongWay ? 0.9 : 0.7;
      this.nitroFor = 0;
      this.laneOffset = 0;
      this.laneTarget = 0;
      this.decideIn = 0;
      return NO_STEER;
    }

    // Where on the road should we be aiming laterally?
    this.decideIn -= dt;
    if (this.decideIn <= 0) {
      this.decideIn = 0.18;
      this.laneTarget = this.chooseLane(layout, self, rivals, halfRoad, here.distance, lateral);
    }

    // Ease onto the chosen line so the car does not snap sideways.
    this.laneOffset += clamp(this.laneTarget - this.laneOffset, -160 * dt, 160 * dt);

    // Steering: how far our nose points from the road, plus how far we have
    // drifted from the chosen line. The drift term is divided by speed, so the
    // faster we go the less it fights the wheel -- that is what stops the car
    // weaving down a straight instead of settling on the line.
    //
    // How far ahead we aim has to stay inside the corner: on a 150px hairpin a
    // fixed 190px lookahead rotates the target heading by more than 70 degrees,
    // the nose error then dwarfs the drift error, and the car steers straight on
    // across the apex into the outside wall. Capping the lookahead at a fraction
    // of the upcoming radius keeps the target heading within a sane angle of the
    // road the car is actually on.
    const lookaheadRadius = layout.cornerRadiusAhead(here.fraction, LOOKAHEAD_RADIUS_WINDOW);
    const maxLookahead = Number.isFinite(lookaheadRadius)
      ? lookaheadRadius * MAX_LOOKAHEAD_RADIANS
      : layout.trackLength;
    const lookahead = Math.min(clamp(40 + Math.max(0, speed) * 0.3, 40, 190), maxLookahead);
    const ahead = layout.sampleAtFraction(here.fraction + lookahead / layout.trackLength, this.laneOffset);
    const targetHeading = Math.atan2(ahead.tangent.y, ahead.tangent.x);
    const noseError = angleDelta(self.heading, targetHeading);
    const crossTrack = clamp(this.laneOffset - lateral, -150, 150);
    // Off the road, getting back on it matters more than holding a racing line,
    // so the drift term gets extra authority.
    const gain = recovering ? CROSS_TRACK_GAIN * 2 : CROSS_TRACK_GAIN;
    const steer = clamp(
      noseError + Math.atan2(gain * crossTrack, Math.max(90, Math.abs(speed))),
      -1,
      1,
    );

    // Corner speed: the tightest radius ahead sets how fast we dare to be.
    const brakeWindow = clamp(120 + Math.max(0, speed) * 1.15, 200, 620);
    const radius = layout.cornerRadiusAhead(here.fraction, brakeWindow);
    const cornerLimit = Number.isFinite(radius)
      ? Math.min(this.gripLimit(radius), this.slideLimit(radius)) * this.profile.cornerConfidence
      : Number.POSITIVE_INFINITY;

    let targetSpeed = Math.min(this.tuning.maxSpeed * this.profile.pace, cornerLimit);

    // Off the road, crawl back on rather than carrying speed into the scenery.
    if (recovering) targetSpeed = Math.min(targetSpeed, this.tuning.maxSpeed * 0.35);
    if (here.distance > halfRoad + 40) targetSpeed = Math.min(targetSpeed, this.tuning.maxSpeed * 0.25);

    // Do not drive through the car in front; match its speed instead.
    const blocked = this.carAhead(self, rivals);
    if (blocked !== null && blocked.speed < targetSpeed) targetSpeed = blocked.speed;

    // Nitro: commit to short bursts on the straights, and when there is someone
    // in front worth passing.
    this.nitroFor -= dt;
    if (this.nitroFor <= 0 && nitroAvailable && !recovering) {
      const straight = Number.isFinite(radius) && radius > 900;
      const wantsPass = blocked !== null && blocked.speed > 0;
      const trigger = Math.sin(this.wander * 3.1 + this.nitroFor) * 0.5 + 0.5;
      if ((straight || wantsPass) && trigger < this.profile.nitroEagerness) {
        this.nitroFor = 1.1 + this.profile.nitroEagerness;
      }
    }
    const wantsNitro = this.nitroFor > 0 && nitroAvailable && !recovering;

    const throttle = speed < targetSpeed * 0.98;
    const braking = speed > targetSpeed * 1.02;
    // Nitro only helps while actually driving forward, never mid-corner or braking.
    const nitro = wantsNitro && throttle && !braking && here.distance <= halfRoad;

    this.publish({
      fraction: here.fraction,
      roadDistance: here.distance,
      lateral,
      laneTarget: this.laneTarget,
      laneOffset: this.laneOffset,
      crossTrack,
      noseError,
      steer,
      radius,
      targetSpeed,
      speed,
      onRoad: !recovering,
      braking,
      reversing: false,
      blockedBy: blocked === null ? 0 : 1,
    });

    return { accelerate: throttle || nitro, brake: braking && !nitro, steer, nitro, ability: false };
  }

  /** Feeds the optional debug hook, if tooling installed one. */
  private publish(state: AiDebug): void {
    this.onDebug?.(state);
  }

  /**
   * Traditional constant-lateral-acceleration limit: v = sqrt(a * R).
   *
   * Protected rather than private so `tools/cornerSweep.ts` can subclass and
   * measure how much corner speed the controller really holds.
   */
  protected gripLimit(radius: number): number {
    return Math.sqrt(Math.max(60, this.tuning.lateralGrip * GRIP_ACCEL) * radius);
  }

  /**
   * Understeer guard.
   *
   * In `CarPhysics` the car's velocity vector lags its heading by
   * `atan(yawRate / lateralGrip)`, and the yaw rate needed for a corner of radius
   * R is v / R. So the slide angle is `atan(v / (R * grip))`: at 540 px/s
   * through a 500px corner with grip 4 it is around 15 degrees, and across a
   * 220px road the car washes wide and parks itself in the barrier. Capping the
   * slide angle is what keeps the AI on the road.
   *
   * This is an open-loop worst case -- the steering controller below is actively
   * correcting long before the full slide develops -- so the constant is a
   * safety margin, not a physical limit. `tools/cornerSweep.ts` measures how
   * much can be taken out of it before cars start leaving the road.
   */
  protected slideLimit(radius: number): number {
    return radius * this.tuning.lateralGrip * MAX_SLIDE_ANGLE_TAN;
  }

  /** Decides which lane to use, blending the preferred line with traffic. */
  private chooseLane(
    layout: TrackLayout,
    self: CarPhysics,
    rivals: readonly AiRival[],
    halfRoad: number,
    roadDistance: number,
    lateral: number,
  ): number {
    // Gentle drift over time so the AI does not drive a perfect geometric line.
    this.wander += LANE_WANDER_RATE;
    const drift = Math.sin(this.wander) * this.profile.lineBias * halfRoad;

    const margin = Math.max(12, halfRoad - layout.roadWidth * 0.12);
    let target = drift;

    // Pull toward the middle when we have run wide.
    if (roadDistance > halfRoad) target -= Math.sign(lateral || 1) * Math.min(60, roadDistance - halfRoad);

    // Overtaking: if a rival sits in front, move to whichever side has more room.
    let nearestDist = Infinity;
    const fx = Math.cos(self.heading);
    const fy = Math.sin(self.heading);
    for (const rival of rivals) {
      const dx = rival.physics.x - self.x;
      const dy = rival.physics.y - self.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 170 || dist < 0.001 || dist > nearestDist) continue;
      if ((dx * fx + dy * fy) / dist < 0.55) continue; // not ahead of us

      const side = dx * -fy + dy * fx; // + means to our right
      if (Math.abs(side) > halfRoad * 0.8) continue; // not on the line we are using

      nearestDist = dist;
      // Commit to the opposite side, hard enough to actually get past.
      const away = side === 0 ? (this.profile.seed > 0.5 ? 1 : -1) : -Math.sign(side);
      const commitment = this.profile.overtaking * (rival.aheadInRace ? 1 : 0.55);
      target = away * margin * commitment;
    }

    return clamp(target, -margin, margin);
  }

  /**
   * The closest rival directly ahead within braking range, or null. Used both to
   * avoid rear-ending and to decide when it is worth spending nitro.
   */
  private carAhead(self: CarPhysics, rivals: readonly AiRival[]): { speed: number } | null {
    const fx = Math.cos(self.heading);
    const fy = Math.sin(self.heading);
    let best: { speed: number } | null = null;
    let bestDist = Infinity;

    for (const rival of rivals) {
      const dx = rival.physics.x - self.x;
      const dy = rival.physics.y - self.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 120 || dist < 0.001) continue;
      if ((dx * fx + dy * fy) / dist < 0.8) continue;
      if (Math.abs(dx * -fy + dy * fx) > 34) continue; // not in our lane
      if (dist < bestDist) {
        bestDist = dist;
        best = { speed: rival.physics.forwardSpeed };
      }
    }
    return best;
  }

  /** Clears per-race state for the retry path. */
  reset(): void {
    this.stuckFor = 0;
    this.reverseFor = 0;
    this.nitroFor = 0;
    this.decideIn = 0;
    this.laneOffset = 0;
    this.laneTarget = 0;
    this.wander = this.profile.seed * Math.PI * 2;
  }
}