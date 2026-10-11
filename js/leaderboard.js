'use strict';

/* ============================================================
   LeaderboardManager
   Client du classement mondial. Parle directement à la base de données
   Supabase (API REST), sans serveur intermédiaire.
   - Fonctionne uniquement si GAME_CONFIG.supabaseUrl et supabaseKey sont renseignés.
   - Toute erreur réseau est gérée : le jeu ne plante jamais si
     le joueur est hors ligne ou si le serveur est indisponible.
============================================================ */
class LeaderboardManager {
  constructor() {
    this.ID_KEY = 'neonSurvivors_playerId';
    this.playerId = this._loadOrCreateId();
  }

  get enabled() {
    return typeof GAME_CONFIG.supabaseUrl === 'string' && GAME_CONFIG.supabaseUrl.trim() !== '' &&
           typeof GAME_CONFIG.supabaseKey === 'string' && GAME_CONFIG.supabaseKey.trim() !== '';
  }

  get baseUrl() {
    return GAME_CONFIG.supabaseUrl.trim().replace(/\/+$/, '');
  }

  // Identifiant anonyme aléatoire propre à cet appareil (jamais affiché ni publié)
  _loadOrCreateId() {
    try {
      const saved = localStorage.getItem(this.ID_KEY);
      if (saved && /^[a-f0-9]{32}$/.test(saved)) return saved;
    } catch (e) { /* localStorage indisponible */ }
    const id = this._randomHex(32);
    try { localStorage.setItem(this.ID_KEY, id); } catch (e) { /* ignoré */ }
    return id;
  }

  _randomHex(len) {
    let out = '';
    if (window.crypto && window.crypto.getRandomValues) {
      const bytes = new Uint8Array(len / 2);
      window.crypto.getRandomValues(bytes);
      bytes.forEach(b => { out += b.toString(16).padStart(2, '0'); });
    } else {
      for (let i = 0; i < len; i++) out += Math.floor(Math.random() * 16).toString(16);
    }
    return out;
  }

  // Même règle que le serveur : lettres, chiffres, espace, _ et -, 2 à 16 caractères
  cleanName(raw) {
    if (typeof raw !== 'string') return '';
    let s = raw;
    try { s = s.normalize('NFKC'); } catch (e) { /* ignoré */ }
    try { s = s.replace(/[^\p{L}\p{N} _-]/gu, ''); } catch (e) { s = s.replace(/[^A-Za-z0-9 _-]/g, ''); }
    return s.replace(/\s+/g, ' ').trim().slice(0, 16);
  }

  // Appelle une fonction SQL du classement (API REST de Supabase)
  async _rpc(fn, args) {
    const key = GAME_CONFIG.supabaseKey.trim();
    const headers = { 'Content-Type': 'application/json', 'apikey': key };
    // Les anciennes clés « anon » sont des JWT ; les nouvelles clés sb_publishable_ ne doivent
    // aller que dans l'en-tête apikey.
    if (key.startsWith('eyJ')) headers['Authorization'] = 'Bearer ' + key;

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), GAME_CONFIG.leaderboardTimeoutMs || 8000);
    let res;
    try {
      res = await fetch(this.baseUrl + '/rest/v1/rpc/' + fn, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(args || {}),
        signal: ctrl.signal
      });
    } catch (e) {
      throw new Error(e && e.name === 'AbortError'
        ? 'Le serveur met trop de temps à répondre.'
        : 'Impossible de joindre le serveur (es-tu hors ligne ?).');
    } finally {
      clearTimeout(timer);
    }

    let data = null;
    try { data = await res.json(); } catch (e) { /* réponse non JSON */ }
    if (res.ok) return data;

    // Refus volontaire de la base (pseudo invalide, trop rapide...) : on affiche son message
    if (data && data.code === 'P0001' && typeof data.message === 'string') throw new Error(data.message);
    if (res.status === 401 || res.status === 403) throw new Error('Clé Supabase refusée : vérifie supabaseKey dans js/config.js.');
    if (res.status === 404) throw new Error("Classement introuvable : le script classement.sql a-t-il été exécuté dans Supabase ?");
    throw new Error('Erreur du serveur (' + res.status + ').');
  }

  async fetchTop(limit) {
    const n = limit || GAME_CONFIG.leaderboardSize || 50;
    const rows = await this._rpc('get_leaderboard', { p_limit: n });
    if (!Array.isArray(rows)) return [];
    return rows.map(r => ({
      rank: Number(r.rank),
      name: String(r.name),
      score: Number(r.score),
      time: Number(r.time_sec),
      level: Number(r.level),
      kills: Number(r.kills),
      bossKills: Number(r.boss_kills)
    }));
  }

  async submit(name, result) {
    return this._rpc('submit_score', {
      p_player_id: this.playerId,
      p_name: name,
      p_score: Math.floor(result.score),
      p_time: Math.floor(result.time),
      p_level: result.level,
      p_kills: result.kills,
      p_boss_kills: result.bossKills
    });
  }

  // Remplit un conteneur avec le tableau du classement (textContent uniquement : pas d'injection HTML)
  renderTable(container, entries, myName) {
    container.textContent = '';
    if (!entries.length) {
      const p = document.createElement('div');
      p.className = 'lb-empty';
      p.textContent = 'Aucun score pour le moment. Sois le premier !';
      container.appendChild(p);
      return;
    }
    const me = (myName || '').toLowerCase();
    const table = document.createElement('table');
    table.className = 'lb-table';
    const head = document.createElement('tr');
    ['#', 'Joueur', 'Score', 'Temps', 'Niv.'].forEach((h, i) => {
      const th = document.createElement('th');
      th.textContent = h;
      if (i >= 2) th.className = 'lb-num';
      head.appendChild(th);
    });
    table.appendChild(head);

    entries.forEach((e) => {
      const tr = document.createElement('tr');
      if (me && String(e.name).toLowerCase() === me) tr.className = 'lb-me';
      const medal = e.rank === 1 ? '🥇' : e.rank === 2 ? '🥈' : e.rank === 3 ? '🥉' : String(e.rank);
      const cells = [medal, String(e.name), Number(e.score).toLocaleString('fr-FR'), fmtTime(e.time), String(e.level)];
      cells.forEach((c, i) => {
        const td = document.createElement('td');
        td.textContent = c;
        if (i >= 2) td.className = 'lb-num';
        tr.appendChild(td);
      });
      table.appendChild(tr);
    });
    container.appendChild(table);
  }
}

const leaderboard = new LeaderboardManager();
