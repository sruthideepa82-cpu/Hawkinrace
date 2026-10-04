import type { Point } from '../config/tracks';

/** A line segment across the road that can be crossed in one direction only. */
export class Gate {
  constructor(
    readonly center: Point,
    /** Unit vector of the required travel direction. */
    readonly direction: Point,
    readonly halfWidth: number,
  ) {}

  /** Unit vector along the gate line. */
  get normal(): Point {
    return { x: -this.direction.y, y: this.direction.x };
  }

  /** True when the move prev -> cur crosses the gate travelling in `direction`. */
  crossedForward(prev: Point, cur: Point): boolean {
    const s0 = (prev.x - this.center.x) * this.direction.x + (prev.y - this.center.y) * this.direction.y;
    const s1 = (cur.x - this.center.x) * this.direction.x + (cur.y - this.center.y) * this.direction.y;
    if (!(s0 < 0 && s1 >= 0)) return false;
    const t = s0 / (s0 - s1);
    const hx = prev.x + (cur.x - prev.x) * t - this.center.x;
    const hy = prev.y + (cur.y - prev.y) * t - this.center.y;
    const n = this.normal;
    return Math.abs(hx * n.x + hy * n.y) <= this.halfWidth;
  }
}
