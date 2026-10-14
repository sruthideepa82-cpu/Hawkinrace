/**
 * Oriented-box car collision.
 *
 * A car is long and thin (roughly 84x38 on screen) and turns as it drives, so a
 * circle hitbox is either too small to stop cars overlapping nose-to-tail or so
 * large that side-by-side racing counts as a hit. Each car is therefore treated
 * as a rotated rectangle (an oriented bounding box) sized to its sprite, and two
 * cars are tested with the Separating Axis Theorem.
 *
 * Phaser-free so it can be driven headlessly, and so the race code keeps its
 * "no rendering types" rule.
 */

/** A car's collision footprint: centre, heading and half-extents. */
export interface CarBox {
  x: number;
  y: number;
  heading: number;
  /** Half the box's length, along the heading. */
  halfLength: number;
  /** Half the box's width, across the heading. */
  halfWidth: number;
}

/** The minimum translation that separates two boxes. */
export interface Contact {
  /** Unit normal pointing from box A toward box B. */
  nx: number;
  ny: number;
  /** How deep the boxes overlap along that normal (px). */
  depth: number;
}

/** The two edge normals of a box, which are also its SAT test axes. */
function axesOf(heading: number): [number, number][] {
  const c = Math.cos(heading);
  const s = Math.sin(heading);
  return [
    [c, s],
    [-s, c],
  ];
}

/**
 * Projects a box onto an axis and returns [min, max].
 *
 * A box's support along an axis is its centre projection plus/minus the extent
 * of each half-axis projected onto that same axis.
 */
function project(box: CarBox, ax: number, ay: number): [number, number] {
  const [fx, fy] = [Math.cos(box.heading), Math.sin(box.heading)];
  const [rx, ry] = [-fy, fx];
  const center = box.x * ax + box.y * ay;
  const radius =
    box.halfLength * Math.abs(fx * ax + fy * ay) +
    box.halfWidth * Math.abs(rx * ax + ry * ay);
  return [center - radius, center + radius];
}

/**
 * Contact between two oriented boxes, or null when they do not overlap.
 *
 * SAT: if any of the four edge normals separates the boxes, they are apart. If
 * none does, the axis with the smallest overlap is the cheapest way to push them
 * apart, and its direction is oriented from A to B.
 */
export function boxContact(a: CarBox, b: CarBox): Contact | null {
  const axes = [...axesOf(a.heading), ...axesOf(b.heading)];
  let bestDepth = Infinity;
  let bestX = 0;
  let bestY = 0;

  for (const [ax, ay] of axes) {
    const [aMin, aMax] = project(a, ax, ay);
    const [bMin, bMax] = project(b, ax, ay);
    const overlap = Math.min(aMax, bMax) - Math.max(aMin, bMin);
    if (overlap <= 0) return null;
    if (overlap < bestDepth) {
      bestDepth = overlap;
      bestX = ax;
      bestY = ay;
    }
  }

  // Point the normal from A to B, so a caller can push A back along -n and B
  // forward along +n regardless of which axis happened to win.
  if ((b.x - a.x) * bestX + (b.y - a.y) * bestY < 0) {
    bestX = -bestX;
    bestY = -bestY;
  }

  return { nx: bestX, ny: bestY, depth: bestDepth };
}
