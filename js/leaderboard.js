'use strict';

/* ============================================================
   LeaderboardManager
   Classement mondial. Parle directement à la base de données Supabase
   (API REST), sans serveur intermédiaire. L'envoi d'un score exige un
   compte connecté (voir account.js) : le pseudo vient du compte et ne
   peut pas être usurpé.
   Toute erreur réseau est gérée : le jeu ne plante jamais hors ligne.
============================================================ */
class LeaderboardManager {
  get enabled() { return account.enabled; }

  async fetchTop(limit) {
    const n = limit || GAME_CONFIG.leaderboardSize || 50;
    // Connecté : la base peut nous indiquer notre propre ligne (is_me)
    let token = null;
    if (account.loggedIn) { try { token = await account.ensureToken(); } catch (e) { token = null; } }
    let rows;
    try {
      rows = await account._rpcWith('get_leaderboard', { p_limit: n }, token, !!token);
    } catch (e) {
      if (token && /Session expirée/.test(e.message)) rows = await account._rpcWith('get_leaderboard', { p_limit: n }, null, false);
      else throw e;
    }
    if (!Array.isArray(rows)) return [];
    return rows.map(r => ({
      rank: Number(r.rank),
      name: String(r.name),
      score: Number(r.score),
      time: Number(r.time_sec),
      level: Number(r.level),
      kills: Number(r.kills),
      bossKills: Number(r.boss_kills),
      isMe: r.is_me === true
    }));
  }

  // Envoie le score du compte connecté (la base valide et garde le meilleur)
  async submit(result) {
    return account._rpc('submit_score', {
      p_score: Math.floor(result.score),
      p_time: Math.floor(result.time),
      p_level: result.level,
      p_kills: result.kills,
      p_boss_kills: result.bossKills
    });
  }

  // Remplit un conteneur avec le tableau du classement (textContent uniquement : pas d'injection HTML)
  renderTable(container, entries) {
    container.textContent = '';
    if (!entries.length) {
      const p = document.createElement('div');
      p.className = 'lb-empty';
      p.textContent = 'Aucun score pour le moment. Sois le premier !';
      container.appendChild(p);
      return;
    }
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
      if (e.isMe) tr.className = 'lb-me';
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
