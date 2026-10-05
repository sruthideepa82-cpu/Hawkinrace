/**
 * Ground-truth probe for keyboard input.
 *
 * Boots a real Phaser game in HEADLESS mode against a minimal DOM shim, then
 * dispatches genuine DOM `keydown` / `keyup` events at the game's keyboard
 * target and reads `InputController.read()`. Nothing here is a stub of our own
 * code: Phaser's own `KeyboardPlugin`, `Key` and `KeyboardManager` do the work.
 */

// NOTE: Phaser is imported dynamically, further down, *after* the DOM shim is
// installed. Phaser touches `window` while it is being evaluated, so a static
// top-level import would throw before the shim exists.

// ---------------------------------------------------------------- DOM shim
// Phaser needs `window` with event-target methods and `document` with a couple
// of node stubs. This is enough to get the real KeyboardManager listening.
/**
 * Minimal 2D context. Phaser probes the canvas at import time to pick a
 * renderer, so this has to answer without throwing. Nothing in this probe
 * renders anything, so every draw call is a no-op.
 */
function fakeContext(): any {
  const noop = () => {};
  return new Proxy(
    {
      canvas: null as any,
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
    return fakeContext();
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

/**
 * Phaser's TextureManager blocks the game from starting until its three
 * built-in textures (`__DEFAULT`, `__MISSING`, `__WHITE`) report loaded. Each is
 * loaded through a real `Image`, so this fires `onload` on the next tick to let
 * boot continue. Without it the game boots but never starts, no scene runs, and
 * the probe has nothing to talk to.
 */
class FakeImage extends FakeNode {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = 1;
  naturalHeight = 1;
  complete = false;
  set src(_value: string) {
    this.complete = true;
    setTimeout(() => this.onload?.(), 0);
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
  // Phaser's RequestAnimationFrame drives the whole game loop off `window`. If
  // this is missing the game boots but never steps, so no scene ever runs
  // create() and the loop appears to do nothing.
  requestAnimationFrame: ((cb: FrameRequestCallback) =>
    setTimeout(() => cb(performance.now()), 16)) as any,
  cancelAnimationFrame: ((id: number) => clearTimeout(id)) as any,
  setTimeout: ((fn: () => void, ms: number) => setTimeout(fn, ms)) as any,
  clearTimeout: ((id: number) => clearTimeout(id)) as any,
  setInterval: ((fn: () => void, ms: number) => setInterval(fn, ms)) as any,
  clearInterval: ((id: number) => clearInterval(id)) as any,
};

const fakeDocument: any = {
  // Phaser's DOMContentLoaded helper calls boot() immediately when the document
  // reports itself loaded. Without this the game never starts.
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

// Phaser's ScaleManager reads `screen.orientation` on boot.
const fakeScreen = {
  orientation: { addEventListener() {}, removeEventListener() {} },
  width: 1280,
  height: 720,
  availWidth: 1280,
  availHeight: 720,
};
fakeWindow.screen = fakeScreen;

const g: any = globalThis;
g.window = fakeWindow;
g.document = fakeDocument;
g.screen = fakeScreen;
// Node 22 defines `navigator` as a getter-only global, so it has to be replaced
// via defineProperty rather than assignment.
Object.defineProperty(g, 'navigator', {
  value: fakeWindow.navigator,
  configurable: true,
  writable: true,
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

// Now that `window` exists, Phaser can be evaluated. `phaser` is aliased to its
// bundled ESM build by tools/ts-resolve.mjs -- see the comment there.
const Phaser = (await import('phaser')).default;

// ------------------------------------------------------------- key dispatch
// Real DOM KeyboardEvent shapes, so Phaser's `event.keyCode` / `defaultPrevented`
// handling is exercised exactly as it is in a browser.
function keyEvent(type: 'keydown' | 'keyup', code: string, keyCode: number): any {
  return {
    type,
    code,
    key: code,
    keyCode,
    which: keyCode,
    repeat: false,
    altKey: false,
    ctrlKey: false,
    shiftKey: false,
    metaKey: false,
    defaultPrevented: false,
    preventDefault(this: any) { this.defaultPrevented = true; },
    stopPropagation() {},
    stopImmediatePropagation() {},
    timeStamp: performance.now(),
  };
}

/** Phaser's KeyCodes, so we dispatch the same numbers a real browser would. */
const CODES: Record<string, number> = {
  W: 87, A: 65, S: 83, D: 68,
  UP: 38, LEFT: 37, DOWN: 40, RIGHT: 39,
  SHIFT: 16, SPACE: 32, R: 82, C: 67, V: 86,
};

// ------------------------------------------------------------------ the test
const { InputController } = await import('../src/game/systems/InputController.ts');

let controller: any = null;

class ProbeScene extends Phaser.Scene {
  create() {
    try {
      controller = new InputController(this);
    } catch (error) {
      console.log('InputController constructor threw:', (error as Error).message);
      throw error;
    }
  }
}

const game = new Phaser.Game({
  type: Phaser.HEADLESS,
  width: 640,
  height: 480,
  banner: false,
  audio: { noAudio: true },
  scene: [ProbeScene],
});

// Phaser's SceneManager picks scenes up from the config array during boot; the
// list is empty until the game has actually started, so report what we have.
game.events.on(Phaser.Core.Events.START, () => {
  console.log('  game start fired, scenes:', game.scene.scenes.map((s) => s.key).join(', ') || '(none)');
});

// Surface anything Phaser complains about while booting; a silent failure here
// is indistinguishable from "input is broken", which is the thing being tested.
game.events.on('step', () => {});
console.log('booting headless game...');
game.events.once('ready', () => console.log('  game ready'));

const origError = console.error;
console.error = (...args: unknown[]) => {
  origError('  [phaser]', ...args);
};

// Let Phaser boot and the scene run create(). The step is driven by the game's
// own loop, which needs real time to get going under Node.
for (let i = 0; i < 100 && !controller; i++) {
  await new Promise((r) => setTimeout(r, 20));
}

if (!controller) {
  console.log('FAIL: InputController was never constructed');
  console.log('  scene list:', game.scene.scenes.map((s) => `${s.key}:${s.scene.isActive() ? 'active' : 'inactive'}`).join(', '));
  console.log('  game booted:', game.isBooted);
  process.exit(1);
}

function press(code: string) {
  const keyCode = CODES[code];
  if (keyCode === undefined) throw new Error(`unknown code ${code}`);
  const down = keyEvent('keydown', code, keyCode);
  fakeWindow.dispatch(down);
  // Phaser processes the queue on the game step.
  return down;
}

function release(code: string) {
  fakeWindow.dispatch(keyEvent('keyup', code, CODES[code]));
}

function state() {
  return controller.read();
}

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  if (ok) console.log(`  PASS  ${label}`);
  else {
    failures++;
    console.log(`  FAIL  ${label}${detail ? ` -> ${detail}` : ''}`);
  }
}

console.log('\n[input] WASD and arrow keys both drive the car');

const NEUTRAL = { accelerate: false, brake: false, steer: 0, nitro: false };

for (const [name, letter, arrow] of [
  ['accelerate', 'W', 'UP'],
  ['brake', 'S', 'DOWN'],
  ['left', 'A', 'LEFT'],
  ['right', 'D', 'RIGHT'],
] as const) {
  const expected =
    name === 'accelerate' ? { ...NEUTRAL, accelerate: true }
    : name === 'brake' ? { ...NEUTRAL, brake: true }
    : name === 'left' ? { ...NEUTRAL, steer: -1 }
    : { ...NEUTRAL, steer: 1 };

  press(letter);
  const viaLetter = state();
  release(letter);
  press(arrow);
  const viaArrow = state();
  release(arrow);
  const released = state();

  check(`${letter} gives ${name}`, JSON.stringify(viaLetter) === JSON.stringify(expected), JSON.stringify(viaLetter));
  check(`${arrow} gives the same as ${letter}`, JSON.stringify(viaArrow) === JSON.stringify(expected), JSON.stringify(viaArrow));
  check(`releasing ${arrow} returns to neutral`, JSON.stringify(released) === JSON.stringify(NEUTRAL), JSON.stringify(released));
}

// Holding both bindings for one action at once must not cancel out.
press('W');
press('UP');
const both = state();
check('W + UP together still accelerates', both.accelerate === true, JSON.stringify(both));
release('W');
release('UP');
check('releasing one of W/UP releases the accelerator', state().accelerate === false, JSON.stringify(state()));

// Opposite steer keys must cancel, not fight.
press('A');
press('RIGHT');
const opposed = state();
check('left + right cancel to straight', opposed.steer === 0, `steer ${opposed.steer}`);
release('A');
release('RIGHT');

// Nitro and the one-shot keys.
press('SPACE');
check('SPACE triggers nitro', state().nitro === true, JSON.stringify(state()));
release('SPACE');
check('releasing SPACE drops nitro', state().nitro === false);
press('SHIFT');
check('SHIFT triggers nitro', state().nitro === true, JSON.stringify(state()));
release('SHIFT');

press('R');
check('R registers as a restart press', controller.restartPressed() === true);
check('R only counts on the frame it is pressed', controller.restartPressed() === false);
release('R');

press('C');
check('C registers as a camera press', controller.cameraPressed() === true);
check('C only counts on the frame it is pressed', controller.cameraPressed() === false);
release('C');

// Every advertised binding must actually be captured, or the browser scrolls the
// page instead of steering.
console.log('\n[input] driving keys are captured so the page does not scroll');
for (const code of ['UP', 'DOWN', 'LEFT', 'RIGHT', 'SPACE', 'W', 'A', 'S', 'D']) {
  const ev = press(code);
  const captured = ev.defaultPrevented === true;
  release(code);
  check(`${code} preventDefault is called`, captured, 'page would scroll instead of steering');
}

// ------------------------------------------------------------------ lost focus
// Alt-tabbing or clicking outside the window while a key is held means the
// browser never delivers the matching `keyup`. A car that keeps its foot down
// afterwards is a real way for "the keys stopped working" to be true.
console.log('\n[input] losing focus mid-press does not leave the car stuck');
press('W');
check('accelerate is down before focus is lost', state().accelerate === true, JSON.stringify(state()));
fakeWindow.dispatch({ type: 'blur' });
check('blur releases every held key', state().accelerate === false, JSON.stringify(state()));
// While the window is in the background nothing should respond.
press('D');
check('input is ignored while the window is in the background', state().steer === 0, JSON.stringify(state()));
release('D');
// And the keys must still work normally once the window comes back.
fakeWindow.dispatch({ type: 'focus' });
press('D');
check('steering still works after focus returns', state().steer === 1, JSON.stringify(state()));
release('D');
check('releasing returns to neutral', state().steer === 0, JSON.stringify(state()));

// ---------------------------------------------------------------- held keys
console.log('\n[input] a stuck key cannot be shaken loose by pressing it again');
press('A');
fakeWindow.dispatch({ type: 'blur' });
press('A');
check('re-pressing after focus loss still releases cleanly', state().steer === 0, JSON.stringify(state()));
release('A');

game.destroy(true);
console.log(failures === 0 ? '\n=== all input checks passed ===' : `\n=== ${failures} INPUT CHECKS FAILED ===`);
process.exit(failures === 0 ? 0 : 1);