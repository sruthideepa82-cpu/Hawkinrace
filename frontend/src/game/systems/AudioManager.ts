/**
 * Race audio.
 *
 * There are no audio assets in this project, and the brief forbids pulling in
 * copyrighted material, so every sound here is SYNTHESISED: oscillators and
 * shaped noise through the Web Audio API. That also means no loading, no decode
 * latency, and nothing to fail to fetch.
 *
 * Two things this file exists to guarantee, because both are the classic ways
 * game audio goes wrong:
 *
 *  - **Autoplay policy.** Browsers refuse to start an AudioContext until the
 *    user has interacted with the page. The context is therefore never created
 *    in the constructor. It is created inside `unlock()`, which the scene calls
 *    from a real keypress, and every call before that is a safe no-op.
 *
 *  - **No doubled playback.** A Phaser scene can be restarted, and React can
 *    re-render, without either tearing down the object that owns the sound. All
 *    the one-shot sounds here are edge-guarded on their own previous value
 *    (see `CountdownTracker`, and the nitro rising/falling edges in
 *    `RaceAudioDriver`), so a duplicate call in the same frame cannot stack a
 *    second copy of the same beep.
 *
 * The engine is behind an interface so the whole state machine can be tested
 * headlessly with a recording stub and no audio device.
 */

import type { RaceState } from './RaceManager';

export interface AudioEngine {
  /** Called from a user gesture. Resolves once the context is running. */
  resume(): Promise<void>;
  /** Continuous engine note. `rate` is 0..1 of top speed. */
  setEngine(rate: number, boosting: boolean): void;
  stopEngine(): void;
  /** One tone. Used for countdown beats and UI blips. */
  tone(frequency: number, durationMs: number, type?: OscillatorType, gain?: number): void;
  /** A shaped noise burst. Used for impacts and nitro. */
  noise(durationMs: number, gain?: number, fromHz?: number, toHz?: number): void;
  /** Several tones at once. Used for the finish fanfare. */
  chord(frequencies: readonly number[], durationMs: number, gain?: number): void;
  dispose(): void;
}

/** localStorage key for the mute preference. */
export const AUDIO_MUTE_KEY = 'hawkins.audio.muted';

/**
 * The real thing. Owns exactly one AudioContext and one engine voice for the
 * lifetime of the page; every other sound is a short-lived node it creates and
 * drops.
 */
export class WebAudioEngine implements AudioEngine {
  private ctx: AudioContext | null = null;
  private osc: OscillatorNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private engineGain: GainNode | null = null;
  private disposed = false;

  async resume(): Promise<void> {
    if (this.disposed) return;
    // Created lazily, never in the constructor: see the autoplay note above.
    if (!this.ctx) {
      const Ctor: typeof AudioContext | undefined =
        typeof window !== 'undefined' ? (window.AudioContext ?? (window as any).webkitAudioContext) : undefined;
      if (!Ctor) return; // no Web Audio (or no DOM): audio is simply unavailable
      this.ctx = new Ctor();
      this.startVoice();
    }
    if (this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch {
        // A blocked resume is not fatal; the next gesture tries again.
      }
    }
  }

  private startVoice(): void {
    if (!this.ctx || this.osc) return;
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.value = 60;
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    gain.gain.value = 0;
    osc.connect(filter).connect(gain).connect(this.ctx.destination);
    osc.start();
    this.osc = osc;
    this.filter = filter;
    this.engineGain = gain;
  }

  setEngine(rate: number, boosting: boolean): void {
    if (!this.ctx || !this.osc || !this.filter || !this.engineGain) return;
    const r = Math.max(0, Math.min(1, rate));
    const now = this.ctx.currentTime;
    // Glide rather than jump: the value is written every frame from the car's
    // speed, and a hard set produces an audible click whenever it changes fast.
    this.osc.frequency.setTargetAtTime(55 + r * 190, now, 0.06);
    this.filter.frequency.setTargetAtTime(500 + r * 2200, now, 0.08);
    this.engineGain.gain.setTargetAtTime(r > 0.01 ? (boosting ? 0.10 : 0.06) * (0.35 + r) : 0, now, 0.05);
  }

  stopEngine(): void {
    if (!this.ctx || !this.engineGain) return;
    this.engineGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
  }

  tone(frequency: number, durationMs: number, type: OscillatorType = 'square', gain = 0.14): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, now);
    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(gain, now + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000);
    osc.connect(env).connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + durationMs / 1000 + 0.05);
  }

  noise(durationMs: number, gain = 0.2, fromHz = 1800, toHz = 200): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const frames = Math.max(1, Math.floor((this.ctx.sampleRate * durationMs) / 1000));
    const buffer = this.ctx.createBuffer(1, frames, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 1.1;
    filter.frequency.setValueAtTime(fromHz, now);
    filter.frequency.exponentialRampToValueAtTime(Math.max(40, toHz), now + durationMs / 1000);
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(gain, now);
    env.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000);
    src.connect(filter).connect(env).connect(this.ctx.destination);
    src.start(now);
    src.stop(now + durationMs / 1000 + 0.05);
  }

  chord(frequencies: readonly number[], durationMs: number, gain = 0.1): void {
    frequencies.forEach((f, i) => {
      // Slight stagger so the chord reads as a flourish rather than a wall.
      window.setTimeout(() => this.tone(f, durationMs, 'triangle', gain), i * 70);
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    try {
      this.osc?.stop();
    } catch {
      // already stopped
    }
    this.osc?.disconnect();
    this.filter?.disconnect();
    this.engineGain?.disconnect();
    void this.ctx?.close().catch(() => undefined);
    this.ctx = null;
    this.osc = null;
    this.filter = null;
    this.engineGain = null;
  }
}

/** Reads the persisted mute preference. Safe to call before any user gesture. */
export function readMutedPreference(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(AUDIO_MUTE_KEY) === '1';
  } catch {
    // Private mode, or storage disabled: fall back to sound on.
    return false;
  }
}

function writeMutedPreference(muted: boolean): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(AUDIO_MUTE_KEY, muted ? '1' : '0');
  } catch {
    // Non-fatal: the preference simply will not survive a reload.
  }
}

/**
 * Tracks the countdown so a beat is emitted once per whole second, even though
 * `update` runs many times a second and the HUD may be rebuilt underneath it.
 */
export class CountdownTracker {
  private last = -1;

  /**
   * @returns the beat to play this frame, or null. `0` is a valid beat (the
   * final "GO"), so the caller must compare against null, not truthiness.
   */
  update(countdownRemainingMs: number, active: boolean): number | null {
    if (!active) {
      this.last = -1;
      return null;
    }
    const beat = Math.ceil(countdownRemainingMs / 1000);
    if (beat === this.last) return null;
    this.last = beat;
    return beat;
  }

  reset(): void {
    this.last = -1;
  }
}

export type RaceSound =
  | 'countdown'
  | 'go'
  | 'lap'
  | 'finalLap'
  | 'finish'
  | 'fail'
  | 'nitroStart'
  | 'nitroStop'
  | 'collision'
  | 'pause';

/**
 * The audio facade the game talks to.
 *
 * A singleton, because there must only ever be one AudioContext and one engine
 * voice no matter how many scenes are created. `acquire`/`release` are reference
 * counted so the context survives a scene restart: a retry rebuilds the scene,
 * and tearing the sound down and back up there would leave the engine silent
 * until the next gesture.
 */
export class AudioManager {
  private static instance: AudioManager | null = null;
  private engine: AudioEngine | null = null;
  /** Set only by `setEngineForTests`; see there. */
  private pinned: AudioEngine | null = null;
  private muted = readMutedPreference();
  private unlocked = false;
  private holders = 0;
  /** Test-only observer for semantic one-shots. See `play`. */
  onPlayForTests: ((sound: RaceSound) => void) | null = null;
  readonly countdown = new CountdownTracker();

  /** The shared instance. Never null. */
  static get(): AudioManager {
    if (!AudioManager.instance) AudioManager.instance = new AudioManager();
    return AudioManager.instance;
  }

  /**
   * Drops the singleton. Test-only: it exists so a test can assert on a manager
   * that has never seen another one, not for gameplay code to call.
   */
  static resetForTests(): void {
    AudioManager.instance?.engine?.dispose();
    AudioManager.instance = null;
  }

  private constructor() {}

  /** Called when a race scene starts. Reference counted, so retries are safe. */
  acquire(): void {
    this.holders++;
  }

  /** Called when a race scene shuts down. Never disposes the shared context. */
  release(): void {
    this.holders = Math.max(0, this.holders - 1);
    if (this.holders === 0) this.stopAll();
  }

  /**
   * How many scenes currently hold the manager. Test-only: the whole point of
   * the reference count is that a leak here would be invisible from the audio
   * itself, so it has to be assertable.
   */
  get holderCount(): number {
    return this.holders;
  }

  /**
   * Creates/resumes the context. MUST be called from inside a real user
   * gesture (keydown, pointerdown) or the browser will refuse and the race runs
   * silently. Safe to call every gesture.
   */
  unlock(): void {
    if (this.muted) return;
    this.unlocked = true;
    this.ensureEngine()?.resume().catch(() => undefined);
  }

  private ensureEngine(): AudioEngine | null {
    if (typeof window === 'undefined') return null;
    if (!this.engine) this.engine = this.pinned ?? new WebAudioEngine();
    return this.engine;
  }

  /**
   * Test-only: supply a recording backend instead of the real one.
   *
   * The real engine is gated on `window` existing, so without this a headless
   * test could assert only that nothing happens -- which would pass just as
   * happily against audio that was wired up completely wrongly. Pinning a stub
   * lets the harness assert on the calls that WOULD have been made.
   */
  setEngineForTests(engine: AudioEngine | null): void {
    this.pinned = engine;
    if (this.engine && this.engine !== engine) this.engine.dispose();
    this.engine = engine;
  }

  isMuted(): boolean {
    return this.muted;
  }

  /**
   * Mutes or unmutes. The preference is persisted so it survives a reload, and
   * muting stops the engine voice immediately rather than at the next note.
   */
  setMuted(muted: boolean): void {
    if (this.muted === muted) return;
    this.muted = muted;
    writeMutedPreference(muted);
    if (muted) {
      this.engine?.stopEngine();
      return;
    }
    // Unmuting is a user gesture, so it is a safe moment to bring the context up.
    this.unlock();
  }

  toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  /** True once a gesture has allowed audio. False means every call is a no-op. */
  get isUnlocked(): boolean {
    return this.unlocked && !this.muted;
  }

  private get live(): AudioEngine | null {
    return this.isUnlocked ? this.engine : null;
  }

  setEngine(rate: number, boosting: boolean): void {
    this.live?.setEngine(rate, boosting);
  }

  stopAll(): void {
    this.engine?.stopEngine();
    this.countdown.reset();
  }

  /**
   * Plays a one-shot. Every entry point checks `isUnlocked`, so a muted or
   * still-silent game costs one property read and nothing else.
   */
  play(sound: RaceSound, severity = 1): void {
    const e = this.live;
    if (!e) return;
    // Test-only hook, after the gate so it only ever reports what really played.
    // The engine itself only ever sees tone/noise/chord and cannot know which
    // semantic sound it was asked for, so this is where a harness can meaningfully
    // count "the finish fanfare happened exactly once".
    this.onPlayForTests?.(sound);
    const vol = Math.max(0, Math.min(1, severity));
    switch (sound) {
      case 'countdown':
        e.tone(440, 160, 'square', 0.16);
        break;
      case 'go':
        e.tone(880, 420, 'square', 0.2);
        break;
      case 'lap':
        e.tone(660, 180, 'triangle', 0.14);
        break;
      case 'finalLap':
        e.chord([523, 659, 784], 420, 0.11);
        break;
      case 'finish':
        e.chord([523, 659, 784, 1047], 700, 0.12);
        break;
      case 'fail':
        e.tone(160, 520, 'sawtooth', 0.14);
        break;
      case 'nitroStart':
        e.noise(420, 0.16, 320, 3600);
        break;
      case 'nitroStop':
        e.noise(220, 0.08, 1800, 200);
        break;
      case 'collision':
        e.noise(180 + vol * 220, 0.18 + vol * 0.18, 900, 90);
        e.tone(70, 200, 'sawtooth', 0.12 + vol * 0.1);
        break;
      case 'pause':
        e.tone(320, 120, 'sine', 0.12);
        break;
    }
  }
}

/** Everything the driver reads each frame. All of it is real game state. */
export interface RaceAudioFrame {
  state: RaceState;
  countdownRemainingMs: number;
  /** Current speed in px/s, for the engine note. */
  speed: number;
  /** This car's top speed, so the engine scales to the car being driven. */
  referenceSpeed: number;
  /** True only on the frame the tank actually applied a boost. */
  boosting: boolean;
  playerLap: number;
  totalLaps: number;
}

/**
 * Turns per-frame race state into sound, exactly once per event.
 *
 * This is the layer that stops doubled audio. Every trigger here is an EDGE --
 * a value changing, not a value being true -- so a call that arrives twice in
 * one frame (two scenes, a re-render, a fixed step plus a variable step) fires
 * nothing the second time. The finish and failure sounds are latched outright,
 * because the race must be able to end only once.
 */
export class RaceAudioDriver {
  private audio: AudioManager;
  private lastLap = 1;
  private wasBoosting = false;
  private wasPaused = false;
  private firedFinish = false;
  private firedFail = false;

  constructor(audio: AudioManager = AudioManager.get()) {
    this.audio = audio;
  }

  /** Clears every latch, so a retried race speaks up again from a clean slate. */
  reset(): void {
    this.lastLap = 1;
    this.wasBoosting = false;
    this.wasPaused = false;
    this.firedFinish = false;
    this.firedFail = false;
    this.audio.countdown.reset();
    this.audio.stopAll();
  }

  update(frame: RaceAudioFrame): void {
    const over = frame.state === 'finished' || frame.state === 'failed';
    const paused = frame.state === 'paused';

    // Terminal states latch. There is always more than one `finished` frame --
    // the scene keeps rendering behind the results overlay -- and the fanfare
    // must not come round again for any of them.
    if (frame.state === 'finished' && !this.firedFinish) {
      this.firedFinish = true;
      this.audio.stopAll();
      this.audio.play('finish');
      return;
    }
    if (frame.state === 'failed' && !this.firedFail) {
      this.firedFail = true;
      this.audio.stopAll();
      this.audio.play('fail');
      return;
    }
    if (over) {
      // Engine silent after the flag, so the race really is over.
      this.audio.setEngine(0, false);
      return;
    }

    // A pause has to silence the engine for as long as it lasts, not only on the
    // frame it started: the race is frozen, so the car genuinely is not moving,
    // and an engine note that keeps rising through a pause is plainly wrong. The
    // rising edge is kept for the audible cue only.
    if (paused) {
      if (!this.wasPaused) this.audio.play('pause');
      this.wasPaused = true;
      this.audio.setEngine(0, false);
      return;
    }
    this.wasPaused = false;

    // Countdown beats. `CountdownTracker` collapses the many frames per second
    // down to one beat per whole second.
    if (frame.state === 'countdown') {
      const beat = this.audio.countdown.update(frame.countdownRemainingMs, true);
      if (beat !== null) this.audio.play(beat <= 0 ? 'go' : 'countdown');
      this.audio.setEngine(0, false);
      return;
    }
    this.audio.countdown.update(0, false);

    // Lap chime on the rising edge of the lap counter only.
    if (frame.playerLap > this.lastLap) {
      this.audio.play(frame.playerLap >= frame.totalLaps ? 'finalLap' : 'lap');
    }
    this.lastLap = frame.playerLap;

    // Nitro is a rising/falling edge pair, so holding the key does not machine
    // gun the burst sound, and releasing it always gets one matching stop.
    if (frame.boosting && !this.wasBoosting) this.audio.play('nitroStart');
    if (!frame.boosting && this.wasBoosting) this.audio.play('nitroStop');
    this.wasBoosting = frame.boosting;

    const rate = frame.referenceSpeed > 0 ? Math.min(1, Math.abs(frame.speed) / frame.referenceSpeed) : 0;
    this.audio.setEngine(rate, frame.boosting);
  }

  /** A one-shot the scene raises outside the per-frame path. */
  collision(severity: number): void {
    this.audio.play('collision', severity);
  }
}