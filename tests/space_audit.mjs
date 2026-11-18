// Empty-space audit for the main page (Rivista / ed2). Geometry only: prints no data values.
// usage: node tests/space_audit.mjs <base-url> [out.json]   (needs puppeteer-core + Chrome)
// For each breakpoint it marks every content box (text line rects, svg, img, glass, bars) on an 8 px grid
// inside the page content area and reports the largest empty rectangles (greedy, non-overlapping),
// the largest full-width vertical gap, and first-screen checks at 1440×900.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const base = process.argv[2] || 'http://127.0.0.1:8720/', outF = process.argv[3];
if(!['127.0.0.1','localhost','[::1]'].includes(new URL(base).hostname))throw Error('Use the synthetic loopback preview only');
const VPS = [['1440x900', 1440, 900], ['1920', 1920, 1080], ['2560', 2560, 1440], ['3440', 3440, 1440], ['390', 390, 844]];
const C = 8;
const b = await puppeteer.launch({ executablePath: process.env.CHROME || (process.platform==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':'/usr/bin/google-chrome'), args: ['--no-sandbox'], headless: 'new' });
const res = {};
for (const [name, W, H] of VPS) {
  const p = await b.newPage(); await p.emulateTimezone('UTC'); await p.setViewport({ width: W, height: H });
  await p.setRequestInterception(true);p.on('request',r=>new URL(r.url()).origin===new URL(base).origin?r.continue():r.abort());
  await p.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  const response=await p.goto(base, { waitUntil: 'networkidle0' }); if(!response.ok())throw Error('Preview failed'); await new Promise(r => setTimeout(r, 900));
  res[name] = await p.evaluate((C, H) => {
    const m = document.querySelector('.e2m'), mr = m.getBoundingClientRect(), cs = getComputedStyle(m), sy = scrollY;
    const end = document.querySelector('.end'), x0 = mr.left + parseFloat(cs.paddingLeft), x1 = mr.right - parseFloat(cs.paddingRight);
    const y0 = mr.top + sy + parseFloat(cs.paddingTop), y1 = (end ? end.getBoundingClientRect().top : mr.bottom) + sy;
    const boxes = [], skip = el => el.closest('.deco,.lg-top,.chnav,.lg-bg,.lg-tip');
    const tw = document.createTreeWalker(m, NodeFilter.SHOW_TEXT);
    for (let n; (n = tw.nextNode());) { if (!n.data.trim() || skip(n.parentElement) || n.parentElement.closest('svg')) continue; const r = document.createRange(); r.selectNodeContents(n); for (const q of r.getClientRects()) boxes.push(q); }
    for (const el of m.querySelectorAll('svg,img,canvas,.side,.strip,.tsb,.bm,.ix,.lg-seg,button')) { if (skip(el) || el.parentElement.closest('svg')) continue; boxes.push(el.getBoundingClientRect()); }
    const cols = Math.max(1, Math.floor((x1 - x0) / C)), rows = Math.max(1, Math.ceil((y1 - y0) / C)), g = new Uint8Array(cols * rows);
    for (const q of boxes) { if (q.width < 1 || q.height < 1) continue; const a = Math.max(0, Math.floor((q.left - x0) / C)), bb = Math.min(cols, Math.ceil((q.right - x0) / C)), c = Math.max(0, Math.floor((q.top + sy - y0) / C)), d = Math.min(rows, Math.ceil((q.bottom + sy - y0) / C)); for (let y = c; y < d; y++) g.fill(1, y * cols + a, y * cols + bb); }
    // largest full-width vertical gap
    let vg = 0, run = 0, vgAt = 0; for (let y = 0; y < rows; y++) { let e = true; for (let x = 0; x < cols; x++) if (g[y * cols + x]) { e = false; break; } run = e ? run + 1 : 0; if (run > vg) { vg = run; vgAt = y - run + 1; } }
    const rect = () => { const h = new Int32Array(cols); let best = { a: 0 }; for (let y = 0; y < rows; y++) { for (let x = 0; x < cols; x++) h[x] = g[y * cols + x] ? 0 : h[x] + 1; const st = []; for (let x = 0; x <= cols; x++) { const cur = x < cols ? h[x] : 0; let s = x; while (st.length && st[st.length - 1][1] >= cur) { const [sx, sh] = st.pop(); const a = sh * C * (x - sx) * C; if (a > best.a && sh * C >= 48 && (x - sx) * C >= 48) best = { a, x: sx, y: y - sh + 1, w: x - sx, h: sh }; s = sx; } st.push([s, cur]); } } return best; };
    const out = []; for (let i = 0; i < 6; i++) { const r = rect(); if (!r.a) break; out.push({ x: Math.round(x0 + r.x * C), y: Math.round(y0 + r.y * C), w: r.w * C, h: r.h * C, area_k: Math.round(r.a / 1000) }); for (let y = r.y; y < r.y + r.h; y++) g.fill(1, y * cols + r.x, y * cols + r.x + r.w); }
    const ctr = q => q ? Math.round(q.getBoundingClientRect().bottom + sy) : null, top = q => q ? Math.round(q.getBoundingClientRect().top + sy) : null;
    const en = document.querySelector('[data-c="energy"]'), ml = document.querySelector('.hr.meals li');
    return { docH: Math.round(document.documentElement.scrollHeight), contentW: Math.round(x1 - x0), contentH: Math.round(y1 - y0),
      maxVGap: vg * C, maxVGapAt: Math.round(y0 + vgAt * C), empty: out, emptyTotal_k: Math.round(out.reduce((s, r) => s + r.area_k, 0)),
      energyH: en ? Math.round(en.getBoundingClientRect().height) : null, energyBottom: ctr(en), firstMealTop: top(ml), firstScreen: { energyFull: en ? ctr(en) <= H : null, mealsStart: ml ? top(ml) + 20 <= H - 72 : null },
      overflowX: document.documentElement.scrollWidth > innerWidth + 1 };
  }, C, H);
  await p.close();
}
await b.close();
const txt = JSON.stringify(res, null, 1); if (outF) fs.writeFileSync(outF, txt);
for (const [k, v] of Object.entries(res)) console.log(k.padEnd(9), 'docH', v.docH, '| maxVGap', v.maxVGap + 'px @' + v.maxVGapAt, '| top empty', v.empty.slice(0, 3).map(r => `${r.w}×${r.h}@(${r.x},${r.y})`).join(' '), '| top6 area', v.emptyTotal_k + 'k', '| energy h', v.energyH, 'bottom', v.energyBottom, '| meals', v.firstMealTop, v.firstScreen.energyFull, v.firstScreen.mealsStart, v.overflowX ? 'OVERFLOW' : '');
