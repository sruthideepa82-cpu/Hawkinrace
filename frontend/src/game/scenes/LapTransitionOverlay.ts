import Phaser from 'phaser';
import { FONTS, GAME_EVENTS } from '../config/GameConfig';
import { formatRaceTime } from '../utils/geometry';

export interface LapCompletePayload {
  lap: number;
  lapTimeMs: number;
  position: number;
  totalRacers: number;
  lapsRemaining: number;
}

export class LapTransitionOverlay {
  private container: Phaser.GameObjects.Container;
  private bg: Phaser.GameObjects.Rectangle;
  private titleText: Phaser.GameObjects.Text;
  private timeValueText: Phaser.GameObjects.Text;
  private posValueText: Phaser.GameObjects.Text;
  private remainText: Phaser.GameObjects.Text;

  constructor(private scene: Phaser.Scene) {
    const width = scene.cameras.main.width;
    const height = scene.cameras.main.height;
    
    // Dark translucent background
    this.bg = scene.add.rectangle(0, 0, width, height, 0x000000, 0.75).setOrigin(0);
    
    this.titleText = scene.add.text(width / 2, height / 2 - 140, 'LAP 1 COMPLETE', {
      fontFamily: FONTS.display,
      fontSize: '64px',
      color: '#ffffff',
      fontStyle: 'italic'
    }).setOrigin(0.5);

    // Decorator line
    const line = scene.add.rectangle(width / 2, height / 2 - 95, 400, 2, 0xff2e63).setOrigin(0.5);

    const timeLabelText = scene.add.text(width / 2, height / 2 - 40, 'LAP TIME', {
      fontFamily: FONTS.mono, fontSize: '20px', color: '#9a94b8'
    }).setOrigin(0.5);
    
    this.timeValueText = scene.add.text(width / 2, height / 2 - 10, '00:00.000', {
      fontFamily: FONTS.mono, fontSize: '36px', color: '#ffffff'
    }).setOrigin(0.5);
    
    const posLabelText = scene.add.text(width / 2, height / 2 + 40, 'POSITION', {
      fontFamily: FONTS.mono, fontSize: '20px', color: '#9a94b8'
    }).setOrigin(0.5);
    
    this.posValueText = scene.add.text(width / 2, height / 2 + 70, '1 / 1', {
      fontFamily: FONTS.display, fontSize: '36px', color: '#ffffff'
    }).setOrigin(0.5);
    
    this.remainText = scene.add.text(width / 2, height / 2 + 130, '2 LAPS REMAINING', {
      fontFamily: FONTS.display, fontSize: '28px', color: '#ff2e63'
    }).setOrigin(0.5);
    
    this.container = scene.add.container(0, 0, [
      this.bg, this.titleText, line,
      timeLabelText, this.timeValueText, 
      posLabelText, this.posValueText, 
      this.remainText
    ]).setDepth(100).setAlpha(0).setVisible(false);

    scene.game.events.on(GAME_EVENTS.lapComplete, this.show, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.game.events.off(GAME_EVENTS.lapComplete, this.show, this);
    });
  }

  private show(payload: LapCompletePayload) {
    this.container.setVisible(true);
    this.container.setAlpha(0);

    this.titleText.setText(`LAP ${payload.lap} COMPLETE`);
    this.timeValueText.setText(formatRaceTime(payload.lapTimeMs));
    this.posValueText.setText(`${payload.position} / ${payload.totalRacers}`);
    this.remainText.setText(payload.lapsRemaining === 1 ? '1 LAP REMAINING' : `${payload.lapsRemaining} LAPS REMAINING`);

    this.scene.tweens.add({
      targets: this.container,
      alpha: 1,
      duration: 250,
      ease: 'Power2',
      yoyo: true,
      hold: 1500, // hold for 1.5 seconds
      onComplete: () => {
        this.container.setVisible(false);
      }
    });
  }
}
