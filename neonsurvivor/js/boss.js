'use strict';

/* ============================================================
   BOSS_DEFS
   Chaque type de boss a un comportement distinct implémenté
   dans attackPattern(). Golem = lent/puissant, Mutant =
   rapide/agressif, Machine = tire beaucoup de projectiles.
============================================================ */
const BOSS_TYPES = ['golem', 'mutant', 'machine'];

class Boss extends Enemy {
  constructor(x, y, tier, bossType) {
    super('grunt', x, y, 1);
    this.type = 'boss';
    this.bossType = bossType || BOSS_TYPES[(tier - 1) % BOSS_TYPES.length];
    this.tier = tier;

    const names = { golem: 'GOLEM DE PIERRE', mutant: 'MUTANT DÉCHAÎNÉ', machine: 'MACHINE DE GUERRE' };
    this.name = names[this.bossType] + ' (Rang ' + tier + ')';

    if (this.bossType === 'golem') {
      this.maxHp = 1100 * Math.pow(1.35, tier - 1);
      this.speed = 45;
      this.damage = 30 * Math.pow(1.15, tier - 1);
      this.radius = 46;
      this.color = '#8d6e63';
      this.attackInterval = [2.2, 3.0];
    } else if (this.bossType === 'mutant') {
      this.maxHp = 750 * Math.pow(1.35, tier - 1);
      this.speed = 140;
      this.damage = 22 * Math.pow(1.15, tier - 1);
      this.radius = 36;
      this.color = '#8bc34a';
      this.attackInterval = [1.2, 1.8];
    } else {
      this.maxHp = 850 * Math.pow(1.35, tier - 1);
      this.speed = 70;
      this.damage = 18 * Math.pow(1.15, tier - 1);
      this.radius = 40;
      this.color = '#ff5252';
      this.attackInterval = [1.5, 2.2];
    }

    this.hp = this.maxHp;
    this.xpValue = 120;
    this.attackTimer = 2;
    this.creditReward = 80 * tier;
    this.summonTimer = 8;
  }

  update(dt, player, ctxGame) {
    if (this.hitFlash > 0) this.hitFlash -= dt;
    const d = dist(this.x, this.y, player.x, player.y);
    const angle = Math.atan2(player.y - this.y, player.x - this.x);
    const spd = devManager.modifyEnemySpeed(this.speed);

    if (this.bossType === 'mutant') {
      // Fonce agressivement, ne s'arrête presque jamais
      if (d > 60) {
        this.x += Math.cos(angle) * spd * dt;
        this.y += Math.sin(angle) * spd * dt;
      }
    } else {
      if (d > 140) {
        this.x += Math.cos(angle) * spd * dt;
        this.y += Math.sin(angle) * spd * dt;
      }
    }

    this.attackTimer -= dt;
    if (this.attackTimer <= 0) {
      this.attackPattern(player, ctxGame);
      this.attackTimer = rand(this.attackInterval[0], this.attackInterval[1]);
    }

    if (this.bossType === 'machine') {
      this.summonTimer -= dt;
      if (this.summonTimer <= 0) {
        this.summonMinions(ctxGame);
        this.summonTimer = 12;
      }
    }

    if (d < this.radius + player.radius && this.contactCooldown <= 0) {
      player.takeDamage(this.damage * 0.5);
      this.contactCooldown = 0.5;
    }
    if (this.contactCooldown > 0) this.contactCooldown -= dt;
  }

  attackPattern(player, ctxGame) {
    if (this.bossType === 'golem') {
      // Onde circulaire lente mais dense
      const n = 12;
      for (let i = 0; i < n; i++) {
        const angle = (i / n) * Math.PI * 2;
        ctxGame.enemyProjectiles.push(new Projectile(this.x, this.y, Math.cos(angle) * 180, Math.sin(angle) * 180, this.damage * 0.35, false, 0, '#a1887f', 7, 'enemy'));
      }
    } else if (this.bossType === 'mutant') {
      // Charge de projectiles rapides directement vers le joueur
      const angle = Math.atan2(player.y - this.y, player.x - this.x);
      for (let i = -1; i <= 1; i++) {
        const a = angle + i * 0.25;
        ctxGame.enemyProjectiles.push(new Projectile(this.x, this.y, Math.cos(a) * 340, Math.sin(a) * 340, this.damage * 0.5, false, 0, '#c6ff00', 6, 'enemy'));
      }
    } else {
      // Machine: rafale dense de nombreux projectiles
      const n = 16;
      for (let i = 0; i < n; i++) {
        const angle = (i / n) * Math.PI * 2 + rand(-0.1, 0.1);
        ctxGame.enemyProjectiles.push(new Projectile(this.x, this.y, Math.cos(angle) * 260, Math.sin(angle) * 260, this.damage * 0.3, false, 0, '#ff8a3d', 5, 'enemy'));
      }
    }
    audioEngine.bossRoar();
  }

  summonMinions(ctxGame) {
    for (let i = 0; i < 3; i++) {
      const angle = rand(0, Math.PI * 2);
      const x = this.x + Math.cos(angle) * 80;
      const y = this.y + Math.sin(angle) * 80;
      const e = new Enemy('runner', x, y, 1 + ctxGame.run.elapsed / 60 * 0.15);
      ctxGame.enemies.push(e);
    }
    ctxGame.ui.showToast('La machine invoque des renforts !');
  }

  draw(ctx, camX, camY) {
    const x = this.x - camX, y = this.y - camY;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(x, y + this.radius * 0.8, this.radius, this.radius * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
    const flashColor = this.hitFlash > 0 ? '#fff' : this.color;
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 30;
    ctx.fillStyle = flashColor;
    ctx.beginPath();
    const spikes = 8;
    for (let i = 0; i < spikes * 2; i++) {
      const r = i % 2 === 0 ? this.radius : this.radius * 0.7;
      const a = (i / (spikes * 2)) * Math.PI * 2 + performance.now() * 0.0005;
      ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#ffd54f';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();

    if (devManager.unlocked && devManager.debugCollisions) {
      ctx.save();
      ctx.strokeStyle = '#ff00ff';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, this.radius, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
  }
}
