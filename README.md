# ⚡ NEON SURVIVORS

**Jeu de survie / action en vue du dessus, 100 % jouable hors ligne dans ton navigateur.**

Affronte des vagues de monstres, ramasse l'XP, monte de niveau, choisis tes améliorations et terrasse des boss dans une arène néon. Aucun serveur, aucune installation, aucune connexion Internet : ouvre `index.html` et joue.

---

## 🎮 Lancer le jeu

1. Télécharge et dézippe le projet.
2. Garde l'arborescence intacte.
3. Double-clique sur `index.html`.

C'est tout. Aucune dépendance, aucun CDN.

---

## 🕹️ Contrôles

| Action | Touche |
|---|---|
| Avancer / Reculer | `Z` / `S` |
| Gauche / Droite | `Q` / `D` |
| Viser | Souris |
| Tirer | Clic gauche |
| Pause | `Échap` ou `P` |

Pensé pour les claviers **AZERTY**. Les déplacements en diagonale ne sont pas plus rapides.
Un mode **tir automatique** (vers la souris) est activable dans Options.

---

## ✨ Fonctionnalités

### Gameplay
- Arène géante avec caméra qui suit le joueur
- Vagues d'ennemis de plus en plus nombreuses et résistantes
- XP, niveaux et choix de **3 améliorations aléatoires** à chaque level up
- Boss périodiques avec barre de vie dédiée

### Ennemis
- **Grunt** : ennemi standard
- **Runner** : très rapide, fragile
- **Tank** : lent, beaucoup de PV
- **Shooter** : tire à distance
- **Élite** : rare et redoutable
- **Boss** : Golem de Pierre, Mutant Déchaîné, Machine de Guerre (comportements différents, invocations)

### Arme et capacités
- Blaster évolutif : dégâts, cadence, projectiles multiples, portée, critiques, perforation
- 9 capacités améliorables : Drone, Explosion, Éclair, Lame orbitale, Missile guidé, Aura, Tir 360°, Boomerang, Champ de ralentissement
- **Évolutions** de capacités en combinant certains niveaux

### Progression permanente
- Monnaie : **crédits**
- Boutique : dégâts, PV, vitesse, XP, critique, armure, gain de crédits
- Prix progressifs
- Sauvegarde automatique avec `localStorage`, protégée contre les données corrompues

### Menus et interface
- Menu principal, boutique, statistiques, options, pause, game over
- 4 arènes : Plaine, Laboratoire, Ville abandonnée, Zone volcanique
- HUD : PV, XP, niveau, temps, score, vague, capacités actives
- Bouton plein écran et bouton muet

### Technique
- HTML5, CSS3 et JavaScript natif, Canvas 2D
- Sons générés en direct avec la Web Audio API (aucun fichier audio)
- Graphismes 100 % dessinés en code (aucune image)
- `requestAnimationFrame`, delta time, particules limitées

---

## 📁 Structure du projet

```text
mon-jeu/
├── index.html
├── css/
│   └── style.css
├── js/
│   ├── main.js          # initialisation, entrées, événements
│   ├── game.js          # boucle principale, caméra, collisions
│   ├── player.js        # joueur
│   ├── weapons.js       # arme principale et améliorations
│   ├── abilities.js     # capacités et évolutions
│   ├── projectiles.js   # projectiles et missiles
│   ├── enemies.js       # ennemis et système de spawn
│   ├── boss.js          # boss
│   ├── xp.js            # orbes d'XP et crédits
│   ├── particles.js     # particules et textes flottants
│   ├── ui.js            # menus, HUD, boutique
│   ├── audio.js         # sons procéduraux
│   ├── save.js          # sauvegarde localStorage
│   └── dev.js           # mode développeur
└── assets/
    └── README.txt
```

---

## 🧩 Extensibilité

Le code est organisé pour ajouter facilement du contenu :
- nouvelle capacité → une entrée dans `ABILITY_DEFS` (`abilities.js`)
- nouvel ennemi → une entrée dans `ENEMY_DEFS` (`enemies.js`)
- nouvelle amélioration → `WEAPON_UPGRADES` / `PLAYER_UPGRADES`
- nouvel objet de boutique → `SHOP_ITEMS` (`ui.js`)
- nouvelle arène → `WORLDS` (`game.js`)

---

## 📜 Licence

Projet personnel. Tous les visuels, sons, noms et mécaniques sont originaux, sans asset tiers.
