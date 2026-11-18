// Particles, skid marks, floating cash text and screen shake for Port Meridian.

import { clamp } from './util.js';

export class Effects {
  constructor() {
    this.particles = [];
    this.skids = [];
    this.floaters = [];
    this.shake = 0;
    this.flash = 0;
  }

  burst(x, y, color, count, speed, life, size) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = (0.3 + Math.random() * 0.7) * speed;
      this.particles.push({
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: life * (0.5 + Math.random() * 0.7),
        maxLife: life,
        color,
        size: size * (0.6 + Math.random() * 0.8),
      });
    }
    if (this.particles.length > 700) this.particles.splice(0, this.particles.length - 700);
  }

  sparks(x, y) {
    this.burst(x, y, '#ffd76a', 10, 190, 0.35, 3);
  }

  smoke(x, y, dark) {
    this.burst(x, y, dark ? 'rgba(40,40,44,0.55)' : 'rgba(210,210,210,0.5)', 2, 36, 0.9, 8);
  }

  muzzle(x, y, angle) {
    this.burst(x, y, '#ffb347', 5, 150, 0.12, 3.5);
    this.particles.push({
      x: x + Math.cos(angle) * 12,
      y: y + Math.sin(angle) * 12,
      vx: Math.cos(angle) * 60,
      vy: Math.sin(angle) * 60,
      life: 0.07,
      maxLife: 0.07,
      color: '#fff3b0',
      size: 8,
    });
  }

  bloodPuff(x, y) {
    this.burst(x, y, 'rgba(178, 44, 44, 0.8)', 7, 90, 0.4, 3.5);
  }

  splashCash(x, y, text) {
    this.burst(x, y, '#8fe388', 8, 110, 0.6, 3);
    this.floaters.push({ x, y, text, life: 1.4, color: '#9df29a' });
  }

  floater(x, y, text, color) {
    this.floaters.push({ x, y, text, life: 1.6, color: color || '#ffffff' });
  }

  addSkid(x, y) {
    this.skids.push({ x, y, life: 9 });
    if (this.skids.length > 420) this.skids.splice(0, this.skids.length - 420);
  }

  addShake(amount) {
    this.shake = Math.min(16, this.shake + amount);
  }

  damageFlash() {
    this.flash = 0.55;
  }

  update(dt) {
    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.94;
      p.vy *= 0.94;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const s of this.skids) s.life -= dt;
    this.skids = this.skids.filter((s) => s.life > 0);
    for (const f of this.floaters) {
      f.life -= dt;
      f.y -= 34 * dt;
    }
    this.floaters = this.floaters.filter((f) => f.life > 0);
    this.shake = Math.max(0, this.shake - dt * 26);
    this.flash = Math.max(0, this.flash - dt * 1.4);
  }

  drawWorld(ctx) {
    ctx.fillStyle = 'rgba(24, 24, 28, 0.5)';
    for (const s of this.skids) {
      ctx.globalAlpha = clamp(s.life / 9, 0, 0.5);
      ctx.beginPath();
      ctx.arc(s.x, s.y, 3.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (const p of this.particles) {
      ctx.globalAlpha = clamp(p.life / p.maxLife, 0, 1);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (const f of this.floaters) {
      ctx.globalAlpha = clamp(f.life, 0, 1);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }

  drawScreenFlash(ctx, w, h) {
    if (this.flash <= 0) return;
    ctx.fillStyle = 'rgba(190, 30, 30,' + (this.flash * 0.35).toFixed(3) + ')';
    ctx.fillRect(0, 0, w, h);
  }

  shakeOffset() {
    if (this.shake <= 0) return { x: 0, y: 0 };
    return {
      x: (Math.random() * 2 - 1) * this.shake,
      y: (Math.random() * 2 - 1) * this.shake,
    };
  }
}
