'use strict';

/* ============================================================
   WORLDS
   Thèmes visuels de l'arène (fond, grille, accent couleur).
============================================================ */
const WORLDS = [
  { id: 'plain', name: 'Plaine', bg: '#141c14', grid: '#22331f', accent: '#4caf50' },
  { id: 'lab', name: 'Laboratoire', bg: '#0c1622', grid: '#153244', accent: '#00e5ff' },
  { id: 'city', name: 'Ville Abandonnée', bg: '#181418', grid: '#2b2430', accent: '#b388ff' },
  { id: 'volcano', name: 'Zone Volcanique', bg: '#220c0a', grid: '#3d1712', accent: '#ff6d3d' }
];

/* ============================================================
   Game
   Objet central: état de la partie, boucle requestAnimationFrame,
   caméra, listes d'entités, résolution des collisions.
============================================================ */
class Game {
  constructor() {
    this.state = 'menu'; // menu, playing, paused, levelup, gameover
    this.ARENA_SIZE = 3600;
    this.camX = 0; this.camY = 0;
    this.player = null;
    this.enemies = [];
    this.projectiles = [];
    this.enemyProjectiles = [];
    this.xpOrbs = [];
    this.coins = [];
    this.missiles = [];
    this.boss = null;
    this.autoFire = false;
    this.lastTime = 0;
    this.fps = 60;
    this.run = {};
    this.bossTimer = 0;
    this.bossTierCount = 0;
    this.lastCreditsEarned = 0;
    this.spawner = new EnemySpawner();
    this.particleSystem = new ParticleSystem();
    this.ui = new UIManager();
    this.currentWorld = WORLDS[0];
  }

  init() {
    this.autoFire = profile.settings.autoFire;
    audioEngine.setMuted(!profile.settings.soundOn);
    audioEngine.setVolume(profile.settings.sfxVolume);
    this.ui.updateMainMenuStats();
    this.registerDevActions();
  }

  registerDevActions() {
    devManager.registerActions({
      giveLevel: () => { if (this.player) this.player.levelUp(); },
      giveXP: (amount) => { if (this.player) this.player.gainXP(amount); },
      giveCredits: (amount) => {
        profile.credits += amount;
        if (this.state === 'playing') this.run.credits += amount;
        SaveManager.save(profile);
        this.ui.updateMainMenuStats();
      },
      fullHp: () => { if (this.player) this.player.hp = this.player.maxHp; },
      spawnBoss: () => { if (this.state === 'playing') this.forceSpawnBoss(); },
      spawnElite: () => {
        if (this.state !== 'playing') return;
        for (let i = 0; i < 3; i++) this.spawner.spawnOne(this, 'elite');
      },
      killAll: () => {
        if (this.state !== 'playing') return;
        for (const e of this.enemies) {
          if (e.type !== 'boss') this.killEnemy(e, true);
        }
        this.enemies = this.enemies.filter(e => e.type === 'boss' && !e.dead);
      },
      killBoss: () => {
        if (this.boss) this.killEnemy(this.boss);
      },
      clearEnemies: () => {
        this.enemies = [];
        this.boss = null;
        document.getElementById('bossBarWrap').style.display = 'none';
      }
    });
  }

  startRun() {
    this.state = 'playing';
    this.player = new Player(0, 0);
    this.enemies = [];
    this.projectiles = [];
    this.enemyProjectiles = [];
    this.xpOrbs = [];
    this.coins = [];
    this.missiles = [];
    this.boss = null;
    this.particleSystem = new ParticleSystem();
    this.spawner.reset();
    this.bossTimer = 150;
    this.bossTierCount = 0;
    this.run = {
      startTime: performance.now(),
      elapsed: 0,
      kills: 0,
      bossKills: 0,
      eliteKills: 0,
      credits: 0,
      currentLevel: 1,
      totalXpGained: 0,
      score: 0
    };
    document.getElementById('hud').classList.remove('hidden');
    document.getElementById('pauseBtn').classList.remove('hidden');
    document.getElementById('muteBtn').classList.remove('hidden');
    document.getElementById('fsBtn').classList.remove('hidden');
    Input.resetTouch();
    this.ui.showScreen(null);
    document.getElementById('worldMenu').classList.add('hidden');
    this.lastTime = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  togglePause() {
    if (this.state === 'playing') {
      this.state = 'paused';
      document.getElementById('pauseOverlay').style.display = 'flex';
    } else if (this.state === 'paused') {
      this.state = 'playing';
      document.getElementById('pauseOverlay').style.display = 'none';
      this.lastTime = performance.now();
      requestAnimationFrame((t) => this.loop(t));
    }
  }

  requestLevelUpChoice() {
    this.state = 'levelup';
    this.ui.requestLevelUpChoice(this.player);
  }

  resumeAfterLevelUp() {
    this.state = 'playing';
    this.lastTime = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  damageEnemy(enemy, amount, isCrit) {
    enemy.hp -= amount;
    enemy.hitFlash = 0.1;
    this.run.score += Math.round(amount * 0.5);
    profile.stats.totalDamageDealt += amount;
    const color = isCrit ? '#ffb800' : '#ffffff';
    this.particleSystem.spawnText(enemy.x, enemy.y - enemy.radius - 5, Math.round(amount) + (isCrit ? '!' : ''), color, isCrit ? 18 : 13);
    if (isCrit) audioEngine.crit();
    if (enemy.hp <= 0 && !enemy.dead) this.killEnemy(enemy);
  }

  killEnemy(enemy, silent) {
    if (enemy.dead) return;
    enemy.dead = true;
    this.run.kills++;
    profile.stats.totalKills++;

    if (enemy.type === 'boss') {
      this.run.bossKills++;
      profile.stats.bossKills++;
      this.run.credits += enemy.creditReward;
      this.run.score += 500;
      this.boss = null;
      document.getElementById('bossBarWrap').style.display = 'none';
      this.ui.showToast('Boss vaincu !');
      this.particleSystem.spawnBurst(enemy.x, enemy.y, 40, '#ff2b4d', 150, 400, 0.5, 1, 3, 6);
      this.particleSystem.spawnExplosionRing(enemy.x, enemy.y, 120, '#ff2b4d');
      for (let i = 0; i < 8; i++) {
        this.xpOrbs.push(new ExperienceOrb(enemy.x + rand(-30, 30), enemy.y + rand(-30, 30), Math.floor(enemy.xpValue / 8)));
      }
      audioEngine.explosion();
    } else {
      if (enemy.isElite) { this.run.eliteKills = (this.run.eliteKills || 0) + 1; this.run.score += 50; }
      else this.run.score += 10;
      if (!silent) {
        this.xpOrbs.push(new ExperienceOrb(enemy.x, enemy.y, enemy.xpValue));
        if (Math.random() < enemy.creditChance) this.coins.push(new CreditCoin(enemy.x, enemy.y, randInt(1, 5)));
        audioEngine.impact();
        this.particleSystem.spawnBurst(enemy.x, enemy.y, 6, enemy.color, 60, 180, 0.25, 0.5, 2, 3.5);
      }
    }
  }

  forceSpawnBoss() {
    if (this.boss) return;
    this.bossTierCount++;
    const half = this.ARENA_SIZE / 2;
    const angle = rand(0, Math.PI * 2);
    const spawnDist = Math.max(canvas.width, canvas.height) * 0.8;
    let x = clampNum(this.player.x + Math.cos(angle) * spawnDist, -half + 50, half - 50);
    let y = clampNum(this.player.y + Math.sin(angle) * spawnDist, -half + 50, half - 50);
    const boss = new Boss(x, y, this.bossTierCount);
    this.boss = boss;
    this.enemies.push(boss);
    this.bossTimer = 150 + this.bossTierCount * 20;
    document.getElementById('bossName').textContent = boss.name;
    document.getElementById('bossBarWrap').style.display = 'block';
    this.ui.showToast('⚠ ' + boss.name + ' apparaît !');
    audioEngine.bossRoar();
  }

  trySpawnBoss(dt) {
    if (this.boss) return;
    this.bossTimer -= dt;
    if (this.bossTimer <= 0) this.forceSpawnBoss();
  }

  endRun() {
    if (this.state === 'gameover') return;
    this.state = 'gameover';
    audioEngine.gameOver();
    const timeSurvived = this.run.elapsed;
    const creditsEarned = Math.floor(this.run.credits * (1 + profile.permanentUpgrades.creditsGain * 0.05) + this.run.kills * 0.5);
    this.lastCreditsEarned = creditsEarned;
    profile.credits += creditsEarned;
    profile.stats.gamesPlayed++;
    profile.stats.totalCreditsEarned += creditsEarned;
    profile.stats.maxLevel = Math.max(profile.stats.maxLevel, this.player.level);
    profile.stats.bestScore = Math.max(profile.stats.bestScore, this.run.score);
    profile.stats.bestTime = Math.max(profile.stats.bestTime, timeSurvived);
    SaveManager.save(profile);

    document.getElementById('hud').classList.add('hidden');
    document.getElementById('pauseBtn').classList.add('hidden');
    document.getElementById('muteBtn').classList.add('hidden');
    document.getElementById('fsBtn').classList.add('hidden');
    document.getElementById('devBtn').classList.add('hidden');
    document.getElementById('bossBarWrap').style.display = 'none';
    this.ui.showGameOver(this);
  }

  loop(now) {
    if (this.state !== 'playing') return;
    let dt = (now - this.lastTime) / 1000;
    dt = Math.min(dt, 0.05);
    this.lastTime = now;
    this.run.elapsed = (now - this.run.startTime) / 1000;
    this.fps = dt > 0 ? (1 / dt) : 60;

    this.update(dt);
    this.render();

    requestAnimationFrame((t) => this.loop(t));
  }

  update(dt) {
    const player = this.player;
    player.update(dt);
    this.camX = player.x - canvas.width / 2;
    this.camY = player.y - canvas.height / 2;

    this.spawner.update(dt, this);
    this.trySpawnBoss(dt);

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (player.abilities.slowField) {
        const d = dist(player.x, player.y, e.x, e.y);
        if (d < player.abilityManager.slowRadius) e.slowTimer = 0.2;
      }
      e.update(dt, player, this);
      if (e.dead) { this.enemies.splice(i, 1); continue; }
    }

    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.update(dt);
      if (p.dead) { this.projectiles.splice(i, 1); continue; }
      for (const e of this.enemies) {
        if (p.hitEnemies.has(e.id)) continue;
        if (dist(p.x, p.y, e.x, e.y) < e.radius + p.radius) {
          this.damageEnemy(e, p.damage, p.isCrit);
          p.hitEnemies.add(e.id);
          if (p.pierce <= 0) { p.dead = true; break; }
          else p.pierce--;
        }
      }
      const half = this.ARENA_SIZE / 2;
      if (Math.abs(p.x) > half + 50 || Math.abs(p.y) > half + 50) p.dead = true;
    }

    for (let i = this.enemyProjectiles.length - 1; i >= 0; i--) {
      const p = this.enemyProjectiles[i];
      p.update(dt);
      if (p.dead) { this.enemyProjectiles.splice(i, 1); continue; }
      if (dist(p.x, p.y, player.x, player.y) < player.radius + p.radius) {
        player.takeDamage(p.damage);
        p.dead = true;
      }
    }

    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const m = this.missiles[i];
      if (!m.target || m.target.dead) {
        let nearest = null, nd = 99999;
        for (const e of this.enemies) { const d = dist(m.x, m.y, e.x, e.y); if (d < nd) { nd = d; nearest = e; } }
        m.target = nearest;
      }
      if (m.target) {
        const angle = Math.atan2(m.target.y - m.y, m.target.x - m.x);
        m.x += Math.cos(angle) * m.speed * dt;
        m.y += Math.sin(angle) * m.speed * dt;
        if (dist(m.x, m.y, m.target.x, m.target.y) < 24) {
          for (const e of this.enemies) {
            if (dist(m.x, m.y, e.x, e.y) < m.radius) this.damageEnemy(e, m.damage, false);
          }
          this.particleSystem.spawnExplosionRing(m.x, m.y, m.radius, '#ff6644');
          audioEngine.explosion();
          m.dead = true;
        }
      } else { m.dead = true; }
      if (m.dead) this.missiles.splice(i, 1);
    }

    for (let i = this.xpOrbs.length - 1; i >= 0; i--) {
      const o = this.xpOrbs[i];
      o.update(dt, player);
      if (o.dead) this.xpOrbs.splice(i, 1);
    }
    for (let i = this.coins.length - 1; i >= 0; i--) {
      const c = this.coins[i];
      c.update(dt, player, (v) => { this.run.credits += v; });
      if (c.dead) this.coins.splice(i, 1);
    }

    this.particleSystem.update(dt);
    this.ui.updateHUD(this);
  }

  render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const w = this.currentWorld;
    ctx.fillStyle = w.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const gridSize = 80;
    ctx.strokeStyle = w.grid;
    ctx.lineWidth = 1;
    const offsetX = -this.camX % gridSize;
    const offsetY = -this.camY % gridSize;
    ctx.beginPath();
    for (let x = offsetX; x < canvas.width; x += gridSize) { ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); }
    for (let y = offsetY; y < canvas.height; y += gridSize) { ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); }
    ctx.stroke();

    const half = this.ARENA_SIZE / 2;
    ctx.strokeStyle = w.accent;
    ctx.lineWidth = 4;
    ctx.globalAlpha = 0.5;
    ctx.strokeRect(-half - this.camX, -half - this.camY, this.ARENA_SIZE, this.ARENA_SIZE);
    ctx.globalAlpha = 1;

    for (const o of this.xpOrbs) o.draw(ctx, this.camX, this.camY);
    for (const c of this.coins) c.draw(ctx, this.camX, this.camY);
    for (const e of this.enemies) e.draw(ctx, this.camX, this.camY);
    this.player.draw(ctx, this.camX, this.camY);
    for (const p of this.projectiles) p.draw(ctx, this.camX, this.camY);
    for (const p of this.enemyProjectiles) p.draw(ctx, this.camX, this.camY);
    for (const m of this.missiles) m.draw(ctx, this.camX, this.camY);

    this.particleSystem.draw(ctx, this.camX, this.camY);

    const grad = ctx.createRadialGradient(canvas.width / 2, canvas.height / 2, canvas.height / 3, canvas.width / 2, canvas.height / 2, canvas.height);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Joysticks tactiles
    Input.drawTouch(ctx);
  }
}
