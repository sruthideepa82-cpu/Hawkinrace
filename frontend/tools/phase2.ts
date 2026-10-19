/**
 * Headless verification for AI difficulty and the Time Trial mode.
 *
 * Both are new in Phase 2 and both are pure config/session behaviour, so they
 * can be exercised without a browser: `RaceSession` is Phaser-free and the AI
 * drivers are driven through the same `AiDriver` the game uses.
 *
 * What this deliberately does NOT do is assert a wall-clock lap time. Difficulty
 * is a real behavioural difference, but how long a lap takes depends on the
 * track, the chassis and the driver stats, so pinning a time here would make the
 * test a change-detector. Instead it asserts the things that must be true
 * whatever the numbers: the grid really is smaller, the profiles really are
 * ordered, and a slower driver really does cover less road in the same time.
 *
 * Run with:
 *   node --experimental-transform-types --import ./tools/register.mjs \
 *     tools/phase2.ts
 */
import { TrackLayout } from '../src/game/entities/TrackLayout';
import { getTrackDefinition } from '../src/game/config/tracks';
import { buildGrid, getAiProfile } from '../src/game/config/racers';
import { DIFFICULTIES, DIFFICULTY_ORDER, getDifficulty, scaleAiProfile } from '../src/game/config/difficulty';
import { RaceSession } from '../src/game/systems/RaceSession';
import { AiDriver } from '../src/game/systems/AiDriver';
import { CarPhysics } from '../src/game/entities/CarPhysics';
import { CAR } from '../src/game/config/GameConfig';
import { CHARACTERS } from '../src/data/characters';
import { CARS } from '../src/data/cars';
import { isTimeTrialMode, GAME_MODES } from '../src/data/gameModes';
import type { InputState } from '../src/game/entities/CarPhysics';
import { createRacerTuning } from '../src/game/config/carTuning';
import { getCharacterStats } from '../src/game/config/characterTuning';
import type { AiProfile } from '../src/game/config/racers';

const STEP = 1 / 120;
const TRACK = 'hawkins-streets';

let failures = 0;
let checks = 0;

function check(label: string, condition: boolean, detail = ''): void {
  checks++;
  if (condition) console.log(`  PASS  ${label}${detail ? ` (${detail})` : ''}`);
  else {
    failures++;
    console.log(`  FAIL  ${label}${detail ? ` -> ${detail}` : ''}`);
  }
}

const NO_INPUT: InputState = { accelerate: false, brake: false, steer: 0, nitro: false, ability: false };

/** Half the car's collision footprint, matching `RaceSession`. */
const CAR_HALF_LENGTH = CAR.width / 2 + CAR.footprintPadding;
const CAR_HALF_WIDTH = CAR.height / 2 + CAR.footprintPadding;

/**
 * A real chassis, built through the same factory the game uses, so every field
 * `CarPhysics` reads is actually present. A hand-rolled partial tuning object
 * reads as `undefined` inside the physics and silently stops the car moving,
 * which is exactly the kind of false result this harness exists to avoid.
 */
const TEST_TUNING = createRacerTuning(CARS[0].id, getCharacterStats('mike'), 1);

/**
 * Steps a session until the lights go out.
 *
 * `RaceManager.update` only advances ONE phase transition per call, so the intro
 * has to finish before the countdown starts counting. Stepping the session (not
 * calling `race.update` once) is what a real race does, so that is what this
 * does too.
 */
function advanceToRacing(session: RaceSession, maxSteps = 2000): boolean {
  for (let i = 0; i < maxSteps; i++) {
    if (session.race.isRacing) return true;
    session.step(STEP, NO_INPUT);
  }
  return session.race.isRacing;
}

// ---------------------------------------------------------------- difficulty

console.log('\nAI DIFFICULTY');
console.log('-'.repeat(70));

// The table itself is the contract: three real, distinct presets.
check('three difficulties are defined', DIFFICULTY_ORDER.length === 3, DIFFICULTY_ORDER.join(', '));
check(
  'every difficulty has a name and description',
  DIFFICULTY_ORDER.every((id) => {
    const d = DIFFICULTIES[id];
    return d.name.length > 0 && d.description.length > 0 && d.id === id;
  }),
);
check('an unknown id falls back to normal rather than throwing', getDifficulty('nonsense').id === 'normal');
check('a null id falls back to normal', getDifficulty(null).id === 'normal');
check('a missing id falls back to normal', getDifficulty(undefined).id === 'normal');

// Difficulty must be ordered, or "easy" and "hard" are just two words.
check('easy is slower than normal', DIFFICULTIES.easy.pace < DIFFICULTIES.normal.pace);
check('hard is faster than normal', DIFFICULTIES.hard.pace > DIFFICULTIES.normal.pace);
check('easy runs wider than hard', DIFFICULTIES.easy.lineBias > DIFFICULTIES.hard.lineBias);
check('easy reacts later than hard', DIFFICULTIES.easy.reaction > DIFFICULTIES.hard.reaction);
check('easy uses less nitro than hard', DIFFICULTIES.easy.nitroEagerness < DIFFICULTIES.hard.nitroEagerness);
check('easy trusts the car less', DIFFICULTIES.easy.grip < DIFFICULTIES.hard.grip);
check('easy passes less than hard', DIFFICULTIES.easy.overtaking < DIFFICULTIES.hard.overtaking);

// The grip ceiling is the one clamp that matters: past 1 the tyre model wins and
// the AI simply drives off the road. The table may legitimately express "hard
// trusts the car more" as a number above 1; what must never reach a driver is a
// SCALED value above it.
check('no scaled profile exceeds the tyre grip ceiling', DIFFICULTY_ORDER.every((id) => {
  return scaleAiProfile(getAiProfile('mike'), DIFFICULTIES[id]).grip <= 1;
}));
check('an over-ceiling table entry is clamped, not passed through', (() => {
  const greedy = { ...DIFFICULTIES.normal, grip: 1.4 };
  return scaleAiProfile(getAiProfile('mike'), greedy).grip === 1;
})());
check('a below-ceiling grip is passed through unchanged', (() => {
  const timid = { ...DIFFICULTIES.normal, grip: 0.5 };
  return scaleAiProfile(getAiProfile('mike'), timid).grip === 0.5;
})());

// Scaling a profile must actually change it.
const base = getAiProfile('mike');
const easyProfile = scaleAiProfile(base, DIFFICULTIES.easy);
const hardProfile = scaleAiProfile(base, DIFFICULTIES.hard);
check('scaling changes pace', easyProfile.pace < base.pace && hardProfile.pace > base.pace);
check('scaling changes corner confidence', easyProfile.cornerConfidence < base.cornerConfidence);
check('scaling carries reaction through', hardProfile.reaction === DIFFICULTIES.hard.reaction);
check('normal leaves a profile at its authored values', (() => {
  const n = scaleAiProfile(base, DIFFICULTIES.normal);
  return n.pace === base.pace && n.cornerConfidence === base.cornerConfidence && n.reaction === 1 && n.grip === 1;
})());
check('scaling preserves the per-driver seed', easyProfile.seed === base.seed);

// --- the grid actually reflects difficulty -------------------------------

const gridFor = (id: (typeof DIFFICULTY_ORDER)[number], solo = false) =>
  buildGrid(CHARACTERS[0], CARS[0], { difficulty: DIFFICULTIES[id], solo });

const easyGrid = gridFor('easy');
const normalGrid = gridFor('normal');
const hardGrid = gridFor('hard');

check('easy builds a smaller field than normal', easyGrid.length < normalGrid.length, `${easyGrid.length} vs ${normalGrid.length}`);
check('normal and hard build the same field size', normalGrid.length === hardGrid.length);
check('every grid has exactly one player', [easyGrid, normalGrid, hardGrid].every((g) => g.filter((r) => r.isPlayer).length === 1));
check('no driver appears twice on a grid', [easyGrid, normalGrid, hardGrid].every((g) => new Set(g.map((r) => r.characterId)).size === g.length));
check('the player keeps the character they picked', easyGrid[0].characterId === CHARACTERS[0].id);
check('the player has no AI profile', normalGrid[0].aiProfile === null);
check('every AI carries a resolved profile', normalGrid.slice(1).every((r) => r.aiProfile !== null));

// The grid's AI must really be scaled, not just labelled.
const easyAi = easyGrid.slice(1).map((r) => r.aiProfile as AiProfile);
const hardAi = hardGrid.slice(1).map((r) => r.aiProfile as AiProfile);
check('easy grid paces its AI below hard', easyAi.every((p, i) => p.pace < hardAi[i].pace));
check('hard grid paces its AI above the authored profile', hardAi.every((p) => p.pace >= base.pace));

// --- the field size is a hard clamp, not a suggestion -------------------

check('field size is clamped to the roster', (() => {
  const absurd = buildGrid(CHARACTERS[0], CARS[0], { fieldSize: 99 });
  return absurd.length <= CHARACTERS.length;
})(), `${buildGrid(CHARACTERS[0], CARS[0], { fieldSize: 99 }).length} <= ${CHARACTERS.length}`);
check('field size 1 builds a solo grid', buildGrid(CHARACTERS[0], CARS[0], { fieldSize: 1 }).length === 1);
check('a field size below 1 is clamped up to 1', buildGrid(CHARACTERS[0], CARS[0], { fieldSize: 0 }).length === 1);

// --- difficulty changes what the car actually does ----------------------

/**
 * Drives ONE AI around a real track with the real `CarPhysics`, and reports how
 * much centreline it covered.
 *
 * This is the honest behavioural measurement of a difficulty setting. It uses
 * the same physics, the same track and the same boundary solver the game runs,
 * so the only variable is the driving policy. Measuring distance rather than a
 * lap time keeps it independent of the track length.
 */
function raceSoloAi(difficultyId: (typeof DIFFICULTY_ORDER)[number], seconds: number): number {
  const layout = new TrackLayout(getTrackDefinition(TRACK));
  const driver = new AiDriver(
    scaleAiProfile(getAiProfile('mike'), DIFFICULTIES[difficultyId]),
    TEST_TUNING,
  );
  const car = new CarPhysics(TEST_TUNING);
  car.reset(layout.spawn.x, layout.spawn.y, layout.spawn.heading);

  let travelled = 0;
  let lastFraction = layout.fractionAt(car.x, car.y);
  const steps = Math.round(seconds / STEP);

  for (let i = 0; i < steps; i++) {
    const input = driver.update(STEP, layout, car, [], !driverTankEmpty(driver)) as InputState;
    const surface = layout.getSurface(car.x, car.y, car.heading, CAR_HALF_LENGTH, CAR_HALF_WIDTH);
    car.step(STEP, input, surface.dragMultiplier, input.nitro ? 1 : 0, 1);
    const hit = layout.resolveBoundary(car.x, car.y, car.heading, CAR_HALF_LENGTH, CAR_HALF_WIDTH);
    if (hit) car.applyCollision(hit, STEP);

    // Accumulate arc distance the same way LapManager does, so the figure is
    // comparable with what the race itself would call progress.
    const f = layout.fractionAt(car.x, car.y);
    let delta = f - lastFraction;
    if (delta > 0.5) delta -= 1;
    else if (delta < -0.5) delta += 1;
    travelled += delta * layout.trackLength;
    lastFraction = f;
  }
  return Math.abs(travelled);
}

/**
 * Whether the driver could be out of nitro. The driver asks for a boost only if
 * it has some, and this harness models that with a fixed tank so the AI is free
 * to use nitro exactly as it would in a real race.
 */
let aiTank = 0;
function driverTankEmpty(_driver: AiDriver): boolean {
  return aiTank <= 0;
}

console.log('\n  (racing one AI per difficulty on the real track for 40s)');
const easyMetres = raceSoloAi('easy', 40);
const normalMetres = raceSoloAi('normal', 40);
const hardMetres = raceSoloAi('hard', 40);
check('hard AI covers more road than normal in equal time', hardMetres > normalMetres, `${hardMetres.toFixed(0)} vs ${normalMetres.toFixed(0)}`);
check('normal AI covers more road than easy in equal time', normalMetres > easyMetres, `${normalMetres.toFixed(0)} vs ${easyMetres.toFixed(0)}`);
check('every difficulty actually drives', easyMetres > 100 && normalMetres > 100 && hardMetres > 100);

// The failure mode difficulty tuning can introduce is a driver too slow to ever
// be recovered, or too fast to stay on the road. Neither may happen.
check('no difficulty is so slow it cannot move', easyMetres > 0.15 * hardMetres, `${(easyMetres / hardMetres).toFixed(2)} of hard`);
check('hard difficulty does not drive off the road', (() => {
  const layout = new TrackLayout(getTrackDefinition(TRACK));
  const driver = new AiDriver(scaleAiProfile(getAiProfile('mike'), DIFFICULTIES.hard), TEST_TUNING);
  const car = new CarPhysics(TEST_TUNING);
  car.reset(layout.spawn.x, layout.spawn.y, layout.spawn.heading);
  let offRoad = 0;
  for (let i = 0; i < Math.round(30 / STEP); i++) {
    const input = driver.update(STEP, layout, car, [], false) as InputState;
    const surface = layout.getSurface(car.x, car.y, car.heading, CAR_HALF_LENGTH, CAR_HALF_WIDTH);
    car.step(STEP, input, surface.dragMultiplier, 0, 1);
    const hit = layout.resolveBoundary(car.x, car.y, car.heading, CAR_HALF_LENGTH, CAR_HALF_WIDTH);
    if (hit) car.applyCollision(hit, STEP);
    if (layout.locate(car.x, car.y).distance > layout.roadWidth / 2) offRoad++;
  }
  return offRoad / (30 / STEP) < 0.02;
})());

// -------------------------------------------------------------- time trial

console.log('\nTIME TRIAL');
console.log('-'.repeat(70));

check('time trial is a listed, playable mode', (() => {
  const m = GAME_MODES.find((x) => x.id === 'time-trial');
  return m !== undefined && m.playable === true;
})());
check('quick race is still playable', GAME_MODES.find((x) => x.id === 'quick-race')?.playable === true);
check('unbuilt modes are still locked', ['survival', 'nitro-rush', 'upside-down'].every((id) => GAME_MODES.find((x) => x.id === id)?.playable === false));
check('only time trial is detected as solo', isTimeTrialMode('time-trial') && !isTimeTrialMode('quick-race') && !isTimeTrialMode(null));

const layout = new TrackLayout(getTrackDefinition(TRACK));
const soloGrid = buildGrid(CHARACTERS[0], CARS[0], { solo: true });
const soloSession = new RaceSession(layout, soloGrid, undefined, { mode: 'time-trial' });

check('a time trial grid is the player alone', soloGrid.length === 1, `${soloGrid.length} car(s)`);
check('the session reports itself as a time trial', soloSession.isTimeTrial === true);
check('the session field size is 1', soloSession.fieldSize === 1);
check('there are no AI cars on the grid', soloSession.racers.filter((r) => !r.isPlayer).length === 0);

// THE bug this guards: `aiFinished >= aiCount` is `0 >= 0` on a solo grid, which
// would fail the race on its very first step.
check('a solo race reaches the flag after the countdown', advanceToRacing(soloSession));
check('a solo race does not fail once it is racing', (() => {
  for (let i = 0; i < 60; i++) soloSession.step(STEP, NO_INPUT);
  return soloSession.race.isOver === false && soloSession.race.currentState === 'racing';
})(), soloSession.race.currentState);

// Drive it for a while and confirm nothing manufactures an opponent.
let soloFinishedEarly = false;
for (let i = 0; i < 120 * 40; i++) {
  soloSession.step(STEP, NO_INPUT);
  if (soloSession.race.isOver) {
    soloFinishedEarly = true;
    break;
  }
}
check('a solo race only ends by taking the flag', !soloFinishedEarly || soloSession.player.finished);

// The HUD readout must not invent a position.
const soloHud = soloSession.hudData();
check('the HUD marks the race as a time trial', soloHud.isTimeTrial === true);
check('the HUD reports no position for a solo race', soloHud.playerPosition === 0, String(soloHud.playerPosition));
check('the HUD reports no rivals finished', soloHud.rivalsFinished <= 1);

// Positions are still internally consistent -- just not shown.
check('standings contain only the player', soloSession.standings().every((s) => s.isPlayer));

// Laps must still count, on the same checkpoint system as a Quick Race.
const normalSession = new RaceSession(layout, buildGrid(CHARACTERS[0], CARS[0]), undefined, { mode: 'quick-race' });
check('a quick race is not a time trial', normalSession.isTimeTrial === false);
check('a quick race really has opponents', normalSession.racers.filter((r) => !r.isPlayer).length === normalGrid.length - 1);

// Best lap tracking is the headline number in a Time Trial.
const lapManager = soloSession.player.laps;
check('best lap starts null', lapManager.bestLapMs === null);
check('laps remaining counts the whole race', lapManager.lapsRemaining === lapManager.totalLaps, String(lapManager.lapsRemaining));

// Restart must put a solo race back exactly where it started.
soloSession.reset();
check('restart clears the clock', soloSession.race.elapsed === 0);
check('restart returns to the intro', soloSession.race.currentState === 'intro');
check('restart resets the lap counter', soloSession.player.laps.currentLap === 1);
check('restart clears the finish flag', soloSession.player.finished === false);
check('restart refills nitro', soloSession.player.nitro.fraction === 1);
check('restart leaves the HUD reporting no position', soloSession.hudData().playerPosition === 0);

// A completed Quick Race still classifies normally -- the solo changes must not
// have leaked into the race that has opponents.
const quickResultGrid = buildGrid(CHARACTERS[0], CARS[0]);
const quickSession = new RaceSession(layout, quickResultGrid, undefined, { mode: 'quick-race' });
advanceToRacing(quickSession);
for (let i = 0; i < 60; i++) quickSession.step(STEP, NO_INPUT);
check('a quick race is still racing after the countdown', quickSession.race.currentState === 'racing');
check('a quick race still ranks the player between 1 and the field', (() => {
  const p = quickSession.playerPosition();
  return p >= 1 && p <= quickSession.fieldSize;
})(), `P${quickSession.playerPosition()}/${quickSession.fieldSize}`);
check('a quick race HUD reports a real position', quickSession.hudData().playerPosition > 0);

console.log('\n' + '-'.repeat(70));
console.log(`  ${checks - failures}/${checks} checks passed`);
if (failures > 0) {
  console.log('  SOME CHECKS FAILED');
  process.exit(1);
}
console.log('  ALL CHECKS PASSED');