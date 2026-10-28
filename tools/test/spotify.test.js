// Spotify on Home (spotify.js): the address pasted after the login, what plays in the launcher's words, the keys and the commands
// against a stand-in for Spotify on this computer, and the phone page from the client id to a linked account.
const http = require('http'),
  path = require('path');
const { root, ok, serve, req, memoryConfig, run } = require('./lib');
const nc = req('netcompat');

run(async () => {
  // a stand-in for accounts.spotify.com and api.spotify.com
  const seen = [];
  let player = { is_playing: true, progress_ms: 84000, device: { name: 'Living room TV', type: 'TV' }, item: null };
  player.item = {
    name: 'Neon Harbour',
    duration_ms: 221000,
    artists: [{ name: 'The Paper Moons' }, { name: 'Guest' }],
    album: {
      name: 'Late Lights',
      release_date: '2024-03-01',
      images: [{ url: 'https://i.scdn.co/image/' + 'a'.repeat(40) }, { url: 'https://i.scdn.co/image/' + 'b'.repeat(40) }],
    },
  };
  const fake = await serve((q, rs) => {
    let b = '';
    q.on('data', c => (b += c));
    q.on('end', () => {
      seen.push(q.method + ' ' + q.url + (b ? ' ' + b : ''));
      const send = (code, o) => {
        rs.writeHead(code, { 'content-type': 'application/json' });
        rs.end(o === undefined ? '' : JSON.stringify(o));
      };
      if (q.url === '/accounts/api/token') {
        if (/grant_type=refresh_token/.test(b) && /refresh_token=R0/.test(b))
          return send(200, { access_token: 'A1', expires_in: 3600, refresh_token: 'R2' });
        if (/grant_type=authorization_code/.test(b) && /code=GOOD/.test(b) && /code_verifier=/.test(b))
          return send(200, { access_token: 'A9', expires_in: 3600, refresh_token: 'R9' });
        return send(400, { error: 'invalid_grant' });
      }
      if (!/^Bearer A/.test(q.headers.authorization || '')) return send(401, { error: { message: 'no token' } });
      if (q.url === '/v1/me/player' && q.method === 'GET') return send(200, player);
      if (q.url === '/v1/me/player/next' && q.method === 'POST') return send(204);
      if (q.url === '/v1/me/player/pause' && q.method === 'PUT') {
        player.is_playing = false;
        return send(204);
      }
      if (q.url === '/v1/me/player/devices')
        return send(200, {
          devices: [
            { id: 'p1', name: 'Phone', type: 'Smartphone' },
            { id: 't1', name: 'Living room TV', type: 'TV' },
          ],
        });
      if (q.url === '/v1/me/player' && q.method === 'PUT') return send(204);
      send(404, { error: { message: 'not found' } });
    });
  });
  process.env.CYTV_SPOTIFY_ACCOUNTS = fake.url + '/accounts';
  process.env.CYTV_SPOTIFY_API = fake.url + '/v1';
  process.env.CYTV_QRLIB = path.join(root, 'third-party', 'qrcode-generator', 'qrcode.js');
  const sp = req('spotify');

  // the address from the phone's address bar
  const pr = sp.parseReturn('http://127.0.0.1:8770/callback?code=AQBx_12-ab&state=s1');
  ok(pr.code === 'AQBx_12-ab' && pr.state === 's1', 'the code and state are read from the pasted address');
  ok(sp.parseReturn('http://127.0.0.1:8770/callback?error=access_denied&state=s1').error === 'access_denied', 'a refusal is read');
  ok(sp.parseReturn('AQBxabcdefghijklmnopqrstu').code && sp.parseReturn('hello') === null, 'a bare code works, other text does not');
  const nw = sp.nowFrom(player);
  ok(
    nw.title === 'Neon Harbour' &&
      nw.artist === 'The Paper Moons, Guest' &&
      nw.album === 'Late Lights' &&
      nw.year === '2024' &&
      nw.art === 'https://i.scdn.co/image/' + 'b'.repeat(40) &&
      nw.playing &&
      nw.ms === 84000 &&
      nw.dur === 221000 &&
      nw.device.type === 'TV',
    'what plays is put in the launcher’s words, with the middle-sized cover'
  );
  ok(sp.nowFrom({ is_playing: false }) === null, 'nothing loaded: nothing plays');

  // not linked yet
  const callIt = async (s, u, method, body) => {
    let out = '',
      code = 0;
    const res = {
      writeHead: c => (code = c),
      setHeader() {},
      end: x => (out = x === undefined ? '' : String(x)),
    };
    await s.handle({ method: method || 'GET', url: u, headers: {} }, res, u.split('?')[0], async () => body || {});
    let j = null;
    try {
      j = JSON.parse(out);
    } catch (_) {}
    return { code, j };
  };
  const conf0 = memoryConfig({});
  const s0 = sp.create({ config: conf0 });
  let r = await callIt(s0, '/api/spotify');
  ok(r.j.configured === false && r.j.linked === false && r.j.now === null, 'without a client id nothing is asked of Spotify');

  // linked: the key is renewed, what plays is read, commands go out
  const conf = memoryConfig({ spotify: { clientId: 'c'.repeat(32), refresh: 'R0' } });
  const s1 = sp.create({ config: conf });
  r = await callIt(s1, '/api/spotify');
  ok(r.j.linked && r.j.now && r.j.now.title === 'Neon Harbour', 'linked: what plays is read');
  ok(conf.get().spotify.refresh === 'R2', 'a new refresh key from Spotify is kept');
  const before = seen.length;
  await callIt(s1, '/api/spotify');
  ok(seen.length === before, 'a second reading within a few seconds is not asked of Spotify again');
  r = await callIt(s1, '/api/spotify/cmd', 'POST', { do: 'next' });
  ok(r.code === 0 || r.code === 200, 'next is sent');
  ok(
    seen.some(x => x.indexOf('POST /v1/me/player/next') === 0),
    'Spotify got the next command'
  );
  r = await callIt(s1, '/api/spotify/cmd', 'POST', { do: 'pause' });
  ok(r.j.now && r.j.now.playing === false, 'after pause the reading shows it paused');
  await callIt(s1, '/api/spotify/cmd', 'POST', { do: 'tv' });
  ok(
    seen.some(x => /^PUT \/v1\/me\/player \{"device_ids":\["t1"\],"play":true\}/.test(x)),
    'play here moves the music to the TV device'
  );
  r = await callIt(s1, '/api/spotify/cmd', 'POST', { do: 'dance' });
  ok(r.code === 502 && /unknown/.test(r.j.error), 'an unknown command is refused');
  r = await callIt(s1, '/api/spotify/unlink', 'POST');
  ok(
    r.j.linked === false && !conf.get().spotify.refresh && conf.get().spotify.clientId,
    'unlinking forgets the login, keeps the client id'
  );

  // the phone page: client id, then the pasted address
  const conf2 = memoryConfig({});
  const s2 = sp.create({ config: conf2 });
  r = await callIt(s2, '/api/spotify/pair', 'POST');
  ok(/^http:\/\/[\d.]+:8793\/[0-9a-f]{24}$/.test(r.j.url) && /^<svg /.test(r.j.svg), 'the phone page has an address and a QR code');
  const tok = r.j.url.split('/').pop();
  const post = (p, form) =>
    new Promise(res => {
      const q = http.request(
        {
          host: '127.0.0.1',
          port: 8793,
          path: '/' + tok + p,
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
        },
        rs => {
          let b = '';
          rs.on('data', c => (b += c));
          rs.on('end', () => res({ code: rs.statusCode, body: b }));
        }
      );
      q.end(form);
    });
  const get = p =>
    new Promise(res => {
      nc.get(http, 'http://127.0.0.1:8793/' + tok + p, { timeout: 4000 }, rs => {
        let b = '';
        rs.on('data', c => (b += c));
        rs.on('end', () => res({ code: rs.statusCode, body: b }));
      });
    });
  let pg = await get('');
  ok(
    pg.code === 200 && /Client ID/.test(pg.body) && pg.body.indexOf('127.0.0.1:8770/callback') > 0 && !/Log in to Spotify/.test(pg.body),
    'the page first asks for the client id'
  );
  pg = await post('/id', 'id=nope');
  ok(pg.code === 400 && !conf2.get().spotify, 'a wrong client id is refused');
  pg = await post('/id', 'id=' + 'd'.repeat(32));
  const m = /state=([0-9a-f]+)/.exec(pg.body);
  ok(
    pg.code === 200 && conf2.get().spotify.clientId === 'd'.repeat(32) && m && /code_challenge=/.test(pg.body),
    'the client id is saved and the login link appears'
  );
  pg = await post('/code', 'u=' + encodeURIComponent('http://127.0.0.1:8770/callback?code=GOOD&state=other'));
  ok(pg.code === 400 && !conf2.get().spotify.refresh, 'an address from another login is refused');
  pg = await post('/code', 'u=' + encodeURIComponent('http://127.0.0.1:8770/callback?code=GOOD&state=' + m[1]));
  ok(pg.code === 200 && conf2.get().spotify.refresh === 'R9', 'the pasted address links the account');
  s2.stop();
  fake.server.close();
});
