/**
 * Headless race-state verification harness.
 *
 * Covers the parts of the race that are about the RACE rather than the driving:
 * the state machine (intro, countdown, racing, lap transition, paused, finished,
 * failed), the clock, lap and checkpoint validation, the lap-completed card,
 * pause/resume, and the restart path.
 *
 * `RaceSession`, `RaceManager` and `LapManager` are all Phaser-free, so this
 * drives the real code with a reference driver standing in for the player and
 * asserts what the HUD and the results screen would be handed. Run with:
 *   node --experimental-transform-types --import ./tools/register.mjs \
 *     tools/raceStates.ts
 */
import { TrackLayout } from '../src/game/entities/TrackLayout';
import { getTrackDefinition } from '../src/game/config/tracks';
import { buildGrid, getAiProfile } from '../src/game/config/racers';
import { RaceSession } from '../src/game/systems/RaceSession';
import { LapManager } from '../src/game/systems/LapManager';
import { RaceManager } from '../src/game/systems/RaceManager';
import { AiDriver } from '../src/game/systems/AiDriver';
import { RACE } from '../src/game/config/GameConfig';
import { CHARACTERS } from '../src/data/characters';
import { CARS } from '../src/data/cars';
import type { InputState } from '../src/game/entities/CarPhysics';

const STEP = 1 / 120;
const TRACK = 'hawkins-streets';

let failures = 0;
let checks = 0;

function check(label: string, condition: boolean, detail = ''): void {
  checks++;
  if (condition) {
    console.log(`  PASS  ${label}${detail ? ` (${detail})` : ''}`);
  } else {
    failures++;
    console.log(`  FAIL  ${label}${detail ? ` -> ${detail}` : ''}`);
  }
}

const NO_INPUT: InputState = { accelerate: false, brake: false, steer: 0, nitro: false, ability: false };

function newSession(trackId = TRACK) {
  const layout = new TrackLayout(getTrackDefinition(trackId));
  return { layout, session: new RaceSession(layout, buildGrid(CHARACTERS[0], CARS[0])) };
}

/** A session whose player is driven by the reference bot. */
function withBot(confidence = 1.0) {
  const { layout, session } = newSession();
  const bot = new AiDriver(
    { ...getAiProfile(CHARACTERS[0].id), cornerConfidence: confidence, pace: confidence },
    session.player.tuning,
  );
  const step = (input?: InputState) => {
    const driven = session.race.isRacing && !session.race.isPaused
      ? bot.update(
          STEP, layout, session.player.physics,
          session.racers
            .filter((r) => !r.isPlayer)
            .map((r) => ({ physics: r.physics, aheadInRace: r.laps.totalRaceProgress > session.player.laps.totalRaceProgress })),
          !session.player.nitro.isEmpty,
        )
      : NO_INPUT;
    session.step(STEP, input ?? driven);
  };
  return { layout, session, bot, step };
}

// -------------------------------------------------------------- state machine
console.log('\n[states] the race opens READY, counts down, then goes live');
{
  const race = new RaceManager(RACE.countdownSeconds, 3.5);
  check('a fresh race is in the intro', race.currentState === 'intro', race.currentState);
  check('and reports the READY phase', race.phase === 'READY', race.phase);
  check('the clock has not started', race.elapsed === 0, `${race.elapsed}ms`);
  check('the race is not yet being driven', !race.isRacing);

  for (let i = 0; i < 120 * 3.4; i++) race.update(STEP * 1000);
  check('still in the intro just before it ends', race.currentState === 'intro', race.currentState);
  check('the clock has still not started', race.elapsed === 0, `${race.elapsed}ms`);

  for (let i = 0; i < 120 * 0.3; i++) race.update(STEP * 1000);
  check('the intro hands over to the countdown', race.currentState === 'countdown', race.currentState);

  // 3.4 + 0.3 + 2.7 = 6.4s, and the countdown runs out at 3.5 + 3.0 = 6.5s.
  for (let i = 0; i < 120 * 2.7; i++) race.update(STEP * 1000);
  check('the clock is STILL not running during the countdown', race.elapsed === 0, `${race.elapsed}ms`);
  check('the countdown is still counting', race.currentState === 'countdown', race.currentState);

  for (let i = 0; i < 120 * 0.2; i++) race.update(STEP * 1000);
  check('GO releases the race into RACING', race.currentState === 'racing', race.currentState);
  check('the phase follows', race.phase === 'RACING', race.phase);
  check('and only then does the clock run', race.elapsed > 0 && race.elapsed < 120,
    `${race.elapsed.toFixed(1)}ms`);

  const atGo = race.elapsed;
  for (let i = 0; i < 120 * 10; i++) race.update(STEP * 1000);
  // The frame the lights go out is the last countdown frame, so the clock
  // starts from zero on it and only runs on the frames after. Anything more than
  // that would mean time was being counted before the start.
  check('the clock counts from GO, not from the start of the race',
    Math.abs(race.elapsed - (atGo + 120 * 10 * STEP * 1000)) <= STEP * 1000 + 0.01,
    `${race.elapsed.toFixed(0)}ms vs ${(atGo + 10000).toFixed(0)}ms of racing`);
}

// ---------------------------------------------------------------------- pause
console.log('\n[pause] pause freezes everything and resume puts it back');
{
  const race = new RaceManager(RACE.countdownSeconds, 3.5);
  check('a countdown cannot be paused', race.pause() === false && race.currentState === 'intro');

  while (!race.isRacing) race.update(STEP * 1000);
  for (let i = 0; i < 120 * 2; i++) race.update(STEP * 1000);
  const before = race.elapsed;

  check('a live race pauses', race.pause() === true);
  check('and says so', race.isPaused && race.phase === 'PAUSED', race.phase);
  for (let i = 0; i < 120 * 10; i++) race.update(STEP * 1000);
  check('the clock does not move while paused', race.elapsed === before,
    `${before.toFixed(0)} -> ${race.elapsed.toFixed(0)}ms over 10s`);
  check('pausing twice is harmless', race.pause() === false && race.isPaused);

  check('resume puts it back', race.resume() === true && race.currentState === 'racing', race.currentState);
  for (let i = 0; i < 120; i++) race.update(STEP * 1000);
  check('and the clock runs again', race.elapsed > before, `${race.elapsed.toFixed(0)}ms`);

  // A pause during the lap card must come back to the card, not to a plain race.
  race.beginLapTransition();
  check('the lap card is up', race.isLapTransition && race.phase === 'RACING', race.currentState);
  check('it can be paused', race.pause() === true && race.currentState === 'paused');
  const cardLeft = race.snapshot().lapTransitionRemainingMs;
  for (let i = 0; i < 120; i++) race.update(STEP * 1000);
  check('the card does not burn down while paused',
    race.snapshot().lapTransitionRemainingMs === cardLeft, `${cardLeft.toFixed(0)}ms left`);
  race.resume();
  check('resume returns to the card, not past it',
    race.currentState === 'lapTransition', race.currentState);

  // The card must also clear itself.
  for (let i = 0; i < 120 * 5; i++) race.update(STEP * 1000);
  check('the card clears itself and racing resumes', race.currentState === 'racing', race.currentState);

  // Terminal states are frozen against pause and against the clock.
  race.finish();
  check('a finished race cannot be paused', race.pause() === false);
  const endTime = race.elapsed;
  for (let i = 0; i < 120 * 5; i++) race.update(STEP * 1000);
  check('the clock is frozen after the flag', race.elapsed === endTime);
  check('a finish cannot be overwritten by a failure', (race.fail('collision'), race.isFinished));
}

// --------------------------------------------------------- pause the session
console.log('\n[pause] a paused race does not drive or time anything');
{
  const { session, step } = withBot();
  while (!session.race.isRacing) step();

  for (let i = 0; i < 120 * 3; i++) step();
  session.race.pause();
  const x = session.player.physics.x;
  const y = session.player.physics.y;
  const elapsed = session.race.elapsed;
  const lap = session.player.laps.currentLap;

  for (let i = 0; i < 120 * 5; i++) session.step(STEP, { ...NO_INPUT, accelerate: true, steer: 1 });
  check('the car does not move while paused',
    Math.hypot(session.player.physics.x - x, session.player.physics.y - y) < 1e-9);
  check('the clock does not move while paused', session.race.elapsed === elapsed);
  check('the lap counter does not move while paused', session.player.laps.currentLap === lap);
  check('the HUD reports the paused state', session.hudData().state === 'paused', session.hudData().state);

  session.race.resume();
  for (let i = 0; i < 120; i++) step();
  check('the race picks up where it left off', session.race.elapsed > elapsed && session.race.currentState === 'racing');
  check('and the car moves again',
    Math.hypot(session.player.physics.x - x, session.player.physics.y - y) > 1);
}

// ------------------------------------------------------------- lap validation
console.log('\n[laps] crossings are validated in order, in the right direction');
{
  const layout = new TrackLayout(getTrackDefinition(TRACK));
  const laps = new LapManager(layout, layout.finishGate, layout.checkpoints, RACE.totalLaps);
  const finish = layout.centerline[Math.round(layout.finishFraction * layout.centerline.length) % layout.centerline.length];
  const across = (gate: { center: Point; direction: Point }, from: number, to: number) => ({
    from: { x: gate.center.x - gate.direction.x * from, y: gate.center.y - gate.direction.y * from },
    to: { x: gate.center.x + gate.direction.x * to, y: gate.center.y + gate.direction.y * to },
  });
  type Point = { x: number; y: number };

  // Straight over the line with nothing cleared: not a lap.
  const over = across(layout.finishGate, 12, 12);
  check('crossing the line with no checkpoints is not a lap',
    laps.update(over.from, over.to, 1000, layout.fractionAt(finish.x, finish.y)) === 'none');
  check('and the lap counter stays put', laps.currentLap === 1, `${laps.currentLap}`);

  // Reverse over the line: never a lap, however many times it is tried.
  const back = across(layout.finishGate, 12, -12);
  check('reversing over the line is not a lap',
    laps.update(over.to, back.from, 1100, layout.fractionAt(finish.x, finish.y)) === 'none');

  // Clear every checkpoint in order, then the line.
  let event = 'none';
  for (const gate of layout.checkpoints) {
    const step = across(gate, 12, 12);
    event = laps.update(step.from, step.to, 1200 + laps.currentCheckpoint * 10, layout.fractionAt(gate.center.x, gate.center.y));
    if (event !== 'checkpoint') break;
  }
  check('every checkpoint registers, in order', event === 'checkpoint', event);
  check('the checkpoint counter tracks the car', laps.currentCheckpoint === layout.checkpoints.length,
    `${laps.currentCheckpoint}/${laps.totalCheckpoints}`);

  // Jitter: crossing the same checkpoint again immediately does nothing.
  const again = across(layout.checkpoints[0], 12, 12);
  check('re-crossing the first checkpoint is ignored',
    laps.update(again.from, again.to, 1300, 0) === 'none');

  const lap = across(layout.finishGate, 12, 12);
  const lapEvent = laps.update(lap.from, lap.to, 30000, layout.fractionAt(finish.x, finish.y));
  check('a full lap counts', lapEvent === 'lap', lapEvent);
  check('the lap counter advances to 2', laps.currentLap === 2, `${laps.currentLap}`);
  check('the lap time is the real time since the start', laps.lapTimesMs.length === 1 && laps.lapTimesMs[0] === 30000,
    `${laps.lapTimesMs.join(',')}ms`);

  // Jitter on the line: sitting across it and re-crossing is still one lap.
  check('crossing the line twice in a row is still one lap',
    laps.update(lap.to, lap.from, 30100, layout.fractionAt(finish.x, finish.y)) === 'none' &&
    laps.currentLap === 2, `lap ${laps.currentLap}`);

  // A second real lap: every checkpoint again, then the line 15s later.
  for (const gate of layout.checkpoints) {
    const step = across(gate, 12, 12);
    laps.update(step.from, step.to, 32000, layout.fractionAt(gate.center.x, gate.center.y));
  }
  const secondLap = laps.update(lap.from, lap.to, 45000, layout.fractionAt(finish.x, finish.y));
  check('a second lap counts', secondLap === 'lap', secondLap);
  check('its time is measured from the line, not from the start of the race',
    laps.lapTimesMs[1] === 15000, `${laps.lapTimesMs.join(',')}ms`);
  check('the best lap is the fastest of them', laps.bestLapMs === 15000, `${laps.bestLapMs}ms`);
  check('the lap counter advances to 3', laps.currentLap === 3, `${laps.currentLap}`);

  // Off the side of the road, past the end of a gate, is not a crossing.
  const wide = {
    from: { x: layout.finishGate.center.x - layout.finishGate.direction.x * 12, y: layout.finishGate.center.y - layout.finishGate.direction.y * 12 },
    to: { x: layout.finishGate.center.x + layout.finishGate.direction.x * 12, y: layout.finishGate.center.y + layout.finishGate.direction.y * 12 },
  };
  const corner = layout.sampleAtFraction(layout.finishFraction, layout.corridorHalfWidth * 1.4);
  laps.reset();
  for (const gate of layout.checkpoints) {
    const step = across(gate, 12, 12);
    laps.update(step.from, step.to, 1200, layout.fractionAt(gate.center.x, gate.center.y));
  }
  const wideStep = { from: corner.point, to: layout.pointAhead(layout.fractionAt(corner.point.x, corner.point.y), 40, layout.corridorHalfWidth * 1.4) };
  void wide;
  check('a crossing made well off the road does not count',
    laps.update(wideStep.from, wideStep.to, 40000, layout.fractionAt(wideStep.to.x, wideStep.to.y)) === 'none');
}

// --------------------------------------------------------- the whole race run
console.log('\n[race] three laps, the card between them, and the results after');
{
  const { session, step } = withBot(1.05);

  const cards: { lap: number; lapTimeMs: number; lapsRemaining: number; position: number; fieldSize: number }[] = [];
  const states = new Set<string>();
  let sawGoWithoutClock = false;
  let elapsedAtFirstLap = 0;
  let clockDuringCard = false;

  while (!session.race.isOver && session.race.elapsed < 600_000) {
    const before = session.race.currentState;
    step();
    const state = session.race.currentState;
    states.add(state);

    if (before === 'countdown' && state === 'racing') {
      // The moment the lights go out, the clock must have just started.
      sawGoWithoutClock = session.race.elapsed > 1000;
    }
    if (state === 'lapTransition') {
      clockDuringCard = clockDuringCard || session.race.elapsed > 0;
      const card = session.hudData().lapTransition;
      if (card && cards[cards.length - 1]?.lap !== card.completedLap) {
        cards.push({
          lap: card.completedLap,
          lapTimeMs: card.lapTimeMs,
          lapsRemaining: card.lapsRemaining,
          position: card.position,
          fieldSize: card.fieldSize,
        });
        if (cards.length === 1) elapsedAtFirstLap = session.race.elapsed;
      }
    }
  }

  check('the race reached a terminal state', session.race.isOver, session.race.currentState);
  check('the player completed it', session.player.finished && session.race.isFinished,
    `${session.race.currentState}`);
  check('every state in the machine was visited',
    ['intro', 'countdown', 'racing', 'lapTransition', 'finished'].every((s) => states.has(s)),
    [...states].join(' -> '));
  check('the clock started at GO, not before', !sawGoWithoutClock);
  check('the clock kept running through the lap card', clockDuringCard);

  check('a card was shown after each of the first two laps', cards.length === 2,
    cards.map((c) => `lap ${c.lap}`).join(', '));
  check('the card reported the lap that was actually run',
    cards.length === 2 && cards[0].lap === 1 && cards[1].lap === 2, JSON.stringify(cards));
  check('the card reported a real lap time', cards.every((c) => c.lapTimeMs > 1000),
    cards.map((c) => `${(c.lapTimeMs / 1000).toFixed(2)}s`).join(', '));
  check('the card reported the laps remaining', cards.length === 2
    && cards[0].lapsRemaining === 2 && cards[1].lapsRemaining === 1,
    cards.map((c) => c.lapsRemaining).join(', '));
  check('the card reported a real position in a real field',
    cards.every((c) => c.position >= 1 && c.position <= c.fieldSize && c.fieldSize === 4),
    cards.map((c) => `P${c.position}/${c.fieldSize}`).join(', '));

  // No card after the final lap: the results screen takes over instead.
  const result = session.result();
  check('the results are available', result !== null);
  check('the final lap produced results, not another card',
    session.race.currentState === 'finished' && session.hudData().lapTransition === null,
    `${session.race.currentState}`);
  check('all three laps were recorded', result!.lapTimesMs.length === RACE.totalLaps,
    `${result!.lapTimesMs.length} laps`);
  check('the results carry the real total time',
    Math.abs(result!.timeMs - session.race.elapsed) < 50 && result!.timeMs > 0,
    `${(result!.timeMs / 1000).toFixed(2)}s vs clock ${(session.race.elapsed / 1000).toFixed(2)}s`);
  check('the reported time matches the sum of the lap times',
    Math.abs(result!.lapTimesMs.reduce((a, b) => a + b, 0) - result!.timeMs) < 50,
    `${result!.lapTimesMs.reduce((a, b) => a + b, 0)} vs ${result!.timeMs}`);
  check('the results report three laps completed', result!.lapsCompleted === RACE.totalLaps,
    `${result!.lapsCompleted}`);
  check('the best lap is the fastest lap actually run',
    result!.playerBestLapMs === Math.min(...result!.lapTimesMs),
    `${result!.playerBestLapMs} of ${result!.lapTimesMs.map((t) => (t / 1000).toFixed(2)).join(', ')}`);
  check('the results are a completion, never a failure', result!.outcome === 'finished', result!.outcome);

  // The race must stop the instant the flag is taken, not a lap later.
  const x = session.player.physics.x;
  const y = session.player.physics.y;
  const elapsed = session.race.elapsed;
  for (let i = 0; i < 120 * 5; i++) {
    session.step(STEP, { accelerate: true, brake: false, steer: 1, nitro: true, ability: false });
  }
  check('the car cannot be driven after the flag',
    Math.hypot(session.player.physics.x - x, session.player.physics.y - y) < 1e-9);
  check('the clock is stopped after the flag', session.race.elapsed === elapsed);
  check('the final time is the time at the flag', result!.timeMs === session.race.snapshot().finalTimeMs,
    `${result!.timeMs} vs ${session.race.snapshot().finalTimeMs}`);
}

// -------------------------------------------------------------- the restart
console.log('\n[restart] a second race starts completely fresh');
{
  const { session, step } = withBot(1.0);

  // Race one, all the way to the flag.
  while (!session.race.isOver && session.race.elapsed < 600_000) step();
  check('race one finished', session.race.isOver && session.race.isFinished, session.race.currentState);
  const firstResult = session.result()!;
  check('race one recorded three laps', firstResult.lapTimesMs.length === 3);

  session.reset();

  check('the clock is zeroed', session.race.elapsed === 0, `${session.race.elapsed}ms`);
  check('the race is back at the start line', session.race.currentState === 'intro', session.race.currentState);
  check('the countdown is armed again', session.race.snapshot().countdownRemainingMs === RACE.countdownSeconds * 1000);
  check('no result is reported before the new race finishes', session.result() === null);
  check('every car is back on lap 1', session.racers.every((r) => r.laps.currentLap === 1));
  check('every car is back at checkpoint 1', session.racers.every((r) => r.laps.currentCheckpoint === 1));
  check('lap times are cleared', session.racers.every((r) => r.laps.lapTimesMs.length === 0));
  check('best laps are cleared', session.racers.every((r) => r.laps.bestLapMs === null));
  check('finish positions are cleared', session.racers.every((r) => r.finishPosition === null));
  check('nitro is refilled', session.racers.every((r) => r.nitro.fraction === 1));
  check('the cars are stopped', session.racers.every((r) => r.physics.speed < 1e-9));
  check('the lap card is not showing', session.race.lapTransitionRemainingMs === 0);

  // Race two, same object, must complete exactly as race one did.
  while (!session.race.isOver && session.race.elapsed < 600_000) step();
  const secondResult = session.result()!;
  check('race two completes too', secondResult !== null && secondResult.outcome === 'finished',
    secondResult?.outcome ?? 'null');
  check('race two recorded its own three laps', secondResult.lapTimesMs.length === RACE.totalLaps,
    `${secondResult.lapTimesMs.length}`);
  check('race two carries its own time', secondResult.timeMs > 0);
  check('race two is not carrying race one over',
    secondResult.lapTimesMs[0] !== firstResult.lapTimesMs[0] || secondResult.timeMs !== firstResult.timeMs,
    'identical times on two different runs');
}

// ------------------------------------------------------------------- summary
console.log(`\n=== ${checks - failures}/${checks} checks passed ===`);
if (failures > 0) {
  console.log(`${failures} FAILED\n`);
  process.exit(1);
}
console.log('ALL CHECKS PASSED\n');