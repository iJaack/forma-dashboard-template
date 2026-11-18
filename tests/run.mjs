// Unit tests for Forma aggregation and formulas. Run: node tests/run.mjs  (box only; synthetic fixtures, no health data)
import fs from 'node:fs'; import vm from 'node:vm'; import assert from 'node:assert/strict';
const root = new URL('..', import.meta.url).pathname;
// server module: the worker source with build placeholders stubbed, functions exported
const src = fs.readFileSync(root + 'src/pages_worker.js', 'utf8').replace('__STATIC__', '{}').replace('__SEC__', '{}').replace(/export default \{[\s\S]*$/, '') + '\nexport { mealItems, mealNutrients, mealOut, conv, parseV1, parseV2, fixSleep, nightFromSegments, sanitizeEnergy, dedupeWorkouts, reqTz, dayIn, data, dataCached, dayData, api, signSession };\n';
const S = await import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'));
// client functions via the test hook
const C = {}; vm.runInNewContext(fs.readFileSync(root + 'src/app_real.js', 'utf8'), { __FORMA_TEST__: C, document: {}, location: { protocol: 'file:' }, Intl, Date, Math, console });
let pass = 0, fail = 0; const t = (name, fn) => { try { fn(); pass++; console.log('ok  ', name); } catch (e) { fail++; console.log('FAIL', name, '\n     ', e.message); } };
const near = (a, b, eps = 1e-6, m) => assert.ok(Math.abs(a - b) <= eps, `${m || ''} ${a} != ${b}`);

// ---- device timezone (synthetic dates and diary rows only) ----
const ta = async (name, fn) => { let err; try { await fn(); } catch (e) { err = e; } t(name, () => { if (err) throw err; }); };
const tzUrl = tz => new URL('https://example.com/api/data' + (tz == null ? '' : '?tz=' + encodeURIComponent(tz)));
const realDate = Date;
const fixedDate = iso => class extends realDate { constructor(...a) { super(...(a.length ? a : [iso])); } static now() { return realDate.parse(iso); } };
const clientAt = (iso, tz, broken = false) => {
  const F = {}, IntlDevice = { DateTimeFormat: function(locale, opts) {
    if (!locale) { if (broken) throw new Error('Intl unavailable'); return { resolvedOptions: () => ({ timeZone: tz }) }; }
    return new Intl.DateTimeFormat(locale, opts);
  } };
  vm.runInNewContext(fs.readFileSync(root + 'src/app_real.js', 'utf8'), { __FORMA_TEST__: F, document: {}, location: { protocol: 'file:' }, Intl: IntlDevice, Date: fixedDate(iso), Math, console }); return F;
};
t('tz: Cancun and Rome disagree before Cancun midnight, then agree', () => {
  for (const [iso, cancun] of [['2026-10-27T03:30:00Z', '2026-10-26'], ['2026-10-27T05:30:00Z', '2026-10-27']]) {
    const d = new Date(iso); assert.equal(S.dayIn('America/Cancun', d), cancun); assert.equal(S.dayIn('Europe/Rome', d), '2026-10-27');
    assert.equal(C.localDay('America/Cancun', d), cancun); assert.equal(C.localDay('Europe/Rome', d), '2026-10-27');
  }
});
t('tz: missing, empty, malformed, overlong and unknown zones fall back to UTC', () => {
  for (const tz of [undefined, '', 'garbage', '../..', 'A'.repeat(101), 'Mars/Phobos', ' America/Cancun', 'America/Cancun\n', '<script>', '+05:00']) assert.equal(S.reqTz(tzUrl(tz)), 'UTC', String(tz));
});
t('tz: nested names, plus/minus offsets, UTC and exotic IANA zones are accepted', () => {
  for (const tz of ['America/Cancun', 'Europe/Rome', 'America/Argentina/Buenos_Aires', 'Etc/GMT+5', 'Etc/GMT-14', 'Asia/Kathmandu', 'UTC']) assert.equal(S.reqTz(tzUrl(tz)), tz);
});
t('tz: client detects device zone, formats local time and sends local dates to both APIs', () => {
  const F = clientAt('2026-10-27T03:30:00Z', 'America/Cancun'); assert.equal(F.userTz(), 'America/Cancun'); assert.equal(F.localDay(), '2026-10-26'); assert.equal(F.localTime('2026-10-27T03:30:00Z'), '22:30');
  for (const path of ['/api/data', '/api/day']) { const u = new URL(F.dataUrl(path), 'https://example.com'); assert.equal(u.pathname, path); assert.equal(u.searchParams.get('tz'), 'America/Cancun'); assert.equal(u.searchParams.get('date'), '2026-10-26'); }
  assert.equal(new URL(F.dataUrl('/api/day', '2026-10-20'), 'https://example.com').searchParams.get('date'), '2026-10-20');
  for (const [tz, broken] of [[undefined, false], ['', false], ['America/Cancun', true]]) { const f = clientAt('2026-10-27T03:30:00Z', tz, broken); assert.equal(f.userTz(), 'UTC'); assert.equal(f.localDay(), '2026-10-27'); }
});
// D1 fixture: meals retain their stored local date, including an entry logged after Rome midnight.
const diary = [{ day: '2026-10-26', meal: 'pranzo', time: '13:00', example: true, source: 'test', title: 'Synthetic meal A', kcal: 100 }, { day: '2026-10-26', meal: 'cena', time: '22:00', example: true, source: 'test', title: 'Synthetic meal A', kcal: 200, logged_at: '2026-10-27T03:00:00Z' }];
function fixtureDB() {
  const kv = new Map(); let builds = 0;
  return { kv, get builds() { return builds; }, prepare(sql) { const st = { args: [], bind(...a) { st.args = a; return st; }, async first() {
    if (sql.includes(' cv')) return { v: 'fixture-v1', cv: kv.get('data_cache_ver') };
    return { v: kv.get('data_cache') };
  }, async all() { if (sql.includes('FROM samples')) builds++;
    return { results: sql.includes('FROM meals WHERE') ? diary.filter(m => sql.includes('day>=?') ? m.day >= st.args[0] : m.day === st.args[0]) : [] };
  } }; return Object.assign(st, { sql }); }, async batch(stmts) { for (const st of stmts) kv.set(st.sql.includes("VALUES('data_cache',") ? 'data_cache' : 'data_cache_ver', st.args[0]); } };
}
await ta('tz: authenticated /api/day defaults to viewer today; diary days stay intact', async () => {
  globalThis.Date = fixedDate('2026-10-27T03:30:00Z');
  try {
    const DB = fixtureDB(), env = { DB, SITE_PASSWORD: 'fixture', SESSION_KEY: 'k'.repeat(48) }, cookie = '__Host-forma=' + await S.signSession(env, Date.now() + 3600000);
    for (const [query, day, tz, count] of [['?tz=America/Cancun', '2026-10-26', 'America/Cancun', 2], ['?tz=Europe/Rome', '2026-10-27', 'Europe/Rome', 0], ['', '2026-10-27', 'UTC', 0], ['?tz=Mars/Phobos', '2026-10-27', 'UTC', 0], ['?tz=America/Cancun&date=2026-10-27', '2026-10-27', 'America/Cancun', 0]]) {
      const u = new URL('https://example.com/api/day' + query), r = await S.api(new Request(u, { headers: { cookie } }), env, u); assert.equal(r.status, 200);
      const d = await r.json(); assert.equal(d.date, day); assert.equal(d.day.day, day); assert.equal(d.tz, tz); assert.equal(d.today, tz === 'America/Cancun' ? '2026-10-26' : '2026-10-27'); assert.equal(d.meals.entries.length, count);
    }
    globalThis.Date = fixedDate('2026-10-27T05:30:00Z'); const d = await (await S.dayData(env, undefined, 'America/Cancun')).json(); assert.equal(d.today, '2026-10-27'); assert.equal(d.date, '2026-10-27'); assert.deepEqual(d.meals.entries, []);
    assert.equal((await S.dayData(env, 'garbage', 'America/Cancun')).status, 400);
  } finally { globalThis.Date = realDate; }
});
await ta('tz: shared /api/data cache stays neutral across zones and Cancun midnight', async () => {
  globalThis.Date = fixedDate('2026-10-27T03:30:00Z');
  try {
    const DB = fixtureDB(), env = { DB, SITE_PASSWORD: 'fixture', SESSION_KEY: 'k'.repeat(48) }, cookie = '__Host-forma=' + await S.signSession(env, Date.now() + 3600000);
    for (const [tz, today, cache] of [['America/Cancun', '2026-10-26', 'miss'], ['Europe/Rome', '2026-10-27', 'hit'], [undefined, '2026-10-27', 'hit'], ['Mars/Phobos', '2026-10-27', 'hit'], ['Etc/GMT+5', '2026-10-26', 'hit']]) {
      const u = tzUrl(tz), r = await S.api(new Request(u, { headers: { cookie } }), env, u), d = await r.json(); assert.equal(r.status, 200); assert.equal(r.headers.get('x-forma-cache'), cache); assert.equal(r.headers.get('cache-control'), 'no-store');
      assert.equal(d.today, today); assert.equal(d.tz, S.reqTz(u)); assert.equal(d.meals.entries.length, 2); assert.ok(d.meals.entries.every(m => m.day === '2026-10-26'));
    }
    const body = DB.kv.get('data_cache'); assert.equal(JSON.parse(body).tz, undefined); assert.equal(JSON.parse(body).today, undefined); assert.equal(DB.builds, 1);
    globalThis.Date = fixedDate('2026-10-27T05:30:00Z'); const r = await S.dataCached(env, 'America/Cancun'); assert.equal(r.headers.get('x-forma-cache'), 'hit'); assert.equal((await r.json()).today, '2026-10-27'); assert.equal(DB.kv.get('data_cache'), body); assert.equal(DB.builds, 1);
    globalThis.Date = fixedDate('2026-10-28T00:30:00Z'); const r2 = await S.dataCached(env, 'America/Cancun'); assert.equal(r2.headers.get('x-forma-cache'), 'miss'); assert.equal((await r2.json()).today, '2026-10-27'); assert.equal(DB.builds, 2);
  } finally { globalThis.Date = realDate; }
});
t('tz: concept model and navigation use device today for partial energy and diary selection', () => {
  for (const [iso, day] of [['2026-10-27T03:30:00Z', '2026-10-26'], ['2026-10-27T05:30:00Z', '2026-10-27']]) {
    const F = clientAt(iso, 'America/Cancun'), ctx = { window: { __FORMA_TEST__: F, addEventListener() {} }, matchMedia: () => ({ matches: false }), location: { search: '' }, document: { addEventListener() {}, getElementById: () => null, querySelectorAll: () => [] }, addEventListener() {}, setTimeout() {} };
    vm.runInNewContext(fs.readFileSync(root + 'src/concepts/cx.js', 'utf8'), ctx); const CX = ctx.window.CX;
    const D = { days: [{ day: '2026-10-26', active_kcal: 50, resting_kcal: 1200, burn_complete: 1 }], workouts: [], hk: {}, body: [], quality: {}, thirdparty: { recovery: [], cycles: [], sleep: [] }, meals: { entries: diary, days: [{ day: '2026-10-26', kcal: 300 }] } };
    const M = CX.model(D); assert.equal(M.today, day); assert.equal(M.rows.at(-1).day, day); assert.equal(M.by[day].full, false); assert.equal(M.by[day].burned, null);
    if (day === '2026-10-26') { assert.equal(M.by[day].partial, 1250); assert.equal(M.by[day].eaten - M.by[day].partial, -950); assert.equal(M.by[day].meals.length, 2); }
    else { assert.equal(M.by[day].eaten, null); assert.equal(M.by[day].meals.length, 0); assert.equal(M.by['2026-10-26'].full, true); }
    ctx.window.LG = {}; ctx.window.CA = {}; ctx.window.CB = {}; vm.runInNewContext(fs.readFileSync(root + 'src/concepts/ed2.js', 'utf8'), ctx); const E = ctx.window.E2;
    assert.equal(E.dayParam('', M.rows[0].day, M.today), day); assert.equal(E.dayParam('?date=2026-10-27', M.rows[0].day, M.today), day); assert.equal(E.strip(day, day, F.addDays).at(-1), day);
    const meals = E.mealsOn(diary, day, M.today); assert.equal(meals ? meals.rows.length : 0, day === '2026-10-26' ? 2 : 0);
    assert.match(fs.readFileSync(root + 'src/concepts/ed2.js', 'utf8'), /function c1\(\)[^\n]*ml=E2\.mealsOn\(M\.D\.meals&&M\.D\.meals\.entries,M\.today,M\.today\)/);
    const alerts = E.alerts({ today: day, recDay: '2026-10-25', mealsToday: true, ingestAt: '2026-10-27T03:30:00Z', now: Date.parse('2026-10-29T03:30:00Z') }); assert.match(alerts.at(-1)[2], /26\/10/); assert.equal(alerts.some(a => /third-party/.test(a[1])), false);
  }
});

t('tz: legacy diary renders all Monday entries and an empty Tuesday', () => {
  const F = {}, el = { innerHTML: '', classList: { add() {} } };
  const app = fs.readFileSync(root + 'src/app_real.js', 'utf8');
  vm.runInNewContext(app, { __FORMA_TEST__: F, document: { getElementById: () => el }, location: { protocol: 'file:' }, Intl, Date, Math, console });
  const D = { days: [], meals: { entries: diary, days: [] } };
  F.renderPasti(D, '2026-10-26'); assert.match(el.innerHTML, /Synthetic meal A/); assert.match(el.innerHTML, /Synthetic meal A/);
  F.renderPasti(D, '2026-10-27'); assert.match(el.innerHTML, /Oggi · Mar 27 ottobre/); assert.match(el.innerHTML, /Nessun pasto registrato/); assert.doesNotMatch(el.innerHTML, /Esempio · [AB]/);
});

// ---- units ----
t('kJ -> kcal', () => near(S.conv('active_kcal', 4184, 'kJ'), 1000));
t('m -> km, mi -> km', () => { near(S.conv('distance_km', 3210, 'm'), 3.21); near(S.conv('distance_km', 1, 'mi'), 1.609344); });
t('lb -> kg, s -> min', () => { near(S.conv('weight_kg', 100, 'lb'), 45.359237); near(S.conv('exercise_min', 120, 's'), 2); });
t('v2 canonical mapping: one row per day/metric, ts = day T00', () => {
  const p = S.parseV2({ quantities: [{ type: 'active_energy_burned', agg: 'sum', date: '2026-10-21', value: 720, unit: 'kcal' }, { type: 'basal_energy_burned', agg: 'sum', date: '2026-10-21', value: 1900 }, { type: 'oxygen_saturation', agg: 'avg', date: '2026-10-21', value: 97 }] }, 'fsync');
  assert.deepEqual(p.samples.map(s => [s[0], s[1], s[3], s[4]]), [['active_kcal', '2026-10-21T00:00:00', '2026-10-21', 720], ['resting_kcal', '2026-10-21T00:00:00', '2026-10-21', 1900]]);
  assert.equal(p.quantities.length, 3); });
t('v1 and v2 rows share the same key (no double count)', () => {
  const v1 = S.parseV1({ format: 'forma-sync/1', daily: [{ date: '2026-10-21', metrics: { active_kcal: 700 } }] }, 'fsync').samples[0];
  const v2 = S.parseV2({ quantities: [{ type: 'active_energy_burned', agg: 'sum', date: '2026-10-21', value: 720 }] }, 'fsync').samples[0];
  assert.deepEqual([v1[0], v1[1], v1[2]], [v2[0], v2[1], v2[2]]); });

// ---- sleep ----
const H = (h) => new Date(Date.UTC(2026, 9, 20, 22) + h * 3600e3).toISOString();
const ev = (day, value, a, b, src) => ({ day, value, start: H(a), end: H(b), src });
t('sleep: duplicated stages counted once, in_bed excluded from asleep', () => {
  const n = S.nightFromSegments([0, 1, 2].map(() => ({ a: 0, b: 8 * 36e5, p: 4 })).concat([{ a: 36e5, b: 2 * 36e5, p: 6 }, { a: -36e5, b: 9 * 36e5, p: 1 }]));
  assert.equal(n.sleep_asleep_min, 480); assert.equal(n.sleep_deep_min, 60); assert.equal(n.sleep_core_min, 420); assert.equal(n.sleep_inbed_min, 600); });
t('sleep: Apple Watch source preferred over third-party and third-party apps', () => {
  const days = [{ day: '2026-10-21', sleep_asleep_min: 2500 }];
  const info = S.fixSleep(days, [ev('2026-10-21', 'asleep_core', 0, 7, 'com.apple.health.ABC'), ev('2026-10-21', 'asleep_unspecified', 0, 9, 'com.example.thirdparty'), ev('2026-10-21', 'asleep_core', 0, 9, 'me.x'), ev('2026-10-21', 'asleep_core', 0, 9, 'me.x')], []);
  assert.equal(days[0].sleep_asleep_min, 420); assert.equal(days[0].sleep_src, 'apple'); assert.equal(info.rebuilt, 1); });
t('sleep: implausible phone-computed nights dropped', () => {
  const days = [{ day: '2026-01-01', sleep_asleep_min: 15000 }, { day: '2026-01-02', sleep_asleep_min: 420, sleep_core_min: 300, sleep_deep_min: 60, sleep_rem_min: 60 }, { day: '2026-01-03', sleep_asleep_min: 400, sleep_core_min: 900 }];
  S.fixSleep(days, [], []); assert.equal(days[0].sleep_asleep_min, undefined); assert.equal(days[1].sleep_asleep_min, 420); assert.equal(days[2].sleep_asleep_min, undefined); });
t('sleep: night crossing DST change (25 h day) measured in real minutes', () => {
  const a = Date.parse('2026-10-24T22:00:00Z'), b = Date.parse('2026-10-25T06:00:00Z'); // 00:00 CEST -> 07:00 CET = 8 h
  assert.equal(S.nightFromSegments([{ a, b, p: 4 }]).sleep_asleep_min, 480); });

// ---- energy ----
t('energy: only >6000 kcal active is dropped (4,500 after a long run is kept); complete burn needs resting >= 1200', () => {
  const d = [{ day: 'a', active_kcal: 900000, resting_kcal: 1900 }, { day: 'b', active_kcal: 700, resting_kcal: 1900 }, { day: 'c', active_kcal: 500, resting_kcal: 300 }, { day: 'd', active_kcal: 500 }, { day: 'e', active_kcal: 4500, resting_kcal: 2000 }, { day: 'f', active_kcal: 6001, resting_kcal: 2000 }];
  assert.equal(S.sanitizeEnergy(d), 2); assert.equal(d[4].active_kcal, 4500); assert.equal(d[4].burn_complete, 1); assert.equal(d[5].active_kcal, undefined); assert.equal(d[0].active_kcal, undefined); assert.equal(d[0].burn_complete, 0);
  assert.equal(d[1].burn_complete, 1); assert.equal(d[2].burn_complete, 0); assert.equal(d[3].burn_complete, 0);
  assert.equal(C.burnedOf(d[1]), 2600); assert.equal(C.burnedOf(d[2]), null); assert.equal(C.burnedPartial(d[2]), 800); });
t('balance = eaten - (active + resting), diary only', () => {
  const D = { days: [{ day: '2026-10-21', dietary_kcal: 999 }, { day: '2026-10-20', dietary_kcal: 1500 }], meals: { days: [{ day: '2026-10-21', kcal: 2600 }], entries: [] } };
  const E = C.eatenMap(D); assert.equal(E['2026-10-21'], 2600); assert.equal(E['2026-10-20'], undefined);
  assert.equal(E['2026-10-21'] - C.burnedOf({ burn_complete: 1, active_kcal: 700, resting_kcal: 1900 }), 0); });
// Synthetic macro scenarios only; no diary or device data is read.
const macroToday = '2026-01-10', macroPast = '2026-01-09';
// Extra test types are explicitly configured here; they are not shipped defaults.
const syntheticEstimates = {riposo:2000,allenamento:2100,test_type_a:2200,test_type_b:2400};
const macroClient = () => {const F=clientAt(macroToday + 'T12:00:00Z', 'UTC'); F.configure({config:{tz:'UTC',targets:{estimates:syntheticEstimates,protein:{base:100,threshold:2200,slope:0.1,cap:140},fat:{lo:0.25,hi:0.30},fiber:30}}});return F;};
const macroData = (day = macroToday, type = 'riposo') => ({ example: true, source: 'test', days: [], workouts: [], hk: {}, body: [], quality: {}, thirdparty: { recovery: [], cycles: [], sleep: [] }, meals: { entries: [], days: [{ day, day_type: type }], targets: { riposo: 2000, allenamento: 2100, test_type_a: 2200, test_type_b: 2400, protein: [100, 140] } } });
const macroApple = kcal => {
  const D = macroData(macroPast); D.days = [{ day: macroPast, active_kcal: kcal - 1500, resting_kcal: 1500, burn_complete: 1 }]; return D;
};
t('macro: all four synthetic configured day-type estimates apply today and past without complete energy', () => {
  const F = macroClient();
  for (const day of [macroToday, macroPast]) for (const [type, kcal] of Object.entries(syntheticEstimates)) {
    const D = macroData(day, type); D.days = [{ day, active_kcal: 100, resting_kcal: 500 }];
    for (const days of [D.days, []]) {
      D.days = days; const tg = F.targetFor(D, day);
      assert.equal(tg.type, type); assert.equal(tg.lo, kcal); assert.equal(tg.hi, kcal); assert.equal(tg.estimated, true); assert.equal(tg.source, 'estimate'); assert.equal(tg.kcal.value, kcal);
    }
  }
});
t('macro: stored day-type overrides and legacy ranges supply the estimated kcal', () => {
  const F = macroClient();
  for (const day of [macroToday, macroPast]) for (const [stored, kcal] of [[2190, 2190], [[2190], 2190], [[2190, 2190], 2190], [[2180, 2201], 2191]]) {
    const D = macroData(day, 'allenamento'); D.meals.targets.allenamento = stored;
    const tg = F.targetFor(D, day);
    assert.equal(tg.lo, kcal); assert.equal(tg.hi, kcal); assert.equal(tg.kcal.value, kcal); assert.equal(tg.estimated, true);
  }
  const D = macroData(macroToday, 'allenamento'); D.meals.targets.allenamento = [2200, 2201];
  const tg = F.targetFor(D, macroToday);
  assert.equal(tg.lo, 2201); assert.equal(tg.protein.value, 100.1); // Round range midpoint before deriving macros.
});
t('macro: absent targets and missing or malformed day-type entries use config fallbacks', () => {
  const F = macroClient(), invalid = [undefined, null, false, '2190', 0, -1, NaN, Infinity, {}, [], [2190, '2200'], ['2190'], [NaN], [Infinity], [0], [-1], [2190, null], [2190, undefined], [2190, NaN], [2190, Infinity], [2190, 0], [null, 2190], [true]];
  for (const day of [macroToday, macroPast]) for (const [type, kcal] of Object.entries(syntheticEstimates)) {
    for (const targets of [undefined, null, {}, ...invalid.map(value => ({ [type]: value }))]) {
      const D = macroData(day, type); D.meals.targets = targets;
      const tg = F.targetFor(D, day);
      assert.equal(tg.lo, kcal); assert.equal(tg.estimated, true);
    }
  }
});
t('macro: stored protein base and cap feed the formula for estimated and real targets', () => {
  const F = macroClient();
  for (const [bounds, expected] of [[[140, 160], [140, 140, 150, 150.1, 160]], [[130, 175], [130, 130, 140, 140.1, 175]], [[150, 150], [150, 150, 150, 150, 150]]]) {
    for (const [i, kcal] of [2000, 2200, 2300, 2301, 3000].entries()) {
      for (const D of [macroApple(kcal), macroData(macroToday, 'allenamento')]) {
        D.meals.targets.protein = bounds; D.meals.targets.allenamento = kcal;
        const tg = F.targetFor(D, D.meals.days[0].day);
        assert.equal(tg.protein.value, expected[i]);
        assert.equal(tg.carbs.lo, +((kcal * 0.70 - 4 * expected[i]) / 4).toFixed(1));
      }
    }
  }
});
t('macro: lone protein numbers, one-element arrays and base objects use the fallback cap', () => {
  const F = macroClient();
  for (const protein of [130, [130], { base: 130 }]) for (const [kcal, expected] of [[2000, 130], [2300, 140], [3000, 140]]) {
    const D = macroApple(kcal); D.meals.targets.protein = protein;
    assert.equal(F.targetFor(D, macroPast).protein.value, expected);
  }
});
t('macro: missing or unusable protein bounds fall back to config base and cap', () => {
  const F = macroClient(), invalid = [undefined, null, false, '130', NaN, Infinity, {}, [], ['130', 175], [130, '175'], [130, null], [130, undefined], [130, NaN], [130, Infinity], [NaN, 175], [Infinity, 175], [175, 130], [175], { base: '130' }];
  for (const protein of invalid) for (const [kcal, expected] of [[2000, 100], [2300, 110], [3000, 140]]) {
    const D = macroApple(kcal); D.meals.targets.protein = protein;
    assert.equal(F.targetFor(D, macroPast).protein.value, expected);
  }
  for (const targets of [undefined, null, {}]) for (const [kcal, expected] of [[2000, 100], [2300, 110], [3000, 140]]) {
    const D = macroApple(kcal); D.meals.targets = targets;
    assert.equal(F.targetFor(D, macroPast).protein.value, expected);
  }
});
t('macro: protein floor, decimal slope and cap', () => {
  const F = macroClient();
  for (const [kcal, protein] of [[2000, 100], [2200, 100], [2300, 110], [2301, 110.1], [2600, 140]]) assert.equal(F.targetFor(macroApple(kcal), macroPast).protein.value, protein);
});
t('macro: fat is 25–30% / 9; low carbs pairs with high fat and uses capped protein', () => {
  const tg = macroClient().targetFor(macroApple(2600), macroPast);
  assert.equal(tg.fat.lo, 72.2); assert.equal(tg.fat.hi, 86.7); assert.equal(tg.carbs.lo, 315); assert.equal(tg.carbs.hi, 347.5);
  assert.ok(tg.carbs.lo < tg.carbs.hi);
});
t('macro: rounding happens at the end, carbs use unrounded fat extremes', () => {
  const F = macroClient(), tg = F.targetFor(macroData(macroToday, 'test_type_b'), macroToday);
  assert.equal(tg.fat.lo, 66.7); assert.equal(tg.fat.hi, 80); assert.equal(tg.carbs.lo, 300); assert.equal(tg.carbs.hi, 330);
  const fractional = F.targetFor(macroApple(2301.4), macroPast);
  assert.equal(fractional.lo, 2301); assert.equal(fractional.protein.value, 110.1); assert.equal(fractional.fat.lo, 63.9); assert.equal(fractional.carbs.hi, 321.4);
});
t('macro: past complete Apple replaces the estimate, keeps Apple over third-party and needs no day type', () => {
  const F = macroClient(), D = macroApple(2300);
  D.meals.targets.riposo = 2190;
  assert.equal(F.targetFor({ ...D, days: [] }, macroPast).lo, 2190);
  D.thirdparty.cycles = [{ day: macroPast, kj: 3000 * 4.184, avg_hr: 60 }];
  for (const type of ['riposo', null]) {
    D.meals.days[0].day_type = type; const tg = F.targetFor(D, macroPast);
    assert.equal(tg.lo, 2300); assert.equal(tg.hi, 2300); assert.equal(tg.type, type); assert.equal(tg.estimated, false); assert.equal(tg.source, 'apple');
  }
});
t('macro: missing, dropped and incomplete Apple use the day-type estimate regardless of third-party', () => {
  const F = macroClient(), D = macroData(macroPast);
  D.meals.targets.riposo = 2100;
  D.thirdparty.cycles = [{ day: macroPast, kj: 3000 * 4.184, avg_hr: 60 }];
  for (const days of [[], [{ day: macroPast, active_kcal: 100, resting_kcal: 500 }], [{ day: macroPast, active_kcal_dropped: 9000, resting_kcal: 1500 }]]) {
    D.days = days; const tg = F.targetFor(D, macroPast);
    assert.equal(tg.lo, 2100); assert.equal(tg.source, 'estimate'); assert.equal(tg.estimated, true);
    assert.equal(F.expenditureFor(D, macroPast).burned, null);
  }
});
t('macro: today always estimates despite partial or flagged complete Apple and a higher third-party figure', () => {
  const F = macroClient(), D = macroData();
  D.meals.targets.riposo = 2190;
  D.thirdparty.cycles = [{ day: macroToday, kj: 3000 * 4.184, avg_hr: 60 }];
  for (const complete of [0, 1]) {
    D.days = [{ day: macroToday, active_kcal: 500, resting_kcal: 1500, burn_complete: complete }];
    const tg = F.targetFor(D, macroToday), e = F.expenditureFor(D, macroToday);
    assert.equal(tg.lo, 2190); assert.equal(tg.estimated, true); assert.equal(e.burned, null); near(e.partial, 2000);
  }
});
t('macro: two past days use their own complete expenditure, including in CX.model', () => {
  const F = macroClient(), D = macroApple(2300), other = '2026-01-08';
  D.days.push({ day: other, active_kcal: 1100, resting_kcal: 1500, burn_complete: 1 });
  D.meals.days.push({ day: other, day_type: 'riposo' });
  assert.equal(F.targetFor(D, macroPast).lo, 2300); assert.equal(F.targetFor(D, other).lo, 2600);
  const ctx = { window: { __FORMA_TEST__: F, addEventListener() {} }, matchMedia: () => ({ matches: false }), location: { search: '' }, document: { addEventListener() {} } };
  vm.runInNewContext(fs.readFileSync(root + 'src/concepts/cx.js', 'utf8'), ctx);
  const M = ctx.window.CX.model(D); assert.equal(M.by[macroPast].target.lo, M.by[macroPast].burned); assert.equal(M.by[other].target.lo, M.by[other].burned);
});
t('macro: no day type or an unknown day type with incomplete energy means no calorie-derived targets', () => {
  const F = macroClient();
  for (const day of [macroToday, macroPast]) for (const type of [null, 'unknown', 'toString']) {
    const D = macroData(day, type); D.workouts = [{ day, type: 'test_type_a' }];
    assert.equal(F.targetFor(D, day), null); D.meals.days = []; assert.equal(F.targetFor(D, day), null);
  }
});
t('macro: fibre stays at 30 regardless of calorie target or day type availability', () => {
  const F = macroClient(); assert.equal(F.MACRO_TARGETS.fiber, 30);
  for (const D of [macroData(), macroApple(2300), macroApple(2600)]) assert.equal(F.targetFor(D, D.meals.days[0].day).fiber.value, 30);
});

// ---- workouts ----
t('workouts: Apple duplicates merge; third-party API copies are excluded', () => {
  const w = (id, source, st, min, hr, km) => ({ id, source, day: '2026-10-01', start: st, end: new Date(Date.parse(st) + min * 6e4).toISOString(), duration_s: min * 60, avg_hr: hr, distance_km: km, kcal: 18, strain: source === 'thirdparty' ? 5.1 : null });
  const out = S.dedupeWorkouts([w('a', 'fsync', '2026-10-01T13:25:00Z', 14, 95), w('b', 'fsync', '2026-10-01T13:25:00Z', 14, 95), w('c', 'thirdparty', '2026-10-01T13:25:10Z', 14, 92), w('d', 'fsync', '2026-10-01T14:47:00Z', 20, 99)]);
  assert.equal(out.length, 2); const t1 = out.find(x => x.id === 'a' || x.id === 'b'); assert.equal(t1.merged, 2); assert.equal(t1.strain, undefined); });
t('workouts: back-to-back sessions are not merged', () => {
  const out = S.dedupeWorkouts([{ id: 1, source: 'fsync', start: '2026-10-01T10:00:00Z', end: '2026-10-01T11:00:00Z', duration_s: 3600 }, { id: 2, source: 'fsync', start: '2026-10-01T10:50:00Z', end: '2026-10-01T11:50:00Z', duration_s: 3600 }]);
  assert.equal(out.length, 2); });

// ---- training load ----
t('TRIMP Banister: 60 min at reserve fraction 0.5', () => near(C.trimp(60, 130, 60, 200), 60 * 0.5 * 0.64 * Math.exp(0.96), 1e-9));
t('TRIMP needs HR and HRmax (no defaults)', () => { assert.equal(C.trimp(60, null, 60, 190), null); assert.equal(C.trimp(60, 130, 60, null), null); });
t('CTL/ATL EWMA and TSB', () => {
  const days = C.dayRange('2026-01-01', '2026-01-10'), s = C.ewma({ '2026-01-01': 100 }, days);
  near(s[0].ctl, 100 / 42); near(s[0].atl, 100 / 7); near(s[1].atl, (100 / 7) * (6 / 7)); near(s[9].ctl - s[9].atl, (100 / 42) * Math.pow(41 / 42, 9) - (100 / 7) * Math.pow(6 / 7, 9)); });
t('HRmax comes only from recorded Apple workouts', () => {
  assert.equal(C.hrmaxOf({quality:{}}),null);
  assert.equal(C.hrmaxOf({quality:{hrmax_measured:{value:200}}}).value,200);
  assert.equal(C.hrmaxOf({quality:{hrmax_measured:{value:500}}}),null);
});

// ---- days, DST, averages ----
t('addDays across DST (2026-03-29, 2026-10-25)', () => { assert.equal(C.addDays('2026-03-28', 1), '2026-03-29'); assert.equal(C.addDays('2026-03-29', 1), '2026-03-30'); assert.equal(C.addDays('2026-10-25', 1), '2026-10-26'); assert.equal(C.dayRange('2026-10-24', '2026-10-27').length, 4); });
t('weekly = mean of daily values per ISO week', () => { const w = C.weekly([['2026-10-19', 1000], ['2026-10-20', 3000], ['2026-10-26', 500]]); assert.deepEqual(JSON.parse(JSON.stringify(w)), [['2026-10-22', 2000], ['2026-10-29', 500]]); });
t('period stats: today excluded from burned/eaten/balance; sleep prefers Apple', () => {
  const D = { days: [{ day: 'd1', burn_complete: 1, active_kcal: 500, resting_kcal: 1900, steps: 8000, sleep_asleep_min: 420, resting_hr: 60 }, { day: 'd2', burn_complete: 1, active_kcal: 100, resting_kcal: 1300, steps: 1000 }], thirdparty: { recovery: [], sleep: [{ day: 'd1', light_ms: 6e6 }] }, hk: {} };
  const s = C.periodStats(D, ['d1', 'd2'], { d1: 2000, d2: 500 }, {}, 'd2');
  assert.equal(s.b, 2400); assert.equal(s.e, 2000); assert.equal(s.bal, -400); assert.equal(s.steps, 8000); assert.equal(s.sl, 420); assert.equal(s.rhr, 60); });
t('mm:ss never shows :60', () => { assert.equal(C.mmss(59.6), '1:00'); assert.equal(C.mmss(1822), '30:22'); });
t('charts: values stay inside the viewBox', () => {
  const svg = C.tchart([{ pts: [['2026-01-01', 5], ['2026-01-05', 500]], color: 'x' }], { from: '2026-01-01', to: '2026-01-05', H: 100 });
  const ys = [...svg.matchAll(/[ML](\d+\.?\d*),(-?\d+\.?\d*)/g)].map(m => +m[2]); assert.ok(ys.every(y => y >= 0 && y <= 100), ys.join()); });
t('sleep: third-party-in-Health-only nights have no data, including noop and duplicate writers', () => {
  const days = [{ day: '2026-10-12', sleep_asleep_min: 1900 }];
  S.fixSleep(days, [ev('2026-10-12', 'asleep_core', 0, 8, 'com.example.noop'), ev('2026-10-12', 'asleep_core', 0, 8, 'com.example.noop'), ev('2026-10-12', 'asleep_deep', 1, 2, 'com.example.noop'), ev('2026-10-12', 'asleep_unspecified', 0.5, 8.5, 'com.example.thirdparty'), ev('2026-10-12', 'in_bed', -2, 10, 'com.example.noop')], []);
  assert.equal(days[0].sleep_src, undefined); assert.equal(days[0].sleep_asleep_min, undefined); assert.equal(days[0].sleep_deep_min, undefined); assert.equal(days[0].sleep_dropped, 'untrusted_source'); });
t('sleep: Apple beats noop/third-party on the same night', () => {
  const days = [{ day: '2026-10-14' }];
  S.fixSleep(days, [ev('2026-10-14', 'asleep_core', 0, 7, 'com.apple.health.A'), ev('2026-10-14', 'asleep_core', 0, 9, 'com.example.noop')], []);
  assert.equal(days[0].sleep_src, 'apple'); assert.equal(days[0].sleep_asleep_min, 420); });
t('sleep: other third-party apps are still ignored', () => {
  const days = [{ day: '2026-10-12', sleep_asleep_min: 900 }];
  const info = S.fixSleep(days, [ev('2026-10-12', 'asleep_core', 0, 9, 'com.example.sleep')], []);
  assert.equal(days[0].sleep_asleep_min, undefined); assert.equal(info.untrusted, 1); });
t('layout: masonry leaves no hole and equal column bottoms', () => {
  let ok = 0; const hs = [[100, 80], [300, 200], [150, 120], [220, 160], [90, 70]], g = 24;
  for (const spans of [[1, 1, 1, 1, 1], [1, 2, 1, 1, 1], [2, 1, 1, 2, 1]]) { const r = C.skyline(hs, spans, [0, 1, 2, 3, 4], 3, g); if (!r) { assert.notDeepEqual(spans, [1, 1, 1, 1, 1]); continue; } ok++;
    for (let c = 0; c < 3; c++) { const col = r.pl.filter(p => p.j <= c && p.j + p.s > c).sort((a, b) => a.y - b.y);
      assert.equal(col[0].y, 0); for (let i = 1; i < col.length; i++) assert.equal(col[i].y, col[i - 1].y + col[i - 1].h + g, 'gap ' + spans);
      assert.equal(col[col.length - 1].y + col[col.length - 1].h, r.top - g); } } assert.ok(ok >= 2, 'layouts ' + ok); });
t('energy: active below workout kcal marks the day incomplete', () => {
  const src2 = fs.readFileSync(root + 'src/pages_worker.js', 'utf8'); const m = src2.match(/function checkActiveVsWorkouts[\s\S]*?\n}\n/)[0];
  const f = new Function(m + 'return checkActiveVsWorkouts;')();
  const d = [{ day: 'a', active_kcal: 23, resting_kcal: 1900, burn_complete: 1 }, { day: 'b', active_kcal: 900, burn_complete: 1 }];
  assert.equal(f(d, [{ day: 'a', kcal: 1073 }, { day: 'b', kcal: 500 }]), 1); assert.equal(d[0].burn_complete, 0); assert.equal(d[1].burn_complete, 1); });

// ---- concept Mix (A widgets under B hero): exact tiling, page wiring ----
const LGctx = { window: {}, document: { querySelector: () => null, documentElement: { dataset: {}, classList: { add() {} } } }, addEventListener() {}, matchMedia: () => ({ matches: false }), CSS: { supports: () => false }, innerWidth: 1440, innerHeight: 900, location: { search: '' }, navigator: { userAgent: '' }, requestAnimationFrame() {}, setTimeout() {}, performance: { now: () => 0 }, Math, console };
LGctx.window.CX = { F: { esc: x => x }, it: (v, d) => Number(v).toFixed(d || 0), NA: 'nessun dato', hmin: m => C.hm(m * 60000), reduced: () => true }; LGctx.CX = LGctx.window.CX;
vm.runInNewContext(fs.readFileSync(root + 'src/concepts/lg.js', 'utf8'), LGctx); const LG = LGctx.window.LG;
t('neutral day types display rest and training labels', () => {
  assert.deepEqual(Object.keys(LG.TYPES).sort(), ['allenamento','riposo']);
  for (const [type,label,state] of [['riposo','Riposo','rest'],['allenamento','Allenamento','todo']]) {
    const M={today:'2040-01-01',by:{'2040-01-01':{wo:[]}},D:{meals:{days:[{day:'2040-01-01',day_type:type}]}}};
    assert.equal(LG.plan(M).label,label); assert.equal(LG.plan(M).state,state);
  }
});
t('custom day types keep their raw labels, including object property names',()=>{
  for(const type of ['test_type_a','test_type_b','cycling','constructor','tostring']){const M={today:'2040-01-01',by:{'2040-01-01':{wo:[]}},D:{meals:{days:[{day:'2040-01-01',day_type:type}]}}};assert.equal(LG.plan(M).label,type);}
});
t('macro display: calorie objectives label estimates throughout headlines and meal totals, never real expenditure', () => {
  const F = macroClient();
  for (const D of [macroData(), macroApple(2300)]) {
    const day = D.meals.days[0].day, tg = F.targetFor(D, day), estimated = tg.estimated;
    const label = LG.rng(tg), copy = LG.say.today({ T: { target: tg, eaten: 1000, partial: 500 } }).s;
    assert.equal(label.includes('stima'), estimated); assert.equal(copy.includes('stima'), estimated);
    const src = fs.readFileSync(root + 'src/concepts/ed2.js', 'utf8'), ctx = { LG, it: F.it, esc: F.esc, NA: '—' };
    vm.runInNewContext(src.slice(src.indexOf('function mealsList('), src.indexOf('\nfunction ', src.indexOf('function mealsList(') + 1)), ctx);
    const row = { example: true, source: 'test', day, title: 'Synthetic meal A', kcal: 1000 };
    assert.equal(ctx.mealsList({ rows: [row], kcal: 1000 }, tg, '').includes('stima'), estimated);
  }
});
t('macro display: both UIs show fibre consumption only with data, keep its target without calorie targets', () => {
  const F = macroClient(), src = fs.readFileSync(root + 'src/concepts/ed2.js', 'utf8');
  const ctx = { window: { addEventListener() {} }, F, LG, it: F.it, esc: F.esc, NA: '—', VD: null, E2: { pc: p => String(Math.round(p)) + '%' }, grp: (title, html) => html };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(root + 'build/concept/nut_ref.js', 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(root + 'src/concepts/nut.js', 'utf8'), ctx);
  vm.runInContext(src.slice(src.indexOf('var MIC='), src.indexOf('// ---------------- day navigation')), ctx);
  const legacy = { innerHTML: '', classList: { add() {} } }, legacyF = {};
  vm.runInNewContext(fs.readFileSync(root + 'src/app_real.js', 'utf8'), { window: ctx.window, __FORMA_TEST__: legacyF, document: { getElementById: () => legacy }, location: { protocol: 'file:' }, Intl, Date, Math });
  for (const [extra, expected] of [[{ nutrients: { fiber: 10 } }, 10], [{}, null], [{ nutrients: { fiber: 0 } }, 0], [{ items: [{ f: 'banana', g: 100 }] }, 'food'], [{ kcal: null }, null]]) {
    const D = macroData(), row = { example: true, source: 'test', day: macroToday, meal: 'pranzo', title: 'Synthetic meal A', kcal: 1000, protein: 50, fat: 20, carbs: 100, ...extra };
    D.meals.entries = [row]; ctx.M = { D, today: macroToday };
    const html = ctx.nutri({ day: macroToday, isToday: true }), cell = html.match(/<li data-macro="fiber"[^>]*>([\s\S]*?)<\/li>/)[1];
    assert.match(cell.replace(/<[^>]*>/g, ''), /obiettivo 30 g/); assert.doesNotMatch(cell, /25 g|EFSA/);
    legacyF.renderPasti(D, macroToday); const tile = legacy.innerHTML.slice(legacy.innerHTML.indexOf('<div class="k">Fibre</div>'));
    assert.match(tile, /obiettivo 30 g/);
    if (expected == null) { assert.match(cell, /class="na">—/); assert.match(cell, /nessun dato/); assert.match(tile, /—<small>g<\/small>/); }
    else {
      const consumed = expected === 'food' ? ctx.window.NUT.day([row], macroToday).tot.fiber : expected;
      assert.ok(consumed != null); assert.doesNotMatch(cell, /class="na"|nessun dato/);
      assert.match(tile, new RegExp(F.it(consumed, 1).replace('.', '\\.') + '<small>g</small>'));
    }
    for (const key of ['protein', 'carbs', 'fat']) assert.match(html, new RegExp('data-macro="' + key + '"[\\s\\S]*?' + (key === 'protein' ? 'obiettivo' : 'range')));
    assert.match(legacy.innerHTML, /stima · giorno riposo/);
  }
  for (const entries of [[], [{ example: true, source: 'test', day: macroToday, meal: 'pranzo', title: 'Synthetic meal A', kcal: 1000 }]]) {
    const D = macroData(macroToday, null); D.meals.entries = entries; ctx.M = { D, today: macroToday };
    const html = ctx.nutri(entries.length ? { day: macroToday, isToday: true } : null);
    assert.match(html.replace(/<[^>]*>/g, ''), /nessun dato[\s\S]*?obiettivo 30 g/); assert.match(html.replace(/<[^>]*>/g, ''), /obiettivo —/);
    legacyF.renderPasti(D, macroToday); assert.match(legacy.innerHTML, /obiettivo 30 g · nessun dato/); assert.doesNotMatch(legacy.innerHTML, /NaN|undefined|null/);
  }
  const D = macroApple(2300); D.thirdparty.cycles = [{ day: macroPast, kj: 3000 * 4.184, avg_hr: 60 }];
  D.meals.entries = [{ example: true, source: 'test', day: macroPast, title: 'Synthetic meal A', kcal: 1000 }]; ctx.M = { D, today: macroToday };
  assert.match(ctx.nutri({ day: macroPast }).replace(/<[^>]*>/g, ''), /obiettivo 110 g/);
  assert.equal(LG.rng(F.targetFor(D, macroPast)).includes('stima'), false);
  D.days = []; assert.equal(LG.rng(F.targetFor(D, macroPast)).includes('stima'), true);
  const built = fs.readFileSync(root + 'build/index.html', 'utf8');
  for(const file of ['nut_ref','nut']) assert.ok(built.includes('/concept/'+file+'.js'));
});

await ta('concept: missing data renders a flat card without decorative chrome', async () => {
  for (const data of [null, {}]) {
    let html = '', rendered = false;
    const ctx = { ...LGctx, window: { CX: { ...LGctx.CX, F: { ...LGctx.CX.F, dataUrl: () => '/api/data' } } },
      document: { ...LGctx.document, getElementById: id => { assert.equal(id, 'app'); return { insertAdjacentHTML: (where, text) => { assert.equal(where, 'beforeend'); html += text; } }; } },
      fetch: async () => ({ ok: true, json: async () => data }) };
    vm.runInNewContext(fs.readFileSync(root + 'src/concepts/lg.js', 'utf8'), ctx);
    ctx.window.LG.boot(() => { rendered = true; });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(rendered, false);
    assert.match(html, /<div class="card"[^>]*><b>Nessun dato<\/b>/);
    assert.doesNotMatch(html, /glass|lg-bg|<i>/);
  }
});
t('mix-v1: widget groups tile with no holes at 2-10 columns', () => {
  const G = [[['allen', [2, 2], [1, 2], 2], ['passi', [1, 1], [1, 2], 1], ['ieri', [1, 1], [1, 2], 1]], [['sonno', [2, 2], [1, 2], 2], ['recupero', [1, 1], [1, 2], 1], ['hrv', [1, 1], [1, 2], 1], ['rhr', [1, 1], [1, 2], 1]], [['peso', [2, 1], [1, 2], 2], ['bilancio', [2, 1], [1, 2], 1], ['costanza', [2, 1], [1, 2], 1], ['forma', [1, 1], [1, 1], 1]]];
  for (const C of [2, 4, 6, 8, 10]) for (const g of G) { const sc = C / 4; const items = g.map(([k, p, h, mw]) => ({ k, v: LG.variants(Math.max(mw, Math.round(p[0] * sc)), p[1], C, h[0], h[1], mw) }));
    const r = LG.pack(items, C, C <= 2 ? g.length : 2), occ = new Array(r.R * C).fill(0);
    r.pos.forEach(([y, x, w, h]) => { for (let a = y; a < y + h; a++) for (let b = x; b < x + w; b++) { assert.ok(b < C, 'overflow'); occ[a * C + b]++; } });
    assert.ok(occ.every(v => v === 1), `C=${C} ${g.map(x => x[0])} ${occ.join('')}`); } });
t('mix: signed values never print "-0,0"', () => { assert.equal(LG.sgn(-0.03, 1), '0.0'); assert.equal(LG.sgn(1.26, 1), '+1.3'); assert.equal(LG.sgn(-2, 0), '-2'); });
t('publish: only the main page and required assets are built', () => {
  const html=fs.readFileSync(root+'build/index.html','utf8');
  assert.match(html,/data-v="rivista"/);
  for(const file of ['style.css','concept/lg.css','concept/a.css','concept/ed2.css','theme.js','concept/hook.js','app_real.js','concept/cx.js','concept/lg.js','concept/a.js','concept/b.js','concept/nut_ref.js','concept/nut.js','concept/ed2.js']) assert.ok(html.includes('/'+file),file);
  const order=[...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(m=>m[1]);
  assert.ok(order.indexOf('/app_real.js')<order.indexOf('/concept/cx.js'));
  for(const name of ['legacy','concept/a','concept/b','concept/mix','concept/mix-v1','concept/indice','concept/scelta']) assert.equal(fs.existsSync(root+'build/'+name),false,name);
  assert.match(fs.readFileSync(root+'src/concepts/lg.js','utf8'),/fetch\(F\.dataUrl\(\)/);
});

// ---- 30-day projection (weight / fat / lean) ----
const dayN = (i) => new Date(Date.UTC(2026, 8, 1) + i * 864e5).toISOString().slice(0, 10);
t('projection: daily mean merges sources, one value per day', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(LG.dailyMean([[['2026-10-01', 80], ['2026-10-02', 81]], [['2026-10-01', 82], ['2026-10-03', null]]]))), [['2026-10-01', 81], ['2026-10-02', 81]]); });
t('projection: 7-day trailing mean skips empty days and needs >= 3 points', () => {
  const pts = [[dayN(0), 80], [dayN(2), 82], [dayN(4), 84], [dayN(10), 90], [dayN(11), 91], [dayN(12), 92]];
  const r = LG.roll(pts, 7, 3); assert.deepEqual(JSON.parse(JSON.stringify(r.map(x => [x[0], x[1], x[2]]))), [[dayN(4), 82, 3], [dayN(12), 91, 3]]); });
t('projection: OLS slope/intercept exact on a line, null when x is constant', () => {
  const f = LG.ols([0, 1, 2, 3, 4], [10, 8, 6, 4, 2]); near(f.slope, -2); near(f.icpt, 10); assert.equal(LG.ols([1, 1, 1], [1, 2, 3]), null); assert.equal(LG.ols([1], [1]), null); });
t('projection: linear daily loss of 0.05 kg/day -> -1.5 kg in 30 days', () => {
  const pts = []; for (let i = 0; i < 60; i++) pts.push([dayN(i), 85 - 0.05 * i]);
  const r = LG.project(pts, dayN(59), { window: 90 }); assert.ok(r.ok); near(r.slope, -0.05, 0.002, 'slope'); near(r.d30, -1.5, 0.05, 'd30'); /* partial windows at the start lag less: small bias by design */ assert.equal(r.n, 60); assert.equal(r.from, dayN(0)); });
t('projection: < 2 measurements in the last 30 days never projects', () => {
  const r0 = LG.project([[dayN(0), 80], [dayN(10), 79.5], [dayN(20), 79]], dayN(60), { window: 90 }); assert.equal(r0.ok, false); assert.equal(r0.n30, 0); assert.match(r0.why, /nessuna misura/);
  const r1 = LG.project([[dayN(0), 80], [dayN(10), 79.5], [dayN(50), 79]], dayN(60), { window: 90 }); assert.equal(r1.ok, false); assert.equal(r1.n30, 1); assert.match(r1.why, /solo 1 misura/);
  assert.equal(LG.project([], dayN(5)).ok, false); });
t('projection: >= 2 in 30 days but sparse -> shown, flagged low confidence (warning path)', () => {
  const pts = [[dayN(0), 81], [dayN(9), 80.6], [dayN(23), 80.4], [dayN(30), 80.1]]; const r = LG.project(pts, dayN(35), { window: 90 });
  assert.ok(r.ok); assert.equal(r.low, true); assert.equal(r.n, 4); assert.equal(r.n30, 3); assert.match(r.lowWhy, /meno di 8/); assert.ok(r.slope < 0); near(r.d30, r.slope * 30, 1e-12);
  const two = LG.project([[dayN(40), 80], [dayN(50), 79.5]], dayN(55), { window: 90 }); assert.ok(two.ok); assert.equal(two.low, true); near(two.slope, -0.05, 1e-9, 'two-point slope');
  const weekly = []; for (let i = 0; i < 12; i++) weekly.push([dayN(i * 7), 80 - i * 0.1]); const w = LG.project(weekly, dayN(77), { window: 90 });
  assert.ok(w.ok); assert.equal(w.low, true); assert.match(w.lowWhy, /3 misure in 7 giorni/); near(w.slope, -0.1 / 7, 1e-9, 'weekly slope'); });
t('projection: dense data meets the strict rule -> not low confidence', () => {
  const pts = []; for (let i = 0; i < 30; i++) pts.push([dayN(i), 80 - 0.02 * i]); const r = LG.project(pts, dayN(29), { window: 90 }); assert.ok(r.ok); assert.equal(r.low, false); assert.equal(r.lowWhy, undefined);
  const short = []; for (let i = 0; i < 10; i++) short.push([dayN(i), 80 - 0.1 * i]); const s = LG.project(short, dayN(9)); assert.ok(s.ok); assert.equal(s.low, true); assert.match(s.lowWhy, /14 giorni/); });
t('projection: wording flips with sign and is stable under 0.1 kg', () => {
  assert.equal(LG.verb(-0.6), 'diminuirà di'); assert.equal(LG.verb(0.4), 'aumenterà di'); assert.equal(LG.verb(0.05), 'resterà stabile'); assert.equal(LG.verb(-0.099), 'resterà stabile');
  const ok = (d) => ({ ok: true, d30: d });
  assert.equal(LG.projSentence([{ art: 'il tuo peso', name: 'il peso', r: ok(-1.24) }, { art: 'la massa grassa', name: 'la massa grassa', r: ok(-0.9) }, { art: 'la massa magra', name: 'la massa magra', r: ok(0.3) }]),
    'Se continui così, entro i prossimi 30 giorni il tuo peso diminuirà di 1.2 kg, la massa grassa diminuirà di 0.9 kg, la massa magra aumenterà di 0.3 kg.');
  assert.equal(LG.projSentence([{ art: 'il tuo peso', name: 'il peso', r: ok(0.02) }, { art: 'la massa grassa', name: 'la massa grassa', r: { ok: false } }, { art: 'la massa magra', name: 'la massa magra', r: { ok: false } }]),
    'Se continui così, entro i prossimi 30 giorni il tuo peso resterà stabile. Per la massa grassa e la massa magra non ci sono dati sufficienti.');
  assert.equal(LG.projSentence([{ art: 'x', name: 'x', r: { ok: false } }]), null); });

// ---- concepts Rivista / Indice (ed2.js): pure helpers + wiring ----
{ const F = { userTz: () => 'Europe/Rome', addDays: (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10), dshort: d => +d.slice(8) + '/' + +d.slice(5, 7), esc: x => x };
  const ctx = { window: { CX: { F, it: (v, d) => Number(v).toFixed(d || 0), NA: 'nessun dato' }, LG: {}, CA: {}, CB: {} }, document: { getElementById: () => null } };
  vm.runInNewContext(fs.readFileSync(root + 'src/concepts/ed2.js', 'utf8'), ctx); const E2 = ctx.window.E2;
  t('ed2: chapter columns 1 / 2 from 1920 / 3 from 2560; no parallax or sticky under 768 or with reduced motion', () => {
    assert.deepEqual([390, 1440, 1919, 1920, 2559, 2560, 3440].map(E2.cols), [1, 1, 1, 2, 2, 3, 3]);
    assert.equal(E2.motion(390, false).parallax, false); assert.equal(E2.motion(390, false).sticky, false); assert.equal(E2.motion(1440, true).parallax, false); assert.equal(E2.motion(1440, false).parallax, true); });
  t('ed2: balance wording: Deficit / Surplus / In pari under 50 kcal', () => {
    const w = x => { const r = E2.balWord(x); return r && r.label + (r.k === 'pari' ? '' : ' ' + r.v); };
    assert.equal(w(-360), 'Deficit 360'); assert.equal(w(412.4), 'Surplus 412'); assert.equal(w(49.9), 'In pari'); assert.equal(w(-49.9), 'In pari'); assert.equal(w(0), 'In pari');
    assert.equal(w(50), 'Surplus 50'); assert.equal(w(-50), 'Deficit 50'); assert.equal(E2.balWord(null), null); assert.equal(E2.balWord(NaN), null); });
  t('ed2: 7-day average balance uses complete days only (incomplete / discarded / no diary excluded)', () => {
    const rows = [{ full: true, bal: -100 }, { full: true, bal: null }, { full: true, bal: 300 }, { full: false, bal: 999 }, { full: true, bal: -500 }, { full: true }, { full: true, bal: -66 }];
    const a = E2.avgBal(rows); assert.equal(a.n, 4); near(a.mean, (-100 + 300 - 500 - 66) / 4); assert.equal(a.of, 7);
    assert.equal(E2.avgBal([{ full: true, bal: null }]).mean, null); assert.equal(E2.avgBal([]).n, 0); });
  t('ed2: hero balance and the Bilancio section share the same helper and definition', () => {
    const m = fs.readFileSync(root + 'src/concepts/ed2.js', 'utf8'), cx = fs.readFileSync(root + 'src/concepts/cx.js', 'utf8');
    assert.match(cx, /r\.bal=full&&r\.eaten!=null&&r\.burned!=null\?r\.eaten-r\.burned:null/); assert.ok((m.match(/E2\.avgBal\(M\.rows\.slice\(-8,-1\)\)|E2\.avgBal\(r7\)/g) || []).length >= 2);
    assert.match(m, /T\.eaten-T\.partial/); assert.match(m, /Bilancio di oggi · finora/); });
  t('ed2: meals = today sorted by time, else latest earlier day; totals only from real values', () => {
    const E = [{ day: '2026-10-22', time: '13:00', kcal: 500, protein: 30 }, { day: '2026-10-22', time: '08:00', kcal: 200 }, { day: '2026-10-20', time: '09:00', kcal: 300 }, { day: '2026-10-23', time: '09:00', kcal: 100 }].map((e,i) => ({...e,source:'test',title:'Synthetic meal ' + i}));
    const a = E2.meals(E, '2026-10-22'); assert.equal(a.isToday, true); assert.deepEqual(a.rows.map(r => r.time), ['08:00', '13:00']); assert.equal(a.kcal, 700); assert.equal(a.protein, 30);
    const b = E2.meals(E, '2026-10-21'); assert.equal(b.isToday, false); assert.equal(b.day, '2026-10-20'); assert.equal(E2.meals([], '2026-10-22'), null); });
  t('ed2: alerts only from real states', () => {
    const now = Date.parse('2026-10-22T15:00:00Z');
    assert.equal(E2.alerts({ today: '2026-10-22', recDay: '2026-10-22', mealsToday: true, pjLow: false, dropped: 0, ingestAt: '2026-10-22T14:00:00Z', now }).length, 0);
    const a = E2.alerts({ today: '2026-10-22', recDay: '2026-10-11', mealsToday: false, pjLow: true, pjN: 6, dropped: 7, ingestAt: '2026-10-19T10:00:00Z', now });
    assert.deepEqual(JSON.parse(JSON.stringify(a.map(x => x[1]))), ['Diario', 'Proiezione', 'Energia', 'Apple Salute']); assert.match(a[1][2], /6 pesate/); });
  t('ed2: glass only for top bar, index tiles, Stato di forma and projection; published page wired', () => {
    const m = fs.readFileSync(root + 'src/concepts/ed2.js', 'utf8'), g = [...m.matchAll(/class="([^"]*\bglass\b[^"]*)"/g)].map(x => x[1].split(' ')[0]);
    assert.deepEqual([...new Set(g)].sort(), ['dnav', 'ix', 'lg-top', 'side'].sort()); assert.ok(!/fetch\(/.test(m), 'no own fetch');
    const css = fs.readFileSync(root + 'src/concepts/ed2.css', 'utf8'); assert.match(css, /prefers-reduced-motion:reduce/); assert.ok(!/\.(fx|hero|fig)[^{]*\{[^}]*transform/.test(css), 'data blocks never transform');
    const html = fs.readFileSync(root + 'build/index.html', 'utf8');
    assert.match(html,/data-v="rivista"/); assert.match(html,/ed2.js/); }); }


t('rivista: shipped CSS clears both fixed docks and moves the narrow portrait pill above content', () => {
  const css = fs.readFileSync(root + 'build/concept/ed2.css', 'utf8');
  assert.equal(css, fs.readFileSync(root + 'src/concepts/ed2.css', 'utf8'), 'shipped CSS must match source');
  assert.match(fs.readFileSync(root + 'build/index.html', 'utf8'), /href="\/concept\/ed2\.css"/);
  assert.match(css, /\.chnav\{position:fixed;/);
  assert.match(css, /padding:calc\(var\(--jk-top-bottom\) \+ var\(--jk-top-clearance\)\)/);
  assert.match(css, /--jk-top-clearance:14px/);
  assert.match(css, /padding-bottom:calc\(var\(--nav-h, 64px\) \+ 12px \+ var\(--safe-b\) \+ 14px\)/);
  const mobile = css.match(/@media \(max-width:430px\) and \(min-height:500px\)\{([\s\S]*?)\n\}/)?.[1];
  assert.ok(mobile, '390×844 uses the top dock; 1440 keeps the bottom dock');
  assert.match(mobile, /\.e2 \.chnav\{top:calc\(var\(--jk-top-bottom\) \+ var\(--jk-top-clearance\)\);bottom:auto\}/);
  for (const property of ['padding-top', 'scroll-margin-top']) {
    assert.ok(mobile.includes(property + ':calc(var(--jk-top-bottom) + var(--jk-top-clearance) + var(--nav-h, 64px) + var(--jk-top-clearance))'), property);
  }
});
t('rivista: chapter scrolling clears the top-docked pill without treating the bottom pill as a header', () => {
  const js = fs.readFileSync(root + 'src/concepts/ed2.js', 'utf8');
  const cut = js.match(/function barCut\(\)\{[^\n]+\}/)?.[0];
  assert.ok(cut);
  for (const [width, height, pillBottom, expected] of [[390, 844, 138, 152], [1440, 900, 888, 84], [390, 466, 454, 84]]) {
    const header = { getBoundingClientRect: () => ({ bottom: 70 }) };
    const pill = { getBoundingClientRect: () => ({ bottom: pillBottom }) };
    const context = { getComputedStyle: () => ({ getPropertyValue: () => '14px' }), document: { documentElement: {}, querySelector: selector => selector === '.lg-top' ? header : pill }, matchMedia: query => { assert.equal(query, '(max-width:430px) and (min-height:500px)'); return { matches: width <= 430 && height >= 500 }; } };
    assert.equal(vm.runInNewContext(cut + ';barCut()', context), expected);
  }
});

// ---- Target progress: display-only, obviously synthetic quantities. ----
const progress = (consumed, target = { value: 140 }, label = 'Proteine', extra = {}) => C.macroProgress({ label, consumed, target, ...extra });
t('progress: single statuses, exact target and Italian fractions', () => {
  assert.equal(progress(90).status, 'mancano 50 g');
  assert.equal(progress(140).status, 'raggiunto');
  assert.equal(progress(152).status, 'oltre di 12 g');
  assert.equal(progress(129.4).status, 'mancano 10,6 g');
  assert.equal(progress(90).targetLine, 'obiettivo 140 g');
});
t('progress: range statuses include endpoints and preserve decimal precision', () => {
  const target = { lo: 55.6, hi: 66.7 };
  assert.equal(progress(45, target, 'Grassi').status, 'mancano 10,6 g');
  assert.equal(progress(40, target, 'Grassi').status, 'mancano 15,6 g');
  for (const v of [55.6, 60, 66.7]) assert.equal(progress(v, target).status, 'nel range');
  assert.equal(progress(78.7, target).status, 'oltre di 12 g');
  assert.equal(progress(80, target).status, 'oltre di 13,3 g');
  assert.equal(progress(60, target).targetLine, 'range 55,6–66,7 g');
  near(progress(45, target).band.start, 55.6 / 66.7);
  near(progress(45, target).band.length, 11.1 / 66.7);
});
t('progress: overshoot caps the ring and meter, carries actual consumption in a full sentence', () => {
  for (const target of [{ value: 140 }, { lo: 100, hi: 140 }]) {
    const m = progress(160, target); assert.equal(m.fill, 1); assert.equal(m.halo, true);
    assert.equal(m.now, 140); assert.equal(m.max, 140); assert.equal(m.status, 'oltre di 20 g');
    assert.match(m.ariaText, /^Proteine 160 grammi, .+oltre di 20 grammi\.$/);
  }
  assert.equal(progress(140).halo, false); assert.equal(progress(0).fill, 0);
});
t('progress: missing fibre is an image with dots, no fill and no invented zero; explicit zero is data', () => {
  for (const v of [null, undefined]) {
    const m = progress(v, { value: 30 }, 'Fibre');
    assert.equal(m.value, '—'); assert.equal(m.role, 'img'); assert.equal(m.status, 'nessun dato');
    assert.equal(m.ariaText, 'Fibre: nessun dato, obiettivo 30 grammi.');
    assert.equal(m.dotted, true); assert.equal(m.fill, 0); assert.equal(m.halo, false); assert.equal(m.now, null);
    assert.doesNotMatch(m.value, /0 g/);
  }
  const m = progress(0, { value: 30 }, 'Fibre');
  assert.equal(m.value, '0 g'); assert.equal(m.role, 'meter'); assert.equal(m.dotted, false); assert.equal(m.status, 'mancano 30 g');
});
t('progress: accessible wording includes range, deficit, estimated objective and partial data', () => {
  assert.equal(progress(140).ariaText, 'Proteine 140 grammi, obiettivo 140 grammi, obiettivo raggiunto.');
  assert.equal(progress(45, { lo: 55.6, hi: 66.7 }, 'Grassi').ariaText, 'Grassi 45 grammi, range 55,6–66,7 grammi, sotto il range, mancano 10,6 grammi.');
  assert.match(progress(90, { value: 140 }, 'Proteine', { estimated: true }).ariaText, /obiettivo stimato 140 grammi/);
  assert.match(progress(45, { lo: 55.6, hi: 66.7 }, 'Grassi', { estimated: true }).ariaText, /obiettivo stimato, range 55,6–66,7 grammi/);
  assert.match(progress(90, { value: 140 }, 'Proteine', { partial: true }).ariaText, /almeno 90 grammi/);
  assert.equal(progress(90, null).role, 'img'); assert.equal(progress(90, null).status, 'obiettivo non disponibile');
});
t('kcal progress: scale, tick, fill and striped excess use a single budget', () => {
  for (const [consumed, expectedScale] of [[0, 2400], [1500, 2400], [2000, 2400], [2120, 2400], [2600, 2600]]) {
    const m = C.kcalBarModel({ consumed, target: 2000 });
    assert.equal(m.scale, expectedScale); near(m.tick, 2000 / expectedScale);
    near(m.fill, Math.min(consumed, 2000) / expectedScale);
    if (consumed > 2000) { near(m.striped.start, m.tick); near(m.striped.length, (consumed - 2000) / expectedScale); }
    else assert.equal(m.striped, null);
    assert.equal(m.dashed, false); assert.equal(m.role, 'meter');
  }
  const m = C.kcalBarModel({ consumed: 1500, target: 2000 });
  assert.equal(m.value, '1.500'); assert.equal(m.targetText, '2.000 kcal'); assert.equal(m.status, 'mancano 500 kcal');
  assert.equal(C.kcalBarModel({ consumed: 2120, target: 2000 }).status, 'oltre di 120 kcal');
  assert.equal(C.kcalBarModel({ consumed: 2000, target: 2000 }).status, 'obiettivo raggiunto');
});
t('kcal progress: estimated target is prefixed, dashed and named in accessible full sentence', () => {
  const m = C.kcalBarModel({ consumed: 2600, target: 2000, estimated: true, dayLabel: 'riposo' });
  assert.equal(m.targetText, '~2.000 kcal'); assert.equal(m.dashed, true);
  assert.equal(m.estimateLabel, 'stima · giorno riposo');
  assert.equal(m.ariaText, 'Calorie: 2.600 chilocalorie, obiettivo stimato 2.000 chilocalorie, oltre di 600 kcal.');
  const missing = C.kcalBarModel({ consumed: null, target: 2000 });
  assert.equal(missing.role, 'img'); assert.equal(missing.value, '—'); assert.equal(missing.fill, 0);
  assert.equal(C.kcalBarModel({ consumed: 0, target: 2000 }).role, 'meter');
});
t('progress: reduced motion disables both animations; first draw and updates use specified durations', () => {
  const css = fs.readFileSync(root + 'src/concepts/ed2.css', 'utf8'), js = fs.readFileSync(root + 'src/concepts/ed2.js', 'utf8');
  assert.match(css, /@media \(prefers-reduced-motion:reduce\)\{\.nut \.macro-fill,\.nut \.kcal-fill,\.nut \.kcal-over\{animation:none!important;transition:none!important\}\}/);
  assert.match(css, /macro-draw 280ms var\(--jk-ease-out\)/); assert.match(css, /kcal-draw 280ms var\(--jk-ease-out\)/);
  assert.match(js, /duration:200,easing:/); assert.match(js, /function updateProgress[\s\S]*?if\(CX.reduced\(\)\)return/);
  assert.doesNotMatch(css, /\.nut \.pbar/);
});

// Contrast is calculated locally; browser measurements are generated on demand, never committed.
t('progress: light and dark fill/track contrast is at least 3:1', () => {
  const luminance=rgb=>rgb.map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4}).reduce((a,x,i)=>a+x*[.2126,.7152,.0722][i],0);
  const css=fs.readFileSync(root+'src/concepts/ed2.css','utf8');
  for(const token of ['#957500','#40372c']) assert.ok(css.includes(token));
  for(const [fill,track] of [[[149,117,0],[229,227,222]],[[232,197,71],[64,55,44]]]) {
    const a=luminance(fill),b=luminance(track);assert.ok((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=3);
  }
});

// ---- theme: saved choice -> ?theme= -> Auto by local clock (light 07:00-18:59) ----
{ const tctx = {}; vm.runInNewContext(fs.readFileSync(root + 'src/theme.js', 'utf8'), tctx); const T = tctx.FormaTheme; const at = (h, m) => new Date(2026, 9, 22, h, m);
  t('theme: Auto by local clock: 06:59 dark, 07:00 light, 18:59 light, 19:00 dark', () => {
    assert.deepEqual([at(6, 59), at(7, 0), at(18, 59), at(19, 0), at(0, 0), at(12, 0), at(23, 59)].map(T.auto), ['dark', 'light', 'light', 'dark', 'dark', 'light', 'dark']); });
  t('theme: override order saved choice > ?theme= > Auto', () => {
    assert.equal(T.pick('dark', 'light', at(12, 0)), 'dark'); assert.equal(T.pick('light', null, at(21, 0)), 'light');
    assert.equal(T.pick(null, 'dark', at(12, 0)), 'dark'); assert.equal(T.pick('auto', 'light', at(21, 0)), 'light');
    assert.equal(T.pick(null, null, at(21, 0)), 'dark'); assert.equal(T.pick(null, 'bogus', at(12, 0)), 'light'); });
  t('theme: external blocking head script on every page, no inline script, no other clock overrides', () => {
    const h=fs.readFileSync(root+'build/index.html','utf8'), head=h.split('</head>')[0];
    assert.match(head, /<script src="\/theme.js"><\/script>/);assert.ok(!/<script>(?!<\/script>)/.test(h));
    for (const f of ['src/concepts/cx.js', 'src/concepts/lg.js', 'src/concepts/ed2.js']) assert.ok(!/dataset\.theme\s*=/.test(fs.readFileSync(root + f, 'utf8')), f);
    assert.match(fs.readFileSync(root + 'src/concepts/lg.js', 'utf8'), /FormaTheme\.mount/); assert.match(fs.readFileSync(root + 'src/concepts/lg.css', 'utf8'), /prefers-reduced-motion:reduce\)\{html\.th-fade/); });
  t('duo: style.css is vendored, viewport-fit=cover, safe-area vars and live resize', () => {
    const b = fs.readFileSync(root + 'scripts/build.mjs', 'utf8');
    assert.equal(fs.readFileSync(root+'build/style.css','utf8'),fs.readFileSync(root+'src/style.css','utf8'));
    assert.ok(!/forma-dashboard-mockups/.test(b), 'build must not read a sibling mockup repo');
    assert.ok(fs.existsSync(root + 'src/style.css'));
    assert.match(b, /viewport-fit=cover/);
    assert.match(fs.readFileSync(root + 'build/index.html', 'utf8'), /viewport-fit=cover/);
    const lg = fs.readFileSync(root + 'src/concepts/lg.css', 'utf8');
    assert.match(lg, /100dvh/); assert.match(lg, /--safe-t:env\(safe-area-inset-top/);
    assert.match(fs.readFileSync(root + 'src/concepts/lg.js', 'utf8'), /ResizeObserver|visualViewport/);
    assert.match(fs.readFileSync(root + 'src/concepts/ed2.js', 'utf8'), /LG\.watchSize/); }); }
// ---- nutrition (nut.js + generic reference tables; synthetic entries, no health data) ----
{
  const ctx = { window: {} }; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(root + 'build/concept/nut_ref.js', 'utf8'), ctx); vm.runInContext(fs.readFileSync(root + 'src/concepts/nut.js', 'utf8'), ctx);
  const N = ctx.window.NUT, R = ctx.window.NUTREF, J = x => JSON.parse(JSON.stringify(x));
  t('nut: generated browser reference exactly matches the JSON starter set', () => {
    const source = JSON.parse(fs.readFileSync(root + 'src/nutrition/foods.json', 'utf8'));
    assert.deepEqual(J(R), source);
    assert.deepEqual(J(R.supps), {});
    assert.ok(!fs.existsSync(root + 'src/concepts/nut_ref.js'), 'no second source to drift');
    assert.ok(!fs.existsSync(root + 'tools/build_food_ref.py'), 'no hardcoded generator');
    for (const [k, f] of Object.entries(R.foods)) {
      for (const n of Object.keys(f.per100)) {
        assert.ok(['CREA', 'USDA'].includes(f.src[n]), k + '.' + n);
        assert.ok(Number.isFinite(f.per100[n]) && f.per100[n] >= 0, k + '.' + n);
      }
      assert.ok(f.crea || f.usda, k + ' has public source metadata');
      assert.ok(!f.labels && !f.urls && !f.parts, k + ' is a staple, not a product or recipe');
      if (f.crea) assert.equal(new URL(f.crea.url).hostname, 'www.alimentinutrizione.it');
      if (f.usda) assert.equal(new URL(f.usda.url).hostname, 'fdc.nal.usda.gov');
    }
    assert.deepEqual([R.nrv.vitC, R.nrv.vitD, R.nrv.magnesium, R.nrv.zinc, R.nrv.folate, R.nrv.vitB12, R.nrv.selenium], [80, 5, 375, 10, 200, 2.5, 55]);
    const unknown = N.entry({title:'Synthetic meal A',source:'test',items:[{s:'test_supp_a',n:1}]});
    assert.equal(unknown.cov, 'none');
    assert.deepEqual(J(unknown.unmatched), ['test_supp_a']);
  });
  // Test-only owner tables: round invented amounts, never embedded in shipped assets.
  Object.assign(R.supps, {
    test_supp_a: {name:'Synthetic supplement A',unit:'unit',per:'n',v:{kcal:0,epa:2,dha:1,magnesium:10}},
    test_supp_b: {name:'Synthetic supplement B',unit:'g',per:'g',v:{vitC:10}}
  });
  t('nut: food items scale per 100 g; diary macros win; synthetic supplements resolve by key', () => {
    const e = { day: '2040-01-01', time: '13:00', title: 'Synthetic meal A', source: 'test', kcal: 500, protein: 30, carbs: null, fat: null, items: [{ f: 'riso_crudo', g: 200 }, { s: 'test_supp_a', n: 2 }] };
    const r = N.entry(e); near(r.v.potassium, R.foods.riso_crudo.per100.potassium * 2); near(r.v.epa, 4); near(r.supp.dha, 2); assert.equal(r.v.kcal, 500); assert.equal(r.v.protein, 30); assert.equal(r.cov, 'full');
    near(r.v.carbs, R.foods.riso_crudo.per100.carbs * 2);
    const grams = N.entry({title:'Synthetic meal B',source:'test',items:[{s:'test_supp_b',g:4}]});
    assert.equal(grams.cov, 'full'); near(grams.v.vitC, 40); near(grams.supp.vitC, 40);
    assert.equal(N.entry({items:[{s:'test_supp_b',n:4}]}).cov, 'none');
    assert.equal(N.entry({items:[{s:'test_supp_a',g:4}]}).cov, 'none');
  });
  t('nut: no items -> stima mancante; titles never imply a supplement or quantity', () => {
    for (const title of ['Synthetic meal A', 'Synthetic supplement A', 'Synthetic supplement B 4 g']) {
      const r = N.entry({ day: '2040-01-01', title, source:'test', kcal: 500 });
      assert.equal(r.cov, 'none'); assert.deepEqual(J(Object.keys(r.v)), ['kcal']); assert.deepEqual(J(r.unmatched), [title]);
    }
    const d = N.day([{ day: '2040-01-01', title: 'Synthetic meal A', source:'test', kcal: 500 }, { day: '2040-01-01', title: 'Synthetic meal B', source:'test', kcal: 100, items:[{s:'test_supp_a',n:1}] }], '2040-01-01');
    assert.equal(d.partial, true); assert.equal(d.nNone, 1); near(d.kcalCovered, 100 / 600); near(d.tot.magnesium, 10); assert.equal(d.macPartial.carbs, true);
  });
  t('nut: unmatched items inside an entry make it partial; explicit nutrients override', () => {
    const r = N.entry({ day: '2040-01-01', title: 'Synthetic meal A', source: 'test', items: [{ f: 'banana', g: 100 }, { x: 'Synthetic unknown item', why: 'test' }] }); assert.equal(r.cov, 'partial'); assert.deepEqual(J(r.unmatched), ['Synthetic unknown item']);
    const q = N.entry({ day: '2040-01-01', title: 'Synthetic meal B', source:'test', nutrients: { vitC: 10, bogus: 3 } }); assert.equal(q.cov, 'full'); assert.equal(q.v.vitC, 10); assert.equal(q.v.bogus, undefined);
  });
  t('nut: % of reference, macro split and unit/gram supplement plan status', () => {
    near(N.pct('vitC', 40), 50); near(N.pct('fiber', 25), 100); near(N.pct('epa_dha', 0.5), 200); assert.equal(N.pct('kcal', 100), null);
    const m = N.macros({ kcal: 2000, protein: 150, carbs: 200, fat: 60 }); near(m.protein.pct, 30); near(m.carbs.pct, 40); near(m.fat.pct, 27);
    const d = N.day([{ day: '2040-01-01', time: '08:00', title: 'Synthetic meal A', source:'test', items: [{ s: 'test_supp_a', n: 1 }] }, { day: '2040-01-01', time: '13:00', title: 'Synthetic meal B', source:'test', items: [{ s: 'test_supp_b', g: 4 }] }], '2040-01-01');
    const st = N.suppStatus([{ s: 'test_supp_a', n: 1 }, { s: 'test_supp_a', n: 2 }, { s: 'test_supp_b', g: 4 }, { s: 'test_supp_b', g: 10 }], d.supps);
    assert.deepEqual(J(st).map(x => [x.got, x.want, x.ok]), [[1, 1, true], [1, 2, false], [4, 4, true], [4, 10, false]]);
    assert.equal(st[2].unit, 'g'); assert.equal(st[0].label, 'Synthetic supplement A');
    assert.equal(N.history([]).length, 0);
  });
  t('nut: zero-energy synthetic supplements count in the checklist without title inference', () => {
    const d = N.day([{ day: '2040-01-01', time: '08:00', title: 'Synthetic meal A', source:'test', items: [{ s: 'test_supp_a', n: 1 }] }], '2040-01-01');
    assert.equal(d.tot.kcal, 0); assert.equal(d.partial, false);
    const st = N.suppStatus([{ s: 'test_supp_a', n: 1 }, { s:'test_supp_b',g:4 }], d.supps);
    assert.deepEqual(J(st).map(x => [x.got, x.want, x.ok]), [[1, 1, true], [0, 4, false]]);
  });
  t('meals API: items / nutrients validated, stored as JSON, omitted -> null (COALESCE keeps stored values)', () => {
    const err = []; assert.equal(S.mealItems(undefined, err, 0), null); assert.equal(S.mealNutrients(null, err, 0), null);
    assert.deepEqual(JSON.parse(S.mealItems([{ f: 'riso_crudo', g: 100 }, { s: 'test_supp_a', n: 1 }, { x: 'Synthetic unknown item' }, { f: 'BAD KEY', g: 1 }, { f: 'banana' }], err, 0)), [{ f: 'riso_crudo', g: 100 }, { s: 'test_supp_a', n: 1 }, { x: 'Synthetic unknown item' }]);
    assert.equal(err.length, 2); assert.deepEqual(JSON.parse(S.mealNutrients({ vitC: 500, nope: 1, iron: -1 }, err, 0)), { vitC: 500 });
    assert.deepEqual(S.mealOut({ id: 'a', items: '[{"f":"banana","g":1}]', nutrients: null }), { id: 'a', items: [{ f: 'banana', g: 1 }], nutrients: null });
    const w = fs.readFileSync(root + 'src/pages_worker.js', 'utf8'); assert.match(w, /items=COALESCE\(excluded\.items,meals\.items\)/); assert.match(w, /nutrients=COALESCE\(excluded\.nutrients,meals\.nutrients\)/); });
  t('nut: reference file holds generic tables only (no diary data)', () => {
    const txt = fs.readFileSync(root + 'src/nutrition/foods.json', 'utf8'); assert.doesNotMatch(txt, /2026-\d\d-\d\d[^"]/); assert.ok(!/"day"|"time"|supp_plan/.test(txt)); });
}

// ---- Missing-day gaps ----
const J = x => JSON.parse(JSON.stringify(x));
t('gap: runs of missing days', () => {
  const v = [1, null, null, 3, null, 5, null, null, null];
  assert.deepEqual(J(LG.gapRuns(i => v[i] == null, v.length, 2)), [[1, 2], [6, 8]]);
  assert.deepEqual(J(LG.gapRuns(i => v[i] == null, v.length, 2, 7)), [[1, 2], [6, 7]]);
  assert.deepEqual(J(LG.gapRuns(i => v[i] == null, v.length, 1)), [[1, 2], [4, 4], [6, 8]]); });
t('gap: connect bridges only short gaps', () => {
  const v = [1, null, 2, null, null, null, 3, 4];
  assert.deepEqual(J(LG.bridgeSegs(v, 2)), { solid: [[0, 2], [6, 7]], long: [[2, 6]] });
  assert.deepEqual(J(LG.bridgeSegs(v)), { solid: [[0, 2, 6, 7]], long: [] });
  assert.deepEqual(J(LG.bridgeSegs(v, 1)), { solid: [[0], [2], [6, 7]], long: [[0, 2], [2, 6]] }); });
t('gap: Rivista HRV never draws a line across missing days; nights show stage-less totals', () => {
  const e = fs.readFileSync(root + 'src/concepts/ed2.js', 'utf8'), c = fs.readFileSync(root + 'src/concepts/cx.js', 'utf8');
  assert.match(e, /color:'#bf5af2',id:'eh',[^}]*connect:true,bridge:1,gapMin:2/); assert.match(e, /\['uns','#8e8e93'\]/);
  assert.match(c, /x\.sleep_asleep_min&&\(!x\.sleep_src/); });

// ---- Apple energy and day-type estimates ----
t('energy: complete Apple stays real; incomplete past days use estimates, today keeps Apple partial', () => {
  const cctx = { window: { __FORMA_TEST__: C, addEventListener() {} }, matchMedia: () => ({ matches: false }), location: { search: '' }, document: { addEventListener() {}, getElementById: () => null, querySelectorAll: () => [], documentElement: { dataset: {}, style: { setProperty() {} } } }, addEventListener() {}, setTimeout() {} };
  cctx.window.matchMedia = cctx.matchMedia; vm.createContext(cctx); vm.runInContext('var window=this.window;' + fs.readFileSync(root + 'src/concepts/cx.js', 'utf8'), cctx);
  const CXm = cctx.window.CX, td = CXm.today, a = n => C.addDays(td, -n), kj = kcal => kcal * 4.184;
  const D = { days: [
      { day: a(1) },
      { day: a(2), active_kcal: 600, resting_kcal: 1700, burn_complete: 1 },
      { day: a(3), active_kcal: 300, resting_kcal: 600 },
      { day: a(4), active_kcal: 500, resting_kcal: 1000 },
      { day: a(5), active_kcal: 200, resting_kcal: 300 },
      { day: td, active_kcal: 200, resting_kcal: 300 }],
    workouts: [], hk: {}, body: [], quality: { resting_min_complete: 1200 },
    thirdparty: { recovery: [], sleep: [], cycles: [
      { day: a(1), kj: kj(2500), avg_hr: 60, strain: 8 }, { day: a(2), kj: kj(2900), avg_hr: 60, strain: 9 }, { day: a(3), kj: kj(2400), avg_hr: 60, strain: 7 },
      { day: a(4), kj: kj(1100), avg_hr: 60, strain: 2 }, { day: a(5), kj: kj(1300), avg_hr: 0, strain: 0 }, { day: td, kj: kj(800), avg_hr: 62, strain: 3 }] },
    meals: { entries: [], targets: { riposo: 2000 }, days: [1,2,3,4,5,0].map(n => ({day:a(n),day_type:'riposo',kcal:n?2000:600})) } };
  const M = CXm.model(D), by = M.by;
  for (const n of [1,3,4,5]) {
    assert.equal(by[a(n)].burned, null); assert.equal(by[a(n)].bsrc, null); assert.equal(by[a(n)].bal, null);
    assert.equal(by[a(n)].estimate, 2000); assert.equal(by[a(n)].target.estimated, true);
  }
  assert.equal(by[a(2)].bsrc, 'apple'); assert.equal(by[a(2)].burned, 2300); assert.equal(by[a(2)].bal, -300);
  assert.equal(by[td].psrc, 'apple'); assert.equal(by[td].partial, 500); assert.equal(by[td].target.source, 'estimate');
  const rows = [by[a(1)],by[a(2)],by[a(3)],by[td]], er=LG.energyRows(rows);
  assert.deepEqual(J(er.vals), [2000,2300,2000,500]); assert.deepEqual(J(rows.map((_,i)=>er.est(i))), [true,false,true,false]);
});

// ---- Apple-only metric selection ----
t('priority: Apple HRV, RHR, sleep, SpO2, respiration and temperature ignore historical third-party payloads', () => {
  const cctx = { window: { __FORMA_TEST__: C, addEventListener() {} }, matchMedia: () => ({ matches: false }), location: { search: '' }, document: { addEventListener() {}, getElementById: () => null, querySelectorAll: () => [], documentElement: { dataset: {}, style: { setProperty() {} } } }, addEventListener() {}, setTimeout() {} };
  cctx.window.matchMedia = cctx.matchMedia; vm.createContext(cctx); vm.runInContext('var window=this.window;' + fs.readFileSync(root + 'src/concepts/cx.js', 'utf8'), cctx);
  const CXm = cctx.window.CX, td = CXm.today, a = n => C.addDays(td, -n);
  const D = { days: [
      { day: a(1), resting_hr: 58, sleep_asleep_min: 400, sleep_deep_min: 60, sleep_core_min: 250, sleep_rem_min: 90 },
      { day: a(2), resting_hr: 57, sleep_asleep_min: 420, sleep_deep_min: 70, sleep_core_min: 260, sleep_rem_min: 90 },
      { example: true, source: 'test', day: a(3), sleep_asleep_min: 480, sleep_src: 'thirdparty' }],
    workouts: [], body: [], quality: {}, meals: { entries: [], days: [] },
    hk: { 'heart_rate_variability_sdnn.avg': [[a(1), 60], [a(2), 62]], 'oxygen_saturation.avg': [[a(1), 0.97], [a(2), 0.96]], 'respiratory_rate.avg': [[a(2), 15]], 'apple_sleeping_wrist_temperature.avg': [[a(1), 34]] },
    thirdparty: { cycles: [], recovery: [{ day: a(1), recovery: 70, hrv: 45, rhr: 52, spo2: 95.5, skin_temp: 33.4 }],
      sleep: [{ day: a(1), light_ms: 250 * 6e4, deep_ms: 90 * 6e4, rem_ms: 100 * 6e4, resp: 14.2 }] } };
  const by = CXm.model(D).by;
  assert.equal(by[a(1)].hrv, 60); assert.equal(by[a(1)].hsrc, 'Apple'); assert.equal(by[a(2)].hrv, 62); assert.equal(by[a(2)].hsrc, 'Apple');
  assert.equal(by[a(1)].rhr, 58); assert.equal(by[a(1)].rsrc, 'Apple'); assert.equal(by[a(2)].rhr, 57); assert.equal(by[a(2)].rsrc, 'Apple');
  assert.equal(by[a(1)].ssrc, 'Apple Watch'); assert.equal(by[a(1)].sleep, 400); assert.equal(by[a(1)].deep, 60); assert.equal(by[a(2)].ssrc, 'Apple Watch'); assert.equal(by[a(2)].sleep, 420);
  assert.equal(by[a(1)].spo2Src, 'Apple'); assert.equal(by[a(1)].spo2, 0.97); assert.equal(by[a(2)].spo2Src, 'Apple'); assert.equal(by[a(1)].respSrc, null); assert.equal(by[a(1)].resp, null); assert.equal(by[a(2)].resp, 15); assert.equal(by[a(1)].skinSrc, 'Apple'); assert.equal(by[a(1)].skin, 34); assert.equal(by[a(1)].rec, undefined); assert.equal(by[a(1)].strain, undefined);
  assert.equal(by[a(3)].sleep, null); assert.equal(by[a(3)].hrv, null); assert.equal(by[a(3)].rhr, null);
  delete D.thirdparty; assert.equal(CXm.model(D).by[a(1)].hrv, 60);
});
t('priority: lines never join across a source switch', () => {
  const v = [1, 2, 3, 4, null, 5], src = ['W', 'W', 'A', 'A', null, 'A'];
  assert.deepEqual(J(LG.bridgeSegs(v, 1, src).solid), [[0, 1], [2, 3], [5]]);
  assert.deepEqual(J(LG.bridgeSegs(v, 2, src).solid), [[0, 1], [2, 3, 5]]); });
t('priority: Apple workout keeps its own measurements; third-party copies contribute nothing', () => {
  const w = S.dedupeWorkouts([
    { example: true, id: 'synthetic-apple-a', source: 'fsync', src_bundle: 'com.apple.health.X', type: 'Synthetic workout A', start: '2026-10-20T16:00:00Z', end: '2026-10-20T17:30:00Z', duration_s: 5400, avg_hr: 120, max_hr: 160, kcal: 700, distance_km: 2 },
    { example: true, id: 'synthetic-copy-a', source: 'thirdparty', type: 'Synthetic workout B', start: '2026-10-20T16:10:00Z', end: '2026-10-20T17:30:00Z', duration_s: 4800, avg_hr: 130, max_hr: 170, kcal: 600, strain: 10 }]);
  assert.equal(w.length, 1); const x = w[0];
  assert.equal(x.avg_hr, 120); assert.equal(x.max_hr, 160); assert.equal(x.duration_s, 5400); assert.equal(x.strain, undefined); assert.equal(x.hr_src, 'apple');
  assert.equal(x.kcal, 700); assert.equal(x.type, 'Synthetic workout A'); assert.equal(x.distance_km, 2); assert.equal(x.merged, undefined); });

// ---- Day navigation ----
t('days: ?date= parsing clamps to the data window and rejects invalid dates', () => {
  const E2 = (() => { const src = fs.readFileSync(root + 'src/concepts/ed2.js', 'utf8'); const m = src.slice(src.indexOf('E2.mealsOn='), src.indexOf('// alerts from real data states only')); const c = { E2: {} }; vm.runInNewContext(m.replace(/E2\./g, 'this.E2.'), c); return c.E2; })();
  const add = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
  assert.equal(E2.dayParam('?date=2026-10-22', '2025-10-25', '2026-10-24'), '2026-10-22');
  assert.equal(E2.dayParam('', '2025-10-25', '2026-10-24'), '2026-10-24');
  assert.equal(E2.dayParam('?x=1&date=2026-02-30', '2025-10-25', '2026-10-24'), '2026-10-24');
  assert.equal(E2.dayParam('?date=2027-01-01', '2025-10-25', '2026-10-24'), '2026-10-24');
  assert.equal(E2.dayParam('?date=2020-01-01', '2025-10-25', '2026-10-24'), '2025-10-25');
  assert.equal(E2.dayParam('?date=2026-10-2', '2025-10-25', '2026-10-24'), '2026-10-24');
  assert.deepEqual(J(E2.strip('2026-10-24', '2026-10-24', add)), ['2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24']);
  assert.deepEqual(J(E2.strip('2026-10-10', '2026-10-24', add)), ['2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13']);
  const es = [{ day: '2026-10-22', time: '13:00', kcal: 500, protein: 30 }, { day: '2026-10-22', time: '08:00', kcal: 300, protein: null }, { day: '2026-10-23', time: '09:00', kcal: 100 }].map((e,i) => ({...e,source:'test',title:'Synthetic meal ' + i}));
  const m = E2.mealsOn(es, '2026-10-22', '2026-10-24'); assert.deepEqual(J(m.rows.map(r => r.time)), ['08:00', '13:00']); assert.equal(m.kcal, 800); assert.equal(m.protein, 30); assert.equal(m.isToday, false);
  assert.equal(E2.mealsOn(es, '2026-10-21', '2026-10-24'), null); });
t('days: /api/day is behind the session and validates the date', () => {
  const w = fs.readFileSync(root + 'src/pages_worker.js', 'utf8'), i = w.indexOf("if (!(await authed(req, env)))"), j = w.indexOf("if (p === '/api/day'");
  assert.ok(i > 0 && j > i, '/api/day after the session check'); assert.match(w, /date=YYYY-MM-DD required/);
  const e = fs.readFileSync(root + 'src/concepts/ed2.js', 'utf8'); assert.match(e, /history\.replaceState\(null,'',location\.pathname\+\(day===t\?'':'\?date='\+day\)/); assert.match(e, /function c1past\(\)/); });

t('nutrients: % column compact for values ≥1000%', () => {
  const src = fs.readFileSync(root + 'src/concepts/ed2.js', 'utf8'), m = src.slice(src.indexOf('E2.pc='), src.indexOf('E2.mealsOn=')), c = { E2: {} }; vm.runInNewContext(m.replace(/E2\./g, 'this.E2.'), c);
  assert.equal(c.E2.pc(286.4), '286%'); assert.equal(c.E2.pc(999.4), '999%'); assert.equal(c.E2.pc(2743), '2,7k%'); assert.equal(c.E2.pc(9999), '9,9k%'); assert.equal(c.E2.pc(12500), '12k%'); assert.equal(c.E2.pc(null), '');
  for (const v of [1, 99, 999, 1000, 2743, 9999, 12500, 99999]) assert.ok(c.E2.pc(v).length <= 5, v);
  assert.ok(!/it\(p\)\+'%'|it\(yp\)\+'%'/.test(src), 'table uses E2.pc'); });

t('mobile: meal titles and nutrient labels wrap instead of being clipped', () => {
  const css = fs.readFileSync(root + 'src/concepts/ed2.css', 'utf8');
  assert.match(css, /\.hr\.meals li>\.ti\{white-space:normal;overflow:visible;text-overflow:clip/); assert.match(css, /\.nut \.nmic li>\.nl\{white-space:normal;overflow:visible;text-overflow:clip/); });

t('workouts: third-party-only API and Health exports are excluded', () => {
  const base = { example: true, source: 'test', start: '2040-01-01T10:00:00Z', duration_s: 1800, kcal: 100 };
  assert.deepEqual(S.dedupeWorkouts([{...base,source:'thirdparty'}, {...base,source:'fsync',src_bundle:'com.example.thirdparty'}, {...base,source:'fsync',src_bundle:'com.example.noop'}]), []);
});

t('days: day bar moves below the energy chart on short landscape screens', () => {
  const src = fs.readFileSync(root + 'src/concepts/ed2.js', 'utf8'), m = src.slice(src.indexOf('E2.navLow='), src.indexOf('E2.mealsOn=')), c = { E2: {} }; vm.runInNewContext(m.replace(/E2\./g, 'this.E2.'), c);
  assert.equal(c.E2.navLow(466), true); assert.equal(c.E2.navLow(678), false); assert.equal((src.match(/G=\(lo\?dn:''\)/g) || []).length, 2); });
t('recovery headline: sleep and Apple baseline are independent of historical recovery scores', () => {
  const d = {example:true,T:{day:'2040-01-10',sleep:480},sleepBase:480};
  const expected=J(LG.say.recovery(d));
  assert.match(expected.s,/In linea/); assert.doesNotMatch(expected.h+expected.s,/third-party|Recupero basso/);
  for(const rec of [10,80]) assert.deepEqual(J(LG.say.recovery({...d,rec:{day:d.T.day,rec}})),expected);
});

// Designer R2: synthetic past-day heroes and deep-sleep cell/chart regression coverage.
t('past hero: estimated balances, Apple reasons and missing meals stay distinct', () => {
  const src = fs.readFileSync(root+'src/concepts/ed2.js','utf8');
  const day = '2040-01-09', today = '2040-01-10';
  const render = (values) => {
    const row = {example:true,day,wo:[],eaten:1500,burned:null,estimate:2000,bal:null,inc:500,...values};
    const ctx = {M:{by:{[day]:row},today,D:{meals:{entries:[]}}},VD:day,innerHeight:900,
      E2:{balWord:x=>x==null?null:{k:x<0?'deficit':'surplus',label:x<0?'Deficit':'Surplus',v:Math.abs(x)},mealsOn:()=>null,navLow:()=>false},
      F:C,LG,CX:{hmin:m=>C.hm(m*60000)},it:C.it,esc:C.esc,NA:'nessun dato',B:{chap1:()=>({})},
      tap:()=>'',dnav:()=>'',fig:()=>'',energyCap:()=>'',grp:()=>'',nutri:()=>'',mealsList:()=>'',section:(...a)=>a[5]};
    vm.runInNewContext(src.slice(src.indexOf('function hero('),src.indexOf('function sec('))+
      src.slice(src.indexOf('function c1past('),src.indexOf('// ---------------- chapter 1:')),ctx);
    return ctx.c1past();
  };
  const tg={lo:2000,hi:2000,estimated:true};
  for(const [eaten,n] of [[1500,'−500'],[2000,'0'],[3000,'1.000']]) {
    const h=render({eaten,target:tg});
    assert.ok(h.includes('~'+n+' <span class="u">kcal</span>'));
    assert.doesNotMatch(h,/<span class="estimated-balance">[^<]*\bbilancio\b/i);
    assert.match(h, /Apple incompleto · bruciate stimate per tipo di giornata<\/span><br>mangiate/);
    assert.equal((h.match(/\(stima\)/g)||[]).length,1);
    assert.doesNotMatch(h,/bilancio: kcal bruciate incomplete|class="bm"|class="big"><span class="v na">nessun dato|class="bwd/);
  }
  for(const [extra,reason] of [[{inc:null,dropped:true},'Apple: dato scartato'],[{inc:null},'Apple: nessun dato']])
    assert.ok(render(extra).includes(reason+' · bruciate stimate per tipo di giornata'));
  assert.match(render({eaten:null}),/<span class="v na">nessun dato<\/span>/);
  assert.match(render({estimate:null}),/<span class="v na">bilancio non disponibile<\/span>/);
  const complete=render({burned:2000,estimate:null,bal:-500,bsrc:'apple',inc:null});
  assert.match(complete,/class="bwd deficit"/); assert.match(complete,/Deficit 500/); assert.doesNotMatch(complete,/bruciate stimate|estimated-balance/);
});
t('deep baseline: last 30 Apple nights with stages, excludes today, gaps and unstaged sleep', () => {
  const ctx={...LGctx,window:{CX:{...LGctx.window.CX,F:C,buckets:()=>[]}}};
  vm.runInNewContext(fs.readFileSync(root+'src/concepts/lg.js','utf8'),ctx);
  const rows=Array.from({length:42},(_,i)=>({example:true,day:C.addDays('2040-01-01',i),full:i<41,
    deep:i===41?900:i<5?300:60,ssrc:i===39?'Apple Salute':'Apple Watch',wo:[],load:0}));
  rows[38].deep=null; rows[37].deep=0;
  const model={example:true,rows,by:Object.fromEntries(rows.map(r=>[r.day,r])),today:rows.at(-1).day,D:{days:[],hk:{}}};
  near(ctx.window.LG.derive(model).deepBase,58);
  rows.forEach(r=>r.deep=null); assert.equal(ctx.window.LG.derive(model).deepBase,null);
});
t('deep cell: duration, Apple baseline and comparison replace REM; chart contains 30 nights', () => {
  const src=fs.readFileSync(root+'src/concepts/ed2.js','utf8'), cells=[];
  const T={example:true,deep:90,core:270,rem:120,sleep:480,ssrc:'Apple Watch',rhr:60};
  const ctx={d:{T,deepBase:60},LG:{...LG,say:{recovery:()=>({h:'Sonno',s:'Esempio'})}},
    CX:{hmin:m=>C.hm(m*60000)},V:(v,u,dec,fmt)=>v==null?'nessun dato':fmt==='h'?C.hm(v*60000):String(v),
    NA:'nessun dato',SK:[['deep','Profondo','#5e5ce6'],['rem','REM','#bf5af2']],esc:C.esc,it:C.it,
    hero:()=>'',sec:(...a)=>{cells.push(a);return ''},tap:()=>'',fig:()=>'',nightsCap:()=>'',grp:()=>'',section:()=>'',when:()=>''};
  vm.runInNewContext(src.slice(src.indexOf('function c2('),src.indexOf('// ---------------- chapter 3:')),ctx);
  ctx.c2(); const deep=cells[2];
  assert.equal(deep[1],'Sonno profondo'); assert.equal(deep[2],C.hm(90*60000));
  assert.match(deep[3],/Apple Watch · media 30 notti/); assert.match(deep[3],/chip/); assert.doesNotMatch(deep[3],/REM/); assert.equal(deep[4],'deep');
  T.ssrc='Apple Salute'; cells.length=0; ctx.c2(); assert.equal(cells[2][2],'nessun dato'); assert.equal(cells[2][3],'nessun dato');
  let opts,tip;
  const chart={M:{rows:Array.from({length:45},(_,i)=>({example:true,day:'2040-01-01',deep:i,ssrc:i===44?'Apple Salute':'Apple Watch'}))},
    LG:{line:(vz,o)=>opts=o,scrub:(vz,fn)=>tip=fn},F:C,CX:ctx.CX,H:()=>80};
  const fn=src.slice(src.indexOf(' deep:function('),src.indexOf(' bal:function(')).trim().replace(/^deep:/,'').replace(/,$/,'');
  vm.runInNewContext('('+fn+')(null)',chart);
  assert.equal(opts.vals.length,30); assert.equal(opts.vals[0],15); assert.equal(opts.vals[29],null); assert.equal(opts.unit,'min'); assert.equal(opts.H,80);
  assert.match(tip(0),/Apple Watch/); assert.equal(tip(29),null);
});

// Real SQLite, in memory only: exercise the actual D1 SELECTs with synthetic rows.
await ta('API: Apple-only payloads, historical sleep provenance and source selection and cache queries', async () => {
  const { DatabaseSync } = await import('node:sqlite'), db = new DatabaseSync(':memory:');
  const queries = [];
  const DB = { prepare(sql) {
    const st = { args: [], bind(...args) { st.args = args; return st; }, query() {
      queries.push(sql); let args = st.args;
      const text = /\?\d/.test(sql) ? sql.replace(/\?\d+/g, '?') : sql;
      if (/\?\d/.test(sql)) args = [...sql.matchAll(/\?(\d+)/g)].map(m => st.args[Number(m[1]) - 1]);
      return [db.prepare(text), args];
    }, async all() { const [q,a] = st.query(); return {results:q.all(...a)}; },
    async first() { const [q,a] = st.query(); return q.get(...a); },
    async run() { const [q,a] = st.query(); return q.run(...a); } }; return st;
  }, async batch(stmts) { for (const st of stmts) await st.run(); } };
  try {
    db.exec(fs.readFileSync(root+'migrations/0001_init.sql','utf8'));
    const day = '2040-01-09', older = '2039-07-01', now = new Date('2040-01-10T12:00:00Z');
    const put = (sql,...args) => db.prepare(sql).run(...args);
    for (const [metric,value] of [['active_kcal',100],['resting_kcal',1500],['resting_hr',60],['sleep_asleep_min',400]])
      put('INSERT INTO samples(metric,ts,day,source,qty) VALUES(?,?,?,?,?)',metric,day,day,'fsync',value);
    put('INSERT INTO samples(metric,ts,day,source,qty) VALUES(?,?,?,?,?)','sleep_asleep_min',older,older,'fsync',400);
    const workout = (id,source,bundle,max) => put('INSERT INTO workouts(id,day,source,type,start,end,duration_s,kcal,avg_hr,max_hr,raw) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
      id,day,source,'Esempio · camminata',day+'T10:00:00Z',day+'T10:30:00Z',1800,100,120,max,JSON.stringify({example:true,source_bundle:bundle}));
    workout('example:apple','fsync','com.apple.health.example',160);
    workout('example:thirdparty','thirdparty',null,220);
    workout('example:thirdparty-health','fsync','com.example.thirdparty',220);
    workout('example:noop','fsync','com.example.noop',220);
    for (const [id,d,src] of [['example:apple',day,'com.apple.health.example'],['example:thirdparty',day,'com.example.thirdparty'],['example:noop',older,'com.example.noop']])
      put('INSERT INTO hk_events(id,day,source,type,value,start,end,extra) VALUES(?,?,?,?,?,?,?,?)',id,d,'fsync','sleep_analysis','asleep_core',d+'T00:00:00Z',d+'T06:00:00Z',JSON.stringify({example:true,source:src}));
    for (const [source,value] of [['fsync',40],['thirdparty',90]])
      put('INSERT INTO hk_quantity(type,agg,start,day,source,value) VALUES(?,?,?,?,?,?)','heart_rate_variability_sdnn','avg',day,day,source,value);
    const data = await S.data({DB},now);
    assert.deepEqual(data.workouts.map(w=>w.id),['example:apple']); assert.equal('strain' in data.workouts[0],false);
    assert.equal(data.quality.hrmax_measured.value,160); assert.equal(data.quality.hrmax_measured.from,'allenamento Apple Watch');
    assert.equal(data.hk['heart_rate_variability_sdnn.avg'][0][1],40);
    assert.equal(data.days.find(d=>d.day===day).sleep_asleep_min,360);
    assert.equal(data.days.find(d=>d.day===older).sleep_asleep_min,undefined);
    const single = await (await S.dayData({DB},day)).json();
    assert.equal('thirdparty' in single,false); assert.deepEqual(single.workouts.map(w=>w.id),['example:apple']); assert.equal(single.day.sleep_asleep_min,360);
    assert.equal((await (await S.dayData({DB},older)).json()).day.sleep_asleep_min,undefined);
    await S.dataCached({DB}); // validates the cache SQL as well as the payload queries
    assert.ok(queries.every(sql=>! /\bFROM thirdparty_/.test(sql)));
    assert.equal(db.prepare("SELECT count(*) n FROM workouts WHERE source='thirdparty'").get().n,1);
  } finally { db.close(); }
});

console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
