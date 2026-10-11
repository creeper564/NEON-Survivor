'use strict';

/* ============================================================
   UPGRADE_POOL_EXTRA
   Améliorations "joueur" proposées au level up, en plus des
   WEAPON_UPGRADES (weapons.js) et des capacités (abilities.js).
============================================================ */
const PLAYER_UPGRADES = [
  { key: 'hp', icon: '❤', name: '+20 PV Max', desc: 'Augmente vos points de vie maximum.', apply: (p) => { p.maxHp += 20; p.hp += 20; } },
  { key: 'speed', icon: '👟', name: '+10% Vitesse', desc: 'Déplacez-vous plus vite.', apply: (p) => { p.speedMult += 0.10; } },
  { key: 'pickup', icon: '🧲', name: '+10% Rayon récup. XP', desc: "Attirez l'XP de plus loin.", apply: (p) => { p.xpPickupRadius *= 1.10; } },
  { key: 'regen', icon: '💚', name: 'Régénération PV', desc: 'Régénère des PV au fil du temps.', apply: (p) => { p.regen += 1.5; } },
  { key: 'armor', icon: '🛡', name: '+Armure', desc: 'Réduit les dégâts subis.', apply: (p) => { p.armor += 2; } },
  { key: 'dodge', icon: '🌀', name: "+Chance d'esquive", desc: "Chance d'éviter totalement une attaque.", apply: (p) => { p.dodge = clampNum(p.dodge + 0.04, 0, 0.5); } }
];

function getUpgradePool(player) {
  const pool = [];
  for (const u of WEAPON_UPGRADES) pool.push(u);
  for (const u of PLAYER_UPGRADES) pool.push(u);
  for (const key in ABILITY_DEFS) {
    const def = ABILITY_DEFS[key];
    const currentLevel = player.abilities[key] || 0;
    if (currentLevel < def.max) {
      pool.push({
        key: key, icon: def.icon,
        name: currentLevel === 0 ? def.name + ' (Nouveau)' : def.name + ' Niv.' + (currentLevel + 1),
        desc: def.desc,
        isAbility: true,
        currentLevel: currentLevel,
        apply: (p) => { p.abilities[key] = (p.abilities[key] || 0) + 1; }
      });
    }
  }
  return pool;
}

function pickRandomUpgrades(player, n) {
  const pool = getUpgradePool(player);
  const chosen = [];
  const poolCopy = pool.slice();
  for (let i = 0; i < n && poolCopy.length > 0; i++) {
    const idx = randInt(0, poolCopy.length - 1);
    chosen.push(poolCopy[idx]);
    poolCopy.splice(idx, 1);
  }
  return chosen;
}

/* ============================================================
   SHOP_ITEMS
============================================================ */
const SHOP_ITEMS = [
  { key: 'dmg', name: 'Dégâts Permanents', desc: '+5% dégâts par niveau', baseCost: 50, growth: 1.35 },
  { key: 'hp', name: 'PV Permanents', desc: '+5% PV max par niveau', baseCost: 50, growth: 1.35 },
  { key: 'speed', name: 'Vitesse Permanente', desc: '+5% vitesse par niveau', baseCost: 40, growth: 1.35 },
  { key: 'xpGain', name: "Gain d'XP", desc: '+5% XP gagné par niveau', baseCost: 45, growth: 1.35 },
  { key: 'crit', name: 'Chance Critique', desc: '+5% critique par niveau', baseCost: 60, growth: 1.4 },
  { key: 'armor', name: 'Armure Permanente', desc: '+1.5 armure par niveau', baseCost: 55, growth: 1.35 },
  { key: 'creditsGain', name: 'Gain de Crédits', desc: '+5% crédits gagnés par niveau', baseCost: 55, growth: 1.4 }
];
function shopItemCost(item) {
  const lvl = profile.permanentUpgrades[item.key] || 0;
  return Math.floor(item.baseCost * Math.pow(item.growth, lvl));
}

/* ============================================================
   UIManager
   Toute la logique DOM: écrans, HUD, panneaux dev, toasts.
============================================================ */
class UIManager {
  constructor() {
    this.screens = ['mainMenu', 'shopMenu', 'statsMenu', 'optionsMenu'];
  }

  showScreen(id) {
    this.screens.forEach(s => document.getElementById(s).classList.add('hidden'));
    if (id) document.getElementById(id).classList.remove('hidden');
  }

  showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.style.display = 'block';
    clearTimeout(this._toastHandle);
    this._toastHandle = setTimeout(() => { t.style.display = 'none'; }, 1800);
  }

  updateMainMenuStats() {
    document.getElementById('menuBestScore').textContent = Math.floor(profile.stats.bestScore);
    document.getElementById('menuBestTime').textContent = fmtTime(profile.stats.bestTime);
    document.getElementById('menuCredits').textContent = Math.floor(profile.credits);
    const permLevel = 1 + Object.values(profile.permanentUpgrades).reduce((a, b) => a + b, 0);
    document.getElementById('menuPermLevel').textContent = permLevel;
  }

  buildShop() {
    const grid = document.getElementById('shopGrid');
    grid.innerHTML = '';
    document.getElementById('shopCredits').textContent = Math.floor(profile.credits);
    SHOP_ITEMS.forEach(item => {
      const lvl = profile.permanentUpgrades[item.key] || 0;
      const cost = shopItemCost(item);
      const div = document.createElement('div');
      div.className = 'shop-item';
      div.innerHTML = `
        <div class="si-name">${item.name}</div>
        <div class="si-desc">${item.desc}</div>
        <div class="si-level">Niveau actuel : ${lvl}</div>
        <button class="si-buy" ${profile.credits < cost ? 'disabled' : ''}>Acheter (${cost} 💰)</button>
      `;
      div.querySelector('.si-buy').addEventListener('click', () => {
        if (profile.credits >= cost) {
          profile.credits -= cost;
          profile.permanentUpgrades[item.key] = lvl + 1;
          SaveManager.save(profile);
          audioEngine.uiClick();
          this.buildShop();
          this.updateMainMenuStats();
        }
      });
      grid.appendChild(div);
    });
  }

  buildStats() {
    const grid = document.getElementById('statsGrid');
    const s = profile.stats;
    const rows = [
      ['Parties jouées', s.gamesPlayed],
      ['Ennemis tués', s.totalKills],
      ['Boss tués', s.bossKills],
      ['Meilleur score', Math.floor(s.bestScore)],
      ['Meilleur temps', fmtTime(s.bestTime)],
      ['Niveau maximal atteint', s.maxLevel],
      ['Crédits gagnés (total)', Math.floor(s.totalCreditsEarned)],
      ['Dégâts infligés (total)', Math.floor(s.totalDamageDealt)]
    ];
    grid.innerHTML = rows.map(r => `<div class="stat-line"><span>${r[0]}</span><span>${r[1]}</span></div>`).join('');
  }

  updateOptionsUI() {
    document.getElementById('optSoundState').textContent = profile.settings.soundOn ? 'Activé' : 'Désactivé';
    document.getElementById('optAutoFireState').textContent = profile.settings.autoFire ? 'Activé' : 'Désactivé';
    document.getElementById('devStatusText').textContent = devManager.unlocked ? 'MODE DÉVELOPPEUR ACTIVÉ' : '';
    document.getElementById('devPanel').classList.toggle('hidden', !devManager.unlocked);
  }

  requestLevelUpChoice(player) {
    const choices = pickRandomUpgrades(player, 3);
    const container = document.getElementById('upgradeChoices');
    container.innerHTML = '';
    choices.forEach(choice => {
      const card = document.createElement('div');
      card.className = 'upgrade-card';
      card.innerHTML = `
        <div class="uc-icon">${choice.icon}</div>
        <div class="uc-name">${choice.name}</div>
        <div class="uc-desc">${choice.desc}</div>
        ${choice.isAbility ? `<div class="uc-level">Niveau actuel: ${choice.currentLevel}</div>` : ''}
      `;
      card.addEventListener('click', () => {
        choice.apply(player);
        audioEngine.uiClick();
        document.getElementById('levelupOverlay').style.display = 'none';
        game.resumeAfterLevelUp();
      });
      container.appendChild(card);
    });
    document.getElementById('levelupOverlay').style.display = 'flex';
  }

  updateHUD(g) {
    const player = g.player;
    document.getElementById('hudLevel').textContent = player.level;
    document.getElementById('hudTime').textContent = fmtTime(g.run.elapsed);
    document.getElementById('hudKills').textContent = g.run.kills;
    document.getElementById('hudScore').textContent = Math.floor(g.run.score);
    document.getElementById('hudWave').textContent = g.spawner.waveNumber;
    const hpPct = clampNum(player.hp / player.maxHp, 0, 1) * 100;
    document.getElementById('hpFill').style.width = hpPct + '%';
    document.getElementById('hpLabel').textContent = Math.ceil(player.hp) + '/' + Math.ceil(player.maxHp);
    const xpPct = clampNum(player.xp / player.xpToNext, 0, 1) * 100;
    document.getElementById('xpFill').style.width = xpPct + '%';
    document.getElementById('xpLabel').textContent = Math.floor(player.xp) + '/' + Math.floor(player.xpToNext);

    const panel = document.getElementById('abilitiesPanel');
    panel.innerHTML = '';
    for (const key in player.abilities) {
      const lvl = player.abilities[key];
      if (lvl <= 0) continue;
      const def = ABILITY_DEFS[key];
      const chip = document.createElement('div');
      chip.className = 'ability-chip';
      chip.innerHTML = `<span class="ac-name">${def.icon} ${def.name}</span> Niv.${lvl}`;
      panel.appendChild(chip);
    }

    if (g.boss && !g.boss.dead) {
      document.getElementById('bossBarFill').style.width = clampNum(g.boss.hp / g.boss.maxHp, 0, 1) * 100 + '%';
    }

    document.getElementById('invincibleTag').classList.toggle('hidden', !devManager.isInvincible());

    if (devManager.unlocked) {
      document.getElementById('devHud').classList.remove('hidden');
      document.getElementById('devFps').textContent = Math.round(g.fps);
      document.getElementById('devEnemies').textContent = g.enemies.length;
      document.getElementById('devProjectiles').textContent = g.projectiles.length + g.enemyProjectiles.length;
      document.getElementById('devParticles').textContent = g.particleSystem.particles.length;
      document.getElementById('devOrbs').textContent = g.xpOrbs.length;
      document.getElementById('devPosX').textContent = Math.round(player.x);
      document.getElementById('devPosY').textContent = Math.round(player.y);
    } else {
      document.getElementById('devHud').classList.add('hidden');
    }
  }

  showGameOver(g) {
    document.getElementById('goTime').textContent = fmtTime(g.run.elapsed);
    document.getElementById('goKills').textContent = g.run.kills;
    document.getElementById('goLevel').textContent = g.player.level;
    document.getElementById('goBoss').textContent = g.run.bossKills;
    document.getElementById('goScore').textContent = Math.floor(g.run.score);
    document.getElementById('goCredits').textContent = g.lastCreditsEarned;
    document.getElementById('gameoverOverlay').style.display = 'flex';
  }
}
