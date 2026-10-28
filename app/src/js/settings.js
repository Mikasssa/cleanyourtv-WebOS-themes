/* ---------- Customise as a full screen (the top bar's Customise button): categories on the left, the settings of the chosen one in
   the middle, and on the right Home itself, scaled into a window, with the options of the setting below it. Every change shows in that
   window at once. The options column is the ordinary menu stack (openMenu and the builders in menus.js), drawn here instead of over
   Home while this screen is open: Back or Left there goes one menu back, and out of the last one to the settings list.
   Keys: Up and Down move in a column, Right or OK goes one column further (OK on a setting opens its options), Left goes back one
   column, Back on the categories closes the screen. ---------- */
var SET = { on: false, el: null, cat: 0, row: 0, col: 0 };
/* a setting with one of a few values: its options column lists them, the chosen one marked */
function choiceMenu(title, opts, cur, set) {
  return function () {
    var at = 0;
    opts.forEach(function (o, i) {
      if (o[0] === cur()) at = i; // the focus starts on the value chosen now
    });
    openBuilt(
      title,
      function () {
        var now = cur();
        return opts.map(function (o) {
          return {
            label: o[1],
            on: now === o[0],
            stay: true,
            fn: function () {
              set(o[0]);
              saveCfg();
            },
          };
        });
      },
      at
    );
  };
}
function setCats() {
  var nh = hiddenIds().length,
    st = iconStyle(),
    cats = [
      {
        icon: 'grid',
        label: t('Home & dock'),
        rows: [
          { label: t('Dock'), value: dockIds().length + ' / ' + TH.dockN, open: dockMenu },
          { label: t('Top buttons'), value: String(shownBar().length), open: topButtonsMenu },
          {
            label: t('Top button labels'),
            value: barLabelsMode() === 'hide' ? t('Icons only') : barLabelsMode() === 'show' ? t('Icons and text') : t('Theme'),
            open: choiceMenu(
              t('Top button labels'),
              [
                ['', t('Theme')],
                ['show', t('Icons and text')],
                ['hide', t('Icons only')],
              ],
              barLabelsMode,
              function (v) {
                if (v) cfg.barLabels = v;
                else delete cfg.barLabels;
              }
            ),
          },
          { label: t('Hidden apps'), value: nh ? String(nh) : t('None'), open: hiddenMenu },
          {
            label: t('App order'),
            value: cfg.sort === 'alpha' ? t('A to Z') : t('Most used first'),
            open: choiceMenu(
              t('App order'),
              [
                ['usage', t('Most used first')],
                ['alpha', t('A to Z')],
              ],
              function () {
                return cfg.sort === 'alpha' ? 'alpha' : 'usage';
              },
              function (v) {
                cfg.sort = v;
              }
            ),
          },
          {
            label: t('Mark running apps'),
            value: cfg.runDots === true ? t('Green dot') : t('No dot'),
            open: choiceMenu(
              t('Mark running apps'),
              [
                [false, t('No dot')],
                [true, t('Green dot')],
              ],
              function () {
                return cfg.runDots === true;
              },
              function (v) {
                if (v) cfg.runDots = true;
                else delete cfg.runDots;
              }
            ),
          },
        ],
      },
      {
        icon: 'palette',
        label: t('Look'),
        rows: [
          { label: t('Theme'), value: (cfg.theme && cfg.theme.name) || 'Classic', open: themeMenu },
          {
            label: t('Accent colour'),
            value: cfg.wallTint === true ? t('From the wallpaper') : t('Theme'),
            open: accentMenu,
          },
          {
            label: t('App icons'),
            value: st === 'dark' ? t('Dark') : st === 'mono' ? t('Dark, one colour') : t('Original'),
            open: choiceMenu(
              t('App icons'),
              [
                ['', t('Original')],
                ['dark', t('Dark')],
                ['mono', t('Dark, one colour')],
              ],
              iconStyle,
              function (v) {
                if (v) cfg.iconStyle = v;
                else delete cfg.iconStyle;
              }
            ),
          },
          {
            label: t('Clock'),
            value: cfg.clock === '24' ? t('24-hour') : cfg.clock === '12' ? t('12-hour') : t('Automatic'),
            open: choiceMenu(
              t('Clock'),
              [
                ['auto', t('Automatic')],
                ['12', t('12-hour')],
                ['24', t('24-hour')],
              ],
              function () {
                return cfg.clock === '24' || cfg.clock === '12' ? cfg.clock : 'auto';
              },
              function (v) {
                cfg.clock = v;
                tick();
              }
            ),
          },
        ].concat((TH.slots || []).length ? [{ label: t('Cards'), value: '', open: cardsMenu }] : []),
      },
      {
        icon: 'image',
        label: t('Background'),
        rows: [{ label: t('Wallpapers'), value: cfg.wall && cfg.wall.on ? t('On') : t('Off'), open: wallMenu }].concat(
          document.body.getAttribute('data-motion')
            ? [
                {
                  label: t('Wallpaper motion'),
                  value: cfg.noDrift === true ? t('Still') : t('Slow drift'),
                  open: choiceMenu(
                    t('Wallpaper motion'),
                    [
                      [false, t('Slow drift')],
                      [true, t('Still')],
                    ],
                    function () {
                      return cfg.noDrift === true;
                    },
                    function (v) {
                      if (v) cfg.noDrift = true;
                      else delete cfg.noDrift;
                    }
                  ),
                },
              ]
            : []
        ),
      },
    ];
  cats.push({
    icon: 'settings',
    label: t('More'),
    rows: [
      {
        label: t('More settings...'),
        value: t('Home, Live TV, Debloat, updates'),
        act: function () {
          launch('com.cleanyourtv.manager');
        },
      },
    ],
    note: t('Hold OK on an app for its options. Back on Home lists the open apps.'),
  });
  return cats;
}
function setOpen() {
  closeMenus();
  SET.on = true;
  SET.cat = Math.min(SET.cat, setCats().length - 1);
  SET.row = 0;
  SET.col = 0;
  document.body.classList.add('peek');
  setDraw();
}
function setClose() {
  SET.on = false;
  stack = [];
  if (SET.el) SET.el.remove();
  SET.el = null;
  document.body.classList.remove('peek');
}
function setEsc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function setDraw() {
  if (!SET.on) return;
  var cats = setCats(),
    cat = cats[Math.min(SET.cat, cats.length - 1)],
    rows = cat.rows,
    m = stack[stack.length - 1],
    inOpts = !!m;
  SET.row = Math.max(0, Math.min(SET.row, rows.length - 1));
  if (!SET.el) {
    SET.el = document.createElement('div');
    SET.el.id = 'sets';
    document.body.appendChild(SET.el);
  }
  var h = '<div class="swin"></div><h1>' + setEsc(t('Customise')) + '</h1><div class="scats">';
  cats.forEach(function (c, i) {
    h +=
      '<div class="scat' +
      (i === SET.cat ? ' on' : '') +
      (i === SET.cat && SET.col === 0 && !inOpts ? ' f' : '') +
      '" data-c="' +
      i +
      '">' +
      svg(c.icon) +
      '<span>' +
      setEsc(c.label) +
      '</span></div>';
  });
  h += '</div><div class="srows">';
  rows.forEach(function (r, i) {
    var cur = i === SET.row && (SET.col === 1 || inOpts);
    h +=
      '<div class="srow' +
      (cur ? (inOpts ? ' on' : ' f') : '') +
      '" data-r="' +
      i +
      '"><span class="lb">' +
      setEsc(r.label) +
      '</span><span class="st">' +
      setEsc(r.value || '') +
      (r.act ? '' : ' ›') +
      '</span></div>';
  });
  if (cat.note) h += '<div class="snote">' + setEsc(cat.note) + '</div>';
  h += '</div><div class="sopts">';
  if (m) {
    var N = 6,
      start = Math.max(0, Math.min(m.idx - 2, m.items.length - N));
    h += '<div class="sot">' + setEsc(m.title) + '</div><div class="more">' + (start > 0 ? '▲' : '') + '</div>';
    for (var i = start; i < Math.min(m.items.length, start + N); i++) {
      var it = m.items[i];
      if (it.sep) continue;
      if (it.note !== undefined) {
        h += '<div class="snote">' + setEsc(it.note) + '</div>';
        continue;
      }
      h +=
        '<div class="sopt' +
        (i === m.idx ? ' f' : '') +
        (it.dim ? ' dim' : '') +
        '" data-i="' +
        i +
        '">' +
        (it.on !== undefined ? '<i class="rad' + (it.on ? ' on' : '') + '"></i>' : it.icon ? svg(it.icon) : '') +
        (it.sw ? '<i class="swc" style="background:' + setEsc(it.sw) + '"></i>' : '') +
        '<span class="lb">' +
        setEsc(it.label) +
        '</span>' +
        (it.adj ? '<i class="adj">\u25C0</i>' : '') +
        (it.sub ? '<span class="st">' + setEsc(it.sub) + '</span>' : '') +
        (it.adj ? '<i class="adj">\u25B6</i>' : '') +
        '</div>';
    }
    h += '<div class="more">' + (start + N < m.items.length ? '▼' : '') + '</div>';
  } else {
    var r0 = rows[SET.row];
    h += '<div class="shint">' + setEsc(r0 ? (r0.act ? t('OK opens it') : t('OK shows the options')) : '') + '</div>';
  }
  h += '</div>';
  SET.el = setHtml(SET.el, h);
  /* the picture of a theme (the theme list) covers the live window while that row has the focus */
  var fi = m && m.items[m.idx],
    w = SET.el.querySelector('.swin');
  if (fi && fi.pv) w.innerHTML = '<img alt="" src="' + API + '/api/theme/preview/' + encodeURIComponent(fi.pv) + '">';
  /* a photo (Wallpapers > Photo) stands in the window while its row has the focus */
  if (fi && fi.img) w.innerHTML = '<img alt="" src="' + setEsc(fi.img) + '">';
  setClicks();
}
/* the Magic Remote's pointer: a click does what OK does there */
function setClicks() {
  [].forEach.call(SET.el.querySelectorAll('.scat'), function (el) {
    el.addEventListener('click', function () {
      stack = [];
      SET.cat = +el.getAttribute('data-c');
      SET.col = 1;
      SET.row = 0;
      setDraw();
    });
  });
  [].forEach.call(SET.el.querySelectorAll('.srow'), function (el) {
    el.addEventListener('click', function () {
      stack = [];
      SET.row = +el.getAttribute('data-r');
      SET.col = 1;
      setEnter();
    });
  });
  [].forEach.call(SET.el.querySelectorAll('.sopt'), function (el) {
    el.addEventListener('click', function () {
      var m = stack[stack.length - 1];
      if (!m) return;
      m.idx = +el.getAttribute('data-i');
      pickMenu();
    });
  });
}
/* OK on a setting: its options open in the right column (or it does its one thing) */
function setEnter() {
  var r = setCats()[SET.cat].rows[SET.row];
  if (!r) return;
  if (r.act) {
    setClose();
    return r.act();
  }
  stack = [];
  r.open(); // a builder from menus.js: openBuilt draws through setDraw while this screen is open (some answer later: themes)
  setDraw();
}
function setKey(k) {
  var cats = setCats(),
    up = k === 38,
    down = k === 40,
    left = k === 37,
    right = k === 39,
    ok = k === 13,
    back = k === 461 || k === 27 || k === 8;
  if (stack.length) {
    var mi = stack[stack.length - 1].items[stack[stack.length - 1].idx];
    if ((left || right) && mi && mi.adj) {
      mi.adj(left ? -1 : 1); // a value changed in place (Accent colour > Your own colour)
      refreshMenu();
      return true;
    }
    if (left) {
      backMenu();
      return true;
    }
    if (right) return true;
    return menuKey(k); // Up, Down, OK, Back: the menu's own keys (Back one menu back, out of the last one to the settings)
  }
  if (SET.col === 0) {
    if (up || down) {
      SET.cat = Math.max(0, Math.min(cats.length - 1, SET.cat + (up ? -1 : 1)));
      SET.row = 0;
    } else if (right || ok) SET.col = 1;
    else if (back || left) {
      setClose();
      return true;
    } else return false;
    setDraw();
    return true;
  }
  var rows = cats[SET.cat].rows;
  if (up || down) SET.row = Math.max(0, Math.min(rows.length - 1, SET.row + (up ? -1 : 1)));
  else if (right || ok) return setEnter(), true;
  else if (left || back) SET.col = 0;
  else return false;
  setDraw();
  return true;
}
