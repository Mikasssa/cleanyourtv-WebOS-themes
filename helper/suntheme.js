// Switches the home-screen theme between a "light" and a "dark" pick, automatically, without any network check: it follows a
// small built-in table of Warsaw's approximate sunrise/sunset by month (no geolocation, no outside service). Four modes:
//   "off"   do nothing (the default: a theme chosen in Customise is left alone until this is turned on)
//   "auto"  follow the table
//   "light" always use the light theme
//   "dark"  always use the dark theme
// The user can also say which theme id is the light one and which is the dark one; the default pair is this fork's own
// "glass-light" and "glass". Settings live in config.json under "suntheme" (config.update, like every other part). The mode stays
// "off" until something sets it, so installing this does not change anyone's theme on its own.
// API (loopback only): GET /api/suntheme -> {mode, lightId, darkId, isDay}, POST /api/suntheme {mode?, lightId?, darkId?} (same
// shape back, and applies the pick right away unless the mode is "off").
const MODE = /^(off|auto|light|dark)$/;
const THEME_ID = /^[a-z0-9-]{1,30}$/;
const DEFAULTS = { mode: 'off', lightId: 'glass-light', darkId: 'glass' };
const CHECK_MS = 15 * 60 * 1000; // re-check every 15 minutes: plenty for a mood switch, not a clock

// Warsaw (about 52.2N, 21.0E): civil sunrise and sunset, in local wall-clock hours (decimal), on the 15th of each month,
// rounded to the nearest 10 minutes. Good enough to pick day or night for the home screen; not an almanac.
const SUN_HOURS = [
  [7.8, 15.8], // Jan
  [7.1, 16.7], // Feb
  [6.0, 17.6], // Mar (before the spring clock change)
  [6.3, 19.6], // Apr
  [5.3, 20.5], // May
  [4.5, 21.1], // Jun
  [4.6, 21.0], // Jul
  [5.3, 20.2], // Aug
  [6.1, 19.0], // Sep
  [6.9, 17.8], // Oct (before the autumn clock change)
  [6.9, 15.7], // Nov
  [7.7, 15.4], // Dec
];

// true when `date` (the TV's local clock) falls between Warsaw's approximate sunrise and sunset for that month.
function isDay(date) {
  const d = date || new Date();
  const hours = d.getHours() + d.getMinutes() / 60;
  const pair = SUN_HOURS[d.getMonth()];
  return hours >= pair[0] && hours < pair[1];
}

function create(ctx) {
  const conf = () => Object.assign({}, DEFAULTS, ctx.config.get().suntheme || {});
  const save = patch =>
    ctx.config.update('suntheme', c => {
      c.suntheme = Object.assign({}, conf(), patch);
    });

  // the theme to show right now, given the mode and the sun table ("off" has no pick: apply() stops before calling this)
  function wanted(c) {
    if (c.mode === 'light') return c.lightId;
    if (c.mode === 'dark') return c.darkId;
    return isDay() ? c.lightId : c.darkId;
  }

  async function apply() {
    const c = conf(),
      theme = ctx.feature('theme');
    if (c.mode === 'off' || !theme || typeof theme.setId !== 'function') return;
    try {
      await theme.setId(wanted(c));
    } catch (e) {
      console.error('suntheme: could not switch theme: ' + (e.message || e));
    }
  }

  async function handle(req, res, u, body) {
    const json = (o, code) => {
      res.writeHead(code || 200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(o));
    };
    if (req.method === 'GET') return json(Object.assign({ isDay: isDay() }, conf()));
    if (req.method !== 'POST') {
      res.writeHead(404);
      return res.end();
    }
    const b = await body(req),
      patch = {};
    if (b.mode !== undefined) {
      if (!MODE.test(String(b.mode))) return json({ error: 'mode must be auto, light or dark' }, 400);
      patch.mode = b.mode;
    }
    if (b.lightId !== undefined) {
      if (!THEME_ID.test(String(b.lightId))) return json({ error: 'lightId is not a valid theme id' }, 400);
      patch.lightId = b.lightId;
    }
    if (b.darkId !== undefined) {
      if (!THEME_ID.test(String(b.darkId))) return json({ error: 'darkId is not a valid theme id' }, 400);
      patch.darkId = b.darkId;
    }
    save(patch);
    await apply();
    json(Object.assign({ isDay: isDay() }, conf()));
  }

  let timer = null;
  function start() {
    apply().catch(() => {});
    timer = setInterval(() => apply().catch(() => {}), CHECK_MS);
    if (timer.unref) timer.unref();
  }

  return { name: 'suntheme', paths: ['/api/suntheme'], handle, start, isDay, apply, wanted };
}

module.exports = { create, isDay, SUN_HOURS, DEFAULTS };
