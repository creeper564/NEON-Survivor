'use strict';

/* ============================================================
   SaveManager
   Sauvegarde/chargement robuste via localStorage avec
   validation et fallback sur des valeurs par défaut en cas
   de corruption.
============================================================ */
const SaveManager = {
  KEY: 'neonSurvivors_save_v1',

  defaultData() {
    return {
      credits: 0,
      permanentUpgrades: { dmg: 0, hp: 0, speed: 0, xpGain: 0, crit: 0, armor: 0, creditsGain: 0 },
      stats: {
        gamesPlayed: 0,
        totalKills: 0,
        bossKills: 0,
        bestScore: 0,
        bestTime: 0,
        maxLevel: 1,
        totalCreditsEarned: 0,
        totalDamageDealt: 0
      },
      settings: { soundOn: true, musicVolume: 0.6, sfxVolume: 0.6, autoFire: false, playerName: '' },
      savedAt: Date.now()
    };
  },

  validate(data) {
    try {
      if (!data || typeof data !== 'object') return null;
      const d = this.defaultData();

      if (typeof data.credits === 'number' && isFinite(data.credits)) {
        d.credits = Math.max(0, data.credits);
      }
      if (data.permanentUpgrades && typeof data.permanentUpgrades === 'object') {
        for (const k in d.permanentUpgrades) {
          const v = data.permanentUpgrades[k];
          if (typeof v === 'number' && isFinite(v)) d.permanentUpgrades[k] = Math.max(0, Math.floor(v));
        }
      }
      if (data.stats && typeof data.stats === 'object') {
        for (const k in d.stats) {
          const v = data.stats[k];
          if (typeof v === 'number' && isFinite(v)) d.stats[k] = Math.max(0, v);
        }
      }
      if (data.settings && typeof data.settings === 'object') {
        if (typeof data.settings.soundOn === 'boolean') d.settings.soundOn = data.settings.soundOn;
        if (typeof data.settings.musicVolume === 'number') d.settings.musicVolume = clampNum(data.settings.musicVolume, 0, 1);
        if (typeof data.settings.sfxVolume === 'number') d.settings.sfxVolume = clampNum(data.settings.sfxVolume, 0, 1);
        if (typeof data.settings.autoFire === 'boolean') d.settings.autoFire = data.settings.autoFire;
        if (typeof data.settings.playerName === 'string') d.settings.playerName = data.settings.playerName.slice(0, 16);
      }
      d.savedAt = data.savedAt || Date.now();
      return d;
    } catch (e) {
      return null;
    }
  },

  load() {
    try {
      const raw = localStorage.getItem(this.KEY);
      if (!raw) return this.defaultData();
      const parsed = JSON.parse(raw);
      const valid = this.validate(parsed);
      return valid || this.defaultData();
    } catch (e) {
      console.warn('Sauvegarde corrompue, réinitialisation.', e);
      return this.defaultData();
    }
  },

  save(data) {
    try {
      data.savedAt = Date.now();
      localStorage.setItem(this.KEY, JSON.stringify(data));
      return true;
    } catch (e) {
      console.warn('Impossible de sauvegarder.', e);
      return false;
    }
  },

  reset() {
    try {
      localStorage.removeItem(this.KEY);
      return true;
    } catch (e) {
      return false;
    }
  }
};

function clampNum(v, min, max) { return Math.max(min, Math.min(max, v)); }
