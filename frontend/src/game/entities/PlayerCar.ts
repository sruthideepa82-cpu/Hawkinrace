import Phaser from 'phaser';
import type { RaceCarConfig } from '../bridge';
import { getCarTuning } from '../config/carTuning';
import { CAR } from '../config/GameConfig';
import { CarPhysics } from './CarPhysics';

/** Phaser view of the player's car. Swap the texture for artwork later. */
export class PlayerCar {
  readonly physics: CarPhysics;
  readonly sprite: Phaser.GameObjects.Image;

  private brakeLights!: Phaser.GameObjects.Graphics;
  private tireMarks!: Phaser.GameObjects.RenderTexture;
  /** Reusable dots stamped into `tireMarks` (created once, never per frame). */
  private tireDots: Phaser.GameObjects.Arc[] = [];
  private exhaustEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor(scene: Phaser.Scene, car: RaceCarConfig, worldWidth: number, worldHeight: number) {
    this.physics = new CarPhysics(getCarTuning(car.id));
    const key = PlayerCar.ensureTexture(scene, car);
    
    // Tire marks layer (persists)
    this.tireMarks = scene.add.renderTexture(0, 0, worldWidth, worldHeight).setDepth(2);
    this.tireDots = [
      scene.add.circle(0, 0, 3, 0x111111, 0.1).setVisible(false),
      scene.add.circle(0, 0, 3, 0x111111, 0.1).setVisible(false),
    ];
    
    this.sprite = scene.add.image(0, 0, key).setDepth(10);
    
    // Brake lights overlay
    this.brakeLights = scene.add.graphics().setDepth(11);
    
    // Exhaust particles
    const particles = scene.add.particles(0, 0, 'car-night-runner', { // just use any valid key or a simple dot
      scale: { start: 0.2, end: 0 },
      alpha: { start: 0.5, end: 0 },
      speed: 20,
      lifespan: 400,
      blendMode: 'ADD',
      emitting: false
    });
    this.exhaustEmitter = particles;
    this.exhaustEmitter.setDepth(9);
  }

  // Ensure particle texture exists
  private static ensureParticle(scene: Phaser.Scene) {
    if (!scene.textures.exists('particle-dot')) {
      const g = scene.add.graphics();
      g.fillStyle(0xffffff, 1).fillCircle(4, 4, 4);
      g.generateTexture('particle-dot', 8, 8);
      g.destroy();
    }
  }

  private static ensureTexture(scene: Phaser.Scene, car: RaceCarConfig): string {
    PlayerCar.ensureParticle(scene);
    const key = `car-${car.id}`;
    if (scene.textures.exists(key)) return key;
    const { width: w, height: h } = CAR;
    const g = scene.add.graphics();
    
    const pad = 10;
    const color = car.color;
    
    // Shadow
    g.fillStyle(0x000000, 0.6).fillRoundedRect(pad - 4, pad + 4, w + 8, h + 8, 8);

    // Body glow
    g.fillStyle(color, 0.3).fillRoundedRect(pad - 5, pad - 5, w + 10, h + 10, 10);
    
    // Wheels
    g.fillStyle(0x111111);
    g.fillRoundedRect(pad + w * 0.15, pad - 2, w * 0.2, h + 4, 2);
    g.fillRoundedRect(pad + w * 0.65, pad - 2, w * 0.2, h + 4, 2);

    g.fillStyle(color);
    
    // Main Body based on ID
    if (car.id === 'night-runner') {
      g.fillPoints([{x: pad, y: pad + 4}, {x: pad + w, y: pad + 8}, {x: pad + w + 4, y: pad + h/2}, {x: pad + w, y: pad + h - 8}, {x: pad, y: pad + h - 4}], true);
      g.fillStyle(0x050505).fillPoints([{x: pad + w*0.4, y: pad + 4}, {x: pad + w*0.6, y: pad + 6}, {x: pad + w*0.6, y: pad + h - 6}, {x: pad + w*0.4, y: pad + h - 4}], true); 
    } else if (car.id === 'hawk-xr') {
      g.fillRoundedRect(pad, pad - 2, w, h + 4, 4);
      g.fillStyle(0x111111).fillRect(pad + w*0.2, pad - 2, w*0.6, h + 4);
      g.fillStyle(0xffffff).fillRect(pad + 5, pad + h/2 - 2, w - 10, 4); 
      g.fillStyle(0x050505).fillRect(pad + w * 0.45, pad - 2, w * 0.15, h + 4); 
    } else {
      g.fillRoundedRect(pad, pad, w, h, 8);
      g.fillStyle(0x000000, 0.2).fillRect(pad + w * 0.2, pad, w * 0.6, h);
      g.fillStyle(0x050505).fillRoundedRect(pad + w * 0.45, pad + 2, w * 0.2, h - 4, 2); 
      g.fillRoundedRect(pad + w * 0.15, pad + 4, w * 0.1, h - 8, 2); 
    }

    g.fillStyle(0xfff2b0, 0.5).fillCircle(pad + w, pad + h * 0.2, 10).fillCircle(pad + w, pad + h * 0.8, 10);
    g.fillStyle(0xffffff).fillRect(pad + w - 4, pad + h * 0.15, 4, h * 0.15).fillRect(pad + w - 4, pad + h * 0.7, 4, h * 0.15);
    
    g.fillStyle(0xff0000, 0.6).fillCircle(pad, pad + h * 0.2, 8).fillCircle(pad, pad + h * 0.8, 8);
    g.fillStyle(0xff2e63).fillRect(pad, pad + h * 0.15, 3, h * 0.15).fillRect(pad, pad + h * 0.7, 3, h * 0.15);
    
    g.generateTexture(key, w + 20, h + 20);
    g.destroy();
    return key;
  }

  sync(isBraking: boolean = false, isAccelerating: boolean = false, speed: number = 0): void {
    this.sprite.setPosition(this.physics.x, this.physics.y).setRotation(this.physics.heading);
    
    // Exhaust
    if (isAccelerating && speed < 150) {
      this.exhaustEmitter.setTexture('particle-dot');
      this.exhaustEmitter.setPosition(
        this.physics.x - Math.cos(this.physics.heading) * 20,
        this.physics.y - Math.sin(this.physics.heading) * 20
      );
      this.exhaustEmitter.emitParticle(1);
    }

    // Brake lights
    this.brakeLights.clear();
    if (isBraking) {
      const bx = this.physics.x - Math.cos(this.physics.heading) * 15;
      const by = this.physics.y - Math.sin(this.physics.heading) * 15;
      const p1x = bx - Math.sin(this.physics.heading) * 8;
      const p1y = by + Math.cos(this.physics.heading) * 8;
      const p2x = bx + Math.sin(this.physics.heading) * 8;
      const p2y = by - Math.cos(this.physics.heading) * 8;

      this.brakeLights.fillStyle(0xff0000, 0.9).fillCircle(p1x, p1y, 6).fillCircle(p2x, p2y, 6);
      this.brakeLights.fillStyle(0xffaaaa, 0.6).fillCircle(p1x, p1y, 12).fillCircle(p2x, p2y, 12);
      
      // Tire marks
      if (speed > 50) {
        this.tireDots[0].setPosition(p1x, p1y);
        this.tireDots[1].setPosition(p2x, p2y);
        this.tireMarks.draw(this.tireDots);
      }
    }
  }
}
