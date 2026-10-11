'use strict';

/* ============================================================
   Weapon (Blaster)
   Arme principale du joueur. Statistiques calculées à partir
   des niveaux d'amélioration accumulés + bonus permanents de
   la boutique + overrides du mode dev.
============================================================ */
class Weapon {
  constructor() {
    this.baseDamage = 10;
    this.baseFireRate = 2.2; // tirs par seconde
    this.projectileCount = 1;
    this.projectileSpeed = 620;
    this.range = 560;
    this.critChance = 0.05;
    this.critMult = 2.0;
    this.cooldown = 0;
    this.upg = { dmg: 0, rate: 0, count: 0, speed: 0, range: 0, crit: 0, pierce: 0 };
  }

  get damage() {
    let base = this.baseDamage * (1 + this.upg.dmg * 0.10) * (1 + profile.permanentUpgrades.dmg * 0.05);
    return devManager.modifyDamage(base);
  }
  get fireRate() {
    const base = this.baseFireRate * (1 + this.upg.rate * 0.20);
    return devManager.modifyFireRate(base);
  }
  get count() { return this.projectileCount + this.upg.count; }
  get speed() { return this.projectileSpeed * (1 + this.upg.speed * 0.10); }
  get rangeVal() { return this.range * (1 + this.upg.range * 0.15); }
  get crit() {
    return clampNum(this.critChance + this.upg.crit * 0.10 + profile.permanentUpgrades.crit * 0.05, 0, 0.9);
  }
  get pierce() { return this.upg.pierce; }
}

/* ============================================================
   WEAPON_UPGRADES
   Définitions des améliorations d'arme proposées au level up.
   Stockées ici (extensible) plutôt que codées en dur ailleurs.
============================================================ */
const WEAPON_UPGRADES = [
  { key: 'dmg', icon: '🗡', name: '+10% Dégâts', desc: "Augmente les dégâts de l'arme principale.", apply: (p) => { p.weapon.upg.dmg++; } },
  { key: 'rate', icon: '⚡', name: '+20% Cadence de tir', desc: 'Tirez plus rapidement.', apply: (p) => { p.weapon.upg.rate++; } },
  { key: 'count', icon: '🎯', name: '+1 Projectile', desc: 'Ajoute un projectile supplémentaire.', apply: (p) => { p.weapon.upg.count++; } },
  { key: 'pspeed', icon: '💨', name: '+10% Vitesse projectiles', desc: 'Vos tirs vont plus vite.', apply: (p) => { p.weapon.upg.speed++; } },
  { key: 'range', icon: '📏', name: '+15% Portée', desc: 'Augmente la portée des tirs.', apply: (p) => { p.weapon.upg.range++; } },
  { key: 'crit', icon: '💢', name: '+10% Critique', desc: 'Chance de coup critique augmentée.', apply: (p) => { p.weapon.upg.crit++; } },
  { key: 'pierce', icon: '➵', name: 'Perforation +1', desc: 'Les projectiles traversent un ennemi de plus.', apply: (p) => { p.weapon.upg.pierce++; } }
];
