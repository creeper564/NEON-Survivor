'use strict';

/* ============================================================
   ENEMY_DEFS
   Toutes les caractéristiques de base par type d'ennemi.
   Ajouter un type = ajouter une entrée ici + gérer son
   comportement particulier dans Enemy.update() si besoin.
============================================================ */
const ENEMY_DEFS = {
  grunt:   { hp: 22, speed: 110, damage: 8,  radius: 14, xp: 3,  credits: 0, creditChance: 0.05, color: '#ff5577', shape: 'circle' },
  runner:  { hp: 10, speed: 200, damage: 5,  radius: 10, xp: 2,  credits: 0, creditChance: 0.04, color: '#ffd54f', shape: 'triangle' },
  tank:    { hp: 90, speed: 55,  damage: 16, radius: 22, xp: 8,  credits: 0, creditChance: 0.12, color: '#7c4dff', shape: 'square' },
  shooter: { hp: 18, speed: 90,  damage: 7,  radius: 12, xp: 5,  credits: 0, creditChance: 0.08, color: '#00e5ff', shape: 'circle' },
  elite:   { hp: 160,speed: 100, damage: 20, radius: 19, xp: 20, credits: 0, creditChance: 0.4,  color: '#ff2fd0', shape: 'circle', elite: true }
};

let enemyIdCounter = 1;

class Enemy {
  constructor(type, x, y, waveScale) {
    this.id = enemyIdCounter++;
    this.type = type;
    this.x = x; this.y = y;
    this.dead = false;
    this.hitFlash = 0;
    this.slowTimer = 0;
    const def = ENEMY_DEFS[type];
    this.def = def;
    this.maxHp = devManager.modifyEnemyHp(def.hp * waveScale);
    this.hp = this.maxHp;
    this.speed = def.speed;
    this.damage = def.damage * (1 + (waveScale - 1) * 0.4);
    this.radius = def.radius;
    this.xpValue = def.xp;
    this.color = def.color;
    this.contactCooldown = 0;
    this.shootCooldown = rand(0.5, 1.5);
    this.isElite = def.elite || false;
    this.creditChance = def.creditChance || 0.05;
  }

  update(dt, player, ctxGame) {
    let spd = devManager.modifyEnemySpeed(this.speed);
    if (this.slowTimer > 0) { this.slowTimer -= dt; spd *= 0.45; }
    if (this.hitFlash > 0) this.hitFlash -= dt;
    if (this.contactCooldown > 0) this.contactCooldown -= dt;

    if (this.type === 'shooter') {
      const d = dist(this.x, this.y, player.x, player.y);
      if (d > 260) {
        const angle = Math.atan2(player.y - this.y, player.x - this.x);
        this.x += Math.cos(angle) * spd * dt;
        this.y += Math.sin(angle) * spd * dt;
      } else if (d < 180) {
        const angle = Math.atan2(this.y - player.y, this.x - player.x);
        this.x += Math.cos(angle) * spd * dt;
        this.y += Math.sin(angle) * spd * dt;
      }
      this.shootCooldown -= dt;
      if (this.shootCooldown <= 0 && d < 500) {
        const angle = Math.atan2(player.y - this.y, player.x - this.x);
        ctxGame.enemyProjectiles.push(new Projectile(this.x, this.y, Math.cos(angle) * 260, Math.sin(angle) * 260, this.damage, false, 0, '#ff5577', 5, 'enemy'));
        this.shootCooldown = rand(1.6, 2.4);
      }
    } else {
      // Poursuite intelligente directe vers le joueur
      const angle = Math.atan2(player.y - this.y, player.x - this.x);
      this.x += Math.cos(angle) * spd * dt;
      this.y += Math.sin(angle) * spd * dt;
    }

    const d2 = dist(this.x, this.y, player.x, player.y);
    if (d2 < this.radius + player.radius - 4 && this.contactCooldown <= 0) {
      player.takeDamage(this.damage);
      this.contactCooldown = 0.6;
    }
  }

  draw(ctx, camX, camY) {
    const x = this.x - camX, y = this.y - camY;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(x, y + this.radius * 0.8, this.radius * 0.9, this.radius * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();

    const flashColor = this.hitFlash > 0 ? '#ffffff' : this.color;
    ctx.shadowColor = this.color;
    ctx.shadowBlur = this.isElite ? 18 : 8;
    ctx.fillStyle = flashColor;
    if (this.def.shape === 'square') {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(performance.now() * 0.001);
      ctx.fillRect(-this.radius, -this.radius, this.radius * 2, this.radius * 2);
      ctx.restore();
    } else if (this.def.shape === 'triangle') {
      ctx.beginPath();
      ctx.moveTo(x, y - this.radius);
      ctx.lineTo(x + this.radius, y + this.radius);
      ctx.lineTo(x - this.radius, y + this.radius);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(x, y, this.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = this.isElite ? '#ffd54f' : 'rgba(255,255,255,0.4)';
    ctx.lineWidth = this.isElite ? 2.5 : 1;
    ctx.stroke();
    ctx.restore();

    if (this.maxHp > 40) {
      const w = this.radius * 2;
      const hpPct = clampNum(this.hp / this.maxHp, 0, 1);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(x - w / 2, y - this.radius - 12, w, 5);
      ctx.fillStyle = hpPct > 0.5 ? '#4caf50' : (hpPct > 0.25 ? '#ffb800' : '#ff3355');
      ctx.fillRect(x - w / 2, y - this.radius - 12, w * hpPct, 5);
    }

    if (devManager.unlocked && devManager.debugCollisions) {
      ctx.save();
      ctx.strokeStyle = '#ff00ff';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(x, y, this.radius, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
  }
}

/* ============================================================
   EnemySpawner
   Gère le rythme d'apparition, la sélection du type d'ennemi
   et la position de spawn (hors écran, jamais sur le joueur).
============================================================ */
class EnemySpawner {
  constructor() {
    this.spawnTimer = 0;
    this.waveNumber = 1;
    this.waveTimer = 0;
    this.maxEnemies = 140;
  }

  reset() {
    this.spawnTimer = 0;
    this.waveNumber = 1;
    this.waveTimer = 0;
  }

  update(dt, ctxGame) {
    this.waveTimer += dt;
    if (this.waveTimer > 25) {
      this.waveTimer = 0;
      this.waveNumber++;
      ctxGame.ui.showToast('VAGUE ' + this.waveNumber);
    }

    const elapsedMin = ctxGame.run.elapsed / 60;
    let spawnInterval = clampNum(1.1 - elapsedMin * 0.05, 0.18, 1.1);
    spawnInterval = devManager.modifySpawnRate(spawnInterval);

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && ctxGame.enemies.length < this.maxEnemies) {
      this.spawnTimer = spawnInterval;
      const count = 1 + Math.floor(elapsedMin / 2);
      for (let i = 0; i < Math.min(count, 6); i++) {
        this.spawnOne(ctxGame);
      }
    }
  }

  spawnOne(ctxGame, forcedType) {
    const player = ctxGame.player;
    const half = ctxGame.ARENA_SIZE / 2;
    const angle = rand(0, Math.PI * 2);
    const spawnDist = Math.max(canvas.width, canvas.height) * 0.75;
    let x = player.x + Math.cos(angle) * spawnDist;
    let y = player.y + Math.sin(angle) * spawnDist;
    x = clampNum(x, -half + 20, half - 20);
    y = clampNum(y, -half + 20, half - 20);

    const elapsedMin = ctxGame.run.elapsed / 60;
    const waveScale = 1 + elapsedMin * 0.22;

    let type = forcedType;
    if (!type) {
      const roll = Math.random();
      if (elapsedMin > 6 && roll < 0.06) type = 'elite';
      else if (roll < 0.25) type = 'runner';
      else if (roll < 0.45 && elapsedMin > 1.5) type = 'tank';
      else if (roll < 0.62 && elapsedMin > 1) type = 'shooter';
      else type = 'grunt';
    }

    const e = new Enemy(type, x, y, waveScale);
    ctxGame.enemies.push(e);
    return e;
  }
}
