// Local, deterministic build. Only explicitly listed source assets are embedded.
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const out = path.join(root, 'build');
await rm(out, { recursive: true, force: true });
await mkdir(path.join(out, 'concept'), { recursive: true });
const assets = {};
const add = async (name, body, type) => {
  assets['/' + name] = [body, type];
  await writeFile(path.join(out, name), body);
};
for (const name of ['style.css', 'login.css', 'theme.js', 'app_real.js',
  ...['lg.css', 'a.css', 'ed2.css', 'cx.js', 'lg.js', 'a.js', 'b.js', 'nut.js', 'ed2.js'].map(n => 'concepts/' + n)]) {
  await add(name.replace('concepts/', 'concept/'), await readFile(path.join(root, 'src', name), 'utf8'),
    name.endsWith('.css') ? 'text/css; charset=utf-8' : 'application/javascript; charset=utf-8');
}
// The JSON table is the only source for the browser reference.
const nutrition = JSON.parse(await readFile(path.join(root, 'src/nutrition/foods.json'), 'utf8'));
await add('concept/nut_ref.js', '// Generated from src/nutrition/foods.json; edit the JSON source.\nwindow.NUTREF=' + JSON.stringify(nutrition) + ';\n', 'application/javascript; charset=utf-8');
await add('concept/hook.js', 'var __FORMA_TEST__ = {};\n', 'application/javascript; charset=utf-8');
await add('index.html', `<!doctype html><html lang="it"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer">
<meta name="color-scheme" content="light dark"><meta name="forma-site-label" content="__SITE_LABEL__">
<title>Forma — dashboard privata</title><link rel="icon" href="/favicon.svg" type="image/svg+xml">
${['/style.css', '/concept/lg.css', '/concept/a.css', '/concept/ed2.css'].map(p => `<link rel="stylesheet" href="${p}">`).join('')}
<script src="/theme.js"></script></head><body data-mix data-v="rivista"><div id="app"></div>
${['/concept/hook.js', '/app_real.js', ...['cx', 'lg', 'a', 'b', 'nut_ref', 'nut', 'ed2'].map(n => '/concept/' + n + '.js')].map(p => `<script src="${p}"></script>`).join('')}
</body></html>`, 'text/html; charset=utf-8');
await add('robots.txt', 'User-agent: *\nDisallow: /\n', 'text/plain; charset=utf-8');
await add('favicon.svg', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#14110e"/><text x="9" y="46" fill="#e8c547" font-family="sans-serif" font-size="43" font-weight="700" letter-spacing="-4">f.</text></svg>', 'image/svg+xml');
const security = {
  'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Cache-Control': 'private, no-store',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"
};
const source = await readFile(path.join(root, 'src/pages_worker.js'), 'utf8');
await writeFile(path.join(out, 'worker.js'), source.replace('__STATIC__', () => JSON.stringify(assets)).replace('__SEC__', () => JSON.stringify(security)));
console.log(`Built build/worker.js with ${Object.keys(assets).length} data-free assets.`);
