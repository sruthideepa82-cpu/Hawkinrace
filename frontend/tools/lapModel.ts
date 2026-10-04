/**
 * Lap-time model.
 *
 * Integrates a speed profile around the track using the same corner-speed rule
 * the AI drives to, so the expected spread between chassis/driver combinations
 * can be seen without running 30 full races. Also reports how much of the lap
 * each car spends corner-limited versus flat out, which is what shows whether a
 * car is genuinely slow or just modelled badly.
 */
import { TrackLayout } from '../src/game/entities/TrackLayout';
import { getTrackDefinition } from '../src/game/config/tracks';
import { createRacerTuning } from '../src/game/config/carTuning';
import { getCharacterStats } from '../src/game/config/characterTuning';
import { getAiProfile } from '../src/game/config/racers';
import { buildGrid } from '../src/game/config/racers';
import { CHARACTERS } from '../src/data/characters';
import { CARS } from '../src/data/cars';

const MAX_SLIDE_ANGLE_TAN = 0.2;
const GRIP_A = 55;

const trackId = process.argv[2] ?? 'hawkins-streets';
const layout = new TrackLayout(getTrackDefinition(trackId));
const ds = layout.trackLength / 400;
const steps = 400;

const cornerLimitAt = (tuning: ReturnType<typeof createRacerTuning>, confidence: number, radius: number) => {
  if (!Number.isFinite(radius)) return Number.POSITIVE_INFINITY;
  const gripLimit = Math.sqrt(Math.max(60, tuning.lateralGrip * GRIP_A) * radius);
  const slideLimit = radius * tuning.lateralGrip * MAX_SLIDE_ANGLE_TAN;
  return Math.min(gripLimit, slideLimit) * confidence;
};

/** Backward pass so the car is already slow enough on entry, then forward pass. */
function lapTime(tuning: ReturnType<typeof createRacerTuning>, confidence: number, pace: number) {
  const vLimit = new Float64Array(steps);
  for (let i = 0; i < steps; i++) {
    // Look ahead a braking distance's worth for the tightest radius.
    let worst = Infinity;
    const horizon = Math.max(1, Math.round(450 / ds));
    for (let j = 0; j <= horizon; j++) {
      const r = layout.cornerRadiusAhead(((i + j) % steps) / steps, 450);
      if (r < worst) worst = r;
    }
    vLimit[i] = Math.min(tuning.maxSpeed * pace, cornerLimitAt(tuning, confidence, worst));
  }
  // Backward pass: v[i] <= sqrt(v[i+1]^2 + 2*brake*ds)
  const v = Float64Array.from(vLimit);
  for (let pass = 0; pass < 3; pass++) {
    for (let i = steps - 1; i >= 0; i--) {
      const next = v[(i + 1) % steps];
      v[i] = Math.min(v[i], Math.sqrt(next * next + 2 * tuning.brakeForce * ds));
    }
    for (let i = 0; i < steps; i++) {
      const prev = v[(i + steps - 1) % steps];
      const accelLimit = Math.sqrt(prev * prev + 2 * tuning.acceleration * ds);
      v[i] = Math.min(v[i], accelLimit);
    }
  }

  let time = 0;
  let cornered = 0;
  let flat = 0;
  for (let i = 0; i < steps; i++) {
    const speed = Math.max(40, v[i]);
    time += ds / speed;
    if (v[i] < tuning.maxSpeed * pace * 0.97) cornered += ds;
    else flat += ds;
  }
  return { time, corneredPct: (cornered / layout.trackLength) * 100, avgSpeed: layout.trackLength / time };
}

console.log(`track=${trackId} length=${layout.trackLength.toFixed(0)}px\n`);
console.log('chassis          driver   maxV  grip  cornerV(499px)  lap(s)  avgV  corner%  profilePace');
const rows: { name: string; time: number }[] = [];
for (const driver of CHARACTERS) {
  for (const car of CARS) {
    const t = createRacerTuning(car.id, getCharacterStats(driver.id));
    const p = getAiProfile(driver.id);
    const corner = Math.min(
      Math.sqrt(Math.max(60, t.lateralGrip * GRIP_A) * 499),
      499 * t.lateralGrip * MAX_SLIDE_ANGLE_TAN,
    ) * p.cornerConfidence;
    const r = lapTime(t, p.cornerConfidence, p.pace);
    rows.push({ name: `${driver.name}/${car.id}`, time: r.time });
    console.log(
      `${car.id.padEnd(16)} ${driver.name.padEnd(7)} ${t.maxSpeed.toFixed(0).padStart(4)} ` +
        `${t.lateralGrip.toFixed(2)} ${corner.toFixed(0).padStart(12)}  ` +
        `${r.time.toFixed(2).padStart(6)} ${r.avgSpeed.toFixed(0).padStart(5)} ${r.corneredPct.toFixed(0).padStart(7)}% ${p.pace.toFixed(3).padStart(11)}`,
    );
  }
}

const times = rows.map((r) => r.time);
const best = Math.min(...times);
const worst = Math.max(...times);
console.log(`\nlap-time spread: ${best.toFixed(2)}s .. ${worst.toFixed(2)}s  (${(((worst - best) / best) * 100).toFixed(1)}%)`);
console.log(`over 3 laps that is ${(worst - best).toFixed(2)}s .. ${((worst - best) * 3).toFixed(2)}s`);

console.log('\n--- grid the player actually faces (player = STEVE + falcon-gt) ---');
for (const r of buildGrid(CHARACTERS[0], CARS[0])) {
  const t = createRacerTuning(r.carId, getCharacterStats(r.characterId));
  const p = getAiProfile(r.characterId);
  const sim = lapTime(t, r.isPlayer ? 0.98 : p.cornerConfidence, r.isPlayer ? 0.98 : p.pace);
  console.log(
    `  ${r.characterName.padEnd(7)} ${r.carId.padEnd(14)} ${r.isPlayer ? 'PLAYER' : 'ai    '} ` +
      `maxV=${t.maxSpeed.toFixed(0)} grip=${t.lateralGrip.toFixed(2)} predictedLap=${sim.time.toFixed(2)}s`,
  );
}