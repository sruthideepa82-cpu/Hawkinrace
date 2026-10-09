import Phaser from 'phaser';
import type { TrackLayout } from '../entities/TrackLayout';
import type { Racer } from './RaceSession';
import { GAME_EVENTS } from '../config/GameConfig';

export class SupernaturalSystem {
  private energy = 0;
  private readonly maxEnergy = 5;
  private abilityActive = false;
  private abilityTimer = 0;
  
  private takeoverActive = false;
  private takeoverTimer = 0;
  
  private signals: { x: number; y: number; active: boolean; sprite: Phaser.GameObjects.Arc }[] = [];

  constructor(private scene: Phaser.Scene, layout: TrackLayout, private player: Racer) {
    const points = layout.definition.controlPoints;
    for (let i = 0; i < points.length; i++) {
      this.signals.push({
        x: points[i].x + (Math.random() - 0.5) * layout.roadWidth * 0.5,
        y: points[i].y + (Math.random() - 0.5) * layout.roadWidth * 0.5,
        active: true,
        sprite: scene.add.circle(0, 0, 15, 0x8b5cf6).setDepth(2).setBlendMode(Phaser.BlendModes.ADD)
      });
    }
    
    this.signals.forEach(s => {
      s.sprite.x = s.x;
      s.sprite.y = s.y;
    });

    scene.time.delayedCall(100, () => {
      scene.game.events.emit(GAME_EVENTS.supernaturalUpdate, { energy: 0, max: this.maxEnergy, active: false });
    });
  }

  update(dt: number, time: number, inputAbility: boolean) {
    const px = this.player.physics.x;
    const py = this.player.physics.y;
    
    for (const sig of this.signals) {
      if (sig.active) {
        sig.sprite.setScale(1 + Math.sin(time * 0.005) * 0.2);
        
        const dist = Math.hypot(sig.x - px, sig.y - py);
        if (dist < 80) {
          sig.active = false;
          sig.sprite.setVisible(false);
          
          if (this.energy < this.maxEnergy) {
            this.energy++;
            this.scene.game.events.emit(GAME_EVENTS.supernaturalUpdate, { energy: this.energy, max: this.maxEnergy, active: this.abilityActive });
          }
        }
      }
    }

    if (inputAbility && this.energy >= this.maxEnergy && !this.abilityActive) {
      this.energy = 0;
      this.abilityActive = true;
      this.abilityTimer = 4.0; 
      this.scene.game.events.emit(GAME_EVENTS.supernaturalUpdate, { energy: this.energy, max: this.maxEnergy, active: true });
      this.scene.game.events.emit(GAME_EVENTS.supernaturalEvent, { type: 'ability_start' });
    }

    if (this.abilityActive) {
      this.abilityTimer -= dt;
      if (this.abilityTimer <= 0) {
        this.abilityActive = false;
        this.scene.game.events.emit(GAME_EVENTS.supernaturalUpdate, { energy: this.energy, max: this.maxEnergy, active: false });
        this.scene.game.events.emit(GAME_EVENTS.supernaturalEvent, { type: 'ability_end' });
      }
    }

    if (!this.takeoverActive && this.player.laps.totalRaceProgress > 0.05) {
      this.takeoverTimer += dt;
      if (this.takeoverTimer > 30) {
        this.takeoverActive = true;
        this.scene.game.events.emit(GAME_EVENTS.supernaturalEvent, { type: 'takeover_start' });
      }
    }
  }

  get abilityBoost() {
    return this.abilityActive ? 1.6 : 1.0;
  }
}
