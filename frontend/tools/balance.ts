/**
 * Balance benchmark.
 *
 * Sweeps every player driver/car choice and a range of driving skill, then
 * reports how often each driver wins and how often the player places. A single
 * race proves nothing -- the field is deterministic, so the same inputs always
 * give the same order -- and neither does sweeping only one grid, because the
 * chassis handed to the AI is derived from the player's own picks.
 *
 *   node --experimental-transform-types --import ./tools/register.mjs \
 *        tools/balance.ts [trackId] [trialsPerSkill]
 */
import { AiDriver, type AiDebug } from '../src/game/systems/AiDriver';
import { RaceSession } from '../src/game/systems/RaceSession';
import { TrackLayout } from '../src/game/entities/TrackLayout';
import { buildGrid, getAiProfile, type AiProfile } from '../src/game/config/racers';
import { getTrackDefinition } from '../src/game/config/tracks';
import { CARS } from '../src/data/cars';
import { CHARACTERS } from '../src/data/characters';
import type { InputState } from '../src/game/entities/CarPhysics';

const STEP = 1 / 120;

interface RaceOutcome {
  winner: string;
  /** True when the player won, so player wins are not counted as AI wins. */
  playerWon: boolean;
  playerPosition: number;
  playerTime: number;
  winnerTime: number;
}

/**
 * Runs one race with the player's car driven by a bot of the given skill.
 *
 * The player slot goes through `RaceSession.step` exactly as a human's input
 * would, so this measures the real race, not a parallel simulation.
 */
function runRace(layout: TrackLayout, driverIndex: number, carIndex: number, skill: AiProfile, seed: number): RaceOutcome {
  const configs = buildGrid(CHARACTERS[driverIndex], CARS[carIndex]);
  const holder: { bot: AiDriver | null; debug: AiDebug | null } = { bot: null, debug: null };

  const session = new RaceSession(layout, configs, (config, tuning) => {
    const driver = new AiDriver(getAiProfile(config.characterId), tuning);
    if (config.isPlayer) {
      holder.bot = new AiDriver(skill, tuning);
      driver.onDebug = (s) => {
        holder.debug = s;
      };
      return driver;
    }
    return driver;
  });

  const player = session.player;
  let steps = 0;
  while (steps < 120 * 60 * 6) {
    const rivals = session.racers
      .filter((r) => r !== player)
      .map((r) => ({ physics: r.physics, aheadInRace: r.laps.totalRaceProgress > player.laps.totalRaceProgress }));
    const input: InputState = holder.bot!.update(STEP, layout, player.physics, rivals, !player.nitro.isEmpty);
    session.step(STEP, input);
    steps++;
    if (session.result()) break;
  }

  const result = session.result();
  if (!result) throw new Error(`race did not finish: ${configs.map((c) => c.characterName).join(',')}`);
  const winner = result.standings[0];
  const me = result.standings.find((s) => s.isPlayer)!;
  return {
    winner: winner.characterName,
    playerWon: winner.isPlayer,
    playerPosition: result.playerPosition,
    playerTime: (me.finishTimeMs ?? 0) / 1000,
    winnerTime: (winner.finishTimeMs ?? 0) / 1000,
  };
}

/** Player skill from hopeless to dominant, around the AI profiles' ~0.99. */
const SKILL_SWEEP: { name: string; profile: AiProfile }[] = [
  { name: 'sloppy', profile: { cornerConfidence: 0.88, pace: 0.88, nitroEagerness: 0.10, overtaking: 0.30, stuckSeconds: 0.7, lineBias: 0.10, seed: 0.2 } },
  { name: 'casual', profile: { cornerConfidence: 0.93, pace: 0.93, nitroEagerness: 0.30, overtaking: 0.55, stuckSeconds: 0.8, lineBias: -0.10, seed: 0.6 } },
  { name: 'decent', profile: { cornerConfidence: 0.97, pace: 0.97, nitroEagerness: 0.50, overtaking: 0.75, stuckSeconds: 0.9, lineBias: 0.25, seed: 0.4 } },
  { name: 'good', profile: { cornerConfidence: 1.00, pace: 1.00, nitroEagerness: 0.70, overtaking: 0.90, stuckSeconds: 1.0, lineBias: -0.30, seed: 0.9 } },
  { name: 'ace', profile: { cornerConfidence: 1.05, pace: 1.06, nitroEagerness: 0.90, overtaking: 1.0, stuckSeconds: 1.2, lineBias: 0.05, seed: 0.15 } },
];

const trackId = process.argv[2] ?? 'hawkins-streets';
const trials = Number(process.argv[3] ?? 2);
const layout = new TrackLayout(getTrackDefinition(trackId));
console.log(`track=${trackId} length=${layout.trackLength.toFixed(0)}px  (${SKILL_SWEEP.length} skills x ${CHARACTERS.length} drivers x ${CARS.length} cars x ${trials})\n`);

const wins = new Map<string, number>();
/** AI-driver wins only, so the field is judged on races where they actually raced. */
const aiWins = new Map<string, number>();
const aiRaces = new Map<string, number>();
const places = new Map<number, number>();
const gaps: number[] = [];
let races = 0;
const gridSpread = new Map<string, Set<string>>();

for (const driver of CHARACTERS) {
  gridSpread.set(driver.name, new Set());
  aiWins.set(driver.name, 0);
  aiRaces.set(driver.name, 0);
}

for (let d = 0; d < CHARACTERS.length; d++) {
  for (let c = 0; c < CARS.length; c++) {
    const grid = buildGrid(CHARACTERS[d], CARS[c]);
    for (const r of grid) gridSpread.get(r.characterName)?.add(r.carId);
    const fieldNames = new Set(grid.filter((r) => !r.isPlayer).map((r) => r.characterName));

    for (const skill of SKILL_SWEEP) {
      for (let t = 0; t < trials; t++) {
        const out = runRace(layout, d, c, skill.profile, 0.05 + t * 0.37);
        races++;
        wins.set(out.winner, (wins.get(out.winner) ?? 0) + 1);
        if (!out.playerWon && fieldNames.has(out.winner)) {
          aiWins.set(out.winner, (aiWins.get(out.winner) ?? 0) + 1);
        }
        for (const name of fieldNames) aiRaces.set(name, (aiRaces.get(name) ?? 0) + 1);
        places.set(out.playerPosition, (places.get(out.playerPosition) ?? 0) + 1);
        gaps.push(out.playerTime - out.winnerTime);
      }
    }
  }
}

console.log(`=== ${races} races ===\n`);
console.log('AI win rate (share of the races that driver was actually in the field for):');
for (const c of CHARACTERS) {
  const w = aiWins.get(c.name) ?? 0;
  const n = aiRaces.get(c.name) ?? 0;
  const rate = n > 0 ? w / n : 0;
  console.log(`  ${c.name.padEnd(7)} ${String(w).padStart(3)}/${String(n).padEnd(4)} ${(rate * 100).toFixed(0).padStart(3)}%  ${'#'.repeat(Math.round(rate * 40))}`);
}

console.log('\nwins including races won as the player:');
for (const c of CHARACTERS) {
  const w = wins.get(c.name) ?? 0;
  console.log(`  ${c.name.padEnd(7)} ${String(w).padStart(3)} (${((w / races) * 100).toFixed(0)}%)  ${'#'.repeat(Math.round((w / races) * 40))}`);
}

console.log('\nplayer finishing position:');
for (const p of [1, 2, 3, 4]) {
  const n = places.get(p) ?? 0;
  console.log(`  ${p}${p === 1 ? 'st' : p === 2 ? 'nd' : p === 3 ? 'rd' : 'th'}  ${String(n).padStart(3)} (${((n / races) * 100).toFixed(0)}%)  ${'#'.repeat(Math.round((n / races) * 40))}`);
}

const sortedGaps = [...gaps].sort((a, b) => a - b);
const median = sortedGaps[Math.floor(sortedGaps.length / 2)] ?? 0;
const p90 = sortedGaps[Math.floor(sortedGaps.length * 0.9)] ?? 0;
console.log(
  `\ngap to winner: median ${median.toFixed(1)}s, best ${sortedGaps[0].toFixed(1)}s, worst ${sortedGaps[sortedGaps.length - 1].toFixed(1)}s`,
);

console.log('\nchassis each driver gets across all player grids:');
for (const c of CHARACTERS) {
  console.log(`  ${c.name.padEnd(7)} ${[...gridSpread.get(c.name)!].sort().join(', ')}`);
}