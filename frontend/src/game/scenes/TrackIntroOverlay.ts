import Phaser from 'phaser';
import { FONTS, GAME } from '../config/GameConfig';
import { getTrackDefinition } from '../config/tracks';
import type { RaceBridge } from '../bridge';

export class TrackIntroOverlay {
  private container: Phaser.GameObjects.Container;
  private trackNameText: Phaser.GameObjects.Text;
  private trackNumberText: Phaser.GameObjects.Text;
  private difficultyText: Phaser.GameObjects.Text;
  private conditionText: Phaser.GameObjects.Text;
  
  private isShown = false;
  private bridge: RaceBridge;
  
  constructor(private scene: Phaser.Scene, bridge: RaceBridge) {
    this.bridge = bridge;
    const { height } = GAME;
    
    // Position in lower left third
    const paddingX = 80;
    const paddingY = height - 160;

    // Track Name
    this.trackNameText = scene.add.text(paddingX, paddingY, '', {
      fontFamily: FONTS.display,
      fontSize: '56px',
      color: '#ffffff',
      fontStyle: 'bold'
    }).setOrigin(0, 1).setAlpha(0);

    // Track Number (small overlay above track name)
    this.trackNumberText = scene.add.text(paddingX, paddingY - 56, 'TRACK 01', {
      fontFamily: FONTS.mono,
      fontSize: '16px',
      color: '#ff2e63',
      letterSpacing: 2
    }).setOrigin(0, 1).setAlpha(0);

    // Divider line
    const divider = scene.add.rectangle(paddingX, paddingY + 10, 300, 2, 0xffffffff, 0.2).setOrigin(0, 0).setAlpha(0);

    // Difficulty
    this.difficultyText = scene.add.text(paddingX, paddingY + 25, '', {
      fontFamily: FONTS.mono,
      fontSize: '14px',
      color: '#ff2e63',
      letterSpacing: 1,
      fontStyle: 'bold'
    }).setOrigin(0, 0).setAlpha(0);

    // Environment condition
    this.conditionText = scene.add.text(paddingX, paddingY + 45, '', {
      fontFamily: FONTS.mono,
      fontSize: '14px',
      color: '#9a94b8',
      letterSpacing: 1
    }).setOrigin(0, 0).setAlpha(0);

    this.container = scene.add.container(0, 0, [
      this.trackNameText, this.trackNumberText, divider, 
      this.difficultyText, this.conditionText
    ]).setDepth(200).setVisible(true);

    this.container.getAll().forEach(child => {
        (child as Phaser.GameObjects.GameObject & { x: number }).x -= 50; // start slightly offset
    });
  }

  update(introRemainingMs: number, state: string) {
    if (state === 'intro' && !this.isShown && introRemainingMs < 3000) {
      this.show();
    } else if (state !== 'intro' && this.isShown) {
      this.hide();
    }
  }

  private show() {
    this.isShown = true;
    const track = getTrackDefinition(this.bridge.config.trackId);
    
    // Assign generic track numbers based on some hash or simple id mapping
    let trackNum = '01';
    if (track.id.includes('forest')) trackNum = '02';
    if (track.id.includes('lab')) trackNum = '03';
    if (track.id.includes('upside-down')) trackNum = '05';

    this.trackNameText.setText(track.name.toUpperCase());
    this.trackNumberText.setText(`TRACK ${trackNum}`);
    
    // Map difficulty
    let difficulty = 'MEDIUM';
    if (track.id === 'upside-down') difficulty = 'EXTREME';
    if (track.id === 'hawkins-lab') difficulty = 'HARD';
    this.difficultyText.setText(difficulty);

    // Condition
    let condition = 'CLEAR NIGHT';
    if (track.id === 'hawkins-streets') condition = 'NIGHT RACE';
    if (track.id === 'upside-down') condition = 'ANTI-GRAVITY CIRCUIT';
    if (track.id === 'hawkins-forest') condition = 'FOREST RALLY';
    this.conditionText.setText(condition);

    // Animate in
    this.scene.tweens.add({
      targets: this.container.getAll(),
      alpha: 1,
      x: '+=50',
      duration: 800,
      ease: 'Power2',
      delay: (_target: any, _targetKey: string, _value: number, targetIndex: number) => targetIndex * 100 // stagger text appearance
    });
  }

  private hide() {
    this.isShown = false;
    this.scene.tweens.add({
      targets: this.container.getAll(),
      alpha: 0,
      x: '+=20',
      duration: 400,
      ease: 'Power2'
    });
  }
}
