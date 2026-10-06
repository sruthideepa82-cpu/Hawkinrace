/**
 * `failed` is the player's own outcome and is NOT a synonym for `finished`:
 * it means every AI car took the chequered flag while the player was still out
 * on track. The race is over either way, but the two are reported differently,
 * so they stay distinct states all the way to the results screen.
 */
export type RaceState = 'countdown' | 'racing' | 'finished' | 'failed';

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
  private state: RaceState = 'countdown';
  private elapsedMs = 0;
  private countdownRemainingMs: number;
  private finalTimeMs: number | null = null;

  constructor(private readonly countdownSeconds: number) {
    this.countdownRemainingMs = countdownSeconds * 1000;
  }

  /** Full reset for the retry path: clock zeroed, lights back on. */
  reset(): void {
    this.state = 'countdown';
    this.elapsedMs = 0;
    this.countdownRemainingMs = this.countdownSeconds * 1000;
    this.finalTimeMs = null;
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

  get elapsed(): number {
    return this.elapsedMs;
  }

  /** Advances the clock. Returns true on the frame the countdown releases. */
  update(dtMs: number): void {
    if (this.state === 'countdown') {
      this.countdownRemainingMs -= dtMs;
      if (this.countdownRemainingMs <= 0) {
        this.countdownRemainingMs = 0;
        this.state = 'racing';
      }
      return;
    }
    if (this.state === 'racing') this.elapsedMs += dtMs;
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
    this.finalTimeMs = this.elapsedMs;
  }

  /**
   * Called the moment the last AI car finishes with the player still racing.
   *
   * This is driven by the real finishing state, not by a timer: the caller
   * passes what actually happened on track, so there is no window in which the
   * player can be failed while they are actually ahead, and no race that fails
   * early. The player cannot then finish, because lap counting is gated on
   * `isRacing` and that is now false.
   */
  fail(): void {
    if (this.isOver) return;
    this.state = 'failed';
    this.finalTimeMs = this.elapsedMs;
  }

  snapshot(): RaceSnapshot {
    return {
      state: this.state,
      elapsedMs: this.elapsedMs,
      countdownRemainingMs: this.countdownRemainingMs,
      finalTimeMs: this.finalTimeMs,
    };
  }
}