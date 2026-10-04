import Phaser from 'phaser';
import { CAMERA } from '../config/GameConfig';
import type { CarPhysics } from './CarPhysics';

/**
 * Rotating the camera by this much puts the car's forward direction (heading 0 =
 * +x) at the top of the screen.
 */
const FORWARD_TO_SCREEN_UP = -Math.PI / 2;

/**
 * Third-person chase camera. Instead of parking on top of the car, the rig sits
 * ahead of it and turns with it, so the car sits low in the frame and the road
 * in front stays visible. The view also reaches further ahead the faster you
 * drive, which is what makes the corner after a straight readable.
 *
 * Cycle between CHASE / HOOD / MAP with the camera key (CONTROLS.camera).
 */
export class CameraRig {
  private viewIndex = 0;
  /** Smoothed camera rotation, in radians. */
  private rotation = FORWARD_TO_SCREEN_UP;
  private zoomTarget: number = CAMERA.views[0].zoom;
  private speeding = false;

  constructor(private readonly camera: Phaser.Cameras.Scene2D.Camera) {}

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

    const target = this.desired(car, 0);
    this.rotation = target.rotation;
    this.camera.setRotation(this.rotation);
    this.camera.centerOn(target.x, target.y);
  }

  /** Switch to the next preset. */
  cycle(): void {
    this.viewIndex = (this.viewIndex + 1) % CAMERA.views.length;
    // Re-arm the speed FX so they play again for the new view.
    this.speeding = false;
    this.easeZoom(CAMERA.views[this.viewIndex].zoom);
  }

  update(car: CarPhysics, speed: number, deltaMs: number): void {
    const dt = deltaMs / 1000;
    const target = this.desired(car, speed);

    // scrollX/scrollY is the world point at the viewport's top-left, so the
    // target has to be shifted by half the viewport to centre it on the target.
    const follow = 1 - Math.exp(-CAMERA.follow * dt);
    this.camera.scrollX += (target.x - this.camera.width / 2 - this.camera.scrollX) * follow;
    this.camera.scrollY += (target.y - this.camera.height / 2 - this.camera.scrollY) * follow;

    if (CAMERA.views[this.viewIndex].rotate) {
      // Take the short way round so a full spin does not unwind the camera.
      const diff = Phaser.Math.Angle.ShortestBetween(this.rotation, target.rotation);
      this.rotation += diff * (1 - Math.exp(-CAMERA.rotateFollow * dt));
    } else {
      this.rotation = target.rotation;
    }
    this.camera.setRotation(this.rotation);

    // Speed feel: pull back and rumble once when crossing into the fast range.
    const speeding = speed > CAMERA.speedThreshold;
    if (speeding !== this.speeding) {
      this.speeding = speeding;
      this.easeZoom(speeding ? this.viewZoom - CAMERA.speedZoomOut : this.viewZoom);
      if (speeding) this.camera.shake(CAMERA.shakeDuration, CAMERA.shakeIntensity);
    }
  }

  private get viewZoom(): number {
    return CAMERA.views[this.viewIndex].zoom;
  }

  private desired(car: CarPhysics, speed: number): { x: number; y: number; rotation: number } {
    const view = CAMERA.views[this.viewIndex];
    const ahead = view.lookAhead + speed * view.speedLookAhead;
    return {
      x: car.x + Math.cos(car.heading) * ahead,
      y: car.y + Math.sin(car.heading) * ahead,
      rotation: view.rotate ? FORWARD_TO_SCREEN_UP - car.heading : 0,
    };
  }

  private easeZoom(zoom: number): void {
    if (zoom === this.zoomTarget) return;
    this.zoomTarget = zoom;
    // force: retarget from the current zoom if the view changes mid-blend.
    this.camera.zoomTo(zoom, CAMERA.zoomBlendMs, 'Sine.easeOut', true);
  }
}