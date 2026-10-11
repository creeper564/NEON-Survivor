'use strict';

/* ============================================================
   UTILITAIRES GLOBAUX
   Utilisés par tous les autres fichiers (chargés avant eux
   dans index.html, sauf ceux qui sont eux-mêmes des utilitaires
   sans dépendance : dev.js et save.js n'en ont pas besoin).
============================================================ */
function rand(min, max) { return Math.random() * (max - min) + min; }
function randInt(min, max) { return Math.floor(rand(min, max + 1)); }
function dist(x1, y1, x2, y2) { return Math.hypot(x2 - x1, y2 - y1); }
function clampNum(v, min, max) { return Math.max(min, Math.min(max, v)); }
function lerp(a, b, t) { return a + (b - a) * t; }
function fmtTime(sec) {
  sec = Math.floor(sec);
  const m = Math.floor(sec / 60).toString().padStart(2, '0');
  const s = (sec % 60).toString().padStart(2, '0');
  return m + ':' + s;
}

/* ============================================================
   CANVAS (adapté mobile : zoom de vue + qualité réduite)
============================================================ */
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Écran tactile principal (téléphone / tablette)
const COARSE_POINTER = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
// Effets réduits sur mobile (pas de lueurs coûteuses, moins d'ennemis/particules).
// Passe à false pour garder tous les effets même sur mobile.
const LOW_FX = COARSE_POINTER;
if (LOW_FX) {
  // Désactive les lueurs (shadowBlur), très coûteuses sur mobile
  Object.defineProperty(ctx, 'shadowBlur', { get() { return 0; }, set() {} });
}

let viewZoom = 1;
function resizeCanvas() {
  // Sur petit écran tactile, on dézoome un peu pour voir plus loin
  viewZoom = (COARSE_POINTER && Math.min(window.innerWidth, window.innerHeight) < 900) ? 0.75 : 1;
  canvas.width = Math.round(window.innerWidth / viewZoom);
  canvas.height = Math.round(window.innerHeight / viewZoom);
  canvas.style.width = window.innerWidth + 'px';
  canvas.style.height = window.innerHeight + 'px';
}
window.addEventListener('resize', resizeCanvas);
window.addEventListener('orientationchange', () => setTimeout(resizeCanvas, 250));
resizeCanvas();

/* ============================================================
   INPUT (clavier + souris + tactile)
   Tactile : joystick flottant à gauche = déplacement,
   joystick flottant à droite = visée (tir automatique).
   Sans doigt à droite, le jeu vise l'ennemi le plus proche.
============================================================ */
function makeStick() { return { active: false, id: null, ox: 0, oy: 0, x: 0, y: 0, dx: 0, dy: 0 }; }

const Input = {
  keys: {},
  mouseX: 0, mouseY: 0,
  mouseDown: false,
  touchMode: false,
  move: makeStick(),
  aim: makeStick(),
  STICK_RADIUS: 60,

  init() {
    window.addEventListener('keydown', (e) => {
      this.keys[e.key.toLowerCase()] = true;
      if (e.key === 'Escape' || e.key.toLowerCase() === 'p') {
        if (game.state === 'playing' || game.state === 'paused') game.togglePause();
      }
    });
    window.addEventListener('keyup', (e) => { this.keys[e.key.toLowerCase()] = false; });
    canvas.addEventListener('mousemove', (e) => {
      this.touchMode = false;
      const p = this.toCanvas(e);
      this.mouseX = p.x;
      this.mouseY = p.y;
    });
    canvas.addEventListener('mousedown', (e) => {
      this.touchMode = false;
      if (e.button === 0) this.mouseDown = true;
      audioEngine.init(); audioEngine.resume();
    });
    window.addEventListener('mouseup', (e) => { if (e.button === 0) this.mouseDown = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // Tactile
    canvas.addEventListener('touchstart', (e) => this.onTouchStart(e), { passive: false });
    canvas.addEventListener('touchmove', (e) => this.onTouchMove(e), { passive: false });
    canvas.addEventListener('touchend', (e) => this.onTouchEnd(e), { passive: false });
    canvas.addEventListener('touchcancel', (e) => this.onTouchEnd(e), { passive: false });
    // Empêche le zoom par pincement (iOS)
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    // Si la fenêtre perd le focus, on relâche tout
    window.addEventListener('blur', () => { this.mouseDown = false; this.resetTouch(); this.keys = {}; });
  },

  isDown(k) { return !!this.keys[k]; },

  // Convertit une position écran (clientX/Y) en coordonnées du canvas
  toCanvas(pt) {
    const r = canvas.getBoundingClientRect();
    const rw = r.width || window.innerWidth || canvas.width;
    const rh = r.height || window.innerHeight || canvas.height;
    return {
      x: (pt.clientX - r.left) * canvas.width / rw,
      y: (pt.clientY - r.top) * canvas.height / rh
    };
  },

  resetTouch() {
    this.move = makeStick();
    this.aim = makeStick();
  },

  onTouchStart(e) {
    e.preventDefault();
    audioEngine.init(); audioEngine.resume();
    this.touchMode = true;
    for (const t of e.changedTouches) {
      const p = this.toCanvas(t);
      const stick = p.x < canvas.width / 2 ? this.move : this.aim;
      if (stick.active) continue;
      stick.active = true;
      stick.id = t.identifier;
      stick.ox = stick.x = p.x;
      stick.oy = stick.y = p.y;
      stick.dx = stick.dy = 0;
    }
  },

  onTouchMove(e) {
    e.preventDefault();
    const R = this.STICK_RADIUS;
    for (const t of e.changedTouches) {
      for (const stick of [this.move, this.aim]) {
        if (!stick.active || stick.id !== t.identifier) continue;
        const p = this.toCanvas(t);
        let vx = p.x - stick.ox, vy = p.y - stick.oy;
        const len = Math.hypot(vx, vy);
        if (len > R) {
          // Le joystick "suit" le doigt quand on dépasse le rayon
          const k = (len - R) / len;
          stick.ox += vx * k;
          stick.oy += vy * k;
          vx = p.x - stick.ox;
          vy = p.y - stick.oy;
        }
        stick.x = p.x;
        stick.y = p.y;
        const l = Math.hypot(vx, vy);
        const mag = Math.min(1, l / R);
        if (l > 0 && mag > 0.12) {
          stick.dx = vx / l * mag;
          stick.dy = vy / l * mag;
        } else {
          stick.dx = 0;
          stick.dy = 0;
        }
      }
    }
  },

  onTouchEnd(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (this.move.active && this.move.id === t.identifier) this.move = makeStick();
      if (this.aim.active && this.aim.id === t.identifier) this.aim = makeStick();
    }
  },

  // Dessine les joysticks (pendant la partie, en mode tactile uniquement)
  drawTouch(c) {
    if (!this.touchMode) return;
    const R = this.STICK_RADIUS;
    const sticks = [
      { s: this.move, color: '0,242,255', hx: canvas.width * 0.18 },
      { s: this.aim, color: '255,47,208', hx: canvas.width * 0.82 }
    ];
    c.save();
    for (const it of sticks) {
      const s = it.s;
      const bx = s.active ? s.ox : it.hx;
      const by = s.active ? s.oy : canvas.height - R * 1.8;
      const kx = s.active ? s.x : bx;
      const ky = s.active ? s.y : by;
      const a = s.active ? 0.35 : 0.12;
      c.globalAlpha = 1;
      c.lineWidth = 3;
      c.strokeStyle = 'rgba(' + it.color + ',' + (a + 0.15) + ')';
      c.fillStyle = 'rgba(' + it.color + ',' + (a * 0.4) + ')';
      c.beginPath(); c.arc(bx, by, R, 0, Math.PI * 2); c.fill(); c.stroke();
      c.fillStyle = 'rgba(' + it.color + ',' + (s.active ? 0.6 : 0.2) + ')';
      c.beginPath(); c.arc(kx, ky, R * 0.45, 0, Math.PI * 2); c.fill();
    }
    c.restore();
  }
};
Input.init();

window.addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
}, { passive: false });

/* ============================================================
   PROFIL PERSISTANT (chargé depuis SaveManager)
============================================================ */
let profile = SaveManager.load();
function persistProfile() { SaveManager.save(profile); }

/* ============================================================
   INSTANCE DE JEU
============================================================ */
const game = new Game();
if (LOW_FX) game.spawner.maxEnemies = 90;

/* ============================================================
   SÉLECTION DE MONDE
============================================================ */
function buildWorldSelect() {
  const grid = document.getElementById('worldSelectGrid');
  grid.innerHTML = '';
  WORLDS.forEach((w) => {
    const div = document.createElement('div');
    div.className = 'world-card' + (w === game.currentWorld ? ' selected' : '');
    div.innerHTML = `<div class="wc-name">${w.name}</div>`;
    div.addEventListener('click', () => {
      game.currentWorld = w;
      audioEngine.init(); audioEngine.uiClick();
      buildWorldSelect();
    });
    grid.appendChild(div);
  });
}

/* ============================================================
   PANNEAU DEV - construction dynamique
============================================================ */
function buildDevPanel() {
  const cheatList = document.getElementById('devCheatList');
  cheatList.innerHTML = '';
  const cheatLabels = {
    invincible: 'Invincible',
    infiniteXP: 'XP illimitée',
    autoFire: 'Tir automatique',
    noCooldown: 'Pas de cooldown',
    damageX10: 'Dégâts x10',
    speedX2: 'Vitesse x2',
    xpMagnet: 'Aimant XP permanent',
    godMode: 'GOD MODE'
  };
  for (const key in cheatLabels) {
    const row = document.createElement('label');
    row.className = 'dev-check-row';
    row.innerHTML = `<input type="checkbox" data-cheat="${key}"> ${cheatLabels[key]}`;
    const input = row.querySelector('input');
    input.checked = devManager.cheats[key];
    input.addEventListener('change', () => {
      devManager.setCheat(key, input.checked);
      audioEngine.uiClick();
      refreshDevIndicator();
      if (key === 'godMode') buildDevPanel();
    });
    cheatList.appendChild(row);
  }

  const overrideList = document.getElementById('devOverrideList');
  overrideList.innerHTML = '';
  const overrideLabels = {
    damageMult: 'Dégâts (mult.)',
    speedMult: 'Vitesse (mult.)',
    fireRateMult: 'Cadence (mult.)',
    xpMult: 'XP (mult.)',
    spawnRateMult: 'Spawn rate (mult.)',
    enemyHpMult: 'PV ennemis (mult.)',
    enemySpeedMult: 'Vitesse ennemis (mult.)'
  };
  for (const key in overrideLabels) {
    const row = document.createElement('div');
    row.className = 'dev-override-row';
    row.innerHTML = `<span>${overrideLabels[key]}</span><input type="number" step="0.1" min="0" data-override="${key}" value="${devManager.overrides[key]}">`;
    overrideList.appendChild(row);
  }
}

function refreshDevIndicator() {
  const box = document.getElementById('devCheatIndicator');
  const active = Object.keys(devManager.cheats).filter(k => devManager.cheats[k]);
  const labels = {
    invincible: 'INVINCIBLE', infiniteXP: 'XP ILLIMITÉE', autoFire: 'TIR AUTO',
    noCooldown: 'PAS DE COOLDOWN', damageX10: 'DÉGÂTS x10', speedX2: 'VITESSE x2',
    xpMagnet: 'AIMANT XP', godMode: 'GOD MODE'
  };
  if (active.length === 0) { box.textContent = ''; box.classList.add('hidden'); return; }
  box.classList.remove('hidden');
  box.innerHTML = 'DEV ACTIVE<br>' + active.map(k => '✓ ' + labels[k]).join('<br>');
}

devManager.onChange(() => {
  refreshDevIndicator();
  document.getElementById('devPanelOverlay').style.display = devManager.panelOpen ? 'flex' : 'none';
  document.getElementById('devPanel').classList.toggle('hidden', !devManager.unlocked);
});

/* ============================================================
   ÉVÉNEMENTS - MENU PRINCIPAL
============================================================ */
document.getElementById('btnPlay').addEventListener('click', () => {
  audioEngine.init(); audioEngine.uiClick();
  buildWorldSelect();
  game.ui.showScreen(null);
  document.getElementById('worldMenu').classList.remove('hidden');
});
document.getElementById('btnShop').addEventListener('click', () => {
  audioEngine.init(); audioEngine.uiClick();
  game.ui.buildShop();
  game.ui.showScreen('shopMenu');
});
document.getElementById('btnStats').addEventListener('click', () => {
  audioEngine.init(); audioEngine.uiClick();
  game.ui.buildStats();
  game.ui.showScreen('statsMenu');
});
document.getElementById('btnOptions').addEventListener('click', () => {
  audioEngine.init(); audioEngine.uiClick();
  game.ui.updateOptionsUI();
  buildDevPanel();
  game.ui.showScreen('optionsMenu');
});
document.getElementById('btnBackFromShop').addEventListener('click', () => { audioEngine.uiClick(); game.ui.showScreen('mainMenu'); });
document.getElementById('btnBackFromStats').addEventListener('click', () => { audioEngine.uiClick(); game.ui.showScreen('mainMenu'); });
document.getElementById('btnBackFromOptions').addEventListener('click', () => { audioEngine.uiClick(); game.ui.showScreen('mainMenu'); });
document.getElementById('btnBackFromWorld').addEventListener('click', () => {
  audioEngine.uiClick();
  document.getElementById('worldMenu').classList.add('hidden');
  game.ui.showScreen('mainMenu');
});
document.getElementById('btnStartRun').addEventListener('click', () => {
  audioEngine.init(); audioEngine.resume(); audioEngine.uiClick();
  game.startRun();
});

/* ============================================================
   ÉVÉNEMENTS - OPTIONS
============================================================ */
document.getElementById('btnToggleSound').addEventListener('click', () => {
  profile.settings.soundOn = !profile.settings.soundOn;
  audioEngine.setMuted(!profile.settings.soundOn);
  persistProfile();
  audioEngine.uiClick();
  game.ui.updateOptionsUI();
  updateMuteBtn();
});
document.getElementById('btnToggleAutoFire').addEventListener('click', () => {
  profile.settings.autoFire = !profile.settings.autoFire;
  game.autoFire = profile.settings.autoFire;
  persistProfile();
  audioEngine.uiClick();
  game.ui.updateOptionsUI();
});
document.getElementById('btnResetData').addEventListener('click', () => {
  if (confirm('Voulez-vous vraiment réinitialiser toutes vos données ? Cette action est irréversible.')) {
    profile = SaveManager.defaultData();
    persistProfile();
    audioEngine.uiClick();
    game.ui.updateMainMenuStats();
    game.ui.updateOptionsUI();
    game.ui.showToast('Données réinitialisées');
  }
});

document.getElementById('btnDevActivate').addEventListener('click', () => {
  const codeInput = document.getElementById('devCodeInput');
  const msg = document.getElementById('devCodeMsg');
  const ok = devManager.tryUnlock(codeInput.value.trim());
  audioEngine.uiClick();
  if (ok) {
    msg.textContent = 'MODE DÉVELOPPEUR ACTIVÉ';
    msg.style.color = '#4caf50';
    codeInput.value = '';
    buildDevPanel();
    game.ui.updateOptionsUI();
  } else {
    msg.textContent = 'Code incorrect';
    msg.style.color = '#ff3355';
  }
});
document.getElementById('btnDevDeactivate').addEventListener('click', () => {
  devManager.lock();
  audioEngine.uiClick();
  game.ui.updateOptionsUI();
  document.getElementById('devCodeMsg').textContent = '';
});
document.getElementById('btnDevApplyOverrides').addEventListener('click', () => {
  const inputs = document.querySelectorAll('[data-override]');
  inputs.forEach(inp => devManager.setOverride(inp.dataset.override, inp.value));
  audioEngine.uiClick();
  game.ui.showToast('Valeurs dev appliquées');
});
document.getElementById('btnDevResetOverrides').addEventListener('click', () => {
  devManager.resetOverrides();
  buildDevPanel();
  audioEngine.uiClick();
});
document.getElementById('btnDevResetAllCheats').addEventListener('click', () => {
  devManager.resetCheats();
  buildDevPanel();
  audioEngine.uiClick();
  game.ui.showToast('Tous les cheats désactivés');
});
document.getElementById('btnDevDebugCollisions').addEventListener('click', () => {
  devManager.toggleDebugCollisions();
  audioEngine.uiClick();
});
document.getElementById('btnDevLevel').addEventListener('click', () => { devManager.giveLevel(); audioEngine.uiClick(); });
document.getElementById('btnDevXP').addEventListener('click', () => { devManager.giveXP(1000); audioEngine.uiClick(); });
document.getElementById('btnDevCredits').addEventListener('click', () => { devManager.giveCredits(10000); audioEngine.uiClick(); game.ui.updateMainMenuStats(); });
document.getElementById('btnDevFullHp').addEventListener('click', () => { devManager.fullHp(); audioEngine.uiClick(); });
document.getElementById('btnDevSpawnBoss').addEventListener('click', () => { devManager.spawnBoss(); audioEngine.uiClick(); });
document.getElementById('btnDevSpawnElite').addEventListener('click', () => { devManager.spawnElite(); audioEngine.uiClick(); });
document.getElementById('btnDevKillAll').addEventListener('click', () => { devManager.killAll(); audioEngine.uiClick(); });
document.getElementById('btnDevKillBoss').addEventListener('click', () => { devManager.killBoss(); audioEngine.uiClick(); });
document.getElementById('btnDevClearEnemies').addEventListener('click', () => { devManager.clearEnemies(); audioEngine.uiClick(); });
document.getElementById('btnDevClosePanel').addEventListener('click', () => { devManager.togglePanel(); audioEngine.uiClick(); });

/* Panneau dev rapide (F2) - boutons dupliqués pour accès pendant la partie */
document.getElementById('btnDevLevel2').addEventListener('click', () => { devManager.giveLevel(); audioEngine.uiClick(); });
document.getElementById('btnDevXP2').addEventListener('click', () => { devManager.giveXP(1000); audioEngine.uiClick(); });
document.getElementById('btnDevCredits2').addEventListener('click', () => { devManager.giveCredits(10000); audioEngine.uiClick(); game.ui.updateMainMenuStats(); });
document.getElementById('btnDevFullHp2').addEventListener('click', () => { devManager.fullHp(); audioEngine.uiClick(); });
document.getElementById('btnDevSpawnBoss2').addEventListener('click', () => { devManager.spawnBoss(); audioEngine.uiClick(); });
document.getElementById('btnDevKillAll2').addEventListener('click', () => { devManager.killAll(); audioEngine.uiClick(); });

/* ============================================================
   ÉVÉNEMENTS - PAUSE / HUD
============================================================ */
function updateMuteBtn() {
  document.getElementById('muteBtn').textContent = audioEngine.muted ? '🔇' : '🔊';
}
document.getElementById('pauseBtn').addEventListener('click', () => { audioEngine.uiClick(); game.togglePause(); });
document.getElementById('btnResume').addEventListener('click', () => { audioEngine.uiClick(); game.togglePause(); });
document.getElementById('btnRestartFromPause').addEventListener('click', () => {
  audioEngine.uiClick();
  document.getElementById('pauseOverlay').style.display = 'none';
  game.startRun();
});
document.getElementById('btnQuitToMenu').addEventListener('click', () => {
  audioEngine.uiClick();
  document.getElementById('pauseOverlay').style.display = 'none';
  game.state = 'menu';
  document.getElementById('hud').classList.add('hidden');
  document.getElementById('pauseBtn').classList.add('hidden');
  document.getElementById('muteBtn').classList.add('hidden');
  document.getElementById('fsBtn').classList.add('hidden');
  document.getElementById('bossBarWrap').style.display = 'none';
  document.getElementById('devHud').classList.add('hidden');
  document.getElementById('devBtn').classList.add('hidden');
  game.ui.updateMainMenuStats();
  game.ui.showScreen('mainMenu');
});
document.getElementById('muteBtn').addEventListener('click', () => {
  profile.settings.soundOn = !profile.settings.soundOn;
  audioEngine.setMuted(!profile.settings.soundOn);
  persistProfile();
  updateMuteBtn();
});
// iPhone Safari ne supporte pas le plein écran : on masque le bouton
if (!document.documentElement.requestFullscreen) document.getElementById('fsBtn').style.display = 'none';
document.getElementById('devBtn').addEventListener('click', () => { devManager.togglePanel(); audioEngine.uiClick(); });
document.getElementById('fsBtn').addEventListener('click', () => {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
  else document.exitFullscreen().catch(() => {});
});

document.getElementById('btnReplay').addEventListener('click', () => {
  audioEngine.uiClick();
  document.getElementById('gameoverOverlay').style.display = 'none';
  game.startRun();
});
document.getElementById('btnGoMenu').addEventListener('click', () => {
  audioEngine.uiClick();
  document.getElementById('gameoverOverlay').style.display = 'none';
  game.state = 'menu';
  game.ui.updateMainMenuStats();
  game.ui.showScreen('mainMenu');
});

/* ============================================================
   BOOT
============================================================ */
game.init();
game.ui.showScreen('mainMenu');
