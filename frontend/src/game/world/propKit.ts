/**
 * Procedural top-down scenery.
 *
 * Every prop is drawn straight into a Phaser Graphics object, so there are no
 * image files to 404 and nothing to download at runtime. Each routine draws
 * looking DOWN at the thing -- so a tree is a canopy from above with a little
 * trunk offset for parallax, not a side-on tree pasted flat.
 *
 * Colour is passed in rather than hard-coded so a track theme can re-tint a prop
 * without editing the drawing. `rand` is injected so a bake is reproducible: the
 * same track always builds the same town.
 */

/** Every scenery piece the world builder knows how to place. */
export type PropKind =
  | 'pine'
  | 'broadleaf'
  | 'deadTree'
  | 'bush'
  | 'rock'
  | 'fence'
  | 'streetlight'
  | 'floodlight'
  | 'lantern'
  | 'house'
  | 'shopfront'
  | 'warehouse'
  | 'tendril'
  | 'floatRock'
  | 'sporePod';

/** A deterministic source of 0..1 values. */
export type Rand = () => number;

/** Draws a pine seen from above: layered canopy, dark core, cool rim light. */
function pine(g: Phaser.GameObjects.Graphics, x: number, y: number, s: number): void {
  const r = 20 * s;
  // Trunk, offset slightly so the canopy reads as raised.
  g.fillStyle(0x0a0d0b, 1).fillCircle(x + 2 * s, y + 3 * s, r * 0.18);
  // Three stacked cones, widening downward, all seen from above.
  for (let i = 0; i < 3; i++) {
    const rr = r * (1 - i * 0.26);
    g.fillStyle(0x0a1410 + i * 0x030806, 1);
    g.fillCircle(x, y - i * 1.5 * s, rr);
  }
  // Rim light on one side, the way moonlight catches the canopy.
  g.fillStyle(0x16281c, 0.85).fillCircle(x - r * 0.32, y - r * 0.32, r * 0.42);
  g.lineStyle(1, 0x24402c, 0.5);
  g.strokeCircle(x, y, r * 0.95);
}

/** A broadleaf tree from above: clumped canopy with a couple of gaps. */
function broadleaf(g: Phaser.GameObjects.Graphics, x: number, y: number, s: number, rand: Rand): void {
  const r = 22 * s;
  g.fillStyle(0x090d0a, 1).fillCircle(x + 2 * s, y + 3 * s, r * 0.2);
  g.fillStyle(0x0d1a12, 1).fillCircle(x, y, r);
  // Canopy clumps, so it is not a flat disc.
  for (let i = 0; i < 4; i++) {
    const a = rand() * Math.PI * 2;
    const d = rand() * r * 0.55;
    g.fillStyle(0x132418, 1).fillCircle(x + Math.cos(a) * d, y + Math.sin(a) * d, r * (0.4 + rand() * 0.3));
  }
  g.fillStyle(0x24402c, 0.5).fillCircle(x - r * 0.3, y - r * 0.3, r * 0.28);
  g.lineStyle(1, 0x1d3323, 0.45);
  g.strokeCircle(x, y, r * 0.92);
}

/** A dead tree: bare branches radiating from a hollow centre. */
function deadTree(g: Phaser.GameObjects.Graphics, x: number, y: number, s: number, rand: Rand, tint = 0x2a1a18): void {
  const r = 24 * s;
  g.fillStyle(0x060405, 1).fillCircle(x, y, r * 0.28);
  const limbs = 6 + Math.floor(rand() * 3);
  g.lineStyle(3.2 * s, tint, 1);
  for (let i = 0; i < limbs; i++) {
    const a = (i / limbs) * Math.PI * 2 + rand() * 0.4;
    const len = r * (0.6 + rand() * 0.55);
    const ex = x + Math.cos(a) * len;
    const ey = y + Math.sin(a) * len;
    g.lineBetween(x, y, ex, ey);
    // One fork per limb.
    const fa = a + (rand() - 0.5) * 1.1;
    g.lineStyle(1.8 * s, tint, 0.9);
    g.lineBetween(ex, ey, ex + Math.cos(fa) * len * 0.4, ey + Math.sin(fa) * len * 0.4);
    g.lineStyle(3.2 * s, tint, 1);
  }
}

/** Low scrub. */
function bush(g: Phaser.GameObjects.Graphics, x: number, y: number, s: number): void {
  const r = 11 * s;
  g.fillStyle(0x0a1410, 1).fillCircle(x, y, r);
  g.fillStyle(0x122219, 1).fillCircle(x + r * 0.3, y + r * 0.2, r * 0.6);
  g.fillStyle(0x1c3324, 0.6).fillCircle(x - r * 0.3, y - r * 0.3, r * 0.4);
}

/** Angular rock, lit from the upper left. */
function rock(g: Phaser.GameObjects.Graphics, x: number, y: number, s: number, rand: Rand, tint: number = 0x1a1f26): void {
  const r = 14 * s;
  const pts: { x: number; y: number }[] = [];
  const n = 6;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (0.7 + rand() * 0.5);
    pts.push({ x: x + Math.cos(a) * rr, y: y + Math.sin(a) * rr });
  }
  g.fillStyle(tint, 1);
  g.fillPoints(pts, true, true);
  // Highlight face.
  g.fillStyle(tint + 0x0a0f14, 0.85);
  g.fillCircle(x - r * 0.25, y - r * 0.28, r * 0.4);
  g.lineStyle(1, 0x2c3540, 0.6);
  g.strokePoints(pts, true, true);
}

/**
 * A run of fencing along the road. Drawn as a short linked segment rather than
 * one object per panel, which is what makes a band read as a continuous fence
 * instead of a row of disconnected posts.
 */
function fence(g: Phaser.GameObjects.Graphics, x: number, y: number, s: number, angle: number): void {
  const len = 30 * s;
  const dx = Math.cos(angle) * len;
  const dy = Math.sin(angle) * len;
  // Ground shadow, then the rail, then posts.
  g.lineStyle(2.5 * s, 0x0a0b10, 0.85);
  g.lineBetween(x + dx * 0.5, y + dy * 0.5 + 3 * s, x + dx * 1.5, y + dy * 1.5 + 3 * s);
  g.lineStyle(2 * s, 0x4a4436, 0.9);
  g.lineBetween(x + dx * 0.5, y + dy * 0.5, x + dx * 1.5, y + dy * 1.5);
  g.fillStyle(0x585040, 0.95);
  g.fillRect(x + dx * 0.5 - 1.6 * s, y + dy * 0.5 - 1.6 * s, 3.2 * s, 3.2 * s);
  g.fillRect(x + dx * 1.5 - 1.6 * s, y + dy * 1.5 - 1.6 * s, 3.2 * s, 3.2 * s);
}

/**
 * Street lighting: a warm pool on the ground with the lamp head at the centre.
 * The pool is what actually sells it at night -- a bare dot reads as a bug.
 */
function lamp(
  g: Phaser.GameObjects.Graphics,
  x: number, y: number, s: number,
  color: number, radius: number, intensity: number,
): void {
  // Light pool, drawn as concentric fading rings so it blends without a filter.
  for (let i = 3; i >= 1; i--) {
    g.fillStyle(color, (intensity / (i * 1.7)) * 0.5);
    g.fillCircle(x, y, radius * (i / 3));
  }
  // Arm and head.
  g.fillStyle(0x14161c, 1).fillCircle(x, y, 3.4 * s);
  g.fillStyle(0x2a2e38, 1).fillCircle(x, y, 2.2 * s);
  g.fillStyle(color, 0.95).fillCircle(x, y, 1.6 * s);
}

/** A suburban house: roof, ridge line, driveway and a lit porch. */
function house(g: Phaser.GameObjects.Graphics, x: number, y: number, s: number, rand: Rand): void {
  const w = 58 * s;
  const h = 44 * s;
  const rot = rand() * 0.4 - 0.2;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const corner = (lx: number, ly: number) => ({ x: x + lx * cos - ly * sin, y: y + lx * sin + ly * cos });

  // Drop shadow to lift it off the ground.
  g.fillStyle(0x05060b, 0.55);
  const s0 = corner(-w / 2 + 4, -h / 2 + 5);
  const s1 = corner(w / 2 + 4, -h / 2 + 5);
  const s2 = corner(w / 2 + 4, h / 2 + 5);
  const s3 = corner(-w / 2 + 4, h / 2 + 5);
  g.fillPoints([s0, s1, s2, s3], true, true);

  const p0 = corner(-w / 2, -h / 2);
  const p1 = corner(w / 2, -h / 2);
  const p2 = corner(w / 2, h / 2);
  const p3 = corner(-w / 2, h / 2);
  g.fillStyle(0x1a1d2a, 1);
  g.fillPoints([p0, p1, p2, p3], true, true);
  // Roof ridge, so it is not a plain rectangle.
  g.fillStyle(0x242838, 1);
  g.fillPoints([corner(-w / 2, -2 * s), corner(w / 2, -2 * s), corner(w / 2, 2 * s), corner(-w / 2, 2 * s)], true, true);
  g.lineStyle(1, 0x323849, 0.7);
  g.strokePoints([p0, p1, p2, p3], true, true);

  // Lit window and a warm porch light.
  const win = corner(w * 0.22, -h * 0.12);
  g.fillStyle(0xffc46b, 0.85).fillRect(win.x - 4 * s, win.y - 3 * s, 8 * s, 6 * s);
  const porch = corner(-w * 0.34, h * 0.5);
  g.fillStyle(0xffb02e, 0.14).fillCircle(porch.x, porch.y, 26 * s);
  g.fillStyle(0xffd07a, 0.9).fillCircle(porch.x, porch.y, 2.4 * s);

  // Driveway reaching back toward the road.
  const d0 = corner(-w * 0.1, h / 2);
  const d1 = corner(w * 0.28, h / 2);
  const d2 = corner(w * 0.46, h / 2 + 44 * s);
  const d3 = corner(w * 0.1, h / 2 + 44 * s);
  g.fillStyle(0x191c24, 0.9);
  g.fillPoints([d0, d1, d2, d3], true, true);
}

/** A shopfront: flat roof, a coloured sign, and light spilling onto the road. */
function shopfront(g: Phaser.GameObjects.Graphics, x: number, y: number, s: number, rand: Rand, neon: readonly number[]): void {
  const w = 66 * s;
  const h = 48 * s;
  const rot = rand() * 0.3 - 0.15;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const corner = (lx: number, ly: number) => ({ x: x + lx * cos - ly * sin, y: y + lx * sin + ly * cos });

  g.fillStyle(0x05060b, 0.5);
  g.fillPoints(
    [corner(-w / 2 + 4, -h / 2 + 5), corner(w / 2 + 4, -h / 2 + 5), corner(w / 2 + 4, h / 2 + 5), corner(-w / 2 + 4, h / 2 + 5)],
    true, true,
  );
  g.fillStyle(0x14161f, 1);
  g.fillPoints([corner(-w / 2, -h / 2), corner(w / 2, -h / 2), corner(w / 2, h / 2), corner(-w / 2, h / 2)], true, true);
  g.lineStyle(1.5, 0x2a3040, 0.8);
  g.strokePoints([corner(-w / 2, -h / 2), corner(w / 2, -h / 2), corner(w / 2, h / 2), corner(-w / 2, h / 2)], true, true);

  // Sign, and the glow it throws.
  const c = neon[Math.floor(rand() * neon.length) % neon.length];
  const sc = corner(0, -h * 0.3);
  g.fillStyle(c, 0.1).fillCircle(sc.x, sc.y, 58 * s);
  g.fillStyle(c, 0.85).fillRect(sc.x - 14 * s, sc.y - 3 * s, 28 * s, 6 * s);
}

/** A large industrial block: long roof, roof lights, service door. */
function warehouse(g: Phaser.GameObjects.Graphics, x: number, y: number, s: number, rand: Rand): void {
  const w = 92 * s;
  const h = 56 * s;
  const rot = rand() * 0.24 - 0.12;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const corner = (lx: number, ly: number) => ({ x: x + lx * cos - ly * sin, y: y + lx * sin + ly * cos });

  g.fillStyle(0x04050a, 0.55);
  g.fillPoints(
    [corner(-w / 2 + 5, -h / 2 + 6), corner(w / 2 + 5, -h / 2 + 6), corner(w / 2 + 5, h / 2 + 6), corner(-w / 2 + 5, h / 2 + 6)],
    true, true,
  );
  g.fillStyle(0x13161c, 1);
  g.fillPoints([corner(-w / 2, -h / 2), corner(w / 2, -h / 2), corner(w / 2, h / 2), corner(-w / 2, h / 2)], true, true);
  // Corrugated ribs.
  g.lineStyle(1, 0x1e232c, 0.9);
  for (let i = 1; i < 7; i++) {
    const lx = -w / 2 + (w * i) / 7;
    g.lineBetween(corner(lx, -h / 2).x, corner(lx, -h / 2).y, corner(lx, h / 2).x, corner(lx, h / 2).y);
  }
  // Skylights.
  for (let i = 0; i < 3; i++) {
    const k = corner(-w * 0.3 + i * w * 0.3, -h * 0.1);
    g.fillStyle(0x6fd0ff, 0.16).fillRect(k.x - 7 * s, k.y - 4 * s, 14 * s, 8 * s);
  }
  g.lineStyle(1.5, 0x2a3038, 0.8);
  g.strokePoints([corner(-w / 2, -h / 2), corner(w / 2, -h / 2), corner(w / 2, h / 2), corner(-w / 2, h / 2)], true, true);
}

/** A twisted root tendril, creeping across the ground. */
function tendril(g: Phaser.GameObjects.Graphics, x: number, y: number, s: number, rand: Rand): void {
  const len = 70 * s;
  g.lineStyle(9 * s, 0x0a0306, 1);
  g.beginPath();
  g.moveTo(x, y);
  let cx = x;
  let cy = y;
  let a = rand() * Math.PI * 2;
  for (let i = 0; i < 5; i++) {
    a += (rand() - 0.5) * 1.3;
    cx += Math.cos(a) * (len / 5);
    cy += Math.sin(a) * (len / 5);
    g.lineTo(cx, cy);
  }
  g.strokePath();
  // Inner highlight and a red rim, which is what makes it read as organic.
  g.lineStyle(3 * s, 0x3a0a18, 1);
  g.beginPath();
  g.moveTo(x, y);
  g.lineTo(cx, cy);
  g.strokePath();
  g.fillStyle(0xff2a4a, 0.5).fillCircle(cx, cy, 3.4 * s);
  g.fillStyle(0xff2a4a, 0.12).fillCircle(cx, cy, 16 * s);
}

/** A rock that is not attached to the ground. Given a drop shadow to float. */
function floatRock(g: Phaser.GameObjects.Graphics, x: number, y: number, s: number, rand: Rand): void {
  const r = 16 * s;
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const rr = r * (0.65 + rand() * 0.65);
    pts.push({ x: x + Math.cos(a) * rr, y: y + Math.sin(a) * rr });
  }
  g.fillStyle(0x1a0a12, 1);
  g.fillPoints(pts, true, true);
  g.fillStyle(0x2c1220, 0.9);
  g.fillCircle(x - r * 0.2, y - r * 0.24, r * 0.44);
  g.lineStyle(1.4, 0x6d1730, 0.75);
  g.strokePoints(pts, true, true);
  // A vein of red running through it.
  g.lineStyle(1.6, 0xff2a4a, 0.45);
  g.lineBetween(x - r * 0.7, y + r * 0.2, x + r * 0.7, y - r * 0.2);
}

/** A swollen spore pod: dark sac with an internal glow. */
function sporePod(g: Phaser.GameObjects.Graphics, x: number, y: number, s: number, rand: Rand): void {
  const r = 13 * s;
  g.fillStyle(0x0d0206, 1).fillCircle(x, y, r);
  for (let i = 0; i < 3; i++) {
    const a = rand() * Math.PI * 2;
    const d = rand() * r * 0.5;
    g.fillStyle(0x2a0612, 1).fillCircle(x + Math.cos(a) * d, y + Math.sin(a) * d, r * 0.55);
  }
  g.fillStyle(0xff2a4a, 0.5).fillCircle(x, y, r * 0.3);
  g.fillStyle(0xff2a4a, 0.12).fillCircle(x, y, r * 2.1);
  g.lineStyle(1.2, 0x5c1226, 0.7);
  g.strokeCircle(x, y, r * 0.95);
}

/**
 * Draws one prop. `angle` is the road direction at that point, so props that
 * have an orientation (fences, buildings) line up with the street.
 *
 * Neon colours are passed in per theme rather than fixed, which is how the
 * Upside Down ends up with crimson props and Starcourt with cyan.
 */
export function drawProp(
  g: Phaser.GameObjects.Graphics,
  kind: PropKind,
  x: number,
  y: number,
  scale: number,
  angle: number,
  rand: Rand,
  palette: { neon: readonly number[]; lampColor: number },
): void {
  switch (kind) {
    case 'pine': pine(g, x, y, scale); break;
    case 'broadleaf': broadleaf(g, x, y, scale, rand); break;
    case 'deadTree': deadTree(g, x, y, scale, rand); break;
    case 'bush': bush(g, x, y, scale); break;
    case 'rock': rock(g, x, y, scale, rand); break;
    case 'fence': fence(g, x, y, scale, angle); break;
    case 'streetlight': lamp(g, x, y, scale, palette.lampColor, 120 * scale, 1); break;
    case 'floodlight': lamp(g, x, y, scale, 0xdfe8ff, 150 * scale, 1.15); break;
    case 'lantern': lamp(g, x, y, scale, 0x6fe0b0, 86 * scale, 0.8); break;
    case 'house': house(g, x, y, scale, rand); break;
    case 'shopfront': shopfront(g, x, y, scale, rand, palette.neon); break;
    case 'warehouse': warehouse(g, x, y, scale, rand); break;
    case 'tendril': tendril(g, x, y, scale, rand); break;
    case 'floatRock': floatRock(g, x, y, scale, rand); break;
    case 'sporePod': sporePod(g, x, y, scale, rand); break;
  }
}