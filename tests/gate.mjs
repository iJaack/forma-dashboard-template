// Password gate tests: run the real worker with a stub env (no network, no data). `node tests/gate.mjs`
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import assert from 'node:assert/strict';
const root = path.dirname(new URL(import.meta.url).pathname) + '/../';
const STATIC = { '/index.html': ['<p>pagina</p>', 'text/html; charset=utf-8'], '/theme.js': ['/*t*/', 'application/javascript'], '/robots.txt': ['User-agent: *\nDisallow: /\n', 'text/plain'], '/concept/ed2.js': ['/*x*/', 'application/javascript'] };
const src = fs.readFileSync(root + 'src/pages_worker.js', 'utf8').replace('__STATIC__', JSON.stringify(STATIC)).replace('__SEC__', JSON.stringify({ 'X-Robots-Tag': 'noindex, nofollow' })) + '\nexport { signSession, verifySession, checkPassword, safeNext };\n';
const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gate-')), 'w.mjs'); fs.writeFileSync(tmp, src);
const W = await import(tmp); fs.rmSync(path.dirname(tmp), { recursive: true });
const rows = new Map();
const DB = { prepare: sql => { const st = { a: [], bind(...a) { st.a = a; return st; }, async run() { if (/^INSERT INTO login_fail/.test(sql)) { const k = st.a.join('|'); rows.set(k, (rows.get(k) || 0) + 1); } return {}; }, async first() { const k = st.a.join('|'); return rows.has(k) ? { n: rows.get(k) } : null; } }; return st; } };
const env = { SITE_PASSWORD: 'prova-di-test', SESSION_KEY: 'k'.repeat(48), DB, ACCESS_TEAM: 'invalid.example.com', ACCESS_AUD_MAIN: 'a', ACCESS_AUD_INGEST: 'i', ALLOWED_EMAIL: 'owner@example.com', INGEST_SECRET:'synthetic-ingest-test' };
const H = 'https://example.com';
const go = (p, o = {}, e = env) => W.default.fetch(new Request(H + p, { redirect: 'manual', ...o }), e);
const login = (pw, ip = '1.1.1.1', next = '/') => go('/login', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'cf-connecting-ip': ip }, body: new URLSearchParams({ password: pw, next }).toString() });
let n = 0, f = 0; const t = async (name, fn) => { try { await fn(); n++; } catch (e) { f++; console.log('FAIL', name, '\n ', e.message); } };
await t('no cookie: pages redirect to /login (with next), /api/data 401', async () => {
  let r = await go('/'); assert.equal(r.status, 302); assert.equal(r.headers.get('location'), '/login');
  r = await go('/?date=2040-01-01'); assert.equal(r.headers.get('location'), '/login');
  r = await go('/concept/ed2.js'); assert.equal(r.status, 302);
  r = await go('/api/data'); assert.equal(r.status, 401); assert.deepEqual(await r.json(), { error: 'unauthorized' });
  r = await go('/api/nope'); assert.equal(r.status, 401); });
await t('public data-free assets and the login page are reachable, noindex', async () => {
  for (const p of ['/theme.js', '/robots.txt']) assert.equal((await go(p)).status, 200);
  const r = await go('/login'); assert.equal(r.status, 200); const h = await r.text(); assert.match(h, /type="password"/); assert.match(h, /name="robots" content="noindex,nofollow"/); assert.equal(r.headers.get('x-robots-tag'), 'noindex, nofollow'); assert.doesNotMatch(h, /<script>/); });
await t('login and empty-state chrome use solid Forma backgrounds without decorative veils', async () => {
  const css = Object.fromEntries(['style.css', 'login.css', 'concepts/lg.css'].map(p => [p, fs.readFileSync(root + 'src/' + p, 'utf8')]));
  const h = await (await go('/login')).text();
  for (const [p, text] of [...Object.entries(css), ['login HTML', h], ['concepts/lg.js', fs.readFileSync(root + 'src/concepts/lg.js', 'utf8')]]) {
    assert.doesNotMatch(text, /--bg\s*:\s*#121314\b|lg-bg|104\s*,\s*132\s*,\s*184/i, p);
  }
  assert.match(css['style.css'], /html\[data-theme="dark"\]\s*\{\s*--bg:#14110e;/);
  assert.match(css['style.css'], /html\[data-theme="light"\]\s*\{\s*--bg:#f7f5f0;/);
  assert.match(css['style.css'], /\.card\{background:var\(--surface\);/);
  for (const p of ['login.css', 'concepts/lg.css']) assert.doesNotMatch(css[p], /--bg\s*:/, p + ' must inherit the shared background token');
  assert.match(css['concepts/lg.css'], /html,body\{background:var\(--bg\);/);
  assert.match(css['login.css'], /body\.lgn-b\{background:var\(--bg\)\}/);
  assert.match(css['login.css'], /\.lgn-b \.lg-top\{background:var\(--surface\);/);
  assert.match(h, /<header class="lg-top">/);
  assert.doesNotMatch(h, /\bglass\b/);
});
await t('correct password: 303 + signed HttpOnly Secure SameSite=Lax __Host- cookie for 90 days; cookie opens pages and the API', async () => {
  const r = await login('prova-di-test', '2.2.2.2', '/?date=2040-01-01'); assert.equal(r.status, 303); assert.equal(r.headers.get('location'), '/?date=2040-01-01');
  const c = r.headers.get('set-cookie'); assert.match(c, /^__Host-forma=v1\.\d+\.[A-Za-z0-9_-]{43}; Path=\/; Max-Age=7776000; HttpOnly; Secure; SameSite=Lax$/);
  const ck = c.split(';')[0]; assert.equal((await go('/', { headers: { cookie: ck } })).status, 200);
  const a = await go('/api/nope', { headers: { cookie: 'a=b; ' + ck } }); assert.equal(a.status, 404); // past the gate
  assert.equal((await go('/login', { headers: { cookie: ck } })).status, 302); });
await t('wrong password: 401 with Italian error, no cookie, small delay', async () => {
  const t0 = Date.now(), r = await login('sbagliata', '3.3.3.3'); assert.equal(r.status, 401); assert.equal(r.headers.get('set-cookie'), null); assert.match(await r.text(), /Password non corretta/); assert.ok(Date.now() - t0 >= 350);
  assert.equal((await login('', '3.3.3.3')).status, 401); assert.equal((await login('prova-di-test ', '3.3.3.3')).status, 401); });
await t('sign/verify: tampered, expired, other key and changed password are rejected', async () => {
  const exp = Date.now() + 1e6, tok = await W.signSession(env, exp); assert.ok(await W.verifySession(env, tok));
  assert.equal(await W.verifySession(env, tok.replace(/.$/, c => c === 'A' ? 'B' : 'A')), false);
  assert.equal(await W.verifySession(env, tok.replace(String(exp), String(exp + 1))), false);
  assert.equal(await W.verifySession(env, await W.signSession(env, Date.now() - 1)), false);
  assert.equal(await W.verifySession({ ...env, SESSION_KEY: 'z'.repeat(48) }, tok), false);
  assert.equal(await W.verifySession({ ...env, SITE_PASSWORD: 'nuova' }, tok), false);
  assert.equal(await W.verifySession({ ...env, SESSION_KEY: '' }, tok), false); assert.equal(await W.verifySession(env, 'v1.1.x'), false);
  assert.equal((await go('/', { headers: { cookie: '__Host-forma=' + tok.slice(0, -2) + 'xx' } })).status, 302); });
await t('missing secrets fail closed', async () => {
  const e2 = { ...env, SITE_PASSWORD: undefined }; assert.equal(await W.checkPassword(e2, 'undefined'), false); assert.equal((await go('/', {}, e2)).status, 302);
  const r = await W.default.fetch(new Request(H + '/login', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'password=x' }), e2); assert.equal(r.status, 503); });
await t('rate limit: 10 failures per IP per 15 min, then 429 even with the right password', async () => {
  for (let i = 0; i < 10; i++) assert.equal((await login('no', '9.9.9.9')).status, 401);
  const r = await login('prova-di-test', '9.9.9.9'); assert.equal(r.status, 429); assert.equal(r.headers.get('set-cookie'), null);
  assert.equal((await login('prova-di-test', '8.8.8.8')).status, 303); });
await t('next is same-origin only', async () => {
  for (const x of ['//evil.example.com', 'https://evil.example.com', '/\\evil', '/login', 'javascript:alert(1)']) assert.equal(W.safeNext(x), '/');
  assert.equal(W.safeNext('/?a=1'), '/?a=1'); });
await t('logout clears the cookie', async () => { const r = await go('/logout'); assert.equal(r.status, 303); assert.equal(r.headers.get('location'), '/login'); assert.match(r.headers.get('set-cookie'), /__Host-forma=; Path=\/; Max-Age=0/); });
await t('ingest has its own bearer gate and removed routes cannot bypass the session', async () => {
  for (const route of ['health','meals']) assert.equal((await go('/api/ingest/'+route, {method:'POST',body:'{}'})).status,401);
  const cookie='__Host-forma='+await W.signSession(env,Date.now()+3600000);
  for (const route of ['/legacy/','/concept/a/','/concept/b/','/concept/mix/','/concept/mix-v1/','/concept/indice/','/concept/scelta/','/concept/rivista/']) assert.equal((await go(route,{headers:{cookie}})).status,404);
  for (const method of ['GET','POST']) {
    assert.equal((await go('/api/removed/status',{method})).status,401);
    assert.equal((await go('/api/removed/status',{method,headers:{cookie}})).status,404);
  }
});
console.log(`gate: ${n} passed, ${f} failed`); if (f) process.exit(1);
