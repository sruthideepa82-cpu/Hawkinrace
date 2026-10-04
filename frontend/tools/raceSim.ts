/**
 * Headless race verification harness.
 *
 * Runs the real (Phaser-free) race code as fast as the CPU allows and asserts the
 * behaviour the 4-car system is supposed to have. Run with:
 *   node --experimental-transform-types --no-warnings tools/raceSim.ts
 */
import { TrackLayout } from '../src/game/entities/TrackLayout';
import { getTrackDefinition } from '../src/game/config/tracks';
import { buildGrid } from '../src/game/config/racers';
import { RaceSession } from '../src/game/systems/RaceSession';
import { AiDriver } from '../src/game/systems/AiDriver';
import { getAiProfile } from '../src/game/config/racers';
import { LapManager } from '../src/game/systems/LapManager';
import { RACE, CAR } from '../src/game/config/GameConfig';
import { CHARACTERS } from '../src/data/characters';
import { CARS } from '../src/data/cars';
import type { InputState } from '../src/game/entities/CarPhysics';

const STEP = 1 / 120;

let failures = 0;
let checks = 0;

function check(label: string, condition: boolean, detail = ''): void {
  checks++;
  if (condition) {
    console.log(`  PASS  ${label}`);
  } else {
    failures++;
    console.log(`  FAIL  ${label}${detail ? ` -> ${detail}` : ''}`);
  }
}

interface RunResult {
  finished: boolean;
  elapsedMs: number;
  finalStandings: ReturnType<RaceSession['standings']>;
  orderChanges: number;
  distinctLeaders: Set<string>;
  maxLapSeen: number;
  offTrackFrames: number;
  maxOffTrackDistance: number;
  nitroUsed: number;
  progressAfterFinishStable: boolean;
  raceEndedBeforeAllFinished: boolean;
  minSpacing: number;
}

function runRace(
  trackId: string,
  characterId: string,
  carId: string,
  maxSeconds = 420,
  /** Corner confidence of the reference bot standing in for the human. */
  playerConfidence = 1.0,
): RunResult {
  const layout = new TrackLayout(getTrackDefinition(trackId));
  const character = CHARACTERS.find((c) => c.id === characterId)!;
  const car = CARS.find((c) => c.id === carId)!;
  const grid = buildGrid(character, car);
  const session = new RaceSession(layout, grid);

  // The human player is driven by the same reference controller here, so the
  // harness exercises race logic rather than my ability to play.
  const player = session.player;
  const playerBot = new AiDriver(
    { ...getAiProfile(character.id), cornerConfidence: playerConfidence, pace: playerConfidence },
    player.tuning,
  );

  let offTrackFrames = 0;
  let maxOffTrackDistance = 0;
  let nitroUsed = 0;
  let maxLapSeen = 1;
  let minSpacing = Infinity;
  let raceEndedBeforeAllFinished = false;

  // Snapshot progress the moment each car finishes, to prove it stops updating.
  const frozenProgress = new Map<string, number>();
  let progressAfterFinishStable = true;

  const orderChanges = { count: 0 };
  let previousOrder = session.standings().map((s) => s.characterId).join(',');
  const distinctLeaders = new Set<string>();

  // Countdown must hold every car still.
  const startPositions = session.racers.map((r) => ({ x: r.physics.x, y: r.physics.y }));

  const steps = Math.floor(maxSeconds / STEP);
  let elapsed = 0;
  void startPositions;

  for (let step = 0; step < steps; step++) {
    if (session.race.isFinished) break;

    const rivals = session.racers
      .filter((r) => r !== player)
      .map((r) => ({ physics: r.physics, aheadInRace: r.laps.totalRaceProgress > player.laps.totalRaceProgress }));

    const input: InputState = session.race.isRacing
      ? playerBot.update(STEP, layout, player.physics, rivals, !player.nitro.isEmpty)
      : { accelerate: false, brake: false, steer: 0, nitro: false };

    const finishedBefore = session.racers.filter((r) => r.finished).length;
    session.step(STEP, input);
    elapsed += STEP * 1000;

    // Nitro actually gets used by someone.
    if (session.racers.some((r) => r.nitro.active)) nitroUsed++;

    // Track containment: nobody should be flung off the world.
    for (const racer of session.racers) {
      const d = layout.locate(racer.physics.x, racer.physics.y).distance;
      if (d > layout.roadWidth / 2 + 45) {
        offTrackFrames++;
        maxOffTrackDistance = Math.max(maxOffTrackDistance, d);
      }
      maxLapSeen = Math.max(maxLapSeen, racer.laps.currentLap);
    }

    // Cars should not sit inside one another.
    for (let i = 0; i < session.racers.length; i++) {
      for (let j = i + 1; j < session.racers.length; j++) {
        const a = session.racers[i].physics;
        const b = session.racers[j].physics;
        minSpacing = Math.min(minSpacing, Math.hypot(b.x - a.x, b.y - a.y));
      }
    }

    // Freeze check.
    for (const racer of session.racers) {
      if (racer.finished) {
        if (!frozenProgress.has(racer.config.characterId)) {
          frozenProgress.set(racer.config.characterId, racer.laps.totalRaceProgress);
        } else if (frozenProgress.get(racer.config.characterId) !== racer.laps.totalRaceProgress) {
          progressAfterFinishStable = false;
        }
      }
    }

    // The race must not end while anyone is still running.
    if (session.race.isFinished && session.racers.some((r) => !r.finished)) {
      raceEndedBeforeAllFinished = true;
    }

    // Track ranking churn.
    if (step % 12 === 0) {
      const board = session.standings();
      const order = board.map((s) => s.characterId).join(',');
      if (order !== previousOrder) orderChanges.count++;
      previousOrder = order;
      distinctLeaders.add(board[0].characterId);
    }
  }

  return {
    finished: session.race.isFinished,
    elapsedMs: elapsed,
    finalStandings: session.standings(),
    orderChanges: orderChanges.count,
    distinctLeaders,
    maxLapSeen,
    offTrackFrames,
    maxOffTrackDistance,
    nitroUsed,
    progressAfterFinishStable,
    raceEndedBeforeAllFinished,
    minSpacing,
  };
}

console.log('\n=== 4-CAR RACE SYSTEM VERIFICATION ===\n');

// ---------------------------------------------------------------- grid + spawn
console.log('[grid] four distinct racers');
{
  const layout = new TrackLayout(getTrackDefinition('hawkins-streets'));
  const session = new RaceSession(layout, buildGrid(CHARACTERS[0], CARS[0]));
  check('4 racers on the grid', session.racers.length === 4, `got ${session.racers.length}`);
  check('exactly 1 player', session.racers.filter((r) => r.isPlayer).length === 1);
  check('3 AI drivers', session.racers.filter((r) => r.ai !== null).length === 3);
  const ids = session.racers.map((r) => r.config.characterId);
  check('all racers unique', new Set(ids).size === 4, ids.join(','));
  const startPos = session.racers.map((r) => layout.locate(r.physics.x, r.physics.y).distance);
  check('all 4 spawn on the road', startPos.every((d) => d < layout.roadWidth / 2), startPos.map((d) => d.toFixed(0)).join(','));
  const spread = Math.min(
    ...session.racers.flatMap((a, i) =>
      session.racers.slice(i + 1).map((b) => Math.hypot(a.physics.x - b.physics.x, a.physics.y - b.physics.y))),
  );
  check('no two cars spawn overlapping', spread > CAR.collisionRadius, `min spacing ${spread.toFixed(1)}px`);
  check('totalLaps is 3', RACE.totalLaps === 3);
  check('player is car[0]', session.player === session.racers[0]);
}

// -------------------------------------------------------- checkpoint integrity
console.log('\n[checkpoints] ordered validation blocks shortcuts');
{
  const layout = new TrackLayout(getTrackDefinition('hawkins-streets'));
  const laps = new LapManager(layout, layout.finishGate, layout.checkpoints, 3);

  // Start exactly on the finish line.
  const finishPt = layout.centerline[Math.round(layout.finishFraction * layout.centerline.length) % layout.centerline.length];
  const frac = layout.fractionAt(finishPt.x, finishPt.y);

  // Teleport straight past the finish line WITHOUT clearing any checkpoint.
  const jumped = { x: 0, y: 0 };
  const justPast = layout.sampleAtFraction(frac + 0.01).point;
  const first = laps.update(finishPt, justPast, 1000, frac);
  check('crossing finish with 0 checkpoints does NOT count a lap', first === 'none', `got ${first}`);
  check('lap stays 1 after shortcut', laps.currentLap === 1, `got ${laps.currentLap}`);

  // Now clear every checkpoint in order, then the line: that IS a lap.
  let ev: string = 'none';
  for (let k = 0; k < layout.checkpoints.length; k++) {
    const g = layout.checkpoints[k];
    const before = { x: g.center.x - g.direction.x * 12, y: g.center.y - g.direction.y * 12 };
    const after = { x: g.center.x + g.direction.x * 12, y: g.center.y + g.direction.y * 12 };
    ev = laps.update(before, after, 1100 + k, layout.fractionAt(g.center.x, g.center.y));
    if (ev !== 'checkpoint') break;
  }
  check('all 4 checkpoints register in order', ev === 'checkpoint', `got ${ev}`);

  const g0 = layout.checkpoints[0];
  const before2 = { x: g0.center.x - g0.direction.x * 12, y: g0.center.y - g0.direction.y * 12 };
  const after2 = { x: g0.center.x + g0.direction.x * 12, y: g0.center.y + g0.direction.y * 12 };
  check('re-crossing checkpoint 1 is ignored (out of order)', laps.update(before2, after2, 1200, 0) === 'none');

  const lineBefore = { x: finishPt.x - layout.finishGate.direction.x * 12, y: finishPt.y - layout.finishGate.direction.y * 12 };
  const lineAfter = { x: finishPt.x + layout.finishGate.direction.x * 12, y: finishPt.y + layout.finishGate.direction.y * 12 };
  const lapEvent = laps.update(lineBefore, lineAfter, 5000, frac);
  check('full lap counts once all gates cleared', lapEvent === 'lap', `got ${lapEvent}`);
  check('lap advanced to 2', laps.currentLap === 2, `got ${laps.currentLap}`);

  // Reversing over the line must not count.
  const revEvent = laps.update(lineAfter, lineBefore, 5100, frac);
  check('reversing over the line does NOT count a lap', revEvent === 'none', `got ${revEvent}`);
}

// ------------------------------------------------------------------ full race
console.log('\n[race] full 4-car race on Hawkins Streets');
const street = runRace('hawkins-streets', 'steve', 'falcon-gt');
{
  check('race completed', street.finished);
  check('all 4 cars finished', street.finalStandings.every((s) => s.finished));
  check('exactly 4 classified rows', street.finalStandings.length === 4);
  check('positions are 1..4',
    street.finalStandings.map((s) => s.position).join(',') === '1,2,3,4',
    street.finalStandings.map((s) => s.position).join(','));
  check('finish order strictly increasing in time',
    street.finalStandings.every((s, i, arr) => i === 0 || (arr[i - 1].finishTimeMs ?? 0) <= (s.finishTimeMs ?? Infinity)));
  check('lap count never exceeded 3', street.maxLapSeen <= 3, `max lap seen ${street.maxLapSeen}`);
  check('race did not end before all finished', !street.raceEndedBeforeAllFinished);
  check('finished cars stop accruing progress', street.progressAfterFinishStable);
  check('ranking changed during the race', street.orderChanges > 0, `${street.orderChanges} order changes`);
  check('nitro was actually used', street.nitroUsed > 0, `${street.nitroUsed} frames boosting`);
  check('cars stayed on track (no flying off)', street.maxOffTrackDistance < layoutBound('hawkins-streets'),
    `max ${street.maxOffTrackDistance.toFixed(0)}px from centreline`);
  check('cars did not end up stacked', street.minSpacing > CAR.collisionRadius * 0.9,
    `closest approach ${street.minSpacing.toFixed(1)}px`);

  console.log('    classification:', street.finalStandings
    .map((s) => `${s.position}.${s.characterName}(${s.finishTimeMs ? (s.finishTimeMs / 1000).toFixed(2) : '--'}s)`)
    .join('  '));
  console.log(`    leaders seen: ${[...street.distinctLeaders].join(', ')}  (order changes: ${street.orderChanges})`);
}

// ------------------------------------------------------------- anti-gravity
console.log('\n[race] full 4-car race on The Upside Down (anti-gravity)');
const upside = runRace('upside-down', 'steve', 'falcon-gt');
{
  const layout = new TrackLayout(getTrackDefinition('upside-down'));
  check('track has anti-gravity ranges', (layout.definition.antiGravityRanges?.length ?? 0) > 0);
  check('race completed on anti-gravity track', upside.finished);
  check('all 4 cars finished', upside.finalStandings.every((s) => s.finished));
  check('lap count never exceeded 3', upside.maxLapSeen <= 3, `max ${upside.maxLapSeen}`);
  check('AI coped with anti-gravity (all finished)', upside.finalStandings.filter((s) => s.finished).length === 4);
  check('cars stayed attached to the track', upside.maxOffTrackDistance < layout.roadWidth / 2 + 45,
    `max ${upside.maxOffTrackDistance.toFixed(0)}px`);
  console.log('    classification:', upside.finalStandings
    .map((s) => `${s.position}.${s.characterName}(${s.finishTimeMs ? (s.finishTimeMs / 1000).toFixed(2) : '--'}s)`)
    .join('  '));
}

// ------------------------------------------------------- variability / winners
// The sim is deterministic: the same grid and the same inputs must give the same
// order, so "run it 5 times and expect different winners" would be testing
// randomness, not correctness. What actually matters is that outcomes follow the
// race rather than being decided in advance, so these checks vary the things a
// rigged result would be blind to -- how the player drives, and what they drive.
console.log('\n[variety] outcome must follow the race, not be decided in advance');
{
  // Vary how hard the player drives. A hardcoded winner ignores this entirely.
  const bySkill: { skill: string; winner: string; playerPos: number }[] = [];
  const skills: [string, number][] = [
    ['sloppy', 0.86],
    ['average', 0.96],
    ['strong', 1.02],
    ['blitzer', 1.10],
  ];
  for (const [label, confidence] of skills) {
    const r = runRace('hawkins-streets', 'steve', 'falcon-gt', 420, confidence);
    bySkill.push({
      skill: label,
      winner: r.finalStandings[0]?.characterId ?? 'none',
      playerPos: r.finalStandings.find((s) => s.isPlayer)!.position,
    });
  }
  check('every run finished', bySkill.every((r) => r.winner !== 'none'),
    bySkill.map((r) => r.winner).join(','));
  // The player is the only thing the harness varies, so a stronger player must
  // not lose more races than a weaker one. This is the property that a
  // predetermined finishing order cannot satisfy.
  const early = bySkill.slice(0, 2).map((r) => r.playerPos);
  const late = bySkill.slice(2).map((r) => r.playerPos);
  const earlySum = early.reduce((a, b) => a + b, 0);
  const lateSum = late.reduce((a, b) => a + b, 0);
  check('driving better never finishes worse on average',
    lateSum <= earlySum,
    `weak avg ${(earlySum / early.length).toFixed(2)} vs strong avg ${(lateSum / late.length).toFixed(2)}`);
  console.log('    ' + bySkill.map((r) => `${r.skill}: P${r.playerPos} (won by ${r.winner})`).join('  '));
}

{
  // Vary what the player drives. Different cars suit different tracks and
  // different opponents, so the outcome has to move with the choice.
  const winners = new Set<string>();
  const positions = new Set<number>();
  for (const character of CHARACTERS) {
    for (const car of CARS) {
      const r = runRace('hawkins-streets', character.id, car.id, 420, 1.0);
      winners.add(r.finalStandings[0]?.characterId ?? 'none');
      positions.add(r.finalStandings.find((s) => s.isPlayer)!.position);
    }
  }
  check('every grid finished', !winners.has('none'), `winners: ${[...winners].join(',')}`);
  check('winner is NOT hardcoded across grids', winners.size > 1, `winners: ${[...winners].join(', ')}`);
  check('player position varies across grids', positions.size > 1, `positions: ${[...positions].sort().join(',')}`);
  console.log(`    winners across ${CHARACTERS.length * CARS.length} grids: ${[...winners].join(', ')}`);
  console.log(`    player positions: ${[...positions].sort().join(', ')}`);
}

// ------------------------------------------------------------------- overtake
console.log('\n[overtaking] positions swap when a car passes another');
{
  const layout = new TrackLayout(getTrackDefinition('hawkins-streets'));
  const session = new RaceSession(layout, buildGrid(CHARACTERS[0], CARS[0]));

  // Grab the car that starts LAST on the road and move it up the track, so the
  // expected result is a promotion. Pushing the leader further ahead instead
  // would prove nothing -- it is already first and cannot overtake anybody.
  const rankedBefore = session.standings();
  const trailer = session.racers.find((r) => r.config.characterId === rankedBefore[rankedBefore.length - 1].characterId)!;
  const leaderId = rankedBefore[0].characterId;
  const trailerPosBefore = rankedBefore.find((s) => s.characterId === trailer.config.characterId)!.position;
  const orderBefore = rankedBefore.map((s) => s.characterId).join(',');

  // Lap progress only advances once the countdown has finished, so let the lights
  // go out first -- otherwise the whole manoeuvre happens while every car is held
  // still on the grid and nothing is recorded.
  check('race starts in countdown', !session.race.isRacing);
  while (!session.race.isRacing) {
    session.step(STEP, { accelerate: false, brake: false, steer: 0, nitro: false });
  }

  // Teleport the trailer far ahead along the centerline. Each move must be set
  // BEFORE the step, because lap progress is measured from prev -> cur.
  const from = layout.fractionAt(trailer.physics.x, trailer.physics.y);
  const distance = layout.trackLength * 0.55;
  for (let i = 1; i <= 40; i++) {
    const p = layout.pointAhead(from, (distance * i) / 40, 0);
    trailer.physics.x = p.x;
    trailer.physics.y = p.y;
    session.step(STEP, { accelerate: false, brake: false, steer: 0, nitro: false });
  }

  const board = session.standings();
  const orderAfter = board.map((s) => s.characterId).join(',');
  const trailerPosAfter = board.find((s) => s.characterId === trailer.config.characterId)!.position;
  check('a car moved up the track gains positions',
    trailerPosAfter < trailerPosBefore,
    `${trailer.config.characterId} P${trailerPosBefore} -> P${trailerPosAfter}`);
  check('ranking responds to actual track progress', orderAfter !== orderBefore,
    `${orderBefore} -> ${orderAfter}`);
  check('the car it passed is now behind it',
    board.findIndex((s) => s.characterId === trailer.config.characterId)
      < board.findIndex((s) => s.characterId === leaderId),
    `${trailer.config.characterId} vs ${leaderId}`);
  check('positions are always a valid 1..4 permutation',
    board.map((s) => s.position).join(',') === '1,2,3,4');
}

// --------------------------------------------------------------------- retry
console.log('\n[retry] full reset restores every car');
{
  const layout = new TrackLayout(getTrackDefinition('hawkins-streets'));
  const session = new RaceSession(layout, buildGrid(CHARACTERS[0], CARS[0]));
  const run = runRace('hawkins-streets', 'steve', 'falcon-gt');

  // Drive a fresh session part-way, then reset it.
  const partial = new RaceSession(layout, buildGrid(CHARACTERS[0], CARS[0]));
  for (let i = 0; i < 120 * 30; i++) {
    partial.step(STEP, { accelerate: true, brake: false, steer: 0, nitro: false });
  }
  check('race is mid-progress before reset', !partial.race.isFinished);
  partial.reset();

  const afterLap = partial.racers.map((r) => r.laps.currentLap);
  const afterCp = partial.racers.map((r) => r.laps.currentCheckpoint);
  const afterNitro = partial.racers.map((r) => r.nitro.level);
  const afterPos = partial.racers.map((r) => r.finishPosition);
  const afterSpeed = partial.racers.map((r) => Math.hypot(r.physics.vx, r.physics.vy));
  const state = partial.race.currentState;

  check('retry resets lap to 1', afterLap.every((l) => l === 1), afterLap.join(','));
  check('retry resets checkpoint to 1', afterCp.every((c) => c === 1), afterCp.join(','));
  check('retry refills nitro', partial.racers.every((r) => Math.abs(r.nitro.level - r.tuning.nitroCapacity) < 0.01),
    partial.racers.map((r, i) => `${afterNitro[i].toFixed(1)}/${r.tuning.nitroCapacity.toFixed(1)}`).join(' '));
  check('retry clears finish positions', afterPos.every((p) => p === null));
  check('retry stops the cars', afterSpeed.every((s) => s < 1), afterSpeed.map((s) => s.toFixed(1)).join(','));
  check('retry returns to countdown', state === 'countdown', state);
  const onRoad = partial.racers.map((r) => layout.locate(r.physics.x, r.physics.y).distance);
  check('retry puts every car back on the grid', onRoad.every((d) => d < layout.roadWidth / 2));
  void run;
}

// ---------------------------------------------------------------- countdown
console.log('\n[countdown] field is held still before the lights go out');
{
  const layout = new TrackLayout(getTrackDefinition('hawkins-streets'));
  const session = new RaceSession(layout, buildGrid(CHARACTERS[0], CARS[0]));
  const before = session.racers.map((r) => ({ x: r.physics.x, y: r.physics.y }));
  for (let i = 0; i < 120 * 2.5; i++) {
    session.step(STEP, { accelerate: true, brake: false, steer: 0, nitro: false });
  }
  const drift = Math.max(...session.racers.map((r, i) =>
    Math.hypot(r.physics.x - before[i].x, r.physics.y - before[i].y)));
  check('no car moves during the countdown', drift < 1, `drift ${drift.toFixed(3)}px`);
  check('state is still countdown at 2.5s', session.race.currentState === 'countdown');
}

// ------------------------------------------------------------------- summary
function layoutBound(trackId: string): number {
  return new TrackLayout(getTrackDefinition(trackId)).roadWidth / 2 + 45;
}

console.log(`\n=== ${checks - failures}/${checks} checks passed ===`);
if (failures > 0) {
  console.log(`${failures} FAILED\n`);
  process.exit(1);
}
console.log('ALL CHECKS PASSED\n');