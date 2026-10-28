/* ---------- dark icons (Customise > App icons): each app's own icon with its background taken out, on one dark tile colour, so the
   icons read as one set. 'dark' keeps the logo's colours, 'mono' draws every logo in one light colour. Made in a canvas from the icon
   the TV already has, once per app and style, kept in memory only; an icon that cannot be made dark (art without a plain background,
   an image that cannot be read) stays as it is. ---------- */
var DARK_BG = [24, 26, 32],
  darkMade = {}, // app id + '|' + style: {u: data URL, asp: width / height}, or '' when the icon stays as it is
  darkQ = [],
  darkBusy = false;
function iconStyle() {
  return cfg.iconStyle === 'dark' || cfg.iconStyle === 'mono' ? cfg.iconStyle : '';
}
function cdist(d, i, c) {
  return Math.abs(d[i] - c[0]) + Math.abs(d[i + 1] - c[1]) + Math.abs(d[i + 2] - c[2]);
}
/* the icon without its background, cropped to the logo: {u: a data URL, asp: its width / height}; '' when there is no plain background to take out */
function cutout(img, mono, kind) {
  var S = 256,
    cv = document.createElement('canvas');
  cv.width = cv.height = S;
  var x = cv.getContext('2d');
  x.drawImage(img, 0, 0, S, S);
  var im = x.getImageData(0, 0, S, S),
    d = im.data,
    n = S * S,
    p,
    i,
    k;
  var bg = [];
  for (p = 0; p < n; p++) bg.push(0);
  if (kind !== 'logo') {
    /* the background's colour: the first opaque pixels met coming in from each edge (two in, past the antialiasing) */
    var smp = [],
      cut = function (p0, step, cnt) {
        for (var s = 0; s < cnt; s++) {
          var q = p0 + s * step;
          if (d[q * 4 + 3] >= 200) {
            q += 2 * step;
            if (s + 2 < cnt && d[q * 4 + 3] >= 200) smp.push([d[q * 4], d[q * 4 + 1], d[q * 4 + 2]]);
            return;
          }
        }
      };
    for (k = 4; k < S - 4; k += 6) {
      cut(k * S, 1, S);
      cut(k * S + S - 1, -1, S);
      cut(k, S, S);
      cut((S - 1) * S + k, -S, S);
    }
    if (smp.length < 20) return '';
    var ref = [0, 0, 0];
    smp.forEach(function (c) {
      ref[0] += c[0] / smp.length;
      ref[1] += c[1] / smp.length;
      ref[2] += c[2] / smp.length;
    });
    var near = 0;
    smp.forEach(function (c) {
      if (Math.abs(c[0] - ref[0]) + Math.abs(c[1] - ref[1]) + Math.abs(c[2] - ref[2]) < 120) near++;
    });
    if (near < smp.length * 0.6) return ''; // no plain or gently graded background: a picture, left as it is
    /* flood fill from the edges: transparent pixels, then pixels close to the background's colour, then pixels close to the pixel
       they were reached from (a gradient), never far from the background's colour */
    var st = [];
    var take = function (q, from) {
      if (bg[q]) return;
      var j = q * 4;
      if (d[j + 3] < 40) {
        bg[q] = 1;
      } else {
        var dr = cdist(d, j, ref);
        if (from < 0 || d[from * 4 + 3] < 40) {
          if (dr >= 75) return;
        } else if (dr >= 170 || cdist(d, j, [d[from * 4], d[from * 4 + 1], d[from * 4 + 2]]) >= 26) return;
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
      var px = p % S,
        py = (p - px) / S;
      if (px > 0) take(p - 1, p);
      if (px < S - 1) take(p + 1, p);
      if (py > 0) take(p - S, p);
      if (py < S - 1) take(p + S, p);
    }
    /* the background seen through the logo (inside an O, between letters): a pixel that matches the background just left of it in
       its row. Not on a near-white background, where white inside the logo is usually part of it. */
    if (0.2126 * ref[0] + 0.7152 * ref[1] + 0.0722 * ref[2] < 215) {
      for (var hy = 0; hy < S; hy++) {
        var last = null;
        for (var hx = 0; hx < S; hx++) {
          p = hy * S + hx;
          i = p * 4;
          if (bg[p] === 2) last = [d[i], d[i + 1], d[i + 2]];
          else if (!bg[p] && last && d[i + 3] >= 200 && cdist(d, i, last) < 34) {
            bg[p] = 2;
            last = [d[i], d[i + 1], d[i + 2]];
          }
        }
      }
    }
    var gone = 0;
    for (p = 0; p < n; p++) if (bg[p]) gone++;
    if (gone < n * 0.08) return ''; // hardly any background: the art fills the icon
    /* the logo's edge: a pixel next to the background is part background (antialiasing); take the background's share out */
    for (p = 0; p < n; p++) {
      if (bg[p]) continue;
      var qx = p % S,
        nb = -1;
      if (qx > 0 && bg[p - 1]) nb = p - 1;
      else if (qx < S - 1 && bg[p + 1]) nb = p + 1;
      else if (p >= S && bg[p - S]) nb = p - S;
      else if (p + S < n && bg[p + S]) nb = p + S;
      if (nb < 0) continue;
      i = p * 4;
      var b = bg[nb] === 2 ? [d[nb * 4], d[nb * 4 + 1], d[nb * 4 + 2]] : ref,
        f = Math.min(1, cdist(d, i, b) / 110);
      if (f < 0.08) {
        d[i + 3] = 0;
        continue;
      }
      for (k = 0; k < 3; k++) d[i + k] = Math.max(0, Math.min(255, Math.round(b[k] + (d[i + k] - b[k]) / f)));
      d[i + 3] = Math.round(d[i + 3] * f);
    }
    for (p = 0; p < n; p++) if (bg[p]) d[p * 4 + 3] = 0;
  }
  /* what is left: its box, and how bright it is */
  var x0 = S,
    y0 = S,
    x1 = -1,
    y1 = -1,
    lum = 0,
    w = 0,
    vis = 0;
  for (p = 0; p < n; p++) {
    i = p * 4;
    if (d[i + 3] < 24) continue;
    vis++;
    var a = d[i + 3] / 255;
    lum += a * (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]);
    w += a;
    var cx = p % S,
      cy = (p - cx) / S;
    if (cx < x0) x0 = cx;
    if (cx > x1) x1 = cx;
    if (cy < y0) y0 = cy;
    if (cy > y1) y1 = cy;
  }
  if (vis < n * 0.015) return '';
  lum = w ? lum / w : 255;
  /* one light colour: for 'mono', and for a dark logo that would vanish on the dark tile; dark parts inside the logo fade out */
  if (mono || lum < 60) {
    /* a logo of two tones keeps them apart: its darker parts stay faint, its lighter ones full (lo and hi: the 10th percentile of its
       brightness and its brightest; a small light part, such as a play sign, counts) */
    var ls = [];
    for (p = 0; p < n; p += 3) if (d[p * 4 + 3] >= 128) ls.push(0.2126 * d[p * 4] + 0.7152 * d[p * 4 + 1] + 0.0722 * d[p * 4 + 2]);
    ls.sort(function (u, v) {
      return u - v;
    });
    var lo = ls.length ? ls[Math.floor(ls.length * 0.1)] : 0,
      hi = ls.length ? ls[Math.floor(ls.length * 0.995)] : 255;
    for (p = 0; p < n; p++) {
      i = p * 4;
      if (!d[i + 3]) continue;
      var l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2],
        keep = hi - lo < 50 ? 1 : 0.3 + 0.7 * Math.max(0, Math.min(1, (l - lo) / (hi - lo)));
      d[i] = 236;
      d[i + 1] = 238;
      d[i + 2] = 242;
      d[i + 3] = Math.round(d[i + 3] * keep);
    }
  }
  x.putImageData(im, 0, 0);
  /* cropped to the logo and drawn large, so the page scales it down (sharp on the TV) */
  var bw = x1 - x0 + 1,
    bh = y1 - y0 + 1,
    sc = 256 / Math.max(bw, bh),
    out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(bw * sc));
  out.height = Math.max(1, Math.round(bh * sc));
  out.getContext('2d').drawImage(cv, x0, y0, bw, bh, 0, 0, out.width, out.height);
  return { u: out.toDataURL('image/png'), asp: bw / bh };
}
/* one tile: its dark icon when the style asks for one and it is made, else its own icon */
function darkApply(d) {
  var a = d._a,
    i = d._i;
  if (!a || a.sys || a.input || !i || !d._url) return;
  var st = iconStyle(),
    key = st ? a.id + '|' + st : '',
    u = key ? darkMade[key] : '';
  if (key && u === undefined) {
    if (darkQ.indexOf(d) < 0) darkQ.push(d);
    darkNext();
    return; // the icon it shows now stays until the new one is made
  }
  if (!u) {
    if (!d._dk) return;
    d._dk = '';
    d.classList.remove('dk');
    i.src = d._url;
    if (d._col) paint(d, d._col);
    fit(d, !!(d.parentNode && d.parentNode.id === 'dock'));
    return;
  }
  if (d._dk !== key) {
    d._dk = key;
    d.classList.remove('fill');
    d.classList.add('dk');
    d.style.background = '';
    i.src = u.u;
    paint(d, { c: (d._col && d._col.c) || [74, 84, 112], b: DARK_BG });
  }
  darkSize(d, u.asp);
}
/* every logo about the same area, whatever its shape: a square one 46% of the tile's height, a wide one lower, never wider than 68% of
   the tile (dock and grid tiles have their own proportions) */
function darkSize(d, asp) {
  var i = d._i,
    r = d.offsetWidth && d.offsetHeight ? d.offsetWidth / d.offsetHeight : 1.4,
    h = Math.min(56, 46 / Math.sqrt(asp), (68 * r) / asp);
  i.removeAttribute('style');
  i.style.height = h.toFixed(1) + '%';
}
/* the icons are made one at a time, with a pause between them, so Home stays responsive */
function darkNext() {
  if (darkBusy) return;
  var d = darkQ.shift();
  if (!d) return;
  var st = iconStyle(),
    key = st ? d._a.id + '|' + st : '';
  if (!key || darkMade[key] !== undefined) {
    darkApply(d);
    return darkNext();
  }
  darkBusy = true;
  var im = new Image(),
    done = function (u) {
      darkMade[key] = u;
      darkBusy = false;
      darkApply(d);
      setTimeout(darkNext, 20);
    };
  im.crossOrigin = 'anonymous';
  im.onload = function () {
    var u = '';
    try {
      var an = analyse(im);
      u = an ? cutout(im, st === 'mono', an.k) : '';
    } catch (e) {
      u = '';
    }
    done(u);
  };
  im.onerror = function () {
    done('');
  };
  im.src = d._url;
}
/* after a rebuild: every tile in the style chosen now */
function darkSync() {
  document.body.classList.toggle('darkic', !!iconStyle());
  for (var id in tiles) darkApply(tiles[id]);
}
