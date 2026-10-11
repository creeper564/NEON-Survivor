'use strict';

/* ============================================================
   Particle / FloatingText / effets visuels transitoires
============================================================ */
class Particle {
  constructor(x, y, vx, vy, life, color, size, gravity) {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.life = life; this.maxLife = life;
    this.color = color; this.size = size; this.gravity = gravity || 0;
    this.dead = false;
  }
  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.vy += this.gravity * dt;
    this.vx *= (1 - 1.5 * dt);
    this.vy *= (1 - 0.5 * dt);
    this.life -= dt;
    if (this.life <= 0) this.dead = true;
  }
  draw(ctx) {
    const a = clampNum(this.life / this.maxLife, 0, 1);
    ctx.globalAlpha = a;
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size * a, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

class FloatingText {
  constructor(x, y, text, color, size) {
    this.x = x; this.y = y; this.text = text;
    this.color = color || '#fff'; this.size = size || 14;
    this.life = 1.0; this.maxLife = 1.0; this.vy = -40;
    this.dead = false;
  }
  update(dt) {
    this.y += this.vy * dt;
    this.vy *= (1 - 1 * dt);
    this.life -= dt * 1.2;
    if (this.life <= 0) this.dead = true;
  }
  draw(ctx, camX, camY) {
    const a = clampNum(this.life / this.maxLife, 0, 1);
    ctx.globalAlpha = a;
    ctx.fillStyle = this.color;
    ctx.font = 'bold ' + this.size + 'px Arial';
    ctx.textAlign = 'center';
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 3;
    ctx.strokeText(this.text, this.x - camX, this.y - camY);
    ctx.fillText(this.text, this.x - camX, this.y - camY);
    ctx.globalAlpha = 1;
  }
}

/* ============================================================
   ParticleSystem
   Centralise particules, textes, explosions et éclairs pour
   que game.js n'ait pas à gérer des tableaux disparates.
============================================================ */
class ParticleSystem {
  constructor() {
    this.particles = [];
    this.texts = [];
    this.explosions = [];
    this.lightnings = [];
    this.maxParticles = LOW_FX ? 200 : 400;
  }

  spawnBurst(x, y, count, color, speedMin, speedMax, lifeMin, lifeMax, sizeMin, sizeMax) {
    for (let i = 0; i < count; i++) {
      const a = rand(0, Math.PI * 2);
      const s = rand(speedMin, speedMax);
      this.particles.push(new Particle(
        x, y, Math.cos(a) * s, Math.sin(a) * s,
        rand(lifeMin, lifeMax), color, rand(sizeMin, sizeMax)
      ));
    }
  }

  spawnText(x, y, text, color, size) {
    this.texts.push(new FloatingText(x, y, text, color, size));
  }

  spawnExplosionRing(x, y, radius, color) {
    this.explosions.push({ x, y, radius, life: 0.4, maxLife: 0.4, color });
    this.spawnBurst(x, y, 16, color, 100, 300, 0.3, 0.6, 2, 4);
  }

  spawnLightning(x1, y1, x2, y2) {
    this.lightnings.push({ x1, y1, x2, y2, life: 0.15, maxLife: 0.15 });
  }

  update(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.update(dt);
      if (p.dead) this.particles.splice(i, 1);
    }
    if (this.particles.length > this.maxParticles) {
      this.particles.splice(0, this.particles.length - this.maxParticles);
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.update(dt);
      if (t.dead) this.texts.splice(i, 1);
    }
    for (let i = this.explosions.length - 1; i >= 0; i--) {
      const e = this.explosions[i];
      e.life -= dt;
      if (e.life <= 0) this.explosions.splice(i, 1);
    }
    for (let i = this.lightnings.length - 1; i >= 0; i--) {
      const l = this.lightnings[i];
      l.life -= dt;
      if (l.life <= 0) this.lightnings.splice(i, 1);
    }
  }

  draw(ctx, camX, camY) {
    for (const p of this.particles) p.draw(ctx);
    for (const t of this.texts) t.draw(ctx, camX, camY);
    for (const ex of this.explosions) {
      const t = 1 - clampNum(ex.life / ex.maxLife, 0, 1);
      ctx.save();
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = ex.color;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(ex.x - camX, ex.y - camY, ex.radius * t, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    for (const l of this.lightnings) {
      ctx.save();
      ctx.globalAlpha = clampNum(l.life / l.maxLife, 0, 1);
      ctx.strokeStyle = '#fff59d';
      ctx.lineWidth = 3;
      ctx.shadowColor = '#fff59d';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.moveTo(l.x1 - camX, l.y1 - camY);
      const midx = (l.x1 + l.x2) / 2 + rand(-20, 20);
      const midy = (l.y1 + l.y2) / 2 + rand(-20, 20);
      ctx.lineTo(midx - camX, midy - camY);
      ctx.lineTo(l.x2 - camX, l.y2 - camY);
      ctx.stroke();
      ctx.restore();
    }
  }

  get counts() {
    return { particles: this.particles.length, texts: this.texts.length };
  }
}
