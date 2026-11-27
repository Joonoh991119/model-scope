// Browser smoke test of the template, opened from file:// in headless Chrome (dev only).
//
//   node tests/smoke.mjs --pw <dir>            <dir> holds node_modules/playwright (and axe-core for the a11y pass)
//     --template <dir>    test another copy of the template (default: the shipped one)
//     --a11y              ENFORCE the axe pass (otherwise it is measured and reported only)
//     --phone             ENFORCE the 400 px layout pass (otherwise measured and reported only)
//     --sliders           also drive every numeric control to min / max / default through the real UI
//     --quick             load the page, check it paints without an error, exit (used by tests/mutations.mjs)
//     --channel <name>    browser channel (default 'chrome' = the installed Chrome; 'chromium' = Playwright's build)
//
// Always enforced: every model x lens screen paints (click navigation and deep link, largest text size),
// zero console errors, zero page errors, zero requests that are not file://.
// Install the tooling OUTSIDE the plugin, e.g.  npm i --prefix .scratch/pw playwright@1.56.1 axe-core@4.14.1
import { createRequire } from 'node:module';
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { args, DEFAULT_TEMPLATE } from './lib/harness.mjs';

const A = args();
if (!A.opt('--pw')) { console.error('usage: node tests/smoke.mjs --pw <dir with node_modules/playwright> [--template <dir>] [--a11y] [--phone] [--sliders] [--quick]'); process.exit(2); }
const PW = path.resolve(A.opt('--pw'));
const require = createRequire(PW + '/');
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { console.error(`playwright not found under ${PW} (npm i --prefix ${A.opt('--pw')} playwright@1.56.1 axe-core@4.14.1)`); process.exit(2); }
let axeSrc = null; try { axeSrc = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8'); } catch (e) { /* a11y pass is skipped without axe-core */ }
const T = path.resolve(A.opt('--template') || DEFAULT_TEMPLATE);
const HERE = path.dirname(new URL(import.meta.url).pathname);
const pageUrl = (dir, q = '') => pathToFileURL(path.join(dir, 'index.html')).href + q;

// Defects that are measured and reported but do not fail the run yet. Remove an entry in the commit that fixes it.
// (Empty since v1.22.0: zero-on-blur, active-tab-in-strip, params-remembered and lens-switch-mid-compute were fixed.)
const KNOWN_DEFECTS = new Set([]);

const results = [];
function check(id, ok, detail, { enforce = true } = {}) {
  const known = !ok && KNOWN_DEFECTS.has(id), soft = !ok && !enforce;
  results.push({ id, ok, fatal: !ok && !known && !soft });
  console.log(`${ok ? 'PASS ' : known ? 'KNOWN' : soft ? 'INFO ' : 'FAIL '} ${id.padEnd(26)} ${detail}`);
}

const browser = await chromium.launch({ channel: A.opt('--channel') || 'chrome', headless: true });
const errs = [], warns = [], reqs = []; let tag = '';
async function newPage(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1320, height: 760 }, ...opts });
  const p = await ctx.newPage();
  p.on('console', m => { if (m.type() === 'error') errs.push(`[${tag}] ${m.text().slice(0, 200)}`); else if (m.type() === 'warning') warns.push(`[${tag}] ${m.text().slice(0, 200)}`); });
  p.on('pageerror', e => errs.push(`[${tag}] PAGEERROR ${String(e.message).slice(0, 200)}`));
  p.on('request', r => { if (!r.url().startsWith('file:')) reqs.push(r.url().slice(0, 140)); });
  return p;
}
// number of sampled pixels that differ from the canvas's first pixel, per view canvas (-1 = zero-sized)
const painted = p => p.evaluate(() => [...document.querySelectorAll('#views canvas')].map(c => { if (!c.width || !c.height) return -1;
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; const r0 = d[0], g0 = d[1], b0 = d[2], a0 = d[3];
  for (let i = 0; i < d.length; i += 4 * 31) if (d[i] !== r0 || d[i + 1] !== g0 || d[i + 2] !== b0 || d[i + 3] !== a0) n++; return n; }));
const blank = a => !a.length || a.some(n => n < 20);
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const tabOf = async (p, m) => { const byId = p.locator(`#modelTabs [data-id="${m.id}"]`); return (await byId.count()) ? byId.first() : p.locator('#modelTabs button').filter({ hasText: new RegExp('^' + reEsc(m.name) + '$') }).first(); };
const lensOf = async (p, key, label) => { const byId = p.locator(`#lensSwitch [data-id="${key}"]`); return (await byId.count()) ? byId.first() : p.locator('#lensSwitch button').filter({ hasText: new RegExp('^' + reEsc(label) + '$') }).first(); };

// a temp copy of the template with one fixture script loaded after the page's own scripts
const tmpDirs = [];
function withFixture(name) { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ms-fix-')); tmpDirs.push(dir); fs.cpSync(T, dir, { recursive: true });
  fs.copyFileSync(path.join(HERE, 'fixtures', name), path.join(dir, name));
  let html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8'); const tags = [...html.matchAll(/<script\s+src="[^"]+"><\/script>/g)], last = tags[tags.length - 1], at = last.index + last[0].length;
  fs.writeFileSync(path.join(dir, 'index.html'), html.slice(0, at) + `\n<script src="${name}"></script>` + html.slice(at)); return dir; }
const state = pg => pg.evaluate(() => ({ model: (document.querySelector('#modelTabs [aria-pressed="true"]') || {}).dataset?.id || null, lens: (document.querySelector('#lensSwitch [aria-pressed="true"]') || {}).dataset?.id || null,
  read: document.getElementById('tread').textContent, seed: document.getElementById('seedInput').value, hash: location.hash, search: location.search, live: document.getElementById('live')?.textContent || '' }));

const p = await newPage();
tag = 'load'; await p.goto(pageUrl(T)); await p.waitForTimeout(400);
const order = await p.evaluate(() => (window.SIM ? SIM.MODEL_ORDER : []).map(id => ({ id, name: SIM.MODELS[id].name,
  lenses: Object.entries(SIM.MODELS[id].lenses || {}).map(([k, L]) => [k, L.label || k]),
  nums: (SIM.MODELS[id].params || []).filter(s => !s.type).map(s => ({ name: s.name, min: s.min, max: s.max, def: s.default })) })));

if (A.flag('--quick')) {
  const pt = order.length ? await painted(p) : [];
  check('page-loads', order.length > 0 && !blank(pt) && errs.length === 0, `${order.length} models, canvases ${JSON.stringify(pt)}, errors ${JSON.stringify(errs.slice(0, 2))}`);
  await browser.close(); process.exit(results.some(r => r.fatal) ? 1 : 0);
}

// ---- A. click through every model tab and lens button, let it play, jump to the end ----
let screens = 0; const blanks = [];
for (const m of order) {
  tag = 'click:' + m.id; await (await tabOf(p, m)).click(); await p.waitForTimeout(120);
  for (const [k, label] of (m.lenses.length ? m.lenses : [['', '']])) {
    tag = `click:${m.id}:${k}`; if (k) await (await lensOf(p, k, label)).click();
    await p.waitForTimeout(180); const mid = await painted(p);
    if (await p.locator('#transport').isVisible()) { await p.locator('#toEndBtn').click(); await p.waitForTimeout(80); }
    const end = await painted(p); screens++;
    if (blank(end)) blanks.push(`${m.id}:${k} mid=${JSON.stringify(mid)} end=${JSON.stringify(end)}`);
  }
}
check('click-navigation', blanks.length === 0, `${screens} screens by click; blank or sparse canvases: ${blanks.length}${blanks.length ? ' ' + blanks.slice(0, 3).join(' | ') : ''}`);

// ---- B. deep link to every screen at the largest text size; axe on each; is the active tab inside the strip? ----
const axe = {}; let axeScreens = 0, deep = 0; const deepBlank = [], tabOut = [];
for (const m of order) for (const [k] of (m.lenses.length ? m.lenses : [['']])) {
  tag = `deep:${m.id}:${k}`; await p.goto(pageUrl(T, `?model=${m.id}${k ? '&lens=' + k : ''}&still=1&text=1.8`)); await p.waitForTimeout(140); deep++;
  const pt = await painted(p); if (blank(pt)) deepBlank.push(`${m.id}:${k} ${JSON.stringify(pt)}`);
  const vis = await p.evaluate(() => { const nav = document.getElementById('modelTabs'), a = nav && nav.querySelector('[aria-pressed="true"],[aria-selected="true"],[aria-current]'); if (!a) return false; const r = a.getBoundingClientRect(), n = nav.getBoundingClientRect(); return r.left >= n.left - 1 && r.right <= n.right + 1 && r.top >= n.top - 1 && r.bottom <= n.bottom + 1; });
  if (!vis && !tabOut.includes(m.id)) tabOut.push(m.id);
  if (axeSrc) { await p.evaluate(axeSrc); axeScreens++;
    const v = await p.evaluate(async () => (await axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice'] })).violations.map(v => [v.id, v.impact, v.nodes.length, v.nodes[0].html.slice(0, 100)]));
    for (const [id, impact, n, ex] of v) { const a = axe[id] || (axe[id] = { impact, screens: 0, nodes: 0, ex }); a.screens++; a.nodes += n; } }
}
check('deep-link-screens', deepBlank.length === 0, `${deep} screens by ?model=&lens=&still=1&text=1.8; blank or sparse: ${deepBlank.length}${deepBlank.length ? ' ' + deepBlank.slice(0, 3).join(' | ') : ''}`);
check('active-tab-in-strip', tabOut.length === 0, `${order.length - tabOut.length} of ${order.length} models show their own tab inside the tab strip${tabOut.length ? ' (outside: ' + tabOut.join(',') + ')' : ''}`);
if (axeSrc) {
  const sev = Object.entries(axe).filter(([, a]) => a.impact === 'critical' || a.impact === 'serious');
  const struct = ['landmark-one-main', 'page-has-heading-one'].filter(id => axe[id]);
  const line = Object.entries(axe).map(([id, a]) => `${id} (${a.impact}) ${a.screens} screens / ${a.nodes} nodes`).join('; ') || 'no violations';
  check('axe', sev.length === 0 && struct.length === 0, `${axeScreens} screens, rules wcag2a wcag2aa wcag21aa best-practice: ${line}`, { enforce: A.flag('--a11y') });
} else check('axe', false, 'axe-core not installed next to playwright — pass skipped', { enforce: A.flag('--a11y') });

// ---- C. optional: every numeric control to min, max, default through the real UI (input → debounce → recompute → draw) ----
if (A.flag('--sliders')) { let n = 0; const bad = [];
  for (const m of order) { tag = 'slider:' + m.id; await p.goto(pageUrl(T, `?model=${m.id}&still=1`)); await p.waitForTimeout(140);
    for (const s of m.nums) for (const v of [s.min, s.max, s.def]) { tag = `slider:${m.id}:${s.name}=${v}`;
      await p.evaluate(([name, v]) => { const el = document.getElementById('f_' + name); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }, [s.name, v]);
      await p.waitForTimeout(270); n++; const pt = await painted(p); if (blank(pt)) bad.push(`${m.id}.${s.name}=${v} ${JSON.stringify(pt)}`); } }
  check('slider-extremes', bad.length === 0, `${n} control states through the UI; blank or sparse: ${bad.length}${bad.length ? ' ' + bad.slice(0, 3).join(' | ') : ''}`); }

// ---- D. toolbox behaviour ----
const zeroables = order.flatMap(m => m.nums.filter(s => s.min <= 0 && s.max >= 0 && s.def !== 0).map(s => ({ m, s })));
const zeroable = zeroables.find(z => z.m.id === 'ddm' && z.s.name === 'A') || zeroables[0];
if (zeroable) { tag = 'zero'; await p.goto(pageUrl(T, `?model=${zeroable.m.id}&still=1`)); await p.waitForTimeout(160);
  const f = p.locator('#f_' + zeroable.s.name); await f.fill('0'); await f.blur(); await p.waitForTimeout(320);
  const v = await f.inputValue(); await f.fill(''); await f.blur(); await p.waitForTimeout(120); const v2 = await f.inputValue();
  check('zero-on-blur', parseFloat(v) === 0 && parseFloat(v2) === 0, `${zeroable.m.id}.${zeroable.s.name}: typed 0, left the field, value is now ${v} (default ${zeroable.s.def}); emptied the field and left it: ${v2} (keeps the current value)`); }
const keep = order.find(m => m.nums.length), other = order.find(m => keep && m.id !== keep.id);
if (keep && other) { tag = 'remember'; const s = keep.nums[0], want = s.max; await p.goto(pageUrl(T, `?model=${keep.id}&still=1`)); await p.waitForTimeout(160);
  const f = p.locator('#f_' + s.name); await f.fill(String(want)); await p.waitForTimeout(320);
  await (await tabOf(p, other)).click(); await p.waitForTimeout(160); await (await tabOf(p, keep)).click(); await p.waitForTimeout(200);
  const v = await p.locator('#f_' + s.name).inputValue(); check('params-remembered', parseFloat(v) === want, `${keep.id}.${s.name} set to ${want}, left the tab and returned: ${v}`); }
if (keep) { tag = 'rapid'; const before = errs.length; await p.goto(pageUrl(T, `?model=${keep.id}`)); await p.waitForTimeout(200);
  await p.evaluate(async ([name, lo, hi]) => { const el = document.getElementById('f_' + name); for (let i = 0; i < 40; i++) { el.value = lo + (hi - lo) * ((i % 20) / 19); el.dispatchEvent(new Event('input', { bubbles: true })); await new Promise(r => setTimeout(r, 12)); } }, [keep.nums[0].name, keep.nums[0].min, keep.nums[0].max]);
  for (const m of order.slice(0, 8)) { await (await tabOf(p, m)).click(); await p.waitForTimeout(40); }
  await p.waitForTimeout(450); check('rapid-input-and-tabs', errs.length === before, `40 slider events in 0.5 s then ${Math.min(8, order.length)} tab switches: ${errs.length - before} errors`); }
{ // reduced motion: nothing may auto-play
  tag = 'reduced-motion'; const p2 = await newPage({ reducedMotion: 'reduce' });
  let playing = []; for (const m of order.slice(0, 6)) { await p2.goto(pageUrl(T, `?model=${m.id}`)); await p2.waitForTimeout(220);
    if (await p2.evaluate(() => { const i = document.getElementById('playIcon'); return !!i && i.innerHTML.includes('rect'); })) playing.push(m.id); }
  check('reduced-motion', playing.length === 0, `prefers-reduced-motion: ${playing.length ? 'still auto-playing: ' + playing.join(',') : 'nothing auto-plays (first ' + Math.min(6, order.length) + ' models)'}`); await p2.context().close(); }
{ // the async path: a runChunks model, with a KEYBOARD lens switch while it is still computing
  tag = 'heavy'; const dir = withFixture('heavy.js');
  const q = await newPage(); const st = () => q.evaluate(() => ({ done: window.__heavy && window.__heavy.done, loading: window.__heavy && window.__heavy.loading, overlay: document.getElementById('loading').classList.contains('on') }));
  await q.goto(pageUrl(dir, '?model=heavy')); await q.waitForTimeout(250); const before = await st();
  const lensB = q.locator('#lensSwitch button').filter({ hasText: /^B$/ }); await lensB.focus(); await q.keyboard.press('Enter');
  const t0 = Date.now(); let now = await st(); while (now.loading && Date.now() - t0 < 20000) { await q.waitForTimeout(250); now = await st(); }
  await q.waitForTimeout(150); const pt = await painted(q); now = await st();
  check('lens-switch-mid-compute', before.loading === true && now.loading === false && now.overlay === false && !blank(pt),
    `runChunks fixture: ${before.done}/240 when lens B was chosen by keyboard; ${Math.round((Date.now() - t0) / 100) / 10} s later done=${now.done}/240 loading=${now.loading} overlay=${now.overlay}`);
  // a slider move mid-compute must still supersede the old run (the generation guard is intact)
  await q.goto(pageUrl(dir, '?model=heavy')); await q.waitForTimeout(250);
  await q.evaluate(() => { window.__first = window.__heavy; const el = document.getElementById('f_n'); el.value = 1; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await q.waitForTimeout(400); const frozenAt = await q.evaluate(() => window.__first.done); await q.waitForTimeout(600);
  const sup = await q.evaluate(() => ({ first: window.__first.done, firstLoading: window.__first.loading, same: window.__first === window.__heavy }));
  check('slider-supersedes-compute', !sup.same && sup.first === frozenAt && sup.first < 240, `runChunks fixture: moving a slider mid-compute starts a new run; the old one stopped at ${sup.first}/240 and stayed there`);
  await q.context().close(); }

// ---- D2. links, remembered state, error display, announcements ----
const byId = Object.fromEntries(order.map(m => [m.id, m]));
const lensed = order.filter(m => m.lenses.length > 1), lastLensed = lensed[lensed.length - 1];
if (lastLensed) { tag = 'hash'; const m = lastLensed, [k] = m.lenses[m.lenses.length - 1];
  await p.goto(pageUrl(T, `?still=1#${m.id}-${k}`)); await p.waitForTimeout(220); const a = await state(p), pt = await painted(p);
  check('hash-link', a.model === m.id && a.lens === k && !blank(pt), `#${m.id}-${k} opens model ${a.model}, lens ${a.lens}`);
  const first = order[0]; await p.evaluate(h => { location.hash = h; }, '#' + first.id); await p.waitForTimeout(260); const b = await state(p);
  const other = lensed.find(x => x.id !== first.id) || m, [k2] = other.lenses[1]; await p.evaluate(h => { location.hash = h; }, `#${other.id}-${k2}`); await p.waitForTimeout(260); const c = await state(p);
  check('hash-change', b.model === first.id && c.model === other.id && c.lens === k2, `changing the hash to #${first.id} then #${other.id}-${k2} follows: ${b.model}, then ${c.model}/${c.lens}`);
  await (await tabOf(p, m)).click(); await p.waitForTimeout(200); const [k3] = m.lenses[1]; await (await lensOf(p, k3, m.lenses[1][1])).click(); await p.waitForTimeout(200); const d = await state(p);
  check('hash-written', d.hash === `#${m.id}-${k3}` && d.search === '', `clicking tab ${m.id} and lens ${k3} rewrites the address to ${d.hash}${d.search ? ' (query kept: ' + d.search + ')' : ''}`);
  await p.goto('about:blank'); await p.goto(pageUrl(T, '#no-such-model')); await p.waitForTimeout(200); const e = await state(p);   // a fresh load, not a hash change
  await p.goto('about:blank'); await p.goto(pageUrl(T, '?model=constructor')); await p.waitForTimeout(200); const f = await state(p);
  check('bad-link-falls-back', e.model === order[0].id && f.model === order[0].id, `an unknown #name or ?model= opens the first model (${e.model}, ${f.model})`); }
if (byId.lif && byId.lif.lenses.some(([k]) => k === 'raster')) { tag = 'query-legacy'; await p.goto(pageUrl(T, '?model=lif&lens=raster&head=30')); await p.waitForTimeout(260); const a = await state(p), pt = await painted(p);
  check('query-link', a.model === 'lif' && a.lens === 'raster' && /^30\b/.test(a.read.trim()) && !blank(pt), `?model=lif&lens=raster&head=30 opens ${a.model}/${a.lens} frozen at "${a.read.trim()}"`); }
if (byId.ddm) { tag = 'query-params'; await p.goto(pageUrl(T, '?model=ddm&p.z=2&seed=abc&still=1')); await p.waitForTimeout(260);
  const a = await state(p), z = await p.locator('#f_z').inputValue(), simZ = await p.evaluate(() => document.querySelector('#f_z').closest('.field').querySelector('input[type=range]').value);
  check('query-params', a.model === 'ddm' && parseFloat(z) === 2 && parseFloat(simZ) === 2 && a.seed === 'abc', `?model=ddm&p.z=2&seed=abc: z field ${z}, slider ${simZ}, seed "${a.seed}"`);
  const away = order.find(m => m.id !== 'ddm'); await (await tabOf(p, away)).click(); await p.waitForTimeout(160); await (await tabOf(p, byId.ddm)).click(); await p.waitForTimeout(220);
  const z2 = await p.locator('#f_z').inputValue(); check('query-params-remembered', parseFloat(z2) === 2, `z=2 from the link, after leaving for ${away.id} and returning: ${z2}`);
  await p.locator('#linkBtn').click(); await p.waitForTimeout(150); const link = await p.locator('#linkOut').inputValue();
  const q2 = await newPage(); await q2.goto(link + (link.includes('?') ? '' : '')); await q2.waitForTimeout(260); const b = await state(q2), zb = await q2.locator('#f_z').inputValue(); await q2.context().close();
  check('copy-link-round-trip', /[?&]p\.z=2\b/.test(link) && /seed=abc/.test(link) && /#ddm/.test(link) && b.model === 'ddm' && parseFloat(zb) === 2 && b.seed === 'abc', `"Copy link" gives ${link.replace(/^.*index\.html/, 'index.html')}; opening it restores z=${zb}, seed "${b.seed}"`); }
{ tag = 'a11y-live'; const m = order.find(x => x.lenses.length === 0) || order[0]; await p.goto(pageUrl(T, `?model=${m.id}`)); await p.waitForTimeout(250);
  const seqVisible = await p.locator('#transport').isVisible();
  if (seqVisible) { await p.locator('#toStartBtn').click(); await p.waitForTimeout(120); const playing = await p.locator('#playBtn').getAttribute('aria-label');
    await p.locator('#playBtn').click(); await p.waitForTimeout(80); const paused = await p.locator('#playBtn').getAttribute('aria-label'), l1 = (await state(p)).live;
    await p.locator('#toEndBtn').click(); await p.waitForTimeout(80); const l2 = (await state(p)).live;
    check('play-label-and-live-region', playing === 'Pause' && paused === 'Play' && /^Paused\. /.test(l1) && /^End\. /.test(l2), `${m.id}: play button reads "${playing}" while playing and "${paused}" after; live region said "${l1}" then "${l2}"`); }
  const cv = await p.evaluate(() => [...document.querySelectorAll('#views canvas')].map(c => [c.getAttribute('role'), c.getAttribute('aria-label')]));
  check('canvas-names', cv.length > 0 && cv.every(([r, l]) => r === 'img' && l && l.length > 1), `${m.id}: ${cv.length} canvases, each role="img" with a name (${cv.map(c => c[1]).join(' | ').slice(0, 90)})`); }
{ // the reduced-motion setting changing while the page is open
  tag = 'reduced-motion-change'; const seqm = order.find(x => x.lenses.length === 0) || order[0]; await p.goto(pageUrl(T, `?model=${seqm.id}`)); await p.waitForTimeout(200);
  if (await p.locator('#transport').isVisible()) { await p.locator('#spd').evaluate(el => { el.value = el.min; el.dispatchEvent(new Event('input', { bubbles: true })); }); await p.locator('#toStartBtn').click(); await p.waitForTimeout(120);
    const before = await p.locator('#playBtn').getAttribute('aria-label'); await p.emulateMedia({ reducedMotion: 'reduce' }); await p.waitForTimeout(200); const after = await p.locator('#playBtn').getAttribute('aria-label'); await p.emulateMedia({ reducedMotion: 'no-preference' });
    check('reduced-motion-change', before === 'Pause' && after === 'Play', `${seqm.id}: playing ("${before}"), then the system setting switches to reduced motion: "${after}"`); } }
{ // a simulate() that throws: the page says so where the plots would be, and recovers
  tag = 'broken'; const dir = withFixture('broken.js'); const q = await browser.newContext({ viewport: { width: 1320, height: 760 } }).then(c => c.newPage()); const perr = []; q.on('pageerror', e => perr.push(String(e.message)));
  await q.goto(pageUrl(dir, '?model=broken')); await q.waitForTimeout(250); const ok0 = !blank(await painted(q));
  await q.locator('#f_boom').click(); await q.waitForTimeout(400); const msg = await q.evaluate(() => (document.querySelector('#views [role="alert"]') || {}).textContent || ''), n1 = await q.locator('#views canvas').count();
  await q.locator('#f_boom').click(); await q.waitForTimeout(400); const ok2 = !blank(await painted(q));
  await q.locator('#f_mode button').nth(1).click(); await q.waitForTimeout(400); const msg2 = await q.evaluate(() => (document.querySelector('#views [role="alert"]') || {}).textContent || '');
  check('simulate-error-shown', ok0 && /boom from the fixture/.test(msg) && n1 === 0 && ok2 && /returned no data/.test(msg2) && perr.length === 0, `broken fixture: simulate() throws -> "${msg.slice(52, 96)}" shown in the view area, views return when it runs again; no data -> "${msg2.slice(52, 87)}"; ${perr.length} page errors`);
  await q.context().close(); }

// ---- E. phone width ----
{ tag = 'phone'; const ph = await newPage({ viewport: { width: 400, height: 800 } }); const over = [], low = [];
  for (const m of order) { await ph.goto(pageUrl(T, `?model=${m.id}&still=1`)); await ph.waitForTimeout(160);
    const o = await ph.evaluate(() => { const c = document.querySelector('#views canvas'); return { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, top: c ? Math.round(c.getBoundingClientRect().top + window.scrollY) : -1 }; });
    if (o.sw > o.cw) over.push(`${m.id} ${o.sw}px`); if (!(o.top >= 0 && o.top < 800)) low.push(`${m.id} ${o.top}px`); }
  check('phone-400px', over.length === 0 && low.length === 0, `400x800: ${over.length} of ${order.length} models overflow horizontally${over.length ? ' (' + over.slice(0, 4).join(', ') + (over.length > 4 ? ', ...' : '') + ')' : ''}; first plot below the first screen on ${low.length}${low.length ? ' (' + low.slice(0, 3).join(', ') + ', ...)' : ''}`, { enforce: A.flag('--phone') });
  await ph.context().close(); }

const realWarns = warns.filter(w => !/willReadFrequently/.test(w));   // Chrome's hint about this script's own getImageData readbacks
check('console-and-page-errors', errs.length === 0 && realWarns.length === 0, `${errs.length} console errors or page errors, ${realWarns.length} warnings${errs.length || realWarns.length ? ': ' + [...new Set([...errs, ...realWarns])].slice(0, 5).join(' | ') : ''}`);
check('no-external-requests', reqs.length === 0, `${reqs.length} requests that are not file://${reqs.length ? ': ' + [...new Set(reqs)].slice(0, 5).join(' ') : ''}`);
await browser.close();
for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true });
const fatal = results.filter(r => r.fatal).length, known = results.filter(r => !r.ok && !r.fatal).length;
console.log(`\n${fatal ? `SMOKE FAILED: ${fatal} check(s)` : 'smoke OK'} — ${results.filter(r => r.ok).length} passed${known ? `, ${known} reported but not enforced` : ''}`);
process.exit(fatal ? 1 : 0);
