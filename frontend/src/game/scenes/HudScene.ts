import Phaser from 'phaser';
import { getRaceBridge } from '../bridge';
import { FONTS, GAME, GAME_EVENTS, SCENE_KEYS } from '../config/GameConfig';
import type { HudPayload } from '../systems/RaceSession';
import { formatRaceTime } from '../utils/geometry';

import { getTrackDefinition } from '../config/tracks';
import type { RaceBridge } from '../bridge';
import type { StandingEntry } from '../bridge';

const RED = '#ff2e63';
const LEADER_ROWS = 4;

/** Screen-space HUD, separate from the world camera. Driven only by events. */
export class HudScene extends Phaser.Scene {
  private posText!: Phaser.GameObjects.Text;
  private lapText!: Phaser.GameObjects.Text;
  private timeText!: Phaser.GameObjects.Text;
  private speedText!: Phaser.GameObjects.Text;
  private centerText!: Phaser.GameObjects.Text;
  private banner!: Phaser.GameObjects.Container;
  private bannerTitle!: Phaser.GameObjects.Text;
  private bannerTime!: Phaser.GameObjects.Text;

  private bridge!: RaceBridge;
  private minimap!: Phaser.GameObjects.Container;
  private minimapBlip!: Phaser.GameObjects.Arc;
  private minimapRivals: Phaser.GameObjects.Arc[] = [];
  private minimapScale: number = 1;
  /** World-space centre the minimap is drawn around. */
  private trackOrigin = { x: 0, y: 0 };
  private viewLabel!: Phaser.GameObjects.Text;

  /** Live leaderboard rows, one per car on the grid. */
  private leaderRows: { name: Phaser.GameObjects.Text; pos: Phaser.GameObjects.Text; chip: Phaser.GameObjects.Rectangle }[] = [];

  /** Nitro fill, resized every frame from the player's tank. */
  private nitroFill!: Phaser.GameObjects.Rectangle;
  private nitroLabel!: Phaser.GameObjects.Text;
  private static readonly NITRO_FULL_WIDTH = 150;

  constructor() {
    super(SCENE_KEYS.hud);
  }

  create(): void {
    this.bridge = getRaceBridge(this.game);
    const { width, height } = GAME;

    // Top bar
    this.add.rectangle(0, 0, width, 64, 0x000000, 0.7).setOrigin(0, 0);
    this.add.rectangle(0, 64, width, 1, 0x333333, 1).setOrigin(0, 0);

    // Position and lap sit side by side on the left of the top bar.
    this.posText = this.add.text(40, 32, 'POS 1/4', { fontFamily: FONTS.display, fontSize: '28px', color: RED }).setOrigin(0, 0.5);
    this.lapText = this.add.text(150, 32, 'LAP 1/3', { fontFamily: FONTS.display, fontSize: '28px', color: '#ffffff' }).setOrigin(0, 0.5);
    this.timeText = this.add.text(width - 40, 32, 'TIME 00:00.000', { fontFamily: FONTS.mono, fontSize: '24px', color: '#ffffff' }).setOrigin(1, 0.5);

    // Driver / car label
    const { characterName, car } = getRaceBridge(this.game).config;
    this.add.text(width / 2, 32, `${characterName.toUpperCase()}  ·  ${car.name.toUpperCase()}`, { fontFamily: FONTS.mono, fontSize: '18px', color: '#b8a6ff' }).setOrigin(0.5);

    // Live leaderboard, tucked under the top bar on the left.
    this.buildLeaderboard(40, 84);

    // Speed panel (bottom left)
    this.add.circle(100, height - 60, 50, 0x000000, 0.7).setStrokeStyle(3, 0xff2e63);
    this.speedText = this.add.text(100, height - 60, '000', { fontFamily: FONTS.display, fontSize: '36px', color: '#ffffff' }).setOrigin(0.5);
    this.add.text(180, height - 60, 'km/h', { fontFamily: FONTS.display, fontSize: '24px', color: '#ffffff' }).setOrigin(0, 0.5);

    // Nitro panel (bottom right)
    this.nitroLabel = this.add.text(width - 250, height - 60, 'NITRO', { fontFamily: FONTS.display, fontSize: '20px', color: '#ffffff' }).setOrigin(1, 0.5);
    this.add.rectangle(width - 40, height - 60, 200, 20, 0x000000, 0.7).setOrigin(1, 0.5).setStrokeStyle(2, 0xff2e63);
    this.nitroFill = this.add.rectangle(width - 235, height - 60, HudScene.NITRO_FULL_WIDTH, 16, 0xff2e63, 1).setOrigin(0, 0.5);

    // Minimap. Everything lives in a container so the map can be rotated to
    // match the camera, which keeps the blip pointing the way the car drives.
    this.minimap = this.add.container(width - 100, 150);
    this.minimap.add(this.add.rectangle(0, 0, 160, 160, 0x000000, 0.5).setStrokeStyle(1, 0x333333));
    const minimapTrack = this.add.graphics();
    this.minimap.add(minimapTrack);
    // Rival blips first so the player's red blip always draws on top.
    this.minimapRivals = Array.from({ length: LEADER_ROWS - 1 }, () => {
      const dot = this.add.circle(0, 0, 3, 0x9b5cff).setVisible(false);
      this.minimap.add(dot);
      return dot;
    });
    this.minimapBlip = this.add.circle(0, 0, 4, 0xff2e63);
    this.minimap.add(this.minimapBlip);
    this.viewLabel = this.add.text(width - 100, 150 + 92, 'CHASE', { fontFamily: FONTS.mono, fontSize: '12px', color: '#9a94b8' }).setOrigin(0.5);

    // Draw track on minimap
    const track = getTrackDefinition(this.bridge.config.trackId);
    this.trackOrigin = { x: track.worldWidth / 2, y: track.worldHeight / 2 };
    this.minimapScale = 140 / Math.max(track.worldWidth, track.worldHeight);

    minimapTrack.lineStyle(2, 0xffffff, 0.5);
    minimapTrack.beginPath();
    for (let i = 0; i < track.controlPoints.length; i++) {
      const p = track.controlPoints[i];
      const mx = (p.x - this.trackOrigin.x) * this.minimapScale;
      const my = (p.y - this.trackOrigin.y) * this.minimapScale;
      if (i === 0) minimapTrack.moveTo(mx, my);
      else minimapTrack.lineTo(mx, my);
    }
    minimapTrack.closePath();
    minimapTrack.strokePath();

    this.centerText = this.add.text(width / 2, height / 2 - 40, '', { fontFamily: FONTS.display, fontSize: '140px', color: RED, fontStyle: 'bold' }).setOrigin(0.5);

    // Finish banner. The title is swapped on failure so it can never read
    // "RACE COMPLETE" for a race the player lost.
    this.bannerTitle = this.add.text(0, -40, 'RACE COMPLETE', { fontFamily: FONTS.display, fontSize: '80px', color: '#ffffff' }).setOrigin(0.5);
    this.bannerTime = this.add.text(0, 40, '', { fontFamily: FONTS.mono, fontSize: '32px', color: '#ffffff' }).setOrigin(0.5);
    this.banner = this.add.container(width / 2, height / 2, [this.bannerTitle, this.bannerTime]).setVisible(false);

    this.game.events.on(GAME_EVENTS.hudUpdate, this.onUpdate, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.game.events.off(GAME_EVENTS.hudUpdate, this.onUpdate, this));
  }

  /** Compact four-row classification, redrawn every frame from real standings. */
  private buildLeaderboard(x: number, y: number): void {
    const rowHeight = 26;
    const width = 230;
    this.add.rectangle(x, y - 6, width, rowHeight * LEADER_ROWS + 10, 0x000000, 0.45).setOrigin(0, 0).setStrokeStyle(1, 0x333333);

    for (let i = 0; i < LEADER_ROWS; i++) {
      const rowY = y + i * rowHeight + 10;
      const chip = this.add.rectangle(x + 12, rowY, 10, 10, 0xffffff, 1).setOrigin(0.5);
      const pos = this.add.text(x + 24, rowY, `${i + 1}`, { fontFamily: FONTS.mono, fontSize: '14px', color: '#9a94b8' }).setOrigin(0, 0.5);
      const name = this.add.text(x + 48, rowY, '', { fontFamily: FONTS.display, fontSize: '17px', color: '#ffffff' }).setOrigin(0, 0.5);
      this.leaderRows.push({ name, pos, chip });
    }
  }

  private onUpdate(data: HudPayload): void {
    this.posText.setText(`POS ${data.playerPosition}/${data.standings.length}`);
    this.lapText.setText(`LAP ${data.playerLap}/${data.totalLaps}`);
    this.timeText.setText(`TIME ${formatRaceTime(data.finalTimeMs ?? data.elapsedMs)}`);
    this.speedText.setText(`${String(data.speedKmh).padStart(3, '0')}`);

    this.updateLeaderboard(data.standings);

    // Nitro bar follows the player's actual tank.
    const fill = Math.max(0, Math.min(1, data.nitro));
    this.nitroFill.setDisplaySize(HudScene.NITRO_FULL_WIDTH * fill, 16);
    this.nitroLabel.setColor(data.nitro > 0.25 ? '#ffffff' : '#7a7590');

    // Keep the map aligned with the road: rotating it by the camera rotation
    // means "up" on the minimap is always "up" on screen.
    this.minimap.setRotation(data.cameraRotation);
    this.minimapBlip.setPosition(
      (data.playerPos.x - this.trackOrigin.x) * this.minimapScale,
      (data.playerPos.y - this.trackOrigin.y) * this.minimapScale,
    );
    data.rivalPos.slice(0, this.minimapRivals.length).forEach((rival, i) => {
      this.minimapRivals[i]
        .setVisible(true)
        .setFillStyle(rival.color)
        .setPosition(
          (rival.x - this.trackOrigin.x) * this.minimapScale,
          (rival.y - this.trackOrigin.y) * this.minimapScale,
        );
    });
    for (let i = data.rivalPos.length; i < this.minimapRivals.length; i++) {
      this.minimapRivals[i].setVisible(false);
    }
    this.viewLabel.setText(data.view);

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

    // The banner only ever appears once the race is over, and says the right
    // thing for which way it ended.
    const failed = data.state === 'failed';
    const over = data.state === 'finished' || failed;
    this.banner.setVisible(over);
    if (over) {
      if (failed) {
        this.bannerTitle.setText('YOU FAILED').setColor('#ff2e63');
        // Reaching this state means every car but the player's has finished, so
        // the count is simply the field minus the player.
        const aiCount = Math.max(0, data.standings.length - 1);
        this.bannerTime.setText(`${aiCount}/${aiCount} RACERS BEAT YOU`);
      } else {
        this.bannerTitle.setText('RACE COMPLETE').setColor('#ffffff');
        const me = data.standings.find((s) => s.isPlayer);
        this.bannerTime.setText(
          me?.finishTimeMs != null
            ? `${ordinal(me.position)} PLACE   ${formatRaceTime(me.finishTimeMs)}`
            : `FINAL TIME  ${formatRaceTime(data.finalTimeMs ?? data.elapsedMs)}`,
        );
      }
    }
  }

  private updateLeaderboard(standings: readonly StandingEntry[]): void {
    for (let i = 0; i < this.leaderRows.length; i++) {
      const row = this.leaderRows[i];
      const entry = standings[i];
      if (!entry) {
        row.name.setText('');
        row.pos.setText('');
        row.chip.setVisible(false);
        continue;
      }
      row.chip.setVisible(true).setFillStyle(entry.color);

      // The player's row is highlighted so it is obvious at a glance.
      if (entry.isPlayer) {
        row.name.setColor(RED).setFontStyle('bold');
        row.pos.setColor(RED).setText(`${entry.position}  ★`);
      } else {
        row.name.setColor('#ffffff').setFontStyle('normal');
        row.pos.setColor('#9a94b8').setText(`${entry.position}`);
      }
      row.name.setText(entry.characterName);

      // Once a car takes the flag, show its time instead of its lap.
      if (entry.finished && entry.finishTimeMs != null) {
        row.pos.setText(`${entry.position}  ${formatRaceTime(entry.finishTimeMs).slice(0, 5)}`);
      }
    }
  }
}

function ordinal(n: number): string {
  const suffix = n === 1 ? 'ST' : n === 2 ? 'ND' : n === 3 ? 'RD' : 'TH';
  return `${n}${suffix}`;
}