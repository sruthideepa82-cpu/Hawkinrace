/** Tracks the total race time. */
export class Timer {
  private elapsedMs = 0;

  update(dtMs: number): void {
    this.elapsedMs += dtMs;
  }

  get elapsed(): number {
    return this.elapsedMs;
  }

  reset(): void {
    this.elapsedMs = 0;
  }
}
