'use strict';

/* ============================================================
   AccountManager
   Comptes joueurs via Supabase Auth (email + mot de passe), sans SDK :
   uniquement l'API REST. Gère l'inscription, la connexion, le renouvellement
   automatique de la session, le mot de passe oublié et la suppression du compte.

   Le mot de passe n'est jamais stocké dans le jeu : seul un jeton de session
   (access_token / refresh_token) est conservé dans le navigateur.
============================================================ */
class AccountManager {
  constructor() {
    this.KEY = 'neonSurvivors_session_v1';
    this.session = this._load();   // { access_token, refresh_token, expires_at, email, username }
    this._refreshing = null;
    this.listeners = [];
  }

  /* ---------- État ---------- */
  get enabled() {
    return typeof GAME_CONFIG.supabaseUrl === 'string' && GAME_CONFIG.supabaseUrl.trim() !== '' &&
           typeof GAME_CONFIG.supabaseKey === 'string' && GAME_CONFIG.supabaseKey.trim() !== '';
  }
  get baseUrl() { return GAME_CONFIG.supabaseUrl.trim().replace(/\/+$/, ''); }
  get loggedIn() { return !!(this.session && this.session.refresh_token); }
  get username() { return (this.session && this.session.username) || ''; }
  get email() { return (this.session && this.session.email) || ''; }
  get hasUsername() { return this.loggedIn && !!this.username; }

  onChange(fn) { this.listeners.push(fn); }
  _notify() { this.listeners.forEach(fn => { try { fn(); } catch (e) { /* ignoré */ } }); }

  _load() {
    try {
      const raw = localStorage.getItem(this.KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (s && typeof s === 'object' && typeof s.refresh_token === 'string') return s;
    } catch (e) { /* données corrompues */ }
    return null;
  }
  _save() {
    try {
      if (this.session) localStorage.setItem(this.KEY, JSON.stringify(this.session));
      else localStorage.removeItem(this.KEY);
    } catch (e) { /* ignoré */ }
  }
  _clear() { this.session = null; this._save(); this._notify(); }

  /* ---------- Requêtes vers /auth/v1 ---------- */
  _headers(token) {
    const key = GAME_CONFIG.supabaseKey.trim();
    const h = { 'Content-Type': 'application/json', 'apikey': key };
    if (token) h['Authorization'] = 'Bearer ' + token;
    else if (key.startsWith('eyJ')) h['Authorization'] = 'Bearer ' + key;
    return h;
  }

  async _auth(path, opts) {
    opts = opts || {};
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), GAME_CONFIG.leaderboardTimeoutMs || 8000);
    let res;
    try {
      res = await fetch(this.baseUrl + '/auth/v1' + path, {
        method: opts.method || 'POST',
        headers: this._headers(opts.token),
        body: opts.body ? JSON.stringify(opts.body) : undefined,
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
    try { data = await res.json(); } catch (e) { /* pas de JSON */ }
    if (!res.ok) { const err = new Error(this._errorMessage(res.status, data)); err.status = res.status; throw err; }
    return data;
  }

  _errorMessage(status, d) {
    d = d || {};
    const code = String(d.error_code || d.error || '').toLowerCase();
    const msg = String(d.msg || d.error_description || d.message || '');
    if (code === 'invalid_credentials' || /invalid login credentials/i.test(msg)) return 'Email ou mot de passe incorrect.';
    if (code === 'email_not_confirmed' || /email not confirmed/i.test(msg)) return "Confirme d'abord ton adresse email (clique sur le lien reçu par email).";
    if (code === 'user_already_exists' || code === 'email_exists' || /already registered/i.test(msg)) return 'Cet email est déjà utilisé.';
    if (code === 'weak_password') return 'Mot de passe trop faible : 8 caractères minimum, évite les mots de passe trop courants.';
    if (code === 'same_password') return "Le nouveau mot de passe doit être différent de l'ancien.";
    if (code === 'email_address_invalid' || code === 'validation_failed') return 'Adresse email invalide.';
    if (code === 'signup_disabled') return 'Les inscriptions sont désactivées.';
    if (code === 'over_request_rate_limit' || code === 'over_email_send_rate_limit' || status === 429) return 'Trop de tentatives, réessaie dans quelques minutes.';
    if (status === 401 || status === 403) return 'Accès refusé : vérifie supabaseKey dans js/config.js.';
    return msg || ('Erreur du serveur (' + status + ').');
  }

  /* ---------- Session ---------- */
  _setSession(data, keepUsername) {
    const prev = this.session || {};
    const user = data.user || {};
    const exp = data.expires_at || (Math.floor(Date.now() / 1000) + (data.expires_in || 3600));
    this.session = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: exp,
      email: user.email || prev.email || '',
      username: keepUsername ? (prev.username || '') : '',
      metaUsername: (user.user_metadata && user.user_metadata.username) || prev.metaUsername || ''
    };
    this._save();
  }

  // Renouvelle la session (un seul renouvellement à la fois : les jetons sont à usage unique)
  refresh() {
    if (!this.loggedIn) return Promise.reject(new Error('Non connecté.'));
    if (this._refreshing) return this._refreshing;
    this._refreshing = (async () => {
      try {
        const data = await this._auth('/token?grant_type=refresh_token', { body: { refresh_token: this.session.refresh_token } });
        this._setSession(data, true);
        return this.session.access_token;
      } catch (e) {
        // Jeton refusé = session terminée ; simple coupure réseau = on garde la session
        if (e.status === 400 || e.status === 401 || e.status === 403) this._clear();
        throw e;
      } finally {
        this._refreshing = null;
      }
    })();
    return this._refreshing;
  }

  // Renvoie un jeton valide (renouvelé si besoin), ou null si non connecté
  async ensureToken() {
    if (!this.loggedIn) return null;
    const now = Math.floor(Date.now() / 1000);
    if (this.session.access_token && this.session.expires_at - now > 60) return this.session.access_token;
    return this.refresh();
  }

  /* ---------- Actions ---------- */
  validateUsername(name) {
    return /^[A-Za-z0-9_-]{3,16}$/.test(name || '');
  }

  async signUp(username, email, password) {
    const data = await this._auth('/signup', { body: { email: email, password: password, data: { username: username } } });
    if (data && data.access_token) {
      // Compte actif tout de suite (confirmation d'email désactivée)
      this._setSession(data, false);
      this._notify();
      return { confirmed: true };
    }
    // Confirmation d'email demandée : on attend le clic sur le lien
    return { confirmed: false };
  }

  async signIn(email, password) {
    const data = await this._auth('/token?grant_type=password', { body: { email: email, password: password } });
    this._setSession(data, false);
    this._notify();
    return this.session;
  }

  async signOut() {
    const token = this.session && this.session.access_token;
    if (token) { try { await this._auth('/logout', { token: token }); } catch (e) { /* ignoré : on déconnecte quand même */ } }
    this._clear();
  }

  recover(email) {
    let path = '/recover';
    if (/^https?:$/.test(window.location.protocol)) {
      path += '?redirect_to=' + encodeURIComponent(window.location.origin + window.location.pathname);
    }
    return this._auth(path, { body: { email: email } });
  }

  async updatePassword(token, newPassword) {
    return this._auth('/user', { method: 'PUT', token: token, body: { password: newPassword } });
  }

  // Lien reçu par email (confirmation / mot de passe oublié) : les jetons arrivent dans l'adresse (#...)
  consumeUrlHash() {
    const hash = window.location.hash;
    if (!hash || hash.length < 2 || hash.indexOf('=') === -1) return null;
    const p = new URLSearchParams(hash.slice(1));
    const type = p.get('type');
    const error = p.get('error_description') || p.get('error');
    const access = p.get('access_token');
    if (!type && !error && !access) return null;
    try { history.replaceState(null, '', window.location.pathname + window.location.search); } catch (e) { /* ignoré */ }
    if (error) return { error: error.replace(/\+/g, ' ') };
    if (!access) return null;
    return {
      type: type || 'signup',
      access_token: access,
      refresh_token: p.get('refresh_token') || '',
      expires_in: parseInt(p.get('expires_in') || '3600', 10)
    };
  }

  // Utilise les jetons d'un lien email comme session
  adoptTokens(t) {
    this._setSession({
      access_token: t.access_token,
      refresh_token: t.refresh_token,
      expires_in: t.expires_in,
      user: {}
    }, false);
    this._notify();
  }

  // Après connexion : récupère le pseudo du compte (ou le crée à partir de celui choisi à l'inscription)
  async loadProfile() {
    const prof = await this._rpc('get_my_profile', {});
    if (prof && prof.username) {
      this.session.username = prof.username;
      this._save(); this._notify();
      return prof;
    }
    const wanted = this.session && this.session.metaUsername;
    if (wanted && this.validateUsername(wanted)) {
      try { await this.claimUsername(wanted); } catch (e) { /* pris entre-temps : l'utilisateur en choisira un autre */ }
    }
    this._notify();
    return null;
  }

  async claimUsername(name) {
    const res = await this._rpc('claim_username', { p_username: name });
    this.session.username = (res && res.username) || name;
    this._save(); this._notify();
    return res;
  }

  async isUsernameAvailable(name) {
    return (await this._rpc('is_username_available', { p_username: name }, true)) === true;
  }

  async deleteAccount() {
    await this._rpc('delete_my_account', {});
    this._clear();
  }

  /* ---------- Appel de fonctions SQL (API REST de la base) ---------- */
  async _rpc(fn, args, anonymous) {
    let token = null;
    if (!anonymous) {
      token = await this.ensureToken();
      if (!token) throw new Error('Connecte-toi pour continuer.');
    }
    return this._rpcWith(fn, args, token, !anonymous);
  }

  async _rpcWith(fn, args, token, canRetry) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), GAME_CONFIG.leaderboardTimeoutMs || 8000);
    let res;
    try {
      res = await fetch(this.baseUrl + '/rest/v1/rpc/' + fn, {
        method: 'POST',
        headers: this._headers(token),
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
    try { data = await res.json(); } catch (e) { /* pas de JSON */ }
    if (res.ok) return data;

    // Jeton expiré entre-temps : on renouvelle une fois puis on réessaie
    if (res.status === 401 && token && canRetry) {
      let fresh = null;
      try { fresh = await this.refresh(); } catch (e) { fresh = null; }
      if (fresh) return this._rpcWith(fn, args, fresh, false);
      this._clear();
      throw new Error('Session expirée, reconnecte-toi.');
    }
    if (data && data.code === 'P0001' && typeof data.message === 'string') throw new Error(data.message);
    if (res.status === 401 || res.status === 403) throw new Error(token ? 'Action refusée : reconnecte-toi.' : 'Clé Supabase refusée : vérifie supabaseKey dans js/config.js.');
    if (res.status === 404) throw new Error("Fonction introuvable : le script classement.sql a-t-il été exécuté (version avec comptes) dans Supabase ?");
    throw new Error('Erreur du serveur (' + res.status + ').');
  }
}

const account = new AccountManager();
