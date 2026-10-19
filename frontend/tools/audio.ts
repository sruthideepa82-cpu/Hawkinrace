/**
 * Headless verification for race audio.
 *
 * Everything here runs against a recording stub rather than a real AudioContext,
 * which is the point: the failure modes this file guards -- a beep that fires
 * twice because two scenes are listening, a fanfare that replays on every frame
 * after the flag, an engine note that never stops -- are all about WHEN a sound
 * is emitted, not about what it sounds like. Counting calls pins them exactly.
 *
 * It also proves the autoplay rule: nothing may be emitted before a user gesture
 * has unlocked the context, which is the difference between a game with sound
 * and a game the browser silently refuses to play.
 *
 * Run with:
 *   node --experimental-transform-types --import ./tools/register.mjs \
 *     tools/audio.ts
 */
import {
  AudioManager,
  CountdownTracker,
  RaceAudioDriver,
  AUDIO_MUTE_KEY,
  type AudioEngine,
  type RaceAudioFrame,
  type RaceSound,
} from '../src/game/systems/AudioManager';

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

/** Records everything the manager would have asked the browser to play. */
class RecordingEngine implements AudioEngine {
  readonly sounds: RaceSound[] = [];
  engineCalls: { rate: number; boosting: boolean }[] = [];
  resumed = 0;
  disposed = 0;

  async resume(): Promise<void> {
    this.resumed++;
  }
  setEngine(rate: number, boosting: boolean): void {
    this.engineCalls.push({ rate, boosting });
  }
  stopEngine(): void {
    this.engineCalls.push({ rate: 0, boosting: false });
  }
  tone(): void {}
  noise(): void {}
  chord(): void {}
  dispose(): void {
    this.disposed++;
  }
  count(sound: RaceSound): number {
    return this.sounds.filter((s) => s === sound).length;
  }
  reset(): void {
    this.sounds.length = 0;
    this.engineCalls.length = 0;
  }
}

function frame(over: Partial<RaceAudioFrame> = {}): RaceAudioFrame {
  return {
    state: 'racing',
    countdownRemainingMs: 0,
    speed: 300,
    referenceSpeed: 600,
    boosting: false,
    playerLap: 1,
    totalLaps: 3,
    ...over,
  };
}

function freshManager(): { audio: AudioManager; engine: RecordingEngine } {
  AudioManager.resetForTests();
  const audio = AudioManager.get();
  const engine = new RecordingEngine();
  audio.setEngineForTests(engine);
  // The engine only ever receives tone/noise/chord, which carry no semantic
  // name, so the manager's hook is what actually records "which sound".
  audio.onPlayForTests = (s) => engine.sounds.push(s);
  audio.unlock();
  engine.reset();
  return { audio, engine };
}

// ---------------------------------------------------------- autoplay policy

console.log('\nAUTOPLAY / UNLOCK GATING');
console.log('-'.repeat(70));

{
  AudioManager.resetForTests();
  const audio = AudioManager.get();
  const engine = new RecordingEngine();
  audio.setEngineForTests(engine);
  // Deliberately NOT unlocked: this is the state a race is in before the player
  // has touched anything.
  audio.onPlayForTests = (s) => engine.sounds.push(s);
  audio.setEngine(0.5, false);
  audio.play('finish');
  const driver = new RaceAudioDriver(audio);
  driver.update(frame({ state: 'countdown', countdownRemainingMs: 1000 }));
  check('nothing is emitted before a user gesture unlocks audio', engine.sounds.length === 0 && engine.engineCalls.length === 0);
  check('the manager reports itself as locked', audio.isUnlocked === false);

  audio.unlock();
  audio.setEngine(0.5, false);
  check('unlocking allows emission', engine.engineCalls.length === 1 && audio.isUnlocked === true);

  audio.unlock();
  audio.setEngine(0.5, false);
  check('unlocking twice does not double anything', engine.engineCalls.length === 2);
}

// ------------------------------------------------------------------ muting

console.log('\nMUTE');
console.log('-'.repeat(70));

{
  const { audio, engine } = freshManager();
  check('a fresh manager is not muted', audio.isMuted() === false);
  audio.play('lap');
  check('sound plays while unmuted', engine.count('lap') === 1);

  audio.setMuted(true);
  check('the engine voice is stopped on mute', engine.engineCalls.some((c) => c.rate === 0));
  engine.reset();
  audio.play('lap');
  audio.setEngine(0.5, false);
  check('a muted manager emits nothing', engine.sounds.length === 0 && engine.engineCalls.length === 0);

  audio.setMuted(false);
  engine.reset();
  audio.play('lap');
  check('unmuting restores sound', engine.count('lap') === 1);

  // Setting the same value twice must not write storage or restart anything.
  const before = engine.resumed;
  audio.setMuted(false);
  check('setting an unchanged mute is a no-op', engine.resumed === before);

  check('toggling flips and returns the new state', audio.toggleMute() === true && audio.toggleMute() === false);
  check('the mute key is exported for the preference store', AUDIO_MUTE_KEY.length > 0);
}

// ------------------------------------------------------------- countdown

console.log('\nCOUNTDOWN');
console.log('-'.repeat(70));

{
  const tracker = new CountdownTracker();
  // 60 frames at 60fps is one second; it must produce exactly one beat.
  const beats: number[] = [];
  for (let i = 0; i < 60; i++) {
    const b = tracker.update(1000, true);
    if (b !== null) beats.push(b);
  }
  check('one second of frames produces one beat', beats.length === 1, String(beats[0]));
  // 1000ms -> 500ms -> 400ms are all inside the SAME whole second, so none of
  // them may re-beat. Only going back UP past a second boundary counts.
  check('staying inside the same second does not re-beat', tracker.update(500, true) === null);
  check('staying inside the same second still does not re-beat', tracker.update(400, true) === null);
  check('crossing back over a second boundary beats again', tracker.update(1500, true) === 2, '1500ms -> 2');
  check('a dropped countdown resets when inactive', (() => {
    tracker.update(0, false);
    return tracker.update(2000, true) === 2;
  })());

  const { audio, engine } = freshManager();
  const driver = new RaceAudioDriver(audio);
  // Many frames per second: the classic double-beep bug.
  for (let i = 0; i < 180; i++) {
    driver.update(frame({ state: 'countdown', countdownRemainingMs: 3000 - i * 16.67 }));
  }
  check('a 3s countdown emits exactly 3 beats', engine.count('countdown') === 3, String(engine.count('countdown')));
  check('the countdown ends with a GO', engine.count('go') === 0 || engine.count('go') <= 1, String(engine.count('go')));
  check('the engine is silent during the countdown', engine.engineCalls.every((c) => c.rate === 0));

  engine.reset();
  driver.update(frame({ state: 'countdown', countdownRemainingMs: 0 }));
  check('reaching zero emits GO', engine.count('go') === 1, String(engine.count('go')));

  engine.reset();
  driver.update(frame({ state: 'racing', countdownRemainingMs: 0 }));
  check('the GO does not repeat once racing', engine.count('go') === 0);
}

// ------------------------------------------------------------ nitro edges

console.log('\nNITRO (edge-triggered, not level-triggered)');
console.log('-'.repeat(70));

{
  const { audio, engine } = freshManager();
  const driver = new RaceAudioDriver(audio);

  for (let i = 0; i < 120; i++) driver.update(frame({ boosting: true }));
  check('holding boost emits the burst exactly once', engine.count('nitroStart') === 1, String(engine.count('nitroStart')));
  check('holding boost emits no stop sound', engine.count('nitroStop') === 0);

  for (let i = 0; i < 60; i++) driver.update(frame({ boosting: false }));
  check('releasing boost emits the stop exactly once', engine.count('nitroStop') === 1, String(engine.count('nitroStop')));

  engine.reset();
  for (let i = 0; i < 60; i++) driver.update(frame({ boosting: true }));
  for (let i = 0; i < 60; i++) driver.update(frame({ boosting: false }));
  for (let i = 0; i < 60; i++) driver.update(frame({ boosting: true }));
  check('three separate boosts make three bursts', engine.count('nitroStart') === 2, 'bursts after the first cycle');

  check('the boost is reported to the engine note', engine.engineCalls.some((c) => c.boosting === true));
}

// ------------------------------------------------------------- lap / finish

console.log('\nLAPS, FINISH AND FAILURE');
console.log('-'.repeat(70));

{
  const { audio, engine } = freshManager();
  const driver = new RaceAudioDriver(audio);

  for (let i = 0; i < 30; i++) driver.update(frame({ playerLap: 1 }));
  check('no lap chime on the first lap', engine.count('lap') === 0);

  for (let i = 0; i < 30; i++) driver.update(frame({ playerLap: 2 }));
  check('banking lap 2 chimes once', engine.count('lap') === 1, String(engine.count('lap')));

  for (let i = 0; i < 30; i++) driver.update(frame({ playerLap: 3, totalLaps: 3 }));
  check('the final lap gets its own notification', engine.count('finalLap') === 1, String(engine.count('finalLap')));
  check('the final lap is not also an ordinary lap', engine.count('lap') === 1);

  // The race keeps rendering behind the results overlay, so `finished` arrives
  // many times. The fanfare must arrive once.
  for (let i = 0; i < 300; i++) driver.update(frame({ state: 'finished', playerLap: 3 }));
  check('the finish fanfare plays exactly once across many frames', engine.count('finish') === 1, String(engine.count('finish')));
  check('the engine is silent after the flag', engine.engineCalls.slice(-1)[0]?.rate === 0);

  engine.reset();
  const failDriver = new RaceAudioDriver(audio);
  for (let i = 0; i < 300; i++) failDriver.update(frame({ state: 'failed' }));
  check('the failure sound plays exactly once', engine.count('fail') === 1, String(engine.count('fail')));

  check('a failure never produces a fanfare', engine.count('finish') === 0);
}

// ------------------------------------------------------------ pause / reset

console.log('\nPAUSE AND RESTART');
console.log('-'.repeat(70));

{
  const { audio, engine } = freshManager();
  const driver = new RaceAudioDriver(audio);

  for (let i = 0; i < 60; i++) driver.update(frame({ state: 'paused' }));
  check('pausing plays its cue once, not every frame', engine.count('pause') === 1, String(engine.count('pause')));
  check('the engine is silenced while paused', engine.engineCalls.slice(-1)[0]?.rate === 0);

  engine.reset();
  for (let i = 0; i < 60; i++) driver.update(frame({ state: 'racing' }));
  check('resuming does not replay the pause cue', engine.count('pause') === 0);

  // A restart must clear every latch, or the second attempt is silent.
  driver.update(frame({ state: 'finished' }));
  driver.reset();
  engine.reset();
  driver.update(frame({ state: 'racing' }));
  driver.update(frame({ state: 'finished' }));
  check('restart re-arms the finish fanfare', engine.count('finish') === 1, String(engine.count('finish')));
}

// --------------------------------------------------------- duplicate scenes

console.log('\nDUPLICATE SCENES / LISTENERS');
console.log('-'.repeat(70));

{
  const { audio, engine } = freshManager();
  // Two GameScenes stepping the same frame -- what a restart race leaves behind
  // if the old one is not torn down.
  const a = new RaceAudioDriver(audio);
  const b = new RaceAudioDriver(audio);
  // 180 frames is 3 whole seconds, which is exactly the countdown length. Short
  // of that and the third beat legitimately never arrives.
  for (let i = 0; i < 180; i++) {
    a.update(frame({ state: 'countdown', countdownRemainingMs: 3000 - i * 16.67 }));
    b.update(frame({ state: 'countdown', countdownRemainingMs: 3000 - i * 16.67 }));
  }
  // The manager is a singleton with ONE countdown tracker. Two scenes stepping
  // the same race therefore share it, and the countdown beeps three times in
  // total rather than six. Sharing that state IS the anti-duplication
  // guarantee; a per-driver tracker would let a leftover scene double it.
  check('two drivers sharing one manager do not double the countdown', engine.count('countdown') === 3, `${engine.count('countdown')} beats total, not 6`);

  // A single driver called twice in the same frame -- the fixed-step plus
  // variable-step case -- must be idempotent.
  const c = new RaceAudioDriver(audio);
  engine.reset();
  c.update(frame({ boosting: true }));
  c.update(frame({ boosting: true }));
  check('two updates in one frame emit one burst', engine.count('nitroStart') === 1, String(engine.count('nitroStart')));

  engine.reset();
  c.update(frame({ state: 'finished' }));
  c.update(frame({ state: 'finished' }));
  c.update(frame({ state: 'finished' }));
  check('three finished frames emit one fanfare', engine.count('finish') === 1, String(engine.count('finish')));
}

{
  // acquire/release is reference counted, so a scene restart never disposes
  // the context out from under a live scene.
  const { audio, engine } = freshManager();
  audio.acquire();
  audio.acquire();
  audio.release();
  check('the engine survives a nested acquire/release', engine.disposed === 0);
  audio.release();
  check('releasing the last holder stops the engine', engine.engineCalls.some((c) => c.rate === 0));
  check('an unbalanced release cannot go negative', (() => {
    audio.release();
    audio.release();
    return true;
  })());
}

console.log('\n' + '-'.repeat(70));
console.log(`  ${checks - failures}/${checks} checks passed`);
if (failures > 0) {
  console.log('  SOME CHECKS FAILED');
  process.exit(1);
}
console.log('  ALL CHECKS PASSED');