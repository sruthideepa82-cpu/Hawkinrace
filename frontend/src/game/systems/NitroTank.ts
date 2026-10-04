/**
 * Nitro tank for one car. Nitro is spent while held, refills while not, and is
 * capped at what the driver and chassis can hold. Kept separate from
 * `CarPhysics` so the physics stays a pure function of its inputs.
 */
export class NitroTank {
  /** Seconds of boost currently available. */
  private amount = 0;

  /** True while the boost is being applied this frame. */
  active = false;

  constructor(
    private readonly capacity: number,
    private readonly drain: number,
    private readonly regen: number,
  ) {
    this.amount = capacity;
  }

  get level(): number {
    return this.amount;
  }

  /** 0..1 fill fraction, for the HUD bar. */
  get fraction(): number {
    return this.capacity <= 0 ? 0 : this.amount / this.capacity;
  }

  get isEmpty(): boolean {
    return this.amount <= 0.01;
  }

  get isFull(): boolean {
    return this.amount >= this.capacity - 0.01;
  }

  /**
   * Consumes nitro when `wanted`, otherwise refills. `dt` is in seconds.
   * Returns the 0..1 boost level to feed `CarPhysics.step`.
   */
  update(dt: number, wanted: boolean): number {
    if (wanted && this.amount > 0) {
      this.amount = Math.max(0, this.amount - this.drain * dt);
      this.active = true;
    } else {
      this.amount = Math.min(this.capacity, this.amount + this.regen * dt);
      this.active = false;
    }
    return this.fraction;
  }

  /** Full reset, used by the retry path. */
  reset(): void {
    this.amount = this.capacity;
    this.active = false;
  }
}