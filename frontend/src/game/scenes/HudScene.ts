import Phaser from 'phaser';
import { getRaceBridge } from '../bridge';
import { COLORS, GAME, GAME_EVENTS, SCENE_KEYS } from '../config/GameConfig';
import type { HudData } from '../systems/RaceSession';
import { formatRaceTime } from '../utils/geometry';

const FONT = "'Courier New', monospace";
const RED = '#ff2e63';

/** Screen-space HUD, separate from the world camera. Driven only by events. */
export class HudScene extends Phaser.Scene {
  private lapText!: Phaser.GameObjects.Text;
  private timeText!: Phaser.GameObjects.Text;
  private speedText!: Phaser.GameObjects.Text;
  private centerText!: Phaser.GameObjects.Text;
  private banner!: Phaser.GameObjects.Container;
  private bannerTime!: Phaser.GameObjects.Text;

  constructor() {
    super(SCENE_KEYS.hud);
  }

  create(): void {
    const { width, height } = GAME;

    // Top bar
    this.add.rectangle(0, 0, width, 64, 0x000000, 0.55).setOrigin(0, 0);
    this.add.rectangle(0, 64, width, 2, COLORS.roadEdge, 0.9).setOrigin(0, 0);
    this.lapText = this.add.text(24, 32, 'LAP 1/3', { fontFamily: FONT, fontSize: '30px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0, 0.5);
    this.timeText = this.add.text(width - 24, 32, 'TIME 00:00.000', { fontFamily: FONT, fontSize: '30px', color: '#ffffff' }).setOrigin(1, 0.5);

    // Speed panel
    this.add.rectangle(24, height - 24, 230, 70, 0x000000, 0.55).setOrigin(0, 1).setStrokeStyle(2, COLORS.roadEdge, 0.9);
    this.speedText = this.add.text(139, height - 59, 'SPEED 0', { fontFamily: FONT, fontSize: '26px', color: RED, fontStyle: 'bold' }).setOrigin(0.5);

    this.centerText = this.add.text(width / 2, height / 2 - 80, '', { fontFamily: FONT, fontSize: '110px', color: '#ffffff', fontStyle: 'bold', stroke: '#9b5cff', strokeThickness: 8 }).setOrigin(0.5);

    // Driver / car label (proof the selection reached the race)
    const { characterName, car } = getRaceBridge(this.game).config;
    this.add.text(width / 2, 32, `${characterName.toUpperCase()}  ·  ${car.name.toUpperCase()}`, { fontFamily: FONT, fontSize: '20px', color: '#b8a6ff' }).setOrigin(0.5);

    // Finish banner (React shows the full results screen right after)
    const title = this.add.text(0, -30, 'RACE COMPLETE', { fontFamily: FONT, fontSize: '72px', color: '#ffffff', fontStyle: 'bold', stroke: RED, strokeThickness: 6 }).setOrigin(0.5);
    this.bannerTime = this.add.text(0, 50, '', { fontFamily: FONT, fontSize: '40px', color: '#ffffff' }).setOrigin(0.5);
    this.banner = this.add.container(width / 2, height / 2 - 40, [title, this.bannerTime]).setVisible(false);

    this.game.events.on(GAME_EVENTS.hudUpdate, this.onUpdate, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.game.events.off(GAME_EVENTS.hudUpdate, this.onUpdate, this));
  }

  private onUpdate(data: HudData): void {
    this.lapText.setText(`LAP ${data.lap}/${data.totalLaps}`);
    this.timeText.setText(`TIME ${formatRaceTime(data.finalTimeMs ?? data.elapsedMs)}`);
    this.speedText.setText(`SPEED ${String(data.speedKmh).padStart(3, ' ')} km/h`);

    if (data.state === 'countdown') {
      this.centerText.setText(String(Math.ceil(data.countdownRemainingMs / 1000)));
    } else if (data.state === 'racing' && data.elapsedMs < 800) {
      this.centerText.setText('GO!');
    } else {
      this.centerText.setText('');
    }

    const finished = data.state === 'finished';
    this.banner.setVisible(finished);
    if (finished) this.bannerTime.setText(`FINAL TIME  ${formatRaceTime(data.finalTimeMs ?? data.elapsedMs)}`);
  }
}
