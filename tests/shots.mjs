import { createRequire } from 'node:module';
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { args, DEFAULT_TEMPLATE } from './lib/harness.mjs';

const A = args();
if (!A.opt('--pw')) { console.error('usage: node tests/shots.mjs --pw <dir with node_modules/playwright> [--only png|gif] [--all <dir> [--before <dir>]]'); process.exit(2); }
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
const VIEW = { width: 1340, height: 815 };

const browser = await chromium.launch({ channel: A.opt('--channel') || 'chrome', headless: true });
const page = await browser.newPage({ viewport: VIEW, deviceScaleFactor: 1 });
const errs = []; page.on('pageerror', e => errs.push(String(e.message))); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
const open = async q => { await page.goto('about:blank'); await page.goto(url(q)); await page.waitForTimeout(350); };

if (!ONLY || ONLY === 'png') {
  fs.mkdirSync(path.join(DOCS, 'shots'), { recursive: true });
  for (const [name, q] of GALLERY) { await open(q); await page.screenshot({ path: path.join(DOCS, 'shots', name + '.png') }); console.log(`docs/shots/${name}.png  <-  index.html${q}`); }
  const hero = spawnSync('python3', ['-I', path.join(path.dirname(fileURLToPath(import.meta.url)), 'hero.py'), path.join(DOCS, 'shots'), path.join(DOCS, 'hero.png')], { stdio: 'inherit' });
  if (hero.status !== 0) { console.error('docs/hero.png was NOT rebuilt (python3 + Pillow needed)'); process.exitCode = 1; } else console.log('docs/hero.png  <-  docs/shots/*.png');
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

if (A.opt('--all')) {
  const dir = path.resolve(A.opt('--all')), before = A.opt('--before') ? path.resolve(A.opt('--before')) : null; fs.mkdirSync(dir, { recursive: true });
  await open('');
  const screens = await page.evaluate(() => SIM.MODEL_ORDER.flatMap(id => { const L = SIM.MODELS[id].lenses; return L ? Object.keys(L).map(k => [id, k]) : [[id, '']]; }));
  await page.setViewportSize({ width: 1200, height: 720 });
  const names = [];
  for (const [id, k] of screens) { const name = id + (k ? '-' + k : '') + '.png'; await open(`?model=${id}${k ? '&lens=' + k : ''}&still=1`); await page.screenshot({ path: path.join(dir, name) }); names.push(name); }
  const cell = (d, n) => `<figure><img loading="lazy" src="${path.relative(dir, path.join(d, n))}" alt="${n}"><figcaption>${n}</figcaption></figure>`;
  fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html><meta charset="utf-8"><title>model-scope screens</title><style>body{font:13px system-ui;margin:16px;background:#f4f3ee;color:#33312c}.row{display:grid;grid-template-columns:${before ? '1fr 1fr' : '1fr'};gap:10px;margin-bottom:14px}figure{margin:0}img{width:100%;border:1px solid #d6d2c5;display:block}figcaption{color:#6f6b61}</style>`
    + `<h1>${names.length} screens${before ? ' — before (left) and after (right)' : ''}</h1>` + names.map(n => `<div class="row">${before ? cell(before, n) : ''}${cell(dir, n)}</div>`).join('\n'));
  console.log(`${names.length} screens -> ${dir} (open index.html)`);
}

await browser.close();
if (errs.length) { console.error(`page errors while taking the shots: ${errs.slice(0, 3).join(' | ')}`); process.exitCode = 1; }
