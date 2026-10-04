import Phaser from 'phaser';
import { CONTROLS } from '../config/GameConfig';
import type { InputState } from '../entities/CarPhysics';

type KeyMap = Record<string, Phaser.Input.Keyboard.Key>;

/** Maps the keys in CONTROLS to abstract driving input. Swap for gamepad/touch later. */
export class InputController {
  private readonly keys: KeyMap;

  constructor(scene: Phaser.Scene) {
    const keyboard = scene.input.keyboard;
    if (!keyboard) throw new Error('Keyboard input is unavailable');
    const names = Array.from(new Set(Object.values(CONTROLS).flat()));
    this.keys = keyboard.addKeys(names.join(',')) as KeyMap;
  }

  private anyDown(names: readonly string[]): boolean {
    return names.some((n) => this.keys[n].isDown);
  }

  read(): InputState {
    const left = this.anyDown(CONTROLS.steerLeft);
    const right = this.anyDown(CONTROLS.steerRight);
    return {
      accelerate: this.anyDown(CONTROLS.accelerate),
      brake: this.anyDown(CONTROLS.brake),
      steer: (right ? 1 : 0) - (left ? 1 : 0),
    };
  }

  restartPressed(): boolean {
    return CONTROLS.restart.some((n) => Phaser.Input.Keyboard.JustDown(this.keys[n]));
  }

  /** Cycles the camera between the chase / hood / map views. */
  cameraPressed(): boolean {
    return CONTROLS.camera.some((n) => Phaser.Input.Keyboard.JustDown(this.keys[n]));
  }
}
