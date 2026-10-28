/* ---------- colours from the wallpaper (Customise > Accent colour > From the wallpaper): the accent, the focus ring, the glow (in a
   theme whose glow is the accent) and the dock's panel and frost take the main colour of the picture behind Home, the theme's
   wallpaper or the photo Wallpapers shows now. Worked out once per picture in a small canvas; a picture without a clear colour (grey,
   black and white) leaves the theme's colours. Saved as wallTint. ---------- */
var TINT = (function () {
  var photo = '', // the photo Wallpapers shows now (wall.js), else ''
    made = {}, // picture URL: {acc, ink, tint, frost, glow}, or null when it has no clear colour
    now = '', // the picture whose colours are applied
    KEYS = ['--acc', '--acc-ink', '--focus', '--dock-tint', '--dock-frost-rgb'];
  function want() {
    return cfg.wallTint === true;
  }
  function src() {
    if (photo) return photo;
    var w = cfg.theme && cfg.theme.wallpaper;
    return w ? API + '/api/theme/wallpaper/' + w.id + '/' + w.file : '';
  }
  function hex(c) {
    return (
      '#' +
      c
        .map(function (v) {
          return ('0' + v.toString(16)).slice(-2);
        })
        .join('')
    );
  }
  /* the main colour: hues in 24 buckets, each pixel counted by how colourful it is (not near black or white); the fullest bucket wins */
  function pick(img) {
    var W = 48,
      H = 27,
      cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    var x = cv.getContext('2d');
    x.drawImage(img, 0, 0, W, H);
    var d = x.getImageData(0, 0, W, H).data,
      bw = [],
      bh = [],
      bs = [],
      tot = 0,
      k;
    for (k = 0; k < 24; k++) {
      bw.push(0);
      bh.push(0);
      bs.push(0);
    }
    for (var i = 0; i < d.length; i += 4) {
      var h = rgb2hsl(d[i], d[i + 1], d[i + 2]),
        w = h[2] < 0.1 || h[2] > 0.93 ? 0 : h[1] * h[1] * (1 - Math.abs(h[2] - 0.5));
      tot += 1;
      if (w < 0.01) continue;
      k = Math.floor(h[0] / 15) % 24;
      bw[k] += w;
      bh[k] += h[0] * w;
      bs[k] += h[1] * w;
    }
    var best = 0;
    for (k = 1; k < 24; k++) if (bw[k] + bw[(k + 23) % 24] > bw[best] + bw[(best + 23) % 24]) best = k;
    if (bw[best] < tot * 0.01) return null; // no clear colour
    var hue = bh[best] / bw[best],
      sat = bs[best] / bw[best],
      acc = hsl2rgb(hue, Math.max(0.55, Math.min(0.85, sat)), 0.62),
      tint = hsl2rgb(hue, 0.45, 0.8),
      frost = hsl2rgb(hue, 0.3, 0.9);
    return {
      acc: hex(acc),
      ink: 0.2126 * acc[0] + 0.7152 * acc[1] + 0.0722 * acc[2] > 150 ? '#0b0c10' : '#ffffff',
      tint: tint.join(','),
      frost: frost.join(','),
      glow: acc.join(','),
    };
  }
  /* the theme's own values back (applyTheme set them on the same properties) */
  function clear() {
    var st = document.documentElement.style,
      v = (cfg.theme && cfg.theme.vars) || {};
    KEYS.forEach(function (key) {
      if (v[key]) st.setProperty(key, v[key]);
      else st.removeProperty(key);
    });
    TH.glow = (cfg.theme && cfg.theme.glowRgb) || '';
    now = '';
  }
  function put(c) {
    var st = document.documentElement.style;
    st.setProperty('--acc', c.acc);
    st.setProperty('--acc-ink', c.ink);
    st.setProperty('--focus', c.acc);
    st.setProperty('--dock-tint', c.tint);
    st.setProperty('--dock-frost-rgb', c.frost);
    if (TH.glow) TH.glow = c.glow; // only where the theme's glow follows the accent
  }
  function sync() {
    var u = want() ? src() : '';
    if (!u) {
      if (now) clear();
      return;
    }
    if (made[u] === undefined) {
      var im = new Image();
      im.crossOrigin = 'anonymous';
      im.onload = function () {
        var c = null;
        try {
          c = pick(im);
        } catch (e) {
          c = null;
        }
        made[u] = c;
        sync();
      };
      im.onerror = function () {
        made[u] = null;
        sync();
      };
      im.src = u;
      return;
    }
    if (!made[u]) {
      if (now) clear();
      return;
    }
    now = u;
    put(made[u]);
  }
  return {
    sync: sync,
    /* wall.js: the photo shown now ('' when Wallpapers is off) */
    photo: function (u) {
      photo = u || '';
      sync();
    },
  };
})();
