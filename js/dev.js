'use strict';

/* ============================================================
   DEV CONFIG
   Ce système sert uniquement au debug local hors-ligne.
   Ce n'est PAS un système d'authentification/sécurité réelle.
============================================================ */
const DEV_CONFIG = {
  enabledByCode: true,
  accessCode: 'DEV-2026-ADMIN'
};

/* ============================================================
   DevManager
   Centralise tout l'état et la logique du mode développeur.
   Le reste du jeu interroge devManager.isX() / modifyX() au
   lieu de coder les cheats directement dans player.js etc.
============================================================ */
class DevManager {
  constructor() {
    this.unlocked = false;      // le bon code a-t-il été entré
    this.panelOpen = false;

    this.cheats = {
      invincible: false,
      infiniteXP: false,
      autoFire: false,
      noCooldown: false,
      damageX10: false,
      speedX2: false,
      xpMagnet: false,
      godMode: false
    };

    this.debugCollisions = false;

    // valeurs temporaires modifiables en direct (multiplicateurs, non persistés)
    this.overrides = {
      damageMult: 1,
      speedMult: 1,
      fireRateMult: 1,
      xpMult: 1,
      spawnRateMult: 1,
      enemyHpMult: 1,
      enemySpeedMult: 1
    };

    this.listeners = [];
  }

  onChange(fn) { this.listeners.push(fn); }
  _notify() { this.listeners.forEach(fn => { try { fn(); } catch (e) {} }); }

  tryUnlock(code) {
    if (DEV_CONFIG.enabledByCode && code === DEV_CONFIG.accessCode) {
      this.unlocked = true;
      this._notify();
      return true;
    }
    return false;
  }

  lock() {
    this.unlocked = false;
    this.panelOpen = false;
    this.resetCheats();
    this._notify();
  }

  togglePanel() {
    if (!this.unlocked) return;
    this.panelOpen = !this.panelOpen;
    this._notify();
  }

  setCheat(key, value) {
    if (!this.unlocked) return;
    if (!(key in this.cheats)) return;
    this.cheats[key] = value;
    if (key === 'godMode') this._applyGodMode(value);
    this._notify();
  }

  toggleCheat(key) {
    if (!this.unlocked) return;
    this.setCheat(key, !this.cheats[key]);
  }

  _applyGodMode(on) {
    if (on) {
      this.cheats.invincible = true;
      this.overrides.damageMult = 5;
      this.overrides.speedMult = 2;
      this.overrides.xpMult = 5;
      this.overrides.fireRateMult = 2.5;
      this.cheats.xpMagnet = true;
    } else {
      this.cheats.invincible = false;
      this.overrides.damageMult = 1;
      this.overrides.speedMult = 1;
      this.overrides.xpMult = 1;
      this.overrides.fireRateMult = 1;
      this.cheats.xpMagnet = false;
    }
  }

  setOverride(key, value) {
    if (!this.unlocked) return;
    if (!(key in this.overrides)) return;
    const num = parseFloat(value);
    if (isNaN(num) || num < 0) return;
    this.overrides[key] = num;
    this._notify();
  }

  resetOverrides() {
    this.overrides = {
      damageMult: 1, speedMult: 1, fireRateMult: 1,
      xpMult: 1, spawnRateMult: 1, enemyHpMult: 1, enemySpeedMult: 1
    };
    this._notify();
  }

  resetCheats() {
    for (const k in this.cheats) this.cheats[k] = false;
    this.resetOverrides();
    this.debugCollisions = false;
    this._notify();
  }

  toggleDebugCollisions() {
    if (!this.unlocked) return;
    this.debugCollisions = !this.debugCollisions;
    this._notify();
  }

  /* ---- Requêtes utilisées par le reste du jeu ---- */
  isInvincible() { return this.unlocked && this.cheats.invincible; }
  hasInfiniteXP() { return this.unlocked && this.cheats.infiniteXP; }
  hasAutoFireCheat() { return this.unlocked && this.cheats.autoFire; }
  hasNoCooldown() { return this.unlocked && this.cheats.noCooldown; }
  hasXPMagnet() { return this.unlocked && this.cheats.xpMagnet; }

  modifyDamage(baseDamage) {
    if (!this.unlocked) return baseDamage;
    let d = baseDamage * this.overrides.damageMult;
    if (this.cheats.damageX10) d *= 10;
    return d;
  }

  modifySpeed(baseSpeed) {
    if (!this.unlocked) return baseSpeed;
    let s = baseSpeed * this.overrides.speedMult;
    if (this.cheats.speedX2) s *= 2;
    return s;
  }

  modifyFireRate(baseRate) {
    if (!this.unlocked) return baseRate;
    let r = baseRate * this.overrides.fireRateMult;
    if (this.cheats.noCooldown) r *= 50;
    return r;
  }

  modifyXPGain(baseXP) {
    if (!this.unlocked) return baseXP;
    let x = baseXP * this.overrides.xpMult;
    if (this.cheats.infiniteXP) x *= 20;
    return x;
  }

  modifySpawnRate(baseInterval) {
    if (!this.unlocked || this.overrides.spawnRateMult <= 0) return baseInterval;
    return baseInterval / this.overrides.spawnRateMult;
  }

  modifyEnemyHp(baseHp) {
    if (!this.unlocked) return baseHp;
    return baseHp * this.overrides.enemyHpMult;
  }

  modifyEnemySpeed(baseSpeed) {
    if (!this.unlocked) return baseSpeed;
    return baseSpeed * this.overrides.enemySpeedMult;
  }

  /* ---- Actions instantanées : branchées par ui.js/game.js via callbacks ---- */
  registerActions(actions) {
    // actions = { giveLevel, giveXP, giveCredits, fullHp, spawnBoss, spawnElite, killAll, killBoss, clearEnemies }
    this.actions = actions;
  }
  giveLevel() { if (this.unlocked && this.actions) this.actions.giveLevel(); }
  giveXP(amount) { if (this.unlocked && this.actions) this.actions.giveXP(amount); }
  giveCredits(amount) { if (this.unlocked && this.actions) this.actions.giveCredits(amount); }
  fullHp() { if (this.unlocked && this.actions) this.actions.fullHp(); }
  spawnBoss() { if (this.unlocked && this.actions) this.actions.spawnBoss(); }
  spawnElite() { if (this.unlocked && this.actions) this.actions.spawnElite(); }
  killAll() { if (this.unlocked && this.actions) this.actions.killAll(); }
  killBoss() { if (this.unlocked && this.actions) this.actions.killBoss(); }
  clearEnemies() { if (this.unlocked && this.actions) this.actions.clearEnemies(); }
}

const devManager = new DevManager();

/* ============================================================
   Raccourcis clavier - actifs uniquement si unlocked = true
============================================================ */
window.addEventListener('keydown', (e) => {
  if (!devManager.unlocked) return;
  switch (e.key) {
    case 'F2': e.preventDefault(); devManager.togglePanel(); break;
    case 'F3': e.preventDefault(); devManager.toggleCheat('invincible'); break;
    case 'F4': e.preventDefault(); devManager.giveLevel(); break;
    case 'F5': e.preventDefault(); devManager.giveXP(1000); break;
    case 'F6': e.preventDefault(); devManager.giveCredits(10000); break;
    case 'F7': e.preventDefault(); devManager.killAll(); break;
    case 'F8': e.preventDefault(); devManager.spawnBoss(); break;
    case 'F9': e.preventDefault(); devManager.fullHp(); break;
  }
});
