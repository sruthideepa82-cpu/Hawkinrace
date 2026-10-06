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
import { TRACKS } from '../src/data/tracks';
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
  /** Which way the race ended: everyone finished, or the player was beaten. */
  outcome: 'finished' | 'failed';
  result: ReturnType<RaceSession['result']>;
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
    // A failed race is over too, so stop driving as soon as either happens.
    if (session.race.isOver) break;

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

    // The race must not end while anyone is still running -- unless it ended in
    // failure, which is precisely the player-still-running case.
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
    outcome: session.race.isFailed ? 'failed' : 'finished',
    result: session.result(),
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
  checkClassification(street, 'Hawkins Streets');
  check('exactly 4 classified rows', street.finalStandings.length === 4);
  check('positions are 1..4',
    street.finalStandings.map((s) => s.position).join(',') === '1,2,3,4',
    street.finalStandings.map((s) => s.position).join(','));
  check('finish order strictly increasing in time',
    street.finalStandings.every((s, i, arr) => i === 0 || (arr[i - 1].finishTimeMs ?? 0) <= (s.finishTimeMs ?? Infinity)));
  check('lap count never exceeded 3', street.maxLapSeen <= 3, `max lap seen ${street.maxLapSeen}`);
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

// ------------------------------------------------------------------ all maps
// Every map shown as unlocked must be a map the field can actually race, not
// just one with a card on the select screen.
console.log('\n[race] every unlocked map is completable');
for (const trackId of TRACKS.filter((t) => t.playable).map((t) => t.id)) {
  const run = runRace(trackId, 'steve', 'falcon-gt');
  const name = TRACKS.find((t) => t.id === trackId)?.name ?? trackId;
  check(`${name}: race completes`, run.finished);
  checkClassification(run, name);
  check(`${name}: cars stay on the road`, run.maxOffTrackDistance < layoutBound(trackId),
    `max ${run.maxOffTrackDistance.toFixed(0)}px from centreline`);
  check(`${name}: lap count never exceeded 3`, run.maxLapSeen <= 3, `max ${run.maxLapSeen}`);
}

// ------------------------------------------------------------- anti-gravity
console.log('\n[race] full 4-car race on The Upside Down (anti-gravity)');
const upside = runRace('upside-down', 'steve', 'falcon-gt');
{
  const layout = new TrackLayout(getTrackDefinition('upside-down'));
  check('track has anti-gravity ranges', (layout.definition.antiGravityRanges?.length ?? 0) > 0);
  check('race completed on anti-gravity track', upside.finished);
  checkClassification(upside, 'The Upside Down');
  check('lap count never exceeded 3', upside.maxLapSeen <= 3, `max ${upside.maxLapSeen}`);
  check('cars stayed attached to the track', upside.maxOffTrackDistance < layout.roadWidth / 2 + 45,
    `max ${upside.maxOffTrackDistance.toFixed(0)}px`);
  console.log('    classification:', upside.finalStandings
    .map((s) => `${s.position}.${s.characterName}(${s.finishTimeMs ? (s.finishTimeMs / 1000).toFixed(2) : '--'}s)`)
    .join('  '));
}

// ------------------------------------------------------------------- failure
// Drives the four real outcomes by taking the flag for a chosen subset of cars
// and then stepping, so each case is exercised through the same code path the
// game uses rather than by poking the failure flag directly.
//
// `finishThese` finishes the named racers by driving them round the real track
// via their AI controllers (or, for the player, by a supplied controller), so
// the finish times are genuine and the ordering is the one the race produced.
// The same rule has to hold on the anti-gravity track, where the AI have to
// survive a section that flips the camera. Failure is checked against finish
// state rather than geometry, so it should be identical -- this proves that
// instead of assuming it.
console.log('\n[failure] the rule holds on the anti-gravity track too');
{
  const layout = new TrackLayout(getTrackDefinition('upside-down'));
  const session = new RaceSession(layout, buildGrid(CHARACTERS[0], CARS[0]));
  const playerBot = new AiDriver(
    { ...getAiProfile(CHARACTERS[0].id), cornerConfidence: 0.5, pace: 0.5 },
    session.player.tuning,
  );
  const noInput: InputState = { accelerate: false, brake: false, steer: 0, nitro: false };
  while (!session.race.isRacing && !session.race.isOver) session.step(STEP, noInput);
  for (let i = 0; i < 120 * 500 && !session.race.isOver; i++) {
    const input = session.race.isRacing
      ? playerBot.update(STEP, layout, session.player.physics,
          session.racers.filter((r) => !r.isPlayer).map((r) => ({
            physics: r.physics,
            aheadInRace: r.laps.totalRaceProgress > session.player.laps.totalRaceProgress,
          })), !session.player.nitro.isEmpty)
      : noInput;
    session.step(STEP, input);
  }
  const result = session.result();
  check('anti-gravity: a slow player beaten by all 3 AI fails',
    result?.outcome === 'failed' && result.aiFinishedCount === 3,
    `outcome ${result?.outcome}, ai ${result?.aiFinishedCount}`);
  check('anti-gravity: failure classifies the player 4/4',
    result?.playerPosition === 4,
    `P${result?.playerPosition}`);
  check('anti-gravity: player had not finished',
    !session.player.finished,
    'player finished');
}

console.log('\n[failure] three AI finishing before the player ends the race');
{
  /**
   * Puts every car except `id` over the line, leaving `id` still racing, then
   * steps the session and reports the state. `playerConfidence` controls how
   * fast the leftover car is driving, so the player can be made to finish
   * before or after the AI depending on the scenario.
   */
  function scenario(
    opts: { finish?: string[]; playerConfidence?: number; steps?: number },
  ) {
    const layout = new TrackLayout(getTrackDefinition('hawkins-streets'));
    const character = CHARACTERS[0];
    const car = CARS[0];
    const session = new RaceSession(layout, buildGrid(character, car));
    const player = session.player;

    const botFor = (r: (typeof session.racers)[number]) =>
      new AiDriver(
        r.isPlayer
          ? { ...getAiProfile(character.id), cornerConfidence: opts.playerConfidence ?? 1, pace: opts.playerConfidence ?? 1 }
          : getAiProfile(r.config.characterId),
        r.tuning,
      );

    const bots = new Map(session.racers.map((r) => [r, botFor(r)]));
    const noInput: InputState = { accelerate: false, brake: false, steer: 0, nitro: false };

    // Let the countdown clear.
    while (!session.race.isRacing && !session.race.isOver) session.step(STEP, noInput);

    let failFrame = -1;
    let maxSteps = opts.steps ?? 120 * 400;
    for (let i = 0; i < maxSteps && !session.race.isOver; i++) {
      const input = session.race.isRacing
        ? bots.get(player)!.update(
            STEP,
            layout,
            player.physics,
            session.racers
              .filter((r) => r !== player)
              .map((r) => ({ physics: r.physics, aheadInRace: r.laps.totalRaceProgress > player.laps.totalRaceProgress })),
            !player.nitro.isEmpty,
          )
        : noInput;
      session.step(STEP, input);
      if (failFrame < 0 && session.race.isFailed) failFrame = i;
    }

    return {
      session,
      failFrame,
      playerFinished: player.finished,
      aiFinished: session.aiFinishedCount(),
      result: session.result(),
    };
  }

  // 5, 6, 7. One AI first -> race continues. Two AI first -> still continues.
  //    Three AI first -> the player has failed.
  {
    // Drive the player slowly and let the AI run; count the frames on which the
    // race ends versus how many AI had finished at that point.
    const oneAndTwo = [1, 2].map((aiTarget) => {
      const layout = new TrackLayout(getTrackDefinition('hawkins-streets'));
      const session = new RaceSession(layout, buildGrid(CHARACTERS[0], CARS[0]));
      const player = session.player;
      const playerBot = new AiDriver(
        { ...getAiProfile(CHARACTERS[0].id), cornerConfidence: 0.9, pace: 0.9 },
        player.tuning,
      );
      const noInput: InputState = { accelerate: false, brake: false, steer: 0, nitro: false };
      while (!session.race.isRacing && !session.race.isOver) session.step(STEP, noInput);

      // Freeze the player in place so only the AI can finish. Freeze them all but
      // `aiTarget` of them off the road by parking them beside the finish line
      // pointing at it -- but instead, simply hold the player still and race
      // until exactly the target number of AI have finished.
      const heldPlayer = { x: player.physics.x, y: player.physics.y };
      let framesAtTarget = -1;
      for (let i = 0; i < 120 * 400; i++) {
        if (session.race.isOver) break;
        const input: InputState = session.race.isRacing
          ? playerBot.update(STEP, layout, player.physics,
              session.racers.filter((r) => !r.isPlayer).map((r) => ({
                physics: r.physics, aheadInRace: r.laps.totalRaceProgress > player.laps.totalRaceProgress,
              })), !player.nitro.isEmpty)
          : noInput;
        // Park the player: it should be the one that cannot keep up, so the AI
        // finish ahead of it without it being stopped artificially mid-corner.
        player.physics.x = heldPlayer.x;
        player.physics.y = heldPlayer.y;
        session.step(STEP, input);
        if (framesAtTarget < 0 && session.aiFinishedCount() >= aiTarget) framesAtTarget = i;
        // Once the target count is reached, check the race has NOT ended.
        if (framesAtTarget >= 0 && session.aiFinishedCount() >= aiTarget && aiTarget < 3) {
          break;
        }
      }
      return {
        aiTarget,
        aiFinished: session.aiFinishedCount(),
        isOver: session.race.isOver,
        isFailed: session.race.isFailed,
        playerFinished: player.finished,
      };
    });

    check('1 AI finishing first does NOT fail the race',
      oneAndTwo[0].aiFinished >= 1 && !oneAndTwo[0].isFailed,
      `ai finished ${oneAndTwo[0].aiFinished}, failed=${oneAndTwo[0].isFailed}`);
    check('2 AI finishing first does NOT fail the race',
      oneAndTwo[1].aiFinished >= 2 && !oneAndTwo[1].isFailed,
      `ai finished ${oneAndTwo[1].aiFinished}, failed=${oneAndTwo[1].isFailed}`);
  }

  // 7. Three AI finish before the player -> failure, immediately.
  {
    const s = scenario({ playerConfidence: 0.5 });
    check('3 AI finishing before the player FAILS the race',
      s.result?.outcome === 'failed',
      `outcome ${s.result?.outcome}, ai finished ${s.aiFinished}`);
    check('failure triggers the moment the 3rd AI finishes',
      s.aiFinished === 3 && !s.playerFinished,
      `ai ${s.aiFinished}, player finished ${s.playerFinished}`);
    check('player is classified last (4/4) on failure',
      s.result?.playerPosition === 4,
      `position ${s.result?.playerPosition}`);
    check('player does NOT finish after failing',
      !s.session.player.finished,
      'player finished');
    check('player cannot keep driving after failure',
      s.session.race.isOver && !s.session.race.isRacing,
      `isOver ${s.session.race.isOver}, isRacing ${s.session.race.isRacing}`);
  }

  // 1-4, 8. Finishing order decides the player's placing, and finishing at all is
  // never a failure -- only finishing behind all three AI is.
  //
  // Each car is walked over the line through the real checkpoint path one at a
  // time, so their crossing times are genuinely ordered by who was driven first.
  // That makes the player's placing exactly `AI finished before me + 1`, which is
  // the rule under test.
  {
    /**
     * Runs a race where only the released cars move; every other car is pinned to
     * its grid position each frame. Releasing cars one at a time and waiting for
     * each to take the flag therefore produces an exact finishing order, using
     * the real controllers, the real checkpoints and the real race clock.
     *
     * Pinning rather than teleporting matters: `RaceSession.step` measures gate
     * crossings from the position at the START of the step, so a car moved by
     * teleport jumps over the gate line and is never credited with it. Cars have
     * to actually drive round, which is what these checks are meant to exercise.
     */
    function runOrdered(order: readonly 'player' | 'ai'[]) {
      const layout = new TrackLayout(getTrackDefinition('hawkins-streets'));
      const character = CHARACTERS[0];
      const session = new RaceSession(layout, buildGrid(character, CARS[0]));
      const noInput: InputState = { accelerate: false, brake: false, steer: 0, nitro: false };
      const ais = session.racers.filter((r) => !r.isPlayer);
      const held = new Map(session.racers.map((r) => [r, { x: r.physics.x, y: r.physics.y }]));
      const playerBot = new AiDriver(getAiProfile(character.id), session.player.tuning);

      while (!session.race.isRacing && !session.race.isOver) session.step(STEP, noInput);

      // `order` is the finishing order to reproduce. Cars are mapped to concrete
      // racers here rather than inside `step`, so repeated 'ai' entries pull
      // distinct cars instead of the same one.
      let aiUsed = 0;
      const cars = order.map((who) =>
        who === 'player' ? session.player : ais[aiUsed++],
      );
      let next = 0;
      let justReleased = true;

      for (let i = 0; i < 120 * 900 && !session.race.isOver; i++) {
        const racing = cars[next];
        for (const r of session.racers) {
          if (r === racing) continue;
          const at = held.get(r)!;
          r.physics.x = at.x;
          r.physics.y = at.y;
          r.physics.vx = 0;
          r.physics.vy = 0;
        }
        // A held car's AI still ticks each frame, so by the time it is released
        // its driver believes it has been stuck for the whole wait and starts by
        // reversing. Reset on release so it drives normally.
        if (justReleased) {
          racing.ai?.reset();
          justReleased = false;
        }

        const input: InputState = session.race.isRacing && racing === session.player
          ? playerBot.update(
              STEP,
              layout,
              session.player.physics,
              ais.map((r) => ({ physics: r.physics, aheadInRace: false })),
              !session.player.nitro.isEmpty,
            )
          : noInput;
        session.step(STEP, input);

        // The released car has taken the flag: send out the next one.
        if (racing.laps.isComplete && next < cars.length - 1) {
          next++;
          justReleased = true;
        }
      }
      return { session, result: session.result() };
    }

    // 1st: the player is released first and reaches the flag before anything else.
    {
      const { result, session } = runOrdered(['player', 'ai', 'ai', 'ai']);
      check('Steve 1st -> WIN (P1)',
        result?.playerPosition === 1 && result?.outcome === 'finished',
        `P${result?.playerPosition}, ${result?.outcome}`);
      check('1st place is never reported as a failure',
        !session.race.isFailed,
        'failed');
    }

    // 2nd / 3rd: release N AI ahead of the player, in that order.
    for (const aiFirst of [1, 2]) {
      const queue: ('player' | 'ai')[] = [...Array(aiFirst).fill('ai' as const), 'player'];
      while (queue.length < 4) queue.push('ai');
      const { result, session } = runOrdered(queue);
      const expected = aiFirst + 1;
      check(`${aiFirst} AI first -> Steve is P${expected}`,
        result?.playerPosition === expected,
        `expected P${expected}, got P${result?.playerPosition}`);
      check(`${aiFirst} AI first -> result is 'finished', not a failure`,
        result?.outcome === 'finished' && !session.race.isFailed,
        `outcome ${result?.outcome}`);
    }

    // 4th: all three AI take the flag first. This is the failure case, and it is
    // also the only way the player can be classified last while still racing.
    {
      const { result, session } = runOrdered(['ai', 'ai', 'ai', 'player']);
      const ais = session.racers.filter((r) => !r.isPlayer);
      check('3 AI first -> Steve is classified P4',
        result?.playerPosition === 4,
        `P${result?.playerPosition}`);
      check('3 AI first -> outcome is a FAILURE, never "RACE COMPLETE"',
        result?.outcome === 'failed',
        `outcome ${result?.outcome}`);
      check('failure reports all 3 AI as finished',
        result?.aiFinishedCount === 3,
        `aiFinished ${result?.aiFinishedCount}`);
      check('player is still un-finished when the race ends',
        !session.player.finished,
        'player finished');
      // The player must be P4 without a finish ever being invented for them: the
      // three AI hold 1st-3rd because they took the flag, and the player is
      // sorted behind them because they are still racing.
      const board = session.standings();
      check('the three AI hold 1st-3rd on the flag, the player is not credited',
        ais.every((ai) => {
          const row = board.find((s) => s.characterId === ai.config.characterId);
          return ai.finishPosition !== null && row !== undefined && row.finished;
        }),
        ais.map((ai) => `${ai.config.characterName}=${ai.finishPosition}`).join(','));
      check('player has no finish position of their own',
        session.player.finishPosition === null,
        String(session.player.finishPosition));
      check('player is P4 in the standings despite no finish position',
        session.standings().find((s) => s.isPlayer)!.position === 4,
        `P${session.standings().find((s) => s.isPlayer)!.position}`);
    }
  }

  // 9. Retry after failure resets everything.
  {
    const layout = new TrackLayout(getTrackDefinition('hawkins-streets'));
    const session = new RaceSession(layout, buildGrid(CHARACTERS[0], CARS[0]));
    const player = session.player;
    const playerBot = new AiDriver({ ...getAiProfile(CHARACTERS[0].id), cornerConfidence: 0.5, pace: 0.5 }, player.tuning);
    const noInput: InputState = { accelerate: false, brake: false, steer: 0, nitro: false };
    while (!session.race.isRacing && !session.race.isOver) session.step(STEP, noInput);
    for (let i = 0; i < 120 * 400 && !session.race.isOver; i++) {
      const input = session.race.isRacing
        ? playerBot.update(STEP, layout, player.physics,
            session.racers.filter((r) => r !== player).map((r) => ({
              physics: r.physics, aheadInRace: r.laps.totalRaceProgress > player.laps.totalRaceProgress,
            })), !player.nitro.isEmpty)
        : noInput;
      session.step(STEP, input);
    }
    check('scenario reached a failure before retry',
      session.race.isFailed, `failed ${session.race.isFailed}`);

    session.reset();
    check('retry clears the failure state',
      !session.race.isFailed && !session.race.isOver,
      `failed ${session.race.isFailed}, over ${session.race.isOver}`);
    // The race opens with the title intro and only then counts down, so a
    // retry returns to the intro. This used to assert 'countdown', which was
    // correct before the intro was added and has been stale ever since.
    check('retry returns to the intro',
      session.race.currentState === 'intro',
      session.race.currentState);
    check('retry resets every car lap to 1',
      session.racers.every((r) => r.laps.currentLap === 1),
      session.racers.map((r) => r.laps.currentLap).join(','));
    check('retry clears every finish position',
      session.racers.every((r) => r.finishPosition === null),
      session.racers.map((r) => String(r.finishPosition)).join(','));
    check('retry refills nitro',
      session.racers.every((r) => r.nitro.fraction === 1),
      session.racers.map((r) => r.nitro.fraction.toFixed(2)).join(','));
    check('retry zeroes the clock',
      session.race.elapsed === 0,
      `${session.race.elapsed}ms`);
    check('retry puts all cars back on the grid',
      session.racers.every((r) => layout.locate(r.physics.x, r.physics.y).distance < layout.roadWidth / 2),
      session.racers.map((r) => layout.locate(r.physics.x, r.physics.y).distance.toFixed(0)).join(','));
  }
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
  check('retry returns to the intro', state === 'intro', state);
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

  // A race opens with the title intro and only THEN counts down, so "before
  // the lights go out" spans both phases. This used to step 2.5s and expect
  // 'countdown', which it could never see: the intro alone runs 3.5s.
  const stepFor = (seconds: number) => {
    for (let i = 0; i < Math.round(seconds / STEP); i++) {
      session.step(STEP, { accelerate: true, brake: false, steer: 0, nitro: false });
    }
  };
  const drift = () => Math.max(...session.racers.map((r, i) =>
    Math.hypot(r.physics.x - before[i].x, r.physics.y - before[i].y)));

  stepFor(2.5);
  check('still in the intro at 2.5s', session.race.currentState === 'intro', session.race.currentState);
  check('no car moves during the intro', drift() < 1, `drift ${drift().toFixed(3)}px`);

  // Past the 3.5s intro and into the 3s countdown.
  stepFor(2);
  check('counting down once the intro is done', session.race.currentState === 'countdown', session.race.currentState);
  check('no car moves during the countdown', drift() < 1, `drift ${drift().toFixed(3)}px`);

  stepFor(3.1);
  check('lights go out into racing', session.race.currentState === 'racing', session.race.currentState);
}

// ------------------------------------------------------------------- summary
/**
 * Asserts the classification is coherent at the moment the race ends.
 *
 * The race deliberately ends when the PLAYER takes the chequered flag, even
 * with AI still running (see `RaceSession.resolveOutcome`). So "every car
 * finished" is the wrong thing to assert -- a finished player has no input
 * left to give, and waiting out the rest of the field just delays the results
 * screen. What must hold instead is that the whole grid is classified, that
 * anyone who took the flag is ranked ahead of anyone who did not, and that
 * cars still on track carry no invented finish time.
 */
function checkClassification(run: RunResult, trackName: string): void {
  const rows = run.finalStandings;
  const player = rows.find((s) => s.isPlayer);

  check(`${trackName}: the whole grid is classified`, rows.length === 4, `${rows.length} rows`);
  check(`${trackName}: the player took the chequered flag`, player?.finished === true,
    `player finished ${player?.finished}`);
  check(`${trackName}: at least one car took the flag`,
    rows.some((s) => s.finished), `${rows.filter((s) => s.finished).length} finished`);

  const lastFinished = Math.max(...rows.filter((s) => s.finished).map((s) => s.position));
  const firstUnfinished = Math.min(...rows.filter((s) => !s.finished).map((s) => s.position), Infinity);
  check(`${trackName}: finishers are ranked ahead of cars still running`,
    firstUnfinished === Infinity || firstUnfinished > lastFinished,
    `last finisher P${lastFinished}, first still running P${firstUnfinished}`);

  check(`${trackName}: cars still running are credited with no finish time`,
    rows.filter((s) => !s.finished).every((s) => s.finishTimeMs === null),
    rows.map((s) => `${s.characterName}:${s.finishTimeMs}`).join(' '));

  check(`${trackName}: every classified row has a position`,
    rows.every((s) => s.position >= 1 && s.position <= 4));
}

function layoutBound(trackId: string): number {
  return new TrackLayout(getTrackDefinition(trackId)).roadWidth / 2 + 45;
}

console.log(`\n=== ${checks - failures}/${checks} checks passed ===`);
if (failures > 0) {
  console.log(`${failures} FAILED\n`);
  process.exit(1);
}
console.log('ALL CHECKS PASSED\n');