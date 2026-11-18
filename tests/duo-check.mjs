// iPhone Duo layout check for the Rivista dashboard. Synthetic /api/data only.
// usage: node tests/duo-check.mjs <base-url> <shot-dir> [--assert]
// --assert fails the process on horizontal overflow or a fold that does not reflow.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const base = process.argv[2] || 'http://127.0.0.1:8765/';
if(!['127.0.0.1','localhost','[::1]'].includes(new URL(base).hostname))throw Error('Use the synthetic loopback preview only');
const outDir = process.argv[3] || '/tmp/duo-shots';
const assertOk = process.argv.includes('--assert');
const SIZES = [
  ['466x678', 466, 678],
  ['678x466', 678, 466],
  ['626x890', 626, 890],
  ['669x951', 669, 951],
  ['951x669', 951, 669],
];
// Simulated Dynamic Island + home indicator. Desktop Chrome reports env() as 0.
const INSETS = {
  portrait: { t: '59px', r: '0px', b: '34px', l: '0px' },
  landscape: { t: '0px', r: '47px', b: '21px', l: '59px' },
};

function insetsFor(w, h) { return h >= w ? INSETS.portrait : INSETS.landscape; }

async function open(browser, w, h, insets, theme, apiData) {
  const context = await browser.newContext({
    viewport: { width: w, height: h },
    timezoneId: 'UTC',
    reducedMotion: 'reduce',
    colorScheme: theme === 'light' ? 'light' : 'dark',
    deviceScaleFactor: 1,
  });
  await context.route('**/*', route => new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.abort());
  await context.addInitScript((ins) => {
    if (!ins) return;
    const apply = () => {
      const root = document.documentElement;
      if (!root) return;
      root.style.setProperty('--safe-t', ins.t);
      root.style.setProperty('--safe-r', ins.r);
      root.style.setProperty('--safe-b', ins.b);
      root.style.setProperty('--safe-l', ins.l);
    };
    apply();
    document.addEventListener('DOMContentLoaded', apply);
  }, insets || null);
  const page = await context.newPage();
  if (apiData) {
    await page.route(/\/api\/data(\?.*)?$/, (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'cache-control': 'no-store', 'x-forma-example': '1' },
      body: JSON.stringify(apiData),
    }));
  }
  const url = new URL(base);
  url.searchParams.set('theme', theme === 'light' ? 'light' : 'dark');
  url.searchParams.set('motion', '0');
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(url.toString(), { waitUntil: 'networkidle' });
  await page.waitForSelector('.e2m .big', { timeout: 15000, state: 'visible' });
  const bigW = await page.evaluate(() => document.querySelector('.e2m .big')?.getBoundingClientRect().width || 0);
  if (bigW <= 40) errors.push('hero number width ' + Math.round(bigW));
  await page.waitForSelector('[data-c="energy"] svg', { timeout: 15000 });
  return { page, errors };
}

async function measure(page) {
  return page.evaluate(() => {
    const html = document.documentElement, body = document.body;
    const prevH = html.style.overflowX, prevB = body.style.overflowX;
    html.style.overflowX = 'visible';
    body.style.overflowX = 'visible';
    const vw = innerWidth;
    const offenders = [];
    const skip = (el) => !el || el.closest('.lg-bg, .deco, script, style');
    for (const el of document.querySelectorAll('body *')) {
      if (skip(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      const overR = r.right - vw;
      const overL = -r.left;
      if (overR > 1 || overL > 1) {
        const cs = getComputedStyle(el);
        if (cs.position === 'fixed' && r.left >= -1 && r.right <= vw + 1) continue;
        offenders.push({
          tag: el.tagName.toLowerCase(),
          cls: (el.className && el.className.baseVal === undefined ? String(el.className) : el.getAttribute('class') || '').slice(0, 80),
          overR: Math.round(overR),
          overL: Math.round(overL),
          w: Math.round(r.width),
        });
      }
    }
    const scroll = html.scrollWidth - html.clientWidth;
    html.style.overflowX = prevH;
    body.style.overflowX = prevB;
    const top = document.querySelector('.lg-top');
    const nav = document.querySelector('.chnav');
    const hc = document.querySelector('.hero.h2 > .hc');
    const duo = document.querySelector('.duo');
    const tr = top ? top.getBoundingClientRect() : null;
    const nr = nav ? nav.getBoundingClientRect() : null;
    const buttons = [...document.querySelectorAll('.lg-top a.sw, .altro summary, .cap-more summary, .chnav button, .thsw button, .lg-seg button')].map((b) => {
      const r = b.getBoundingClientRect();
      return { t: (b.innerText || '').trim().slice(0, 24), w: Math.round(r.width), h: Math.round(r.height) };
    });
    return {
      scroll,
      offenders: offenders.slice(0, 12),
      offenderN: offenders.length,
      top: tr && { l: Math.round(tr.left), r: Math.round(tr.right), h: Math.round(tr.height) },
      nav: nr && { l: Math.round(nr.left), r: Math.round(nr.right), h: Math.round(nr.height) },
      heroCols: hc ? getComputedStyle(hc).gridTemplateColumns : null,
      duoCols: duo ? getComputedStyle(duo).gridTemplateColumns : null,
      chartW: Math.round(document.querySelector('[data-c="energy"] svg')?.getBoundingClientRect().width || 0),
      chartH: Number(document.querySelector('[data-c="energy"] svg')?.getAttribute('height') || 0),
      colCharts: [...document.querySelectorAll('[data-c] svg, [data-v] svg')].map((svg) => {
        const r = svg.getBoundingClientRect();
        let node = svg.parentElement, host = '', tracks = null, col = null;
        while (node && node !== document.body) {
          const cs = getComputedStyle(node);
          const cols = (cs.gridTemplateColumns || '').split(' ').filter((c) => c && c !== 'none');
          if ((cs.display === 'grid' || cs.display === 'inline-grid') && cols.length >= 2) {
            tracks = cols.map((c) => Math.round(parseFloat(c)));
            let child = svg;
            while (child.parentElement && child.parentElement !== node) child = child.parentElement;
            col = [...node.children].indexOf(child);
            host = (node.getAttribute('class') || node.tagName).toString().slice(0, 48);
            break;
          }
          node = node.parentElement;
        }
        return {
          id: svg.closest('[data-c]')?.getAttribute('data-c') || svg.closest('[data-v]')?.getAttribute('data-v') || '',
          w: Math.round(r.width),
          h: Math.round(r.height),
          col,
          tracks,
          host,
        };
      }).filter((c) => c.w > 1),
      smallTargets: buttons.filter((b) => b.w > 0 && b.h > 0 && (b.w < 44 || b.h < 44)).slice(0, 8),
      ready: document.documentElement.classList.contains('ready'),
    };
  });
}

fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--hide-scrollbars'], headless: true });
const report = [];
let failed = false;

for (const [name, w, h] of SIZES) {
  for (const [label, ins] of [['plain', null], ['safe', insetsFor(w, h)]]) {
    const { page, errors } = await open(browser, w, h, ins);
    const m = await measure(page);
    const shot = path.join(outDir, `${name}${label === 'safe' ? '-safe' : ''}.png`);
    if (label === 'plain' && ['466x678', '669x951', '951x669', '1280x800'].includes(name)) {
      await page.screenshot({ path: shot, fullPage: false });
      await page.screenshot({ path: shot.replace(/\.png$/, '-full.png'), fullPage: true });
    }
    const overflow = m.scroll > 1 || m.offenderN > 0;
    const topOut = m.top && (m.top.l < -1 || m.top.r > w + 1);
    const navOut = m.nav && (m.nav.l < -1 || m.nav.r > w + 1);
    const safeMiss = label === 'safe' && m.top && (m.top.l < parseFloat(ins.l) - 1 || m.top.r > w - parseFloat(ins.r) + 1);
    const tiny = m.smallTargets.length > 0;
    const row = { name, label, w, h, overflow, topOut, navOut, errors, ...m };
    report.push(row);
    if (assertOk && (overflow || topOut || navOut || safeMiss || tiny || errors.length || !m.ready)) failed = true;
    if (name === '669x951' && label === 'plain') {
      const cols = (m.colCharts || []).filter((c) => c.w >= 80 && c.tracks && c.tracks.length >= 2 && c.tracks.length <= 4);
      console.log('669 chart columns', cols.map((c) => c.id + ' col' + c.col + ' ' + c.w + 'px [' + (c.tracks || []).join('+') + ']').join(' | ') || 'none');
      const heroPair = await page.evaluate(() => {
        const hm = document.querySelector('.hero.h2 .hm')?.getBoundingClientRect();
        const bal = document.querySelector('.hero.h2 .bal')?.getBoundingClientRect();
        const big = document.querySelector('.hero.h2 .hm .big')?.getBoundingClientRect();
        if (!hm || !bal || !big) return null;
        return { hm: Math.round(hm.width), bal: Math.round(bal.width), big: Math.round(big.width), side: bal.left >= hm.right - 12, aligned: Math.abs(hm.top - bal.top) < 140 };
      });
      const twoCol = !!(heroPair && heroPair.hm > 100 && heroPair.bal > 100 && heroPair.big > 40 && heroPair.side && heroPair.aligned);
      console.log('669 hero columns', JSON.stringify(heroPair), twoCol ? 'two-col' : 'ONE-COL');
      report.push({ name: 'hero-669', ...heroPair, twoCol });
      if (assertOk && !twoCol) failed = true;
    }
    if (label === 'plain' && ['466x678', '669x951', '951x669'].includes(name)) {
      const cap = await page.evaluate(() => document.querySelector('.cap-n')?.textContent || '');
      const want = name === '951x669' ? '30 giorni' : '14 giorni';
      const capOk = cap.includes(want);
      console.log('caption', name, cap, capOk ? 'ok' : 'WRONG');
      if (assertOk && !capOk) failed = true;
    }
    console.log(name, label, overflow ? 'OVERFLOW' : 'ok', 'scroll', m.scroll, 'offenders', m.offenderN, m.offenders[0] ? JSON.stringify(m.offenders[0]) : '', 'top', JSON.stringify(m.top), 'hero', m.heroCols, 'duo', m.duoCols, 'targets', m.smallTargets.length, safeMiss ? 'SAFE-MISS' : '', tiny ? JSON.stringify(m.smallTargets[0]) : '', errors[0] || '');
    await page.context().close();
  }
}

// Live fold: one page, outer portrait → inner portrait → inner landscape.
{
  const { page, errors } = await open(browser, 466, 678, null);
  const before = await measure(page);
  await page.setViewportSize({ width: 669, height: 951 });
  await new Promise((r) => setTimeout(r, 400));
  const mid = await measure(page);
  await page.setViewportSize({ width: 951, height: 669 });
  await new Promise((r) => setTimeout(r, 400));
  const after = await measure(page);
  const reflow = before.chartW !== mid.chartW && mid.chartW !== after.chartW;
  const row = { name: 'fold', before: before.chartW, mid: mid.chartW, after: after.chartW, reflow, heroMid: mid.heroCols, heroAfter: after.heroCols, errors };
  report.push(row);
  console.log('fold chartW', before.chartW, '→', mid.chartW, '→', after.chartW, reflow ? 'reflow' : 'NO-REFLOW', errors[0] || '');
  if (assertOk && (!reflow || errors.length)) failed = true;

  // Same width, height jump past the 120px jitter floor: charts must redraw.
  await page.setViewportSize({ width: 951, height: 480 });
  await new Promise((r) => setTimeout(r, 400));
  const shortH = await measure(page);
  await page.setViewportSize({ width: 951, height: 900 });
  await new Promise((r) => setTimeout(r, 400));
  const tallH = await measure(page);
  const heightReflow = shortH.chartH > 0 && tallH.chartH > shortH.chartH;
  console.log('fold chartH', shortH.chartH, '→', tallH.chartH, heightReflow ? 'reflow' : 'NO-REFLOW');
  report.push({ name: 'fold-height', short: shortH.chartH, tall: tallH.chartH, heightReflow });
  if (assertOk && !heightReflow) failed = true;
  const rec = page.locator('.chnav button', { hasText: 'Recupero' });
  let tapOk = false;
  let tap = null;
  if (await rec.count()) {
    await rec.first().click();
    await new Promise((r) => setTimeout(r, 300));
    tap = await page.evaluate(() => {
      const s = document.querySelector('#c-rec');
      const bar = document.querySelector('.lg-top')?.getBoundingClientRect();
      const top = s ? s.getBoundingClientRect().top : -1;
      return { top: Math.round(top), bar: bar ? Math.round(bar.bottom) : 0, vh: innerHeight };
    });
    tapOk = tap.top >= tap.bar - 2 && tap.top <= tap.bar + 48;
    console.log('chapter tap #c-rec top', tap.top, 'bar', tap.bar, tapOk ? 'ok' : 'MISS');
  } else console.log('chapter tap MISSING');
  report.push({ name: 'tap', ...tap, tapOk });
  if (assertOk && !tapOk) failed = true;
  await page.context().close();
}

// The template has a single page. Logout remains keyboard-accessible at phone widths.
for (const [w,h] of [[466,678],[669,951],[951,669]]) {
  const {page,errors}=await open(browser,w,h,null);
  if(await page.locator('.altro summary:visible').count())await page.locator('.altro summary').click();
  const logout=page.locator('.lg-top a[href="/logout"]:visible').first();
  await logout.click({trial:true});await logout.focus();
  const ok=await logout.evaluate(el=>document.activeElement===el&&el.getBoundingClientRect().width>=44)&&!errors.length;
  report.push({name:'logout',size:w+'x'+h,ok});if(assertOk&&!ok)failed=true;
  await page.context().close();
}

// Open Altro must be a solid surface: background alpha ≥ 0.92, and item text ≥ 4.5:1
// against that surface blended at its computed alpha over the content actually under the
// menu (the «Come sto oggi?» text, the numbers, and the page background they sit on).
for (const themeName of ['dark', 'light']) {
  for (const [name, w, h] of [['390x844', 390, 844], ['466x678', 466, 678], ['626x890', 626, 890], ['669x951', 669, 951], ['678x466', 678, 466], ['951x669', 951, 669], ['1280x800', 1280, 800]]) {
    const { page, errors } = await open(browser, w, h, null, themeName);
    await page.evaluate(() => { const d = document.querySelector('.altro'); if (d) d.open = true; });
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const menu = await page.evaluate(() => {
      const parse = (s) => {
        if (!s) return null;
        const t = String(s).trim();
        let m = t.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?\s*\)$/);
        if (m) {
          const a = m[4] == null ? 1 : (m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]));
          return { r: +m[1], g: +m[2], b: +m[3], a };
        }
        m = t.match(/^#([\da-f]{3}|[\da-f]{6})$/i);
        if (m) {
          let h = m[1];
          if (h.length === 3) h = h.split('').map((c) => c + c).join('');
          return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: 1 };
        }
        m = t.match(/^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+%?))?\)$/);
        if (m) {
          const a = m[4] == null ? 1 : (String(m[4]).endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]));
          return { r: +m[1] * 255, g: +m[2] * 255, b: +m[3] * 255, a };
        }
        return null;
      };
      const lum = (c) => {
        const f = (v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
        return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
      };
      const contrast = (a, b) => {
        const L1 = lum(a), L2 = lum(b);
        const hi = Math.max(L1, L2), lo = Math.min(L1, L2);
        return (hi + 0.05) / (lo + 0.05);
      };
      const over = (fg, bg) => {
        const a = fg.a == null ? 1 : fg.a;
        return { r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a), a: 1 };
      };
      const pop = document.querySelector('.altro-pop');
      const pcs = pop ? getComputedStyle(pop) : null;
      const panel = pcs ? parse(pcs.backgroundColor) : null;
      const round = (n) => Math.round(n * 100) / 100;
      const rgb = (c) => `rgb(${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)})`;
      const opaque = (c) => c && c.a > 0.95;
      // body.e2 is transparent; the page color is the opaque html background.
      const pageBg = [document.body, document.documentElement]
        .map((el) => parse(getComputedStyle(el).backgroundColor))
        .find(opaque) || null;
      const paintedBg = (el) => {
        let n = el;
        while (n) {
          const bg = parse(getComputedStyle(n).backgroundColor);
          if (opaque(bg)) return bg;
          n = n.parentElement;
        }
        return pageBg;
      };
      const samples = [];
      const add = (label, color) => {
        if (!color || color.a < 0.5) return;
        const key = rgb(color);
        if (samples.some((s) => s.key === key && s.label === label)) return;
        samples.push({ label, key, c: { r: color.r, g: color.g, b: color.b, a: 1 } });
      };
      const consider = (el, label) => {
        if (!el) return;
        add(label + ' text', parse(getComputedStyle(el).color));
        add(label + ' bg', paintedBg(el));
      };
      const heading = [...document.querySelectorAll('h2')].find((el) => (el.textContent || '').includes('Come sto oggi'));
      const pr = pop ? pop.getBoundingClientRect() : null;
      const hits = (el) => {
        if (!el || !pr) return false;
        const r = el.getBoundingClientRect();
        return r.width > 2 && r.height > 2 && r.right > pr.left + 1 && r.left < pr.right - 1 && r.bottom > pr.top + 1 && r.top < pr.bottom - 1;
      };
      if (hits(heading)) consider(heading, 'Come sto oggi?');
      for (const el of document.querySelectorAll('.e2m .big, .e2m .mid')) {
        if (hits(el)) consider(el, ((el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 22) || 'number'));
      }
      if (pr) {
        for (const fx of [0.25, 0.5, 0.8]) for (const fy of [0.3, 0.6, 0.85]) {
          const stack = document.elementsFromPoint(pr.left + pr.width * fx, pr.top + pr.height * fy);
          const hit = stack.find((el) => el !== pop && !el.closest('.altro') && !el.closest('.lg-top') && el !== document.body && el !== document.documentElement);
          if (!hit) continue;
          const label = ((hit.innerText || hit.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 28) || hit.tagName.toLowerCase());
          consider(hit, label);
        }
      }
      if (pageBg) add('page bg', pageBg);
      const items = [];
      let minContrast = null;
      let worstUnder = null;
      for (const el of document.querySelectorAll('.altro-pop a')) {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden' || r.width < 2 || r.height < 2) continue;
        const text = parse(cs.color);
        const fill = parse(cs.backgroundColor);
        let worst = null;
        let worstLabel = null;
        for (const back of samples) {
          let surface = panel ? over(panel, back.c) : back.c;
          if (fill && fill.a > 0.01) surface = over(fill, surface);
          const ratio = text ? contrast(text, surface) : 0;
          if (worst == null || ratio < worst) { worst = ratio; worstLabel = back.label; }
        }
        if (worst != null && (minContrast == null || worst < minContrast)) { minContrast = worst; worstUnder = worstLabel; }
        items.push({ t: (el.textContent || '').trim(), contrast: worst == null ? null : round(worst) });
      }
      return {
        alpha: panel ? round(panel.a) : 0,
        panel: pcs ? pcs.backgroundColor : '',
        blur: pcs ? pcs.backdropFilter || pcs.webkitBackdropFilter || 'none' : 'none',
        minContrast: minContrast == null ? 0 : round(minContrast),
        worstUnder,
        items,
        under: samples.map((s) => s.label + ' ' + s.key),
      };
    });
    const blurOk = typeof menu.blur === 'string' && menu.blur !== 'none' && /\bblur\(/.test(menu.blur);
    const altroOn = await page.evaluate(() => {
      const el = document.querySelector('.lg-top .altro');
      if (!el) return false;
      const cs = getComputedStyle(el);
      return cs.display !== 'none' && cs.visibility !== 'hidden';
    });
    const solid = menu.alpha >= 0.92 && menu.minContrast >= 4.5 && blurOk && menu.items.length > 0 && !errors.length;
    const menuOk = !altroOn || solid;
    console.log('menu', name, themeName, !altroOn ? 'hidden' : solid ? 'solid' : 'THIN', 'alpha', menu.alpha, 'contrast', menu.minContrast, 'blur', blurOk ? 'yes' : 'NO', JSON.stringify(menu));
    report.push({ name: 'menu', size: name, theme: themeName, solid: menuOk, blurOk, ...menu });
    if (assertOk && !menuOk) failed = true;

    // Focus ring ≥ 3:1. Menu items against the menu surface at its real alpha blended over the
    // content under the panel. Top-bar controls against the bar’s translucent fills over the page.
    // The fill accent #b8921a is never a focus ring.
    const focus = await page.evaluate(() => {
      const parse = (s) => {
        if (!s) return null;
        const t = String(s).trim();
        let m = t.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?\s*\)$/);
        if (m) {
          const a = m[4] == null ? 1 : (m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]));
          return { r: +m[1], g: +m[2], b: +m[3], a };
        }
        m = t.match(/^#([\da-f]{3}|[\da-f]{6})$/i);
        if (m) {
          let h = m[1];
          if (h.length === 3) h = h.split('').map((c) => c + c).join('');
          return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: 1 };
        }
        m = t.match(/^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+%?))?\)$/);
        if (m) {
          const a = m[4] == null ? 1 : (String(m[4]).endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]));
          return { r: +m[1] * 255, g: +m[2] * 255, b: +m[3] * 255, a };
        }
        return null;
      };
      const lum = (c) => {
        const f = (v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
        return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
      };
      const contrast = (a, b) => {
        const L1 = lum(a), L2 = lum(b);
        return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
      };
      const over = (fg, bg) => {
        const a = fg.a == null ? 1 : fg.a;
        return { r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a), a: 1 };
      };
      const round = (n) => Math.round(n * 100) / 100;
      const rgb = (c) => c ? `rgb(${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)})` : '';
      const fillAccent = (c) => !!c && Math.abs(c.r - 184) < 1.5 && Math.abs(c.g - 146) < 1.5 && Math.abs(c.b - 26) < 1.5;
      const opaque = (c) => c && c.a > 0.95;
      const pageBg = [document.body, document.documentElement]
        .map((el) => parse(getComputedStyle(el).backgroundColor))
        .find(opaque) || null;
      const paintedBg = (el) => {
        let n = el;
        while (n) {
          const bg = parse(getComputedStyle(n).backgroundColor);
          if (opaque(bg)) return bg;
          n = n.parentElement;
        }
        return pageBg;
      };
      const shown = (el) => {
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 2 && r.height > 2;
      };
      const pop = document.querySelector('.altro-pop');
      const panel = pop ? parse(getComputedStyle(pop).backgroundColor) : null;
      const samples = [];
      const add = (label, color) => {
        if (!color || color.a < 0.5) return;
        const key = rgb(color);
        if (samples.some((s) => s.key === key && s.label === label)) return;
        samples.push({ label, key, c: { r: color.r, g: color.g, b: color.b, a: 1 } });
      };
      const consider = (el, label) => {
        if (!el) return;
        add(label + ' text', parse(getComputedStyle(el).color));
        add(label + ' bg', paintedBg(el));
      };
      const heading = [...document.querySelectorAll('h2')].find((el) => (el.textContent || '').includes('Come sto oggi'));
      const pr = pop ? pop.getBoundingClientRect() : null;
      const hits = (el) => {
        if (!el || !pr) return false;
        const r = el.getBoundingClientRect();
        return r.width > 2 && r.height > 2 && r.right > pr.left + 1 && r.left < pr.right - 1 && r.bottom > pr.top + 1 && r.top < pr.bottom - 1;
      };
      if (hits(heading)) consider(heading, 'Come sto oggi?');
      for (const el of document.querySelectorAll('.e2m .big, .e2m .mid')) {
        if (hits(el)) consider(el, ((el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 22) || 'number'));
      }
      if (pageBg) add('page bg', pageBg);
      const panelSurfaces = samples.map((back) => ({ label: back.label, c: panel ? over(panel, back.c) : back.c }));
      const bar = document.querySelector('.lg-top');
      const barSurfaces = [];
      const pushBar = (color, label) => {
        if (!color || color.a <= 0.01) return;
        const c = pageBg && color.a < 0.99 ? over(color, pageBg) : color;
        if (barSurfaces.some((s) => rgb(s.c) === rgb(c))) return;
        barSurfaces.push({ label, c });
      };
      if (bar) {
        const bcs = getComputedStyle(bar);
        pushBar(parse(bcs.backgroundColor), 'bar');
        for (const v of ['--tint', '--tint-hi', '--tint-edge']) pushBar(parse(bcs.getPropertyValue(v)), v);
      }
      if (pageBg) pushBar(pageBg, 'page bg');
      const worst = (ring, surfaces) => {
        let ratio = null;
        let label = null;
        let surface = null;
        for (const s of surfaces) {
          const n = contrast(ring, s.c);
          if (ratio == null || n < ratio) { ratio = n; label = s.label; surface = s.c; }
        }
        return { ratio: ratio == null ? 0 : ratio, label, surface };
      };
      const near = (a, b) => a != null && Math.abs(a - b) < 0.2;
      const read = (el, surfaces) => {
        try { el.focus({ focusVisible: true }); } catch (e) { el.focus(); }
        const cs = getComputedStyle(el);
        const ring = parse(cs.outlineColor);
        const widthN = parseFloat(cs.outlineWidth);
        const offN = parseFloat(cs.outlineOffset);
        const width = Number.isFinite(widthN) ? round(widthN) : null;
        const offset = Number.isFinite(offN) ? round(offN) : null;
        const painted = cs.outlineStyle !== 'none' && widthN >= 1 && ring && ring.a > 0.5;
        const hit = painted ? worst(ring, surfaces) : { ratio: 0, label: 'no-ring', surface: null };
        const pageSurface = surfaces === panelSurfaces ? panelSurfaces.find((s) => s.label === 'page bg') : null;
        const box = el.getBoundingClientRect();
        // Outer edge of the stroke sits outline-offset + outline-width from the border edge.
        // Positive is outside the item; the inset ring (offset -3, width 2) stays 1px inside.
        const outer = (Number.isFinite(offN) ? offN : 0) + (Number.isFinite(widthN) ? widthN : 0);
        const ringBox = { left: box.left - outer, top: box.top - outer, right: box.right + outer, bottom: box.bottom + outer };
        return {
          t: (el.getAttribute('aria-label') || el.textContent || el.tagName).replace(/\s+/g, ' ').trim().slice(0, 28),
          contrast: round(hit.ratio),
          onPage: painted && pageSurface && ring ? round(contrast(ring, pageSurface.c)) : null,
          ring: rgb(ring),
          surface: rgb(hit.surface),
          under: hit.label,
          width,
          offset,
          fillAccent: fillAccent(ring),
          painted,
          insetClass: el.classList.contains('jk-focus-inset'),
          theme: !!el.closest('.thsw'),
          box: { left: box.left, top: box.top, right: box.right, bottom: box.bottom },
          ringBox,
        };
      };
      const menuRows = [...document.querySelectorAll('.altro-pop a')].filter(shown).map((el) => read(el, panelSurfaces));
      const barRows = [...document.querySelectorAll('.lg-top a, .lg-top summary, .lg-top button')]
        .filter((el) => shown(el) && !el.closest('.altro-pop'))
        .map((el) => read(el, barSurfaces));
      const popBox = pop ? pop.getBoundingClientRect() : null;
      const radius = pop ? (parseFloat(getComputedStyle(pop).borderTopLeftRadius) || 0) : 0;
      const inRound = (x, y) => {
        if (!popBox) return false;
        const l = popBox.left, t = popBox.top, ri = popBox.right, b = popBox.bottom;
        if (x < l - 0.75 || y < t - 0.75 || x > ri + 0.75 || y > b + 0.75) return false;
        const cx = Math.min(Math.max(x, l + radius), ri - radius);
        const cy = Math.min(Math.max(y, t + radius), b - radius);
        const dx = x - cx, dy = y - cy;
        return dx * dx + dy * dy <= (radius + 0.75) * (radius + 0.75);
      };
      const overlaps = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0.5
        && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0.5;
      const inside = (inner, outer) => inner.left >= outer.left - 0.75 && inner.top >= outer.top - 0.75
        && inner.right <= outer.right + 0.75 && inner.bottom <= outer.bottom + 0.75;
      for (const row of menuRows) {
        row.inItem = inside(row.ringBox, row.box);
        row.inPanel = [row.ringBox.left, row.ringBox.right].every((x) => [row.ringBox.top, row.ringBox.bottom].every((y) => inRound(x, y)));
        row.overlap = menuRows.some((other) => other !== row && overlaps(row.ringBox, other.box));
      }
      for (const row of menuRows) {
        const why = [!row.inItem && 'item', !row.inPanel && 'panel', row.overlap && 'neighbor'].filter(Boolean);
        row.clip = why.length ? why.join('+') : 'inside';
        delete row.box;
        delete row.ringBox;
      }
      const themeRows = barRows.filter((row) => row.theme);
      for (const row of themeRows) {
        row.inItem = inside(row.ringBox, row.box);
        row.overlap = themeRows.some((other) => other !== row && overlaps(row.ringBox, other.box));
        const why = [!row.inItem && 'item', row.overlap && 'neighbor'].filter(Boolean);
        row.clip = why.length ? why.join('+') : 'inside';
      }
      for (const row of barRows) {
        if (!row.theme) row.clip = near(row.width, 2) && near(row.offset, 3) ? 'outward' : 'offset';
        delete row.box;
        delete row.ringBox;
      }
      const rows = [...menuRows, ...barRows];
      const min = rows.reduce((m, r) => Math.min(m, r.contrast), 99);
      const contrastOk = (r) => r.painted && r.contrast >= 3 && !r.fillAccent;
      const themeGeom = (r) => near(r.width, 2) && near(r.offset, -3) && r.insetClass && r.inItem && !r.overlap;
      const barGeom = (r) => r.theme ? themeGeom(r) : near(r.width, 2) && near(r.offset, 3);
      const menuGeom = (r) => near(r.width, 2) && near(r.offset, -3) && r.insetClass && r.inItem && r.inPanel && !r.overlap;
      const menuExpected = !!document.querySelector('.lg-top .altro') && shown(document.querySelector('.lg-top .altro'));
      const contrastPass = barRows.length > 0 && rows.every(contrastOk) && (!menuExpected || menuRows.length > 0);
      const geomPass = (!menuExpected || menuRows.every(menuGeom)) && themeRows.length === 3 && barRows.every(barGeom);
      const ok = contrastPass && geomPass;
      return { ok, contrastPass, geomPass, min: round(min), menu: menuRows, bar: barRows };
    });
    const focusOk = !!(focus && focus.ok) && !errors.length;
    console.log('focus', name, themeName, focusOk ? 'RING' : 'FAIL', 'contrast', focus.contrastPass ? 'ok' : 'low', 'geom', focus.geomPass ? 'ok' : 'bad', 'min', focus.min, JSON.stringify(focus));
    report.push({ name: 'focus', size: name, theme: themeName, focusOk, ...focus });
    if (assertOk && !focusOk) failed = true;
    await page.context().close();
  }
}

for (const [name, w, h] of [['1280x800', 1280, 800], ['1440x900', 1440, 900], ['1920x1080', 1920, 1080]]) {
  const { page, errors } = await open(browser, w, h, null);
  const hero = await page.evaluate(() => {
    const big = document.querySelector('.hero.h2 .hm .big')?.getBoundingClientRect();
    const hm = document.querySelector('.hero.h2 .hm')?.getBoundingClientRect();
    return { w: Math.round(big?.width || 0), col: Math.round(hm?.width || 0) };
  });
  const heroOk = hero.col > 80 && hero.w > 40 && !errors.length;
  console.log('hero', name, JSON.stringify(hero), heroOk ? 'ok' : 'COLLAPSED');
  if (name === '1280x800') await page.screenshot({ path: path.join(outDir, '1280x800.png'), fullPage: false });
  report.push({ name: 'hero-desk', size: name, ...hero, heroOk });
  if (assertOk && !heroOk) failed = true;
  await page.context().close();
}

{
  const { page, errors } = await open(browser, 678, 466, null);
  const frame = () => page.evaluate(() => {
    const clip = (r) => {
      const l = Math.max(r.left, 0), t = Math.max(r.top, 0), rt = Math.min(r.right, innerWidth), b = Math.min(r.bottom, innerHeight);
      return rt - l >= 1 && b - t >= 1 ? { l, t, rt, b } : null;
    };
    const hit = (a, b) => a && b && !(a.b <= b.t + 0.5 || a.t >= b.b - 0.5 || a.r <= b.l + 0.5 || a.l >= b.rt - 0.5);
    const n = document.querySelector('.chnav');
    const cs = n ? getComputedStyle(n) : null;
    const navVis = n && cs && cs.display !== 'none' && cs.visibility !== 'hidden' && cs.pointerEvents !== 'none' ? clip(n.getBoundingClientRect()) : null;
    let bars = null;
    for (const el of document.querySelectorAll('svg rect')) {
      if (el.closest('defs') || el.classList.contains('gapb')) continue;
      const raw = el.getBoundingClientRect();
      if (raw.width < 2 || raw.width > 80 || raw.height < 4) continue;
      const c = clip(raw);
      if (!c || !hit(navVis, c)) continue;
      if (!bars) bars = { t: c.t, b: c.b };
      else { bars.t = Math.min(bars.t, c.t); bars.b = Math.max(bars.b, c.b); }
    }
    const buttons = [...(n?.querySelectorAll('button') || [])].map((btn) => ({ t: btn.innerText.trim(), h: Math.round(btn.getBoundingClientRect().height) }));
    return {
      y: Math.round(scrollY),
      visible: !!navVis,
      overlap: !!bars,
      nav: navVis && { t: Math.round(navVis.t), b: Math.round(navVis.b) },
      bars: bars && { t: Math.round(bars.t), b: Math.round(bars.b) },
      buttons,
    };
  });
  const settle = (ms = 600) => new Promise((r) => setTimeout(r, ms));
  const maxY = await page.evaluate(() => Math.max(0, document.documentElement.scrollHeight - innerHeight));
  const ys = [];
  for (let y = 0; y <= maxY; y += 50) ys.push(y);
  if (ys[ys.length - 1] !== maxY) ys.push(maxY);
  let step0 = null;
  let direzione = false;
  let idle300 = null;
  let bottom = null;
  let bad = null;
  for (let i = 0; i < ys.length; i++) {
    if (i > 0) await page.evaluate((y) => scrollTo(0, y), ys[i]);
    await settle();
    const m = await frame();
    if (i === 0) {
      step0 = m;
      try {
        await page.locator('.chnav button', { hasText: 'Direzione' }).click({ trial: true, timeout: 1000 });
        direzione = true;
      } catch { direzione = false; }
    }
    if (ys[i] === 300) idle300 = m;
    if (i === ys.length - 1) bottom = m;
    if (m.overlap && !bad) bad = { step: i, ...m };
  }
  const tall = step0.buttons.length >= 3 && step0.buttons.every((b) => b.h >= 44);
  const step0Ok = step0.visible && !step0.overlap && direzione && tall;
  const idleOk = !!idle300 && (!idle300.visible || !idle300.overlap);

  await page.evaluate((y) => scrollTo(0, y), Math.max(0, maxY - 800));
  await page.evaluate((y) => new Promise((resolve) => {
    scrollTo(0, y);
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }), Math.max(0, maxY - 400));
  await settle();
  const hidden = await frame();
  await page.evaluate((y) => new Promise((resolve) => {
    scrollTo(0, y);
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }), Math.max(0, maxY - 450));
  const up = await frame();

  await page.evaluate((y) => new Promise((resolve) => {
    scrollTo(0, y);
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }), Math.max(0, maxY - 400));
  await page.evaluate(() => {
    const nav = document.querySelector('.chnav');
    const nodes = [...document.querySelectorAll('a[href], button, summary, input, select, textarea, [tabindex]')].filter((el) => {
      if (el.tabIndex < 0 || nav.contains(el)) return false;
      const cs = getComputedStyle(el);
      return cs.display !== 'none' && cs.visibility !== 'hidden';
    });
    const first = [...nav.querySelectorAll('button')].find((el) => el.tabIndex >= 0);
    const prev = nodes.filter((el) => first && (el.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING)).pop();
    if (prev) prev.focus();
  });
  await page.keyboard.press('Tab');
  const tab = await page.evaluate(() => {
    const el = document.activeElement;
    const r = el?.getBoundingClientRect();
    const inside = !!r && r.height >= 44 && r.top >= -1 && r.left >= -1 && r.bottom <= innerHeight + 1 && r.right <= innerWidth + 1;
    return { t: (el?.innerText || '').trim().split('\n')[0].slice(0, 24), inNav: !!el?.closest?.('.chnav'), inside, top: r ? Math.round(r.top) : null, bottom: r ? Math.round(r.bottom) : null, h: r ? Math.round(r.height) : 0 };
  });
  const clear = step0Ok && idleOk && hidden.visible === false && up.visible && tab.inNav && tab.inside && bottom?.visible && !bad && !errors.length;
  console.log('678x466 steps', ys.length, 'step0', step0Ok ? 'visible' : 'FAIL', 'direzione', direzione ? 'clickable' : 'MISS', 'idle300', idle300.visible ? 'visible' : 'hidden', idle300.overlap ? 'OVERLAP' : 'clear', 'after-down', hidden.visible ? 'visible' : 'hidden', 'tab', tab.t, tab.inNav ? 'nav' : 'MISS', tab.inside ? 'inside' : 'OUT', 'up', up.visible ? 'visible' : 'HIDDEN', 'bottom', bottom?.visible ? 'visible' : 'HIDDEN', bad ? ('FAIL step ' + bad.step + ' y' + bad.y + ' nav ' + JSON.stringify(bad.nav) + ' bars ' + JSON.stringify(bad.bars)) : 'clear');
  report.push({ name: 'short-nav', steps: ys.length, step0, direzione, idle300, tab, up: { visible: up.visible, y: up.y }, bottom, clear, bad });
  if (assertOk && !clear) failed = true;
  await page.context().close();
}

for (const [name, w] of [['1100x800', 1100], ['1220x800', 1220], ['1280x800', 1280], ['1440x800', 1440], ['1600x800', 1600], ['1920x800', 1920]]) {
  for (const theme of ['dark', 'light']) {
    const { page, errors } = await open(browser, w, 800, null, theme);
    const m = await page.evaluate(() => {
      const html = document.documentElement, body = document.body;
      const prevH = html.style.overflowX, prevB = body.style.overflowX;
      html.style.overflowX = 'visible';
      body.style.overflowX = 'visible';
      const vw = innerWidth;
      const scrollOver = html.scrollWidth - vw;
      const skip = (el) => el.closest('.lg-bg, .deco, script, style');
      const offenders = [];
      for (const el of document.querySelectorAll('body *')) {
        if (skip(el)) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) continue;
        if (r.right > vw + 1) offenders.push({ cls: (el.getAttribute('class') || el.tagName).toString().slice(0, 48), over: Math.round(r.right - vw) });
      }
      html.style.overflowX = prevH;
      body.style.overflowX = prevB;
      const mid = document.querySelector('.hero.h2 .bal .mid');
      const bal = document.querySelector('.hero.h2 .bal');
      const mr = mid?.getBoundingClientRect();
      const br = bal?.getBoundingClientRect();
      let contentRight = mr ? mr.right : 0;
      if (mid) {
        const range = document.createRange();
        range.selectNodeContents(mid);
        contentRight = Math.max(contentRight, range.getBoundingClientRect().right);
        for (const el of mid.querySelectorAll('*')) contentRight = Math.max(contentRight, el.getBoundingClientRect().right);
      }
      const u = mid?.querySelector('.u')?.getBoundingClientRect();
      const bv = mid?.querySelector('.bv')?.getBoundingClientRect();
      let labelGap = null;
      if (mid && bv) {
        for (const node of mid.childNodes) {
          if (node.nodeType !== 3) continue;
          const raw = node.textContent || '';
          const word = raw.match(/Deficit|Surplus/);
          if (!word) continue;
          const start = raw.indexOf(word[0]);
          const range = document.createRange();
          range.setStart(node, start);
          range.setEnd(node, start + word[0].length);
          labelGap = bv.left - range.getBoundingClientRect().right;
        }
      }
      const text = (mid?.innerText || '').replace(/\s+/g, ' ').trim();
      const rowInside = !!(mr && br && u && u.width > 2 && contentRight <= br.right + 1 && u.right <= br.right + 1 && u.right <= vw + 1 && mr.left >= br.left - 1);
      return {
        scrollOver: Math.round(scrollOver),
        scrollWidth: html.scrollWidth,
        vw,
        rowInside,
        labelGap: labelGap == null ? null : Math.round(labelGap * 10) / 10,
        text,
        contentRight: Math.round(contentRight),
        uRight: u ? Math.round(u.right) : null,
        balRight: br ? Math.round(br.right) : null,
        font: mid ? getComputedStyle(mid).fontSize : null,
        offenders: offenders.slice(0, 4),
        offenderN: offenders.length,
      };
    });
    const gapOk = ![1220, 1280, 1440].includes(w) || m.labelGap >= 3;
    const ok = m.scrollOver <= 0 && m.offenderN === 0 && m.rowInside && gapOk && /Deficit/.test(m.text) && /kcal/.test(m.text) && !errors.length;
    console.log('overflow', name, theme, ok ? 'inside' : 'OVERFLOW', JSON.stringify(m));
    report.push({ name: 'overflow', size: name, theme, ok, ...m });
    if (assertOk && !ok) failed = true;
    await page.context().close();
  }
}

// Balance comparison: kcal stays inside .mid and at least 12px left of the
// details hairline, from 1100 to 1920 in 20px steps, both themes.
for (const theme of ['dark', 'light']) {
  const { page, errors } = await open(browser, 1100, 800, null, theme);
  const rows = [];
  for (let w = 1100; w <= 1920; w += 20) {
    await page.setViewportSize({ width: w, height: 800 });
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const m = await page.evaluate(() => {
      const mid = document.querySelector('.hero.h2 .bal:not(.comp) .mid');
      const cmp = document.querySelector('.hero.h2 .bal:not(.comp) > .cmp');
      const box = mid?.getBoundingClientRect();
      const u = mid?.querySelector('.u')?.getBoundingClientRect();
      const bv = mid?.querySelector('.bv')?.getBoundingClientRect();
      let contentRight = box ? box.right : 0;
      if (mid) {
        const range = document.createRange();
        range.selectNodeContents(mid);
        contentRight = Math.max(contentRight, range.getBoundingClientRect().right);
      }
      let labelGap = null;
      if (mid && bv) {
        for (const node of mid.childNodes) {
          if (node.nodeType !== 3) continue;
          const raw = node.textContent || '';
          const word = raw.match(/Deficit|Surplus/);
          if (!word) continue;
          const start = raw.indexOf(word[0]);
          const range = document.createRange();
          range.setStart(node, start);
          range.setEnd(node, start + word[0].length);
          labelGap = bv.left - range.getBoundingClientRect().right;
        }
      }
      const border = cmp ? parseFloat(getComputedStyle(cmp).borderLeftWidth) || 0 : 0;
      const divider = border >= 1 ? cmp.getBoundingClientRect().left : null;
      const round = (n) => n == null ? null : Math.round(n * 10) / 10;
      return {
        contentRight: round(contentRight),
        midRight: round(box?.right),
        midW: round(box?.width),
        contentW: round(box ? contentRight - box.left : null),
        scrollOver: mid ? mid.scrollWidth - mid.clientWidth : null,
        uRight: round(u?.right),
        divider: round(divider),
        clearance: divider == null || !u ? null : round(divider - u.right),
        labelGap: round(labelGap),
        cmpW: cmp ? Math.round(cmp.getBoundingClientRect().width) : null,
      };
    });
    const inside = m.uRight != null && m.midRight != null && m.uRight <= m.midRight + 0.5 && m.contentRight <= m.midRight + 0.5 && m.scrollOver <= 1;
    const hairOk = m.clearance == null || m.clearance >= 12;
    const gapOk = m.labelGap != null && m.labelGap >= 3;
    const ok = inside && hairOk && gapOk && !errors.length;
    rows.push({ w, ok, ...m });
    if ([1220, 1280, 1440, 1600].includes(w) || !ok) {
      console.log('bal-clear', w, theme, ok ? 'clear' : 'CROSS', JSON.stringify(m));
    }
    report.push({ name: 'bal-clear', size: w + 'x800', theme, ok, ...m });
    if (assertOk && !ok) failed = true;
  }
  const bad = rows.filter((r) => !r.ok).map((r) => r.w);
  console.log('bal-clear', theme, bad.length ? 'FAIL ' + bad.join(',') : 'all clear', 'steps', rows.length);
  await page.context().close();
}

for (const [name, w, h] of [['466x678', 466, 678], ['669x951', 669, 951]]) {
  const { page, errors } = await open(browser, w, h, null);
  await page.evaluate(() => {
    const tot = document.querySelector('.hr.meals li.tot');
    const nav = document.querySelector('.chnav');
    if (!tot || !nav) return;
    const navTop = nav.getBoundingClientRect().top;
    const h = tot.getBoundingClientRect().height;
    const absTop = tot.getBoundingClientRect().top + scrollY;
    scrollTo(0, Math.max(0, absTop - (navTop - h - 12)));
  });
  await new Promise((r) => setTimeout(r, 200));
  const end = await page.evaluate(() => {
    const tot = document.querySelector('.hr.meals li.tot')?.getBoundingClientRect();
    const nav = document.querySelector('.chnav')?.getBoundingClientRect();
    if (!tot || !nav) return null;
    return { totBottom: Math.round(tot.bottom), totTop: Math.round(tot.top), totH: Math.round(tot.height), navTop: Math.round(nav.top) };
  });
  const endOk = !!(end && end.totH >= 16 && end.totTop >= -1 && end.totBottom <= end.navTop + 1) && !errors.length;
  console.log('end row', name, JSON.stringify(end), endOk ? 'clear' : 'COVERED');
  report.push({ name: 'end-row', size: name, ...end, endOk });
  if (assertOk && !endOk) failed = true;
  await page.context().close();
}

// Fixed chapter nav (viewport taller than 500px): at the bottom of the page the
// footer keeps at least 14px of clear space above the nav, plain and with the
// simulated home-indicator inset.
for (const [name, w, h] of [['466x678', 466, 678], ['390x844', 390, 844]]) {
  for (const [label, ins] of [['plain', null], ['safe', insetsFor(w, h)]]) {
    const { page, errors } = await open(browser, w, h, ins);
    await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const end = await page.evaluate(() => {
      const last = document.querySelector('.e2m > .end');
      const nav = document.querySelector('.chnav');
      if (!last || !nav) return null;
      const lr = last.getBoundingClientRect();
      const nr = nav.getBoundingClientRect();
      const shown = getComputedStyle(nav).display !== 'none' && getComputedStyle(nav).pointerEvents !== 'none';
      const pad = parseFloat(getComputedStyle(document.querySelector('.e2m')).paddingBottom) || 0;
      return {
        dockAtTop: nr.top < innerHeight / 2,
        footerVisible: lr.top >= 0 && lr.bottom <= innerHeight,
        lastBottom: Math.round(lr.bottom * 10) / 10,
        navTop: Math.round(nr.top * 10) / 10,
        gap: Math.round((nr.top - lr.bottom) * 10) / 10,
        navH: Math.round(nr.height),
        pad: Math.round(pad * 10) / 10,
        shown,
      };
    });
    const endOk = !!(end && end.shown && end.footerVisible && (end.dockAtTop || end.gap >= 14 - 0.5)) && !errors.length;
    console.log('page end', name, label, JSON.stringify(end), endOk ? 'clear' : 'SHORT');
    report.push({ name: 'page-end', size: name, label, ...end, endOk });
    if (assertOk && !endOk) failed = true;
    await page.context().close();
  }
}

// Bilancio medio · 7 giorni. Labels stay inside the chart and clear of their neighbours.
// Omission rule: the 0 baseline, the first and last date, and the highest and lowest
// values stay visible. Intermediate dates are all of them, or every other one (a
// constant stride of 2 that still includes both ends) — never one gap in the middle.
// A bar whose value is omitted is focusable; focus, tap, and hover reveal that value,
// and the chart's accessible name reads all seven days with their values.
for (const theme of ['dark', 'light']) {
  for (const [name, w, h] of SIZES) {
    const { page, errors } = await open(browser, w, h, null, theme);
    const bal = await page.evaluate(async () => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const svg = document.querySelector('[data-v="bal"] svg');
      if (!svg) return { missing: true };
      const host = svg.closest('[data-v="bal"]');
      const vb = svg.viewBox.baseVal;
      const sr = svg.getBoundingClientRect();
      const week = /^(Dom|Lun|Mar|Mer|Gio|Ven|Sab)\b/;
      const num = /^[−+\-]?\d[\d.,]*$/;
      const texts = [...svg.querySelectorAll('text')].map((el) => {
        const r = el.getBoundingClientRect();
        const bb = el.getBBox();
        const cs = getComputedStyle(el);
        const fillOp = parseFloat(cs.fillOpacity);
        return {
          t: (el.textContent || '').trim(),
          cls: el.getAttribute('class') || '',
          fs: parseFloat(cs.fontSize),
          op: (parseFloat(cs.opacity) || 1) * (Number.isFinite(fillOp) ? fillOp : 1),
          cx: r.left + r.width / 2,
          r: { left: r.left, top: r.top, right: r.right, bottom: r.bottom },
          bb: { x: bb.x, y: bb.y, w: bb.width, h: bb.height },
        };
      });
      const inside = (t) => t.r.left >= sr.left - 0.5 && t.r.top >= sr.top - 0.5 && t.r.right <= sr.right + 0.5 && t.r.bottom <= sr.bottom + 0.5
        && t.bb.x >= -0.5 && t.bb.y >= -0.5 && t.bb.x + t.bb.w <= vb.width + 0.5 && t.bb.y + t.bb.h <= vb.height + 0.5;
      const overlaps = [];
      for (let i = 0; i < texts.length; i++) {
        for (let j = i + 1; j < texts.length; j++) {
          const a = texts[i].r, b = texts[j].r;
          const ww = Math.min(a.right, b.right) - Math.max(a.left, b.left);
          const hh = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          if (ww > 0.5 && hh > 0.5) overlaps.push(texts[i].t + '×' + texts[j].t);
        }
      }
      const bars = [...svg.querySelectorAll('rect')]
        .filter((el) => !el.closest('defs') && !el.classList.contains('gapb'))
        .map((el) => {
          const r = el.getBoundingClientRect();
          return { el, x: r.left + r.width / 2, top: r.top, bottom: r.bottom };
        })
        .sort((a, b) => a.x - b.x);
      const n = bars.length;
      const step = n > 1 ? Math.abs(bars[1].x - bars[0].x) : 40;
      const nearest = (cx) => {
        let best = -1;
        let dist = Infinity;
        bars.forEach((b, i) => {
          const d = Math.abs(b.x - cx);
          if (d < dist) { dist = d; best = i; }
        });
        return dist <= step * 0.6 ? best : -1;
      };
      const valueAt = Array(n).fill(null);
      const dateAt = Array(n).fill(null);
      for (const t of texts) {
        const i = nearest(t.cx);
        if (i < 0) continue;
        if (t.cls.split(/\s+/).includes('lbl') && num.test(t.t) && t.t !== '0') valueAt[i] = t.t;
        else if (week.test(t.t)) dateAt[i] = t.t;
      }
      const zeroEl = [...svg.querySelectorAll('.grid text')].find((el) => (el.textContent || '').trim() === '0');
      const scaleY = vb.height ? sr.height / vb.height : 1;
      const zeroClient = zeroEl ? sr.top + (parseFloat(zeroEl.getAttribute('y')) - 4) * scaleY : null;
      const extents = bars.map((b) => {
        if (zeroClient == null) return 0;
        if (b.bottom > zeroClient + 1) return -(b.bottom - zeroClient);
        return zeroClient - b.top;
      });
      const hi = n ? Math.max(...extents) : 0;
      const lo = n ? Math.min(...extents) : 0;
      const eps = 1.5;
      const maxI = extents.findIndex((v) => Math.abs(v - hi) <= eps);
      const minI = extents.findIndex((v) => Math.abs(v - lo) <= eps);
      const need = new Set([maxI, minI].filter((i) => i >= 0));
      if (n && (Math.abs(extents[n - 1] - hi) <= eps || Math.abs(extents[n - 1] - lo) <= eps)) need.add(n - 1);
      const dateIdx = dateAt.map((d, i) => (d ? i : -1)).filter((i) => i >= 0);
      const valueIdx = valueAt.map((d, i) => (d ? i : -1)).filter((i) => i >= 0);
      let pattern = '';
      if (n > 0 && dateIdx.length === n && dateIdx.every((v, i) => v === i)) pattern = 'all';
      else if (dateIdx.length >= 2 && dateIdx[0] === 0 && dateIdx[dateIdx.length - 1] === n - 1 && dateIdx.every((v, i) => v === i * 2)) pattern = 'alt';
      const always = !!(zeroEl && n === 7 && dateAt[0] && dateAt[n - 1] && [...need].every((i) => valueAt[i]));
      const bits = [svg.getAttribute('aria-label') || ''];
      for (const id of ((svg.getAttribute('aria-labelledby') || '') + ' ' + (svg.getAttribute('aria-describedby') || '')).split(/\s+/)) {
        if (!id) continue;
        const el = document.getElementById(id);
        if (el) bits.push(el.textContent || '');
      }
      const acc = bits.join(' ').replace(/\s+/g, ' ');
      const dayVals = acc.match(/(?:Dom|Lun|Mar|Mer|Gio|Ven|Sab)\s+\d{1,2}\s+[−+\-]?\d[\d.,]*/g) || [];
      const ariaDays = new Set(dayVals.map((s) => s.match(/^(?:Dom|Lun|Mar|Mer|Gio|Ven|Sab)\s+\d{1,2}/)[0])).size;
      const focusable = n === 7 && bars.every((b) => b.el.getAttribute('tabindex') === '0');
      const omitted = valueAt.findIndex((v) => !v);
      let expected = null;
      if (omitted >= 0) {
        for (let i = 0; i < n; i++) {
          if (valueAt[i] && Math.abs(extents[i] - extents[omitted]) <= eps) { expected = valueAt[i]; break; }
        }
      }
      const tipOf = () => {
        const tip = host && host.querySelector(':scope > .lg-tip');
        if (!tip || !tip.classList.contains('on')) return '';
        const op = parseFloat(getComputedStyle(tip).opacity);
        if (!(op > 0.9)) return '';
        return (tip.textContent || '').replace(/\s+/g, ' ').trim();
      };
      const probe = document.createElement('i');
      probe.style.color = 'var(--focus)';
      document.body.appendChild(probe);
      const focusRgb = getComputedStyle(probe).color.replace(/\s/g, '');
      probe.remove();
      const target = bars[omitted >= 0 ? omitted : 0];
      let ring = false;
      let revealFocus = omitted < 0;
      let revealHover = omitted < 0;
      let revealTap = omitted < 0;
      let sheetClosed = true;
      if (target) {
        const point = target.el.getBoundingClientRect();
        const ptr = (type) => new PointerEvent(type, {
          bubbles: true, cancelable: true, pointerType: 'mouse',
          clientX: point.left + point.width / 2, clientY: point.top + point.height / 2,
        });
        try { target.el.focus({ focusVisible: true }); } catch (e) { target.el.focus(); }
        await wait(220);
        const cs = getComputedStyle(target.el);
        ring = document.activeElement === target.el
          && cs.outlineStyle === 'solid'
          && Math.abs(parseFloat(cs.outlineWidth) - 2) < 0.2
          && Math.abs(parseFloat(cs.outlineOffset) - (-3)) < 0.2
          && cs.outlineColor.replace(/\s/g, '') === focusRgb;
        if (omitted >= 0) revealFocus = !!expected && tipOf().includes(expected);
        target.el.blur();
        target.el.dispatchEvent(ptr('pointerleave'));
        await wait(40);
        if (omitted >= 0 && expected && !tipOf()) {
          target.el.dispatchEvent(ptr('pointerenter'));
          target.el.dispatchEvent(ptr('pointermove'));
          await wait(220);
          revealHover = tipOf().includes(expected);
          target.el.dispatchEvent(ptr('pointerleave'));
          await wait(40);
          if (!tipOf()) {
            target.el.dispatchEvent(ptr('pointerdown'));
            target.el.dispatchEvent(new MouseEvent('click', {
              bubbles: true, cancelable: true, clientX: point.left + point.width / 2, clientY: point.top + point.height / 2,
            }));
            await wait(220);
            revealTap = tipOf().includes(expected);
            const sh = document.querySelector('#lg-sheet');
            sheetClosed = !sh || !!sh.hidden;
          }
        }
      }
      return {
        n: texts.length,
        bars: n,
        clipped: texts.filter((t) => !inside(t)).map((t) => t.t),
        overlaps,
        tiny: texts.filter((t) => !(t.fs >= 12) || t.op < 0.85).map((t) => t.t + '@' + t.fs),
        hasZero: texts.some((t) => t.t === '0'),
        hasValue: texts.some((t) => num.test(t.t) && t.t !== '0'),
        hasDate: texts.some((t) => /[A-Za-zÀ-ÿ]/.test(t.t)),
        always,
        pattern,
        dates: dateIdx.join(','),
        values: valueIdx.join(','),
        ariaDays,
        focusable,
        ring,
        omitted,
        expected,
        revealFocus,
        revealHover,
        revealTap,
        sheetClosed,
      };
    });
    const geomOk = !!(bal && !bal.missing && bal.n >= 4 && bal.clipped.length === 0 && bal.overlaps.length === 0 && bal.tiny.length === 0 && bal.hasZero && bal.hasValue && bal.hasDate);
    const ruleOk = !!(bal && bal.always && (bal.pattern === 'all' || bal.pattern === 'alt') && bal.ariaDays === 7 && bal.focusable && bal.ring && bal.revealFocus && bal.revealHover && bal.revealTap && bal.sheetClosed);
    const balOk = geomOk && ruleOk && !errors.length;
    console.log('bal', name, theme, balOk ? 'labels' : (geomOk ? 'RULE' : 'COLLIDE'), JSON.stringify(bal));
    report.push({ name: 'bal-labels', size: name, theme, balOk, ...bal });
    if (assertOk && !balOk) failed = true;
    await page.context().close();
  }
}

// Invented chart stress values below test pixel alignment and numeric widths, not logged meals.
// Value labels on the 7-day balance chart. Flat, close, wide, adj, mixed, mixed2 and positive are synthetic.
// No value label may overlap a y-axis label, any other label, or a bar (0.5px).
// The highest and lowest stay visible and inside the chart at 390, 466, 626, 669, 678, 951 and 1280, light and dark.
// The balance axis always includes zero; its exact "0" label must render inside the chart.
function itNum(n) {
  const s = Math.abs(n).toFixed(0).split('.');
  s[0] = s[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (n < 0 ? '−' : '') + s.join(',');
}
const BAL_SAMPLES = {
  flat: [-100, -100, -100, -100, -100, -100, -100],
  close: [-1240, -1250, -1230, -1260, -1245, -1235, -1255],
  wide: [-12340, -12350, -12320, -12380, -12345, -12330, -12360],
  adj: [-400, -900, -905, -420, -410, -430, -415],
  // Max 1.100 sits on bar 4. On a 96px chart it reaches the top, so the label has nowhere above the bar.
  mixed: [-400, -200, -1100, 200, 1100, 300, -500],
  // E2E regression: the zero-axis label disappears on the 96px chart at 951x669.
  mixed2: [850, -1200, 20, -5, 1100, -1150, 900],
  // Every day is positive and the max is the scale ceiling, so the bar touches the top edge.
  positive: [200, 400, 800, 1200, 2000, 600, 300],
};
function withBalance(data, bals) {
  const copy = JSON.parse(JSON.stringify(data));
  const today = copy.days[copy.days.length - 1].day;
  const byDay = new Map(copy.days.map((d) => [d.day, d]));
  const days = copy.meals.days.filter((d) => d.day < today).slice(-7);
  days.forEach((d, i) => {
    const src = byDay.get(d.day);
    const burned = (src?.active_kcal || 0) + (src?.resting_kcal || 0);
    d.kcal = burned + bals[i];
  });
  return copy;
}
const balExample = await (await fetch(new URL('/api/data', base))).json();
for (const theme of ['dark', 'light']) {
  for (const [sample, bals] of Object.entries(BAL_SAMPLES)) {
    const need = [itNum(Math.max(...bals)), itNum(Math.min(...bals))];
    const apiData = withBalance(balExample, bals);
    for (const [name, w, h] of [['390x844', 390, 844], ['466x678', 466, 678], ['626x890', 626, 890], ['669x951', 669, 951], ['678x466', 678, 466], ['951x669', 951, 669], ['1280x800', 1280, 800]]) {
      const { page, errors } = await open(browser, w, h, null, theme, apiData);
      const vary = await page.evaluate((needles) => {
        const svg = document.querySelector('[data-v="bal"] svg');
        if (!svg) return { missing: true };
        const vb = svg.viewBox.baseVal;
        const sr = svg.getBoundingClientRect();
        const num = /^[−+\-]?\d[\d.,]*$/;
        const texts = [...svg.querySelectorAll('text')].map((el) => {
          const r = el.getBoundingClientRect();
          const bb = el.getBBox();
          return {
            t: (el.textContent || '').trim(),
            cls: el.getAttribute('class') || '',
            axis: el.matches('g.grid text'),
            r: { left: r.left, top: r.top, right: r.right, bottom: r.bottom },
            bb: { x: bb.x, y: bb.y, w: bb.width, h: bb.height },
          };
        });
        const inside = (t) => t.r.left >= sr.left - 0.5 && t.r.top >= sr.top - 0.5 && t.r.right <= sr.right + 0.5 && t.r.bottom <= sr.bottom + 0.5
          && t.bb.x >= -0.5 && t.bb.y >= -0.5 && t.bb.x + t.bb.w <= vb.width + 0.5 && t.bb.y + t.bb.h <= vb.height + 0.5;
        const values = texts.filter((t) => t.cls.split(/\s+/).includes('lbl') && num.test(t.t) && t.t !== '0');
        const overlapOf = (a, b) => {
          const ww = Math.min(a.right, b.right) - Math.max(a.left, b.left);
          const hh = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          return ww > 0.5 && hh > 0.5 ? { ww: Math.round(ww * 10) / 10, hh: Math.round(hh * 10) / 10 } : null;
        };
        const overlaps = [];
        for (let i = 0; i < texts.length; i++) {
          for (let j = i + 1; j < texts.length; j++) {
            const hit = overlapOf(texts[i].r, texts[j].r);
            if (hit) overlaps.push({ pair: texts[i].t + '×' + texts[j].t, ...hit });
          }
        }
        const bars = [...svg.querySelectorAll('rect.balbar')].map((el) => {
          const r = el.getBoundingClientRect();
          return { i: el.getAttribute('data-i'), r: { left: r.left, top: r.top, right: r.right, bottom: r.bottom } };
        });
        const onBars = [];
        for (const t of values) {
          for (const b of bars) {
            const hit = overlapOf(t.r, b.r);
            if (hit) onBars.push({ pair: t.t + '×bar' + b.i, ...hit });
          }
        }
        const axis = [...svg.querySelectorAll('g.grid text')].map((el) => {
          const r = el.getBoundingClientRect();
          return { t: (el.textContent || '').trim(), r: { left: r.left, top: r.top, right: r.right, bottom: r.bottom } };
        });
        const onAxis = [];
        for (const t of values) {
          for (const a of axis) {
            const hit = overlapOf(t.r, a.r);
            if (hit) onAxis.push({ pair: t.t + '×' + a.t, ...hit });
          }
        }
        const clipped = texts.filter((t) => !inside(t)).map((t) => t.t);
        return {
          values: values.map((t) => t.t),
          have: needles.every((s) => values.some((t) => t.t === s)),
          zero: texts.some((t) => t.axis && t.t === '0' && inside(t)),
          overlaps,
          onBars,
          onAxis,
          clipped,
        };
      }, need);
      const varyOk = !!(vary && !vary.missing && vary.have && vary.zero && vary.overlaps.length === 0 && vary.onBars.length === 0 && vary.onAxis.length === 0 && vary.clipped.length === 0) && !errors.length;
      console.log('bal-vary', sample, name, theme, varyOk ? 'clear' : 'OVERLAP', JSON.stringify(vary));
      report.push({ name: 'bal-vary', sample, size: name, theme, varyOk, ...vary });
      if (assertOk && !varyOk) failed = true;
      await page.context().close();
    }
  }
}

// Narrow top bar: the full wordmark stays readable and at least 8px clear of every control.
// The ink of the wordmark stays inside its box at every integer width from 360 through 1280.
// Below 440px Esci lives in Altro and must open and activate from the keyboard.
// Bar padding must stay at the stylesheet tokens: 12px left / 8px right through 430px
// (.lg-top in @media max-width:430px), and 18px left / 10px right above that (.lg-top base).
function normalPad(w) { return w <= 430 ? { l: 12, r: 8 } : { l: 18, r: 10 }; }
const logoKeyWidths = new Set();
for (let w = 360; w <= 415; w += 10) logoKeyWidths.add(w);
for (let w = 420; w <= 445; w += 5) logoKeyWidths.add(w);
for (let w = 450; w <= 460; w += 10) logoKeyWidths.add(w);
for (const w of [375, 414, 439, 440, 461]) logoKeyWidths.add(w);
const logoWidths = [];
for (let w = 360; w <= 1280; w++) logoWidths.push(w);
for (const theme of ['dark', 'light']) {
  const { page, errors } = await open(browser, 360, 844, null, theme);
  await page.evaluate(() => {
    window.__logoutTries = 0;
    document.addEventListener('click', (e) => {
      const a = e.target.closest && e.target.closest('a[href="/logout"]');
      if (!a) return;
      e.preventDefault();
      window.__logoutTries++;
    }, true);
  });
  const openKey = theme === 'light' ? 'Space' : 'Enter';
  for (const w of logoWidths) {
    await page.setViewportSize({ width: w, height: 844 });
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const m = await page.evaluate(() => {
      const logo = document.querySelector('.lg-top .wordmark');
      const cs = logo ? getComputedStyle(logo) : null;
      const box = logo?.getBoundingClientRect();
      let text = null;
      if (logo) {
        const range = document.createRange();
        range.selectNodeContents(logo);
        text = range.getBoundingClientRect();
      }
      const hits = (rect) => {
        if (!rect) return [];
        const out = [];
        for (const el of document.querySelectorAll('.lg-top button, .lg-top a.sw, .lg-top summary')) {
          const r = el.getBoundingClientRect();
          if (r.width < 2 || r.height < 2) continue;
          const overlap = r.right > rect.left + 0.5 && r.left < rect.right - 0.5 && r.bottom > rect.top + 0.5 && r.top < rect.bottom - 0.5;
          if (overlap) out.push((el.innerText || el.getAttribute('aria-label') || el.tagName).trim().split('\n')[0].slice(0, 18));
        }
        return out;
      };
      let clearance = null;
      if (text) {
        for (const el of document.querySelectorAll('.lg-top button, .lg-top a.sw, .lg-top summary')) {
          const r = el.getBoundingClientRect();
          if (r.width < 2 || r.height < 2 || r.left < text.left) continue;
          const gap = r.left - text.right;
          if (clearance == null || gap < clearance) clearance = gap;
        }
      }
      const full = (logo?.textContent || '').replace(/\s+/g, '') === 'example.com';
      const scrollOver = logo ? logo.scrollWidth - logo.clientWidth : 99;
      const ellipsis = cs?.textOverflow === 'ellipsis';
      const hiddenClip = !!cs && (cs.overflowX === 'hidden' || cs.overflowX === 'clip') && scrollOver > 1;
      const mid = document.querySelector('.hero.h2 .bal .mid');
      const bm = mid?.querySelector('.bm')?.getBoundingClientRect();
      let markerGap = null;
      let labelGap = null;
      if (mid && bm) {
        for (const node of mid.childNodes) {
          if (node.nodeType !== 3) continue;
          const raw = node.textContent || '';
          const word = raw.match(/Deficit|Surplus/);
          if (!word) continue;
          const start = raw.indexOf(word[0]);
          const range = document.createRange();
          range.setStart(node, start);
          range.setEnd(node, start + word[0].length);
          const lr = range.getBoundingClientRect();
          markerGap = lr.left - bm.right;
          const bv = mid.querySelector('.bv')?.getBoundingClientRect();
          if (bv) labelGap = bv.left - lr.right;
        }
      }
      const round = (n) => n == null ? null : Math.round(n * 10) / 10;
      const inkOut = text && box ? round(Math.max(box.left - text.left, text.right - box.right, box.top - text.top, text.bottom - box.bottom)) : 99;
      const visibleLink = (el) => {
        if (!el) return false;
        const s = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 2 && r.height > 2;
      };
      const barEsci = visibleLink(document.querySelector('.lg-top a.sw.out'));
      const menuEsci = visibleLink(document.querySelector('.altro-pop a.out'));
      const esciWhere = menuEsci && !barEsci ? 'menu' : barEsci && !menuEsci ? 'bar' : barEsci && menuEsci ? 'both' : 'none';
      const top = document.querySelector('.lg-top');
      const tcs = top ? getComputedStyle(top) : null;
      const themes = [...document.querySelectorAll('.thsw button')].map((b) => {
        const r = b.getBoundingClientRect();
        const before = getComputedStyle(b, '::before');
        const bw = parseFloat(before.width);
        const bh = parseFloat(before.height);
        const hitW = Number.isFinite(bw) && bw > r.width ? bw : r.width;
        const hitH = Number.isFinite(bh) && bh > r.height ? bh : r.height;
        return { w: round(r.width), h: round(r.height), hitW: round(hitW), hitH: round(hitH) };
      });
      return {
        full,
        inkOut,
        scrollOver,
        ellipsis,
        hiddenClip,
        boxHits: hits(box),
        inkHits: hits(text),
        clearance: round(clearance),
        markerGap: round(markerGap),
        labelGap: round(labelGap),
        textW: round(text?.width),
        client: logo ? logo.clientWidth : 0,
        padL: tcs ? parseFloat(tcs.paddingLeft) : null,
        padR: tcs ? parseFloat(tcs.paddingRight) : null,
        esciWhere,
        themes,
      };
    });
    const readable = m.full && m.inkOut <= 0.25 && m.scrollOver <= 1 && !m.ellipsis && !m.hiddenClip && m.boxHits.length === 0 && m.inkHits.length === 0;
    const clearOk = m.clearance != null && m.clearance >= 8;
    const logoOk = readable && clearOk && m.labelGap != null && m.labelGap >= 3;
    const markerOk = m.markerGap != null && m.markerGap >= 8 && m.markerGap <= 16;
    const norm = normalPad(w);
    const padOk = m.padL != null && m.padR != null && m.padL + 0.1 >= norm.l && m.padR + 0.1 >= norm.r;
    let esci = { ok: true, skipped: true };
    if (w < 440 && !logoKeyWidths.has(w)) {
      esci = { ok: m.esciWhere === 'menu', why: m.esciWhere === 'menu' ? 'menu' : m.esciWhere };
    } else if (w < 440) {
      await page.evaluate(() => {
        const det = document.querySelector('.altro');
        if (det) det.open = false;
        window.__logoutTries = 0;
      });
      await page.locator('.lg-top .wordmark').focus();
      await page.keyboard.press('Tab');
      const onSummary = await page.evaluate(() => document.activeElement?.closest?.('.altro')?.tagName === 'DETAILS' && document.activeElement.tagName === 'SUMMARY');
      if (!onSummary) esci = { ok: false, why: 'no-summary' };
      else {
        await page.keyboard.press(openKey);
        const opened = await page.evaluate(() => !!document.querySelector('.altro')?.open);
        let focused = null;
        for (let i = 0; i < 6 && opened; i++) {
          await page.keyboard.press('Tab');
          focused = await page.evaluate(() => {
            const el = document.activeElement;
            if (!el?.closest?.('.altro-pop')) return null;
            if ((el.textContent || '').trim() !== 'Esci') return null;
            const r = el.getBoundingClientRect();
            const cs = getComputedStyle(el);
            return { href: el.getAttribute('href'), h: Math.round(r.height), w: Math.round(r.width), vis: cs.display !== 'none' && cs.visibility !== 'hidden' };
          });
          if (focused) break;
        }
        if (!opened || !focused) esci = { ok: false, why: opened ? 'no-esci' : 'not-open' };
        else {
          const before = await page.evaluate(() => window.__logoutTries || 0);
          await page.keyboard.press('Enter');
          await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
          const tries = await page.evaluate(() => window.__logoutTries || 0);
          const activated = tries > before && focused.href === '/logout' && focused.h >= 44 && focused.w >= 44 && focused.vis;
          esci = { ok: activated && m.esciWhere === 'menu', why: activated && m.esciWhere === 'menu' ? 'activatable' : (m.esciWhere === 'menu' ? 'inert' : m.esciWhere), h: focused.h };
        }
      }
      await page.evaluate(() => {
        const det = document.querySelector('.altro');
        if (det) det.open = false;
        document.activeElement?.blur?.();
      });
    } else {
      esci = { ok: m.esciWhere === 'bar', why: m.esciWhere === 'bar' ? 'bar' : m.esciWhere };
    }
    const ok = logoOk && markerOk && esci.ok && padOk && !errors.length;
    const interesting = logoKeyWidths.has(w) || !ok;
    if (interesting) console.log('logo', w, theme, readable ? 'readable' : 'CLIP', clearOk ? 'clear' : 'TIGHT', padOk ? 'pad' : 'PAD', m.padL + '/' + m.padR, 'esci', w < 440 ? (esci.ok ? 'keys' : esci.why) : esci.why, m.esciWhere, JSON.stringify(m));
    report.push({ name: 'logo', size: w + 'x844', theme, ok, logoOk, esci: esci.ok, padOk, ...m });
    if (assertOk && !ok) failed = true;
  }
  const padSeen = new Set(logoWidths);
  const padWidths = [];
  for (let w = 360; w <= 1920; w += 10) padWidths.push(w);
  for (let w = 420; w <= 425; w++) padWidths.push(w);
  for (const w of [...new Set(padWidths)].filter((w) => !padSeen.has(w)).sort((a, b) => a - b)) {
    await page.setViewportSize({ width: w, height: w >= 900 ? 800 : 844 });
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const pad = await page.evaluate(() => {
      const tcs = getComputedStyle(document.querySelector('.lg-top'));
      return { padL: parseFloat(tcs.paddingLeft), padR: parseFloat(tcs.paddingRight) };
    });
    const norm = normalPad(w);
    const padOk = pad.padL + 0.1 >= norm.l && pad.padR + 0.1 >= norm.r;
    if (!padOk) console.log('pad', w, theme, 'PAD', pad.padL + '/' + pad.padR, 'normal', norm.l + '/' + norm.r);
    report.push({ name: 'bar-pad', size: w, theme, padOk, ...pad, normL: norm.l, normR: norm.r });
    if (assertOk && !padOk) failed = true;
  }
  await page.context().close();
}

for (const [name, w, h] of [['466x678', 466, 678], ['669x951', 669, 951], ['951x669', 951, 669], ['1280x800', 1280, 800]]) {
  const { page, errors } = await open(browser, w, h, null, 'light');
  await page.screenshot({ path: path.join(outDir, `${name}-light.png`), fullPage: false });
  const theme = await page.evaluate(() => document.documentElement.dataset.theme);
  console.log('light', name, theme, errors[0] || '');
  report.push({ name: 'light', size: name, theme, errors });
  if (assertOk && (theme !== 'light' || errors.length)) failed = true;
  await page.context().close();
}

await browser.close();
fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
if (failed) { console.error('duo-check failed'); process.exit(1); }
console.log('duo-check done', outDir);
