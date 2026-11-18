// Local preview only. Serves build/ and a synthetic /api/data.
// Every number is a round example (70 kg, 10 000 steps, 8 h). Not a person.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.env.DIST || path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'build'));
const port = Number(process.env.PORT || 8765);
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8', '.json': 'application/json; charset=utf-8' };

function utcDay(offset = 0) {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' });
  // en-CA is YYYY-MM-DD. Shift by calendar days in UTC, not by 24 h across DST.
  const base = fmt.format(new Date());
  const [y, m, d] = base.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + offset));
  return dt.toISOString().slice(0, 10);
}

function exampleData(scenario) {
  const N = 42;
  const today = utcDay(0);
  const days = [];
  const hkHrv = [];
  const workouts = [];
  const mealDays = [];
  const hkW = [];
  const hkF = [];
  const hkL = [];
  for (let i = 0; i < N; i++) {
    const day = utcDay(i - (N - 1));
    const isToday = day === today;
    const weight = 70 + i % 3; // Deliberately repeating round synthetic values.
    days.push({
      day,
      active_kcal: isToday ? 300 : 500,
      resting_kcal: isToday ? 1500 : 1600,
      burn_complete: isToday ? 0 : 1,
      steps: 10000,
      exercise_min: 30,
      distance_km: 4,
      sleep_asleep_min: 480,
      sleep_deep_min: 90,
      sleep_core_min: 270,
      sleep_rem_min: 120,
      sleep_src: 'apple',
      source: 'test',
      resting_hr: 60,
      weight_kg: weight,
    });
    hkHrv.push([day, 40]);
    hkW.push([day, weight]);
    hkF.push([day, 15 + i % 2]);
    hkL.push([day, 55]);
    mealDays.push({ day, day_type: 'riposo', kcal: isToday ? 1500 : 2000, notes: 'Synthetic summary', source: 'test' });
    if (i % 3 === 0) {
      workouts.push({
        id: 'synthetic-workout-' + day,
        source: 'test',
        src_bundle: 'com.apple.health.example',
        day,
        type: 'Synthetic walk',
        start: day + 'T09:00:00Z',
        end: day + 'T09:30:00Z',
        duration_s: 1800,
        kcal: 200,
        avg_hr: 120,
        max_hr: 140,
        distance_km: 3,
      });
    }
  }
  const entries = [
    { day: today, time: '08:00', meal: 'Colazione', source: 'test', title: 'Synthetic meal A', kcal: 400, protein: 20, carbs: 50, fat: 10, items: [{ f: 'banana', g: 100 }] },
    { day: today, time: '13:00', meal: 'Pranzo', source: 'test', title: 'Synthetic meal B', kcal: 600, protein: 30, carbs: 70, fat: 15, items: [{ f: 'banana', g: 100 }] },
    { day: today, time: '20:00', meal: 'Cena', source: 'test', title: 'Synthetic meal C', kcal: 500, protein: 40, carbs: 20, fat: 20, items: [{ f: 'banana', g: 100 }] },
    { day: utcDay(-1), time: '13:00', meal: 'Pranzo', source: 'test', title: 'Synthetic meal D', kcal: 2000, protein: 100, carbs: 200, fat: 60, items: [{ f: 'banana', g: 100 }] },
  ];
  // These scenarios exercise display states, never define formula expectations.
  if (scenario) {
    const cases = {
      under: { kcal: 1500, protein: 90, fat: 40, carbs: 150, fiber: 20 },
      inrange: { kcal: 2000, protein: 140, fat: 60, carbs: 220, fiber: 30 },
      over: { kcal: 2000, protein: 160, fat: 80, carbs: 260, fiber: 40 },
      'kcal-over-stima': { kcal: 2600, protein: 140, fat: 60, carbs: 220, fiber: 30 },
      'fibre-none': { kcal: 1500, protein: 90, fat: 40, carbs: 150, fiber: null },
    };
    const values = cases[scenario];
    if (values) {
      entries.splice(0, entries.length, { example: true, day: today, time: '13:00', meal: 'pranzo', source: 'test', title: 'Synthetic meal ' + scenario,
        kcal: values.kcal, protein: values.protein, fat: values.fat, carbs: values.carbs,
        nutrients: values.fiber == null ? {} : { fiber: values.fiber } });
      entries.push({ example: true, day: utcDay(-1), time: '13:00', meal: 'pranzo', source: 'test', title: 'Synthetic meal previous day', kcal: 1500, protein: 90, fat: 40, carbs: 150, nutrients: { fiber: 20 } });
      const md = mealDays.find(d => d.day === today); md.kcal = values.kcal;
    }
  }
  return {
    generated_at: new Date().toISOString(),
    tz: 'UTC',
    example: true, source: 'test',
    config: {tz:'UTC',dayTypes:['riposo','allenamento'],targets:{estimates:{},protein:{base:100,threshold:2200,slope:.1,cap:140},fat:{lo:.25,hi:.30},fiber:30}},
    days,
    workouts,
    quality: { energy_days_dropped: 0, energy_days_inconsistent: 0, workouts_raw: workouts.length, workouts_merged: workouts.length, hrmax_measured: {value:200,from:'synthetic test fixture'}, resting_min_complete: 1200 },
    hk: { 'heart_rate_variability_sdnn.avg': hkHrv, 'body_mass.last': hkW, 'body_fat_mass.last': hkF, 'lean_body_mass.last': hkL },
    body: [],
    meals: {
      entries,
      days: mealDays,
      targets: { riposo: [2000, 2000], allenamento: [2400, 2400], protein: scenario ? [140, 160] : [100, 140] },
      supp_plan: null,
    },
    sleep_events: [],
    meta: { health_last_ingest: { at: new Date().toISOString() } },
  };
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (url.pathname === '/api/data') {
    // Referer keeps the query fixture entirely in this server; no production client demo path.
    const source = new URL(req.headers.referer || req.url, 'http://127.0.0.1');
    const cookie = /(?:^|; )forma-demo-case=([^;]*)/.exec(req.headers.cookie || '');
    const scenario = source.searchParams.get('demo') === 'macro-progress' ? source.searchParams.get('case') : cookie ? decodeURIComponent(cookie[1]) : null;
    const body = JSON.stringify(exampleData(scenario));
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-forma-example': '1' });
    res.end(body);
    return;
  }
  let p = decodeURIComponent(url.pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.normalize(path.join(root, p));
  if (!file.startsWith(path.resolve(root)+path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end('not found'); return;
  }
  const headers = { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' };
  if (path.extname(file) === '.html') {
    // The built pages intentionally suppress Referer. Scope the fixture to this browser context instead.
    const scenario = url.searchParams.get('demo') === 'macro-progress' ? url.searchParams.get('case') : null;
    headers['set-cookie'] = 'forma-demo-case=' + encodeURIComponent(scenario || '') + '; Path=/; HttpOnly; SameSite=Strict' + (scenario ? '' : '; Max-Age=0');
  }
  res.writeHead(200, headers);
  if(path.extname(file)==='.html')res.end(fs.readFileSync(file,'utf8').replaceAll('__SITE_LABEL__','example.com'));
  else fs.createReadStream(file).pipe(res);
});

server.listen(port, '127.0.0.1', () => {
  console.log('duo preview http://127.0.0.1:' + port + '/  (synthetic /api/data, example:true)');
});
