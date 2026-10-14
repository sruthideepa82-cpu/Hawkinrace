/**
 * `failed` is the player's own outcome and is NOT a synonym for `finished`:
 * it means every AI car took the chequered flag while the player was still out
 * on track. The race is over either way, but the two are reported differently,
 * so they stay distinct states all the way to the results screen.
 */
import { Timer } from './Timer';

export type RaceState = 'intro' | 'countdown' | 'racing' | 'finished' | 'failed';

/**
 * The race's public phase, as required by the challenge state machine.
 *
 * `intro` and `countdown` are both still the run being prepared, so they share
 * `READY`; the internal `RaceState` keeps them distinct because the HUD draws a
 * different thing for each. `FAILED` and `COMPLETED` are terminal: once the race
 * reaches one, nothing may move it, and no timer, lap or collision update may
 * change the result.
 */
export type RacePhase = 'READY' | 'RACING' | 'FAILED' | 'COMPLETED';

/** Why the race ended in `FAILED`. See `RaceResult.failureReason`. */
export type RaceFailureReason = 'collision' | 'outrun';

export interface RaceSnapshot {
  state: RaceState;
  elapsedMs: number;
  countdownRemainingMs: number;
  finalTimeMs: number | null;
}

/**
 * Owns the shared race state and the race clock. It knows nothing about any
 * individual car: lap counting lives in `LapManager` (one per car), and the race
 * is declared over by the session -- either because the player took the
 * chequered flag, or because every AI car finished with the player still out on
 * track.
 */
export class RaceManager {
  private state: RaceState = 'intro';
  private timer = new Timer();
  private introRemainingMs: number;
  private countdownRemainingMs: number;
  private finalTimeMs: number | null = null;
  private failReason: RaceFailureReason | null = null;

  constructor(private readonly countdownSeconds: number, private readonly introSeconds: number = 3.5) {
    this.introRemainingMs = introSeconds * 1000;
    this.countdownRemainingMs = countdownSeconds * 1000;
  }

  /** Full reset for the retry path: clock zeroed, lights back on. */
  reset(): void {
    this.state = 'intro';
    this.timer.reset();
    this.introRemainingMs = this.introSeconds * 1000;
    this.countdownRemainingMs = this.countdownSeconds * 1000;
    this.finalTimeMs = null;
    this.failReason = null;
  }

  get isRacing(): boolean {
    return this.state === 'racing';
  }

  get isFinished(): boolean {
    return this.state === 'finished';
  }

  /** True once every AI car has finished and the player has not. */
  get isFailed(): boolean {
    return this.state === 'failed';
  }

  /**
   * True when the race is over for any reason. The session and the HUD use this
   * rather than `isFinished` so a failed race stops being driven and handed off
   * to the results screen exactly like a completed one.
   */
  get isOver(): boolean {
    return this.state === 'finished' || this.state === 'failed';
  }

  get currentState(): RaceState {
    return this.state;
  }

  /** The public state machine phase: READY / RACING / FAILED / COMPLETED. */
  get phase(): RacePhase {
    switch (this.state) {
      case 'intro':
      case 'countdown':
        return 'READY';
      case 'racing':
        return 'RACING';
      case 'failed':
        return 'FAILED';
      case 'finished':
        return 'COMPLETED';
    }
  }

  /** True once the race can no longer change: FAILED or COMPLETED. */
  get isTerminal(): boolean {
    return this.isOver;
  }

  /** Why the race failed, or null while racing / on a completion. */
  get failureReason(): RaceFailureReason | null {
    return this.failReason;
  }

  get elapsed(): number {
    return this.timer.elapsed;
  }

  /** Advances the clock. Returns true on the frame the countdown releases. */
  update(dtMs: number): void {
    // Terminal states are frozen: the clock must not keep running after a
    // failure or a finish, so results never drift.
    if (this.isOver) return;
    if (this.state === 'intro') {
      this.introRemainingMs -= dtMs;
      if (this.introRemainingMs <= 0) {
        this.introRemainingMs = 0;
        this.state = 'countdown';
      }
      return;
    }
    if (this.state === 'countdown') {
      this.countdownRemainingMs -= dtMs;
      if (this.countdownRemainingMs <= 0) {
        this.countdownRemainingMs = 0;
        this.state = 'racing';
      }
      return;
    }
    if (this.state === 'racing') this.timer.update(dtMs);
  }

  /**
   * Called once the player has taken the chequered flag, which ends the race for
   * them however much of the field is still running behind.
   *
   * Guarded against running after the race has already ended for any other
   * reason, so a failure that landed on the same frame cannot be overwritten.
   */
  finish(): void {
    if (this.isOver) return;
    this.state = 'finished';
    this.failReason = null;
    this.finalTimeMs = this.timer.elapsed;
  }

  /**
   * Ends the race in failure. Guarded so a terminal state can never be
   * overwritten -- in particular a completion on the same frame as a collision
   * stays whatever was applied first, and `resolveOutcome` deliberately applies
   * the collision first.
   *
   * `reason` distinguishes the challenge rule (a player-opponent collision) from
   * the original race rule (every AI finishing first).
   */
  fail(reason: RaceFailureReason = 'outrun'): void {
    if (this.isOver) return;
    this.state = 'failed';
    this.failReason = reason;
    this.finalTimeMs = this.timer.elapsed;
  }

  snapshot(): RaceSnapshot & { introRemainingMs: number } {
    return {
      state: this.state,
      elapsedMs: this.timer.elapsed,
      introRemainingMs: this.introRemainingMs,
      countdownRemainingMs: this.countdownRemainingMs,
      finalTimeMs: this.finalTimeMs,
    };
  }
}