/* ---------- app icons as one set (Customise > App icons). Each icon is read once in a canvas: its plain or graded background is found
   and taken out, and the logo's box is measured. Every style then shows the logo at the same size in every tile (a square logo 50.6%
   of the tile's height, a wide one lower): 'Original' keeps the icon with its own background (the tile takes that background, the
   picture is scaled and cropped around the logo), 'dark' puts the logo in its own colours on one dark tile colour, 'mono' draws it in
   one light colour. Kept in memory only. An icon that cannot be read, or a picture without a plain background, stays as it is. Your
   own icons (a transparent logo in the icons folder on the TV, docs/launcher.md) need no cutting and come out sharpest. ---------- */
var DARK_BG = [24, 26, 32],
  iconInfo = {}, // app id: {box, asp, top, bot, dark, mono} (see cutout), or '' when the icon is left as it is
  darkQ = [],
  darkBusy = false;
function iconStyle() {
  return cfg.iconStyle === 'dark' || cfg.iconStyle === 'mono' ? cfg.iconStyle : '';
}
function cdist(d, i, c) {
  return Math.abs(d[i] - c[0]) + Math.abs(d[i + 1] - c[1]) + Math.abs(d[i + 2] - c[2]);
}
function px3(d, q) {
  return [d[q * 4], d[q * 4 + 1], d[q * 4 + 2]];
}
/* The icon read in a canvas: {box: the logo's box as fractions of the picture [x0, y0, x1, y1], asp: the box's width / height,
   top and bot: the background's colour at the top and the bottom (null for a logo on transparency), dark and mono: the logo alone as
   data URLs}; '' when there is nothing to work with. kind is analyse()'s: a 'logo' already stands on transparency. */
function cutout(img, kind) {
  var S = 384,
    cv = document.createElement('canvas');
  cv.width = cv.height = S;
  var x = cv.getContext('2d'),
    /* drawn whole and centred, keeping its proportions (a wide logo of your own, an SVG with only a viewBox) */
    nw = img.naturalWidth || S,
    nh = img.naturalHeight || S,
    dw = nw >= nh ? S : (S * nw) / nh,
    dh = nw >= nh ? (S * nh) / nw : S,
    ox = (S - dw) / 2,
    oy = (S - dh) / 2;
  x.drawImage(img, ox, oy, dw, dh);
  var im = x.getImageData(0, 0, S, S),
    d = im.data,
    n = S * S,
    bg = [],
    p,
    i,
    k,
    top = null,
    bot = null,
    onLight = kind === 'logo'; // the logo was drawn for a light background (or stands on transparency): its black parts are drawing
  for (p = 0; p < n; p++) bg.push(0);
  if (kind !== 'logo') {
    /* the background's colour: the first opaque pixels met coming in from each edge (three in, past the antialiasing) */
    var smp = [],
      cut = function (p0, step) {
        for (var s = 0; s < S - 3; s++) {
          var q = p0 + s * step;
          if (d[q * 4 + 3] >= 200) {
            q += 3 * step;
            if (d[q * 4 + 3] >= 200) smp.push(px3(d, q));
            return;
          }
        }
      };
    for (k = 6; k < S - 6; k += 8) {
      cut(k * S, 1);
      cut(k * S + S - 1, -1);
      cut(k, S);
      cut((S - 1) * S + k, -S);
    }
    if (smp.length < 20) return '';
    var ref = [0, 0, 0];
    smp.forEach(function (c) {
      for (var j = 0; j < 3; j++) ref[j] += c[j] / smp.length;
    });
    var near = 0;
    smp.forEach(function (c) {
      if (Math.abs(c[0] - ref[0]) + Math.abs(c[1] - ref[1]) + Math.abs(c[2] - ref[2]) < 120) near++;
    });
    if (near < smp.length * 0.6) return ''; // no plain or gently graded background: a picture, left as it is
    /* flood fill from the edges: transparent pixels, then pixels close to the background's colour, then pixels close to the pixel
       they were reached from (a gradient), never far from the background's colour. 1: transparent, 2: opaque background. */
    var st = [];
    var take = function (q, from) {
      if (bg[q]) return;
      var j = q * 4;
      if (d[j + 3] < 40) bg[q] = 1;
      else {
        var dr = cdist(d, j, ref);
        if (from < 0 || bg[from] === 1) {
          if (dr >= 75) return;
        } else if (dr >= 170 || cdist(d, j, px3(d, from)) >= 22) return;
        bg[q] = 2;
      }
      st.push(q);
    };
    for (k = 0; k < S; k++) {
      take(k, -1);
      take((S - 1) * S + k, -1);
      take(k * S, -1);
      take(k * S + S - 1, -1);
    }
    while (st.length) {
      p = st.pop();
      var px = p % S;
      if (px > 0) take(p - 1, p);
      if (px < S - 1) take(p + 1, p);
      if (p >= S) take(p - S, p);
      if (p + S < n) take(p + S, p);
    }
    /* the background seen through the logo (inside an O, between letters). Candidates: pixels that match the background last met
       in their row, from either side (compared with that background only, so nothing creeps into the logo along its antialiased
       edge). A group of them (4-connected) is taken out when it is more than a sliver (at least 3 rows, 3 columns and 12 pixels: a
       thin streak would show as a line) and the logo around it is thin: within lim of it, at least a quarter is background. A wide
       shape keeps what is inside it, such as the play sign in its field. */
    var lim = Math.round(S * 0.07),
      cand = [];
    for (p = 0; p < n; p++) cand.push(0);
    for (var hy = 0; hy < S; hy++)
      for (var dir = 1; dir >= -1; dir -= 2) {
        var last = null;
        for (var hx = dir > 0 ? 0 : S - 1; hx >= 0 && hx < S; hx += dir) {
          p = hy * S + hx;
          i = p * 4;
          if (bg[p] === 2) last = px3(d, p);
          else if (bg[p] === 1) last = null;
          else if (last && d[i + 3] >= 200 && cdist(d, i, last) < 28) cand[p] = 1;
        }
      }
    for (p = 0; p < n; p++) {
      if (cand[p] !== 1) continue;
      var comp = [p],
        ci = 0,
        cx0 = S,
        cy0 = S,
        cx1 = -1,
        cy1 = -1;
      cand[p] = 2;
      while (ci < comp.length) {
        var q = comp[ci++],
          hqx = q % S,
          hqy = (q - hqx) / S;
        if (hqx < cx0) cx0 = hqx;
        if (hqx > cx1) cx1 = hqx;
        if (hqy < cy0) cy0 = hqy;
        if (hqy > cy1) cy1 = hqy;
        var nq = [hqx > 0 ? q - 1 : -1, hqx < S - 1 ? q + 1 : -1, q - S, q + S];
        for (k = 0; k < 4; k++)
          if (nq[k] >= 0 && nq[k] < n && cand[nq[k]] === 1) {
            cand[nq[k]] = 2;
            comp.push(nq[k]);
          }
      }
      if (comp.length < 12 || cx1 - cx0 < 2 || cy1 - cy0 < 2) continue;
      var tot = 0,
        bgs = 0;
      for (var yy2 = Math.max(0, cy0 - lim); yy2 <= Math.min(S - 1, cy1 + lim); yy2 += 2)
        for (var xx2 = Math.max(0, cx0 - lim); xx2 <= Math.min(S - 1, cx1 + lim); xx2 += 2) {
          tot++;
          if (bg[yy2 * S + xx2]) bgs++;
        }
      if (bgs < tot * 0.25) continue;
      for (k = 0; k < comp.length; k++) bg[comp[k]] = 2;
    }
    var gone = 0;
    for (p = 0; p < n; p++) if (bg[p]) gone++;
    if (gone < n * 0.08) return ''; // hardly any background: the art fills the icon
    /* the background's colour at the top and the bottom, for the tile behind an Original icon */
    var band = function (y0, y1) {
      var c = [0, 0, 0],
        m = 0;
      for (var y = y0; y < y1; y++)
        for (var xx = 0; xx < S; xx++)
          if (bg[y * S + xx] === 2) {
            var q = (y * S + xx) * 4;
            c[0] += d[q];
            c[1] += d[q + 1];
            c[2] += d[q + 2];
            m++;
          }
      return m > 20 ? [Math.round(c[0] / m), Math.round(c[1] / m), Math.round(c[2] / m)] : null;
    };
    top = band(0, Math.round(S * 0.15)) || [Math.round(ref[0]), Math.round(ref[1]), Math.round(ref[2])];
    bot = band(Math.round(S * 0.85), S) || top;
    onLight = 0.2126 * ref[0] + 0.7152 * ref[1] + 0.0722 * ref[2] > 150;
    /* the logo's edge, two pixels deep: each pixel there is part background (antialiasing). Its share of logo: how far it is from
       the background's colour next to it, against how far the logo's colour further in is. It keeps that logo colour. */
    var ring = [],
      bcol = {};
    for (p = 0; p < n; p++) {
      if (bg[p]) continue;
      var qx = p % S,
        nb =
          qx > 0 && bg[p - 1] ? p - 1 : qx < S - 1 && bg[p + 1] ? p + 1 : p >= S && bg[p - S] ? p - S : p + S < n && bg[p + S] ? p + S : -1;
      if (nb >= 0) {
        ring.push([p, nb, 1]);
        bcol[p] = bg[nb] === 2 ? px3(d, nb) : ref;
      }
    }
    var r1 = ring.length;
    for (k = 0; k < r1; k++) {
      p = ring[k][0];
      var qx2 = p % S,
        nbs = [qx2 > 0 ? p - 1 : -1, qx2 < S - 1 ? p + 1 : -1, p - S, p + S];
      for (var t = 0; t < 4; t++) {
        var q2 = nbs[t];
        if (q2 < 0 || q2 >= n || bg[q2] || bcol[q2]) continue;
        bcol[q2] = bcol[p];
        ring.push([q2, p, 2]);
      }
    }
    var out = [];
    for (k = 0; k < ring.length; k++) {
      p = ring[k][0];
      var b = bcol[p],
        step = p - ring[k][1], // one pixel inwards
        inner = p + step * (ring[k][2] === 1 ? 2 : 1),
        fg = inner >= 0 && inner < n && !bg[inner] && !bcol[inner] ? px3(d, inner) : px3(d, p),
        span = Math.max(60, Math.abs(fg[0] - b[0]) + Math.abs(fg[1] - b[1]) + Math.abs(fg[2] - b[2])),
        f = Math.min(1, cdist(d, p * 4, b) / span);
      out.push([p, fg, f]);
    }
    for (k = 0; k < out.length; k++) {
      i = out[k][0] * 4;
      if (out[k][2] < 0.06) d[i + 3] = 0;
      else {
        if (out[k][2] < 0.98) {
          d[i] = out[k][1][0];
          d[i + 1] = out[k][1][1];
          d[i + 2] = out[k][1][2];
        }
        d[i + 3] = Math.round(d[i + 3] * out[k][2]);
      }
    }
    for (p = 0; p < n; p++) if (bg[p]) d[p * 4 + 3] = 0;
  }
  /* what is left: its box */
  var x0 = S,
    y0 = S,
    x1 = -1,
    y1 = -1,
    vis = 0,
    lsum = 0;
  for (p = 0; p < n; p++) {
    i = p * 4;
    if (d[i + 3] < 24) continue;
    vis++;
    lsum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    var cx = p % S,
      cy = (p - cx) / S;
    if (cx < x0) x0 = cx;
    if (cx > x1) x1 = cx;
    if (cy < y0) y0 = cy;
    if (cy > y1) y1 = cy;
  }
  if (vis < n * 0.01) return '';
  var bw = x1 - x0 + 1,
    bh = y1 - y0 + 1,
    sc = 256 / Math.max(bw, bh);
  /* the logo alone, cropped and drawn large, so the page scales it down (sharp on the TV) */
  var shot = function () {
    x.putImageData(im, 0, 0);
    var o = document.createElement('canvas');
    o.width = Math.max(1, Math.round(bw * sc));
    o.height = Math.max(1, Math.round(bh * sc));
    o.getContext('2d').drawImage(cv, x0, y0, bw, bh, 0, 0, o.width, o.height);
    return o.toDataURL('image/png');
  };
  /* one light colour: a logo of two tones keeps them apart, its darker parts faint and its lighter ones full (lo: its darkest
     of its brightness, hi: its brightest; a small light part such as a play sign counts; brightness counts inverted for a logo
     drawn for a light background, whose dark drawing is then the strong part) */
  var lumAt = function (j) {
    var l = 0.2126 * d[j] + 0.7152 * d[j + 1] + 0.0722 * d[j + 2];
    return onLight ? 255 - l : l;
  };
  var light = function () {
    var ls = [];
    for (p = 0; p < n; p += 3) if (d[p * 4 + 3] >= 128) ls.push(lumAt(p * 4));
    ls.sort(function (u, v) {
      return u - v;
    });
    var lo = ls.length ? ls[Math.floor(ls.length * 0.005)] : 0,
      hi = ls.length ? ls[Math.floor(ls.length * 0.995)] : 255;
    for (p = 0; p < n; p++) {
      i = p * 4;
      if (!d[i + 3]) continue;
      var l = lumAt(i),
        keep = hi - lo < 50 ? 1 : 0.3 + 0.7 * Math.max(0, Math.min(1, (l - lo) / (hi - lo)));
      d[i] = 236;
      d[i + 1] = 238;
      d[i + 2] = 242;
      d[i + 3] = Math.round(d[i + 3] * keep);
    }
  };
  var info = {
      box: [(x0 - ox) / dw, (y0 - oy) / dh, (x1 + 1 - ox) / dw, (y1 + 1 - oy) / dh], // fractions of the picture itself
      iasp: nw / nh,
      lm: lsum / vis, // the logo's mean brightness, 0-255
      asp: bw / bh,
      top: top,
      bot: bot,
    },
    raw = x.createImageData(S, S);
  raw.data.set(d);
  /* dark: the logo's own colours; on a logo drawn for a light background its near-black parts (text) turn light, or they would
     vanish (on a dark background they are holes in the logo and stay); on a logo on transparency (your own icon) its darkest
     parts turn light: black, navy, charcoal, not a brand's red */
  for (p = 0; p < n; p++) {
    i = p * 4;
    if (
      d[i + 3] &&
      (kind === 'logo' ? 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2] < 45 : onLight && Math.max(d[i], d[i + 1], d[i + 2]) < 70)
    ) {
      d[i] = 236;
      d[i + 1] = 238;
      d[i + 2] = 242;
    }
  }
  info.dark = shot();
  d.set(raw.data);
  light();
  info.mono = shot();
  return info;
}
/* the logo's height in the tile, in % of the tile's height: about the same area whatever its shape, and never wider than 74.8% of
   the tile (dock and grid tiles have their own proportions) */
function logoH(d, asp) {
  var r = d.offsetWidth && d.offsetHeight ? d.offsetWidth / d.offsetHeight : 1.4;
  return Math.min(61.6, 50.6 / Math.sqrt(asp), (74.8 * r) / asp);
}
function darkReset(d) {
  if (!d._dk) return;
  d._dk = '';
  d.classList.remove('dk');
  d.classList.remove('os');
  d.style.background = '';
  d._i.src = d._url;
  if (d._col) paint(d, d._col);
  fit(d, !!(d.parentNode && d.parentNode.id === 'dock'));
}
/* one tile in the style chosen now, once its icon has been read */
function darkApply(d) {
  var a = d._a,
    i = d._i;
  if (!a || a.sys || a.input || !i || !d._url) return;
  var info = iconInfo[a.id];
  if (info === undefined) {
    if (darkQ.indexOf(d) < 0) darkQ.push(d);
    darkNext();
    return;
  }
  if (!info) return darkReset(d);
  var st = iconStyle(),
    key = st || 'orig';
  if (d._dk !== key) {
    d._dk = key;
    d.classList.remove('fill');
    d.classList.toggle('dk', !!st);
    d.classList.toggle('os', !st);
    if (st) {
      d.style.background = '';
      i.src = info[st];
      paint(d, { c: (d._col && d._col.c) || [74, 84, 112], b: DARK_BG });
    } else {
      if (i.src !== d._url) i.src = d._url;
      if (d._col) paint(d, d._col);
      /* the picture's own background; a logo on transparency (your own icon) gets a light tile when it is dark, else the dark one */
      var tb = info.top ? [info.top, info.bot] : info.lm < 110 ? [[240, 241, 244]] : [DARK_BG];
      d.style.background = 'linear-gradient(rgb(' + tb[0].join(',') + '),rgb(' + (tb[1] || tb[0]).join(',') + '))';
    }
  }
  var h = logoH(d, info.asp);
  i.removeAttribute('style');
  if (st) {
    i.style.height = h.toFixed(1) + '%';
    return;
  }
  /* Original: the whole picture, scaled so its logo has that height and centred on the logo; the tile crops the rest */
  var th = d.offsetHeight || 142,
    tw = d.offsetWidth || 200,
    bx = info.box,
    ih = ((h / 100) * th) / (bx[3] - bx[1]),
    iw = ih * info.iasp,
    s = i.style;
  s.position = 'absolute';
  s.maxWidth = 'none';
  s.maxHeight = 'none';
  s.transform = 'none';
  s.width = iw.toFixed(1) + 'px';
  s.height = ih.toFixed(1) + 'px';
  s.left = (tw / 2 - ((bx[0] + bx[2]) / 2) * iw).toFixed(1) + 'px';
  s.top = (th / 2 - ((bx[1] + bx[3]) / 2) * ih).toFixed(1) + 'px';
}
/* the icons are read one at a time, with a pause between them, so Home stays responsive */
function darkNext() {
  if (darkBusy) return;
  var d = darkQ.shift();
  if (!d) return;
  var id = d._a.id;
  if (iconInfo[id] !== undefined) {
    darkApply(d);
    return darkNext();
  }
  darkBusy = true;
  var im = new Image(),
    done = function (info) {
      iconInfo[id] = info;
      darkBusy = false;
      darkApply(d);
      setTimeout(darkNext, 20);
    };
  im.crossOrigin = 'anonymous';
  im.onload = function () {
    var info = '';
    try {
      var an = analyse(im);
      info = an ? cutout(im, an.k) : '';
    } catch (e) {
      info = '';
    }
    done(info);
  };
  im.onerror = function () {
    done('');
  };
  im.src = d._url;
}
/* after a rebuild: every tile in the style chosen now (the size also follows a tile moved between the dock and the grid) */
function darkSync() {
  document.body.classList.toggle('darkic', !!iconStyle());
  for (var id in tiles) darkApply(tiles[id]);
}
