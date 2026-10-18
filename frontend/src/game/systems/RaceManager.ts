/**
 * The race clock and the public phase of the race.
 *
 * `failed` is the player's own outcome and is NOT a synonym for `finished`:
 * it means every AI car took the chequered flag while the player was still out
 * on track. The race is over either way, but the two are reported differently,
 * so they stay distinct states all the way to the results screen.
 */
import { Timer } from './Timer';

export type RaceState =
  | 'intro'
  | 'countdown'
  | 'racing'
  | 'lapTransition'
  | 'paused'
  | 'finished'
  | 'failed';

/**
 * The race's public phase, as required by the challenge state machine.
 *
 * `intro` and `countdown` are both still the run being prepared, so they share
 * `READY`; the internal `RaceState` keeps them distinct because the HUD draws a
 * different thing for each. The lap transition is a live race (the clock keeps
 * running and the car keeps driving), so it is `RACING`. `PAUSED` is its own
 * phase because it is the one state in which nothing advances. `FAILED` and
 * `COMPLETED` are terminal: once the race reaches one, nothing may move it, and
 * no timer, lap or collision update may change the result.
 */
export type RacePhase = 'READY' | 'RACING' | 'PAUSED' | 'FAILED' | 'COMPLETED';

/** Why the race ended in `FAILED`. See `RaceResult.failureReason`. */
export type RaceFailureReason = 'collision' | 'outrun';

export interface RaceSnapshot {
  state: RaceState;
  elapsedMs: number;
  countdownRemainingMs: number;
  /** Time left on the lap-completed card; 0 when there is no card up. */
  lapTransitionRemainingMs: number;
  finalTimeMs: number | null;
}

/** How long the "LAP COMPLETE" card stays up after a lap is banked. */
export const LAP_TRANSITION_MS = 2800;

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
  private lapTransitionRemainingMs = 0;
  private finalTimeMs: number | null = null;
  private failReason: RaceFailureReason | null = null;
  /**
   * The live state to return to when a pause ends. Only ever a state in which
   * the clock was running, so resuming can never restart a countdown or revive
   * a finished race.
   */
  private pausedFrom: RaceState = 'racing';

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
    this.lapTransitionRemainingMs = 0;
    this.finalTimeMs = null;
    this.failReason = null;
    this.pausedFrom = 'racing';
  }

  /**
   * True while the race is on: the clock is running and the cars are being
   * driven. This covers the lap-transition card, which deliberately does NOT
   * stop the race -- it is a notification over live driving, so the player's
   * car keeps its place and the total race time keeps accumulating.
   */
  get isRacing(): boolean {
    return this.state === 'racing' || this.state === 'lapTransition';
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

  get isPaused(): boolean {
    return this.state === 'paused';
  }

  get currentState(): RaceState {
    return this.state;
  }

  /** The public state machine phase: READY / RACING / PAUSED / FAILED / COMPLETED. */
  get phase(): RacePhase {
    switch (this.state) {
      case 'intro':
      case 'countdown':
        return 'READY';
      case 'racing':
      case 'lapTransition':
        return 'RACING';
      case 'paused':
        return 'PAUSED';
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

  /** True while the lap-completed card is up. */
  get isLapTransition(): boolean {
    return this.state === 'lapTransition';
  }

  /** Advances the clock. Returns true on the frame the countdown releases. */
  update(dtMs: number): void {
    // Terminal states are frozen: the clock must not keep running after a
    // failure or a finish, so results never drift.
    if (this.isOver) return;
    // A pause freezes everything, the countdown and the race clock alike, so
    // the time on screen is the time the player actually spent racing.
    if (this.isPaused) return;
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
    if (this.state === 'lapTransition') {
      this.lapTransitionRemainingMs -= dtMs;
      // The card times out back into a plain race; if the next lap lands first,
      // `beginLapTransition` restarts the card with that lap's real time.
      if (this.lapTransitionRemainingMs <= 0) {
        this.lapTransitionRemainingMs = 0;
        this.state = 'racing';
      }
    }
    if (this.isRacing) this.timer.update(dtMs);
  }

  /**
   * Puts the lap-completed card up. The race itself does not stop: the car
   * keeps its position and speed, and the race clock keeps running, so the
   * total time shown at the flag is the time actually driven.
   *
   * Ignored unless the race is live, so a lap banked on the same frame the race
   * ends cannot leave the card up over the results screen.
   */
  beginLapTransition(durationMs: number = LAP_TRANSITION_MS): void {
    if (!this.isRacing) return;
    this.state = 'lapTransition';
    this.lapTransitionRemainingMs = durationMs;
  }

  /** Dismisses the lap card early (used by the retry path and by tests). */
  endLapTransition(): void {
    if (this.state !== 'lapTransition') return;
    this.lapTransitionRemainingMs = 0;
    this.state = 'racing';
  }

  /**
   * Freezes the race. Only a live race can be paused, so pausing can never
   * catch a countdown, a finished race or a failed one. The state it came from
   * is remembered so `resume` puts it back exactly as it was, card included.
   *
   * Returns true if this call did the pausing, so the caller knows whether it
   * should react (release the controls, clear held keys).
   */
  pause(): boolean {
    if (!this.isRacing) return false;
    this.pausedFrom = this.state;
    this.state = 'paused';
    return true;
  }

  /** Un-freezes a paused race, restoring the state it was paused from. */
  resume(): boolean {
    if (!this.isPaused) return false;
    this.state = this.pausedFrom;
    return true;
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
    this.lapTransitionRemainingMs = 0;
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
    this.lapTransitionRemainingMs = 0;
    this.finalTimeMs = this.timer.elapsed;
  }

  snapshot(): RaceSnapshot & { introRemainingMs: number } {
    return {
      state: this.state,
      elapsedMs: this.timer.elapsed,
      introRemainingMs: this.introRemainingMs,
      countdownRemainingMs: this.countdownRemainingMs,
      lapTransitionRemainingMs: this.lapTransitionRemainingMs,
      finalTimeMs: this.finalTimeMs,
    };
  }
}