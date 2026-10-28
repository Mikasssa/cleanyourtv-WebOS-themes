/* ---------- menus ---------- */
var stack = [],
  ovEl = null;
/* webOS 5's Chromium (68) can leave the old text in the compositor tile when an element's content is replaced, so menu and list text shows
   twice (issue 4). There the element is swapped for a fresh one instead of rewriting its content; newer engines just set innerHTML. */
var OLDGPU = (function () {
  var m = /Chrome\/(\d+)/.exec(navigator.userAgent || '');
  return !!m && +m[1] < 79;
})();
function setHtml(el, h) {
  if (!OLDGPU || !el.parentNode) {
    el.innerHTML = h;
    return el;
  }
  var n = el.cloneNode(false);
  n.innerHTML = h;
  el.parentNode.replaceChild(n, el);
  return n;
}
/* A menu can be built by a function (build): after a row with stay changes something, the menu is built again and stays open with the
   new values, and the menu below is built again when Back returns to it. A note row is text only: the focus skips it. */
function openMenu(title, items, idx, build) {
  var m = { title: title, items: build ? build() : items, idx: idx || 0, build: build || null };
  m.idx = usable(m, m.idx);
  stack.push(m);
  drawMenu();
}
function openBuilt(title, build, idx) {
  openMenu(title, null, idx, build);
}
function skip(it) {
  return !it || it.sep || it.note !== undefined;
}
/* the row at i, or the nearest one after (then before) it that can take the focus */
function usable(m, i) {
  var n = m.items.length;
  i = Math.max(0, Math.min(i, n - 1));
  for (var j = i; j < n; j++) if (!skip(m.items[j])) return j;
  for (j = i; j >= 0; j--) if (!skip(m.items[j])) return j;
  return i;
}
function refreshMenu() {
  var m = stack[stack.length - 1];
  if (!m) return;
  if (m.build) {
    /* the focus stays on the row with the same label (after "Move right" a "Move left" row can appear above it) */
    var was = m.items[m.idx] && m.items[m.idx].label;
    m.items = m.build();
    for (var i = 0; i < m.items.length; i++)
      if (was && m.items[i].label === was && !skip(m.items[i])) {
        m.idx = i;
        break;
      }
    m.idx = usable(m, m.idx);
  }
  drawMenu();
}
function closeMenus() {
  if (SET.on) return setClose(); // a row that finished a task (opened an app) also closes the Customise screen
  stack = [];
  if (ovEl) {
    ovEl.remove();
    ovEl = null;
  }
  drawSide(null);
}
/* a menu whose rows carry a picture (pv, the theme list) shows it with a description left of the list. Its own element, outside
   the menu that is redrawn on every key, so the picture is only loaded again when the focused row's picture changes. */
var sideEl = null;
function drawSide(it) {
  if (SET.on) it = null; // the Customise screen shows the picture in its own window (settings.js)
  if (!it) {
    if (sideEl) sideEl.remove();
    sideEl = null;
    return;
  }
  if (!sideEl) {
    sideEl = document.createElement('div');
    sideEl.id = 'ovside';
    sideEl.innerHTML = '<div class="pvbox"><img alt=""></div><div class="pt"></div><div class="pd"></div>';
    document.body.appendChild(sideEl);
  }
  var img = sideEl.querySelector('img'),
    url = it.pv ? API + '/api/theme/preview/' + it.pv : '';
  if (img.getAttribute('data-u') !== url) {
    img.setAttribute('data-u', url);
    img.style.visibility = 'hidden';
    img.onload = function () {
      img.style.visibility = '';
    };
    if (url) img.src = url;
    else img.removeAttribute('src');
  }
  sideEl.querySelector('.pt').textContent = it.label;
  sideEl.querySelector('.pd').textContent = it.desc || '';
}
function backMenu() {
  stack.pop();
  if (stack.length) refreshMenu();
  else if (SET.on)
    setDraw(); // out of the last options menu: back to the settings list
  else closeMenus();
}
function drawMenu() {
  if (SET.on) return setDraw(); // the Customise screen draws the menu in its options column
  var m = stack[stack.length - 1],
    N = 8,
    start = Math.max(0, Math.min(m.idx - 3, m.items.length - N));
  if (!ovEl) {
    ovEl = document.createElement('div');
    ovEl.id = 'ov';
    document.body.appendChild(ovEl);
  }
  var h = '<div class="panel"><h2></h2><div class="more">' + (start > 0 ? '▲' : '') + '</div>';
  for (var i = start; i < Math.min(m.items.length, start + N); i++) {
    var it = m.items[i];
    if (it.sep) {
      h += '<div class="msep"></div>';
      continue;
    }
    if (it.note !== undefined) {
      h += '<div class="mnote" data-n="' + i + '"></div>';
      continue;
    }
    h +=
      '<div class="row' +
      (i === m.idx ? ' f' : '') +
      (it.dim ? ' dim' : '') +
      '" data-i="' +
      i +
      '">' +
      (it.icon ? svg(it.icon) : '') +
      '<span class="lb"></span>' +
      (it.sub ? '<span class="st"></span>' : '') +
      '</div>';
  }
  h += '<div class="more">' + (start + N < m.items.length ? '▼' : '') + '</div></div>';
  ovEl = setHtml(ovEl, h);
  var side = m.items.some(function (x) {
    return x.desc !== undefined;
  });
  ovEl.className = side ? 'ws' : '';
  drawSide(side && !skip(m.items[m.idx]) ? m.items[m.idx] : null);
  ovEl.querySelector('h2').textContent = m.title;
  [].forEach.call(ovEl.querySelectorAll('.mnote'), function (el) {
    el.textContent = m.items[+el.getAttribute('data-n')].note;
  });
  [].forEach.call(ovEl.querySelectorAll('.row'), function (row) {
    var it = m.items[+row.getAttribute('data-i')];
    row.querySelector('.lb').textContent = it.label;
    if (it.sub) row.querySelector('.st').textContent = it.sub;
    var pt = 0,
      rowHeld = false;
    if (it.hold) {
      row.addEventListener('mousedown', function () {
        rowHeld = false;
        clearTimeout(pt);
        pt = setTimeout(function () {
          rowHeld = true;
          it.hold();
        }, 650);
      });
      row.addEventListener('mouseup', function () {
        clearTimeout(pt);
      });
    }
    row.addEventListener('click', function () {
      if (rowHeld) return void (rowHeld = false);
      m.idx = +row.getAttribute('data-i');
      pickMenu();
    });
  });
}
/* a row without stay closes the menus (it opened an app or finished a task); with stay the menu stays and shows the new values */
function pickMenu() {
  var m = stack[stack.length - 1],
    it = m.items[m.idx];
  if (it && it.fn && !skip(it)) {
    var n = stack.length;
    it.fn();
    if (stack.length !== n || stack[stack.length - 1] !== m) return;
    if (it.stay) refreshMenu();
    else closeMenus();
  }
}
/* the next row up or down that can take the focus, or -1 */
function menuStep(m, d) {
  for (var i = m.idx + d; i >= 0 && i < m.items.length; i += d) if (!skip(m.items[i])) return i;
  return -1;
}
function menuKey(k) {
  var m = stack[stack.length - 1],
    n = k === 38 ? menuStep(m, -1) : k === 40 ? menuStep(m, 1) : -1;
  if (n >= 0) {
    m.idx = n;
    drawMenu();
  } else if (k === 38 || k === 40) {
    /* the first or last row: nothing to move to */
  } else if (k === 13) pickMenu();
  else if (k === 461 || k === 27 || k === 8) backMenu();
  else return false;
  return true;
}

/* Back on the home screen lists the running apps to close them, as LG's Home does with its Recents on a second Back (issue 16) */
function runningMenu() {
  api('/api/running').then(
    function (x) {
      if (x.error) return toast(t('Could not read the open apps. Try again in a moment.'), true);
      openMenu(t('Running apps'), runningItems(x.apps || []));
      stack[stack.length - 1].running = true;
    },
    function () {
      toast(t('Could not read the open apps. Try again in a moment.'), true);
    }
  );
}
/* the list is only true for the moment it was read: it goes when Home is left, so it is never shown out of date */
function closeRunningMenu() {
  if (
    stack.some(function (m) {
      return m.running;
    })
  )
    closeMenus();
}
function runningItems(list) {
  if (!list.length) return [{ label: t('No apps are running'), dim: true }];
  var items = list.map(function (a) {
    return {
      label: a.title,
      sub: t('Close'),
      stay: true,
      fn: function () {
        closeRunning(list, [a.id]);
      },
    };
  });
  if (list.length > 1)
    items.push({
      label: t('Close all'),
      stay: true,
      fn: function () {
        closeRunning(
          list,
          list.map(function (a) {
            return a.id;
          })
        );
      },
    });
  return items;
}
/* the app manager's running list lags by seconds after a close, so the rows go at once instead of after a new reading */
function closeRunning(list, ids) {
  var m = stack[stack.length - 1],
    left = list.filter(function (a) {
      return ids.indexOf(a.id) < 0;
    });
  api('/api/running/close', ids.length > 1 ? { all: true } : { id: ids[0] }).then(
    function (x) {
      if (!x || x.returnValue !== true) toast(t('Could not close the app. Try again, or close it from the app itself.'), true);
    },
    function () {
      toast(t('Could not close the app. Try again, or close it from the app itself.'), true);
    }
  );
  ids.forEach(function (id) {
    delete running[id];
  });
  markRunning();
  m.items = runningItems(left);
  m.idx = Math.min(m.idx, m.items.length - 1);
  drawMenu();
}

function inputsMenu() {
  api('/api/inputs').then(function (x) {
    var items = (x.devices || [])
      .filter(function (d) {
        return d.appId;
      })
      .map(function (d) {
        var port = 'HDMI ' + d.port,
          named = d.label && d.label !== port && d.label !== 'HDMI ' + d.port,
          parts = [];
        if (named) parts.push(port);
        if (d.hdmiPlugIn) parts.push(t('Connected'));
        if (d.activate) parts.push(t('Active'));
        return {
          icon: 'hdmi',
          label: d.label || port,
          sub: parts.join(' \u00B7 '),
          dim: !d.hdmiPlugIn,
          fn: function () {
            launch(d.appId);
          },
          /* hold OK: pin the input to Home, where it is a tile like an app */
          hold: function () {
            inputMenu(d.appId, d.label || port);
          },
        };
      });
    openMenu(t('Inputs'), items);
  });
}
function isPinned(id) {
  return apps.some(function (a) {
    return a.id === id && a.input;
  });
}
function inputMenu(id, name) {
  var on = isPinned(id);
  openMenu(name, [
    {
      label: t('Open'),
      fn: function () {
        launch(id);
      },
    },
    {
      label: on ? t('Remove from Home') : t('Add to Home'),
      fn: function () {
        pinInput(id, name, !on);
      },
    },
  ]);
}
/* the service keeps the pinned inputs (also for the Inputs picker) and lists them with the apps */
function pinInput(id, name, on) {
  api('/api/inputs/pin', { id: id, on: on }).then(
    function (x) {
      if (!x || x.returnValue !== true) return toast(t('Could not change Home. Try again in a moment.'), true);
      toast((on ? t('%s added to Home') : t('%s removed from Home')).replace('%s', name));
      lastSig = '';
      load();
    },
    function () {
      toast(t('Could not change Home. Try again in a moment.'), true);
    }
  );
}

function appMenu(a) {
  openBuilt(a.title, function () {
    var di = dockIds(),
      pos = di.indexOf(a.id),
      move = function (d) {
        var x = di.slice();
        x[pos] = x[pos + d];
        x[pos + d] = a.id;
        setDock(x);
      },
      items = [
        {
          label: t('Open'),
          fn: function () {
            launch(a.id);
          },
        },
      ];
    if (pos >= 0) {
      if (pos > 0)
        items.push({
          label: t('Move left in dock'),
          stay: true,
          fn: function () {
            move(-1);
          },
        });
      if (pos < di.length - 1)
        items.push({
          label: t('Move right in dock'),
          stay: true,
          fn: function () {
            move(1);
          },
        });
      items.push({
        label: t('Remove from dock'),
        stay: true,
        fn: function () {
          setDock(
            di.filter(function (i) {
              return i !== a.id;
            })
          );
        },
      });
    } else if (di.length < TH.dockN)
      items.push({
        label: t('Add to dock'),
        stay: true,
        fn: function () {
          setDock(di.concat(a.id));
        },
      });
    else
      items.push({
        label: t('Add to dock...'),
        stay: true,
        fn: function () {
          openMenu(
            t('Replace which app?'),
            di.map(function (id, i) {
              return {
                label: title(id),
                stay: true,
                fn: function () {
                  var d = di.slice();
                  d[i] = a.id;
                  setDock(d);
                  backMenu();
                },
              };
            })
          );
        },
      });
    /* App icons > Dark: this one logo in one light colour, when its own colours do not sit well on the dark tile */
    if (iconStyle() === 'dark' && !a.input && !a.sys)
      items.push({
        label: t('Logo colours'),
        sub: monoIcon(a.id) ? t('One colour') : t('Its own'),
        stay: true,
        fn: function () {
          var m = (cfg.monoIcons || []).filter(function (i) {
            return i !== a.id;
          });
          if (!monoIcon(a.id)) m.push(a.id);
          if (m.length) cfg.monoIcons = m;
          else delete cfg.monoIcons;
          saveCfg();
        },
      });
    if (a.input)
      items.push({
        label: t('Remove from Home'),
        fn: function () {
          pinInput(a.id, a.title, false);
        },
      });
    else
      items.push({
        label: t('Hide app'),
        fn: function () {
          hideApp(a.id);
          toast(t('%s is hidden. Customise > Hidden apps shows it again.').replace('%s', a.title));
        },
      });
    return items;
  });
}

function removeButton(o) {
  cfg.topbar = topbar().filter(function (b) {
    return b !== o;
  });
  saveCfg();
}
/* moves a button one place among the shown ones (a hidden Live TV button keeps its place in the saved list) */
function moveButton(o, d) {
  var tb = topbar().slice(),
    i = tb.indexOf(o),
    j = i + d;
  while (j >= 0 && j < tb.length && !liveOn() && tb[j].action === 'live') j += d;
  if (i < 0 || j < 0 || j >= tb.length) return;
  tb[i] = tb[j];
  tb[j] = o;
  cfg.topbar = tb;
  saveCfg();
}
function barMenu(o) {
  openBuilt(barLabel(o), function () {
    var sb = shownBar(),
      pos = sb.indexOf(o),
      items = [];
    if (pos > 0)
      items.push({
        label: t('Move left'),
        stay: true,
        fn: function () {
          moveButton(o, -1);
        },
      });
    if (pos >= 0 && pos < sb.length - 1)
      items.push({
        label: t('Move right'),
        stay: true,
        fn: function () {
          moveButton(o, 1);
        },
      });
    items.push({
      label: t('Remove this button'),
      stay: true,
      fn: function () {
        removeButton(o);
        backMenu();
      },
    });
    return items;
  });
}
/* Wallpapers: switched on here and how often the photo changes; the photos are added in the manager (uploads from a phone, Immich) */
function wallMenu() {
  var photos = [];
  api('/api/wallpapers/list').then(
    function (x) {
      photos = (x && x.photos) || [];
      if (stack.length) refreshMenu();
    },
    function () {}
  );
  var setWall = function (patch) {
    var w = cfg.wall || { on: false },
      n = { on: !!w.on, secs: wallSecs() };
    if (w.pick) n.pick = w.pick;
    for (var k in patch) n[k] = patch[k];
    if (!n.pick) delete n.pick;
    cfg.wall = n;
    saveCfg();
  };
  openBuilt(t('Wallpapers'), function () {
    var w = cfg.wall || { on: false },
      e = wallSecs(),
      n = photos.length || +String((cfg.wallpapers && cfg.wallpapers.stamp) || '0').split(':')[0] || 0,
      EV = [0, 10, 30, 60, 180, 300, 900, 3600],
      pk = w.pick && photos.indexOf(w.pick) >= 0 ? w.pick : '',
      name = function (x) {
        return !x
          ? t('Each time Home opens')
          : x < 60
            ? t('Every %s s').replace('%s', x)
            : x === 60
              ? t('Every minute')
              : t('Every %s min').replace('%s', x / 60);
      };
    return [
      {
        label: t('Use Wallpapers'),
        sub: (w.on ? t('On') : t('Off')) + ' \u00B7 ' + (n ? t(n + ' photos') : t('no photos yet')),
        stay: true,
        fn: function () {
          setWall({ on: !w.on });
        },
      },
      {
        label: t('Photo'),
        sub: pk ? t('Photo %s').replace('%s', photos.indexOf(pk) + 1) : t('All, in turn'),
        img: pk ? API + '/api/wallpapers/photo/' + pk : '',
        stay: true,
        fn: function () {
          if (!photos.length) return toast(t('No photos yet: add them in the CleanYourTV app.'), true);
          var at = pk ? photos.indexOf(pk) + 1 : 0;
          openBuilt(
            t('Photo'),
            function () {
              var cur = (cfg.wall && cfg.wall.pick) || '';
              return [
                {
                  label: t('All, in turn'),
                  on: !cur || photos.indexOf(cur) < 0,
                  stay: true,
                  fn: function () {
                    setWall({ pick: '', on: true });
                  },
                },
              ].concat(
                photos.map(function (id, i) {
                  return {
                    label: t('Photo %s').replace('%s', i + 1),
                    sub: id.charAt(0) === 'i' ? 'Immich' : '',
                    img: API + '/api/wallpapers/photo/' + id,
                    on: cur === id,
                    stay: true,
                    fn: function () {
                      setWall({ pick: id, on: true });
                    },
                  };
                })
              );
            },
            at
          );
        },
      },
      {
        label: t('New photo'),
        sub: pk ? t('Off: one photo is chosen') : name(e),
        dim: !!pk,
        stay: true,
        fn: function () {
          if (pk) return;
          var k = EV.indexOf(e);
          setWall({ secs: EV[(k < 0 ? 6 : k + 1) % EV.length] });
        },
      },
      { sep: true },
      {
        label: t('Add photos...'),
        sub: t('in the CleanYourTV app'),
        fn: function () {
          launch('com.cleanyourtv.manager', { open: 'wallpapers' });
        },
      },
    ];
  });
}
/* the apps that can go in the dock or on a button: not hidden, not Live TV, A to Z */
function pickApp(heading, skip, cb) {
  var list = apps
    .filter(function (a) {
      return a.id !== '__live' && !isHidden(a.id) && skip.indexOf(a.id) < 0;
    })
    .sort(function (a, b) {
      return a.title.localeCompare(b.title);
    });
  openMenu(
    heading,
    list.map(function (a) {
      return {
        label: a.title,
        stay: true,
        fn: function () {
          cb(a);
        },
      };
    })
  );
}
function dockMenu() {
  openBuilt(t('Dock'), function () {
    var di = dockIds(),
      items = di.map(function (id, i) {
        return {
          label: title(id),
          stay: true,
          fn: function () {
            dockSlotMenu(i);
          },
        };
      });
    if (di.length < TH.dockN)
      items.push({
        label: t('Add an app...'),
        stay: true,
        fn: function () {
          pickApp(t('Add to dock'), di, function (a) {
            setDock(dockIds().concat(a.id));
            backMenu();
          });
        },
      });
    return items;
  });
}
/* one app in the dock; after a move the menu stays on the same app (now in its new place), so it can be moved again */
function dockSlotMenu(start) {
  var id = dockIds()[start];
  openBuilt(title(id), function () {
    var di = dockIds(),
      i = di.indexOf(id),
      move = function (d) {
        var x = di.slice();
        x[i] = x[i + d];
        x[i + d] = id;
        setDock(x);
      },
      items = [
        {
          label: t('Replace with...'),
          stay: true,
          fn: function () {
            pickApp(title(id), [id], function (a) {
              /* an app that is in the dock already swaps places with this one */
              var x = di.slice(),
                j = x.indexOf(a.id);
              if (j >= 0) x[j] = id;
              x[i] = a.id;
              setDock(x);
              backMenu();
              backMenu();
            });
          },
        },
      ];
    if (i > 0)
      items.push({
        label: t('Move left'),
        stay: true,
        fn: function () {
          move(-1);
        },
      });
    if (i >= 0 && i < di.length - 1)
      items.push({
        label: t('Move right'),
        stay: true,
        fn: function () {
          move(1);
        },
      });
    items.push({
      label: t('Remove from dock'),
      stay: true,
      fn: function () {
        setDock(
          di.filter(function (x) {
            return x !== id;
          })
        );
        backMenu();
      },
    });
    return items;
  });
}
function topButtonsMenu() {
  openBuilt(t('Top buttons'), function () {
    var items = shownBar().map(function (o) {
      return {
        icon: o.icon,
        label: barLabel(o),
        stay: true,
        fn: function () {
          barMenu(o);
        },
      };
    });
    items.push({ label: t('Add a button...'), stay: true, fn: addButtonMenu });
    return items;
  });
}
/* themes come from the service (GET /api/theme/list); choosing one applies it, a theme not on the TV is downloaded first */
function themeList(then) {
  api('/api/theme/list').then(
    function (r) {
      if (r.error) return toast(r.error, true);
      then(r);
    },
    function () {
      toast(t('Could not load the themes. Try again in a moment.'), true);
    }
  );
}
/* the service answers with the theme list again; the open theme or accent menu is built from it, so it shows the new choice */
function themeCall(path, b, after) {
  api(path, b).then(
    function (r) {
      if (r.error) return toast(r.error, true);
      lastSig = '';
      load();
      if (after) after(r);
    },
    function () {
      toast(t('Could not load the themes. Try again in a moment.'), true);
    }
  );
}
function themeMenu() {
  themeList(function (data) {
    var at = 0,
      build = function () {
        var r = data,
          cur = (r.current && r.current.id) || 'classic',
          name = function (id) {
            var n = id;
            (r.themes || []).forEach(function (x) {
              if (x.id === id) n = x.name;
            });
            return n;
          },
          items = (r.themes || []).map(function (x, i) {
            if (x.id === cur) at = i;
            return {
              label: x.name,
              pv: x.preview ? x.id : '',
              desc: (x.description || '') + (x.author ? '\n\n' + x.author : ''),
              sub: x.id === cur ? t('Selected') : x.installed || x.id === 'classic' ? '' : t('Downloads when chosen'),
              stay: true,
              fn: function () {
                if (x.id === cur) return;
                if (!x.installed) toast(t('Getting the theme...'));
                themeCall('/api/theme/set', { id: x.id }, update);
              },
            };
          });
        if (r.previous && r.previous.id) {
          items.push({ sep: true });
          items.push({
            icon: 'restore',
            label: t('Go back to the previous theme'),
            sub: name(r.previous.id),
            pv: (r.themes || []).some(function (x) {
              return x.id === r.previous.id && x.preview;
            })
              ? r.previous.id
              : '',
            desc: '',
            stay: true,
            fn: function () {
              themeCall('/api/theme/revert', {}, update);
            },
          });
        }
        return items;
      },
      update = function (r) {
        data = r;
        if (stack.length && stack[stack.length - 1].build === build) refreshMenu();
      };
    build();
    if (data.catalogue && !data.catalogue.ok) toast(t('Could not reach GitHub: showing the themes on this TV'));
    openBuilt(t('Theme'), build, at);
  });
}
function accentMenu() {
  themeList(function (data) {
    var at = 0,
      build = function () {
        var cur = (data.current && data.current.accent) || '',
          wall = cfg.wallTint === true;
        /* first: the wallpaper's colour, also for the dock (walltint.js); choosing any other colour turns it off */
        return [
          {
            label: t('From the wallpaper'),
            sub: wall ? t('Selected') : t('Accent and dock'),
            stay: true,
            fn: function () {
              cfg.wallTint = true;
              saveCfg();
            },
          },
        ].concat(
          (data.accents || []).map(function (a, i) {
            if (!wall && a.hex === cur) at = i + 1;
            return {
              label: a.name === 'Theme default' ? t('Theme default') : t(a.name), // the other names are colours the service lists
              sub: !wall && a.hex === cur ? t('Selected') : '',
              stay: true,
              fn: function () {
                if (wall) {
                  delete cfg.wallTint;
                  saveCfg();
                }
                themeCall('/api/theme/set', { accent: a.hex }, update);
              },
            };
          }),
          [
            {
              label: t('Your own colour...'),
              sub:
                !wall &&
                cur &&
                !(data.accents || []).some(function (a) {
                  return a.hex === cur;
                })
                  ? t('Selected')
                  : '',
              sw: cur || '',
              stay: true,
              fn: function () {
                customAccent(cur || cssVar('--acc') || '#5ac8fa', update);
              },
            },
          ]
        );
      },
      update = function (r) {
        data = r;
        if (stack.length && stack[stack.length - 1].build === build) refreshMenu();
      };
    build();
    openBuilt(t('Accent colour'), build, at);
  });
}
function cssVar(n) {
  return getComputedStyle(document.documentElement).getPropertyValue(n).trim();
}
function hexOf(c) {
  return (
    '#' +
    c
      .map(function (v) {
        return ('0' + Math.max(0, Math.min(255, Math.round(v))).toString(16)).slice(-2);
      })
      .join('')
  );
}
/* Accent colour > Your own colour: hue, saturation and lightness, changed with Left and Right (OK steps forward too). Home shows the
   colour at once; it is saved a moment after the last change. */
function customAccent(start, after) {
  var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(start || ''),
    h = m ? rgb2hsl(parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)) : [200, 0.8, 0.6],
    hsl = { h: Math.round(h[0] / 5) * 5, s: Math.round(h[1] * 20) * 5, l: Math.round(h[2] * 20) * 5 },
    saveT = 0;
  var now = function () {
    return hexOf(hsl2rgb(hsl.h, hsl.s / 100, hsl.l / 100));
  };
  var show = function () {
    var x = now(),
      c = hsl2rgb(hsl.h, hsl.s / 100, hsl.l / 100),
      st = document.documentElement.style;
    st.setProperty('--acc', x);
    st.setProperty('--focus', x);
    st.setProperty('--acc-ink', 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2] > 150 ? '#0b0c10' : '#ffffff');
    clearTimeout(saveT);
    saveT = setTimeout(function () {
      if (cfg.wallTint === true) {
        delete cfg.wallTint;
        saveCfg();
      }
      themeCall('/api/theme/set', { accent: x }, after);
    }, 700);
  };
  var row = function (label, key, step, lo, hi, wrap, unit) {
    return {
      label: label,
      sub: hsl[key] + unit,
      sw: key === 'h' ? hexOf(hsl2rgb(hsl.h, 0.85, 0.55)) : now(),
      stay: true,
      adj: function (d) {
        var v = hsl[key] + d * step;
        hsl[key] = wrap ? (v + hi + step) % (hi + step) : Math.max(lo, Math.min(hi, v));
        show();
      },
      fn: function () {
        this.adj(1);
      },
    };
  };
  openBuilt(t('Your own colour'), function () {
    return [
      row(t('Hue'), 'h', 10, 0, 350, true, '\u00B0'),
      row(t('Saturation'), 's', 5, 0, 100, false, '%'),
      row(t('Lightness'), 'l', 5, 15, 90, false, '%'),
      { note: t('Left and Right change the value. Home shows the colour at once.') },
    ];
  });
}
function addButtonMenu() {
  var add = function (b) {
    cfg.topbar = topbar().concat([b]);
    saveCfg();
  };
  var items = PRESETS.filter(function (p) {
    return liveOn() || p.action !== 'live';
  }).map(function (p) {
    return {
      icon: p.icon,
      label: barLabel(p),
      stay: true,
      fn: function () {
        add(p);
        backMenu();
      },
    };
  });
  items.push({
    label: t('An app...'),
    stay: true,
    fn: function () {
      pickApp(t('Pick an app'), [], function (a) {
        add({ label: a.title, icon: 'grid', app: a.id });
        backMenu();
        backMenu();
      });
    },
  });
  openMenu(t('Add a button'), items);
}
function hiddenIds() {
  return (cfg.hidden || []).filter(function (id) {
    return apps.some(function (a) {
      return a.id === id;
    });
  });
}
function hiddenMenu() {
  openBuilt(t('Hidden apps'), function () {
    var h = hiddenIds();
    if (!h.length) return [{ note: t('No hidden apps. To hide one, hold OK on it on Home and choose Hide app.') }];
    return [{ note: t('OK shows an app on Home again.') }].concat(
      h.map(function (id) {
        return {
          label: title(id),
          stay: true,
          fn: function () {
            unhideApp(id);
          },
        };
      })
    );
  });
}
