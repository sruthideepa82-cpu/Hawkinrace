import type { Point } from '../config/tracks';
import type { RaceResult, StandingEntry } from '../bridge';
import { createRacerTuning, type CarTuning } from '../config/carTuning';
import { AI_STAT_WEIGHT, getAiProfile, type RacerConfig } from '../config/racers';
import { RACE, CAR } from '../config/GameConfig';
import { CarPhysics, NO_INPUT, type InputState } from '../entities/CarPhysics';
import type { TrackLayout } from '../entities/TrackLayout';
import { AiDriver, type AiRival } from './AiDriver';
import { LapManager } from './LapManager';
import { NitroTank } from './NitroTank';
import { RaceManager, type RaceSnapshot } from './RaceManager';
import { getCharacterStats } from '../config/characterTuning';

/** One car on the grid: physics, lap state, nitro and (for AI) its driver. */
export class Racer {
  readonly physics: CarPhysics;
  readonly tuning: CarTuning;
  readonly laps: LapManager;
  readonly nitro: NitroTank;
  readonly ai: AiDriver | null;
  /** 1-based finishing order, or null while still racing. */
  finishPosition: number | null = null;
  /** Set the frame the car took the flag, so physics can coast it to a stop. */
  justFinished = false;

  constructor(
    readonly config: RacerConfig,
    readonly layout: TrackLayout,
    /**
     * Builds the driver for a car. Injectable so `tools/` can hand the AI a
     * different skill profile without the race code knowing about it.
     */
    driverFor?: (config: RacerConfig, tuning: CarTuning) => AiDriver | null,
  ) {
    this.tuning = createRacerTuning(
      config.carId,
      getCharacterStats(config.characterId),
      config.isPlayer ? 1 : AI_STAT_WEIGHT,
    );
    this.physics = new CarPhysics(this.tuning);
    this.laps = new LapManager(layout, layout.finishGate, layout.checkpoints, RACE.totalLaps);
    this.nitro = new NitroTank(this.tuning.nitroCapacity, this.tuning.nitroDrain, this.tuning.nitroRegen);
    this.ai = driverFor
      ? driverFor(config, this.tuning)
      : config.isPlayer
        ? null
        : new AiDriver(getAiProfile(config.characterId), this.tuning);

    this.physics.reset(0, 0, 0);
  }

  get isPlayer(): boolean {
    return this.config.isPlayer;
  }

  get finished(): boolean {
    return this.finishPosition !== null;
  }

  /** Everything the HUD and results need about this car. */
  standing(position: number): StandingEntry {
    const snap = this.laps.snapshot();
    return {
      position,
      characterId: this.config.characterId,
      characterName: this.config.characterName,
      carName: this.config.carName,
      color: this.config.color,
      isPlayer: this.isPlayer,
      lap: snap.lap,
      totalLaps: snap.totalLaps,
      finished: snap.finished,
      finishTimeMs: snap.finishTimeMs,
      bestLapMs: snap.bestLapMs,
      progress: this.laps.totalRaceProgress,
    };
  }
}

/** Base data for the HUD each frame. */
export interface HudData extends RaceSnapshot {
  speedKmh: number;
  nitro: number;
  playerPosition: number;
  playerLap: number;
  totalLaps: number;
  standings: StandingEntry[];
  rivalsFinished: number;
}

/** Everything GameScene sends to the HUD each frame. */
export interface HudPayload extends HudData {
  /** Car position in world space, for the minimap blip. */
  playerPos: Point;
  /** Rival positions in world space, for the extra minimap blips. */
  rivalPos: readonly { x: number; y: number; color: number }[];
  /** Camera rotation (radians); the minimap is rotated by it to match the screen. */
  cameraRotation: number;
  /** Active camera view name, for the HUD label. */
  view: string;
}

const GRID_COLUMNS = 2;

/** Overlap-resolution passes per physics step. See `separateCars`. */
const SEPARATION_PASSES = 3;

/**
 * Glue for one race: owns every car on the grid, advances physics, applies track
 * and car-to-car collisions, feeds each car through the shared lap/checkpoint
 * logic, and ranks the field. Phaser-free so it stays easy to reason about.
 */
export class RaceSession {
  readonly race: RaceManager;
  readonly racers: Racer[];
  readonly player: Racer;

  constructor(
    readonly layout: TrackLayout,
    configs: readonly RacerConfig[],
    driverFor?: (config: RacerConfig, tuning: CarTuning) => AiDriver | null,
  ) {
    this.race = new RaceManager(RACE.countdownSeconds);
    this.racers = configs.map((c) => new Racer(c, layout, driverFor));

    this.placeOnGrid();
    this.player = this.racers.find((r) => r.isPlayer) ?? this.racers[0];
  }

  /**
   * Staggers the field behind the finish line, two abreast, so all four cars are
   * on the road at the start and none is embedded in another.
   */
  private placeOnGrid(): void {
    const spawn = this.layout.spawn;
    // Forward unit vector and its left-hand normal, derived from the spawn heading.
    const fx = Math.cos(spawn.heading);
    const fy = Math.sin(spawn.heading);
    const nx = -fy;
    const ny = fx;
    const rowGap = 96;
    const lateral = this.layout.roadWidth * 0.22;

    this.racers.forEach((racer, i) => {
      const row = Math.floor(i / GRID_COLUMNS);
      const column = i % GRID_COLUMNS === 0 ? -1 : 1;
      const along = -row * rowGap;
      const across = column * lateral;

      racer.physics.reset(
        spawn.x + fx * along + nx * across,
        spawn.y + fy * along + ny * across,
        spawn.heading,
      );
      // Prime the lap tracker with where the car is standing on the grid.
      racer.laps.update(
        { x: racer.physics.x, y: racer.physics.y },
        { x: racer.physics.x, y: racer.physics.y },
        0,
        this.layout.fractionAt(racer.physics.x, racer.physics.y),
      );
    });
  }

  /** Rivals as seen by one AI car, tagged with whether they are up the road. */
  private rivalsFor(self: Racer): AiRival[] {
    const out: AiRival[] = [];
    for (const other of this.racers) {
      if (other === self) continue;
      out.push({ physics: other.physics, aheadInRace: other.laps.totalRaceProgress > self.laps.totalRaceProgress });
    }
    return out;
  }

  step(dt: number, playerInput: InputState): void {
    const racing = this.race.isRacing;

    // The clock is shared by the whole field.
    this.race.update(dt * 1000);

    // 1. Drive every car. Finished cars keep coasting but stop being controlled.
    const prevs: { x: number; y: number }[] = [];
    for (const racer of this.racers) {
      prevs.push({ x: racer.physics.x, y: racer.physics.y });
      racer.justFinished = false;

      if (racer.finished) {
        // Out of the race: no input, and no lap progress from here on. It still
        // obeys the track boundary, otherwise it would coast off into the scenery.
        racer.nitro.update(dt, false);
        const surface = this.layout.getSurface(racer.physics.x, racer.physics.y);
        racer.physics.step(dt, NO_INPUT, surface.dragMultiplier);
      } else {
        const input = !racing
          ? NO_INPUT
          : racer.isPlayer
            ? playerInput
            : racer.ai!.update(dt, this.layout, racer.physics, this.rivalsFor(racer), !racer.nitro.isEmpty);

        // Nitro is driven entirely through InputState, so the player and the AI
        // share one code path.
        const wantBoost = racing && input.nitro && input.accelerate && !input.brake;
        const boost = racer.nitro.update(dt, wantBoost);
        const surface = this.layout.getSurface(racer.physics.x, racer.physics.y);
        racer.physics.step(dt, input, surface.dragMultiplier, boost);
      }

      const hit = this.layout.resolveBoundary(racer.physics.x, racer.physics.y, CAR.collisionRadius);
      if (hit) racer.physics.applyCollision(hit);
    }

    // 2. Cars cannot occupy the same space.
    this.separateCars();

    // Car-to-car pushes can shove a car past the barrier, so re-clamp the track
    // boundary afterwards and keep cars off each other as well.
    for (const racer of this.racers) {
      const hit = this.layout.resolveBoundary(racer.physics.x, racer.physics.y, CAR.collisionRadius);
      if (hit) racer.physics.applyCollision(hit);
    }

    // 3. Feed every car through the same ordered checkpoint / lap logic.
    if (racing) {
      for (let i = 0; i < this.racers.length; i++) {
        const racer = this.racers[i];
        if (racer.finished) continue;
        const fraction = this.layout.fractionAt(racer.physics.x, racer.physics.y);
        const event = racer.laps.update(prevs[i], { x: racer.physics.x, y: racer.physics.y }, this.race.elapsed, fraction);
        if (event === 'finished') racer.justFinished = true;
      }
      this.assignFinishPositions();
    }

    if (!this.race.isFinished && this.racers.every((r) => r.finished)) {
      this.race.finish();
    }
  }

  /**
   * Finish order is derived from recorded times, not from the order cars happened
   * to be stepped in, so two cars crossing together are ordered fairly.
   */
  private assignFinishPositions(): void {
    const done = this.racers.filter((r) => r.laps.isComplete);
    if (done.length === 0) return;
    done.sort((a, b) => (a.laps.finishTimeMs ?? 0) - (b.laps.finishTimeMs ?? 0));
    done.forEach((racer, i) => {
      if (racer.finishPosition === null) racer.finishPosition = i + 1;
    });
  }

  /**
   * Pushes overlapping cars apart along the line between them. Restitution is
   * deliberately low so contact nudges cars aside rather than launching them.
   * A car that has already finished never blocks a racing car.
   *
   * Resolved over a few passes: with four cars a single pass leaves them
   * overlapped, because pushing one pair apart can shove a car into a third that
   * the same pass has already walked past.
   */
  private separateCars(): void {
    const minDist = CAR.collisionRadius * 2;
    const minDist2 = minDist * minDist;

    for (let pass = 0; pass < SEPARATION_PASSES; pass++) {
      for (let i = 0; i < this.racers.length; i++) {
        for (let j = i + 1; j < this.racers.length; j++) {
        const a = this.racers[i].physics;
          const b = this.racers[j].physics;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const d2 = dx * dx + dy * dy;
          if (d2 >= minDist2 || d2 === 0) continue;

          const d = Math.sqrt(d2);
          const nx = dx / d;
          const ny = dy / d;
          const overlap = minDist - d;

          const aDone = this.racers[i].finished;
          const bDone = this.racers[j].finished;

          // A finished car never blocks a car that is still racing: with exactly
          // one live car it absorbs none of the displacement, so the live car
          // takes all of it. Two finished cars have nobody to protect, and
          // pushing them apart normally is what stops them coasting to a stop
          // in the same spot -- which left cars visibly frozen inside one
          // another for as long as the results screen stayed up.
          const aShare = bDone && !aDone ? 1 : aDone && !bDone ? 0 : 0.5;
          const bShare = aDone && !bDone ? 1 : bDone && !aDone ? 0 : 0.5;

          a.x -= nx * overlap * aShare;
          a.y -= ny * overlap * aShare;
          b.x += nx * overlap * bShare;
          b.y += ny * overlap * bShare;

          // Exchange a little speed along the contact normal (restitution ~0.25).
          const relative = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
          if (relative < 0) {
            const impulse = -relative * 0.6;
            a.vx -= nx * impulse * aShare;
            a.vy -= ny * impulse * aShare;
            b.vx += nx * impulse * bShare;
            b.vy += ny * impulse * bShare;
          }
        }
      }
    }
  }

  /** Live ranking. Finished cars hold their finish slot; the rest sort on progress. */
  standings(): StandingEntry[] {
    const rows = this.racers.map((racer, i) => ({
      racer,
      index: i,
      progress: racer.laps.totalRaceProgress,
      tiebreak: racer.laps.progressTiebreak,
    }));

    rows.sort((a, b) => {
      const aDone = a.racer.finishPosition !== null;
      const bDone = b.racer.finishPosition !== null;
      if (aDone && bDone) return (a.racer.finishPosition ?? 0) - (b.racer.finishPosition ?? 0);
      if (aDone) return -1;
      if (bDone) return 1;
      if (b.progress !== a.progress) return b.progress - a.progress;
      return b.tiebreak - a.tiebreak;
    });

    return rows.map((row, i) => row.racer.standing(i + 1));
  }

  playerPosition(): number {
    const board = this.standings();
    return board.find((s) => s.isPlayer)?.position ?? 1;
  }

  hudData(): HudData {
    const board = this.standings();
    const me = board.find((s) => s.isPlayer) ?? board[0];
    return {
      ...this.race.snapshot(),
      speedKmh: Math.round(this.player.physics.speed * CAR.speedDisplayFactor),
      nitro: this.player.nitro.fraction,
      playerPosition: me.position,
      playerLap: me.lap,
      totalLaps: me.totalLaps,
      standings: board,
      rivalsFinished: this.racers.filter((r) => r.finished).length,
    };
  }

  /** Final result once every car has finished, otherwise null. */
  result(): RaceResult | null {
    if (!this.race.isFinished) return null;
    const snap = this.race.snapshot();
    const board = this.standings();
    const me = this.racers.find((r) => r.isPlayer) ?? this.racers[0];
    return {
      timeMs: me.laps.finishTimeMs ?? snap.elapsedMs,
      lapTimesMs: [...me.laps.lapTimesMs],
      lapsCompleted: me.laps.snapshot().lap,
      totalLaps: RACE.totalLaps,
      standings: board,
      playerPosition: board.find((s) => s.isPlayer)?.position ?? 1,
      playerBestLapMs: me.laps.bestLapMs,
    };
  }

  /** Full reset for the retry path. */
  reset(): void {
    for (const racer of this.racers) {
      racer.finishPosition = null;
      racer.justFinished = false;
      racer.laps.reset();
      racer.nitro.reset();
      racer.ai?.reset();
    }
    this.placeOnGrid();
    this.race.reset();
  }
}