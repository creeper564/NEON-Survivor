'use strict';

/* ============================================================
   CONFIGURATION DU JEU
   Seul fichier à modifier pour brancher le classement mondial.
   (Voir classement-supabase/LISEZMOI.md pour obtenir ces deux valeurs.)
============================================================ */
const GAME_CONFIG = {
  // Adresse de ton projet Supabase, sans slash final.
  // Exemple : 'https://abcdefghijklmnop.supabase.co'
  // Laisse vide ('') pour désactiver le classement (le jeu reste jouable hors ligne).
  supabaseUrl: 'https://umfiabwxslwzendhudty.supabase.co',

  // Clé PUBLIQUE de ton projet (« Publishable key », commence par sb_publishable_...,
  // ou l'ancienne clé « anon »). Elle peut être publiée sans risque : ne mets JAMAIS la clé « secret »
  // ni « service_role ».
  supabaseKey: 'sb_publishable_kmItRSNYa6HPWGLMxHES1g_leKT0BFD',

  // Durée maximale d'attente d'une réponse (millisecondes)
  leaderboardTimeoutMs: 8000,

  // Nombre de lignes affichées dans le classement
  leaderboardSize: 50
};
