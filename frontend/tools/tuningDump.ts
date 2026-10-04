/** Prints the resolved physics tuning for every car on the grid. */
import { buildGrid } from '../src/game/config/racers';
import { createRacerTuning } from '../src/game/config/carTuning';
import { getCharacterStats } from '../src/game/config/characterTuning';
import { CARS } from '../src/data/cars';
import { CHARACTERS } from '../src/data/characters';

for (const driver of CHARACTERS) {
  for (const car of CARS) {
    const config = buildGrid(driver, car).find((r) => r.isPlayer)!;
    const t = createRacerTuning(config.carId, getCharacterStats(driver.id));
    console.log(
      `${driver.name.padEnd(7)} ${car.name.padEnd(13)} maxSpeed=${t.maxSpeed.toFixed(0).padStart(4)} ` +
        `accel=${t.acceleration.toFixed(0).padStart(4)} grip=${t.lateralGrip.toFixed(2)} ` +
        `brake=${t.brakeForce.toFixed(0).padStart(4)} nitro=${t.nitroCapacity.toFixed(1)} ` +
        `stats=${JSON.stringify(config.stats)}`,
    );
  }
}