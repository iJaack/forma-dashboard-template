// Worker serving embedded, data-free assets and an authenticated D1 API.
// Deployment settings and secrets are documented in README.md.
const STATIC = __STATIC__;
const SEC = __SEC__;
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...SEC, 'content-type': 'application/json; charset=utf-8' } });
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const textVar = (v, max = 256) => typeof v === 'string' && v.trim().length <= max ? v.trim() : '';
const validTz = v => {
  if (typeof v !== 'string' || v.length > 100 || !/^[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+)*$/.test(v)) return null;
  try { new Intl.DateTimeFormat('en-CA', { timeZone: v }); return v; } catch { return null; }
};
const DEFAULT_TARGETS = { estimates: {}, protein: { base: 100, threshold: 2200, slope: 0.1, cap: 140 }, fat: { lo: 0.25, hi: 0.30 }, fiber: 30 };
const DAY_TYPE_RE = /^[a-z][a-z0-9_-]{0,39}$/;
function parseTargets(input) {
  let v = input;
  if (typeof input === 'string') { try { v = JSON.parse(input); } catch { v = null; } }
  const out = structuredClone(DEFAULT_TARGETS);
  if (!object(v)) return out;
  const number = (n, lo, hi) => typeof n === 'number' && Number.isFinite(n) && n >= lo && n <= hi;
  if (object(v.estimates)) for (const [k, n] of Object.entries(v.estimates)) if (DAY_TYPE_RE.test(k) && number(n, 1, 20000)) out.estimates[k] = n;
  if (object(v.protein)) for (const [k, hi] of Object.entries({ base: 1000, threshold: 20000, slope: 10, cap: 1000 })) if (number(v.protein[k], 0, hi)) out.protein[k] = v.protein[k];
  if (out.protein.cap < out.protein.base) out.protein = { ...DEFAULT_TARGETS.protein };
  if (object(v.fat)) for (const k of ['lo', 'hi']) if (number(v.fat[k], 0, 1)) out.fat[k] = v.fat[k];
  if (out.fat.hi < out.fat.lo) out.fat = { ...DEFAULT_TARGETS.fat };
  if (number(v.fiber, 0, 200)) out.fiber = v.fiber;
  return out;
}
function config(env = {}) {
  const types = textVar(env.DAY_TYPES, 2000).split(',').map(s => s.trim()).filter(s => DAY_TYPE_RE.test(s));
  return { tz: validTz(env.DEFAULT_TZ) || 'UTC', targets: parseTargets(env.TARGETS), dayTypes: types.length ? [...new Set(types)] : ['riposo', 'allenamento'] };
}
function db(env) {
  const binding = textVar(env.D1_BINDING, 64);
  return env[/^[A-Za-z_][A-Za-z0-9_]*$/.test(binding) ? binding : 'DB'];
}
const siteLabel = (req, env) => textVar(env.SITE_LABEL, 200) || new URL(req.url).host;
const accessTeam = env => {
  const team = textVar(env.ACCESS_TEAM);
  return /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+cloudflareaccess\.com$/i.test(team) ? team : null;
};
const accessReady = (env, kind) => !!(accessTeam(env) && textVar(env['ACCESS_AUD_' + kind]) && textVar(env[kind === 'MAIN' ? 'ALLOWED_EMAIL' : 'INGEST_CLIENT_ID']));
let CERTS = null, CERTS_AT = 0, CERTS_TEAM = null;
const b64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0));
async function verifyAccess(req, env, aud) {
  if (!accessTeam(env) || !textVar(aud)) return null;
  const tok = req.headers.get('cf-access-jwt-assertion'); if (!tok) return null;
  const [h, p, s] = tok.split('.'); if (!s) return null;
  const head = JSON.parse(new TextDecoder().decode(b64u(h))); const pl = JSON.parse(new TextDecoder().decode(b64u(p)));
  if (head.alg !== 'RS256' || typeof pl.exp !== 'number' || !Number.isFinite(pl.exp)) return null;
  if (!CERTS || CERTS_TEAM !== env.ACCESS_TEAM || Date.now() - CERTS_AT > 3600000) { CERTS = (await (await fetch(`https://${env.ACCESS_TEAM}/cdn-cgi/access/certs`)).json()).keys; CERTS_AT = Date.now(); CERTS_TEAM = env.ACCESS_TEAM; }
  const jwk = CERTS.find(k => k.kid === head.kid); if (!jwk) return null;
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64u(s), new TextEncoder().encode(h + '.' + p));
  if (!ok || pl.exp * 1000 < Date.now() || pl.iss !== `https://${env.ACCESS_TEAM}`) return null;
  const auds = Array.isArray(pl.aud) ? pl.aud : [pl.aud]; if (!auds.includes(aud)) return null;
  return pl;
}
function safeEq(a, b) { if (!a || !b || a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; }
// ---- Apple Health normalisation ----
const MAP = { active_energy: 'active_kcal', active_energy_burned: 'active_kcal', basal_energy_burned: 'resting_kcal', resting_energy: 'resting_kcal', step_count: 'steps', steps: 'steps', apple_exercise_time: 'exercise_min', exercise_time: 'exercise_min', walking_running_distance: 'distance_km', distance_walking_running: 'distance_km', apple_stand_hour: 'stand_h', stand_hours: 'stand_h', resting_heart_rate: 'resting_hr', heart_rate_variability: 'hrv_ms', heart_rate_variability_sdnn: 'hrv_ms', weight_body_mass: 'weight_kg', body_mass: 'weight_kg', weight: 'weight_kg', dietary_energy: 'dietary_kcal' };
const SLEEP_M = ['sleep_asleep_min', 'sleep_inbed_min', 'sleep_awake_min', 'sleep_core_min', 'sleep_deep_min', 'sleep_rem_min'];
const CANON = new Set(['active_kcal', 'resting_kcal', 'steps', 'exercise_min', 'distance_km', 'stand_h', 'resting_hr', 'hrv_ms', 'weight_kg', 'dietary_kcal', ...SLEEP_M]);
const DAY_RE = /^\d{4}-\d\d-\d\d$/;
function reqTz(u, env = {}) { return validTz(u.searchParams.get('tz')) || config(env).tz; }
function dayIn(tz, d = new Date()) { return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(d); }
const fin = v => (v == null || v === '' || !isFinite(Number(v)) ? null : Number(v));
function conv(metric, qty, unit) {
  if (qty == null || isNaN(qty)) return null; const u = (unit || '').toLowerCase(); qty = Number(qty);
  if (metric.endsWith('_kcal') && (u === 'kj' || u === 'kilojoule')) return qty / 4.184;
  if (metric === 'distance_km' && (u === 'mi' || u === 'mile')) return qty * 1.609344;
  if (metric === 'distance_km' && u === 'm') return qty / 1000;
  if (metric === 'weight_kg' && (u === 'lb' || u === 'lbs')) return qty * 0.45359237;
  if (metric === 'exercise_min' && (u === 's' || u === 'sec')) return qty / 60;
  return qty;
}
const dayOf = s => String(s).slice(0, 10);
const num = v => (v == null ? null : typeof v === 'object' ? (v.qty ?? v.avg ?? null) : Number(v));
function parseV1(body, source) {
  const samples = [], workouts = [], deleted = [];
  if (body && body.format === 'forma-sync/1') { // native iOS app "Forma Sync": daily aggregates computed on-device
    for (const d of (Array.isArray(body.daily) ? body.daily : []).slice(0, 400)) {
      if (!d || !DAY_RE.test(d.date)) continue;
      for (const [k, v] of Object.entries(d.metrics || {})) { const q = fin(v); if (CANON.has(k) && q != null) samples.push([k, d.date + 'T00:00:00', d.date, q, null]); }
    }
    for (const w of (Array.isArray(body.workouts) ? body.workouts : []).slice(0, 500)) {
      if (!w || !w.id || !w.start) continue;
      workouts.push(['hk:' + String(w.id).slice(0, 64), DAY_RE.test(w.day) ? w.day : dayOf(w.start), w.type ? String(w.type).slice(0, 60) : null, String(w.start), w.end ? String(w.end) : null, fin(w.duration_min) != null ? fin(w.duration_min) * 60 : null, fin(w.distance_km), fin(w.kcal), fin(w.avg_hr), fin(w.max_hr)]);
    }
    for (const id of (Array.isArray(body.deleted_workouts) ? body.deleted_workouts : []).slice(0, 1000)) if (id) deleted.push('hk:' + String(id).slice(0, 64));
  } else if (body && body.data && (body.data.metrics || body.data.workouts)) { // Health Auto Export REST
    for (const m of body.data.metrics || []) {
      const key = MAP[m.name] || (CANON.has(m.name) ? m.name : null); if (!key) continue;
      for (const d of m.data || []) { const q = conv(key, d.qty ?? d.Avg ?? d.avg, m.units); if (q == null || !d.date) continue; samples.push([key, String(d.date), dayOf(d.date), q, m.units || null]); }
    }
    for (const w of body.data.workouts || []) {
      const start = w.start, end = w.end; if (!start) continue;
      const dist = w.distance ? conv('distance_km', num(w.distance), w.distance.units) : null;
      const kcalObj = w.activeEnergyBurned || w.activeEnergy; const kcal = kcalObj ? conv('x_kcal', Array.isArray(kcalObj) ? kcalObj.reduce((a, b) => a + (b.qty || 0), 0) : num(kcalObj), kcalObj.units) : null;
      const hr = w.heartRate || {}; const avg = num(w.avgHeartRate) ?? num(hr.avg); const max = num(w.maxHeartRate) ?? num(hr.max);
      const dur = w.duration != null ? Number(w.duration) : (Date.parse(end) - Date.parse(start)) / 1000;
      workouts.push([String(w.id || `${w.name}-${start}`), dayOf(start), w.name || null, start, end || null, dur, dist, kcal, avg, max]);
    }
  } else if (body && body.date) { // native Shortcut payload
    const ts = body.date + 'T00:00:00';
    for (const [k, v] of Object.entries(body.metrics || {})) { const key = MAP[k] || (CANON.has(k) ? k : null); if (!key || v == null || v === '') continue; const q = Number(String(v).replace(',', '.')); if (!isNaN(q)) samples.push([key, ts, body.date, q, null]); }
    for (const w of body.workouts || []) workouts.push([String(w.id || `${w.type}-${w.start}`), dayOf(w.start || body.date), w.type || null, w.start || null, w.end || null, w.duration_min != null ? w.duration_min * 60 : null, w.distance_km ?? null, w.kcal ?? null, w.avg_hr ?? null, w.max_hr ?? null]);
  } else return null;
  return { samples: samples.map(s => [s[0], s[1], source, s[2], s[3], s[4]]), workouts: workouts.map(w => [w[0], source, ...w.slice(1)]), deleted };
}

// ---- forma-sync/2: generic HealthKit payload ----
const TYPE_RE = /^[a-z0-9_]{1,64}$/, AGGS = new Set(['sum', 'avg', 'min', 'max', 'last', 'count', 'sample']);
const V2_CANON = { 'active_energy_burned.sum': 'active_kcal', 'basal_energy_burned.sum': 'resting_kcal', 'step_count.sum': 'steps', 'apple_exercise_time.sum': 'exercise_min', 'distance_walking_running.sum': 'distance_km', 'resting_heart_rate.avg': 'resting_hr', 'heart_rate_variability_sdnn.avg': 'hrv_ms', 'body_mass.last': 'weight_kg', 'dietary_energy_consumed.sum': 'dietary_kcal', 'apple_stand_hour.count': 'stand_h' };
for (const m of SLEEP_M) V2_CANON[m + '.sum'] = m;
const str = (v, n) => (v == null ? null : String(v).slice(0, n));
function parseV2(body, source) {
  const out = { samples: [], workouts: [], deleted: [], quantities: [], events: [], deletedEvents: [] };
  for (const q of (Array.isArray(body.quantities) ? body.quantities : []).slice(0, 5000)) {
    if (!q || !TYPE_RE.test(q.type || '')) continue; const agg = AGGS.has(q.agg) ? q.agg : 'sample'; const v = fin(q.value); if (v == null) continue;
    const start = DAY_RE.test(q.date) ? q.date : str(q.start, 40); if (!start) continue;
    const day = DAY_RE.test(q.date) ? q.date : DAY_RE.test(q.day) ? q.day : dayOf(start);
    out.quantities.push([q.type, agg, start, DAY_RE.test(q.date) ? null : str(q.end, 40), day, source, v, str(q.unit, 24)]);
    const canon = DAY_RE.test(q.date) && V2_CANON[q.type + '.' + agg]; if (canon) out.samples.push([canon, q.date + 'T00:00:00', source, q.date, v, null]);
  }
  for (const e of (Array.isArray(body.events) ? body.events : []).slice(0, 5000)) {
    if (!e || !e.id || !TYPE_RE.test(e.type || '') || !e.start) continue;
    out.events.push([String(e.id).slice(0, 80), source, e.type, str(e.value, 60), str(e.start, 40), str(e.end, 40), DAY_RE.test(e.day) ? e.day : dayOf(e.end || e.start), e.extra ? JSON.stringify(e.extra).slice(0, 4000) : null]);
  }
  for (const w of (Array.isArray(body.workouts) ? body.workouts : []).slice(0, 500)) {
    if (!w || !w.id || !w.start) continue;
    const extra = { ...(w.extra && typeof w.extra === 'object' ? w.extra : {}) };
    for (const k of ['min_hr', 'swim_strokes', 'effort_estimated', 'indoor', 'activity']) if (w[k] != null) extra[k] = w[k];
    for (const k of ['source_bundle', 'source_name']) if (typeof w[k] === 'string') extra[k] = w[k].slice(0, 120);
    out.workouts.push(['hk:' + String(w.id).slice(0, 64), source, DAY_RE.test(w.day) ? w.day : dayOf(w.start), str(w.type, 60), String(w.start), w.end ? String(w.end) : null, fin(w.duration_min) != null ? fin(w.duration_min) * 60 : null, fin(w.distance_km), fin(w.kcal), fin(w.avg_hr), fin(w.max_hr), fin(w.elevation_m), fin(w.effort), JSON.stringify(extra).slice(0, 8000)]);
  }
  for (const id of (Array.isArray(body.deleted_workouts) ? body.deleted_workouts : []).slice(0, 2000)) if (id) out.deleted.push('hk:' + String(id).slice(0, 64));
  for (const id of (Array.isArray(body.deleted_events) ? body.deleted_events : []).slice(0, 5000)) if (id) out.deletedEvents.push(String(id).slice(0, 80));
  return out;
}
function parseHealth(body, source) {
  if (body && body.format === 'forma-sync/2') return parseV2(body, source);
  const p = parseV1(body, source); if (!p) return null;
  return { samples: p.samples, workouts: p.workouts.map(w => [...w, null, null, null]), deleted: p.deleted, quantities: [], events: [], deletedEvents: [] };
}
const INGEST_SOURCE = (body, qsrc) => (qsrc === 'test' || body.source === 'test' ? 'test' : /^forma-sync\//.test(body.format || '') ? 'fsync' : (body.data ? 'hae' : 'shortcut'));
async function ingestAuth(req, env) {
  if (typeof env.INGEST_SECRET !== 'string' || !env.INGEST_SECRET.trim()) return json({ error: 'ingest_not_configured' }, 503);
  if (!safeEq(req.headers.get('authorization') || '', 'Bearer ' + env.INGEST_SECRET)) return json({ error: 'unauthorized' }, 401);
  if (accessReady(env, 'INGEST')) {
    const jwt = await verifyAccess(req, env, env.ACCESS_AUD_INGEST).catch(() => null);
    if (!jwt || jwt.common_name !== env.INGEST_CLIENT_ID) return json({ error: 'forbidden' }, 403);
  }
  return null;
}
async function invalidateData(env) { await db(env).prepare("DELETE FROM kv WHERE k IN ('data_cache','data_cache_ver')").run(); }
async function runBatches(env, st, size = 200) {
  // Invalidate even when a later batch fails: earlier batches may have committed.
  try { for (let i = 0; i < st.length; i += size) await db(env).batch(st.slice(i, i + size)); }
  finally { await invalidateData(env); }
}
async function ingest(req, env, u) {
  const denied = await ingestAuth(req, env); if (denied) return denied;
  const qsrc = u.searchParams.get('source');
  if (req.method === 'DELETE') {
    if (qsrc !== 'test') return json({ error: 'only source=test can be deleted' }, 400);
    const del = {}; for (const t of ['samples', 'workouts', 'hk_quantity', 'hk_events', 'meals']) del[t] = (await db(env).prepare(`DELETE FROM ${t} WHERE source='test'`).run()).meta.changes;
    del.meal_days = (await db(env).prepare("DELETE FROM meal_days WHERE source='test'").run()).meta.changes;
    await invalidateData(env);
    return json({ ok: true, deleted: del });
  }
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  if (Number(req.headers.get('content-length') || 0) > 20e6) return json({ error: 'too_large' }, 413);
  let body; try { body = await req.json(); } catch { return json({ error: 'bad_json' }, 400); }
  if (!object(body)) return json({ error: 'bad_body' }, 400);
  const source = INGEST_SOURCE(body, qsrc);
  const p = parseHealth(body, source); if (!p) return json({ error: 'unknown_format' }, 422);
  const st = [];
  for (const s of p.samples) st.push(db(env).prepare("INSERT INTO samples(metric,ts,source,day,qty,unit,updated_at) VALUES(?,?,?,?,?,?,datetime('now')) ON CONFLICT(metric,ts,source) DO UPDATE SET qty=excluded.qty,day=excluded.day,unit=excluded.unit,updated_at=excluded.updated_at").bind(...s));
  for (const w of p.workouts) st.push(db(env).prepare("INSERT INTO workouts(id,source,day,type,start,end,duration_s,distance_km,kcal,avg_hr,max_hr,elevation_m,effort,raw,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now')) ON CONFLICT(id) DO UPDATE SET source=excluded.source,day=excluded.day,type=excluded.type,start=excluded.start,end=excluded.end,duration_s=excluded.duration_s,distance_km=excluded.distance_km,kcal=excluded.kcal,avg_hr=excluded.avg_hr,max_hr=excluded.max_hr,elevation_m=excluded.elevation_m,effort=excluded.effort,raw=excluded.raw,updated_at=excluded.updated_at").bind(...w));
  for (const q of p.quantities) st.push(db(env).prepare("INSERT INTO hk_quantity(type,agg,start,end,day,source,value,unit,updated_at) VALUES(?,?,?,?,?,?,?,?,datetime('now')) ON CONFLICT(type,agg,start,source) DO UPDATE SET end=excluded.end,day=excluded.day,value=excluded.value,unit=excluded.unit,updated_at=excluded.updated_at").bind(...q));
  for (const e of p.events) st.push(db(env).prepare("INSERT INTO hk_events(id,source,type,value,start,end,day,extra,updated_at) VALUES(?,?,?,?,?,?,?,?,datetime('now')) ON CONFLICT(id) DO UPDATE SET source=excluded.source,type=excluded.type,value=excluded.value,start=excluded.start,end=excluded.end,day=excluded.day,extra=excluded.extra,updated_at=excluded.updated_at").bind(...e));
  for (const id of p.deleted) st.push(db(env).prepare('DELETE FROM workouts WHERE id=? AND source=?').bind(id, source));
  for (const id of p.deletedEvents) st.push(db(env).prepare('DELETE FROM hk_events WHERE id=? AND source=?').bind(id, source));
  await runBatches(env, st);
  const counts = { samples: p.samples.length, quantities: p.quantities.length, events: p.events.length, workouts: p.workouts.length, deleted: p.deleted.length + p.deletedEvents.length };
  const days = [...new Set(p.samples.map(s => s[3]).concat(p.quantities.map(q => q[4]), p.workouts.map(w => w[2])))].sort();
  if (!st.length) return json({ ok: true, source, ...counts, days: [] });
  if (source !== 'test') await db(env).prepare("INSERT INTO kv(k,v,updated_at) VALUES('health_last_ingest',?,datetime('now')) ON CONFLICT(k) DO UPDATE SET v=excluded.v,updated_at=excluded.updated_at").bind(JSON.stringify({ at: new Date().toISOString(), source, format: body.format || null, ...counts, first_day: days[0] || null, last_day: days[days.length - 1] || null })).run();
  return json({ ok: true, source, ...counts, days: days.length > 40 ? [days[0], days[days.length - 1]] : days });
}
// optional nutrition detail per entry. items: [{f:food_key,g:grams} | {s:supplement_key,n:units|g:grams} | {x:'name',why:'reason'}];
// nutrients: explicit per-entry values (e.g. from a label) keyed like NUTRIENT_KEYS. Both stored as JSON text; invalid parts are dropped with an error.
const NUTRIENT_KEYS = new Set(['kcal','protein','carbs','fat','fiber','sugars','satfat','sodium','potassium','calcium','iron','magnesium','zinc','selenium','vitA','vitB1','vitB2','vitB3','vitB5','vitB6','vitB12','folate','vitC','vitD','vitE','vitK','epa','dha']);
const KEY_RE = /^[a-z0-9_]{1,40}$/;
function mealItems(v, errors, i) {
  if (v == null) return null; if (!Array.isArray(v)) { errors.push(`entries[${i}]: items`); return null; }
  const out = [];
  for (const it of v.slice(0, 40)) {
    if (!it || typeof it !== 'object') continue; const o = {};
    if (typeof it.f === 'string' && KEY_RE.test(it.f)) o.f = it.f; else if (typeof it.s === 'string' && KEY_RE.test(it.s)) o.s = it.s; else if (typeof it.x === 'string' && it.x.trim()) o.x = it.x.trim().slice(0, 120); else { errors.push(`entries[${i}]: item`); continue; }
    const g = fin(it.g), n = fin(it.n); if (g != null && g >= 0 && g <= 5000) o.g = g; if (n != null && n >= 0 && n <= 50) o.n = n;
    if (typeof it.why === 'string') o.why = it.why.slice(0, 120); if (typeof it.label === 'string') o.label = it.label.slice(0, 120);
    if ((o.f || o.s) && o.g == null && o.n == null) { errors.push(`entries[${i}]: item qty`); continue; }
    out.push(o);
  }
  return JSON.stringify(out);
}
function mealNutrients(v, errors, i) {
  if (v == null) return null; if (typeof v !== 'object' || Array.isArray(v)) { errors.push(`entries[${i}]: nutrients`); return null; }
  const o = {}; for (const [k, x] of Object.entries(v)) { const q = fin(x); if (NUTRIENT_KEYS.has(k) && q != null && q >= 0) o[k] = q; }
  return JSON.stringify(o);
}
function jparse(t) { if (t == null) return null; try { return JSON.parse(t); } catch { return null; } }
function mealOut(r) { return { ...r, items: jparse(r.items), nutrients: jparse(r.nutrients) }; }
// ---- meal diary (written via the authenticated ingest API) ----
const MEAL_KEYS = ['colazione', 'spuntino', 'pranzo', 'merenda', 'cena', 'altro', 'giornata'];
async function meals(req, env, u) {
  const denied = await ingestAuth(req, env); if (denied) return denied;
  const qsrc = u.searchParams.get('source') === 'test' ? 'test' : 'forma';
  if (req.method === 'GET') {
    const day = u.searchParams.get('day'); if (!DAY_RE.test(day || '')) return json({ error: 'day=YYYY-MM-DD required' }, 400);
    const [entries, d, t] = await Promise.all([db(env).prepare('SELECT id,day,meal,time,title,kcal,protein,carbs,fat,notes,items,nutrients,source FROM meals WHERE day=? ORDER BY time, meal').bind(day).all(), db(env).prepare('SELECT * FROM meal_days WHERE day=?').bind(day).first(), db(env).prepare("SELECT v FROM kv WHERE k='meal_targets'").first()]);
    return json({ day, entries: entries.results.map(mealOut), summary: d || null, targets: t ? jparse(t.v) : null });
  }
  if (req.method === 'DELETE') {
    if (u.searchParams.get('source') === 'test') {
      const a = await db(env).prepare("DELETE FROM meals WHERE source='test'").run();
      const b = await db(env).prepare("DELETE FROM meal_days WHERE source='test'").run();
      await invalidateData(env);
      return json({ ok: true, deleted: { meals: a.meta.changes, days: b.meta.changes } });
    }
    const id = u.searchParams.get('id'), day = u.searchParams.get('day');
    if (id) { const a = await db(env).prepare('DELETE FROM meals WHERE id=?').bind(id).run(); await invalidateData(env); return json({ ok: true, deleted: a.meta.changes }); }
    if (DAY_RE.test(day || '')) { const a = await db(env).prepare('DELETE FROM meals WHERE day=?').bind(day).run(); const b = await db(env).prepare('DELETE FROM meal_days WHERE day=?').bind(day).run(); await invalidateData(env); return json({ ok: true, deleted: { meals: a.meta.changes, days: b.meta.changes } }); }
    return json({ error: 'id or day required' }, 400);
  }
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  let body; try { body = await req.json(); } catch { return json({ error: 'bad_json' }, 400); }
  if (!object(body)) return json({ error: 'bad_body' }, 400);
  const src = body.source === 'test' ? 'test' : qsrc; const st = []; const errors = [];
  for (const [i, e] of (Array.isArray(body.entries) ? body.entries : []).slice(0, 200).entries()) {
    if (!e || !DAY_RE.test(e.day || '')) { errors.push(`entries[${i}]: day`); continue; }
    const meal = MEAL_KEYS.includes(String(e.meal || '').toLowerCase()) ? String(e.meal).toLowerCase() : 'altro';
    const id = String(e.id || `${e.day}:${meal}:${String(e.title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}`).slice(0, 120);
    const items = mealItems(e.items, errors, i), nutr = mealNutrients(e.nutrients, errors, i);
    // items / nutrients are optional: when a client omits them the stored values are kept (COALESCE), so older clients never wipe them
    st.push(db(env).prepare("INSERT INTO meals(id,day,meal,time,title,kcal,protein,carbs,fat,notes,items,nutrients,source,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now')) ON CONFLICT(id) DO UPDATE SET day=excluded.day,meal=excluded.meal,time=excluded.time,title=excluded.title,kcal=excluded.kcal,protein=excluded.protein,carbs=excluded.carbs,fat=excluded.fat,notes=excluded.notes,items=COALESCE(excluded.items,meals.items),nutrients=COALESCE(excluded.nutrients,meals.nutrients),source=excluded.source,updated_at=excluded.updated_at")
      .bind(id, e.day, meal, /^\d\d:\d\d$/.test(e.time || '') ? e.time : null, str(e.title, 200), fin(e.kcal), fin(e.protein), fin(e.carbs), fin(e.fat), str(e.notes, 1000), items, nutr, src));
  }
  for (const d of (Array.isArray(body.days) ? body.days : []).slice(0, 100)) {
    if (!d || !DAY_RE.test(d.day || '')) { errors.push('days: day'); continue; }
    st.push(db(env).prepare("INSERT INTO meal_days(day,day_type,kcal,kcal_min,kcal_max,protein,protein_min,protein_max,notes,source,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,datetime('now')) ON CONFLICT(day) DO UPDATE SET day_type=excluded.day_type,kcal=excluded.kcal,kcal_min=excluded.kcal_min,kcal_max=excluded.kcal_max,protein=excluded.protein,protein_min=excluded.protein_min,protein_max=excluded.protein_max,notes=excluded.notes,source=excluded.source,updated_at=excluded.updated_at")
      .bind(d.day, config(env).dayTypes.includes(d.day_type) ? d.day_type : null, fin(d.kcal), fin(d.kcal_min), fin(d.kcal_max), fin(d.protein), fin(d.protein_min), fin(d.protein_max), str(d.notes, 1000), src));
  }
  // supplement plan (personal, so it lives in D1 kv, not in the repo): [{s:supplement_key,n|g,label,when}]
  if (Array.isArray(body.supp_plan)) st.push(db(env).prepare("INSERT INTO kv(k,v,updated_at) VALUES('supp_plan',?,datetime('now')) ON CONFLICT(k) DO UPDATE SET v=excluded.v,updated_at=excluded.updated_at").bind(JSON.stringify(body.supp_plan.slice(0, 20)).slice(0, 4000)));
  if (object(body.targets)) st.push(db(env).prepare("INSERT INTO kv(k,v,updated_at) VALUES('meal_targets',?,datetime('now')) ON CONFLICT(k) DO UPDATE SET v=excluded.v,updated_at=excluded.updated_at").bind(JSON.stringify(body.targets)));
  if (st.length) await runBatches(env, st);
  return json({ ok: errors.length === 0, written: st.length, errors });
}
const SUM = new Set(['active_kcal', 'resting_kcal', 'steps', 'exercise_min', 'distance_km', 'stand_h', 'dietary_kcal', ...SLEEP_M]);
const RANK = { fsync: 3, hae: 2, shortcut: 1 };
// Series served to the dashboard (whitelist keeps /api/data small on the Workers Free CPU budget);
// days older than 120 are averaged per ISO week. Everything else stays in D1 untouched.
const HK_WL = ['vo2_max.avg', 'resting_heart_rate.avg', 'heart_rate_variability_sdnn.avg', 'respiratory_rate.avg', 'oxygen_saturation.avg', 'apple_sleeping_wrist_temperature.avg', 'walking_heart_rate_average.avg', 'heart_rate_recovery_one_minute.avg', 'distance_walking_running.sum', 'step_count.sum', 'flights_climbed.sum', 'time_in_daylight.sum', 'body_mass.last', 'body_fat_percentage.last', 'lean_body_mass.last'];
// ---- Apple sleep: rebuild nights from the raw stage segments, never trust summed minutes ----
// Rebuild Apple Health stage segments on a timeline so each minute counts once.
const STAGE_PRI = { asleep_deep: 6, asleep_rem: 5, asleep_core: 4, asleep_unspecified: 3, awake: 2, in_bed: 1 };
const SLEEP_KEYS = ['sleep_asleep_min', 'sleep_inbed_min', 'sleep_awake_min', 'sleep_core_min', 'sleep_deep_min', 'sleep_rem_min'];
function nightFromSegments(segs) {
  const pts = [...new Set(segs.flatMap(s => [s.a, s.b]))].sort((x, y) => x - y); const m = { 6: 0, 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }; let span = 0;
  const sorted = segs.slice().sort((x, y) => x.a - y.a);
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], b = pts[i + 1]; let best = 0;
    for (const s of sorted) { if (s.a >= b) break; if (s.b > a && s.p > best) best = s.p; }
    if (best) { const min = (b - a) / 60000; m[best] += min; span += min; }
  }
  const asleep = m[6] + m[5] + m[4] + m[3];
  return { sleep_asleep_min: Math.round(asleep), sleep_inbed_min: Math.round(Math.max(span, asleep + m[2])), sleep_awake_min: Math.round(m[2]), sleep_core_min: Math.round(m[4]), sleep_deep_min: Math.round(m[6]), sleep_rem_min: Math.round(m[5]) };
}
function srcRank(src, segs) { return (/^com\.apple\.health/.test(src || '') ? 3e6 : 0) + segs.filter(s => s.p >= 4 && s.p <= 6).length; }
function fixSleep(days, events) {
  const byDay = Object.fromEntries(days.map(d => [d.day, d])); const info = { rebuilt: 0, dropped: 0, sources: {} };
  const nights = {};
  for (const e of events) { const p = STAGE_PRI[e.value]; const a = Date.parse(e.start), b = Date.parse(e.end); if (!p || !(b > a)) continue; ((nights[e.day] ||= {})[e.src || '?'] ||= []).push({ a, b, p }); }
  for (const [day, bySrc0] of Object.entries(nights)) {
    // Third-party sleep exports have no Apple stages to show.
    const bySrc = Object.fromEntries(Object.entries(bySrc0).filter(([k]) => /^com\.apple\./.test(k)));
    if (!Object.keys(bySrc).length) { const d = byDay[day]; if (d) { for (const k of SLEEP_KEYS) delete d[k]; d.sleep_dropped = 'untrusted_source'; info.dropped++; d.sleep_fixed = 1; } info.untrusted = (info.untrusted || 0) + 1; continue; }
    const [src, segs] = Object.entries(bySrc).sort((x, y) => srcRank(y[0], y[1]) - srcRank(x[0], x[1]))[0];
    const n = nightFromSegments(segs);
    if (!(n.sleep_asleep_min > 0) || n.sleep_asleep_min > 16 * 60) { const d = byDay[day]; if (d) { for (const k of SLEEP_KEYS) delete d[k]; d.sleep_fixed = 1; d.sleep_dropped = 1; info.dropped++; } continue; }
    const d = byDay[day] || (byDay[day] = { day }, days.push(byDay[day]), byDay[day]);
    for (const k of SLEEP_KEYS) delete d[k]; for (const k of SLEEP_KEYS) if (n[k] > 0) d[k] = n[k];
    d.sleep_src = 'apple'; d.sleep_fixed = 1; info.rebuilt++;
    info.sources[d.sleep_src] = (info.sources[d.sleep_src] || 0) + 1;
  }
  // Older nights only have the minutes computed on the phone: drop the impossible ones instead of showing them.
  for (const d of days) {
    if (d.sleep_fixed || d.sleep_asleep_min == null) continue;
    const st = (d.sleep_core_min || 0) + (d.sleep_deep_min || 0) + (d.sleep_rem_min || 0);
    const bad = (d.sleep_src && d.sleep_src !== 'apple') || d.sleep_asleep_min > 14 * 60 || (d.sleep_inbed_min || 0) > 20 * 60 || st > d.sleep_asleep_min + 30;
    if (bad) { for (const k of SLEEP_KEYS) delete d[k]; d.sleep_dropped = 1; info.dropped++; }
  }
  days.sort((x, y) => (x.day < y.day ? -1 : 1));
  return info;
}
// ---- plausibility + de-duplication applied before anything reaches the dashboard ----
// Drop implausible energy totals and flag incomplete resting-energy coverage.
// A complete day's burn requires both active and resting samples.
const ACTIVE_MAX = 6000, RESTING_MIN_COMPLETE = 1200;
function sanitizeEnergy(days) {
  let dropped = 0;
  for (const d of days) {
    if (d.active_kcal != null && (d.active_kcal < 0 || d.active_kcal > ACTIVE_MAX)) { d.active_kcal_dropped = Math.round(d.active_kcal); delete d.active_kcal; dropped++; }
    if (d.resting_kcal != null && (d.resting_kcal < 0 || d.resting_kcal > 4000)) { delete d.resting_kcal; dropped++; }
    d.burn_complete = d.active_kcal != null && d.resting_kcal != null && d.resting_kcal >= RESTING_MIN_COMPLETE ? 1 : 0;
  }
  return dropped;
}
// Apple Health exports may repeat the same session; keep the best Apple copy.
// A day's active energy cannot be lower than the active kcal of its (de-duplicated) workouts: if it is, the day's
// total is incomplete (e.g. a partial resync) and the burn is not used for balance/averages.
function checkActiveVsWorkouts(days, ws) {
  const wk = {}; for (const w of ws) if (w.kcal > 0) wk[w.day] = (wk[w.day] || 0) + w.kcal; let n = 0;
  for (const d of days) if (d.active_kcal != null && wk[d.day] > 100 && d.active_kcal < 0.8 * wk[d.day]) { d.active_inconsistent = Math.round(wk[d.day]); d.burn_complete = 0; n++; }
  return n;
}
// Accept legacy Health exports without bundle metadata; exclude identified third-party copies.
const appleWorkout = w => ['fsync', 'hae', 'shortcut'].includes(w.source) && (!w.src_bundle || /^com\.apple\./.test(w.src_bundle));
function dedupeWorkouts(ws) {
  const score = w => (/^com\.apple\.health/.test(w.src_bundle || '') ? 50 : 0) + (w.avg_hr != null ? 10 : 0) + (w.distance_km != null ? 5 : 0) + (w.kcal != null ? 2 : 0) + (w.duration_s || 0) / 1e6;
  const iv = w => { const s = Date.parse(w.start); return [s, w.end ? Date.parse(w.end) : s + (w.duration_s || 0) * 1000]; };
  const sorted = ws.filter(w => w.start && appleWorkout(w)).sort((a, b) => Date.parse(a.start) - Date.parse(b.start)); const groups = [];
  for (const w of sorted) {
    const [s, e] = iv(w); let g = null;
    for (let i = groups.length - 1; i >= 0 && i >= groups.length - 6; i--) { const [gs, ge] = groups[i].iv; const ov = Math.min(ge, e) - Math.max(gs, s); if (ov > 0.5 * Math.min(ge - gs, e - s)) { g = groups[i]; break; } }
    if (g) { g.items.push(w); g.iv = [Math.min(g.iv[0], s), Math.max(g.iv[1], e)]; } else groups.push({ items: [w], iv: [s, e] });
  }
  return groups.map(g => { const best = g.items.slice().sort((a, b) => score(b) - score(a))[0];
    const { strain, ...apple } = best;
    return { ...apple, ...(g.items.length > 1 ? { merged: g.items.length } : {}), hr_src: best.avg_hr != null ? 'apple' : null }; })
    .sort((a, b) => (a.start < b.start ? 1 : -1));
}
// Shared UTC windows include ample margin for the client's 365-day local calendar window.
async function data(env, now = new Date()) {
  const since = new Date(now.getTime() - 400 * 86400000).toISOString().slice(0, 10);
  const rows = (await db(env).prepare("SELECT day, metric, source, SUM(qty) s, AVG(qty) a FROM samples WHERE day>=? AND source IN ('fsync','hae','shortcut') GROUP BY day, metric, source").bind(since).all()).results;
  const daily = {};
  for (const r of rows) { const d = (daily[r.day] ||= {}); const v = SUM.has(r.metric) ? r.s : r.a; const cur = d['_' + r.metric]; if (!cur || (RANK[r.source] || 0) >= (RANK[cur] || 0)) { d[r.metric] = v; d['_' + r.metric] = r.source; } }
  const days = Object.keys(daily).sort().map(day => { const o = { day }; for (const [k, v] of Object.entries(daily[day])) if (!k.startsWith('_')) o[k] = v; return o; });
  const q = sql => db(env).prepare(sql).bind(since).all().then(r => r.results);
  const [workouts, kv, hkRows, body, mealRows, mealDays, sleepEv] = await Promise.all([
    q("SELECT id,source,day,type,start,end,duration_s,distance_km,kcal,avg_hr,max_hr,elevation_m,effort,json_extract(raw,'$.source_bundle') src_bundle FROM workouts WHERE day>=? AND source IN ('fsync','hae','shortcut') AND (json_extract(raw,'$.source_bundle') IS NULL OR json_extract(raw,'$.source_bundle') LIKE 'com.apple.%') ORDER BY start DESC"),
    db(env).prepare("SELECT k,v FROM kv WHERE k IN ('health_last_ingest','meal_targets','supp_plan')").all().then(r => r.results),
    db(env).prepare("SELECT type,agg,day,source,value FROM hk_quantity WHERE day>=?1 AND source IN ('fsync','hae','shortcut') AND length(start)=10 AND (type||'.'||agg) IN (" + HK_WL.map(k => "'" + k + "'").join(',') + ") AND (day>=?2 OR agg='last') UNION ALL SELECT type,agg,MIN(day),source,AVG(value) FROM hk_quantity WHERE day>=?1 AND day<?2 AND agg!='last' AND source IN ('fsync','hae','shortcut') AND length(start)=10 AND (type||'.'||agg) IN (" + HK_WL.map(k => "'" + k + "'").join(',') + ") GROUP BY type,agg,source,strftime('%Y-%W',day) ORDER BY 3").bind(since, new Date(now.getTime() - 120 * 86400000).toISOString().slice(0, 10)).all().then(r => r.results),
    db(env).prepare("SELECT day,source,key,value,unit FROM body_comp ORDER BY day").all().then(r => r.results),
    q("SELECT day,meal,time,title,kcal,protein,carbs,fat,notes,items,nutrients FROM meals WHERE day>=? AND source!='test' ORDER BY day,time"),
    q("SELECT day,day_type,kcal,kcal_min,kcal_max,protein,protein_min,protein_max,notes FROM meal_days WHERE day>=? AND source!='test' ORDER BY day"),
    db(env).prepare("SELECT day,value,start,end,json_extract(extra,'$.source') src FROM hk_events WHERE type='sleep_analysis' AND day>=? AND source!='test' ORDER BY start").bind(since).all().then(r => r.results)]);
  const sleepInfo = fixSleep(days, sleepEv);
  const energyDropped = sanitizeEnergy(days);
  const workoutsRaw = workouts.length; const ws = dedupeWorkouts(workouts);
  const inconsistent = checkActiveVsWorkouts(days, ws);
  // HRmax for TRIMP: highest max HR recorded in Apple workouts in the last 12 months, never a default.
  const yAgo = new Date(now.getTime() - 365 * 86400000).toISOString().slice(0, 10); let hrmax = null;
  for (const w of ws) if (w.day >= yAgo && w.max_hr > 120 && w.max_hr < 230 && (!hrmax || w.max_hr > hrmax.value)) hrmax = { value: w.max_hr, day: w.day, from: 'allenamento Apple Watch' };
  const hk = {}; const HKRANK = { fsync: 2 };
  for (const r of hkRows) { const k = r.type + '.' + r.agg; const m = (hk[k] ||= {}); const prev = m[r.day]; if (!prev || (HKRANK[r.source] || 0) >= (HKRANK[prev[1]] || 0)) m[r.day] = [r.value, r.source]; }
  const hkSeries = {}; for (const [k, m] of Object.entries(hk)) hkSeries[k] = Object.keys(m).sort().map(d => [d, m[d][0]]);
  const meta = Object.fromEntries(kv.map(r => [r.k, jparse(r.v)]));
  return { generated_at: now.toISOString(), days, workouts: ws, quality: { energy_days_dropped: energyDropped, energy_days_inconsistent: inconsistent, workouts_raw: workoutsRaw, workouts_merged: workoutsRaw - ws.length, hrmax_measured: hrmax, resting_min_complete: RESTING_MIN_COMPLETE, active_max: ACTIVE_MAX }, hk: hkSeries, body, meals: { entries: mealRows.map(mealOut), days: mealDays, targets: meta.meal_targets || null, supp_plan: meta.supp_plan || null }, sleep_events: [], sleep_fix: sleepInfo, meta };
}
// /api/data caches timezone-neutral data until D1 or the UTC window changes. Append viewer metadata per request
// without parsing the cached JSON, keeping the Function below the Workers Free CPU limit.
const DATA_CODE_VERSION = 'template-v1'; // bump on any change to data()
async function dataCached(env, tz = config(env).tz) {
  const now = new Date(), today = dayIn(tz, now);
  const reply = (body, cache) => new Response(body.slice(0, -1) + ',' + JSON.stringify({ today, tz, config: config(env) }).slice(1), { headers: { ...SEC, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-forma-cache': cache } });
  const vr = await db(env).prepare("SELECT (SELECT count(*)||':'||ifnull(max(updated_at),'') FROM samples)||'|'||(SELECT count(*)||':'||ifnull(max(updated_at),'') FROM workouts)||'|'||(SELECT count(*)||':'||ifnull(max(updated_at),'') FROM hk_quantity)||'|'||(SELECT count(*)||':'||ifnull(max(updated_at),'') FROM hk_events)||'|'||(SELECT count(*)||':'||ifnull(max(updated_at),'') FROM meals)||'|'||(SELECT count(*)||':'||ifnull(max(updated_at),'') FROM meal_days)||'|'||(SELECT count(*)||':'||ifnull(max(rowid),0) FROM body_comp)||'|'||(SELECT ifnull(max(updated_at),'') FROM kv WHERE k IN ('health_last_ingest','meal_targets','supp_plan')) v, (SELECT v FROM kv WHERE k='data_cache_ver') cv").first();
  const ver = DATA_CODE_VERSION + '|' + dayIn('UTC', now) + '|' + (vr && vr.v);
  if (vr && vr.cv === ver) { const c = await db(env).prepare("SELECT v FROM kv WHERE k='data_cache'").first(); if (c && c.v) return reply(c.v, 'hit'); }
  const body = JSON.stringify(await data(env, now));
  if (body.length < 1800000) await db(env).batch([db(env).prepare("INSERT INTO kv(k,v,updated_at) VALUES('data_cache',?,datetime('now')) ON CONFLICT(k) DO UPDATE SET v=excluded.v,updated_at=excluded.updated_at").bind(body), db(env).prepare("INSERT INTO kv(k,v,updated_at) VALUES('data_cache_ver',?,datetime('now')) ON CONFLICT(k) DO UPDATE SET v=excluded.v,updated_at=excluded.updated_at").bind(ver)]);
  return reply(body, 'miss');
}
// One day, any date (behind the session like /api/data): the same per-day rows the dashboard builds, read straight from
// D1 so dates older than the /api/data window are reachable too. Read-only.
async function dayData(env, date, tz = config(env).tz) {
  const today = dayIn(tz); if (date == null) date = today;
  if (!DAY_RE.test(date || '')) return json({ error: 'date=YYYY-MM-DD required' }, 400);
  const one = sql => db(env).prepare(sql).bind(date).all().then(r => r.results);
  const [rows, meals, mday, wo, sleepEv] = await Promise.all([
    one("SELECT metric, source, SUM(qty) s, AVG(qty) a FROM samples WHERE day=? AND source IN ('fsync','hae','shortcut') GROUP BY metric, source"),
    one("SELECT day,meal,time,title,kcal,protein,carbs,fat,notes,items,nutrients FROM meals WHERE day=? AND source!='test' ORDER BY time, meal"),
    one("SELECT day,day_type,kcal,kcal_min,kcal_max,protein,protein_min,protein_max,notes FROM meal_days WHERE day=? AND source!='test'"),
    one("SELECT id,source,day,type,start,end,duration_s,distance_km,kcal,avg_hr,max_hr,elevation_m,effort,json_extract(raw,'$.source_bundle') src_bundle FROM workouts WHERE day=? AND source IN ('fsync','hae','shortcut') AND (json_extract(raw,'$.source_bundle') IS NULL OR json_extract(raw,'$.source_bundle') LIKE 'com.apple.%') ORDER BY start"),
    one("SELECT day,value,start,end,json_extract(extra,'$.source') src FROM hk_events WHERE type='sleep_analysis' AND day=? AND source!='test' ORDER BY start")]);
  const d = { day: date }; const pick = {};
  for (const r of rows) { const v = SUM.has(r.metric) ? r.s : r.a; if (!(r.metric in pick) || (RANK[r.source] || 0) >= (RANK[pick[r.metric]] || 0)) { d[r.metric] = v; pick[r.metric] = r.source; } }
  const days = [d]; fixSleep(days, sleepEv); sanitizeEnergy(days); const ws = dedupeWorkouts(wo); checkActiveVsWorkouts(days, ws);
  return json({ date, today, tz, day: days[0], meals: { entries: meals.map(mealOut), day: mday[0] || null }, workouts: ws });
}
async function api(req, env, u) {
  const p = u.pathname;
  if (p === '/api/ingest/health') return ingest(req, env, u);
  if (p === '/api/ingest/meals') return meals(req, env, u);
  if (!(await authed(req, env))) return json({ error: 'unauthorized' }, 401);
  if (p === '/api/data') return dataCached(env, reqTz(u, env));
  if (p === '/api/day' && req.method === 'GET') return dayData(env, u.searchParams.get('date'), reqTz(u, env));
  return json({ error: 'not_found' }, 404);
}

// ---------------- light password gate (pages + private API) ----------------
// Ingest (Access service token + bearer) keeps its own auth and never sees this gate.
const COOKIE = '__Host-forma', SESSION_DAYS = 90, FAIL_MAX = 10, FAIL_WIN_MS = 15 * 60 * 1000;
const PUBLIC = new Set(['/robots.txt', '/favicon.svg', '/theme.js', '/style.css', '/concept/lg.css', '/login.css']); // data-free assets the login page needs
const te = new TextEncoder();
const b64uE = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function hmac(key, msg) { const k = await crypto.subtle.importKey('raw', te.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']); return b64uE(await crypto.subtle.sign('HMAC', k, te.encode(msg))); }
// the session is bound to the current password: changing SITE_PASSWORD logs every device out
async function pwTag(env) { return (await hmac(env.SESSION_KEY, 'pw|' + env.SITE_PASSWORD)).slice(0, 16); }
async function signSession(env, exp) { return 'v1.' + exp + '.' + await hmac(env.SESSION_KEY, 'forma-session|v1|' + exp + '|' + await pwTag(env)); }
async function verifySession(env, tok, now = Date.now()) {
  if (!env.SESSION_KEY || !env.SITE_PASSWORD || !tok) return false;
  const m = /^v1\.(\d{10,14})\.([A-Za-z0-9_-]{43})$/.exec(tok); if (!m || Number(m[1]) < now) return false;
  return safeEq(m[2], await hmac(env.SESSION_KEY, 'forma-session|v1|' + m[1] + '|' + await pwTag(env)));
}
// constant-time: both sides are HMACs of equal length, compared with safeEq
async function checkPassword(env, given) { if (!env.SESSION_KEY || !env.SITE_PASSWORD || typeof given !== 'string' || given.length > 512) return false; return safeEq(await hmac(env.SESSION_KEY, 'cmp|' + given), await hmac(env.SESSION_KEY, 'cmp|' + env.SITE_PASSWORD)); }
const cookieOf = req => { const c = req.headers.get('cookie') || ''; const m = c.match(/(?:^|;\s*)__Host-forma=([^;]+)/); return m ? m[1] : null; };
const safeNext = n => (typeof n === 'string' && /^\/(?![\/\\])[^\s]*$/.test(n) && !n.startsWith('/login') && !n.startsWith('/logout') && n.length < 300 ? n : '/');
async function authed(req, env) {
  if (await verifySession(env, cookieOf(req))) return true;
  if (!accessReady(env, 'MAIN')) return false;
  const jwt = await verifyAccess(req, env, env.ACCESS_AUD_MAIN).catch(() => null);
  return !!(jwt && (jwt.email || '').toLowerCase() === env.ALLOWED_EMAIL.toLowerCase());
}
async function failCount(env, ip, win) { try { const r = await db(env).prepare('SELECT n FROM login_fail WHERE ip = ? AND win = ?').bind(ip, win).first(); return r ? r.n : 0; } catch (e) { return 0; } }
async function addFail(env, ip, win) { try { await db(env).prepare('INSERT INTO login_fail (ip, win, n) VALUES (?, ?, 1) ON CONFLICT(ip, win) DO UPDATE SET n = n + 1').bind(ip, win).run(); await db(env).prepare('DELETE FROM login_fail WHERE win < ?').bind(win - 4).run(); } catch (e) {} }
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
function loginPage(next, msg, status = 200, label = '') {
  const html = `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer"><meta name="color-scheme" content="light dark"><title>Forma — accesso</title><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/concept/lg.css"><link rel="stylesheet" href="/login.css"><script src="/theme.js"></script></head>
<body class="lgn-b"><header class="lg-top"><span class="wordmark">${esc(label)}</span><span class="tag">Dashboard privata</span></header>
<main class="lgn"><form class="lgn-f" method="post" action="/login" autocomplete="on"><div class="lab">Accesso</div><h1>Dashboard privata</h1><p class="lede">Inserisci la password per continuare.</p>
<label class="lab" for="pw">Password</label><div class="row"><input id="pw" name="password" type="password" autocomplete="current-password" required autofocus maxlength="512"${msg ? ' aria-invalid="true" aria-describedby="err"' : ''}><button type="submit">Entra</button></div>
<input type="hidden" name="next" value="${esc(next)}">${msg ? `<p class="err" id="err" role="alert">${esc(msg)}</p>` : ''}<p class="note">Resti collegato su questo dispositivo per 90 giorni.</p></form></main></body></html>`;
  return new Response(html, { status, headers: { ...SEC, 'content-type': 'text/html; charset=utf-8' } });
}
async function login(req, env, u) {
  const page = (next, msg, status) => loginPage(next, msg, status, siteLabel(req, env));
  if (!env.SITE_PASSWORD || !env.SESSION_KEY) return page('/', 'Accesso non configurato.', 503);
  if (req.method === 'GET') return (await verifySession(env, cookieOf(req))) ? Response.redirect(u.origin + safeNext(u.searchParams.get('next')), 302) : page(safeNext(u.searchParams.get('next')), '');
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: SEC });
  const ip = req.headers.get('cf-connecting-ip') || 'unknown', win = Math.floor(Date.now() / FAIL_WIN_MS);
  let f = null; try { if (Number(req.headers.get('content-length') || 0) > 4096) throw 0; f = await req.formData(); } catch (e) { return page('/', 'Richiesta non valida.', 400); }
  const next = safeNext(f.get('next'));
  if (!env.SITE_PASSWORD || !env.SESSION_KEY) return page(next, 'Accesso non configurato.', 503);
  if ((await failCount(env, ip, win)) >= FAIL_MAX) return page(next, 'Troppi tentativi. Riprova tra qualche minuto.', 429);
  if (!(await checkPassword(env, f.get('password')))) { await addFail(env, ip, win); await new Promise(r => setTimeout(r, 400)); return page(next, 'Password non corretta.', 401); }
  const exp = Date.now() + SESSION_DAYS * 864e5;
  return new Response(null, { status: 303, headers: { ...SEC, location: next, 'set-cookie': `${COOKIE}=${await signSession(env, exp)}; Path=/; Max-Age=${SESSION_DAYS * 86400}; HttpOnly; Secure; SameSite=Lax` } });
}
const logout = () => new Response(null, { status: 303, headers: { ...SEC, location: '/login', 'set-cookie': `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax` } });
export default {
  async fetch(req, env) {
    const u = new URL(req.url);
    if (u.pathname.startsWith('/api/')) { try { return await api(req, env, u); } catch (e) { return json({ error: 'server_error' }, 500); } }
    if (u.pathname === '/login') return login(req, env, u);
    if (u.pathname === '/logout') return logout();
    const pn = u.pathname === '/' ? '/index.html' : u.pathname;
    if (!PUBLIC.has(pn) && !(await authed(req, env))) return new Response(null, { status: 302, headers: { ...SEC, location: '/login' + (u.pathname === '/' ? '' : '?next=' + encodeURIComponent(u.pathname + u.search)) } });
    const f = STATIC[pn] || (pn.endsWith('/') ? STATIC[pn + 'index.html'] : null);
    if (!f) return new Response('Not found', { status: 404, headers: SEC });
    return new Response(f[1].startsWith('text/html') ? f[0].replaceAll('__SITE_LABEL__', esc(siteLabel(req, env))) : f[0], { headers: { ...SEC, 'content-type': f[1] } });
  }
};
