import Phaser from 'phaser';
import { CONTROLS } from '../config/GameConfig';
import type { InputState } from '../entities/CarPhysics';

type KeyMap = Record<string, Phaser.Input.Keyboard.Key>;

/**
 * Maps the keys in CONTROLS to abstract driving input. Swap for gamepad/touch later.
 *
 * Every action accepts two bindings and treats them as one: WASD and the arrow
 * keys are interchangeable, and pressing both at once is the same as pressing
 * either. Releasing one while the other is still held leaves the action down,
 * which is why state is tracked as "is any binding for this action down" rather
 * than "was the last key pressed released".
 */
export class InputController {
  private readonly keys: KeyMap;
  /** Set once the window loses focus; see `releaseAll`. */
  private blurred = false;

  constructor(scene: Phaser.Scene) {
    const keyboard = scene.input.keyboard;
    if (!keyboard) throw new Error('Keyboard input is unavailable');
    const names = Array.from(new Set(Object.values(CONTROLS).flat()));
    // enableCapture prevents the browser's own handling -- scrolling the page on
    // arrows or space -- from firing alongside the game's.
    this.keys = keyboard.addKeys(names.join(',')) as KeyMap;

    // A keyup is only delivered if the key is released while the window has
    // focus. Alt-tabbing or clicking away mid-press loses it, which would leave
    // that key latched down forever: the car drives off on its own, or the
    // steering stays turned. Phaser's VisibilityHandler pauses the game but does
    // not clear key state, so that is done here.
    //
    // While blurred, held keys are also ignored, because the OS may not report
    // their release until focus returns. That prevents a key held during the
    // alt-tab from re-latching as soon as the window comes back.
    const onBlur = () => {
      this.blurred = true;
      this.releaseAll();
    };
    const onFocus = () => {
      this.blurred = false;
      this.releaseAll();
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('blur', onBlur);
      window.addEventListener('focus', onFocus);
    }
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('blur', onBlur);
        window.removeEventListener('focus', onFocus);
      }
    });
  }

  /** Clears every key, so nothing stays held after focus is lost or regained. */
  private releaseAll(): void {
    for (const name of Object.keys(this.keys)) this.keys[name].reset();
  }

  private anyDown(names: readonly string[]): boolean {
    // Held keys are ignored while blurred: the matching keyup may be lost, so
    // trusting the current state could re-latch a key that is no longer down.
    if (this.blurred) return false;
    return names.some((n) => this.keys[n].isDown);
  }

  private anyJustDown(names: readonly string[]): boolean {
    if (this.blurred) return false;
    return names.some((n) => Phaser.Input.Keyboard.JustDown(this.keys[n]));
  }

  read(): InputState {
    const left = this.anyDown(CONTROLS.steerLeft);
    const right = this.anyDown(CONTROLS.steerRight);
    return {
      accelerate: this.anyDown(CONTROLS.accelerate),
      brake: this.anyDown(CONTROLS.brake),
      // Both at once cancels to straight rather than picking a side, so a player
      // holding both does not get a coin-flip direction.
      steer: (right ? 1 : 0) - (left ? 1 : 0),
      nitro: this.anyDown(CONTROLS.nitro),
    };
  }

  restartPressed(): boolean {
    return this.anyJustDown(CONTROLS.restart);
  }

  /** Cycles the camera between the chase / hood / map views. */
  cameraPressed(): boolean {
    return this.anyJustDown(CONTROLS.camera);
  }
}