'use strict';

/* ============================================================
   UTILITAIRES GLOBAUX
   Utilisés par tous les autres fichiers (chargés avant eux
   dans index.html, sauf ceux qui sont eux-mêmes des utilitaires
   sans dépendance : dev.js et save.js n'en ont pas besoin).
============================================================ */
// Branche un événement sur un élément ; si l'élément est introuvable (ex. ancien fichier en cache),
// on le signale dans la console au lieu de bloquer tout le reste du jeu.
function on(id, evt, handler, opts) {
  const el = document.getElementById(id);
  if (!el) { console.error('[Neon Survivors] élément introuvable : #' + id); return; }
  el.addEventListener(evt, handler, opts);
}

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

// Appareil mobile : écran tactile principal, ou tactile sans souris
const COARSE_POINTER = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
const HAS_FINE_POINTER = !!(window.matchMedia && window.matchMedia('(any-pointer: fine)').matches);
const UA = navigator.userAgent || '';
const UA_MOBILE = /Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(UA) ||
  !!(navigator.userAgentData && navigator.userAgentData.mobile) ||
  (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1);   // iPad en mode « site de bureau »
const IS_MOBILE = COARSE_POINTER || UA_MOBILE || ((navigator.maxTouchPoints || 0) > 0 && !HAS_FINE_POINTER);
// La classe "is-mobile" sert au CSS : tout ce qui est réservé au mobile s'affiche uniquement avec elle
document.documentElement.classList.toggle('is-mobile', IS_MOBILE);
// Effets réduits sur mobile (pas de lueurs coûteuses, moins d'ennemis/particules).
// Passe à false pour garder tous les effets même sur mobile.
const LOW_FX = IS_MOBILE;
if (LOW_FX) {
  // Désactive les lueurs (shadowBlur), très coûteuses sur mobile
  Object.defineProperty(ctx, 'shadowBlur', { get() { return 0; }, set() {} });
}

let viewZoom = 1;
function resizeCanvas() {
  // Sur mobile, le zoom s'adapte à la taille de l'écran : on vise ~560 unités sur le petit côté
  // (petit téléphone = on voit plus large, tablette = zoom normal)
  const shortSide = Math.min(window.innerWidth, window.innerHeight);
  viewZoom = IS_MOBILE ? clampNum(shortSide / 560, 0.55, 1) : 1;
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
  // Rayon constant en pixels écran (~58px), quel que soit le zoom de la vue
  get STICK_RADIUS() { return 58 / viewZoom; },

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
  if (e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return; // ne bloque pas la saisie de texte
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
on('btnPlay', 'click', () => {
  audioEngine.init(); audioEngine.uiClick();
  buildWorldSelect();
  game.ui.showScreen(null);
  document.getElementById('worldMenu').classList.remove('hidden');
});
on('btnShop', 'click', () => {
  audioEngine.init(); audioEngine.uiClick();
  game.ui.buildShop();
  switchShopTab('upgrades');
  game.ui.showScreen('shopMenu');
});
/* ============================================================
   COMPTE + CLASSEMENT MONDIAL
============================================================ */
function setLbStatus(el, text, kind) {
  el.textContent = text || '';
  el.className = 'lb-status' + (kind ? ' ' + kind : '');
}
function showEl(id, visible) { document.getElementById(id).classList.toggle('hidden', !visible); }
const accStatusEl = () => document.getElementById('accStatus');

let accountReturnTo = 'menu';  // d'où l'écran compte a été ouvert : 'menu' | 'leaderboard' | 'gameover'
let recoveryToken = null;      // jetons reçus par le lien « mot de passe oublié »

function refreshAccountUI() {
  document.getElementById('lbAccountLabel').textContent = account.loggedIn
    ? 'Connecté : ' + (account.username || 'pseudo à choisir')
    : 'Non connecté';
  document.getElementById('btnLbAccount').textContent = account.loggedIn ? 'Mon compte' : 'Se connecter';

  const rec = !!recoveryToken;
  showEl('formRecovery', rec);
  showEl('accLoggedOut', !account.loggedIn && !rec);
  showEl('formUsername', account.loggedIn && !account.hasUsername && !rec);
  showEl('accLoggedIn', account.hasUsername && !rec);
  document.getElementById('accUsername').textContent = account.username;
  document.getElementById('accEmail').textContent = account.email;
}

function openAccount(from) {
  accountReturnTo = from;
  if (from === 'gameover') document.getElementById('gameoverOverlay').style.display = 'none';
  setLbStatus(accStatusEl(), account.enabled ? '' : account.configProblem(), account.enabled ? '' : 'warn');
  refreshAccountUI();
  game.ui.showScreen('accountMenu');
}

function closeAccount() {
  recoveryToken = null;
  if (accountReturnTo === 'gameover') {
    game.ui.showScreen(null);
    game.ui.prepareScoreSubmission(game);
    document.getElementById('gameoverOverlay').style.display = 'flex';
    autoSubmitScore();
  } else if (accountReturnTo === 'leaderboard') {
    game.ui.showScreen('leaderboardMenu');
    loadLeaderboard();
  } else {
    game.ui.showScreen('mainMenu');
  }
}

async function loadLeaderboard() {
  const status = document.getElementById('lbStatus');
  const table = document.getElementById('lbTable');
  const refreshBtn = document.getElementById('btnRefreshLeaderboard');
  table.textContent = '';
  refreshAccountUI();
  if (!leaderboard.enabled) {
    setLbStatus(status, account.configProblem(), 'warn');
    return;
  }
  setLbStatus(status, 'Chargement…');
  refreshBtn.disabled = true;
  try {
    const entries = await leaderboard.fetchTop();
    setLbStatus(status, '');
    leaderboard.renderTable(table, entries);
  } catch (e) {
    setLbStatus(status, e.message, 'error');
  } finally {
    refreshBtn.disabled = false;
  }
}

// Exécute une action de formulaire en bloquant les boutons pendant la requête
async function runAccountAction(form, workingText, action) {
  const status = accStatusEl();
  const buttons = form ? form.querySelectorAll('button') : [];
  buttons.forEach(b => { b.disabled = true; });
  setLbStatus(status, workingText);
  try {
    await action();
  } catch (e) {
    setLbStatus(status, e.message, 'error');
  } finally {
    buttons.forEach(b => { b.disabled = false; });
    refreshAccountUI();
  }
}

function switchAccountTab(tab) {
  document.getElementById('tabLogin').classList.toggle('active', tab === 'login');
  document.getElementById('tabSignup').classList.toggle('active', tab === 'signup');
  showEl('formLogin', tab === 'login');
  showEl('formSignup', tab === 'signup');
  setLbStatus(accStatusEl(), '');
}

on('btnLeaderboard', 'click', () => {
  audioEngine.init(); audioEngine.uiClick();
  game.ui.showScreen('leaderboardMenu');
  loadLeaderboard();
});
on('btnRefreshLeaderboard', 'click', () => { audioEngine.uiClick(); loadLeaderboard(); });
on('btnBackFromLeaderboard', 'click', () => { audioEngine.uiClick(); game.ui.showScreen('mainMenu'); });
on('btnLbAccount', 'click', () => { audioEngine.uiClick(); openAccount('leaderboard'); });
on('btnGoLogin', 'click', () => { audioEngine.uiClick(); openAccount('gameover'); });
on('btnBackFromAccount', 'click', () => { audioEngine.uiClick(); closeAccount(); });
on('tabLogin', 'click', () => { audioEngine.uiClick(); switchAccountTab('login'); });
on('tabSignup', 'click', () => { audioEngine.uiClick(); switchAccountTab('signup'); });

on('formLogin', 'submit', (e) => {
  e.preventDefault();
  if (!account.enabled) { setLbStatus(accStatusEl(), account.configProblem(), 'warn'); return; }
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  if (!email || !password) { setLbStatus(accStatusEl(), 'Entre ton email et ton mot de passe.', 'error'); return; }
  runAccountAction(e.target, 'Connexion…', async () => {
    await account.signIn(email, password);
    document.getElementById('loginPassword').value = '';
    try { await account.loadProfile(); } catch (err) { /* hors ligne : le pseudo sera relu plus tard */ }
    setLbStatus(accStatusEl(), account.hasUsername ? 'Connecté ! Bienvenue ' + account.username + '.' : 'Connecté ! Choisis maintenant ton pseudo.', 'ok');
  });
});

on('formSignup', 'submit', (e) => {
  e.preventDefault();
  if (!account.enabled) { setLbStatus(accStatusEl(), account.configProblem(), 'warn'); return; }
  const username = document.getElementById('signupUsername').value.trim();
  const email = document.getElementById('signupEmail').value.trim();
  const password = document.getElementById('signupPassword').value;
  const status = accStatusEl();
  if (!account.validateUsername(username)) { setLbStatus(status, 'Pseudo invalide : 3 à 16 caractères (lettres sans accent, chiffres, _ ou -, sans espace).', 'error'); return; }
  if (!email) { setLbStatus(status, 'Entre ton adresse email.', 'error'); return; }
  if (password.length < 8) { setLbStatus(status, 'Mot de passe trop court : 8 caractères minimum.', 'error'); return; }
  runAccountAction(e.target, 'Création du compte…', async () => {
    if (!(await account.isUsernameAvailable(username))) {
      setLbStatus(status, 'Ce pseudo est déjà pris ou réservé, choisis-en un autre.', 'error');
      return;
    }
    const res = await account.signUp(username, email, password);
    document.getElementById('signupPassword').value = '';
    if (res.confirmed) {
      try { await account.loadProfile(); } catch (err) { /* ignoré */ }
      setLbStatus(status, 'Compte créé ! Bienvenue ' + (account.username || username) + '.', 'ok');
    } else {
      switchAccountTab('login');
      document.getElementById('loginEmail').value = email;
      setLbStatus(status, 'Compte créé ! Clique sur le lien reçu par email pour le confirmer, puis connecte-toi.', 'ok');
    }
  });
});

on('btnForgot', 'click', () => {
  audioEngine.uiClick();
  if (!account.enabled) { setLbStatus(accStatusEl(), account.configProblem(), 'warn'); return; }
  const email = document.getElementById('loginEmail').value.trim();
  if (!email) { setLbStatus(accStatusEl(), "Entre ton email dans le champ ci-dessus, puis clique sur « Mot de passe oublié ? ».", 'error'); return; }
  runAccountAction(document.getElementById('formLogin'), 'Envoi du lien…', async () => {
    await account.recover(email);
    setLbStatus(accStatusEl(), "Si un compte existe pour cet email, un lien de réinitialisation vient d'être envoyé.", 'ok');
  });
});

on('formRecovery', 'submit', (e) => {
  e.preventDefault();
  const password = document.getElementById('recoveryPassword').value;
  if (password.length < 8) { setLbStatus(accStatusEl(), 'Mot de passe trop court : 8 caractères minimum.', 'error'); return; }
  if (!recoveryToken) return;
  runAccountAction(e.target, 'Enregistrement…', async () => {
    await account.updatePassword(recoveryToken.access_token, password);
    account.adoptTokens(recoveryToken);
    recoveryToken = null;
    document.getElementById('recoveryPassword').value = '';
    try { await account.loadProfile(); } catch (err) { /* ignoré */ }
    setLbStatus(accStatusEl(), 'Mot de passe modifié, tu es connecté.', 'ok');
  });
});

on('formUsername', 'submit', (e) => {
  e.preventDefault();
  const name = document.getElementById('usernameInput').value.trim();
  if (!account.validateUsername(name)) { setLbStatus(accStatusEl(), 'Pseudo invalide : 3 à 16 caractères (lettres sans accent, chiffres, _ ou -, sans espace).', 'error'); return; }
  runAccountAction(e.target, 'Enregistrement du pseudo…', async () => {
    await account.claimUsername(name);
    setLbStatus(accStatusEl(), 'Pseudo enregistré : ' + account.username, 'ok');
  });
});

on('btnAccLogout', 'click', async () => {
  audioEngine.uiClick();
  await account.signOut();
  refreshAccountUI();
  setLbStatus(accStatusEl(), 'Tu es déconnecté.', 'ok');
});

on('btnAccDelete', 'click', async () => {
  audioEngine.uiClick();
  if (!confirm('Supprimer définitivement ton compte, ton pseudo et ton score du classement ? Cette action est irréversible.')) return;
  const status = accStatusEl();
  setLbStatus(status, 'Suppression…');
  try {
    await account.deleteAccount();
    setLbStatus(status, 'Ton compte a été supprimé.', 'ok');
  } catch (e) {
    setLbStatus(status, e.message, 'error');
  }
  refreshAccountUI();
});

// Envoie le score de la dernière partie. Appelé automatiquement à la fin de la partie ;
// le bouton « Réessayer » le rappelle en cas d'échec (réseau coupé, session expirée...).
async function submitLastRun() {
  const result = game.lastRunResult;
  const status = document.getElementById('goLbStatus');
  const btn = document.getElementById('btnSubmitScore');
  if (!result || result.cheated || result.submitted || result.submitting || !leaderboard.enabled) return;
  if (!account.hasUsername) { game.ui.prepareScoreSubmission(game); return; }

  result.submitting = true;
  btn.classList.remove('hidden');
  btn.disabled = true;
  btn.textContent = '⏳ ENVOI…';
  setLbStatus(status, 'Envoi du score au classement…');
  try {
    const res = await leaderboard.submit(result);
    result.submitted = true;
    btn.textContent = '✔ ENVOYÉ';
    const rankTxt = res && res.rank ? ' Tu es n°' + res.rank + ' mondial !' : '';
    setLbStatus(status, (res && res.improved === false ? 'Ton meilleur score reste plus élevé.' : 'Score enregistré !') + rankTxt, 'ok');
  } catch (e) {
    btn.disabled = false;
    btn.textContent = "🔄 RÉESSAYER L'ENVOI";
    if (!account.loggedIn) game.ui.prepareScoreSubmission(game);   // session expirée : on propose de se reconnecter
    setLbStatus(status, e.message, 'error');
  } finally {
    result.submitting = false;
  }
}

// Envoi automatique à la fin de la partie, seulement si le joueur est connecté avec un pseudo
function autoSubmitScore() {
  const result = game.lastRunResult;
  if (!result || result.cheated || result.submitted || !leaderboard.enabled) return;
  if (account.hasUsername) submitLastRun();
}
on('btnSubmitScore', 'click', () => { audioEngine.uiClick(); submitLastRun(); });

// Onglets de la boutique : améliorations / skins
function switchShopTab(tab) {
  document.getElementById('tabShopUpgrades').classList.toggle('active', tab === 'upgrades');
  document.getElementById('tabShopSkins').classList.toggle('active', tab === 'skins');
  showEl('shopGrid', tab === 'upgrades');
  showEl('skinGrid', tab === 'skins');
}
on('tabShopUpgrades', 'click', () => { audioEngine.uiClick(); switchShopTab('upgrades'); });
on('tabShopSkins', 'click', () => { audioEngine.uiClick(); switchShopTab('skins'); game.ui.buildSkins(); });

// Diagnostic de connexion (aide à comprendre pourquoi le classement ne répond pas)
on('btnDiag', 'click', async () => {
  audioEngine.uiClick();
  const box = document.getElementById('diagResult');
  const btn = document.getElementById('btnDiag');
  box.classList.remove('hidden');
  box.textContent = 'Test en cours…';
  btn.disabled = true;
  try {
    const steps = await account.diagnose();
    box.textContent = '';
    steps.forEach(st => {
      const line = document.createElement('div');
      const mark = document.createElement('span');
      mark.className = st.ok ? 'ok' : 'ko';
      mark.textContent = st.ok ? '✔ ' : '✘ ';
      line.appendChild(mark);
      line.appendChild(document.createTextNode(st.label + (st.detail ? ' — ' + st.detail : '')));
      box.appendChild(line);
    });
  } catch (e) {
    box.textContent = 'Le test a échoué : ' + e.message;
  } finally {
    btn.disabled = false;
  }
});

account.onChange(refreshAccountUI);

on('btnStats', 'click', () => {
  audioEngine.init(); audioEngine.uiClick();
  game.ui.buildStats();
  game.ui.showScreen('statsMenu');
});
on('btnOptions', 'click', () => {
  audioEngine.init(); audioEngine.uiClick();
  game.ui.updateOptionsUI();
  buildDevPanel();
  game.ui.showScreen('optionsMenu');
});
on('btnBackFromShop', 'click', () => { audioEngine.uiClick(); game.ui.showScreen('mainMenu'); });
on('btnBackFromStats', 'click', () => { audioEngine.uiClick(); game.ui.showScreen('mainMenu'); });
on('btnBackFromOptions', 'click', () => { audioEngine.uiClick(); game.ui.showScreen('mainMenu'); });
on('btnBackFromWorld', 'click', () => {
  audioEngine.uiClick();
  document.getElementById('worldMenu').classList.add('hidden');
  game.ui.showScreen('mainMenu');
});
on('btnStartRun', 'click', () => {
  audioEngine.init(); audioEngine.resume(); audioEngine.uiClick();
  game.startRun();
});

/* ============================================================
   ÉVÉNEMENTS - OPTIONS
============================================================ */
on('btnToggleSound', 'click', () => {
  profile.settings.soundOn = !profile.settings.soundOn;
  audioEngine.setMuted(!profile.settings.soundOn);
  persistProfile();
  audioEngine.uiClick();
  game.ui.updateOptionsUI();
  updateMuteBtn();
});
on('btnToggleAutoFire', 'click', () => {
  profile.settings.autoFire = !profile.settings.autoFire;
  game.autoFire = profile.settings.autoFire;
  persistProfile();
  audioEngine.uiClick();
  game.ui.updateOptionsUI();
});
on('btnResetData', 'click', () => {
  if (confirm('Voulez-vous vraiment réinitialiser toutes vos données ? Cette action est irréversible.')) {
    profile = SaveManager.defaultData();
    persistProfile();
    audioEngine.uiClick();
    game.ui.updateMainMenuStats();
    game.ui.updateOptionsUI();
    game.ui.showToast('Données réinitialisées');
  }
});

on('btnDevActivate', 'click', () => {
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
on('btnDevDeactivate', 'click', () => {
  devManager.lock();
  audioEngine.uiClick();
  game.ui.updateOptionsUI();
  document.getElementById('devCodeMsg').textContent = '';
});
on('btnDevApplyOverrides', 'click', () => {
  const inputs = document.querySelectorAll('[data-override]');
  inputs.forEach(inp => devManager.setOverride(inp.dataset.override, inp.value));
  audioEngine.uiClick();
  game.ui.showToast('Valeurs dev appliquées');
});
on('btnDevResetOverrides', 'click', () => {
  devManager.resetOverrides();
  buildDevPanel();
  audioEngine.uiClick();
});
on('btnDevResetAllCheats', 'click', () => {
  devManager.resetCheats();
  buildDevPanel();
  audioEngine.uiClick();
  game.ui.showToast('Tous les cheats désactivés');
});
on('btnDevDebugCollisions', 'click', () => {
  devManager.toggleDebugCollisions();
  audioEngine.uiClick();
});
on('btnDevLevel', 'click', () => { devManager.giveLevel(); audioEngine.uiClick(); });
on('btnDevXP', 'click', () => { devManager.giveXP(1000); audioEngine.uiClick(); });
on('btnDevCredits', 'click', () => { devManager.giveCredits(10000); audioEngine.uiClick(); game.ui.updateMainMenuStats(); });
on('btnDevFullHp', 'click', () => { devManager.fullHp(); audioEngine.uiClick(); });
on('btnDevSpawnBoss', 'click', () => { devManager.spawnBoss(); audioEngine.uiClick(); });
on('btnDevSpawnElite', 'click', () => { devManager.spawnElite(); audioEngine.uiClick(); });
on('btnDevKillAll', 'click', () => { devManager.killAll(); audioEngine.uiClick(); });
on('btnDevKillBoss', 'click', () => { devManager.killBoss(); audioEngine.uiClick(); });
on('btnDevClearEnemies', 'click', () => { devManager.clearEnemies(); audioEngine.uiClick(); });
on('btnDevClosePanel', 'click', () => { devManager.togglePanel(); audioEngine.uiClick(); });

/* Panneau dev rapide (F2) - boutons dupliqués pour accès pendant la partie */
on('btnDevLevel2', 'click', () => { devManager.giveLevel(); audioEngine.uiClick(); });
on('btnDevXP2', 'click', () => { devManager.giveXP(1000); audioEngine.uiClick(); });
on('btnDevCredits2', 'click', () => { devManager.giveCredits(10000); audioEngine.uiClick(); game.ui.updateMainMenuStats(); });
on('btnDevFullHp2', 'click', () => { devManager.fullHp(); audioEngine.uiClick(); });
on('btnDevSpawnBoss2', 'click', () => { devManager.spawnBoss(); audioEngine.uiClick(); });
on('btnDevKillAll2', 'click', () => { devManager.killAll(); audioEngine.uiClick(); });

/* ============================================================
   ÉVÉNEMENTS - PAUSE / HUD
============================================================ */
function updateMuteBtn() {
  document.getElementById('muteBtn').textContent = audioEngine.muted ? '🔇' : '🔊';
}
on('pauseBtn', 'click', () => { audioEngine.uiClick(); game.togglePause(); });
on('btnResume', 'click', () => { audioEngine.uiClick(); game.togglePause(); });
on('btnRestartFromPause', 'click', () => {
  audioEngine.uiClick();
  document.getElementById('pauseOverlay').style.display = 'none';
  game.startRun();
});
on('btnQuitToMenu', 'click', () => {
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
on('muteBtn', 'click', () => {
  profile.settings.soundOn = !profile.settings.soundOn;
  audioEngine.setMuted(!profile.settings.soundOn);
  persistProfile();
  updateMuteBtn();
});
// iPhone Safari ne supporte pas le plein écran : on masque le bouton
if (!document.documentElement.requestFullscreen) { const fsb = document.getElementById('fsBtn'); if (fsb) fsb.style.display = 'none'; }
on('devBtn', 'click', () => { devManager.togglePanel(); audioEngine.uiClick(); });
on('fsBtn', 'click', () => {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
  else document.exitFullscreen().catch(() => {});
});

on('btnReplay', 'click', () => {
  audioEngine.uiClick();
  document.getElementById('gameoverOverlay').style.display = 'none';
  game.startRun();
});
on('btnGoMenu', 'click', () => {
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

// Lien reçu par email (confirmation de compte / mot de passe oublié)
(function handleEmailLink() {
  if (!account.enabled) return;
  const info = account.consumeUrlHash();
  if (info) {
    if (info.error) {
      openAccount('menu');
      setLbStatus(accStatusEl(), 'Lien invalide ou expiré : demande un nouveau lien. (' + info.error + ')', 'error');
    } else if (info.type === 'recovery') {
      recoveryToken = info;
      openAccount('menu');
      setLbStatus(accStatusEl(), 'Choisis ton nouveau mot de passe.');
    } else {
      account.adoptTokens(info);
      openAccount('menu');
      setLbStatus(accStatusEl(), 'Email confirmé, tu es connecté !', 'ok');
      account.loadProfile().catch(() => {}).then(refreshAccountUI);
    }
    return;
  }
  // Session déjà enregistrée : on la renouvelle et on relit le pseudo en arrière-plan
  if (account.loggedIn) account.ensureToken().then(() => account.loadProfile()).catch(() => {});
})();
refreshAccountUI();
