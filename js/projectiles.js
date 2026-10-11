'use strict';

/* ============================================================
   Projectile
   Utilisé pour les tirs du joueur ET des ennemis (owner sert
   à distinguer les collisions dans game.js).
============================================================ */
class Projectile {
  constructor(x, y, vx, vy, damage, isCrit, pierce, color, radius, owner) {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.damage = damage;
    this.isCrit = isCrit;
    this.pierce = pierce || 0;
    this.color = color || '#00f2ff';
    this.radius = radius || 5;
    this.dead = false;
    this.traveled = 0;
    this.maxRange = 900;
    this.hitEnemies = new Set();
    this.owner = owner || 'player';
    this.trail = [];
  }

  update(dt) {
    this.trail.push({ x: this.x, y: this.y });
    if (this.trail.length > 6) this.trail.shift();
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.traveled += Math.hypot(this.vx * dt, this.vy * dt);
    if (this.traveled > this.maxRange) this.dead = true;
  }

  draw(ctx, camX, camY) {
    ctx.save();
    for (let i = 0; i < this.trail.length; i++) {
      const p = this.trail[i];
      ctx.globalAlpha = (i / this.trail.length) * 0.35;
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.arc(p.x - camX, p.y - camY, this.radius * 0.7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 12;
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x - camX, this.y - camY, this.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.restore();
  }
}

/* ============================================================
   Missile (téléguidé, utilisé par abilities.js)
============================================================ */
class Missile {
  constructor(x, y, target, damage, speed, radius) {
    this.x = x; this.y = y;
    this.target = target;
    this.damage = damage;
    this.speed = speed || 380;
    this.radius = radius || 60;
    this.dead = false;
  }
  draw(ctx, camX, camY) {
    ctx.save();
    ctx.fillStyle = '#ff6644';
    ctx.shadowColor = '#ff6644';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(this.x - camX, this.y - camY, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
