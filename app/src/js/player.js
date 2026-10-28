/* ---------- Spotify on Home (Customise > Player; the service's spotify.js): what plays on your Spotify account, with buttons to steer it.
   Four styles: 'card' a small card under the clock, 'bar' a bar above the dock in the cover's colours, 'panel' a large "now playing"
   panel, 'tile' the Spotify tile in the dock shows the cover, and its buttons appear above it while it or they have the focus. It shows
   only while something is loaded in Spotify. The buttons join the top row of Home: Up from the dock reaches them. Asked of the
   service every 3 s while Home is shown (every 30 s while the account is not linked); the time runs on in between. ---------- */
var PLAYER = (function () {
  var st = { configured: false, linked: false, now: null, pairing: null },
    at = 0, // when st.now was read
    timer = 0,
    tickT = 0,
    shown = true,
    el = null,
    btns = [],
    tint = '', // the cover's colour for the bar, from the cover itself
    tintOf = '',
    BTN = {
      prev: '<path d="M6 5v14M19 5 9 12l10 7z" fill="currentColor"/>',
      play: '<path d="M7 4.5v15L19.5 12z" fill="currentColor"/>',
      pause:
        '<rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor"/><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor"/>',
      next: '<path d="M18 5v14M5 5l10 7-10 7z" fill="currentColor"/>',
      tv: '<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 21h8"/>',
    };
  function style() {
    var s = cfg.player;
    return s === 'card' || s === 'bar' || s === 'panel' || s === 'tile' ? s : '';
  }
  function icon(n) {
    return (
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      BTN[n] +
      '</svg>'
    );
  }
  function mmss(ms) {
    var s = Math.max(0, Math.round(ms / 1000));
    return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2);
  }
  function pos() {
    var n = st.now;
    if (!n) return 0;
    return Math.min(n.dur, n.ms + (n.playing ? Date.now() - at : 0));
  }
  function art(n) {
    return n && n.art ? API + '/api/spotify/art?u=' + encodeURIComponent(n.art) : '';
  }
  function spotifyTile() {
    var d = $('dock').children;
    for (var i = 0; i < d.length; i++) if (d[i]._a && /spotify/i.test(d[i]._a.id + ' ' + d[i]._a.title)) return d[i];
    return null;
  }
  function wanted() {
    return !!(style() && st.linked && st.now);
  }
  /* the cover's colour, for the bar's background: a small canvas of the cover (the service passes it on, so the canvas can read it) */
  function readTint(u) {
    if (!u || u === tintOf) return;
    tintOf = u;
    var im = new Image();
    im.crossOrigin = 'anonymous';
    im.onload = function () {
      try {
        tint = iconColor(im, u).c.join(',');
      } catch (e) {
        tint = '';
      }
      draw();
    };
    im.src = u;
  }
  function button(name, cmd) {
    var b = document.createElement('div');
    b.className = 'pbtn' + (name === 'play' || name === 'pause' ? ' main' : '');
    b.innerHTML = icon(name);
    b._o = { action: 'player', cmd: cmd };
    hit(b);
    return b;
  }
  /* the player's own element, drawn again when what plays changes; the time and the bar move on their own between readings */
  function draw() {
    var s = style(),
      n = st.now,
      tile = spotifyTile(),
      cov = tile && tile.querySelector('.pcov');
    if (cov && (s !== 'tile' || !wanted())) cov.remove();
    if (!wanted()) {
      if (el) el.remove();
      el = null;
      btns = [];
      document.body.classList.remove('pl-on');
      return;
    }
    var u = art(n);
    if (s === 'bar') readTint(u);
    var key = [s, n.title, n.artist, n.playing, u, tint, !!tile].join('|');
    if (!el || el._key !== key) {
      if (!el) {
        /* inside a layer the size of the screen, so Customise can scale it into its window with the rest of Home */
        var w = $('plw');
        if (!w) {
          w = document.createElement('div');
          w.id = 'plw';
          document.body.appendChild(w);
        }
        el = document.createElement('div');
        el.id = 'player';
        w.appendChild(el);
      }
      el._key = key;
      el.className = 'pl-' + s + (n.playing ? ' playing' : '');
      var h =
        (u ? '<img class="part" alt="" src="' + u + '">' : '<div class="part"></div>') +
        '<div class="ptx"><div class="plabel"></div><div class="ptitle"></div><div class="partist"></div><div class="palbum"></div></div>' +
        '<div class="pprog"><div class="pbar"><b></b></div><div class="ptime"><span class="pt0"></span><span class="pt1"></span></div></div>' +
        '<div class="pctl"></div>';
      if (s === 'panel' && u) h = '<div class="pbg" style="background-image:url(&quot;' + u + '&quot;)"></div>' + h;
      el.innerHTML = h;
      el.querySelector('.plabel').textContent = t('Now playing') + (n.device && n.device.name ? ' · ' + n.device.name : '');
      el.querySelector('.ptitle').textContent = n.title;
      el.querySelector('.partist').textContent = n.artist;
      el.querySelector('.palbum').textContent = n.album + (n.year ? ' · ' + n.year : '');
      el.style.background = s === 'bar' && tint ? 'linear-gradient(90deg,rgba(' + tint + ',.55),rgba(20,22,30,.55))' : '';
      var ctl = el.querySelector('.pctl');
      btns = [button('prev', 'prev'), button(n.playing ? 'pause' : 'play', n.playing ? 'pause' : 'play'), button('next', 'next')];
      if (s === 'bar') btns.push(button('tv', 'tv'));
      btns.forEach(function (b) {
        ctl.appendChild(b);
      });
      document.body.classList.add('pl-on');
      place();
      if (s === 'tile' && tile) {
        if (!cov) {
          cov = document.createElement('div');
          cov.className = 'pcov';
          tile.appendChild(cov);
        }
        cov.innerHTML =
          (u ? '<img alt="" src="' + u + '">' : '') +
          '<div class="peq' +
          (n.playing ? ' on' : '') +
          '"><b></b><b></b><b></b><b></b></div><span></span>';
      }
      rebuildSoon(); // the top row gets the new buttons; the focus keeps its place in the row (play becomes pause there)
    }
    progress();
  }
  /* where the player sits: the bar right above the dock, the tile's buttons above the Spotify tile */
  function place() {
    if (!el || document.body.classList.contains('peek')) return; // Customise scales Home: placed again when it closes
    var s = style(),
      dk = $('dock').getBoundingClientRect();
    el.style.left = el.style.top = el.style.width = '';
    if (s === 'bar' && dk.width) {
      el.style.left = Math.round(dk.left) + 'px';
      el.style.width = Math.round(dk.width) + 'px';
      el.style.top = Math.round(dk.top - 160) + 'px';
    } else if (s === 'tile') {
      var tl = spotifyTile(),
        rc = tl ? tl.getBoundingClientRect() : dk;
      el.style.left = Math.round(Math.min(1920 - 660, Math.max(40, rc.left + rc.width / 2 - 310))) + 'px';
      el.style.top = Math.round(rc.top - 240) + 'px';
    }
  }
  function progress() {
    if (!el || !st.now) return;
    var p = pos(),
      d = st.now.dur || 1;
    var b = el.querySelector('.pbar b');
    if (b) b.style.transform = 'scaleX(' + Math.min(1, p / d).toFixed(4) + ')';
    var t0 = el.querySelector('.pt0'),
      t1 = el.querySelector('.pt1');
    if (t0) t0.textContent = mmss(p);
    if (t1) t1.textContent = mmss(d);
    var cs = document.querySelector('.pcov span');
    if (cs) cs.textContent = mmss(p);
  }
  var rbT = 0;
  function rebuildSoon() {
    clearTimeout(rbT);
    rbT = setTimeout(function () {
      if (!stack.length && !SET.on) rebuild();
    }, 30);
  }
  function apply(x) {
    /* only a state of the service changes the player; an error reply (a command Spotify refused) leaves it as it is */
    if (!x || typeof x !== 'object' || typeof x.linked !== 'boolean') return;
    var was = JSON.stringify([st.linked, !!st.now, st.now && st.now.title, st.now && st.now.playing]);
    st = x;
    at = Date.now();
    draw();
    if (JSON.stringify([st.linked, !!st.now, st.now && st.now.title, st.now && st.now.playing]) !== was && SET.on) setDraw();
  }
  function poll() {
    clearTimeout(timer);
    if (!shown || !style()) return;
    api('/api/spotify').then(apply, function () {});
    timer = setTimeout(poll, st.linked ? 3000 : 30000);
  }
  function sync() {
    clearInterval(tickT);
    if (style()) {
      tickT = setInterval(progress, 1000);
      poll();
    } else {
      clearTimeout(timer);
      draw();
    }
  }
  return {
    sync: sync,
    state: function () {
      return st;
    },
    /* the buttons in the top row (layout.js); the dock tile's buttons only while it or they have the focus */
    targets: function () {
      return wanted() ? btns : [];
    },
    first: function () {
      var s = style();
      return s === 'card' || s === 'bar';
    },
    shown: function () {
      shown = true;
      poll();
    },
    hidden: function () {
      shown = false;
      clearTimeout(timer);
    },
    /* setFocus: the tile style shows its buttons while the Spotify tile or one of them has the focus */
    focus: function (e) {
      if (!el || style() !== 'tile') return;
      var on = e === spotifyTile() || btns.indexOf(e) >= 0;
      el.classList.toggle('open', on);
    },
    label: function (o) {
      return o.cmd === 'prev'
        ? t('Previous')
        : o.cmd === 'next'
          ? t('Next')
          : o.cmd === 'pause'
            ? t('Pause')
            : o.cmd === 'play'
              ? t('Play')
              : t('Play on this TV');
    },
    cmd: function (c) {
      api('/api/spotify/cmd', { do: c }).then(
        function (x) {
          apply(x);
          if (x && x.error) toast(t('Spotify: %s').replace('%s', x.error), true);
        },
        function () {
          toast(t('Spotify did not answer. Try again in a moment.'), true);
        }
      );
    },
    link: function () {
      return api('/api/spotify/pair', {}).then(function (x) {
        st.pairing = x;
        return x;
      });
    },
    unlink: function () {
      return api('/api/spotify/unlink', {}).then(apply);
    },
    place: place,
  };
})();
/* Customise > Player (settings.js) */
function playerRows() {
  var s = PLAYER.state(),
    sty = cfg.player || '';
  var names = {
    '': t('Off'),
    card: t('Small card'),
    bar: t('Bar above the dock'),
    panel: t('Large panel'),
    tile: t('Dock tile'),
  };
  return [
    {
      label: t('Player'),
      value: names[sty] || names[''],
      open: choiceMenu(
        t('Player'),
        [
          ['', names['']],
          ['card', names.card],
          ['bar', names.bar],
          ['panel', names.panel],
          ['tile', names.tile],
        ],
        function () {
          return cfg.player || '';
        },
        function (v) {
          if (v) cfg.player = v;
          else delete cfg.player;
        }
      ),
    },
    {
      label: t('Spotify account'),
      value: s.linked ? t('Linked') : t('Not linked'),
      open: function () {
        openBuilt(t('Spotify account'), function () {
          var x = PLAYER.state();
          if (x.linked)
            return [
              {
                label: t('Play on this TV'),
                fn: function () {
                  PLAYER.cmd('tv');
                },
              },
              {
                label: t('Unlink'),
                stay: true,
                fn: function () {
                  PLAYER.unlink();
                },
              },
            ];
          return [
            {
              label: x.pairing ? t('Scan the code with your phone') : t('Link with your phone'),
              sub: x.pairing ? x.pairing.url : '',
              qr: x.pairing ? x.pairing.svg : '',
              stay: true,
              fn: function () {
                PLAYER.link().then(function () {
                  refreshMenu();
                });
              },
            },
            {
              note: t(
                'You need your own Spotify app (free, developer.spotify.com) and Spotify Premium for the buttons. The page on your phone explains each step.'
              ),
            },
          ];
        });
        if (!PLAYER.state().pairing && !PLAYER.state().linked)
          PLAYER.link().then(function () {
            if (SET.on) refreshMenu();
          });
      },
    },
  ];
}
