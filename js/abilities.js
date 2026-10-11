'use strict';

/* ============================================================
   ABILITY_DEFS
   Catalogue de toutes les capacités disponibles. "max" définit
   le niveau maximum. Facilement extensible: ajouter une entrée
   suffit pour proposer une nouvelle capacité au level up.
============================================================ */
const ABILITY_DEFS = {
  drone: { name: "Drone d'Attaque", icon: '🛸', desc: 'Un drone orbite autour de vous et tire automatiquement sur les ennemis proches.', max: 5 },
  novaExplosion: { name: 'Explosion', icon: '💥', desc: 'Explosion périodique autour de vous.', max: 5 },
  lightning: { name: 'Éclair', icon: '⚡', desc: 'Frappe régulièrement un ennemi aléatoire.', max: 5 },
  bladeSpin: { name: 'Lame Orbitale', icon: '⚔', desc: 'Une ou plusieurs lames tournent autour de vous.', max: 5 },
  missile: { name: 'Missile Guidé', icon: '🚀', desc: 'Tire un missile qui traque automatiquement un ennemi.', max: 5 },
  aura: { name: 'Aura de Dégâts', icon: '🔥', desc: 'Endommage en continu les ennemis proches.', max: 5 },
  radialBurst: { name: 'Tir 360°', icon: '✳', desc: 'Tire des projectiles dans toutes les directions.', max: 5 },
  boomerang: { name: 'Boomerang', icon: '🪃', desc: 'Lance une lame qui traverse les ennemis puis revient.', max: 5 },
  slowField: { name: 'Champ de Ralentissement', icon: '❄', desc: 'Ralentit les ennemis proches.', max: 5 }
};

/* ============================================================
   ABILITY_EVOLUTIONS
   Évolutions optionnelles: quand deux conditions sont réunies
   (ex: capacité niveau 5 + arme niveau suffisant), une capacité
   évoluée est débloquée automatiquement.
============================================================ */
const ABILITY_EVOLUTIONS = [
  {
    key: 'droneEvolved',
    requires: (player) => (player.abilities.drone || 0) >= 5 && (player.weapon.upg.dmg || 0) >= 5,
    name: 'Drone Offensif Amélioré',
    icon: '🛰',
    desc: 'Le drone tire deux fois plus vite et inflige davantage de dégâts.',
    applied: false
  },
  {
    key: 'bladeEvolved',
    requires: (player) => (player.abilities.bladeSpin || 0) >= 5 && (player.abilities.aura || 0) >= 3,
    name: 'Tempête de Lames',
    icon: '🌀',
    desc: 'Les lames orbitales laissent une traînée de dégâts continue.',
    applied: false
  }
];

/* ============================================================
   AbilityManager
   Gère l'exécution/mise à jour de toutes les capacités actives
   du joueur, indépendamment de player.js pour rester extensible.
============================================================ */
class AbilityManager {
  constructor(player) {
    this.player = player;
    this.timers = {};
    this.droneAngle = 0;
    this.bladeAngle = 0;
    this.boomerangs = [];
    this.blades = [];
    this.droneX = null;
    this.droneY = null;
    this.auraRadius = 0;
    this.slowRadius = 0;
    this.evolutions = {};
  }

  checkEvolutions() {
    for (const evo of ABILITY_EVOLUTIONS) {
      if (!this.evolutions[evo.key] && evo.requires(this.player)) {
        this.evolutions[evo.key] = true;
        game.ui.showToast('Évolution débloquée : ' + evo.name);
      }
    }
  }

  cd(key) { return devManager.hasNoCooldown() ? 0.05 : this.timers[key]; }

  update(dt, ctxGame) {
    const player = this.player;
    const A = player.abilities;
    const cdMult = devManager.hasNoCooldown() ? 0.02 : 1;

    // Radial burst
    if (A.radialBurst) {
      this.timers.radial = (this.timers.radial === undefined ? 0 : this.timers.radial) - dt;
      if (this.timers.radial <= 0) {
        const count = 8 + A.radialBurst * 2;
        for (let i = 0; i < count; i++) {
          const angle = (i / count) * Math.PI * 2;
          const dmg = devManager.modifyDamage(player.weapon.damage * 0.6 * (1 + A.radialBurst * 0.1) / (devManager.unlocked ? devManager.overrides.damageMult : 1));
          const p = new Projectile(player.x, player.y, Math.cos(angle) * 400, Math.sin(angle) * 400, player.weapon.damage * 0.6 * (1 + A.radialBurst * 0.1), false, 0, '#ff2fd0', 4, 'player');
          p.maxRange = 400;
          ctxGame.projectiles.push(p);
        }
        this.timers.radial = Math.max(1.2, 3.5 - A.radialBurst * 0.3) * cdMult;
      }
    }

    // Drone
    if (A.drone) {
      this.droneAngle += dt * 2;
      const orbitR = 70;
      const dx = player.x + Math.cos(this.droneAngle) * orbitR;
      const dy = player.y + Math.sin(this.droneAngle) * orbitR;
      this.droneX = dx; this.droneY = dy;
      const evolved = this.evolutions.droneEvolved;
      this.timers.drone = (this.timers.drone === undefined ? 0 : this.timers.drone) - dt;
      if (this.timers.drone <= 0) {
        let nearest = null, nd = 99999;
        for (const e of ctxGame.enemies) {
          const d = dist(dx, dy, e.x, e.y);
          if (d < nd && d < 300) { nd = d; nearest = e; }
        }
        if (nearest) {
          const angle = Math.atan2(nearest.y - dy, nearest.x - dx);
          const mult = evolved ? 1.0 : 0.5;
          const dmg = player.weapon.damage * mult * (1 + A.drone * 0.2);
          const p = new Projectile(dx, dy, Math.cos(angle) * 500, Math.sin(angle) * 500, dmg, false, 0, '#66ff99', 4, 'player');
          p.maxRange = 350;
          ctxGame.projectiles.push(p);
        }
        this.timers.drone = (evolved ? 0.4 : 0.8) * cdMult;
      }
    }

    // Nova explosion
    if (A.novaExplosion) {
      this.timers.nova = (this.timers.nova === undefined ? 0 : this.timers.nova) - dt;
      if (this.timers.nova <= 0) {
        const radius = 130 + A.novaExplosion * 15;
        const dmg = player.weapon.damage * 0.8 * (1 + A.novaExplosion * 0.15);
        for (const e of ctxGame.enemies) {
          if (dist(player.x, player.y, e.x, e.y) < radius) ctxGame.damageEnemy(e, dmg, false);
        }
        ctxGame.particleSystem.spawnExplosionRing(player.x, player.y, radius, '#ffb800');
        audioEngine.explosion();
        this.timers.nova = Math.max(1.8, 4.5 - A.novaExplosion * 0.4) * cdMult;
      }
    }

    // Missile
    if (A.missile) {
      this.timers.missile = (this.timers.missile === undefined ? 0 : this.timers.missile) - dt;
      if (this.timers.missile <= 0) {
        let nearest = null, nd = 99999;
        for (const e of ctxGame.enemies) { const d = dist(player.x, player.y, e.x, e.y); if (d < nd) { nd = d; nearest = e; } }
        if (nearest) {
          const dmg = player.weapon.damage * 1.4 * (1 + A.missile * 0.2);
          ctxGame.missiles.push(new Missile(player.x, player.y, nearest, dmg, 380, 60));
        }
        this.timers.missile = Math.max(1.0, 3.0 - A.missile * 0.3) * cdMult;
      }
    }

    // Lightning
    if (A.lightning) {
      this.timers.lightning = (this.timers.lightning === undefined ? 0 : this.timers.lightning) - dt;
      if (this.timers.lightning <= 0) {
        if (ctxGame.enemies.length > 0) {
          const target = ctxGame.enemies[randInt(0, ctxGame.enemies.length - 1)];
          const dmg = player.weapon.damage * 1.2 * (1 + A.lightning * 0.2);
          ctxGame.damageEnemy(target, dmg, false);
          ctxGame.particleSystem.spawnLightning(player.x, player.y, target.x, target.y);
        }
        this.timers.lightning = Math.max(0.8, 2.2 - A.lightning * 0.2) * cdMult;
      }
    }

    // Boomerang
    if (A.boomerang) {
      this.timers.boomerang = (this.timers.boomerang === undefined ? 0 : this.timers.boomerang) - dt;
      if (this.timers.boomerang <= 0) {
        const dmg = player.weapon.damage * 0.7 * (1 + A.boomerang * 0.15);
        this.boomerangs.push({ x: player.x, y: player.y, angle: player.facingAngle, dist: 0, maxDist: 250, returning: false, damage: dmg, hitSet: new Set(), dead: false });
        this.timers.boomerang = Math.max(1.5, 3.0 - A.boomerang * 0.2) * cdMult;
      }
    }
    for (let i = this.boomerangs.length - 1; i >= 0; i--) {
      const b = this.boomerangs[i];
      const speed = 500;
      if (!b.returning) {
        b.dist += speed * dt;
        b.x = player.x + Math.cos(b.angle) * b.dist;
        b.y = player.y + Math.sin(b.angle) * b.dist;
        if (b.dist >= b.maxDist) b.returning = true;
      } else {
        const angleToPlayer = Math.atan2(player.y - b.y, player.x - b.x);
        b.x += Math.cos(angleToPlayer) * speed * dt;
        b.y += Math.sin(angleToPlayer) * speed * dt;
        if (dist(b.x, b.y, player.x, player.y) < 20) b.dead = true;
      }
      for (const e of ctxGame.enemies) {
        if (!b.hitSet.has(e.id) && dist(b.x, b.y, e.x, e.y) < e.radius + 10) {
          ctxGame.damageEnemy(e, b.damage, false);
          b.hitSet.add(e.id);
        }
      }
      if (b.dead) this.boomerangs.splice(i, 1);
    }

    // Aura
    if (A.aura) {
      this.timers.auraTick = (this.timers.auraTick === undefined ? 0 : this.timers.auraTick) - dt;
      const radius = 90 + A.aura * 10;
      this.auraRadius = radius;
      if (this.timers.auraTick <= 0) {
        const dmg = player.weapon.damage * 0.25 * (1 + A.aura * 0.15);
        for (const e of ctxGame.enemies) {
          if (dist(player.x, player.y, e.x, e.y) < radius) ctxGame.damageEnemy(e, dmg, false);
        }
        this.timers.auraTick = 0.4 * cdMult;
      }
    }

    // Blade spin
    if (A.bladeSpin) {
      this.bladeAngle += dt * 4;
      const evolved = this.evolutions.bladeEvolved;
      const bladeCount = 2 + A.bladeSpin;
      const orbitR = 55;
      this.timers.bladeTick = (this.timers.bladeTick === undefined ? 0 : this.timers.bladeTick) - dt;
      this.blades = [];
      const doDamageTick = this.timers.bladeTick <= 0;
      for (let i = 0; i < bladeCount; i++) {
        const angle = this.bladeAngle + (i / bladeCount) * Math.PI * 2;
        const bx = player.x + Math.cos(angle) * orbitR, by = player.y + Math.sin(angle) * orbitR;
        this.blades.push({ x: bx, y: by });
        if (doDamageTick) {
          for (const e of ctxGame.enemies) {
            if (dist(bx, by, e.x, e.y) < e.radius + 14) {
              const dmg = player.weapon.damage * 0.35 * (1 + A.bladeSpin * 0.15) * (evolved ? 1.4 : 1);
              ctxGame.damageEnemy(e, dmg, false);
            }
          }
        }
      }
      if (doDamageTick) this.timers.bladeTick = 0.15 * cdMult;
    }

    // Slow field
    if (A.slowField) {
      this.slowRadius = 110 + A.slowField * 20;
    }

    this.checkEvolutions();
  }

  draw(ctx, camX, camY) {
    const player = this.player;
    const x = player.x - camX, y = player.y - camY;

    if (player.abilities.slowField) {
      ctx.save();
      ctx.strokeStyle = 'rgba(100,200,255,0.3)';
      ctx.fillStyle = 'rgba(100,200,255,0.06)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, this.slowRadius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    if (player.abilities.aura) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255,120,50,0.4)';
      ctx.fillStyle = 'rgba(255,120,50,0.08)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, this.auraRadius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    for (const b of this.blades) {
      ctx.save();
      ctx.fillStyle = '#e0e0e0';
      ctx.shadowColor = '#fff'; ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(b.x - camX, b.y - camY, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    for (const b of this.boomerangs) {
      ctx.save();
      ctx.fillStyle = '#ffd54f';
      ctx.shadowColor = '#ffd54f'; ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(b.x - camX, b.y - camY, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    if (player.abilities.drone && this.droneX !== null) {
      ctx.save();
      ctx.fillStyle = '#66ff99';
      ctx.shadowColor = '#66ff99'; ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(this.droneX - camX, this.droneY - camY, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}
