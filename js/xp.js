'use strict';

/* ============================================================
   ExperienceOrb
   Cristal d'XP laissé au sol par les ennemis morts, attiré
   vers le joueur lorsqu'il entre dans son rayon de récupération.
============================================================ */
class ExperienceOrb {
  constructor(x, y, value) {
    this.x = x; this.y = y; this.value = value;
    this.dead = false;
    this.radius = 6;
    this.attracted = false;
    this.pulse = Math.random() * Math.PI * 2;
  }

  update(dt, player) {
    this.pulse += dt * 6;
    const d = dist(this.x, this.y, player.x, player.y);
    const pickupRadius = devManager.hasXPMagnet() ? 5000 : player.xpPickupRadius;
    if (d < pickupRadius) this.attracted = true;
    if (this.attracted) {
      const speed = clampNum(700 - d * 2, 250, 900);
      const ang = Math.atan2(player.y - this.y, player.x - this.x);
      this.x += Math.cos(ang) * speed * dt;
      this.y += Math.sin(ang) * speed * dt;
      if (d < 18) {
        this.dead = true;
        player.gainXP(this.value);
        audioEngine.xpPickup();
      }
    }
  }

  draw(ctx, camX, camY) {
    const p = Math.sin(this.pulse) * 0.3 + 0.7;
    ctx.save();
    ctx.shadowColor = '#00e5ff';
    ctx.shadowBlur = 10 * p;
    ctx.fillStyle = 'rgba(0,229,255,0.85)';
    const s = this.radius;
    const cx = this.x - camX, cy = this.y - camY;
    ctx.beginPath();
    ctx.moveTo(cx, cy - s);
    ctx.lineTo(cx + s, cy);
    ctx.lineTo(cx, cy + s);
    ctx.lineTo(cx - s, cy);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

/* ============================================================
   CreditCoin
============================================================ */
class CreditCoin {
  constructor(x, y, value) {
    this.x = x; this.y = y; this.value = value;
    this.dead = false;
    this.radius = 6;
    this.attracted = false;
    this.pulse = Math.random() * Math.PI * 2;
  }

  update(dt, player, onCollect) {
    this.pulse += dt * 6;
    const d = dist(this.x, this.y, player.x, player.y);
    const pickupRadius = devManager.hasXPMagnet() ? 5000 : player.xpPickupRadius;
    if (d < pickupRadius) this.attracted = true;
    if (this.attracted) {
      const speed = clampNum(700 - d * 2, 250, 900);
      const ang = Math.atan2(player.y - this.y, player.x - this.x);
      this.x += Math.cos(ang) * speed * dt;
      this.y += Math.sin(ang) * speed * dt;
      if (d < 18) {
        this.dead = true;
        if (onCollect) onCollect(this.value);
      }
    }
  }

  draw(ctx, camX, camY) {
    const p = Math.sin(this.pulse) * 0.3 + 0.7;
    ctx.save();
    ctx.shadowColor = '#ffd54f';
    ctx.shadowBlur = 10 * p;
    ctx.fillStyle = '#ffd54f';
    ctx.beginPath();
    ctx.arc(this.x - camX, this.y - camY, this.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ff9800';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }
}
