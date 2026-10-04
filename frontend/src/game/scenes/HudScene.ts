import Phaser from 'phaser';
import { getRaceBridge } from '../bridge';
import { GAME, GAME_EVENTS, SCENE_KEYS } from '../config/GameConfig';
import type { HudData } from '../systems/RaceSession';
import { formatRaceTime } from '../utils/geometry';

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
    this.add.rectangle(0, 0, width, 64, 0x000000, 0.7).setOrigin(0, 0);
    this.add.rectangle(0, 64, width, 1, 0x333333, 1).setOrigin(0, 0);
    
    this.lapText = this.add.text(40, 32, 'LAP 1/3', { fontFamily: 'var(--display), Impact, sans-serif', fontSize: '28px', color: '#ffffff' }).setOrigin(0, 0.5);
    this.timeText = this.add.text(width - 40, 32, 'TIME 00:00.000', { fontFamily: 'var(--mono), monospace', fontSize: '24px', color: '#ffffff' }).setOrigin(1, 0.5);

    // Driver / car label
    const { characterName, car } = getRaceBridge(this.game).config;
    this.add.text(width / 2, 32, `${characterName.toUpperCase()}  ·  ${car.name.toUpperCase()}`, { fontFamily: 'var(--mono), monospace', fontSize: '18px', color: '#b8a6ff' }).setOrigin(0.5);

    // Speed panel (bottom left)
    this.add.circle(100, height - 60, 50, 0x000000, 0.7).setStrokeStyle(3, 0xff2e63);
    this.speedText = this.add.text(100, height - 60, '000', { fontFamily: 'var(--display), Impact, sans-serif', fontSize: '36px', color: '#ffffff' }).setOrigin(0.5);
    this.add.text(180, height - 60, 'km/h', { fontFamily: 'var(--display), Impact, sans-serif', fontSize: '24px', color: '#ffffff' }).setOrigin(0, 0.5);

    // Nitro panel (bottom right)
    this.add.text(width - 250, height - 60, 'NITRO', { fontFamily: 'var(--display), Impact, sans-serif', fontSize: '20px', color: '#ffffff' }).setOrigin(1, 0.5);
    this.add.rectangle(width - 40, height - 60, 200, 20, 0x000000, 0.7).setOrigin(1, 0.5).setStrokeStyle(2, 0xff2e63);
    this.add.rectangle(width - 235, height - 60, 150, 16, 0xff2e63, 1).setOrigin(0, 0.5);

    // Minimap placeholder
    this.add.rectangle(width - 80, 150, 120, 120, 0x000000, 0.5).setStrokeStyle(1, 0x333333);
    this.add.text(width - 80, 150, 'MINIMAP\n(COMING SOON)', { fontFamily: 'var(--mono), monospace', fontSize: '12px', color: '#555', align: 'center' }).setOrigin(0.5);

    this.centerText = this.add.text(width / 2, height / 2 - 40, '', { fontFamily: 'var(--display), Impact, sans-serif', fontSize: '140px', color: RED, fontStyle: 'bold' }).setOrigin(0.5);

    // Finish banner
    const title = this.add.text(0, -40, 'RACE COMPLETE', { fontFamily: 'var(--display), Impact, sans-serif', fontSize: '80px', color: '#ffffff' }).setOrigin(0.5);
    this.bannerTime = this.add.text(0, 40, '', { fontFamily: 'var(--mono), monospace', fontSize: '32px', color: '#ffffff' }).setOrigin(0.5);
    this.banner = this.add.container(width / 2, height / 2, [title, this.bannerTime]).setVisible(false);

    this.game.events.on(GAME_EVENTS.hudUpdate, this.onUpdate, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.game.events.off(GAME_EVENTS.hudUpdate, this.onUpdate, this));
  }

  private onUpdate(data: HudData): void {
    this.lapText.setText(`LAP ${data.lap}/${data.totalLaps}`);
    this.timeText.setText(`TIME ${formatRaceTime(data.finalTimeMs ?? data.elapsedMs)}`);
    this.speedText.setText(`${String(data.speedKmh).padStart(3, '0')} km/h`);

    if (data.state === 'countdown') {
      this.centerText.setText(String(Math.ceil(data.countdownRemainingMs / 1000)));
      this.centerText.setColor(RED);
      this.centerText.setStroke('#ffffff', 0);
    } else if (data.state === 'racing' && data.elapsedMs < 800) {
      this.centerText.setText('GO!');
      this.centerText.setColor('#ffffff');
      this.centerText.setStroke(RED, 6);
    } else {
      this.centerText.setText('');
    }

    const finished = data.state === 'finished';
    this.banner.setVisible(finished);
    if (finished) this.bannerTime.setText(`FINAL TIME  ${formatRaceTime(data.finalTimeMs ?? data.elapsedMs)}`);
  }
}
