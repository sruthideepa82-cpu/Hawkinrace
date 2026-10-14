/**
 * Headless verification of the challenge overhaul.
 *
 * Covers the parts of the feature that live in Phaser-free code: oriented-box
 * car collision, the single-lap rule, the collision-failure state machine, the
 * terminal guards, the star thresholds and the reset path. The Phaser scene and
 * the React screens are not driven here (they need a DOM); those were checked by
 * typecheck plus inspection.
 *
 * Run with:
 *   node --experimental-transform-types --import ./tools/register.mjs \
 *     tools/challengeTest.ts
 */
import { TrackLayout } from '../src/game/entities/TrackLayout';
import { getTrackDefinition } from '../src/game/config/tracks';
import { buildGrid, getAiProfile, type RacerConfig } from '../src/game/config/racers';
import { RaceSession } from '../src/game/systems/RaceSession';
import { AiDriver } from '../src/game/systems/AiDriver';
import { LapManager } from '../src/game/systems/LapManager';
import { boxContact, type CarBox } from '../src/game/systems/CarCollision';
import { starsForTime } from '../src/game/systems/Challenge';
import { CAR, CHALLENGE, COLLISION, RACE } from '../src/game/config/GameConfig';
import type { CarTuning } from '../src/game/config/carTuning';
import type { InputState } from '../src/game/entities/CarPhysics';
import { CHARACTERS } from '../src/data/characters';
import { CARS } from '../src/data/cars';
import type { Gate } from '../src/game/systems/Gate';

const STEP = 1 / 120;
const NO_INPUT: InputState = { accelerate: false, brake: false, steer: 0, nitro: false, ability: false };

let failures = 0;
let checks = 0;

function check(label: string, condition: boolean, detail = ''): void {
  checks++;
  if (condition) console.log(`  PASS  ${label}`);
  else {
    failures++;
    console.log(`  FAIL  ${label}${detail ? ` -> ${detail}` : ''}`);
  }
}

/** A car box at (x, y) heading h, sized from the live collision config. */
function boxAt(x: number, y: number, heading = 0): CarBox {
  return { x, y, heading, halfLength: COLLISION.halfLength, halfWidth: COLLISION.halfWidth };
}

/** An AI that never moves, so tests can isolate the player. */
class ParkedDriver extends AiDriver {
  override update(): InputState {
    return { ...NO_INPUT };
  }
}

function parkedSession(trackId: string, options?: { collisionFailsChallenge?: boolean }): RaceSession {
  const layout = new TrackLayout(getTrackDefinition(trackId));
  const grid = buildGrid(CHARACTERS[0], CARS[0]);
  const driverFor = (config: RacerConfig, tuning: CarTuning): AiDriver | null =>
    config.isPlayer ? null : new ParkedDriver(getAiProfile(config.characterId), tuning);
  return new RaceSession(layout, grid, driverFor, options);
}

/** Steps until the race is actually running (intro + countdown elapsed). */
function advanceToRacing(session: RaceSession, limit = 1600): boolean {
  for (let i = 0; i < limit; i++) {
    if (session.race.isRacing) return true;
    session.step(STEP, NO_INPUT);
  }
  return session.race.isRacing;
}

/** Points just before/after a gate along its required direction. */
function gateCrossing(gate: Gate, back = 5, forward = 25): [{ x: number; y: number }, { x: number; y: number }] {
  return [
    { x: gate.center.x - gate.direction.x * back, y: gate.center.y - gate.direction.y * back },
    { x: gate.center.x + gate.direction.x * forward, y: gate.center.y + gate.direction.y * forward },
  ];
}

// ------------------------------------------------------------------ collision
console.log('\n=== [collision] oriented-box contact ===');
{
  const headOn = boxContact(boxAt(0, 0), boxAt(70, 0));
  check(
    'head-on boxes overlap by the expected depth',
    headOn !== null && Math.abs(headOn.depth - 14) < 1e-6,
    headOn ? `depth ${headOn.depth.toFixed(3)}` : 'no contact',
  );
  check(
    'contact normal points from A to B',
    headOn !== null && Math.abs(headOn.nx - 1) < 1e-6 && Math.abs(headOn.ny) < 1e-6,
    headOn ? `n=(${headOn.nx.toFixed(2)},${headOn.ny.toFixed(2)})` : 'none',
  );

  check('boxes with a gap do not touch (nose to tail)', boxContact(boxAt(0, 0), boxAt(90, 0)) === null);
  check('boxes with a lateral gap do not touch (side by side)', boxContact(boxAt(0, 0), boxAt(0, 40)) === null);

  const side = boxContact(boxAt(0, 0), boxAt(0, 30));
  check(
    'side-by-side overlap is detected with a lateral normal',
    side !== null && Math.abs(side.depth - 8) < 1e-6 && Math.abs(side.nx) < 1e-6 && Math.abs(side.ny - 1) < 1e-6,
    side ? `depth ${side.depth.toFixed(2)} n=(${side.nx.toFixed(2)},${side.ny.toFixed(2)})` : 'none',
  );

  const crossed = boxContact(boxAt(0, 0), boxAt(0, 60, Math.PI / 2));
  check(
    'rotated (T-bone) boxes are detected',
    crossed !== null && crossed.depth > 0,
    crossed ? `depth ${crossed.depth.toFixed(2)}` : 'none',
  );
  check('a rotated box clear of the other is ignored', boxContact(boxAt(0, 0), boxAt(0, 70, Math.PI / 2)) === null);
}

// ---------------------------------------------------------------- lap-once
console.log('\n=== [laps] one lap per forward crossing ===');
{
  const layout = new TrackLayout(getTrackDefinition('hawkins-streets'));
  const laps = new LapManager(layout, layout.finishGate, layout.checkpoints, RACE.totalLaps);
  const finishPt = layout.sampleAtFraction(layout.finishFraction).point;
  const frac = layout.fractionAt(finishPt.x, finishPt.y);

  // Teleport past the line with no checkpoints cleared.
  const shortcut = gateCrossing(layout.finishGate);
  check('finish crossing with no checkpoints does not count', laps.update(shortcut[0], shortcut[1], 1000, frac) === 'none');
  check('lap stays 1 after a shortcut', laps.currentLap === 1, `lap ${laps.currentLap}`);

  // Clear every checkpoint in order, then cross the line.
  for (const gate of layout.checkpoints) {
    const [a, b] = gateCrossing(gate);
    laps.update(a, b, 2000, layout.fractionAt(gate.center.x, gate.center.y));
  }
  const [fa, fb] = gateCrossing(layout.finishGate);
  const lapEvent = laps.update(fa, fb, 5000, frac);
  check('a full lap counts once', lapEvent === 'lap', `got ${lapEvent}`);
  check('lap advanced to 2', laps.currentLap === 2, `lap ${laps.currentLap}`);

  // Cross the line again immediately: checkpoints were reset, so nothing counts.
  const again = laps.update(fa, fb, 5100, frac);
  check('re-crossing the line immediately does not count', again === 'none', `got ${again}`);
  check('lap stays 2 after the re-cross', laps.currentLap === 2, `lap ${laps.currentLap}`);

  // Reversing over the line must not count either.
  check('reversing over the line does not count', laps.update(fb, fa, 5200, frac) === 'none');
  check('lap still 2 after reversing', laps.currentLap === 2, `lap ${laps.currentLap}`);
}

// ----------------------------------------------------------- cars keep apart
console.log('\n=== [separation] cars cannot pass through each other ===');
{
  const session = parkedSession('hawkins-streets', { collisionFailsChallenge: false });
  advanceToRacing(session);

  const a = session.racers[1].physics;
  const b = session.racers[2].physics;
  const heading = session.layout.spawn.heading;
  const fx = Math.cos(heading);
  const fy = Math.sin(heading);
  const base = session.layout.sampleAtFraction(session.layout.finishFraction + 0.3).point;

  let worstResidual = 0;
  for (let i = 0; i < 60; i++) {
    // Slam the two AI cars together head-on, every frame.
    a.reset(base.x - fx * 20, base.y - fy * 20, heading);
    a.vx = fx * 320;
    a.vy = fy * 320;
    b.reset(base.x + fx * 20, base.y + fy * 20, heading + Math.PI);
    b.vx = -fx * 320;
    b.vy = -fy * 320;

    session.step(STEP, NO_INPUT);
    const contact = boxContact(boxAt(a.x, a.y, a.heading), boxAt(b.x, b.y, b.heading));
    worstResidual = Math.max(worstResidual, contact ? contact.depth : 0);
  }
  check('overlap is fully resolved each step', worstResidual < 1.0, `worst residual ${worstResidual.toFixed(3)}px`);
}

// --------------------------------------------------- player collision = fail
console.log('\n=== [failure] player contact ends the challenge ===');
{
  const session = parkedSession('hawkins-streets');
  const racing = advanceToRacing(session);
  check('race reaches RACING', racing && session.race.phase === 'RACING', `phase ${session.race.phase}`);

  const player = session.player.physics;
  const opponent = session.racers.find((r) => !r.isPlayer)!.physics;
  // Park the opponent right on top of the player, then run one step.
  opponent.reset(player.x + Math.cos(player.heading) * 20, player.y + Math.sin(player.heading) * 20, player.heading);
  session.step(STEP, NO_INPUT);

  check('collision fails the challenge', session.race.isFailed);
  check('failure reason is collision', session.race.failureReason === 'collision', `reason ${session.race.failureReason}`);
  check('phase is FAILED', session.race.phase === 'FAILED', `phase ${session.race.phase}`);

  const contact = session.consumePlayerCollision();
  check('the contact is reported once for the impact effect', contact !== null);
  check('the contact is not reported a second time', session.consumePlayerCollision() === null);

  const failedResult = session.result();
  check('failed result has outcome failed', failedResult?.outcome === 'failed');
  check('failed result has reason collision', failedResult?.failureReason === 'collision');
  check('failed result awards zero stars', failedResult?.stars === 0, `stars ${failedResult?.stars}`);

  // Timer must be frozen and no further collisions may register.
  const frozenElapsed = session.race.elapsed;
  for (let i = 0; i < 120; i++) session.step(STEP, NO_INPUT);
  check('race clock is frozen after failure', session.race.elapsed === frozenElapsed, `elapsed ${session.race.elapsed}`);
  check('no new contact after failure', session.consumePlayerCollision() === null);
  check('state stays FAILED', session.race.phase === 'FAILED', `phase ${session.race.phase}`);
}

// ------------------------------------------------------------- reset to clean
console.log('\n=== [reset] retry starts a clean attempt ===');
{
  const session = parkedSession('hawkins-streets');
  advanceToRacing(session);
  const player = session.player.physics;
  const opponent = session.racers.find((r) => !r.isPlayer)!.physics;
  opponent.reset(player.x + Math.cos(player.heading) * 20, player.y + Math.sin(player.heading) * 20, player.heading);
  session.step(STEP, NO_INPUT);
  check('precondition: failed before reset', session.race.isFailed);

  session.reset();
  check('phase returns to READY', session.race.phase === 'READY', `phase ${session.race.phase}`);
  check('race is no longer over', !session.race.isOver);
  check('lap count resets to 1', session.player.laps.currentLap === 1, `lap ${session.player.laps.currentLap}`);
  check('lap times cleared', session.player.laps.lapTimesMs.length === 0);
  check('nitro refilled', session.player.nitro.isFull);
  check('pending contact cleared', session.consumePlayerCollision() === null);
  check('no result before a new race ends', session.result() === null);
}

// ----------------------------------------------------------- terminal guards
console.log('\n=== [terminal] COMPLETED and FAILED are final ===');
{
  const finished = parkedSession('hawkins-streets');
  advanceToRacing(finished);
  finished.race.finish();
  check('finish gives COMPLETED', finished.race.phase === 'COMPLETED', `phase ${finished.race.phase}`);
  const doneElapsed = finished.race.elapsed;
  finished.race.fail('collision');
  check('a later failure cannot overwrite a completion', finished.race.phase === 'COMPLETED');
  check('completion keeps a null failure reason', finished.race.failureReason === null);
  for (let i = 0; i < 60; i++) finished.step(STEP, NO_INPUT);
  check('clock frozen after completion', finished.race.elapsed === doneElapsed, `elapsed ${finished.race.elapsed}`);
}

// ------------------------------------------------------------------ stars
console.log('\n=== [stars] rating thresholds ===');
{
  check('at the target time earns 3 stars', starsForTime(CHALLENGE.targetTimeMs) === 3);
  check('just over target earns 2 stars', starsForTime(CHALLENGE.targetTimeMs + 1) === 2);
  check('at the acceptable time earns 2 stars', starsForTime(CHALLENGE.acceptableTimeMs) === 2);
  check('over the acceptable time earns 1 star', starsForTime(CHALLENGE.acceptableTimeMs + 1) === 1);
  check('a very fast run still caps at 3', starsForTime(0) === 3);
}

// ------------------------------------------------------- completion + rating
console.log('\n=== [completion] finished run wires the star rating ===');
{
  const session = parkedSession('hawkins-streets', { collisionFailsChallenge: false });
  advanceToRacing(session);
  const layout = session.layout;
  const laps = session.player.laps;
  const finishPt = layout.sampleAtFraction(layout.finishFraction).point;
  const frac = layout.fractionAt(finishPt.x, finishPt.y);

  // Bank three clean laps inside the target time by feeding the lap tracker the
  // exact gate crossings, the same way driving through them would.
  let t = 0;
  for (let lap = 0; lap < RACE.totalLaps; lap++) {
    for (const gate of layout.checkpoints) {
      t += 6_000;
      const [a, b] = gateCrossing(gate);
      laps.update(a, b, t, layout.fractionAt(gate.center.x, gate.center.y));
    }
    t += 6_000;
    const [fa, fb] = gateCrossing(layout.finishGate);
    laps.update(fa, fb, t, frac);
  }
  check('all laps are complete', laps.isComplete, `lap ${laps.currentLap}`);
  check('three lap times recorded', laps.lapTimesMs.length === RACE.totalLaps, `got ${laps.lapTimesMs.length}`);

  session.race.finish();
  const result = session.result();
  check('completed result has outcome finished', result?.outcome === 'finished');
  check('completed result has no failure reason', result?.failureReason === null);
  check('completed result counts all laps', result?.lapsCompleted === RACE.totalLaps, `laps ${result?.lapsCompleted}`);
  check('completed result earns 3 stars inside target', result?.stars === 3, `stars ${result?.stars}`);
}

console.log(`\n=== ${checks - failures}/${checks} challenge checks passed ===`);
if (failures > 0) process.exit(1);
