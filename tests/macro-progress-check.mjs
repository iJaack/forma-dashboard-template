// Local-only visual regression evidence. Requires playwright-core and Chrome, like duo-check.mjs.
// Build first; start tests/duo-serve.mjs. This runner refuses every non-loopback request.
// node tests/macro-progress-check.mjs [http://127.0.0.1:8765/] [output/playwright/macro-progress]
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const base = new URL(process.argv[2] || 'http://127.0.0.1:8765/');
assert.equal(base.hostname, '127.0.0.1');
const out = process.argv[3] || 'output/playwright/macro-progress';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const cases = ['under', 'inrange', 'over', 'kcal-over-stima', 'fibre-none'];
const evidence = [], errors = [], interactions = {};
try {
  for (const width of [390, 466, 669, 1280]) for (const theme of ['light', 'dark']) for (const scenario of cases) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, colorScheme: theme, timezoneId: 'UTC', reducedMotion: 'reduce' });
    await context.route('**/*', async route => {
      const request = new URL(route.request().url());
      if (request.origin !== base.origin) return route.abort();
      if (request.pathname !== '/api/data' || scenario !== 'under') return route.continue();
      const response = await route.fetch();
      assert.equal(response.headers()['x-forma-example'], '1');
      const data = await response.json(); assert.equal(data.example, true);
      const entry = data.meals.entries.find(e => e.example && e.title === 'Synthetic meal under');
      assert.ok(entry);
      Object.assign(entry.nutrients, { satfat: 10, sugars: 20 });
      return route.fulfill({ response, json: data });
    });
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    const url = new URL(base); url.search = new URLSearchParams({ demo: 'macro-progress', case: scenario, theme }).toString();
    const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/data');
    await page.goto(url.href);
    assert.equal((await response).headers()['x-forma-example'], '1', 'Only the synthetic duo-serve API may be inspected');
    await page.locator('.nut .nmac').waitFor();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.locator('.nut').evaluate(el => el.scrollIntoView({ block: 'start' }));
    const data = await page.evaluate(() => {
      const $ = s => document.querySelector(s), css = el => getComputedStyle(el), box = el => el.getBoundingClientRect();
      const p = $('.target-progress'), ring = $('.macro-ring'), track = $('.macro-track'), tick = $('.kcal-tick'), nut = $('.nut');
      const bg = css(document.documentElement).getPropertyValue('--bg').trim();
      const rgb = color => { const el = document.createElement('i'); el.style.color = color; p.appendChild(el); const numbers = css(el).color.match(/[\d.]+/g).map(Number); el.remove(); return numbers; };
      const blend = (color, under) => { const a = color[3] ?? 1; return color.slice(0, 3).map((n, i) => n * a + under[i] * (1 - a)); };
      const luminance = color => color.slice(0, 3).map(n => { n /= 255; return n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4; }).reduce((sum, n, i) => sum + n * [.2126, .7152, .0722][i], 0);
      const contrast = (a, b) => { const x = luminance(a), y = luminance(b); return +((Math.max(x, y) + .05) / (Math.min(x, y) + .05)).toFixed(3); };
      const surface = rgb(bg), card = rgb(css(p).getPropertyValue('--surface')), accent = rgb(css(document.documentElement).getPropertyValue('--accent'));
      const fillColor = rgb(css($('.macro-fill')).stroke), kcalFillColor = rgb(css($('.kcal-fill')).backgroundColor);
      const stripeColor = rgb(css(p).getPropertyValue('--jk-ink-2')), stripeBackground = $('.kcal-over') ? css($('.kcal-over')).backgroundImage : null;
      const trackColor = rgb(css(track).stroke), trackSurface = blend(trackColor, surface);
      const kcalTrackColor = rgb(css($('.kcal-track')).backgroundColor), kcalTrackSurface = blend(kcalTrackColor, surface);
      const contrasts = {};
      for (const [name, color, back] of [
        ['fillTrack', blend(fillColor, trackSurface), trackSurface], ['kcalFillTrack', blend(kcalFillColor, kcalTrackSurface), kcalTrackSurface],
        ['fillSurface', fillColor, surface], ['fillCardSurface', fillColor, card],
        ['tickSurface', rgb(css(tick).borderLeftColor), surface], ['haloSurface', rgb(css(p).getPropertyValue('--jk-ink-2')), surface],
        ['t2Surface', blend(rgb(css($('.progress-status')).color), surface), surface], ['t3Surface', rgb(css($('.progress-target')).color), surface],
      ]) contrasts[name] = contrast(color, back);
      const relativeBox = (node, parent) => { const r = box(node), b = box(parent); return { x: r.left - b.left, y: r.top - b.top, width: r.width, height: r.height }; };
      const macros = [...document.querySelectorAll('.nmac li')].map(el => ({ key: el.dataset.macro, role: el.getAttribute('role'), value: el.querySelector('.nv').textContent, status: el.querySelector('.progress-status').textContent,
        ariaText: el.getAttribute('aria-valuetext') || el.getAttribute('aria-label'),
        halo: !!el.querySelector('.macro-halo'), dotted: !!el.querySelector('.dotted'), fill: !!el.querySelector('.macro-fill'),
        ring: relativeBox(el.querySelector('.macro-ring'), el), label: relativeBox(el.querySelector('.nl'), el), valueBox: relativeBox(el.querySelector('.nv'), el),
        details: [...el.querySelectorAll('.progress-status,.progress-target')].map(node => ({ ...relativeBox(node, el), nowrap: css(node).whiteSpace === 'nowrap', singleLine: box(node).height <= parseFloat(css(node).lineHeight) + 1 })),
        cellWidth: box(el).width,
        copyOverflow: [...el.querySelectorAll('.nl,.nv,.progress-status,.progress-target')].some(t => box(t).left < box(el).left - 1 || box(t).right > box(el).right + 1 || t.scrollWidth > t.clientWidth + 1) }));
      const obstacle = innerWidth <= 430 ? Math.max(box($('.lg-top')).bottom, box($('.chnav')).bottom) : box($('.lg-top')).bottom;
      return { ringDiameter: box(ring).width, stroke: parseFloat(css(track).strokeWidth), columns: css($('.nmac')).gridTemplateColumns.split(' ').length,
        gridGap: parseFloat(css($('.nmac')).gap), layout: css($('.nmac li')).flexDirection, valueSize: parseFloat(css($('.nmac .nv')).fontSize),
        barHeight: box($('.kcal-track')).height, barWidth: box($('.kcal-track')).width,
        kcalMacroGap: box($('.nmac')).top - box($('.kcal-progress')).bottom,
        clearance: +(box(nut).top - obstacle).toFixed(2), contrasts, trackColor, kcalTrackColor, accent, fillColor, kcalFillColor, stripeColor, stripeBackground,
        overflow: document.documentElement.scrollWidth > innerWidth, macros,
        reducedAnimations: [...document.querySelectorAll('.macro-fill,.kcal-fill,.kcal-over')].every(el => css(el).animationName === 'none'),
        striped: !!$('.kcal-over'), estimatedTick: !!$('.kcal-tick.estimated') };
    });
    const expectedDiameter = width >= 1024 ? 72 : width >= 600 ? 64 : 56;
    assert.equal(data.ringDiameter, expectedDiameter); assert.equal(data.stroke, width >= 1024 ? 7 : 6);
    assert.equal(data.columns, width >= 600 ? 4 : 2); assert.equal(data.gridGap, 14); assert.equal(data.barHeight, 8);
    assert.equal(data.kcalMacroGap, 28); assert.ok(data.barWidth <= 640); assert.ok(Math.abs(data.clearance - 14) < 1, JSON.stringify({width, theme, scenario, clearance: data.clearance}));
    assert.equal(data.overflow, false); assert.equal(data.reducedAnimations, true);
    assert.ok(data.macros.every(m => !m.copyOverflow), JSON.stringify({ width, theme, scenario, macros: data.macros }));
    assert.deepEqual(data.trackColor, theme === 'light' ? [23, 23, 16, .08] : [64, 55, 44]);
    assert.deepEqual(data.kcalTrackColor, data.trackColor);
    assert.deepEqual(data.accent, theme === 'light' ? [168, 133, 15] : [232, 197, 71]);
    assert.deepEqual(data.fillColor, theme === 'light' ? [149, 117, 0] : [232, 197, 71]);
    assert.deepEqual(data.kcalFillColor, data.fillColor);
    if (data.striped) {
      const color = values => `rgb${values.length === 4 ? 'a' : ''}(${values.join(', ')})`;
      assert.equal(data.stripeBackground, `repeating-linear-gradient(45deg, ${color(data.stripeColor)} 0px, ${color(data.stripeColor)} 3px, ${color(data.trackColor)} 3px, ${color(data.trackColor)} 6px)`);
    }
    for (const [key, ratio] of Object.entries(data.contrasts)) {
      assert.ok(ratio >= (key.startsWith('t2') || key.startsWith('t3') ? 4.6 : 3), key + ': ' + ratio);
    }
    const close = (a, b) => assert.ok(Math.abs(a - b) < 1, `${a} != ${b}`);
    for (const m of data.macros) {
      assert.ok(m.details.every(d => d.nowrap && d.singleLine));
      close(m.valueBox.x, m.label.x); close(m.valueBox.y, m.label.y + m.label.height + 14);
      if (width < 600) {
        close(m.label.x, m.ring.x + m.ring.width + 14); close(m.label.y, m.ring.y);
        close(m.details[0].y, Math.max(m.ring.y + m.ring.height, m.valueBox.y + m.valueBox.height) + 14);
        for (const d of m.details) { close(d.x, m.ring.x); close(d.width, m.cellWidth); }
      } else {
        if (width < 1024) { close(m.label.x, m.ring.x); close(m.label.y, m.ring.y + m.ring.height + 14); }
        else { close(m.label.x, m.ring.x + m.ring.width + 14); close(m.label.y, m.ring.y); }
        close(m.details[0].y, m.valueBox.y + m.valueBox.height + 14);
        for (const d of m.details) close(d.x, m.label.x);
      }
      for (let i = 1; i < m.details.length; i++) close(m.details[i].y, m.details[i - 1].y + m.details[i - 1].height + 14);
    }
    if (width >= 1024) assert.equal(data.valueSize, 32);
    if (scenario === 'under') {
      assert.match(data.macros[1].status, /^mancano /); assert.match(data.macros[1].ariaText, /sotto il range, mancano /);
      for (const m of [data.macros[1], data.macros[2]]) assert.equal(m.details.length, 3, 'Include the synthetic di cui sub-line');
    }
    if (scenario === 'inrange') { assert.equal(data.macros[0].status, 'raggiunto'); assert.match(data.macros[0].ariaText, /obiettivo raggiunto/); assert.equal(data.macros[1].status, 'nel range'); assert.equal(data.macros[2].status, 'nel range'); }
    if (scenario === 'over') assert.ok(data.macros.every(m => m.halo && m.status.startsWith('oltre di')));
    if (scenario === 'kcal-over-stima') { assert.ok(data.striped); assert.ok(data.estimatedTick); }
    if (scenario === 'fibre-none') { const f = data.macros[3]; assert.equal(f.role, 'img'); assert.equal(f.value, '—'); assert.equal(f.status, 'nessun dato'); assert.equal(f.ariaText, 'Fibre: nessun dato, obiettivo 30 grammi.'); assert.ok(f.dotted); assert.equal(f.fill, false); }
    const screenshot = `${width}-${theme}-${scenario}.png`;
    await page.screenshot({ path: path.join(out, screenshot) });
    evidence.push({ width, theme, scenario, screenshot, ...data });
    await context.close();
    if (scenario === 'fibre-none') console.log(width + 'px ' + theme + ': five synthetic states passed');
  }
  // Exercise real controls with motion enabled, then a day update (not a synthetic DOM mutation).
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 }, timezoneId: 'UTC', reducedMotion: 'no-preference' });
  await context.route('**/*', route => new URL(route.request().url()).origin === base.origin ? route.continue() : route.abort());
  const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
  await page.goto(new URL('?demo=macro-progress&case=over&theme=light', base).href);
  await page.locator('.nut').waitFor();
  await page.locator('.nut').evaluate(el => el.scrollIntoView({ block: 'start' }));
  await page.waitForFunction(() => document.querySelector('.nut.in'));
  const firstDraw = await page.locator('.macro-fill').first().evaluate(el => el.getAnimations().map(a => a.effect.getTiming().duration));
  assert.ok(firstDraw.includes(280)); interactions.firstDrawMs = 280;
  await page.getByRole('button', { name: 'Tema scuro', exact: true }).click();
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
  await page.getByRole('button', { name: 'Tema chiaro', exact: true }).click();
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'light'); interactions.themeControls = true;
  await page.getByRole('button', { name: 'Giorno precedente', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.dtoday'));
  const update = await page.locator('.macro-fill').first().evaluate(el => el.getAnimations().map(a => a.effect.getTiming().duration));
  assert.ok(update.includes(200)); interactions.updateMs = 200;
  await page.getByRole('button', { name: 'Torna a oggi', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('.dtoday'));
  assert.ok((await page.locator('[data-macro="protein"] .progress-status').textContent()).startsWith('oltre di'));
  interactions.dayNavigationRoundTrip = true;
  await context.close();
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  // Keep the artifact compact: geometry/contrast once per viewport/theme, all state checks above.
  const measurements = [];
  for (const width of [390, 466, 669, 1280]) for (const theme of ['light', 'dark']) {
    const rows = evidence.filter(e => e.width === width && e.theme === theme);
    if (!rows.length) continue;
    const { scenario, screenshot, macros, ...geometry } = rows[0];
    measurements.push({ ...geometry, clearance: [Math.min(...rows.map(r => r.clearance)), Math.max(...rows.map(r => r.clearance))], screenshots: rows.map(r => r.screenshot) });
  }
  fs.writeFileSync(path.join(out, 'measurements.json'), JSON.stringify({ example: true, scenarios: cases, verifiedScreenshots: evidence.length, measurements, interactions, errors }, null, 2) + '\n');
}
console.log(`macro progress: ${evidence.length} synthetic screenshots and measured checks passed`);
