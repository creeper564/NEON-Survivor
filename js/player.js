'use strict';

/* ============================================================
   Player
   Gère position, statistiques, tir, XP/level up et rendu du
   personnage. Les capacités sont déléguées à AbilityManager.
============================================================ */
class Player {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.radius = 16;
    this.baseSpeed = 220;
    this.maxHp = 100 * (1 + profile.permanentUpgrades.hp * 0.05);
    this.hp = this.maxHp;
    this.level = 1;
    this.xp = 0;
    this.xpToNext = 10;
    this.weapon = new Weapon();
    this.abilities = {};
    this.xpPickupRadius = 90;
    this.regen = 0;
    this.armor = profile.permanentUpgrades.armor * 1.5;
    this.dodge = 0;
    this.speedMult = 1 + profile.permanentUpgrades.speed * 0.05;
    this.invulnTimer = 0;
    this.facingAngle = 0;
    this.hitFlash = 0;
    this.abilityManager = new AbilityManager(this);
  }

  get speed() {
    const base = this.baseSpeed * this.speedMult;
    return devManager.modifySpeed(base);
  }

  gainXP(v) {
    v = v * (1 + profile.permanentUpgrades.xpGain * 0.05);
    v = devManager.modifyXPGain(v);
    this.xp += v;
    game.run.totalXpGained += v;
    while (this.xp >= this.xpToNext) {
      this.xp -= this.xpToNext;
      this.levelUp();
    }
  }

  levelUp() {
    this.level++;
    this.xpToNext = Math.floor(this.xpToNext * 1.18 + 4);
    game.run.currentLevel = this.level;
    audioEngine.levelUp();
    game.requestLevelUpChoice();
  }

  takeDamage(amount) {
    if (devManager.isInvincible()) return;
    if (this.invulnTimer > 0) return;
    if (Math.random() < this.dodge) {
      game.particleSystem.spawnText(this.x, this.y - 30, 'ESQUIVE!', '#00e5ff', 14);
      return;
    }
    const reduced = Math.max(1, amount - this.armor);
    this.hp -= reduced;
    this.hitFlash = 0.15;
    this.invulnTimer = 0.35;
    game.particleSystem.spawnText(this.x, this.y - 30, '-' + Math.round(reduced), '#ff5555', 16);
    if (this.hp <= 0) {
      this.hp = 0;
      game.endRun();
    }
  }

  update(dt) {
    if (this.invulnTimer > 0) this.invulnTimer -= dt;
    if (this.hitFlash > 0) this.hitFlash -= dt;

    // Mouvement ZQSD (AZERTY), normalisé pour éviter diagonale plus rapide
    let dx = 0, dy = 0;
    if (Input.isDown('z') || Input.isDown('arrowup')) dy -= 1;
    if (Input.isDown('s') || Input.isDown('arrowdown')) dy += 1;
    if (Input.isDown('q') || Input.isDown('arrowleft')) dx -= 1;
    if (Input.isDown('d') || Input.isDown('arrowright')) dx += 1;
    const len = Math.hypot(dx, dy);
    if (len > 0) { dx /= len; dy /= len; }
    this.x += dx * this.speed * dt;
    this.y += dy * this.speed * dt;

    const half = game.ARENA_SIZE / 2;
    this.x = clampNum(this.x, -half + this.radius, half - this.radius);
    this.y = clampNum(this.y, -half + this.radius, half - this.radius);

    const worldMouseX = Input.mouseX + game.camX;
    const worldMouseY = Input.mouseY + game.camY;
    this.facingAngle = Math.atan2(worldMouseY - this.y, worldMouseX - this.x);

    if (this.regen > 0) this.hp = Math.min(this.maxHp, this.hp + this.regen * dt);

    this.weapon.cooldown -= dt;
    const wantFire = Input.mouseDown || game.autoFire || devManager.hasAutoFireCheat();
    if (wantFire && this.weapon.cooldown <= 0) {
      this.fire(worldMouseX, worldMouseY);
      this.weapon.cooldown = 1 / this.weapon.fireRate;
    }

    this.abilityManager.update(dt, game);
  }

  fire(targetX, targetY) {
    const baseAngle = Math.atan2(targetY - this.y, targetX - this.x);
    const n = this.weapon.count;
    const spread = n > 1 ? 0.12 * (n - 1) : 0;
    for (let i = 0; i < n; i++) {
      const t = n > 1 ? (i / (n - 1)) : 0.5;
      const angle = baseAngle - spread / 2 + spread * t;
      const isCrit = Math.random() < this.weapon.crit;
      const dmg = this.weapon.damage * (isCrit ? this.weapon.critMult : 1);
      const vx = Math.cos(angle) * this.weapon.speed;
      const vy = Math.sin(angle) * this.weapon.speed;
      const p = new Projectile(this.x, this.y, vx, vy, dmg, isCrit, this.weapon.pierce, '#00f2ff', 5, 'player');
      p.maxRange = this.weapon.rangeVal;
      game.projectiles.push(p);
    }
    audioEngine.shoot();
    for (let i = 0; i < 3; i++) {
      game.particleSystem.particles.push(new Particle(this.x, this.y, rand(-40, 40), rand(-40, 40), 0.2, '#00f2ff', 2));
    }
  }

  draw(ctx, camX, camY) {
    this.abilityManager.draw(ctx, camX, camY);

    const x = this.x - camX, y = this.y - camY;
    ctx.save();
    if ((this.invulnTimer > 0 || devManager.isInvincible()) && Math.floor(performance.now() / 80) % 2 === 0) {
      ctx.globalAlpha = 0.5;
    }
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(x, y + this.radius * 0.8, this.radius * 0.9, this.radius * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.translate(x, y);
    ctx.rotate(this.facingAngle);
    ctx.shadowColor = this.hitFlash > 0 ? '#ff3355' : '#00f2ff';
    ctx.shadowBlur = 16;
    const grad = ctx.createLinearGradient(-this.radius, 0, this.radius, 0);
    grad.addColorStop(0, this.hitFlash > 0 ? '#ff6666' : '#3fd4ff');
    grad.addColorStop(1, this.hitFlash > 0 ? '#ff2233' : '#7c4dff');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(this.radius + 6, 0);
    ctx.lineTo(-this.radius * 0.7, this.radius * 0.8);
    ctx.lineTo(-this.radius * 0.3, 0);
    ctx.lineTo(-this.radius * 0.7, -this.radius * 0.8);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();

    if (devManager.unlocked && devManager.debugCollisions) {
      ctx.save();
      ctx.strokeStyle = '#00ff00';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(x, y, this.radius, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = 'rgba(0,255,255,0.5)';
      ctx.beginPath(); ctx.arc(x, y, this.xpPickupRadius, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
  }
}
