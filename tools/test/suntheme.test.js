// suntheme.js: the day/night theme switch. The sun table is pure (no clock dependency beyond the Date given to it), and the
// feature itself is tested with a stand-in "theme" feature instead of a real theme module.
const { ok, call, memoryConfig, req, run } = require('./lib');

const d = (month, day, hour, minute) => new Date(2026, month - 1, day, hour, minute || 0);

run(async () => {
  const suntheme = req('suntheme');

  // the pure sun table: a few unambiguous points, away from the dawn/dusk edge
  ok(suntheme.isDay(d(6, 15, 12, 0)) === true, 'midsummer noon is day');
  ok(suntheme.isDay(d(6, 15, 2, 0)) === false, 'midsummer 2am is night');
  ok(suntheme.isDay(d(12, 15, 12, 0)) === true, 'midwinter noon is day');
  ok(suntheme.isDay(d(12, 15, 20, 0)) === false, 'midwinter 8pm is night (sunset is mid-afternoon)');
  ok(suntheme.isDay(d(12, 15, 7, 0)) === false, 'midwinter 7am is still night (sunrise is well after 7)');

  // the feature: a stand-in "theme" module records what it is asked to switch to
  const applied = [];
  const config = memoryConfig({});
  const fakeTheme = { setId: async id => applied.push(id) };
  const ctx = { config, feature: name => (name === 'theme' ? fakeTheme : null) };
  const f = suntheme.create(ctx);

  // default settings: off, so installing this does not change anyone's theme on its own
  let r = await call(f, '/api/suntheme', 'GET');
  ok(r.code === 200 && r.j.mode === 'off' && r.j.lightId === 'glass-light' && r.j.darkId === 'glass', 'defaults: off, glass-light/glass');
  ok(typeof r.j.isDay === 'boolean', 'the current isDay is reported');

  // off does nothing, even with a POST that only touches the ids
  r = await call(f, '/api/suntheme', 'POST', { lightId: 'glass-light' });
  ok(r.code === 200 && applied.length === 0, 'mode off never applies a theme');

  // forcing light always asks the theme module for the light id
  r = await call(f, '/api/suntheme', 'POST', { mode: 'light' });
  ok(r.code === 200 && r.j.mode === 'light', 'mode saved as light');
  ok(applied[applied.length - 1] === 'glass-light', 'forcing light switches to the light theme');

  // forcing dark always asks for the dark id
  r = await call(f, '/api/suntheme', 'POST', { mode: 'dark' });
  ok(r.code === 200 && r.j.mode === 'dark', 'mode saved as dark');
  ok(applied[applied.length - 1] === 'glass', 'forcing dark switches to the dark theme');

  // a bad mode is refused and changes nothing
  const before = applied.length;
  r = await call(f, '/api/suntheme', 'POST', { mode: 'nope' });
  ok(r.code === 400 && applied.length === before, 'an unknown mode is refused and nothing is applied');

  // choosing a different theme pair
  r = await call(f, '/api/suntheme', 'POST', { mode: 'light', lightId: 'my-light', darkId: 'my-dark' });
  ok(r.code === 200 && r.j.lightId === 'my-light' && r.j.darkId === 'my-dark', 'a custom theme pair is saved');
  ok(applied[applied.length - 1] === 'my-light', 'the new light id is applied right away');

  // a bad theme id is refused
  r = await call(f, '/api/suntheme', 'POST', { lightId: 'Not Valid!' });
  ok(r.code === 400, 'a theme id that is not lower-case letters, digits and - is refused');

  // turning it back off stops it applying anything, even though the ids are still set
  const afterLight = applied.length;
  r = await call(f, '/api/suntheme', 'POST', { mode: 'off' });
  ok(r.code === 200 && r.j.mode === 'off' && applied.length === afterLight, 'switching back to off applies nothing more');

  // wanted(): the pure decision for each mode, without touching the real clock
  ok(f.wanted({ mode: 'light', lightId: 'L', darkId: 'D' }) === 'L', 'wanted() in light mode is always the light id');
  ok(f.wanted({ mode: 'dark', lightId: 'L', darkId: 'D' }) === 'D', 'wanted() in dark mode is always the dark id');

  // when there is no theme module (not loaded), apply() does nothing and does not throw
  const ctx2 = { config: memoryConfig({}), feature: () => null };
  await suntheme.create(ctx2).apply();
  ok(true, 'apply() without a theme module does not throw');
});
