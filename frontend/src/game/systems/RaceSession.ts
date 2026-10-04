import { RACE } from '../config/GameConfig';
import type { Point } from '../config/tracks';
import type { RaceResult } from '../bridge';
import { CarPhysics, NO_INPUT, type InputState } from '../entities/CarPhysics';
import type { TrackLayout } from '../entities/TrackLayout';
import { LapManager } from './LapManager';
import { RaceManager, type RaceSnapshot } from './RaceManager';

export interface HudData extends RaceSnapshot {
  speedKmh: number;
}

/** Everything GameScene sends to the HUD each frame. */
export interface HudPayload extends HudData {
  /** Car position in world space, for the minimap blip. */
  playerPos: Point;
  /** Camera rotation (radians); the minimap is rotated by it to match the screen. */
  cameraRotation: number;
  /** Active camera view name, for the HUD label. */
  view: string;
}

/**
 * Glue for one race: advances car physics, applies track boundaries, and feeds
 * the car's movement to the race/lap logic. Phaser-free so it is easy to test.
 */
export class RaceSession {
  readonly race: RaceManager;

  constructor(
    readonly layout: TrackLayout,
    readonly car: CarPhysics,
  ) {
    car.reset(layout.spawn.x, layout.spawn.y, layout.spawn.heading);
    const laps = new LapManager(layout.finishGate, layout.checkpoints, RACE.totalLaps);
    this.race = new RaceManager(laps, RACE.countdownSeconds);
  }

  step(dt: number, input: InputState): void {
    const prev = { x: this.car.x, y: this.car.y };
    const surface = this.layout.getSurface(this.car.x, this.car.y);
    this.car.step(dt, this.race.isRacing ? input : NO_INPUT, surface.dragMultiplier);

    const hit = this.layout.resolveBoundary(this.car.x, this.car.y, this.car.tuning.collisionRadius);
    if (hit) this.car.applyCollision(hit);

    this.race.update(dt * 1000, prev, { x: this.car.x, y: this.car.y });
  }

  hudData(): HudData {
    return { ...this.race.snapshot(), speedKmh: Math.round(this.car.speed * this.car.tuning.speedDisplayFactor) };
  }

  /** Final result once the race is finished, otherwise null. */
  result(): RaceResult | null {
    const snap = this.race.snapshot();
    if (snap.state !== 'finished' || snap.finalTimeMs === null) return null;
    return {
      timeMs: snap.finalTimeMs,
      lapTimesMs: snap.lapTimesMs,
      lapsCompleted: snap.totalLaps,
      totalLaps: snap.totalLaps,
    };
  }
}
