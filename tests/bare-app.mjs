import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { args, DEFAULT_TEMPLATE } from './lib/harness.mjs';

const A = args();
const SRC = path.resolve(A.opt('--template') || DEFAULT_TEMPLATE);
const PW = A.opt('--pw') ? path.resolve(A.opt('--pw')) : null;
const strip = s => s.replace(/\x1b\[[0-9;]*m/g, '');
let bad = 0;
const check = (ok, text) => { if (!ok) bad++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${text}`); };
const must = (cond, msg) => { if (!cond) { console.error('bare-app: the template no longer matches this test — ' + msg); process.exit(2); } };

const tmp = [];
function copy() { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ms-bare-')); tmp.push(dir); fs.cpSync(SRC, dir, { recursive: true }); return dir; }
const edit = (dir, file, fn) => { const fp = path.join(dir, file); fs.writeFileSync(fp, fn(fs.readFileSync(fp, 'utf8'))); };
const gate = dir => { const r = spawnSync('node', ['validate.mjs'], { cwd: dir, encoding: 'utf8' }); return { status: r.status, out: strip((r.stdout || '') + (r.stderr || '')) }; };

function makeBare(dir) {
  fs.rmSync(path.join(dir, 'examples.js')); fs.rmSync(path.join(dir, 'examples.checks.mjs'));
  edit(dir, 'index.html', h => { const re = /^<script src="examples\.js"><\/script>.*\n/m; must(re.test(h), 'no <script src="examples.js"> line in index.html'); return h.replace(re, ''); });
}
function readmeBlock(dir, heading) {
  const md = fs.readFileSync(path.join(dir, 'README.md'), 'utf8'), at = md.indexOf(heading);
  must(at >= 0, `the template README has no "${heading}" section`);
  const m = /```js\n([\s\S]*?)\n```/.exec(md.slice(at)); must(m, `no js block under "${heading}" in the template README`);
  return m[1];
}
function addSkeleton(dir, { withCheck }) {
  const entry = readmeBlock(dir, '## Add your model'), EMPTY = '  const MODELS = {\n  };\n  const MODEL_ORDER = [];';
  edit(dir, 'engine.js', s => { must(s.includes(EMPTY), 'engine.js no longer has an empty MODELS / MODEL_ORDER');
    return s.replace(EMPTY, () => `  const MODELS = {\n${entry}\n  };\n  const MODEL_ORDER = ['mymodel'];`); });
  if (!withCheck) return;
  const body = readmeBlock(dir, '## Write its check');
  edit(dir, 'engine.checks.mjs', s => { must(s.includes('export default {\n};'), 'engine.checks.mjs no longer ends in an empty table'); return s.replace('export default {\n};', () => `export default {\n${body}\n};`); });
}

const d1 = copy(); makeBare(d1);
{ const g = gate(d1); check(g.status === 1 && /no model is registered/.test(g.out) && /engine\.js/.test(g.out), `bare app with no model: the gate exits ${g.status} and says where to add one`); }

const d2 = copy(); makeBare(d2); addSkeleton(d2, { withCheck: true });
{ const g = gate(d2); check(g.status === 0 && /ALL CHECKS PASSED/.test(g.out) && !/warning/.test(g.out) && /the curve equals/.test(g.out), `bare app + the skeleton model and its check, uncommented as written: gate exit ${g.status}, no warning`);
  if (g.status !== 0) console.log(g.out.split('\n').filter(l => /FAIL|threw|Error/.test(l)).slice(0, 6).join('\n')); }

const d3 = copy(); makeBare(d3); addSkeleton(d3, { withCheck: false });
{ const g = gate(d3); check(g.status === 0 && /\(1 warning\)/.test(g.out) && /no analytic check for 1 model: mymodel/.test(g.out), `a model without an analytic check: gate exit ${g.status} with one counted warning`); }

const d4 = copy();
edit(d4, 'examples.js', s => { const a = s.indexOf('\n    mha: {\n'), b = s.indexOf('\n    },\n', a); must(a > 0 && b > a, 'cannot find the mha entry in examples.js');
  const t = s.slice(0, a) + s.slice(b + '\n    },'.length); must(t.includes(",'mha']"), "MODEL_ORDER no longer ends in 'mha'"); return t.replace(",'mha']", ']'); });
{ const g = gate(d4); check(g.status === 0 && /models: 20 registered/.test(g.out) && !/warning/.test(g.out), `examples.js with the mha example deleted (its check still in examples.checks.mjs): gate exit ${g.status}, 20 models`);
  if (g.status !== 0) console.log(g.out.split('\n').filter(l => /FAIL|threw|Error/.test(l)).slice(0, 6).join('\n')); }

const d5 = copy(); addSkeleton(d5, { withCheck: true });
edit(d5, 'engine.js', s => s.replace(/mymodel/g, 'ddm')); edit(d5, 'engine.checks.mjs', s => s.replace(/mymodel/g, 'ddm'));
{ const r = spawnSync('node', ['-e', `globalThis.window=globalThis;globalThis.document={createElement:()=>({getContext:()=>({})})};for(const f of ['plot.js','modules/mslib.js','engine.js','examples.js'])(0,eval)(require('fs').readFileSync(f,'utf8'));console.log(SIM.MODEL_ORDER[0],SIM.MODELS.ddm.name,SIM.MODEL_ORDER.length)`], { cwd: d5, encoding: 'utf8' });
  check((r.stdout || '').trim() === 'ddm My model 21', `a model of yours with an example's id keeps the id and comes first (${(r.stdout || r.stderr || '').trim().slice(0, 80)})`); }
{ const g = gate(d5); check(g.status === 0 && /model 'ddm' from engine\.js hides the examples\.js model/.test(g.out) && !/already defined/.test(g.out), `the gate names the hidden example and skips its check: exit ${g.status}`); }

const d6 = copy(); addSkeleton(d6, { withCheck: false }); edit(d6, 'engine.js', s => s.replace(/mymodel/g, 'lif'));
{ const g = gate(d6); check(g.status === 0 && /model 'lif' from engine\.js hides the examples\.js model/.test(g.out) && /no analytic check for 1 model: lif/.test(g.out), `a model of yours named 'lif' without a check: gate exit ${g.status}, warned, the example's check not run against it`);
  if (g.status !== 0) console.log(g.out.split('\n').filter(l => /FAIL|threw|Error/.test(l)).slice(0, 6).join('\n')); }

const d7 = copy(); makeBare(d7); addSkeleton(d7, { withCheck: true });
edit(d7, 'engine.js', s => { must(s.includes('1-Math.exp(-p.gain*x)'), 'the skeleton no longer computes 1-Math.exp(-p.gain*x)'); return s.split('1-Math.exp(-p.gain*x)').join('1-Math.exp(-env.params.gain*x)'); });
{ const g = gate(d7); check(g.status === 0 && /ALL CHECKS PASSED/.test(g.out), `a model that reads env.params: gate exit ${g.status}`);
  if (g.status !== 0) console.log(g.out.split('\n').filter(l => /FAIL|threw|Error/.test(l)).slice(0, 6).join('\n')); }

const d8 = copy(); makeBare(d8); addSkeleton(d8, { withCheck: true });
edit(d8, 'engine.js', s => { const start = s.indexOf('const MODELS = {'); must(start >= 0 && s.includes('1-Math.exp(-p.gain*x)', start), 'skeleton'); return s.replace(/simulate: *\(p, *env\) *=> *\{/g, (m, at) => at > start ? m + " if(String(env.seed).startsWith('r-')) throw new Error('seed r');" : m); });
{ const g = gate(d8); check(g.status === 1 && /threw with seed 'r-mymodel'/.test(g.out), `a model that throws for one seed only: gate exit ${g.status} and names the seed`);
  if (!/threw with seed/.test(g.out)) console.log(g.out.split('\n').filter(l => /FAIL|threw|Error|simulate/.test(l)).slice(0, 6).join('\n')); }

const d9 = copy(); makeBare(d9); addSkeleton(d9, { withCheck: false });
edit(d9, 'engine.js', s => s.replace("const MODEL_ORDER = ['mymodel'];", () => `MODELS.my = { id:'my', name:'My', params:[], simulate:()=>({}), lenses:{ 'a-b':{ label:'AB', views:[{ title:'v', draw:g=>g.note('x') }] } } };
  MODELS['my-a'] = { id:'my-a', name:'My A', params:[], simulate:()=>({}), lenses:{ b:{ label:'B', views:[{ title:'v', draw:g=>g.note('x') }] } } };
  const MODEL_ORDER = ['mymodel','my','my-a'];`));
{ const g = gate(d9); check(g.status === 1 && /#my-a-b opens my lens a-b, not my-a lens b/.test(g.out), `two models whose links collide (#my-a-b): gate exit ${g.status} and names the link`); }

const d10 = copy(); edit(d10, 'index.html', h => { must(h.includes('<script src="engine.js">') && h.includes('</style>'), 'index.html script/style');
  return h.replace('<script src="engine.js">', '<script src=engine.js>').replace('</style>', '.x{background:url(img/bg.png)}\n</style>'); });
{ const B = await import(pathToFileURL(path.join(d10, 'bundle.mjs')).href), b = B.bundle(d10, { title: 'Bare App Bundle' }), pr = B.bundleProblems(b.html);
  check(b.scripts.includes('engine.js') && pr.some(x => /url\(\)/.test(x)), `bundle: unquoted <script src=engine.js> inlined (${b.scripts.join(', ')}); relative url() reported (${pr.length} problem(s))`); }

if (PW) {
  const require = createRequire(PW + '/'); const { chromium } = require('playwright');
  const browser = await chromium.launch({ channel: A.opt('--channel') || 'chrome', headless: true });
  const open = async dir => { const p = await browser.newPage({ viewport: { width: 1200, height: 760 } }), errs = [], reqs = [];
    p.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)); }); p.on('pageerror', e => errs.push('PAGEERROR ' + String(e.message).slice(0, 160)));
    p.on('request', r => { if (!r.url().startsWith('file:')) reqs.push(r.url()); });
    await p.goto(pathToFileURL(path.join(dir, 'index.html')).href); await p.waitForTimeout(400); return { p, errs, reqs }; };
  { const { p, errs, reqs } = await open(d1); const text = await p.evaluate(() => document.body.innerText);
    const off = await p.evaluate(() => ['runBtn', 'resetBtn', 'pinBtn', 'linkBtn', 'diceBtn'].filter(id => !document.getElementById(id).disabled));
    check(errs.length === 0 && reqs.length === 0 && /No model is registered/i.test(text) && /engine\.js/.test(text) && off.length === 0, `bare app with no model in the browser: empty state shown, buttons disabled${off.length ? ' (still enabled: ' + off.join(',') + ')' : ''}, ${errs.length} errors${errs.length ? ' (' + errs[0] + ')' : ''}`); await p.close(); }
  { const { p, errs, reqs } = await open(d2);
    const o = await p.evaluate(() => { const c = document.querySelector('#views canvas'); if (!c || !c.width) return { tabs: 0, ink: 0 }; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4 * 31) if (d[i] !== d[0] || d[i + 1] !== d[1] || d[i + 2] !== d[2] || d[i + 3] !== d[3]) n++; return { tabs: document.querySelectorAll('#modelTabs button').length, ink: n }; });
    check(errs.length === 0 && reqs.length === 0 && o.tabs === 1 && o.ink > 20, `bare app + skeleton in the browser: ${o.tabs} tab, the view paints (${o.ink} sampled pixels), ${errs.length} errors${errs.length ? ' (' + errs[0] + ')' : ''}`); await p.close(); }
  await browser.close();
} else console.log('note: pass --pw <dir> to also open the bare app in a browser');

if (!process.env.KEEP) for (const d of tmp) fs.rmSync(d, { recursive: true, force: true });
console.log(bad ? `\nbare-app FAILED: ${bad} check(s)` : '\nbare-app OK');
process.exit(bad ? 1 : 0);
