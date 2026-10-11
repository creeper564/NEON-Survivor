'use strict';

/* ============================================================
   LeaderboardManager
   Client du classement mondial (voir le dossier serveur-classement).
   - Fonctionne uniquement si GAME_CONFIG.leaderboardApiUrl est renseigné.
   - Toute erreur réseau est gérée : le jeu ne plante jamais si
     le joueur est hors ligne ou si le serveur est indisponible.
============================================================ */
class LeaderboardManager {
  constructor() {
    this.ID_KEY = 'neonSurvivors_playerId';
    this.playerId = this._loadOrCreateId();
  }

  get enabled() {
    return typeof GAME_CONFIG.leaderboardApiUrl === 'string' && GAME_CONFIG.leaderboardApiUrl.trim() !== '';
  }

  get baseUrl() {
    return GAME_CONFIG.leaderboardApiUrl.trim().replace(/\/+$/, '');
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

  async _request(path, options) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), GAME_CONFIG.leaderboardTimeoutMs || 8000);
    let res;
    try {
      res = await fetch(this.baseUrl + path, Object.assign({}, options, { signal: ctrl.signal }));
    } catch (e) {
      throw new Error(e && e.name === 'AbortError'
        ? 'Le serveur met trop de temps à répondre.'
        : 'Impossible de joindre le serveur (es-tu hors ligne ?).');
    } finally {
      clearTimeout(timer);
    }
    let data = null;
    try { data = await res.json(); } catch (e) { /* réponse non JSON */ }
    if (!res.ok) throw new Error((data && data.error) || ('Erreur serveur (' + res.status + ').'));
    return data;
  }

  async fetchTop(limit) {
    const n = limit || GAME_CONFIG.leaderboardSize || 50;
    const data = await this._request('/api/leaderboard?limit=' + encodeURIComponent(n), { method: 'GET' });
    return (data && Array.isArray(data.entries)) ? data.entries : [];
  }

  async submit(name, result) {
    return this._request('/api/score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        playerId: this.playerId,
        name: name,
        score: Math.floor(result.score),
        time: Math.floor(result.time),
        level: result.level,
        kills: result.kills,
        bossKills: result.bossKills
      })
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
