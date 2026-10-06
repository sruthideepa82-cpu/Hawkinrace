import { CAMERA } from '../config/GameConfig';
import type { CarPhysics } from './CarPhysics';
import { angleDelta, clamp, wrapAngle } from '../utils/geometry';

/**
 * Rotating the camera by this much puts the car's forward direction (heading 0 =
 * +x) at the top of the screen.
 */
const FORWARD_TO_SCREEN_UP = -Math.PI / 2;

const DEG = Math.PI / 180;

/**
 * The slice of Phaser's Camera the rig drives. Spelling it out keeps the rig
 * free of Phaser at runtime, so tools/cameraProbe.ts can fly it headlessly.
 */
export interface CameraTarget {
  readonly width: number;
  readonly height: number;
  scrollX: number;
  scrollY: number;
  readonly zoom: number;
  setZoom(value: number): unknown;
  setRotation(radians: number): unknown;
  centerOn(x: number, y: number): unknown;
  zoomTo(zoom: number, duration?: number, ease?: string, force?: boolean): unknown;
  shake(duration?: number, intensity?: number): unknown;
}

/**
 * Heading-up chase camera.
 *
 * The world turns so the car always points up the screen, but it does so
 * *gently*: inside a dead zone the view is left completely alone, and past it
 * the pull eases in from zero and is capped, so the world settles round after
 * the car instead of snapping with every input. The car is pinned to a fixed
 * spot on screen by solving the camera centre in screen space, so it cannot be
 * thrown off screen when it spins, accelerates or brakes.
 *
 * The Upside Down track's scripted anti-gravity roll rides on top of this and
 * is rate limited the same way.
 *
 * Cycle between CHASE / HOOD / MAP with the camera key (CONTROLS.camera).
 */
export class CameraRig {
  private viewIndex = 0;
  /** Smoothed camera rotation, in radians. */
  private rotation = FORWARD_TO_SCREEN_UP;
  private zoomTarget: number = CAMERA.views[0].zoom;
  private speeding = false;

  constructor(private readonly camera: CameraTarget) {}

  /** Name of the active preset, shown on the HUD. */
  get viewName(): string {
    return CAMERA.views[this.viewIndex].name;
  }

  /** Camera rotation, so the minimap can be aligned with the screen. */
  get screenRotation(): number {
    return this.rotation;
  }

  /** Place the camera on the car immediately (spawn / restart), no easing. */
  snap(car: CarPhysics): void {
    this.viewIndex = 0;
    this.speeding = false;
    this.zoomTarget = CAMERA.views[this.viewIndex].zoom;
    this.camera.setZoom(this.zoomTarget);

    this.rotation = wrapAngle(this.idealRotation(car, 0));
    this.camera.setRotation(this.rotation);

    const target = this.followTarget(car);
    this.camera.centerOn(target.x, target.y);
  }

  /** Switch to the next preset. */
  cycle(): void {
    this.viewIndex = (this.viewIndex + 1) % CAMERA.views.length;
    // Re-arm the speed FX so they play again for the new view.
    this.speeding = false;
    this.easeZoom(CAMERA.views[this.viewIndex].zoom);
  }

  update(car: CarPhysics, speed: number, deltaMs: number, antiGravityTwist: number = 0): void {
    const dt = deltaMs / 1000;

    // Rotation first: the on-screen anchor is solved in the camera's own frame,
    // so it needs this frame's rotation rather than the previous frame's.
    this.stepRotation(car, antiGravityTwist, dt);
    this.camera.setRotation(this.rotation);

    // scrollX/scrollY is the world point at the viewport's top-left, so the
    // target has to be shifted by half the viewport to centre it on the anchor.
    const target = this.followTarget(car);
    const follow = 1 - Math.exp(-CAMERA.follow * dt);
    this.camera.scrollX += (target.x - this.camera.width / 2 - this.camera.scrollX) * follow;
    this.camera.scrollY += (target.y - this.camera.height / 2 - this.camera.scrollY) * follow;

    // Speed feel: pull back and rumble once when crossing into the fast range.
    const speeding = speed > CAMERA.speedThreshold;
    if (speeding !== this.speeding) {
      this.speeding = speeding;
      this.easeZoom(speeding ? this.viewZoom - CAMERA.speedZoomOut : this.viewZoom);
      if (speeding) this.camera.shake(CAMERA.shakeDuration, CAMERA.shakeIntensity);
    }
  }

  /**
   * Where the camera should end up to put the car on its screen anchor. The car
   * rests `anchorOffset` px below the screen centre, so the point sits behind
   * the car along the camera's own "up" axis rather than the car's heading --
   * that is what keeps it fixed on screen while the world turns.
   *
   * The car's velocity is led by one smoothing time constant. The follow easing
   * always trails a moving target by `v / follow`, and without this lead that
   * trail is the car itself creeping up the screen as it speeds up; leading by
   * the same amount cancels it, so the camera moves with the car.
   */
  private followTarget(car: CarPhysics): { x: number; y: number } {
    const offset = this.anchorOffset();
    const lead = 1 / CAMERA.follow;
    return {
      x: car.x + car.vx * lead - offset * Math.sin(this.rotation),
      y: car.y + car.vy * lead - offset * Math.cos(this.rotation),
    };
  }

  /**
   * World-space distance from the screen centre down to where the car rests. A
   * fraction of the visible half-height, so the car holds the same spot on
   * screen when the camera pulls back for speed.
   */
  private anchorOffset(): number {
    const view = CAMERA.views[this.viewIndex];
    return (view.anchor * this.camera.height) / (2 * this.camera.zoom);
  }

  /** Rotation the world needs for the car to point up the screen. */
  private idealRotation(car: CarPhysics, twist: number): number {
    return CAMERA.views[this.viewIndex].rotate ? FORWARD_TO_SCREEN_UP - car.heading + twist : twist;
  }

  private stepRotation(car: CarPhysics, twist: number, dt: number): void {
    const view = CAMERA.views[this.viewIndex];

    // Take the short way round so a full spin does not unwind the camera.
    const deviation = angleDelta(this.rotation, this.idealRotation(car, twist));

    // Inside the dead zone the view is left completely alone, so small steering
    // corrections never wobble the background. Past it the pull eases in from
    // zero and is capped, so the world turns after the car rather than with it.
    const excess = Math.abs(deviation) - view.angleDeadZoneDeg * DEG;
    if (excess <= 0) return;

    const rate = clamp(excess * CAMERA.rotateGain, 0, CAMERA.maxRotateSpeed);
    const step = Math.sign(deviation) * Math.min(excess, rate * dt);
    this.rotation = wrapAngle(this.rotation + step);
  }

  private get viewZoom(): number {
    return CAMERA.views[this.viewIndex].zoom;
  }

  private easeZoom(zoom: number): void {
    if (zoom === this.zoomTarget) return;
    this.zoomTarget = zoom;
    // force: retarget from the current zoom if the view changes mid-blend.
    this.camera.zoomTo(zoom, CAMERA.zoomBlendMs, 'Sine.easeOut', true);
  }
}
