'use strict';

/* ============================================================
   SKINS
   Apparences du vaisseau, achetables avec les crédits gagnés en partie.
   Purement cosmétiques : aucun effet sur la puissance.
   Pour ajouter un skin : ajoute une entrée dans SKINS.
   shape : 'arrow' | 'dart' | 'wing' | 'orb'
   a / b : dégradé du vaisseau · glow : halo · bullet : couleur des tirs
============================================================ */
const SKINS = [
  { id: 'neon',    name: 'Néon',        price: 0,    shape: 'arrow', a: '#3fd4ff', b: '#7c4dff', glow: '#00f2ff', bullet: '#00f2ff', desc: "Le vaisseau d'origine." },
  { id: 'inferno', name: 'Inferno',     price: 300,  shape: 'dart',  a: '#ffb347', b: '#ff3d00', glow: '#ff6d3d', bullet: '#ff8a3d', desc: 'Forgé au cœur des volcans.' },
  { id: 'toxic',   name: 'Toxique',     price: 500,  shape: 'wing',  a: '#b6ff4a', b: '#00b36b', glow: '#7dff4a', bullet: '#9dff5a', desc: 'Radioactif et instable.' },
  { id: 'frost',   name: 'Givre',       price: 800,  shape: 'orb',   a: '#e8fbff', b: '#4cb8ff', glow: '#bdf4ff', bullet: '#bdf4ff', desc: 'Silencieux comme la glace.' },
  { id: 'royal',   name: 'Royal',       price: 1200, shape: 'wing',  a: '#ffe27a', b: '#8e44ff', glow: '#ffd54f', bullet: '#ffd54f', desc: "Digne d'un empereur." },
  { id: 'void',    name: 'Néant',       price: 2000, shape: 'dart',  a: '#ff2fd0', b: '#2a0a4a', glow: '#ff2fd0', bullet: '#ff2fd0', desc: 'Né entre deux dimensions.' },
  { id: 'rainbow', name: 'Arc-en-ciel', price: 4000, shape: 'orb',   rainbow: true, a: '#ff5555', b: '#5555ff', glow: '#ffffff', bullet: '#ffffff', desc: 'Toutes les couleurs, en mouvement.' }
];

function getSkin(id) {
  for (let i = 0; i < SKINS.length; i++) if (SKINS[i].id === id) return SKINS[i];
  return SKINS[0];
}

function currentSkin() {
  return getSkin(profile && profile.skins ? profile.skins.selected : 'neon');
}

// Couleurs du skin à l'instant t (en ms). Le skin arc-en-ciel change de teinte en continu.
function skinPalette(skin, t) {
  if (skin.rainbow) {
    const h = ((t || 0) / 12) % 360;
    return {
      a: 'hsl(' + h + ',100%,65%)',
      b: 'hsl(' + ((h + 70) % 360) + ',100%,55%)',
      glow: 'hsl(' + h + ',100%,60%)',
      bullet: 'hsl(' + ((h + 30) % 360) + ',100%,65%)'
    };
  }
  return skin;
}

// Couleur des tirs du skin équipé
function skinBulletColor() {
  return skinPalette(currentSkin(), performance.now()).bullet;
}

/* Dessine le vaisseau centré en (x, y), tourné de "angle", de rayon R.
   opts : { flash: bool (touché), time: ms, noGlow: bool } */
function drawShip(c, x, y, R, angle, skin, opts) {
  opts = opts || {};
  const pal = skinPalette(skin, opts.time || 0);
  c.save();
  c.translate(x, y);
  c.rotate(angle);
  c.shadowColor = opts.flash ? '#ff3355' : pal.glow;
  c.shadowBlur = opts.noGlow ? 0 : 16;
  const g = c.createLinearGradient(-R, 0, R, 0);
  g.addColorStop(0, opts.flash ? '#ff6666' : pal.a);
  g.addColorStop(1, opts.flash ? '#ff2233' : pal.b);
  c.fillStyle = g;
  c.beginPath();
  if (skin.shape === 'dart') {
    c.moveTo(R + 10, 0);
    c.lineTo(-R * 0.8, R * 0.55);
    c.lineTo(-R * 0.35, 0);
    c.lineTo(-R * 0.8, -R * 0.55);
  } else if (skin.shape === 'wing') {
    c.moveTo(R + 4, 0);
    c.lineTo(R * 0.2, R * 0.35);
    c.lineTo(-R * 0.9, R * 1.1);
    c.lineTo(-R * 0.5, R * 0.2);
    c.lineTo(-R * 0.5, -R * 0.2);
    c.lineTo(-R * 0.9, -R * 1.1);
    c.lineTo(R * 0.2, -R * 0.35);
  } else if (skin.shape === 'orb') {
    c.arc(0, 0, R * 0.85, 0, Math.PI * 2);
    c.moveTo(R + 7, 0);
    c.lineTo(R * 0.6, R * 0.32);
    c.lineTo(R * 0.6, -R * 0.32);
  } else { // 'arrow' (forme d'origine)
    c.moveTo(R + 6, 0);
    c.lineTo(-R * 0.7, R * 0.8);
    c.lineTo(-R * 0.3, 0);
    c.lineTo(-R * 0.7, -R * 0.8);
  }
  c.closePath();
  c.fill();
  c.strokeStyle = '#fff';
  c.lineWidth = 1.5;
  c.stroke();
  c.restore();
}
