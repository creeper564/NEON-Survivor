'use strict';

/* ============================================================
   CONFIGURATION DU JEU
   Seul fichier à modifier pour brancher le classement mondial.
============================================================ */
const GAME_CONFIG = {
  // URL de ton Worker Cloudflare, SANS slash final.
  // Exemple : 'https://classement.tondomaine.com' ou 'https://neon-survivors-classement.TON-COMPTE.workers.dev'
  // Laisse vide ('') pour désactiver le classement mondial (le jeu reste 100 % jouable hors ligne).
  leaderboardApiUrl: '',

  // Durée maximale d'attente d'une réponse du serveur (millisecondes)
  leaderboardTimeoutMs: 8000,

  // Nombre de lignes affichées dans le classement
  leaderboardSize: 50
};
