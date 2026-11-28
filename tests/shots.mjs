import { createRequire } from 'node:module';
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { args, DEFAULT_TEMPLATE, launch } from './lib/harness.mjs';

const A = args();
if (!A.opt('--pw')) { console.error('usage: node tests/shots.mjs --pw <dir with node_modules/playwright> [--template <dir>] [--channel <chrome|chromium>] [--only png|gif|pairs] [--python <bin>] [--font <ttf>] [--ffmpeg <bin>] [--all <dir> [--before <dir>]]'); process.exit(2); }
const require = createRequire(path.resolve(A.opt('--pw')) + '/');
const { chromium } = require('playwright');
const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, '..');
const T = path.resolve(A.opt('--template') || DEFAULT_TEMPLATE), DOCS = path.join(ROOT, 'docs');
const url = q => pathToFileURL(path.join(T, 'index.html')).href + q;
const ONLY = A.opt('--only');

const GALLERY = [
  ['ddm-step', '?model=ddm&lens=step&still=1'],
  ['ddm-sim', '?model=ddm&lens=sim&head=1200'],
  ['vision-transform', '?model=vision&lens=transform&still=1'],
  ['lif-fI', '?model=lif&lens=fI&still=1'],
  ['lif-raster', '?model=lif&lens=raster&still=1'],
  ['rl-rate', '?model=rl&lens=rate&still=1'],
  ['compare', '?model=compare&still=1'],
  ['sir-spread', '?model=sir&lens=spread&still=1'],
  ['attractor-landscape', '?model=attractor&lens=landscape&still=1'],
];
const PAIR = { view: { width: 1180, height: 640 }, scale: 2, text: 1.35, frameMs: 160, stepMs: 1300, holdMs: 1800, kappa1: 30, powerLaw: 0.74 };
const PAIRS = [
  { name: 'ddm', q: '?model=ddm&lens=sim', paper: 'ratcliff2008-fig1.png', paperLabel: 'Ratcliff & McKoon (2008), Fig. 1', guiLabel: 'drift-diffusion · Simulation lens', frames: 18 },
  { name: 'attractor', q: '?model=attractor&lens=landscape&p.coh=0', paper: 'wongwang2006-fig4b.png', paperLabel: 'Wong & Wang (2006), Fig. 4B', guiLabel: "attractor network, c' = 0", variants: ['s1', 's2', 's8', 's3', 's9', 's4'].map(s => ({ q: `&seed=${s}`, label: `trial seed ${s}` })) },
  { name: 'wm', q: '?model=wm', paper: 'bays2009-fig2a.png', paperLabel: 'Bays, Catalao & Husain (2009), Fig. 2a', guiLabel: `working memory, κ = ${PAIR.kappa1} · N^−${PAIR.powerLaw}`, variants: [1, 2, 4, 6].map(n => { const k = Math.round(PAIR.kappa1 * n ** -PAIR.powerLaw); return { q: `&p.N=${n}&p.kappa=${k}`, label: `N = ${n} · κ = ${k}` }; }), cards: [2, 3], view: { width: 1280, height: 900 } },
];
const VIEW = { width: 1340, height: 815 };

const browser = await launch(chromium, A);
const page = await browser.newPage({ viewport: VIEW, deviceScaleFactor: 1 });
const errs = []; page.on('pageerror', e => errs.push(String(e.message))); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
const open = async q => { await page.goto('about:blank'); await page.goto(url(q)); await page.waitForTimeout(350); };

if (!ONLY || ONLY === 'png') {
  fs.mkdirSync(path.join(DOCS, 'shots'), { recursive: true });
  for (const [name, q] of GALLERY) { await open(q); await page.screenshot({ path: path.join(DOCS, 'shots', name + '.png') }); console.log(`docs/shots/${name}.png  <-  index.html${q}`); }
}

if (!ONLY || ONLY === 'gif') {
  const ffmpeg = [A.opt('--ffmpeg'), 'ffmpeg', '/opt/homebrew/bin/ffmpeg'].filter(Boolean).find(f => spawnSync(f, ['-version']).status === 0);
  if (!ffmpeg) { console.error('ffmpeg not found — the GIF was NOT regenerated (pass --ffmpeg <path>)'); process.exitCode = 1; }
  else {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ms-gif-')), N = 12;
    await page.setViewportSize({ width: 1100, height: 560 }); await open('?model=ddm&lens=trial&head=0');
    const len = await page.evaluate(() => +document.getElementById('scrub').max);
    for (let i = 0; i < N; i++) {
      const head = len * (i + 1) / N;
      await page.evaluate(h => { const s = document.getElementById('scrub'); s.value = h; s.dispatchEvent(new Event('input', { bubbles: true })); }, head);
      await page.waitForTimeout(60); await page.locator('main').screenshot({ path: path.join(dir, `f${String(i).padStart(2, '0')}.png`) });
    }
    const out = path.join(DOCS, 'ddm-trial.gif');
    const r = spawnSync(ffmpeg, ['-v', 'error', '-y', '-framerate', '5', '-i', path.join(dir, 'f%02d.png'), '-vf', 'scale=720:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=48[p];[b][p]paletteuse=dither=none', '-loop', '0', out], { encoding: 'utf8' });
    fs.rmSync(dir, { recursive: true, force: true });
    if (r.status !== 0) { console.error('ffmpeg failed: ' + (r.stderr || '').slice(0, 300)); process.exitCode = 1; } else console.log(`docs/ddm-trial.gif  <-  index.html?model=ddm&lens=trial, ${N} frames of trial 1 (${fs.statSync(out).size} bytes)`);
    await page.setViewportSize(VIEW);
  }
}

if (!ONLY || ONLY === 'pairs') {
  const pp = await browser.newPage({ viewport: PAIR.view, deviceScaleFactor: PAIR.scale });
  pp.on('pageerror', e => errs.push(String(e.message)));
  const colors = await (async () => { await pp.goto(url('')); return pp.evaluate(() => { const T = Plot.TH; return { bg: T.bg, surface: T.surface, edge: T.line2, accent: T.accent, dim: T.dim }; }); })();
  for (const P of PAIRS) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccn-pair-')), frames = [];
    const shot = async () => {
      const f = path.join(dir, `f${String(frames.length).padStart(3, '0')}.png`);
      if (!P.cards) await pp.locator('#views').screenshot({ path: f });
      else { const clip = await pp.evaluate(ix => { const r = ix.map(i => document.querySelectorAll('#views .plot')[i].getBoundingClientRect()); const x = Math.min(...r.map(b => b.left)), y = Math.min(...r.map(b => b.top)); return { x, y, width: Math.max(...r.map(b => b.right)) - x, height: Math.max(...r.map(b => b.bottom)) - y }; }, P.cards); await pp.screenshot({ path: f, clip }); }
      frames.push(f);
    };
    await pp.setViewportSize(P.view || PAIR.view);
    let stepped = !!P.variants; const labels = [];
    if (P.variants) for (const v of P.variants) { await pp.goto('about:blank'); await pp.goto(url(`${P.q}${v.q}&still=1&text=${PAIR.text}`)); await pp.waitForTimeout(450); await shot(); labels.push(v.label); }
    else {
      await pp.goto('about:blank'); await pp.goto(url(`${P.q}&head=0&text=${PAIR.text}`)); await pp.waitForTimeout(350);
      const max = await pp.evaluate(() => +document.getElementById('scrub').max);
      stepped = await pp.evaluate(() => document.getElementById('stepCtrl').style.display !== 'none');
      const heads = stepped ? Array.from({ length: max + 1 }, (_, i) => i) : Array.from({ length: P.frames }, (_, i) => max * (i + 1) / P.frames);
      for (const h of heads) { await pp.evaluate(v => { const s = document.getElementById('scrub'); s.value = v; s.dispatchEvent(new Event('input', { bubbles: true })); }, h); await pp.waitForTimeout(60); await shot(); }
    }
    const out = path.join(DOCS, `pair-${P.name}.gif`), spec = path.join(dir, 'spec.json');
    fs.writeFileSync(spec, JSON.stringify({ paper: path.join(DOCS, 'papers', P.paper), paperLabel: P.paperLabel, guiLabel: P.guiLabel, frames, frameLabels: labels, out, colors, font: A.opt('--font'), frameMs: stepped ? PAIR.stepMs : PAIR.frameMs, holdMs: PAIR.holdMs }));
    const r = spawnSync(A.opt('--python') || 'python3', ['-I', path.join(HERE, 'pairs.py'), spec], { stdio: 'inherit' });
    fs.rmSync(dir, { recursive: true, force: true });
    if (r.status !== 0) { console.error(`docs/pair-${P.name}.gif was NOT built (needs python3 with Pillow; pass --python <bin>)`); process.exitCode = 1; }
    else console.log(`docs/pair-${P.name}.gif  <-  docs/papers/${P.paper} + index.html${P.q}, ${frames.length} frames (${(fs.statSync(out).size / 1024).toFixed(0)} KB)`);
  }
  await pp.close();
}

if (A.opt('--all')) {
  const dir = path.resolve(A.opt('--all')), before = A.opt('--before') ? path.resolve(A.opt('--before')) : null; fs.mkdirSync(dir, { recursive: true });
  await open('');
  const C = await page.evaluate(() => Plot.TH);
  const screens = await page.evaluate(() => SIM.MODEL_ORDER.flatMap(id => { const L = SIM.MODELS[id].lenses; return L ? Object.keys(L).map(k => [id, k]) : [[id, '']]; }));
  await page.setViewportSize({ width: 1200, height: 720 });
  const names = [];
  for (const [id, k] of screens) { const name = id + (k ? '-' + k : '') + '.png'; await open(`?model=${id}${k ? '&lens=' + k : ''}&still=1`); await page.screenshot({ path: path.join(dir, name) }); names.push(name); }
  const cell = (d, n) => `<figure><img loading="lazy" src="${path.relative(dir, path.join(d, n))}" alt="${n}"><figcaption>${n}</figcaption></figure>`;
  fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html><meta charset="utf-8"><title>ccn-sim screens</title><style>body{font:13px system-ui;margin:16px;background:${C.bg};color:${C.ink}}.row{display:grid;grid-template-columns:${before ? '1fr 1fr' : '1fr'};gap:10px;margin-bottom:14px}figure{margin:0}img{width:100%;border:1px solid ${C.line2};display:block}figcaption{color:${C.dim}}</style>`
    + `<h1>${names.length} screens${before ? ' — before (left) and after (right)' : ''}</h1>` + names.map(n => `<div class="row">${before ? cell(before, n) : ''}${cell(dir, n)}</div>`).join('\n'));
  console.log(`${names.length} screens -> ${dir} (open index.html)`);
}

await browser.close();
if (errs.length) { console.error(`page errors while taking the shots: ${errs.slice(0, 3).join(' | ')}`); process.exitCode = 1; }
