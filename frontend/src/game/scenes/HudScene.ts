import Phaser from 'phaser';
import { getRaceBridge } from '../bridge';
import { FONTS, GAME, GAME_EVENTS, SCENE_KEYS } from '../config/GameConfig';
import type { HudPayload } from '../systems/RaceSession';
import { formatRaceTime } from '../utils/geometry';
import { TrackIntroOverlay } from './TrackIntroOverlay';

import { getTrackDefinition } from '../config/tracks';
import type { RaceBridge } from '../bridge';
import type { StandingEntry } from '../bridge';

const RED = '#ff2e63';
const LEADER_ROWS = 4;

/** Screen-space HUD, separate from the world camera. Driven only by events. */
export class HudScene extends Phaser.Scene {
  private posText!: Phaser.GameObjects.Text;
  /** Session best lap. Only shown in a Time Trial, where it is the headline. */
  private bestLapText!: Phaser.GameObjects.Text;
  private bestLapLabel!: Phaser.GameObjects.Text;
  private muteText!: Phaser.GameObjects.Text;
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

  /** The "LAP COMPLETE" card, shown after lap 1 and lap 2. */
  private lapCard!: Phaser.GameObjects.Container;
  private lapCardTitle!: Phaser.GameObjects.Text;
  private lapCardTime!: Phaser.GameObjects.Text;
  private lapCardPosition!: Phaser.GameObjects.Text;
  private lapCardRemaining!: Phaser.GameObjects.Text;
  private lapCardUp = false;

  /** The pause card. */
  private pauseCard!: Phaser.GameObjects.Container;
  private pauseCardUp = false;

  /** Live leaderboard rows, one per car on the grid. */
  private leaderRows: { name: Phaser.GameObjects.Text; pos: Phaser.GameObjects.Text; chip: Phaser.GameObjects.Rectangle }[] = [];

  /** Nitro fill, resized every frame from the player's tank. */
  private nitroFill!: Phaser.GameObjects.Rectangle;
  private nitroLabel!: Phaser.GameObjects.Text;
  private abilityFill!: Phaser.GameObjects.Rectangle;
  private abilityLabel!: Phaser.GameObjects.Text;
  private static readonly NITRO_FULL_WIDTH = 150;
  private trackIntroOverlay!: TrackIntroOverlay;
  private hudElements: Phaser.GameObjects.GameObject[] = [];
  private hudVisible = false;
  /** Last lap shown, so the counter only animates when the lap actually rises. */
  private lastLap = 1;

  constructor() {
    super(SCENE_KEYS.hud);
  }

  create(): void {
    this.bridge = getRaceBridge(this.game);
    const { width, height } = GAME;
    this.hudElements = [];
    this.hudVisible = false;

    // Top bar
    const topBarBg = this.add.rectangle(0, 0, width, 64, 0x000000, 0.7).setOrigin(0, 0);
    const topBarLine = this.add.rectangle(0, 64, width, 1, 0x333333, 1).setOrigin(0, 0);

    // Position and lap sit side by side on the left of the top bar.
    this.posText = this.add.text(40, 32, 'P1 / 4', { fontFamily: FONTS.display, fontSize: '28px', color: RED }).setOrigin(0, 0.5);
    this.lapText = this.add.text(170, 32, 'LAP 1 / 3', { fontFamily: FONTS.display, fontSize: '28px', color: '#ffffff' }).setOrigin(0, 0.5);
    this.timeText = this.add.text(width - 40, 32, 'TIME 00:00.000', { fontFamily: FONTS.mono, fontSize: '24px', color: '#ffffff' }).setOrigin(1, 0.5);

    // Best lap and the mute indicator, stacked under the top bar on the right.
    // The best-lap readout starts empty and is only filled in a Time Trial,
    // where there is no position and no classification to show instead.
    this.bestLapLabel = this.add.text(width - 40, 80, 'BEST LAP', { fontFamily: FONTS.display, fontSize: '16px', color: '#7a7590' }).setOrigin(1, 0.5).setVisible(false);
    this.bestLapText = this.add.text(width - 40, 104, '--:--.---', { fontFamily: FONTS.mono, fontSize: '22px', color: '#b8a6ff' }).setOrigin(1, 0.5).setVisible(false);
    this.muteText = this.add.text(width - 40, 70, '', { fontFamily: FONTS.mono, fontSize: '12px', color: '#7a7590' }).setOrigin(1, 0.5);

    // Driver / car label
    const { characterName, car } = getRaceBridge(this.game).config;
    const labelText = this.add.text(width / 2, 32, `${characterName.toUpperCase()}  ·  ${car.name.toUpperCase()}`, { fontFamily: FONTS.mono, fontSize: '18px', color: '#b8a6ff' }).setOrigin(0.5);

    this.hudElements.push(topBarBg, topBarLine, this.posText, this.lapText, this.timeText, labelText);
    this.hudElements.push(this.bestLapLabel, this.bestLapText, this.muteText);

    // Live leaderboard, tucked under the top bar on the left.
    this.buildLeaderboard(40, 84);

    // Speed panel (bottom left)
    const speedBg = this.add.circle(100, height - 60, 50, 0x000000, 0.7).setStrokeStyle(3, 0xff2e63);
    this.speedText = this.add.text(100, height - 60, '000', { fontFamily: FONTS.display, fontSize: '36px', color: '#ffffff' }).setOrigin(0.5);
    const speedUnitText = this.add.text(180, height - 60, 'km/h', { fontFamily: FONTS.display, fontSize: '24px', color: '#ffffff' }).setOrigin(0, 0.5);

    // Nitro panel (bottom right)
    this.nitroLabel = this.add.text(width - 250, height - 50, 'NITRO', { fontFamily: FONTS.display, fontSize: '20px', color: '#ffffff' }).setOrigin(1, 0.5);
    const nitroBg = this.add.rectangle(width - 40, height - 50, 200, 20, 0x000000, 0.7).setOrigin(1, 0.5).setStrokeStyle(2, 0xff2e63);
    this.nitroFill = this.add.rectangle(width - 235, height - 50, HudScene.NITRO_FULL_WIDTH, 16, 0xff2e63, 1).setOrigin(0, 0.5);

    // Ability panel
    this.abilityLabel = this.add.text(width - 250, height - 85, 'VOID', { fontFamily: FONTS.display, fontSize: '20px', color: '#9a94b8' }).setOrigin(1, 0.5);
    const abilityBg = this.add.rectangle(width - 40, height - 85, 200, 20, 0x000000, 0.7).setOrigin(1, 0.5).setStrokeStyle(2, 0x8b5cf6);
    this.abilityFill = this.add.rectangle(width - 235, height - 85, HudScene.NITRO_FULL_WIDTH, 16, 0x8b5cf6, 1).setOrigin(0, 0.5);
    this.abilityFill.setDisplaySize(0, 16);

    this.hudElements.push(speedBg, this.speedText, speedUnitText, this.nitroLabel, nitroBg, this.nitroFill, this.abilityLabel, abilityBg, this.abilityFill);

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

    this.hudElements.push(this.minimap, this.viewLabel);

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

    // Lap card and pause card. Both are built once and faded in and out, in the
    // same panel style as the leaderboard so they read as part of this HUD.
    this.buildLapCard();
    this.buildPauseCard();

    this.trackIntroOverlay = new TrackIntroOverlay(this, this.bridge);

    // Hide HUD initially
    this.hudElements.forEach(el => (el as any).setAlpha(0));

    this.game.events.on(GAME_EVENTS.hudUpdate, this.onUpdate, this);
    this.game.events.on(GAME_EVENTS.supernaturalUpdate, this.onSupernaturalUpdate, this);
    this.game.events.on(GAME_EVENTS.supernaturalEvent, this.onSupernaturalEvent, this);
    
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(GAME_EVENTS.hudUpdate, this.onUpdate, this);
      this.game.events.off(GAME_EVENTS.supernaturalUpdate, this.onSupernaturalUpdate, this);
      this.game.events.off(GAME_EVENTS.supernaturalEvent, this.onSupernaturalEvent, this);
    });
  }

  private onSupernaturalEvent(ev: any): void {
    if (ev.type === 'takeover_start') {
      const { width, height } = GAME;
      const warning = this.add.text(width / 2, height / 2 - 100, 'THE UPSIDE DOWN IS TAKING OVER', {
        fontFamily: FONTS.display,
        fontSize: '48px',
        color: '#ff0000',
        fontStyle: 'bold'
      }).setOrigin(0.5).setAlpha(0);
      
      this.tweens.add({
        targets: warning,
        alpha: 1,
        yoyo: true,
        hold: 2000,
        duration: 500,
        onComplete: () => warning.destroy()
      });
    }
  }

  private onSupernaturalUpdate(data: { energy: number, max: number, active: boolean }): void {
    const fill = Math.max(0, Math.min(1, data.energy / data.max));
    this.abilityFill.setDisplaySize(HudScene.NITRO_FULL_WIDTH * fill, 16);
    
    if (data.active) {
      this.abilityLabel.setColor('#ffffff');
      this.abilityLabel.setText('VOID [F] ACT');
      this.abilityFill.fillColor = 0xffffff;
    } else if (fill >= 1) {
      this.abilityLabel.setColor('#8b5cf6');
      this.abilityLabel.setText('VOID [F] RDY');
      this.abilityFill.fillColor = 0x8b5cf6;
    } else {
      this.abilityLabel.setColor('#9a94b8');
      this.abilityLabel.setText('VOID');
      this.abilityFill.fillColor = 0x8b5cf6;
    }
  }

  /** Compact four-row classification, redrawn every frame from real standings. */
  private buildLeaderboard(x: number, y: number): void {
    const rowHeight = 26;
    const width = 230;
    const leaderboardBg = this.add.rectangle(x, y - 6, width, rowHeight * LEADER_ROWS + 10, 0x000000, 0.45).setOrigin(0, 0).setStrokeStyle(1, 0x333333);
    this.hudElements.push(leaderboardBg);

    for (let i = 0; i < LEADER_ROWS; i++) {
      const rowY = y + i * rowHeight + 10;
      const chip = this.add.rectangle(x + 12, rowY, 10, 10, 0xffffff, 1).setOrigin(0.5);
      const pos = this.add.text(x + 24, rowY, `${i + 1}`, { fontFamily: FONTS.mono, fontSize: '14px', color: '#9a94b8' }).setOrigin(0, 0.5);
      const name = this.add.text(x + 48, rowY, '', { fontFamily: FONTS.display, fontSize: '17px', color: '#ffffff' }).setOrigin(0, 0.5);
      this.leaderRows.push({ name, pos, chip });
      this.hudElements.push(chip, pos, name);
    }
  }

  /**
   * The card shown after lap 1 and lap 2.
   *
   * It reports the lap that was actually driven, the player's real position on
   * the road and how many laps are left, and it never blocks input: the race
   * keeps running underneath it, so the car keeps its place and the clock keeps
   * counting. The final lap does not use it -- that goes to the results screen.
   */
  private buildLapCard(): void {
    const { width, height } = GAME;
    const panelWidth = 420;
    const panelHeight = 176;
    const cx = width / 2;
    // Below the car, which the chase camera pins just under the screen centre.
    const cy = height / 2 + 128;

    const bg = this.add.rectangle(cx, cy, panelWidth, panelHeight, 0x000000, 0.72).setStrokeStyle(2, 0xff2e63);
    this.lapCardTitle = this.add.text(cx, cy - 58, 'LAP COMPLETE', {
      fontFamily: FONTS.display, fontSize: '34px', color: RED,
    }).setOrigin(0.5);
    this.lapCardTime = this.add.text(cx, cy - 8, '', {
      fontFamily: FONTS.mono, fontSize: '30px', color: '#ffffff',
    }).setOrigin(0.5);
    this.lapCardPosition = this.add.text(cx, cy + 30, '', {
      fontFamily: FONTS.mono, fontSize: '17px', color: '#b8a6ff',
    }).setOrigin(0.5);
    this.lapCardRemaining = this.add.text(cx, cy + 60, '', {
      fontFamily: FONTS.display, fontSize: '20px', color: '#ffffff',
    }).setOrigin(0.5);

    this.lapCard = this.add
      .container(cx, cy, [bg, this.lapCardTitle, this.lapCardTime, this.lapCardPosition, this.lapCardRemaining])
      .setAlpha(0)
      .setVisible(false);
  }

  /** The pause card. Everything else stays put behind it. */
  private buildPauseCard(): void {
    const { width, height } = GAME;
    const cx = width / 2;
    const cy = height / 2;

    const bg = this.add.rectangle(cx, cy, 360, 132, 0x000000, 0.78).setStrokeStyle(2, 0xffffff);
    const title = this.add.text(cx, cy - 24, 'PAUSED', {
      fontFamily: FONTS.display, fontSize: '52px', color: '#ffffff',
    }).setOrigin(0.5);
    const hint = this.add.text(cx, cy + 30, 'P RESUME  ·  R RESTART  ·  ESC QUIT', {
      fontFamily: FONTS.mono, fontSize: '15px', color: '#b8a6ff',
    }).setOrigin(0.5);

    this.pauseCard = this.add.container(cx, cy, [bg, title, hint]).setAlpha(0).setVisible(false);
  }

  /**
   * Fades a card in or out, remembering whether it is logically up so a burst
   * of identical frames cannot restart the tween every frame.
   */
  private setCard(container: Phaser.GameObjects.Container, field: 'lapCardUp' | 'pauseCardUp', up: boolean): void {
    if (this[field] === up) return;
    this[field] = up;
    this.tweens.killTweensOf(container);
    container.setVisible(true);
    this.tweens.add({
      targets: container,
      alpha: up ? 1 : 0,
      duration: up ? 220 : 320,
      ease: 'Power2',
      onComplete: () => { if (!up) container.setVisible(false); },
    });
  }

  private onUpdate(data: HudPayload): void {
    this.trackIntroOverlay.update(data.introRemainingMs, data.state);

    const over = data.state === 'finished' || data.state === 'failed';
    const paused = data.state === 'paused';
    // A lap transition is a live race with a card over it, so the HUD keeps
    // behaving exactly as it does while `racing`.
    const driving = data.state === 'racing' || data.state === 'lapTransition';

    if (data.state !== 'intro' && !over && !this.hudVisible) {
      this.hudVisible = true;
      this.tweens.add({
        targets: this.hudElements,
        alpha: 1,
        duration: 800,
        ease: 'Power2'
      });
    } else if (over && this.hudVisible) {
      this.hudVisible = false;
      this.tweens.add({
        targets: this.hudElements,
        alpha: 0,
        duration: 800,
        ease: 'Power2'
      });
    }

    // A lap banked gets a brief pulse on the counter itself rather than a
    // full-screen notification, and the race never pauses for it.
    if (driving && data.playerLap > this.lastLap) {
      this.animateLapChange();
    }
    this.lastLap = data.playerLap;

    this.updateLapCard(data);
    this.setCard(this.pauseCard, 'pauseCardUp', paused && !over);

    // A Time Trial has no field, so it has no position and no classification to
    // show. Drawing `P1 / 1` would be inventing a race the player did not run,
    // so both are hidden and the best lap takes their place instead.
    if (data.isTimeTrial) {
      this.posText.setText('');
      this.bestLapLabel.setVisible(true);
      this.bestLapText.setVisible(true);
      this.bestLapText.setText(data.bestLapMs === null ? '--:--.---' : formatRaceTime(data.bestLapMs));
      this.bestLapText.setColor(data.bestLapMs === null ? '#7a7590' : '#b8a6ff');
    } else {
      this.posText.setText(`P${data.playerPosition} / ${data.standings.length}`);
      this.bestLapLabel.setVisible(false);
      this.bestLapText.setVisible(false);
    }

    this.lapText.setText(`LAP ${data.playerLap} / ${data.totalLaps}`);
    this.timeText.setText(`TIME ${formatRaceTime(data.finalTimeMs ?? data.elapsedMs)}`);
    this.speedText.setText(`${String(data.speedKmh).padStart(3, '0')}`);
    this.muteText.setText(data.muted ? 'AUDIO OFF  [M]' : 'AUDIO ON  [M]');
    this.muteText.setColor(data.muted ? '#ff5c8a' : '#7a7590');

    // One leaderboard row in a Time Trial would be a classification of one car,
    // which is the same invented-race problem as the position readout.
    this.updateLeaderboard(data.isTimeTrial ? [] : data.standings);

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
    } else if (driving && data.elapsedMs < 800) {
      this.centerText.setText('GO!');
      this.centerText.setColor('#ffffff');
      this.centerText.setStroke(RED, 6);
    } else {
      this.centerText.setText('');
    }

    // We no longer show the giant banner in Phaser.
    // The React overlay handles the "RACE COMPLETE" and "YOU FAILED" screens!
    this.banner.setVisible(false);
  }

  /**
   * The lap-completed card, driven entirely by what the session actually
   * recorded: the lap time, the live position over the cars on the grid, and
   * the laps still to run. Null data hides it, which is what happens after the
   * final lap, when the results screen takes over instead.
   */
  private updateLapCard(data: HudPayload): void {
    const lap = data.lapTransition;
    const up = lap !== null && data.state !== 'finished' && data.state !== 'failed';
    this.setCard(this.lapCard, 'lapCardUp', up);
    if (!lap) return;

    this.lapCardTitle.setText(
      lap.completedLap >= lap.totalLaps ? 'FINAL LAP' : 'LAP COMPLETE',
    );
    this.lapCardTime.setText(`LAP ${lap.completedLap}  ${formatRaceTime(lap.lapTimeMs)}`);
    // Solo races have no position to report, and the fastest lap so far is the
    // number a Time Trial player actually cares about at this moment.
    const bestText = lap.bestLapMs === null ? '' : `   ·   BEST  ${formatRaceTime(lap.bestLapMs)}`;
    this.lapCardPosition.setText(
      data.isTimeTrial ? `${bestText.trim() || 'SOLO RUN'}` : `POSITION  P${lap.position} / ${lap.fieldSize}${bestText}`,
    );
    this.lapCardRemaining.setText(
      lap.lapsRemaining <= 1 ? 'FINAL LAP NEXT' : `LAPS REMAINING  ${lap.lapsRemaining}`,
    );
  }

  /**
   * Brief highlight on the lap counter when a lap is completed. Scale-pulse and
   * a colour flash only; it never blocks input or pauses the race.
   */
  private animateLapChange(): void {
    this.tweens.killTweensOf(this.lapText);
    this.lapText.setScale(1).setColor('#ff5c8a');
    this.tweens.add({
      targets: this.lapText,
      scale: { from: 1.35, to: 1 },
      duration: 420,
      ease: 'Back.easeOut',
    });
    this.time.delayedCall(480, () => this.lapText.setColor('#ffffff'));
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