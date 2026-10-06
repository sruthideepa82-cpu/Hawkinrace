import Phaser from 'phaser';

export class VecnaEntity extends Phaser.GameObjects.Container {
  private head: Phaser.GameObjects.Graphics;
  private torso: Phaser.GameObjects.Graphics;
  private cloak: Phaser.GameObjects.Graphics;
  private vines: Phaser.GameObjects.Graphics[] = [];
  
  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y);
    
    // Atmospheric red glow behind Vecna
    const glow = scene.add.graphics();
    glow.fillStyle(0xff1133, 0.15);
    glow.fillCircle(0, -60, 150);
    glow.setBlendMode(Phaser.BlendModes.ADD);
    this.add(glow);

    // Deep shadow under Vecna
    const shadow = scene.add.graphics();
    shadow.fillStyle(0x050002, 0.8);
    shadow.fillEllipse(0, 50, 100, 30);
    this.add(shadow);

    // Cloak/body reacting to wind
    this.cloak = scene.add.graphics();
    this.cloak.fillStyle(0x0a0508, 1.0);
    this.cloak.lineStyle(2, 0x440011, 0.8); // Crimson rim light
    this.cloak.beginPath();
    this.cloak.moveTo(0, -100);
    this.cloak.lineTo(-40, 20);
    this.cloak.lineTo(-30, 80);
    this.cloak.lineTo(30, 80);
    this.cloak.lineTo(40, 20);
    this.cloak.closePath();
    this.cloak.fillPath();
    this.cloak.strokePath();
    this.add(this.cloak);

    // Torso (breathing animation)
    this.torso = scene.add.graphics();
    this.torso.fillStyle(0x1a0a11, 1.0);
    this.torso.lineStyle(1, 0xff2244, 0.6); // Red highlights
    this.torso.fillRect(-25, -100, 50, 120);
    this.torso.strokeRect(-25, -100, 50, 120);
    this.add(this.torso);

    // Head (turns toward player)
    this.head = scene.add.graphics();
    this.head.fillStyle(0x0a0508, 1.0);
    this.head.lineStyle(2, 0xff2244, 0.9);
    this.head.fillCircle(0, -120, 20);
    this.head.strokeCircle(0, -120, 20);
    this.add(this.head);

    // Moving vines around him
    for (let i = 0; i < 4; i++) {
      const vine = scene.add.graphics();
      vine.lineStyle(4, 0x110005, 1.0);
      this.add(vine);
      this.vines.push(vine);
    }

    // Set up breathing and ambient animations
    scene.tweens.add({
      targets: this.torso,
      scaleX: 1.05,
      scaleY: 1.02,
      y: -2,
      duration: 2500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    scene.tweens.add({
      targets: this.cloak,
      skewX: 0.05,
      duration: 3000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    // Lightning flash effect
    const lightning = scene.add.graphics();
    lightning.fillStyle(0xffffff, 0.8);
    lightning.fillCircle(0, -60, 400);
    lightning.setBlendMode(Phaser.BlendModes.ADD);
    lightning.setAlpha(0);
    this.add(lightning);

    // Flash at 3.5s and 4.2s (elapsed times during intro)
    scene.time.delayedCall(3500, () => {
      lightning.setAlpha(1);
      scene.tweens.add({ targets: lightning, alpha: 0, duration: 200, ease: 'Power2' });
    });
    scene.time.delayedCall(3700, () => {
      lightning.setAlpha(0.6);
      scene.tweens.add({ targets: lightning, alpha: 0, duration: 400, ease: 'Power2' });
    });
    scene.time.delayedCall(4200, () => {
      lightning.fillStyle(0xff1133, 0.9);
      lightning.fillCircle(0, -60, 600);
      lightning.setAlpha(1);
      scene.tweens.add({ targets: lightning, alpha: 0, duration: 300, ease: 'Power2' });
    });
    
    // Depth setup so he stands among the trees
    this.setDepth(4); // Above track, below particles
    scene.add.existing(this);
  }

  override update(time: number, elapsed: number) {
    // Redraw vines twisting slowly
    this.vines.forEach((vine, i) => {
      vine.clear();
      vine.lineStyle(4, 0x110005, 1.0);
      vine.beginPath();
      let vx = (i % 2 === 0 ? 30 : -30) + Math.sin(time / 1000 + i) * 10;
      let vy = 80;
      vine.moveTo(vx, vy);
      for (let j = 0; j < 3; j++) {
        vx += (Math.sin(time / 800 + i + j) * 15) * (i % 2 === 0 ? 1 : -1);
        vy -= 40 + Math.cos(time / 1200) * 10;
        vine.lineTo(vx, vy);
      }
      vine.strokePath();
    });

    // At 3.0s (elapsed = 3000), head slowly turns toward player
    if (elapsed > 2500 && elapsed < 4000) {
      const p = (elapsed - 2500) / 1500;
      const ease = 1 - Math.pow(1 - p, 3);
      this.head.x = ease * 15; // Shift head right
      this.head.scaleX = 1 - ease * 0.2; // Slightly narrow to fake rotation
    } else if (elapsed >= 4000) {
      this.head.x = 15;
      this.head.scaleX = 0.8;
    }
  }
}
