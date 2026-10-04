export type RaceState = 'countdown' | 'racing' | 'finished';

export interface RaceSnapshot {
  state: RaceState;
  elapsedMs: number;
  countdownRemainingMs: number;
  finalTimeMs: number | null;
}

/**
 * Owns the shared race state and the race clock. It knows nothing about any
 * individual car: lap counting lives in `LapManager` (one per car) and the race
 * is declared over by the session once every entrant has finished.
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

  get currentState(): RaceState {
    return this.state;
  }

  get elapsed(): number {
    return this.elapsedMs;
  }

  /** Advances the clock. Returns true on the frame the countdown releases. */
  update(dtMs: number): boolean {
    if (this.state === 'countdown') {
      this.countdownRemainingMs -= dtMs;
      if (this.countdownRemainingMs <= 0) {
        this.countdownRemainingMs = 0;
        this.state = 'racing';
        return true;
      }
      return false;
    }
    if (this.state === 'racing') this.elapsedMs += dtMs;
    return false;
  }

  /** Called once every car has taken the chequered flag. */
  finish(): void {
    if (this.state === 'finished') return;
    this.state = 'finished';
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