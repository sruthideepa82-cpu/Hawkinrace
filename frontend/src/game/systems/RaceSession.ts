import type { Point } from '../config/tracks';
import type { RaceResult, StandingEntry } from '../bridge';
import { createRacerTuning, type CarTuning } from '../config/carTuning';
import { AI_STAT_WEIGHT, getAiProfile, type RacerConfig } from '../config/racers';
import { RACE, CAR, COLLISION } from '../config/GameConfig';
import { CarPhysics, NO_INPUT, type InputState } from '../entities/CarPhysics';
import type { TrackLayout } from '../entities/TrackLayout';
import { AiDriver, type AiRival } from './AiDriver';
import { boxContact } from './CarCollision';
import { starsForTime } from './Challenge';
import { LapManager } from './LapManager';
import { NitroTank } from './NitroTank';
import { RaceManager, type RaceSnapshot } from './RaceManager';
import { RacePositionManager } from './RacePositionManager';
import { getCharacterStats } from '../config/characterTuning';

/** One car on the grid: physics, lap state, nitro and (for AI) its driver. */
export class Racer {
  readonly physics: CarPhysics;
  readonly tuning: CarTuning;
  readonly laps: LapManager;
  readonly nitro: NitroTank;
  readonly ai: AiDriver | null;
  /**
 * 1-based finishing order, or null while still racing.
 *
 * On a failed race the player ends up with the last position without this ever
 * being set, because `standings` sorts every car that took the flag ahead of the
 * one still racing. That is what makes them P4 without inventing a finish they
 * did not take.
 */
  finishPosition: number | null = null;
  /** Set the frame the car took the flag, so physics can coast it to a stop. */
  justFinished = false;
  /** The lap event that occurred this frame. */
  lastLapEvent: import('./LapManager').LapEvent = 'none';

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
  introRemainingMs: number;
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
 * Half the car's collision footprint: the chassis plus the wheels and shadow
 * that stick out past it. Used to keep the whole car on the asphalt rather than
 * letting a corner clip through the kerb.
 */
const CAR_HALF_LENGTH = CAR.width / 2 + CAR.footprintPadding;
const CAR_HALF_WIDTH = CAR.height / 2 + CAR.footprintPadding;

/**
 * Glue for one race: owns every car on the grid, advances physics, applies track
 * and car-to-car collisions, feeds each car through the shared lap/checkpoint
 * logic, and ranks the field. Phaser-free so it stays easy to reason about.
 */
export interface RaceSessionOptions {
  /**
   * When false, a player-opponent contact is still resolved physically but does
   * not fail the challenge. The game always leaves this on; tooling uses it to
   * study pure race physics without the challenge rule ending the run early.
   */
  collisionFailsChallenge?: boolean;
}

export class RaceSession {
  readonly race: RaceManager;
  readonly racers: Racer[];
  readonly player: Racer;
  readonly positionManager: RacePositionManager;
  /** See `RaceSessionOptions`. On in the game. */
  private readonly collisionFailsChallenge: boolean;
  /**
   * Set on the frame the player's collision box overlaps a live opponent's.
   * `resolveOutcome` turns it into a failure; GameScene reads it once (and
   * clears it) to play the impact effect. Never set once the race is terminal.
   */
  private playerContact: { depth: number; impact: number } | null = null;

  constructor(
    readonly layout: TrackLayout,
    configs: readonly RacerConfig[],
    driverFor?: (config: RacerConfig, tuning: CarTuning) => AiDriver | null,
    options: RaceSessionOptions = {},
  ) {
    const isUpsideDown = layout.definition.id === 'upside-down';
    this.collisionFailsChallenge = options.collisionFailsChallenge ?? true;
    this.race = new RaceManager(RACE.countdownSeconds, isUpsideDown ? 5.5 : 3.5);
    this.racers = configs.map((c) => new Racer(c, layout, driverFor));

    this.placeOnGrid();
    this.player = this.racers.find((r) => r.isPlayer) ?? this.racers[0];
    this.positionManager = new RacePositionManager(this.racers);
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

  step(dt: number, playerInput: InputState, abilityBoost: number = 1): void {
    const racing = this.race.isRacing;

    // The clock is shared by the whole field.
    this.race.update(dt * 1000);

    // 1. Drive every car. Finished cars keep coasting but stop being controlled.
    const prevs: { x: number; y: number }[] = [];
    for (const racer of this.racers) {
      prevs.push({ x: racer.physics.x, y: racer.physics.y });
      racer.justFinished = false;
      // Whether the driver is pushing forward, which is what arms the wall assist.
      let accelerating = false;

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

        accelerating = input.accelerate && !input.brake;

        // Nitro is driven entirely through InputState, so the player and the AI
        // share one code path.
        const wantBoost = racing && input.nitro && input.accelerate && !input.brake;
        const boost = racer.nitro.update(dt, wantBoost);
        const surface = this.layout.getSurface(racer.physics.x, racer.physics.y);
        
        const ab = racer.isPlayer ? abilityBoost : 1.0;
        racer.physics.step(dt, input, surface.dragMultiplier, boost, ab);
      }

      const hit = this.layout.resolveBoundary(
        racer.physics.x, racer.physics.y, racer.physics.heading, CAR_HALF_LENGTH, CAR_HALF_WIDTH,
      );
      if (hit) {
        // Held against the edge under power: ease the nose straight so the car
        // slides along the barrier instead of grinding to a stop on it. The
        // assist moves the nose, which changes how far the car reaches toward
        // the barrier, so the clamp below uses the heading it ends up with.
        if (accelerating) racer.physics.alignToWall(hit.nx, hit.ny, CAR.wallAssistRate, dt);
        const seated = this.layout.resolveBoundary(
          racer.physics.x, racer.physics.y, racer.physics.heading, CAR_HALF_LENGTH, CAR_HALF_WIDTH,
        );
        racer.physics.applyCollision(seated ?? hit);
      }
    }

    // 2. Cars cannot occupy the same space.
    this.separateCars();

    // Car-to-car pushes can shove a car past the barrier, so re-clamp the track
    // boundary afterwards and keep cars off each other as well.
    for (const racer of this.racers) {
      const hit = this.layout.resolveBoundary(
        racer.physics.x, racer.physics.y, racer.physics.heading, CAR_HALF_LENGTH, CAR_HALF_WIDTH,
      );
      if (hit) racer.physics.applyCollision(hit);
    }

    // 3. Feed every car through the same ordered checkpoint / lap logic.
    if (racing) {
      for (let i = 0; i < this.racers.length; i++) {
        const racer = this.racers[i];
        if (racer.finished) continue;
        const fraction = this.layout.fractionAt(racer.physics.x, racer.physics.y);
        const event = racer.laps.update(prevs[i], { x: racer.physics.x, y: racer.physics.y }, this.race.elapsed, fraction);
        racer.lastLapEvent = event;
        if (event === 'finished') racer.justFinished = true;
      }
      this.assignFinishPositions();
      this.resolveOutcome();
    }
  }

  /**
   * Decides whether the race is over, from what the cars actually did.
   *
   * Two outcomes, and the order of these checks is the whole rule:
   *
   *  - The player took the chequered flag -> the race is complete. Checked
   *    first, because a player who finished last is still a finisher, not a
   *    failure.
   *  - Every AI finished and the player had not -> the player failed. One or two
   *    AI finishing first is NOT a failure; that is the race working, with the
   *    player mid-field and still racing for a placing.
   *
   * The player's final lap is what ends the race, not the whole field coming
   * home. A finished player has no input left to give, so sitting through
   * whatever the AI still have to run just delays the results screen for no
   * gain. AI that are still on track when the flag drops are ranked behind the
   * player by how far they actually got -- `standings` already sorts finished
   * cars ahead of the rest -- so the final classification is unchanged, it just
   * arrives as soon as the player's race is decided.
   *
   * There is no timer anywhere in here. Both conditions are read off real finish
   * state on the frame it becomes true, and this only runs inside the
   * `if (racing)` block, so it can neither fire late (after the player has
   * actually finished) nor early.
   */
  private resolveOutcome(): void {
    // A confirmed collision ends the challenge first, even on the frame the
    // player would also have taken the flag. The rule is absolute: a collision
    // must never resolve into a completed run, so the completion screen can
    // never appear for a race that was failed.
    if (this.playerContact) {
      this.race.fail('collision');
      return;
    }
    if (this.player.finished) {
      this.race.finish();
      return;
    }
    if (this.aiFinishedCount() >= this.aiCount) {
      this.race.fail('outrun');
    }
  }

  /** Number of AI cars on the grid (every car that is not the player's). */
  private get aiCount(): number {
    return this.racers.filter((r) => !r.isPlayer).length;
  }

  /** How many AI cars have taken the chequered flag so far. */
  aiFinishedCount(): number {
    return this.racers.filter((r) => !r.isPlayer && r.finished).length;
  }

  /**
   * Finish order is derived from recorded times, not from the order cars happened
   * to be stepped in, so two cars crossing together are ordered fairly.
   *
   * Two cars in the same physics step share a timestamp, so the tie is broken on
   * how much of the road each has actually covered. That is deterministic and it
   * is decided by the racing itself, rather than by array order or a coin flip.
   */
  private assignFinishPositions(): void {
    const done = this.racers.filter((r) => r.laps.isComplete);
    if (done.length === 0) return;
    done.sort(
      (a, b) =>
        (a.laps.finishTimeMs ?? 0) - (b.laps.finishTimeMs ?? 0)
        || b.laps.progressTiebreak - a.laps.progressTiebreak,
    );
    done.forEach((racer, i) => {
      if (racer.finishPosition === null) racer.finishPosition = i + 1;
    });
  }

  /**
   * Resolves overlapping cars using each car's real oriented footprint, so the
   * hitbox matches the sprite and cars cannot drive through one another.
   *
   * Every pair is separated along its minimum-overlap normal and given a
   * velocity response along that normal. The response scales with how fast the
   * two cars were closing: a light rub just nudges them apart, while a head-on
   * hit bounces and scrubs a noticeable amount of speed. A car that has already
   * finished never blocks a car that is still racing.
   *
   * Resolved over a few passes: with four cars a single pass leaves them
   * overlapped, because pushing one pair apart can shove a car into a third that
   * the same pass has already walked past.
   */
  private separateCars(): void {
    const { halfLength, halfWidth } = COLLISION;

    for (let pass = 0; pass < SEPARATION_PASSES; pass++) {
      for (let i = 0; i < this.racers.length; i++) {
        for (let j = i + 1; j < this.racers.length; j++) {
          const ra = this.racers[i];
          const rb = this.racers[j];
          const a = ra.physics;
          const b = rb.physics;

          const contact = boxContact(
            { x: a.x, y: a.y, heading: a.heading, halfLength, halfWidth },
            { x: b.x, y: b.y, heading: b.heading, halfLength, halfWidth },
          );
          if (!contact) continue;

          // Only the first pass sees the true penetration, before any correction
          // has moved the cars; later passes are settling, not new impacts.
          if (pass === 0) this.notePlayerContact(ra, rb, contact);

          const { nx, ny, depth } = contact;
          const aDone = ra.finished;
          const bDone = rb.finished;

          // A finished car never blocks a car that is still racing: with exactly
          // one live car it absorbs none of the displacement, so the live car
          // takes all of it. Two finished cars have nobody to protect, and
          // pushing them apart normally is what stops them coasting to a stop
          // in the same spot -- which left cars visibly frozen inside one
          // another for as long as the results screen stayed up.
          const aShare = bDone && !aDone ? 1 : aDone && !bDone ? 0 : 0.5;
          const bShare = aDone && !bDone ? 1 : bDone && !aDone ? 0 : 0.5;

          a.x -= nx * depth * aShare;
          a.y -= ny * depth * aShare;
          b.x += nx * depth * bShare;
          b.y += ny * depth * bShare;

          // Velocity response, scaled by how hard the cars are closing. The
          // relative speed along the normal is negative while they approach.
          const relative = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
          if (relative >= 0) continue;

          const severity = Math.min(1, -relative / COLLISION.severeSpeed);
          const restitution =
            COLLISION.minRestitution + (COLLISION.maxRestitution - COLLISION.minRestitution) * severity;
          const impulse = (-relative * (1 + restitution)) / 2;
          a.vx -= nx * impulse * aShare;
          a.vy -= ny * impulse * aShare;
          b.vx += nx * impulse * bShare;
          b.vy += ny * impulse * bShare;

          // Both cars lose speed, more so on a hard hit. This is what makes a
          // scrape feel different from a head-on: severity is the closing speed.
          const scrub = 1 - COLLISION.maxSpeedLoss * severity;
          a.vx *= scrub;
          a.vy *= scrub;
          b.vx *= scrub;
          b.vy *= scrub;
        }
      }
    }
  }

  /**
   * Records a confirmed player-opponent contact, which fails the challenge.
   *
   * `boxContact` returns null for merely being close, so a hit needs a real
   * overlap -- but a sub-pixel tangential rub, the kind AI lane wander produces,
   * is not a collision and is filtered by `contactEpsilon` / `contactSpeed`.
   * Only a live race counts, and only an opponent that is still racing: a car
   * that has already taken the flag is coasting and parked on the track, and
   * failing the player for touching it would punish them for a car they cannot
   * avoid.
   */
  private notePlayerContact(ra: Racer, rb: Racer, contact: { nx: number; ny: number; depth: number }): void {
    if (!this.collisionFailsChallenge) return;
    if (!this.race.isRacing) return;

    const player = ra.isPlayer ? ra : rb.isPlayer ? rb : null;
    if (!player) return;
    const other = player === ra ? rb : ra;
    if (other.finished) return;

    const impact = Math.max(
      0,
      -((other.physics.vx - player.physics.vx) * contact.nx +
        (other.physics.vy - player.physics.vy) * contact.ny),
    );

    // A contact is confirmed when the cars are genuinely overlapping, or when
    // they met at speed. A sub-pixel tangential rub is neither: it is proximity,
    // not a collision, and must not end the challenge.
    if (contact.depth < COLLISION.contactEpsilon && impact < COLLISION.contactSpeed) return;

    // Keep the worst contact of the step, in case several pairs are resolved.
    if (this.playerContact && this.playerContact.depth >= contact.depth) return;
    this.playerContact = { depth: contact.depth, impact };
  }

  /**
   * Returns (and clears) the player-opponent contact recorded this step, so the
   * scene can play a one-shot impact effect. Null when there was none.
   */
  consumePlayerCollision(): { depth: number; impact: number } | null {
    const contact = this.playerContact;
    this.playerContact = null;
    return contact;
  }

  /** Live ranking. Finished cars hold their finish slot; the rest sort on progress. */
  standings(): StandingEntry[] {
    return this.positionManager.standings();
  }

  playerPosition(): number {
    return this.positionManager.playerPosition();
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

  /**
   * Final result once the race is over, otherwise null.
   *
   * The race is over in either of two cases: the player took the chequered
   * flag, or the player was beaten to the line by all of the AI. `outcome` tells
   * the results screen which one happened so a failed race never reads as
   * "RACE COMPLETE".
   *
   * Cars still on track at that moment are included in the classification
   * without a finish time, ordered behind the players who took the flag.
   */
  result(): RaceResult | null {
    if (!this.race.isOver) return null;
    const snap = this.race.snapshot();
    const board = this.standings();
    const me = this.racers.find((r) => r.isPlayer) ?? this.racers[0];
    const outcome = this.race.isFailed ? 'failed' : 'finished';
    const failureReason = this.race.isFailed ? (this.race.failureReason ?? 'outrun') : null;
    // On a failure the player never took the flag, so the elapsed clock is
    // what they are being shown as having been beaten in.
    const timeMs = me.laps.finishTimeMs ?? snap.elapsedMs;
    return {
      outcome,
      failureReason,
      // A completed run always crossed every lap without a collision, so its
      // time alone decides the stars. Failures never earn any.
      stars: outcome === 'finished' ? starsForTime(timeMs) : 0,
      timeMs,
      lapTimesMs: [...me.laps.lapTimesMs],
      lapsCompleted: me.laps.snapshot().lap,
      totalLaps: RACE.totalLaps,
      standings: board,
      playerPosition: board.find((s) => s.isPlayer)?.position ?? this.racers.length,
      playerBestLapMs: me.laps.bestLapMs,
      aiFinishedCount: this.aiFinishedCount(),
    };
  }

  /** Full reset for the retry path. */
  reset(): void {
    this.playerContact = null;
    for (const racer of this.racers) {
      racer.finishPosition = null;
      racer.justFinished = false;
      racer.lastLapEvent = 'none';
      racer.laps.reset();
      racer.nitro.reset();
      racer.ai?.reset();
    }
    this.placeOnGrid();
    this.race.reset();
  }
}