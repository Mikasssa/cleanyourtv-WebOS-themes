// Spotify on Home (the player in the launcher, app/src/js/player.js): what plays on the user's Spotify account and the buttons to
// steer it, through Spotify's Web API (Spotify Connect: the music plays in Spotify on the TV, a phone or a speaker; this only shows
// and steers it). It needs the user's own Spotify app (a client id from developer.spotify.com) and one login, done on a phone: the TV
// shows a QR code for a short-lived page on the local network, like the other phone pages. After the login Spotify sends the phone
// to http://127.0.0.1:8770/callback, the only kind of plain-http address Spotify accepts. Nothing answers there on a phone, so the
// page asks for that address, pasted from the phone's address bar: it carries the code the TV trades for its keys (PKCE, no client
// secret). The refresh key is kept in config.json (spotify) and never sent to the launcher.
// API (loopback): GET /api/spotify -> {configured, linked, pairing: {url, svg}|null, now: {...}|null, error}
//   POST /api/spotify/pair -> starts the phone page; POST /api/spotify/cmd {do: play|pause|next|prev|tv}; POST /api/spotify/unlink
//   GET /api/spotify/art?u=<cover address> -> the cover picture (from Spotify's picture server only), for the launcher's canvas
const http = require('http'),
  crypto = require('crypto'),
  qs = require('querystring');
const web = require('./web'),
  fetch = require('./fetch'),
  i18n = require('./i18n'),
  P = require('./paths');

const PAIR_PORT = 8793, // after the cards page (8792)
  PAIR_MS = 15 * 60 * 1000,
  REDIRECT = 'http://127.0.0.1:8770/callback',
  SCOPE = 'user-read-playback-state user-modify-playback-state user-read-currently-playing',
  ACCOUNTS = process.env.CYTV_SPOTIFY_ACCOUNTS || 'https://accounts.spotify.com', // the tests point both at a local server
  API = process.env.CYTV_SPOTIFY_API || 'https://api.spotify.com/v1',
  NOW_MS = 2500, // a reading of what plays is reused this long (the launcher asks every few seconds)
  CLIENT_ID = /^[0-9a-f]{32}$/i,
  ART_HOST = /^https:\/\/i\.scdn\.co\/image\/[0-9a-f]{20,64}$/i;

const b64url = b => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

// the code and state from an address pasted from the phone (or just the code)
function parseReturn(text) {
  const s = String(text || '').trim();
  const q = s.indexOf('?') >= 0 ? s.slice(s.indexOf('?') + 1).split('#')[0] : '';
  if (!q) return /^[\w-]{20,}$/.test(s) ? { code: s, state: '' } : null;
  const f = qs.parse(q);
  if (f.error) return { error: String(f.error) };
  return f.code ? { code: String(f.code), state: String(f.state || '') } : null;
}

// what plays, from Spotify's /me/player answer, in the launcher's words
function nowFrom(j) {
  if (!j || !j.item) return null;
  const it = j.item,
    al = it.album || {},
    imgs = Array.isArray(al.images) ? al.images : [];
  const art = (imgs[1] || imgs[0] || {}).url || '';
  return {
    playing: !!j.is_playing,
    title: String(it.name || ''),
    artist: (it.artists || [])
      .map(a => a.name)
      .filter(Boolean)
      .join(', '),
    album: String(al.name || ''),
    year: String(al.release_date || '').slice(0, 4),
    art: ART_HOST.test(art) ? art : '',
    ms: +j.progress_ms || 0,
    dur: +it.duration_ms || 0,
    device: j.device ? { name: String(j.device.name || ''), type: String(j.device.type || '') } : null,
  };
}

function create(ctx) {
  const cfg = () => ctx.config.get().spotify || {};
  const save = patch =>
    ctx.config.update('spotify', c => {
      c.spotify = Object.assign({}, c.spotify || {}, patch);
      for (const k of Object.keys(c.spotify)) if (c.spotify[k] === undefined) delete c.spotify[k];
    });
  let access = '',
    accessUntil = 0,
    now = null,
    nowAt = 0,
    nowP = null,
    lastError = '',
    pair = null;
  const arts = new Map(); // cover address -> picture, the last few

  async function token(force) {
    const c = cfg();
    if (!c.clientId || !c.refresh) throw new Error('not linked');
    if (!force && access && Date.now() < accessUntil) return access;
    const r = await fetch.read(ACCOUNTS + '/api/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: qs.stringify({ grant_type: 'refresh_token', refresh_token: c.refresh, client_id: c.clientId }),
      anyStatus: true,
      totalMs: 15000,
    });
    let j = {};
    try {
      j = JSON.parse(r.body.toString('utf8'));
    } catch (_) {}
    if (r.status !== 200 || !j.access_token) {
      if (j.error === 'invalid_grant') save({ refresh: undefined }); // the login was withdrawn: link again
      throw new Error('Spotify refused the login (' + (j.error || r.status) + ')');
    }
    access = j.access_token;
    accessUntil = Date.now() + Math.max(60, (+j.expires_in || 3600) - 60) * 1000;
    if (j.refresh_token && j.refresh_token !== c.refresh) save({ refresh: j.refresh_token });
    return access;
  }
  // one Web API call; a refused key is renewed once
  async function call(method, path, body, again) {
    const tk = await token(again);
    const r = await fetch.read(API + path, {
      method,
      headers: Object.assign({ authorization: 'Bearer ' + tk }, body ? { 'content-type': 'application/json' } : {}),
      body: body ? JSON.stringify(body) : method === 'GET' ? undefined : '',
      anyStatus: true,
      totalMs: 15000,
    });
    if (r.status === 401 && !again) return call(method, path, body, true);
    let j = null;
    try {
      j = r.body.length ? JSON.parse(r.body.toString('utf8')) : null;
    } catch (_) {}
    if (r.status >= 400) {
      const msg = (j && j.error && (j.error.message || j.error)) || 'HTTP ' + r.status;
      throw new Error(String(msg));
    }
    return { status: r.status, j };
  }
  function readNow(force) {
    if (!force && Date.now() - nowAt < NOW_MS) return Promise.resolve(now);
    if (nowP) return nowP;
    nowP = call('GET', '/me/player')
      .then(
        r => {
          now = r.status === 204 ? null : nowFrom(r.j);
          lastError = '';
        },
        e => {
          lastError = String(e.message || e);
          if (lastError === 'not linked') now = null;
        }
      )
      .then(() => {
        nowAt = Date.now();
        nowP = null;
        return now;
      });
    return nowP;
  }
  async function cmd(what) {
    if (what === 'play') await call('PUT', '/me/player/play');
    else if (what === 'pause') await call('PUT', '/me/player/pause');
    else if (what === 'next') await call('POST', '/me/player/next');
    else if (what === 'prev') await call('POST', '/me/player/previous');
    else if (what === 'tv') {
      // play here: the Spotify device that is a TV (Spotify on this TV, open once so that Spotify knows it)
      const r = await call('GET', '/me/player/devices');
      const devs = (r.j && r.j.devices) || [];
      const tv = devs.filter(d => /tv/i.test(d.type || ''))[0];
      if (!tv) throw new Error('no TV among your Spotify devices: open Spotify on the TV once');
      await call('PUT', '/me/player', { device_ids: [tv.id], play: true });
    } else throw new Error('unknown command');
    nowAt = 0;
    await new Promise(r => setTimeout(r, 350)); // Spotify's answer trails the command a little
    return readNow(true);
  }

  // ---- the phone page: the client id, the login link, the address to paste ----
  function qrSvg(text) {
    let lib = null;
    try {
      lib = require(P.QRLIB);
    } catch (_) {
      return '';
    }
    const q = lib(0, 'M');
    q.addData(text);
    q.make();
    const n = q.getModuleCount();
    let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += 'M' + (c + 4) + ' ' + (r + 4) + 'h1v1h-1z';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n + 8} ${n + 8}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
  }
  function authUrl() {
    return (
      ACCOUNTS +
      '/authorize?' +
      qs.stringify({
        response_type: 'code',
        client_id: cfg().clientId,
        scope: SCOPE,
        redirect_uri: REDIRECT,
        state: pair.state,
        code_challenge_method: 'S256',
        code_challenge: b64url(crypto.createHash('sha256').update(pair.verifier).digest()),
      })
    );
  }
  function page(msg, lang, done) {
    const T = x => web.esc(i18n.tr(lang, x)),
      c = cfg(),
      e = web.esc;
    const step1 = `<h3>1. ${T('Your Spotify app')}</h3>
<p>${T('On developer.spotify.com > Dashboard, create an app (Web API). As its Redirect URI add exactly:')}</p><p class=k>${e(REDIRECT)}</p>
<form method=post action="/${pair.token}/id"><label>${T('Client ID')}</label><input name=id autocomplete=off value="${e(c.clientId || '')}" placeholder="32 ${T('letters and digits')}"><button>${T('Save')}</button></form>`;
    const step2 = c.clientId
      ? `<h3>2. ${T('Log in')}</h3><p><a class=b href="${e(authUrl())}" target=_blank rel=noopener>${T('Log in to Spotify')}</a></p>
<h3>3. ${T('Paste the address')}</h3><p>${T('After the login your browser opens a page that does not load (127.0.0.1). Copy its address from the address bar and paste it here.')}</p>
<form method=post action="/${pair.token}/code"><input name=u autocomplete=off placeholder="http://127.0.0.1:8770/callback?code=..."><button>${T('Link')}</button></form>`
      : '';
    return `<!doctype html><html lang=${lang}><meta name=viewport content="width=device-width,initial-scale=1"><title>Spotify</title>
<style>body{font:18px system-ui,sans-serif;background:#111;color:#eee;max-width:560px;margin:32px auto;padding:0 18px}h3{margin:26px 0 6px}label{display:block;color:#aaa;font-size:15px;margin-top:10px}input,button{font:inherit;width:100%;box-sizing:border-box;padding:12px;margin:6px 0;border-radius:10px;border:1px solid #444;background:#1b1b1f;color:#eee}button,.b{background:#f5f6f8;color:#111;font-weight:600}.b{display:block;text-align:center;padding:12px;border-radius:10px;text-decoration:none}.m{padding:12px;border-radius:10px;background:#1f2a1f}.k{font-family:monospace;background:#222;padding:10px;border-radius:8px;word-break:break-all}</style>
<h2>${T('Spotify on Home')}</h2>${msg ? `<p class=m>${T(msg)}</p>` : ''}${done ? '' : step1 + step2}`;
  }
  async function trade(code) {
    const r = await fetch.read(ACCOUNTS + '/api/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: qs.stringify({
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT,
        client_id: cfg().clientId,
        code_verifier: pair.verifier,
      }),
      anyStatus: true,
      totalMs: 15000,
    });
    let j = {};
    try {
      j = JSON.parse(r.body.toString('utf8'));
    } catch (_) {}
    if (r.status !== 200 || !j.refresh_token) throw new Error(j.error_description || j.error || 'HTTP ' + r.status);
    save({ refresh: j.refresh_token });
    access = j.access_token || '';
    accessUntil = Date.now() + Math.max(60, (+j.expires_in || 3600) - 60) * 1000;
    nowAt = 0;
  }
  function startPair() {
    stopPair();
    const token = crypto.randomBytes(12).toString('hex');
    let hits = 0;
    const srv = http.createServer((req, res) => {
      const send = (code, html) => {
        res.writeHead(code, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
        res.end(html);
      };
      if (++hits > 150) return send(429, 'Too many requests');
      const p = req.url.split('?')[0],
        lg = i18n.lang(req, ctx.config.get().lang);
      if (req.method === 'GET' && p === '/' + token) return send(200, page('', lg));
      if (req.method !== 'POST' || (p !== '/' + token + '/id' && p !== '/' + token + '/code')) return send(404, 'Not found');
      let b = '';
      req.on('data', c => {
        b += c;
        if (b.length > 8192) req.destroy();
      });
      req.on('end', async () => {
        const f = qs.parse(b);
        if (p.slice(-3) === '/id') {
          const id = String(f.id || '').trim();
          if (!CLIENT_ID.test(id)) return send(400, page('That is not a client id (32 letters and digits).', lg));
          if (id !== cfg().clientId) save({ clientId: id, refresh: undefined });
          return send(200, page('Saved. Now log in.', lg));
        }
        const got = parseReturn(f.u);
        if (!got) return send(400, page('No code in that address. Copy the whole address after the login.', lg));
        if (got.error) return send(400, page('Spotify said: ' + got.error, lg));
        if (got.state && got.state !== pair.state) return send(400, page('That address is from another login. Log in again.', lg));
        try {
          await trade(got.code);
        } catch (e) {
          return send(400, page('Spotify refused the code: ' + (e.message || e) + '. Log in again.', lg));
        }
        send(200, page('Linked. You can close this page.', lg, true));
        setTimeout(stopPair, 2000);
      });
    });
    srv.on('error', () => {
      pair = null;
    });
    srv.listen(PAIR_PORT, '0.0.0.0');
    const url = 'http://' + web.lanIp() + ':' + PAIR_PORT + '/' + token;
    pair = {
      srv,
      token,
      url,
      svg: qrSvg(url),
      state: crypto.randomBytes(8).toString('hex'),
      verifier: b64url(crypto.randomBytes(48)),
      timer: setTimeout(stopPair, PAIR_MS),
    };
    return { url, svg: pair.svg };
  }
  function stopPair() {
    if (!pair) return;
    clearTimeout(pair.timer);
    try {
      pair.srv.close();
    } catch (_) {}
    pair = null;
  }

  async function state() {
    const c = cfg(),
      linked = !!(c.clientId && c.refresh);
    return {
      configured: !!c.clientId,
      linked,
      pairing: pair ? { url: pair.url, svg: pair.svg } : null,
      now: linked ? await readNow(false) : null,
      error: linked ? lastError : '',
    };
  }

  async function handle(req, res, u, body) {
    if (u === '/api/spotify' && req.method === 'GET') return web.json(res, await state());
    if (u === '/api/spotify/pair' && req.method === 'POST') return web.json(res, startPair());
    if (u === '/api/spotify/unlink' && req.method === 'POST') {
      save({ refresh: undefined });
      access = '';
      now = null;
      return web.json(res, await state());
    }
    if (u === '/api/spotify/cmd' && req.method === 'POST') {
      const b = await body();
      try {
        await cmd(String(b.do || ''));
      } catch (e) {
        lastError = String(e.message || e);
        return web.json(res, Object.assign(await state(), { error: lastError }), 502);
      }
      return web.json(res, await state());
    }
    if (u === '/api/spotify/art' && req.method === 'GET') {
      const a = qs.parse((req.url.split('?')[1] || '').toString()).u;
      if (typeof a !== 'string' || !ART_HOST.test(a)) return web.notFound(res);
      let pic = arts.get(a);
      if (!pic) {
        try {
          const r = await fetch.read(a, { maxBytes: 2e6, totalMs: 15000 });
          pic = { type: String(r.headers['content-type'] || 'image/jpeg'), body: r.body };
        } catch (_) {
          return web.notFound(res);
        }
        arts.set(a, pic);
        if (arts.size > 6) arts.delete(arts.keys().next().value);
      }
      res.writeHead(200, { 'content-type': pic.type, 'cache-control': 'max-age=86400' });
      return res.end(pic.body);
    }
    web.notFound(res);
  }

  return { name: 'spotify', prefix: '/api/spotify', handle, stop: stopPair };
}
module.exports = { create, parseReturn, nowFrom, REDIRECT, PAIR_PORT };
