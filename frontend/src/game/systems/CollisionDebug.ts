import Phaser from 'phaser';
import { CAR, FONTS } from '../config/GameConfig';
import type { CarPhysics } from '../entities/CarPhysics';
import type { TrackLayout } from '../entities/TrackLayout';
import type { RaceSession } from './RaceSession';

/** Half the car footprint, the same numbers the collision uses. */
const HALF_LENGTH = CAR.width / 2 + CAR.footprintPadding;
const HALF_WIDTH = CAR.height / 2 + CAR.footprintPadding;

const BAND_COLORS = {
  road: 0x22dd88,
  kerb: 0xffcc33,
  sidewalk: 0xff8833,
  grass: 0xff3355,
} as const;

/**
 * Development-only collision overlay (press B).
 *
 * Draws the things the car is actually colliding against rather than anything
 * approximate: the drivable corridor the boundary code uses, the gate lines it
 * validates laps against, the car's own oriented footprint, and a readout of
 * the surface it is standing on. It exists to settle "is the road where I think
 * it is?" without having to guess from a screenshot.
 *
 * It never exists in a production build: `available` is false when
 * `import.meta.env.DEV` is false, and nothing below it is constructed.
 */
export class CollisionDebug {
  /**
   * False in a production build, where the overlay does not exist at all.
   *
   * Optional-chained because this module is also loaded by the headless probes
   * in `tools/`, which run the game source under plain Node, where there is no
   * bundler to substitute the flag.
   */
  readonly available: boolean = import.meta.env?.DEV === true;

  private visible = false;
  private readonly root: Phaser.GameObjects.Container;
  private readonly bands: Phaser.GameObjects.Graphics;
  private readonly car: Phaser.GameObjects.Graphics;
  private readonly readout: Phaser.GameObjects.Text;

  constructor(
    scene: Phaser.Scene,
    private readonly layout: TrackLayout,
  ) {
    this.root = scene.add.container(0, 0).setDepth(900).setVisible(false);
    this.bands = scene.add.graphics();
    this.car = scene.add.graphics();
    this.readout = scene.add.text(0, 0, '', {
      fontFamily: FONTS.mono,
      fontSize: '13px',
      color: '#ffffff',
      backgroundColor: '#000000aa',
      padding: { x: 6, y: 4 },
    }).setOrigin(0, 1);
    this.root.add([this.bands, this.car, this.readout]);
    this.drawBands();
  }

  /** Shows or hides the overlay. */
  toggle(): void {
    this.visible = !this.visible;
    this.root.setVisible(this.visible);
  }

  /**
   * The static half: the corridor edges and the gates, drawn once. These come
   * straight off the layout, so what you see is what the code is using.
   */
  private drawBands(): void {
    const { centerline, roadHalfWidth, kerbOuter, pavementOuter, corridorHalfWidth } = this.layout;

    const band = (offset: number, color: number, alpha: number) => {
      this.bands.lineStyle(2, color, alpha);
      this.bands.beginPath();
      for (let i = 0; i <= centerline.length; i++) {
        const index = i % centerline.length;
        const prev = centerline[(index - 1 + centerline.length) % centerline.length];
        const next = centerline[(index + 1) % centerline.length];
        const dx = next.x - prev.x;
        const dy = next.y - prev.y;
        const len = Math.hypot(dx, dy) || 1;
        const nx = (-dy / len) * offset;
        const ny = (dx / len) * offset;
        const p = centerline[index];
        if (i === 0) this.bands.moveTo(p.x + nx, p.y + ny);
        else this.bands.lineTo(p.x + nx, p.y + ny);
      }
      this.bands.strokePath();
    };

    band(corridorHalfWidth, BAND_COLORS.grass, 0.9);
    band(pavementOuter, BAND_COLORS.sidewalk, 0.9);
    band(kerbOuter, BAND_COLORS.kerb, 0.9);
    band(roadHalfWidth, BAND_COLORS.road, 0.9);

    // Checkpoints and the finish line, drawn at the width they are validated at.
    const gate = (gate: { center: { x: number; y: number }; normal: { x: number; y: number }; halfWidth: number }, color: number) => {
      const { center, normal, halfWidth } = gate;
      this.bands.lineStyle(3, color, 0.95);
      this.bands.lineBetween(
        center.x - normal.x * halfWidth, center.y - normal.y * halfWidth,
        center.x + normal.x * halfWidth, center.y + normal.y * halfWidth,
      );
    };
    for (const checkpoint of this.layout.checkpoints) gate(checkpoint, 0xff174f);
    gate(this.layout.finishGate, 0xffffff);
  }

  /** The moving half: the car's footprint, its surface and its numbers. */
  update(session: RaceSession, car: CarPhysics): void {
    if (!this.visible) return;

    this.car.clear();
    const cos = Math.cos(car.heading);
    const sin = Math.sin(car.heading);
    const corner = (along: number, across: number) => ({
      x: car.x + cos * along - sin * across,
      y: car.y + sin * along + cos * across,
    });

    this.car.lineStyle(2, 0xffffff, 0.9);
    this.car.beginPath();
    const points = [
      corner(HALF_LENGTH, HALF_WIDTH),
      corner(HALF_LENGTH, -HALF_WIDTH),
      corner(-HALF_LENGTH, -HALF_WIDTH),
      corner(-HALF_LENGTH, HALF_WIDTH),
    ];
    points.forEach((p, i) => (i === 0 ? this.car.moveTo(p.x, p.y) : this.car.lineTo(p.x, p.y)));
    this.car.closePath();
    this.car.strokePath();

    // Where the boundary code would seat the car, if it had to.
    const hit = this.layout.resolveBoundary(car.x, car.y, car.heading, HALF_LENGTH, HALF_WIDTH);
    if (hit) {
      this.car.lineStyle(2, 0xff3355, 1);
      this.car.lineBetween(car.x, car.y, hit.x, hit.y);
      this.car.strokeCircle(hit.x, hit.y, 6);
    }

    const surface = this.layout.getSurface(car.x, car.y, car.heading, HALF_LENGTH, HALF_WIDTH);
    const here = this.layout.locate(car.x, car.y);
    const race = session.race;
    this.readout.setPosition(car.x + 56, car.y - 40);
    this.readout.setText(
      [
        `state   ${race.currentState} (${race.phase})`,
        `surface ${surface.type} x${surface.dragMultiplier.toFixed(2)}`,
        `offroad ${here.distance.toFixed(1)}px / ${this.layout.corridorHalfWidth.toFixed(0)}px`,
        `speed   ${car.speed.toFixed(0)}px/s  lap ${session.player.laps.currentLap}`,
        `gate    cp ${session.player.laps.currentCheckpoint}/${session.player.laps.totalCheckpoints}`,
      ].join('\n'),
    );
  }
}