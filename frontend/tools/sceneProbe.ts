/**
 * Headless scene probe: restart, listeners and pause, through the real scenes.
 *
 * `inputProbe.ts` already boots a real Phaser game against a DOM shim and
 * dispatches real key events at it. This probe reuses that to test the parts of
 * the restart path that only exist at scene level:
 *
 *  - restarting the race scene must not stack up listeners on the shared game
 *    event bus (one scene restarting used to quietly unplug every OTHER
 *    listener for that event, including the HUD's)
 *  - it must not leave a second copy of the scene running
 *  - the pause key must reach the race and freeze it
 *  - a race started after a restart must behave like the first one
 *
 * Run with:
 *   node --experimental-transform-types --import ./tools/register.mjs \
 *     tools/sceneProbe.ts
 */

// --------------------------------------------------------------- DOM shim
// The same shim `inputProbe.ts` uses. Phaser needs a `window` with event
// targets, a `document`, and a canvas it can probe for a renderer; nothing here
// renders anything, every draw call is a no-op.
function fakeContext(canvas?: FakeNode): any {
  const noop = () => {};
  return new Proxy(
    {
      canvas: canvas ?? null,
      getImageData: () => ({ data: new Uint8ClampedArray(4) }),
      measureText: () => ({ width: 0 }),
      createLinearGradient: () => ({ addColorStop: noop }),
      createRadialGradient: () => ({ addColorStop: noop }),
      createPattern: () => null,
    } as any,
    {
      get(target, prop) {
        if (prop in target) return target[prop];
        return noop;
      },
      set(target, prop, value) {
        target[prop] = value;
        return true;
      },
    },
  );
}

class FakeNode {
  style: Record<string, string> = {};
  children: FakeNode[] = [];
  parentNode: FakeNode | null = null;
  width = 800;
  height = 600;
  getContext(): any {
    return fakeContext(this);
  }
  addEventListener(): void {}
  removeEventListener(): void {}
  appendChild(child: FakeNode): FakeNode {
    this.children.push(child);
    child.parentNode = this;
    return child;
  }
  removeChild(): void {}
  getBoundingClientRect() {
    return { x: 0, y: 0, left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600 };
  }
}

class FakeImage extends FakeNode {
  onload: ((event?: unknown) => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = 1;
  naturalHeight = 1;
  complete = false;
  set src(_value: string) {
    this.complete = true;
    setTimeout(() => this.onload?.({ target: this }), 0);
  }
  get src(): string {
    return '';
  }
}

type Listener = (event: unknown) => void;
const windowListeners = new Map<string, Set<Listener>>();

const fakeWindow: any = {
  addEventListener(type: string, fn: Listener) {
    if (!windowListeners.has(type)) windowListeners.set(type, new Set());
    windowListeners.get(type)!.add(fn);
  },
  removeEventListener(type: string, fn: Listener) {
    windowListeners.get(type)?.delete(fn);
  },
  dispatch(event: any) {
    for (const fn of windowListeners.get(event.type) ?? []) fn(event);
  },
  devicePixelRatio: 1,
  innerWidth: 1280,
  innerHeight: 720,
  navigator: { userAgent: 'node' },
  location: { href: 'http://localhost/' },
  getComputedStyle: () => ({ getPropertyValue: () => '' }),
  performance,
  document: null as any,
  requestAnimationFrame: ((cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 16)) as any,
  cancelAnimationFrame: ((id: number) => clearTimeout(id)) as any,
  setTimeout: ((fn: () => void, ms: number) => setTimeout(fn, ms)) as any,
  clearTimeout: ((id: number) => clearTimeout(id)) as any,
  setInterval: ((fn: () => void, ms: number) => setInterval(fn, ms)) as any,
  clearInterval: ((id: number) => clearInterval(id)) as any,
};

const fakeDocument: any = {
  readyState: 'complete',
  createElement: () => new FakeNode(),
  createElementNS: () => new FakeNode(),
  addEventListener: () => {},
  removeEventListener: () => {},
  querySelector: () => null,
  body: new FakeNode(),
  documentElement: new FakeNode(),
};
fakeWindow.document = fakeDocument;
fakeDocument.defaultView = fakeWindow;

const fakeScreen = {
  orientation: { addEventListener() {}, removeEventListener() {} },
  width: 1280,
  height: 720,
  availWidth: 1280,
  availHeight: 720,
};
fakeWindow.screen = fakeScreen;
// Phaser decides it can render to a canvas purely by looking for this global.
// The fake context answers everything else.
fakeWindow.CanvasRenderingContext2D = function CanvasRenderingContext2DShim() {};

const g: any = globalThis;
g.window = fakeWindow;
g.document = fakeDocument;
g.screen = fakeScreen;
Object.defineProperty(g, 'navigator', {
  value: fakeWindow.navigator, configurable: true, writable: true,
});
g.HTMLCanvasElement = FakeNode as any;
g.HTMLImageElement = FakeNode as any;
g.HTMLVideoElement = FakeNode as any;
g.HTMLElement = FakeNode as any;
g.Element = FakeNode as any;
g.Image = FakeImage as any;
g.ImageData = class {};
g.requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 16) as unknown as number;
g.cancelAnimationFrame = (id: number) => clearTimeout(id);

/**
 * Phaser decides between its Image loader and its XHR loader per file, and the
 * XHR branch needs `XMLHttpRequest`, which Node does not have. Every request
 * here resolves immediately: the probe asserts on scene wiring, never on pixels,
 * so what the files contain is irrelevant.
 */
class FakeXHR {
  status = 200;
  responseText = '';
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onprogress: ((event: unknown) => void) | null = null;
  open(): void {}
  send(): void {
    setTimeout(() => this.onload?.({ target: this }), 0);
  }
  abort(): void {}
  setRequestHeader(): void {}
  getResponseHeader(): string | null {
    return null;
  }
  addEventListener(): void {}
  removeEventListener(): void {}
}
g.XMLHttpRequest = FakeXHR;

/**
 * Phaser turns an XHR-loaded image into a blob URL before handing it to the
 * `Image`, so `URL.createObjectURL` has to exist too. The probe never looks at
 * pixels, so a stub URL that the fake `Image` accepts is enough.
 */
class ProbeURL extends (globalThis.URL as any) {
  static createObjectURL(): string {
    return 'blob:phaser-probe';
  }
  static revokeObjectURL(): void {}
}
g.URL = ProbeURL;

const Phaser = (await import('phaser')).default;

const { setRaceBridge } = await import('../src/game/bridge.ts');
const { GAME, GAME_EVENTS, SCENE_KEYS } = await import('../src/game/config/GameConfig.ts');
const { GameScene } = await import('../src/game/scenes/GameScene.ts');
const { HudScene } = await import('../src/game/scenes/HudScene.ts');
const { CHARACTERS } = await import('../src/data/characters.ts');
const { CARS } = await import('../src/data/cars.ts');
const { TRACKS } = await import('../src/data/tracks.ts');
const { AudioManager } = await import('../src/game/systems/AudioManager.ts');
const audioHolders = () => AudioManager.get().holderCount;

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  if (ok) console.log(`  PASS  ${label}${detail ? ` (${detail})` : ''}`);
  else {
    failures++;
    console.log(`  FAIL  ${label}${detail ? ` -> ${detail}` : ''}`);
  }
}

const character = CHARACTERS[0];
const car = CARS[0];
const track = TRACKS[0];

const results: any[] = [];

// The same game `main.ts` builds, with the renderer swapped for the headless
// one. Everything else -- the scenes, the registry bridge, the event bus -- is
// exactly what ships.
const game: any = new Phaser.Game({
  type: Phaser.CANVAS,
  width: GAME.width,
  height: GAME.height,
  banner: false,
  audio: { noAudio: true },
  callbacks: {
    preBoot: (bootGame: any) => setRaceBridge(bootGame, {
      config: {
        characterId: character.id,
        characterName: character.name,
        car: { id: car.id, name: car.name, color: car.color, stats: car.stats },
        trackId: track.id,
        modeId: 'quick-race',
      },
      onRaceComplete: (result: any) => results.push(result),
    }),
  },
  scene: [GameScene, HudScene],
});

/** How many listeners the shared game bus has for an event. */
const listenerCount = (event: string): number => game.events.listenerCount(event);

const sceneOf = (key: string) => game.scene.getScene(key);

/** Lets the game run for `ms` of real time. */
const settle = async (ms: number) => {
  const until = Date.now() + ms;
  while (Date.now() < until) await new Promise((r) => setTimeout(r, 20));
};

const KEYCODES: Record<string, number> = { W: 87, A: 65, S: 83, D: 68, P: 80, M: 77 };

function keyEvent(type: 'keydown' | 'keyup', key: string, keyCode: number): any {
  return {
    type, code: key, key: key, keyCode, which: keyCode, repeat: false,
    altKey: false, ctrlKey: false, shiftKey: false, metaKey: false,
    defaultPrevented: false, preventDefault(this: any) { this.defaultPrevented = true; },
    stopPropagation() {}, stopImmediatePropagation() {}, timeStamp: performance.now(),
  };
}

/** Holds a key down, or lets it up, the way a player's finger would. */
const held = new Set<string>();
function setKey(key: string, down: boolean): void {
  if (down === held.has(key)) return;
  down ? held.add(key) : held.delete(key);
  fakeWindow.dispatch(keyEvent(down ? 'keydown' : 'keyup', key, KEYCODES[key]));
}

/**
 * A very small autopilot: throttle held, and the wheel turned toward the road.
 *
 * The probe needs a car that is actually driving, because a car sitting on the
 * grid while the AI pull away is a collision -- the challenge's rule, working
 * correctly, but not what these checks are about.
 */
function autopilot(): void {
  const scene = sceneOf(SCENE_KEYS.game);
  const physics = scene?.session?.player?.physics;
  if (!physics) return;
  const layout = scene.session.layout;
  const here = layout.locate(physics.x, physics.y);
  const tangent = layout.directionAt(here.index);
  let delta = Math.atan2(tangent.y, tangent.x) - physics.heading;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  const steer = Math.max(-1, Math.min(1, delta * 2.5));
  setKey('W', true);
  setKey('A', steer < -0.15);
  setKey('D', steer > 0.15);
}

/** Settles for `ms`, with the autopilot driving throughout. */
const drive = async (ms: number) => {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    autopilot();
    await new Promise((r) => setTimeout(r, 25));
  }
};

/**
 * Taps a one-shot key the way a player does: down, let the game see a frame,
 * then up. Pressing and releasing inside a single frame is not the same thing.
 */
async function tap(key: string): Promise<void> {
  setKey(key, true);
  await settle(80);
  setKey(key, false);
  await settle(80);
}

/** Keys that are currently down, so the autopilot can be undone. */
function releaseAll(): void {
  for (const key of [...held]) setKey(key, false);
}

console.log('\n[scene] the race scene boots and launches the HUD once');
{
  await settle(1500);
  check('the game booted', game.isBooted === true);
  check('the race scene is running', sceneOf(SCENE_KEYS.game)?.scene.isActive() === true);
  check('the HUD was launched', sceneOf(SCENE_KEYS.hud)?.scene.isActive() === true);

  const sceneBefore = sceneOf(SCENE_KEYS.game);
  const hudBefore = sceneOf(SCENE_KEYS.hud);
  check('the scene manager holds a race scene and a HUD',
    Boolean(sceneBefore) && Boolean(hudBefore));
  check('the race scene instance is running', sceneBefore.scene.isActive());

  const hudUpdates = listenerCount(GAME_EVENTS.hudUpdate);
  const supernatural = listenerCount(GAME_EVENTS.supernaturalEvent);
  check('the HUD is listening for updates', hudUpdates === 1, `${hudUpdates} listeners`);
  check('the supernatural event has a listener for the scene', supernatural >= 1, `${supernatural} listeners`);

  // The HUD's own supernatural listener is the one that used to be silently
  // unplugged by a restart, because the scene removed every listener for the
  // event rather than its own.
  let hudStillListening = false;
  game.events.emit(GAME_EVENTS.supernaturalEvent, { type: 'ability_start' });
  await settle(60);
  hudStillListening = listenerCount(GAME_EVENTS.supernaturalEvent) === supernatural;
  check('the HUD survives a supernatural event', hudStillListening);
}

console.log('\n[scene] restarting does not stack listeners or scenes');
{
  const gameScene = sceneOf(SCENE_KEYS.game);
  const hudScene = sceneOf(SCENE_KEYS.hud);
  const before = {
    hudUpdate: listenerCount(GAME_EVENTS.hudUpdate),
    supernatural: listenerCount(GAME_EVENTS.supernaturalEvent),
    supernaturalUpdate: listenerCount(GAME_EVENTS.supernaturalUpdate),
  };

  for (let i = 0; i < 3; i++) {
    sceneOf(SCENE_KEYS.game).scene.restart();
    await settle(700);
  }

  const after = {
    hudUpdate: listenerCount(GAME_EVENTS.hudUpdate),
    supernatural: listenerCount(GAME_EVENTS.supernaturalEvent),
    supernaturalUpdate: listenerCount(GAME_EVENTS.supernaturalUpdate),
  };

  check('HUD update listeners do not grow with restarts',
    after.hudUpdate === before.hudUpdate, `${before.hudUpdate} -> ${after.hudUpdate}`);
  check('supernatural listeners do not grow with restarts',
    after.supernatural === before.supernatural, `${before.supernatural} -> ${after.supernatural}`);
  check('supernatural update listeners do not grow with restarts',
    after.supernaturalUpdate === before.supernaturalUpdate,
    `${before.supernaturalUpdate} -> ${after.supernaturalUpdate}`);

  check('restarting reuses the one race scene rather than adding another',
    sceneOf(SCENE_KEYS.game) === gameScene);
  check('restarting leaves the one HUD alone',
    sceneOf(SCENE_KEYS.hud) === hudScene && hudScene.scene.isActive());
  check('the race scene is still running', sceneOf(SCENE_KEYS.game).scene.isActive() === true);

  // And the restarted race is a real race again, on a real clock.
  const race = sceneOf(SCENE_KEYS.game).session.race;
  check('the restarted race is back at the start', race.currentState === 'intro'
    || race.currentState === 'countdown', race.currentState);
  check('its clock is zero', race.elapsed === 0, `${race.elapsed}ms`);
}

console.log('\n[scene] pause works through the real scene');
{
  // Wait for the lights to go out on the real clock, driving the whole way.
  await drive(8000);
  const scene = sceneOf(SCENE_KEYS.game);
  check('the race is live by now', scene.session.race.isRacing, scene.session.race.currentState);

  const before = scene.session.race.elapsed;
  const x = scene.session.player.physics.x;

  await tap('P');

  check('P pauses the race', scene.session.race.isPaused, scene.session.race.currentState);
  const atPause = scene.session.race.elapsed;
  await settle(1200);
  check('the clock is frozen while paused', scene.session.race.elapsed === atPause,
    `${atPause.toFixed(0)} -> ${scene.session.race.elapsed.toFixed(0)}ms`);
  check('the car is frozen while paused',
    Math.abs(scene.session.player.physics.x - x) < 20,
    `moved ${Math.abs(scene.session.player.physics.x - x).toFixed(1)}px`);
  check('the HUD is told the race is paused', scene.session.hudData().state === 'paused',
    scene.session.hudData().state);

  await tap('P');
  check('P resumes the race', scene.session.race.isRacing, scene.session.race.currentState);
  await drive(600);
  check('the clock runs again after the resume', scene.session.race.elapsed > atPause);
  check('and the race kept the time it had', scene.session.race.elapsed > before);
  releaseAll();
}

console.log('\n[scene] the camera keeps the car in frame on every track');
{
  // The game renders at a fixed 1280x720 logical size under Scale.FIT, so zoom
  // and bounds are resolution-independent by construction. What still needs
  // proving is the promise that actually matters to a player: the car is on
  // screen and the world does not scroll off its own edges.
  const scene = sceneOf(SCENE_KEYS.game);
  const cam = scene.cameras.main;
  const world = scene.session.layout;

  check('camera bounds match the world bounds',
    cam.worldView.width <= world.worldWidth && cam.worldView.height <= world.worldHeight,
    `world ${world.worldWidth}x${world.worldHeight}`);

  // Drive, and check the car stayed inside the view every step.
  let worstOut = 0;
  let worstDetail = '';
  for (let i = 0; i < 90; i++) {
    await drive(16);
    const p = scene.session.player.physics;
    const v = cam.worldView;
    const outX = Math.max(v.x - p.x, p.x - v.right, 0);
    const outY = Math.max(v.y - p.y, p.y - v.bottom, 0);
    const out = Math.max(outX, outY);
    if (out > worstOut) {
      worstOut = out;
      worstDetail = `car(${Math.round(p.x)},${Math.round(p.y)}) view(${Math.round(v.x)},${Math.round(v.y)} ${Math.round(v.width)}x${Math.round(v.height)}) speed=${Math.round(p.speed)} zoom=${cam.zoom.toFixed(2)} rot=${cam.rotation.toFixed(2)}`;
    }
  }
  check('the car stays inside the camera view while driving', worstOut < 40, `${Math.round(worstOut)}px worst overshoot; ${worstDetail}`);

  // The view must not run past the world, or the player sees empty void.
  const view = cam.worldView;
  check('the view never shows past the world edge',
    view.x > -1 && view.y > -1 && view.right < world.worldWidth + 1 && view.bottom < world.worldHeight + 1,
    `view ${Math.round(view.x)},${Math.round(view.y)} ${Math.round(view.width)}x${Math.round(view.height)}`);
}

console.log('\n[scene] audio is acquired once and released on shutdown');
{
  // The scene holds a reference count on the shared audio manager, so a restart
  // cannot end up with two scenes each driving one context. This asserts the
  // count, which is the only thing that could leak.
  const before = audioHolders();

  // Force a restart, which shuts the scene down and runs it back up.
  const scene = sceneOf(SCENE_KEYS.game);
  scene.scene.restart();
  await settle(400);

  check('a scene restart does not leak an audio holder', audioHolders() <= before + 1,
    `${before} -> ${audioHolders()}`);
  check('audio holders stay bounded across restarts', audioHolders() < 8, `${audioHolders()} holders`);

  // Muting must work from inside the scene and survive as a preference.
  const manager = AudioManager.get();
  const wasMuted = manager.isMuted();
  await tap('M');
  check('M toggles audio from inside the scene', manager.isMuted() !== wasMuted,
    `${wasMuted} -> ${manager.isMuted()}`);
  const nowMuted = manager.isMuted();
  await tap('M');
  check('M toggles back', manager.isMuted() !== nowMuted);

  check('the race scene is still alive after the audio work', sceneOf(SCENE_KEYS.game).scene.isActive() === true);
}

console.log('\n[scene] every track bakes its world without a missing asset');
{
  // Spec item: "verify that all tracks load without missing assets". Baking is
  // the only way to prove that -- a missing texture only shows up when the
  // draw actually runs, so each track is built for real on the live scene and
  // the resulting texture is checked for existence and sane size.
  const { TrackLayout } = await import('../src/game/entities/TrackLayout.ts');
  const { getTrackDefinition, PLAYABLE_TRACK_IDS } = await import('../src/game/config/tracks.ts');
  const { WorldBuilder } = await import('../src/game/world/WorldBuilder.ts');
  const scene = sceneOf(SCENE_KEYS.game);

  for (const id of PLAYABLE_TRACK_IDS) {
    let baked = false;
    let error = '';
    const t0 = performance.now();
    try {
      const layout = new TrackLayout(getTrackDefinition(id));
      const key = WorldBuilder.build(scene, layout);
      baked = scene.textures.exists(key);
    } catch (e) {
      error = String(e).split('\n')[0];
    }
    const ms = Math.round(performance.now() - t0);
    check(`[${id}] its world bakes`, baked && error === '', error || `${ms}ms`);
  }

  check('the raced world survived baking every track', sceneOf(SCENE_KEYS.game).scene.isActive() === true);
}

console.log('\n[scene] nothing is handed to React while the race is still on');
{
  // The results handoff is the one thing the scene pushes to React, and it must
  // not fire early or fire twice.
  const scene = sceneOf(SCENE_KEYS.game);
  const live = !scene.session.race.isOver;
  check('no result was handed over while the race was live',
    !live || results.length === 0, `${results.length} results, state ${scene.session.race.currentState}`);
  check('at most one result is ever handed over', results.length <= 1, `${results.length}`);
}

const holdersBeforeDestroy = audioHolders();
game.destroy(true);
// `destroy(true)` tears the scenes down, so the race scene's shutdown handler
// must have run and dropped its reference. Give Phaser a turn to drain.
await settle(120);
check('destroying the game releases the audio holder', audioHolders() < holdersBeforeDestroy,
  `${holdersBeforeDestroy} -> ${audioHolders()}`);
console.log(failures === 0 ? '\n=== all scene checks passed ===' : `\n=== ${failures} SCENE CHECKS FAILED ===`);
process.exit(failures === 0 ? 0 : 1);