/* =============================================================================
 * validate.mjs — the model-scope correctness gate.          Run:  node validate.mjs
 *
 * It loads exactly what index.html loads (the same <script src> list, in the same order, with
 * the REAL plot.js drawing onto a recording canvas stub), so the math and the views it checks are
 * the ones the page runs. The toolbox imposes no fixed output shape, so the gate is layered:
 *   (0) page      — every listed script exists and loads; nothing references another host or a
 *                   network API (the app must work offline from file://); the inline script parses;
 *   (1) schema    — every model's id, parameters, lenses and views are well-formed;
 *   (2) simulate  — runs at defaults, returns data, and is deterministic for a given seed;
 *   (3) views     — every view DRAWS at the start, middle and end of its playhead, per lens, with
 *                   finite axes, finite heatmap/image/graph data, a colorbar on every heatmap, and
 *                   (at the end of the playhead) at least one mark that is not axis furniture;
 *   (4) extremes  — simulate() stays finite and every view still draws at each control's min and max;
 *   (5) analytic  — per-model checks tied to the science (a closed form, a conservation law, a limit);
 *   (6) library   — the modules/mslib.js building blocks.
 * Options:
 *   --snapshot <file>   write digests of simulate() (defaults + every extreme) for YOUR models
 *   --against  <file>   compare with such a file and fail on any difference (an opt-in regression lock)
 * Deterministic: no Math.random, no clock — two runs print the same text.
 * ========================================================================== */
import fs from 'node:fs';

const HERE = new URL('./', import.meta.url);
const ARGV = process.argv.slice(2);
const optOf = f => { const i = ARGV.indexOf(f); return i >= 0 ? ARGV[i + 1] : undefined; };
let fails = 0, warns = 0;
const ok = b => (b ? '\x1b[32mPASS\x1b[0m' : (fails++, '\x1b[31mFAIL\x1b[0m'));
const warn = msg => { warns++; console.log(`  \x1b[33m⚠ ${msg}\x1b[0m`); };
const finish = () => { console.log(`\n${fails === 0 ? '\x1b[32m✓ ALL CHECKS PASSED\x1b[0m' : `\x1b[31m✗ ${fails} FAILED\x1b[0m`}${warns ? `  (${warns} warning${warns > 1 ? 's' : ''})` : ''}\n`); process.exit(fails === 0 ? 0 : 1); };
const fatal = msg => { console.log(`  ${msg}   [${ok(false)}]`); finish(); };

// ---------------------------------------------------------------------------------------------
// Browser stubs: a canvas whose 2d context counts INK calls, split into "chrome" (issued while an
// axis/legend/annotation helper is running) and "data" (everything else).
// ---------------------------------------------------------------------------------------------
const INK = new Set(['stroke', 'fill', 'fillRect', 'strokeRect', 'fillText', 'strokeText', 'drawImage', 'putImageData']);
let REC = null;
function mkCtx() {
  return new Proxy({}, {
    get(t, p) {
      if (p === 'measureText') return s => ({ width: String(s).length * 6 });
      if (p === 'createImageData') return (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h });
      if (p in t) return t[p];
      return () => { if (REC && INK.has(p)) { if (REC.chrome > 0) REC.chromeInk++; else REC.dataInk++; } };
    },
    set(t, p, v) { t[p] = v; return true; },
  });
}
const mkCanvas = (w, h) => { const ctx = mkCtx(); return { width: 0, height: 0, getBoundingClientRect: () => ({ width: w, height: h }), getContext: () => ctx }; };
globalThis.window = globalThis; globalThis.devicePixelRatio = 1;
globalThis.document = { createElement: () => mkCanvas(1, 1) };

// ---------------------------------------------------------------------------------------------
// (0) Load what the page loads, in the page's order.
// ---------------------------------------------------------------------------------------------
console.log('\n=== model-scope gate ===\n');
if (!fs.existsSync(new URL('index.html', HERE))) fatal('index.html not found next to validate.mjs');
const html = fs.readFileSync(new URL('index.html', HERE), 'utf8');
const tags = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].map(m => ({ body: m[2], src: (m[1].match(/\bsrc\s*=\s*["']([^"']+)["']/i) || [])[1] }));
const scripts = tags.filter(t => t.src).map(t => t.src), inline = tags.filter(t => !t.src).map(t => t.body);
const isRemote = s => /^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(s);
const sources = {};   // file → text, for the static scan
console.log(`--- page: index.html loads ${scripts.length} script${scripts.length === 1 ? '' : 's'} (${scripts.join(', ')}) ---`);
for (const s of scripts) {
  if (isRemote(s)) continue;                                   // reported by the static scan below
  if (!fs.existsSync(new URL(s, HERE))) fatal(`index.html loads ${s} but that file is missing`);
  sources[s] = fs.readFileSync(new URL(s, HERE), 'utf8');
  try { (0, eval)(sources[s]); } catch (e) { fatal(`${s} failed to load: ${e.message}`); }
}
const SIM = globalThis.SIM, Plot = globalThis.Plot, MSLIB = globalThis.MSLIB;
if (!SIM || !SIM.MODELS || !Array.isArray(SIM.MODEL_ORDER)) fatal('no script defined window.SIM with MODELS and MODEL_ORDER (engine.js)');
if (!Plot || typeof Plot.make !== 'function') fatal('no script defined window.Plot (plot.js)');

// static scan: the app must be self-contained. Comments are dropped first so prose cannot trip it.
const stripComments = js => js.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[\s;{}(),])\/\/[^\n]*/g, '$1');
const lineOf = (text, i) => text.slice(0, i).split('\n').length;
const EXTERNAL = [
  [/\b(?:src|href)\s*=\s*["'`]?\s*(?:https?:)?\/\/[^\s"'`>]*/i, 'a src/href on another host'],
  [/url\(\s*["']?\s*(?:https?:)?\/\/[^\s"')]*/i, 'a CSS url() on another host'],
  [/@import\b[^;\n]*/i, 'a CSS @import'],
];
const NETWORK = [/\bfetch\s*\(/, /\bXMLHttpRequest\b/, /\bWebSocket\b/, /\bEventSource\b/, /\bimport\s*\(/, /\bimportScripts\b/, /\bsendBeacon\b/];
{
  const hits = [];
  const scan = (name, text, js) => {
    for (const [re, what] of EXTERNAL) { const m = re.exec(text); if (m) hits.push(`${name}:${lineOf(text, m.index)} ${what} (${m[0].trim().slice(0, 60)})`); }
    if (js) for (const re of NETWORK) { const m = re.exec(text); if (m) hits.push(`${name}:${lineOf(text, m.index)} a network API (${m[0].trim()})`); }
  };
  scan('index.html', html.replace(/<!--[\s\S]*?-->/g, m => m.replace(/[^\n]/g, ' ')), false);
  inline.forEach(body => scan('index.html inline script', stripComments(body), true));
  for (const [name, text] of Object.entries(sources)) scan(name, stripComments(text), true);
  console.log(`  self-contained: no other host, no network API in index.html or the scripts it loads   [${ok(hits.length === 0)}]`);
  hits.forEach(h => console.log('    ' + h));
  const bad = []; inline.forEach((body, i) => { try { new Function(body); } catch (e) { bad.push(`inline script ${i + 1}: ${e.message}`); } });
  console.log(`  the inline toolbox script parses   [${ok(bad.length === 0)}]`); bad.forEach(b => console.log('    ' + b));
}

// ---------------------------------------------------------------------------------------------
// Helpers shared by the generic passes and the analytic checks.
// ---------------------------------------------------------------------------------------------
const env = seed => ({ rng: SIM.makeRNG(seed), seed, params: {}, batch: false });   // batch:false → heavy models run a SMALL synchronous batch here (see runChunks)
const def = id => { const p = {}; (SIM.MODELS[id].params || []).forEach(s => { p[s.name] = s.default; }); return p; };
const isNum = v => typeof v === 'number' && isFinite(v);
const allFinite = (v, depth = 0) => {   // scan returned data for a non-finite number (bounded: ≤3000 per array level, depth ≤6)
  if (typeof v === 'number') return isFinite(v);
  if (depth > 6) return true;
  if (Array.isArray(v) || ArrayBuffer.isView(v)) { const n = Math.min(v.length, 3000); for (let i = 0; i < n; i++) if (!allFinite(v[i], depth + 1)) return false; return true; }
  if (v && typeof v === 'object') { for (const k in v) if (!allFinite(v[k], depth + 1)) return false; return true; }
  return true;   // strings / functions / null: skip
};
// digest of everything simulate() returned: FNV-1a over toPrecision(10) of every number (plus strings, booleans, keys)
const fnv = (s, h) => { for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; };
function digest(data) {
  const st = { n: 0, h: 0x811c9dc5 };
  (function walk(v, depth) {
    if (depth > 12) return;
    if (typeof v === 'number') { st.n++; st.h = fnv(Number.isFinite(v) ? v.toPrecision(10) : String(v), st.h); }
    else if (typeof v === 'string' || typeof v === 'boolean') st.h = fnv(String(v), st.h);
    else if (v && typeof v === 'object') { if (ArrayBuffer.isView(v) || Array.isArray(v)) for (let i = 0; i < v.length; i++) walk(v[i], depth + 1); else for (const k of Object.keys(v).sort()) { st.h = fnv(k, st.h); walk(v[k], depth + 1); } }
  })(data, 0);
  return st.n + ':' + st.h.toString(16).padStart(8, '0');
}
const extremesOf = s => s.type === 'enum' ? [0, ((s.options && s.options.length) || 1) - 1] : s.type === 'bool' ? [false, true] : (typeof s.min === 'number' && typeof s.max === 'number') ? [s.min, s.max] : [];

// one view, drawn through the real plot.js onto a recording canvas
const CHROME = ['frame', 'legend', 'colorbar', 'note', 'vline', 'hline', 'text'];
function drawView(view, data, ui) {
  const rec = { badFrame: false, badData: false, heat: 0, colorbar: 0, dataInk: 0, chromeInk: 0, chrome: 0, threw: null };
  REC = rec;
  try {
    const g = Plot.make(mkCanvas(600, 400));
    const sample = (nx, ny, val) => { if (typeof val !== 'function') return; for (const [i, j] of [[0, 0], [nx - 1, ny - 1], [nx >> 1, ny >> 1]]) if (!isNum(val(i, j))) rec.badData = true; };   // a heatmap/image fed non-finite values renders black — flag it
    const before = {
      frame: o => { o = o || {}; if (o.x && (!isNum(o.x[0]) || !isNum(o.x[1]))) rec.badFrame = true; if (o.y && (!isNum(o.y[0]) || !isNum(o.y[1]))) rec.badFrame = true; },
      heat: (nx, ny, val) => { rec.heat++; sample(nx, ny, val); },
      image: (nx, ny, val) => { sample(nx, ny, val); },
      colorbar: () => { rec.colorbar++; },
      graph: (nodes, edges) => { nodes = nodes || []; for (const e of (edges || [])) { const a = nodes[e.from], b = nodes[e.to]; if (!a || !b || !isNum(a.x) || !isNum(a.y) || !isNum(b.x) || !isNum(b.y)) rec.badData = true; } for (const nd of nodes) if (nd && (!isNum(nd.x) || !isNum(nd.y))) rec.badData = true; },
    };
    for (const name of new Set([...CHROME, ...Object.keys(before)])) {
      const f = g[name]; if (typeof f !== 'function') continue; const chrome = CHROME.includes(name), pre = before[name];
      g[name] = (...a) => { if (pre) pre(...a); if (chrome) rec.chrome++; try { return f(...a); } finally { if (chrome) rec.chrome--; } };
    }
    view.draw(g, data, ui);
  } catch (e) { rec.threw = e; }
  REC = null; return rec;
}
// every lens × view × playhead position of a model, for one parameter set
function renderModel(m, p, data, { nonEmpty = false } = {}) {
  const out = { draws: 0, threw: [], axis: [], dat: [], cbar: [], empty: [], hooks: [] }, add = (list, tag) => { if (!list.includes(tag)) list.push(tag); };
  for (const [key, spec] of (m.lenses ? Object.entries(m.lenses) : [['', m]])) {
    let stageList = null, length = 1;
    try { stageList = spec.stages ? ((typeof spec.stages === 'function') ? spec.stages(p, data) : spec.stages) : null; } catch (e) { out.hooks.push(`${key || 'model'}: stages() threw ${e.message}`); }
    if (stageList && stageList.length) length = stageList.length;
    else { stageList = null; if (spec.anim) { try { const L = spec.anim.length(p, data); length = isFinite(L) ? Math.max(1, Math.floor(L)) : 1; } catch (e) { out.hooks.push(`${key || 'model'}: anim.length() threw ${e.message}`); length = 1; } } }
    const end = stageList ? length - 1 : length, heads = [...new Set([0, stageList ? Math.floor(end / 2) : end / 2, end])];
    (spec.views || []).forEach((v, vi) => { const tag = (key ? key + '/' : '') + 'v' + vi; if (typeof v.draw !== 'function') return;
      for (const head of heads) {
        const stage = stageList ? Math.min(length - 1, Math.floor(head)) : null;
        const ui = { head, params: p, playing: false, frac: head - Math.floor(head), stage, stageKey: (stage != null && stageList[stage]) ? stageList[stage].key : null, stages: stageList, nStages: stageList ? stageList.length : 0 };
        const r = drawView(v, data, ui); out.draws++;
        if (r.threw) { if (!out.threw.find(f => f.tag === tag)) out.threw.push({ tag, msg: `head=${head}: ${r.threw.message}` }); continue; }
        if (r.badFrame) add(out.axis, tag);
        if (r.badData) add(out.dat, tag);
        if (r.heat > 0 && r.colorbar === 0) add(out.cbar, tag);
        if (nonEmpty && head === end && r.dataInk === 0) add(out.empty, tag);
      } });
  }
  out.good = !out.threw.length && !out.axis.length && !out.dat.length && !out.cbar.length && !out.empty.length && !out.hooks.length;
  out.text = (out.threw.length ? `  threw: ${out.threw.map(f => f.tag).join(',')}` : '') + (out.axis.length ? `  non-finite axis: ${out.axis.join(',')}` : '') + (out.dat.length ? `  non-finite heatmap/image/graph data: ${out.dat.join(',')}` : '')
    + (out.cbar.length ? `  heatmap w/o colorbar: ${out.cbar.join(',')}` : '') + (out.empty.length ? `  draws axes but no data at the end of its playhead: ${out.empty.join(',')}` : '') + (out.hooks.length ? `  ${out.hooks.join('; ')}` : '');
  return out;
}

// ---------------------------------------------------------------------------------------------
// (1) schema lint — the toolbox builds its controls, element ids and links from these fields.
// ---------------------------------------------------------------------------------------------
const ID_RE = /^[A-Za-z0-9_-]+$/, NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const RESERVED = id => ['settings', 'sidebar', 'customize', 'upgrade', 'downloads'].includes(id) || /^comment-/.test(id);   // names a hosting page may claim for itself in a #link
function lintModel(key, m) {
  const bad = [];
  if (!m || typeof m !== 'object') return ['not an object'];
  if (m.id !== key) bad.push(`id '${m.id}' differs from its MODELS key '${key}'`);
  if (!ID_RE.test(key)) bad.push(`id '${key}' must use only letters, digits, _ and -`);
  if (RESERVED(key)) bad.push(`id '${key}' is a reserved link name`);
  if (typeof m.name !== 'string' || !m.name.trim()) bad.push('name (the tab label) is empty');
  if (typeof m.simulate !== 'function') bad.push('simulate is not a function');
  const seen = new Set();
  for (const s of (m.params || [])) {
    const n = s && s.name;
    if (typeof n !== 'string' || !NAME_RE.test(n)) { bad.push(`param name '${n}' must be an identifier (letters, digits, _)`); continue; }
    if (seen.has(n)) bad.push(`param '${n}' is declared twice`); seen.add(n);
    if (typeof s.label !== 'string' || !s.label.trim()) bad.push(`param '${n}' has no label`);
    if (s.type === 'enum') { if (!Array.isArray(s.options) || s.options.length < 2 || !s.options.every(o => typeof o === 'string' && o)) bad.push(`enum '${n}' needs at least two option strings`);
      else if (!Number.isInteger(s.default) || s.default < 0 || s.default >= s.options.length) bad.push(`enum '${n}' default must be an option index 0..${s.options.length - 1}`); }
    else if (s.type === 'bool') { if (typeof s.default !== 'boolean') bad.push(`bool '${n}' default must be true or false`); }
    else if (s.type !== undefined) bad.push(`param '${n}' has unknown type '${s.type}'`);
    else { if (!isNum(s.min) || !isNum(s.max) || !(s.min < s.max)) bad.push(`param '${n}' needs min < max`);
      if (!isNum(s.step) || !(s.step > 0)) bad.push(`param '${n}' needs step > 0`);
      if (!isNum(s.default) || s.default < s.min || s.default > s.max) bad.push(`param '${n}' default ${s.default} is outside [${s.min}, ${s.max}]`);
      if (s.int && isNum(s.default) && !Number.isInteger(s.default)) bad.push(`int param '${n}' has a non-integer default`); }
  }
  const lintViews = (where, views) => { if (!Array.isArray(views) || !views.length) { bad.push(`${where} has no views`); return; }
    views.forEach((v, i) => { if (!v || typeof v.draw !== 'function') bad.push(`${where} view ${i} has no draw()`); if (!v || typeof v.title !== 'string' || !v.title.trim()) bad.push(`${where} view ${i} has no title`); }); };
  if (m.lenses) { const keys = Object.keys(m.lenses); if (!keys.length) bad.push('lenses is empty');
    for (const k of keys) { const L = m.lenses[k]; if (!ID_RE.test(k)) bad.push(`lens key '${k}' must use only letters, digits, _ and -`);
      if (!L || typeof L.label !== 'string' || !L.label.trim()) bad.push(`lens '${k}' has no label`); lintViews(`lens '${k}'`, L && L.views); } }
  else lintViews('the model', m.views);
  return bad;
}

const ORDER = SIM.MODEL_ORDER.slice();
const PAD = Math.max(12, ...ORDER.map(id => String((SIM.MODELS[id] || {}).name || id).length)) + 2, label = m => String(m.name).padEnd(PAD);
console.log(`\n--- models: ${ORDER.length} registered (schema · simulate at defaults · same seed → same result) ---`);
if (ORDER.length === 0) fatal('no model is registered — add one to MODELS / MODEL_ORDER in engine.js (or keep the examples.js script line)');
{
  const dup = ORDER.filter((id, i) => ORDER.indexOf(id) !== i), ghost = ORDER.filter(id => !SIM.MODELS[id]), hidden = Object.keys(SIM.MODELS).filter(id => !ORDER.includes(id));
  if (dup.length || ghost.length) { console.log(`  MODEL_ORDER and MODELS agree   [${ok(false)}]${dup.length ? '  listed twice: ' + [...new Set(dup)].join(',') : ''}${ghost.length ? '  in MODEL_ORDER but not in MODELS: ' + ghost.join(',') : ''}`); finish(); }
  if (hidden.length) warn(`in MODELS but not in MODEL_ORDER (no tab, not checked): ${hidden.join(', ')}`);
}
const usable = [];   // models whose simulate() ran at defaults — the later passes skip the rest (already reported)
for (const id of ORDER) {
  const m = SIM.MODELS[id], lint = lintModel(id, m), p = def(id);
  let data, threw = null; try { data = m.simulate({ ...p }, env('v-' + id)); } catch (e) { threw = e; }
  const specs = m.lenses ? Object.values(m.lenses) : [m];   // a lens model carries its views per lens
  const viewsOk = specs.length >= 1 && specs.every(s => Array.isArray(s.views) && s.views.length >= 1 && s.views.every(v => typeof v.draw === 'function'));
  const nv = specs.reduce((a, s) => a + ((s.views && s.views.length) || 0), 0);
  const ran = !threw && !!data && typeof data === 'object';
  let same = false; if (ran) { try { same = digest(m.simulate({ ...p }, env('det-' + id))) === digest(m.simulate({ ...p }, env('det-' + id))); } catch (e) { same = false; } }
  console.log(`  ${label(m)}schema [${ok(lint.length === 0)}]  simulate=${threw ? '\x1b[31mthrew\x1b[0m' : 'ok'}  views=${nv}${m.lenses ? ` (${specs.length} lenses)` : ''}  [${ok(ran && viewsOk)}]  deterministic [${ok(ran && same)}]`);
  lint.forEach(l => console.log('    schema: ' + l));
  if (threw) console.log('    ' + threw.message);
  if (ran && !same) console.log('    two runs with the same seed returned different data — draw every random number from env.rng / trialRng(env.seed, k)');
  if (ran && viewsOk) usable.push(id);
}

// ---------------------------------------------------------------------------------------------
// (3) view-render pass: every view must DRAW without throwing (at the start, middle and end of its
//     playhead, per lens) through the real plot.js, with FINITE axis ranges, finite heatmap/image/
//     graph data, a COLORBAR on every heatmap, and real marks at the end of the playhead. This is the
//     machine-checkable slice of gui-qc.md — a view that dies on first paint, a NaN axis (blank
//     panel), a heatmap with no scale, or a panel of bare axes all FAIL the gate instead of shipping.
// ---------------------------------------------------------------------------------------------
console.log('\n--- view render at defaults (draws · finite axes · colorbar on heatmaps · not empty) ---');
for (const id of usable) {
  const m = SIM.MODELS[id], p = def(id);
  let data; try { data = m.simulate({ ...p }, env('r-' + id)); } catch (e) { continue; }   // simulate-throw already reported above
  const r = renderModel(m, p, data, { nonEmpty: true });
  console.log(`  ${label(m)}[${ok(r.good)}]  ${r.draws} draws${r.text}`);
  r.threw.forEach(f => console.log('    ' + f.tag + ': ' + f.msg));
}

// ---------------------------------------------------------------------------------------------
// (4) parameter property pass: at each control's MIN and MAX (bool and enum choices included)
//     simulate() returns finite data AND every view still draws — catches a NaN or a throw at a
//     slider extreme (zero drift, a tiny dt, an empty batch).
// ---------------------------------------------------------------------------------------------
console.log('\n--- parameter extremes (simulate stays finite, views still draw, at each control min/max) ---');
for (const id of usable) {
  const m = SIM.MODELS[id], base = def(id), bad = []; let draws = 0;
  for (const s of (m.params || [])) for (const v of extremesOf(s)) {
    const p = { ...base, [s.name]: v };
    try {
      const d = m.simulate({ ...p }, env('p-' + id + '-' + s.name + v));
      if (!d || typeof d !== 'object') { bad.push(`${s.name}=${v}(no data)`); continue; }
      if (!allFinite(d)) bad.push(`${s.name}=${v}(non-finite data)`);
      const r = renderModel(m, p, d); draws += r.draws; if (!r.good) bad.push(`${s.name}=${v}(views:${r.text.replace(/\s+/g, ' ')}${r.threw.length ? ' — ' + r.threw[0].msg : ''})`);
    } catch (e) { bad.push(`${s.name}=${v}: ${e.message}`); }
  }
  console.log(`  ${label(m)}[${ok(!bad.length)}]  ${draws} draws` + (bad.length ? '  ' + bad.slice(0, 3).join(' | ') : ''));
}

// ---------------------------------------------------------------------------------------------
// (5)(6) analytic checks. Each is a function of a small toolkit `t`; a check for a model runs
//        only when that model is registered, so deleting an example never breaks the gate.
// ---------------------------------------------------------------------------------------------
const rel = (a, b) => Math.abs(a - b) / Math.max(1e-300, Math.abs(b));
const toolkit = {
  SIM, Plot, L: MSLIB, env, def, rel,
  has: id => !!SIM.MODELS[id],
  sim: (id, over, seed) => SIM.MODELS[id].simulate({ ...def(id), ...(over || {}) }, env(seed)),
  ok: (cond, text) => console.log(`    ${text}   [${ok(!!cond)}]`),
  info: text => console.log(`    ${text}`),
};

/* engine + plot helpers every model leans on */
const CORE_CHECKS = t => {
  const { SIM, Plot } = t;
  { let z = 0; for (let i = 0; i < 4000; i++) z += SIM.npdf(-8 + 16 * (i + 0.5) / 4000, 0.3, 1.2) * 16 / 4000; t.ok(Math.abs(z - 1) < 1e-9, `npdf integrates to 1 (${z.toFixed(10)})`); }
  { const rng = SIM.makeRNG('g'); let s = 0, s2 = 0, s4 = 0; const n = 200000; for (let i = 0; i < n; i++) { const x = SIM.gaussian(rng); s += x; s2 += x * x; s4 += x ** 4; }
    t.ok(Math.abs(s / n) < 0.01 && Math.abs(s2 / n - 1) < 0.01 && Math.abs(s4 / n - 3) < 0.08, `gaussian(): mean ${(s / n).toFixed(4)}, variance ${(s2 / n).toFixed(4)}, 4th moment ${(s4 / n).toFixed(3)} (0, 1, 3)`); }
  { const a = SIM.makeRNG('same'), b = SIM.makeRNG('same'), c = SIM.makeRNG('other'); let eq = true, diff = false, unit = true;
    for (let i = 0; i < 200; i++) { const x = a(), y = b(), z = c(); if (x !== y) eq = false; if (x !== z) diff = true; if (!(x >= 0 && x < 1)) unit = false; }
    const k = SIM.trialRng('s', 7), k2 = SIM.makeRNG('s#7'); t.ok(eq && diff && unit && k() === k2(), 'makeRNG: same seed → same stream in [0,1), another seed → another stream; trialRng(seed,k) = makeRNG(seed#k)'); }
  { const seen = []; SIM.runChunks(7, k => seen.push(k), 'check'); t.ok(seen.join() === '0,1,2,3,4,5,6', 'runChunks visits every item once, in order (synchronously in Node)'); }
  { const h = Plot.histify([0.05, 0.15, 0.15, 0.95, -1, 2], 10, 0, 1), q = Plot.histify([0.01, 0.02, 0.03, 0.04], 100, 0, 1, 0.25);
    t.ok(h.counts.length === 10 && h.counts[0] === 1 && h.counts[1] === 2 && h.counts[9] === 1 && h.counts.reduce((a, b) => a + b, 0) === 4 && Math.abs(h.binW - 0.1) < 1e-12 && h.max === 2 && Math.abs(q.binW - 0.25) < 1e-12,
      'Plot.histify: values land in their own bin, out-of-range values are dropped, bin width snaps to the quantum'); }
};

/* per-model checks, keyed by model id */
const MODEL_CHECKS = {
  // Bayesian observer: reliability weight in (0,1); estimate lies between measurement & prior mean; the closed forms
  bayes(t) {
    const p = t.def('bayes'), d = t.sim('bayes', {}, 'bayes');
    const between = (d.muPost - p.mu0) * (d.m - d.muPost) >= -1e-9;   // μ̂ between μ0 and m
    t.ok(d.w > 0 && d.w < 1 && between, `w=${d.w.toFixed(3)} (0<w<1) · θ̂ between m and μ₀`);
    const c = t.sim('bayes', {}, 'c-bayes'), vm = p.sigma_m ** 2, v0 = p.sigma0 ** 2, g = t.L.bayes.gaussPosterior(c.m, p.sigma_m, p.mu0, p.sigma0);
    t.ok(Math.abs(c.w - v0 / (v0 + vm)) < 1e-12, 'w = σ₀²/(σ₀²+σ_m²)');
    t.ok(Math.abs(c.sigPost ** 2 - 1 / (1 / vm + 1 / v0)) < 1e-12, 'σ_post² = 1/(1/σ_m² + 1/σ₀²)');
    t.ok(Math.abs(c.muPost - g.mu) < 1e-12 && Math.abs(c.sigPost - g.sigma) < 1e-12, 'posterior mean and SD equal MSLIB.bayes.gaussPosterior');
    const d0 = t.sim('bayes', { alpha: 0 }, 'c-bayes0'); t.ok(d0.muSeq.every(v => v === p.mu0), 'learning rate 0 leaves the prior mean fixed');
    const d1 = t.sim('bayes', { alpha: 0.05, nTrials: 1500 }, 'c-bayes1'); let s = 0, n = 0; for (let k = 750; k <= 1500; k++) { s += d1.muSeq[k]; n++; }
    t.ok(Math.abs(s / n - p.stimMean) < 0.1, `the learned prior mean converges to the stimulus mean (${(s / n).toFixed(3)} vs ${p.stimMean})`);
  },
  // Drift-diffusion: first-passage statistics against the closed forms ER = 1/(1+e^{2Az/c²}), DT = (z/A)·tanh(Az/c²)
  ddm(t) {
    const tally = d => { let cor = 0, err = 0, st = 0; for (let k = 0; k < d.n; k++) { if (d.out[k] === 1) cor++; else if (d.out[k] === 2) err++; if (d.out[k]) st += d.rt[k]; } return { ER: err / (cor + err), DT: st / (cor + err) }; };
    const p = { ...t.def('ddm'), dt: 0.005, nTrials: 40000 }, s = tally(t.sim('ddm', p, 'ddm'));
    const th = 1 / (1 + Math.exp(2 * p.A * p.z / (p.c * p.c)));
    t.ok(Math.abs(s.ER - th) / th < 0.12, `sim ER=${(100 * s.ER).toFixed(2)}%  theory=${(100 * th).toFixed(2)}% (continuous-time closed form; Euler-biased but close)`);
    // A walk checked only every dt overshoots the bound; the continuity correction moves the bound out by
    // β·c·√dt with β = −ζ(1/2)/√(2π) = 0.5826 (Broadie, Glasserman & Kou 1997) and removes most of that bias.
    const BETA = 0.5826, ref = (A, z, c, dt) => { const zc = z + BETA * c * Math.sqrt(dt), a = A * zc / (c * c); return { ER: 1 / (1 + Math.exp(2 * a)), DT: (zc / A) * Math.tanh(a) }; };
    const r = ref(p.A, p.z, p.c, p.dt);
    t.ok(t.rel(s.ER, r.ER) < 0.04, `ER vs the discretisation-corrected closed form: ${(100 * s.ER).toFixed(2)}% vs ${(100 * r.ER).toFixed(2)}% (tol 4%)`);
    t.ok(t.rel(s.DT, r.DT) < 0.04, `mean decision time vs the corrected closed form: ${s.DT.toFixed(4)} vs ${r.DT.toFixed(4)} s (tol 4%)`);
    for (const [A, z, c] of [[0.5, 1.5, 1], [2, 0.8, 1.5]]) { const e = tally(t.sim('ddm', { ...p, A, z, c }, 'ddm2' + A)), q = ref(A, z, c, p.dt);
      t.ok(t.rel(e.ER, q.ER) < 0.06 && t.rel(e.DT, q.DT) < 0.04, `second operating point A=${A} z=${z} c=${c}: ER off by ${(100 * t.rel(e.ER, q.ER)).toFixed(1)}%, DT off by ${(100 * t.rel(e.DT, q.DT)).toFixed(1)}%`); }
  },
  // Early vision: a high-contrast, low-noise grating decodes back to its true orientation; the energy map is phase-invariant
  vision(t) {
    let worst = 0; for (const th of [20, 60, 110, 150]) { const d = t.sim('vision', { contrast: 1, noise: 0.02, ori: th }, 'vis' + th); const e = Math.abs(((d.dec - th + 90) % 180) - 90); if (e > worst) worst = e; }
    t.ok(worst < 25, `worst orientation decode error = ${worst.toFixed(1)}° (clean grating)`);
    const cv = a => { let m = 0, n = 0; const N = 40; for (let y = 12; y < 28; y++) for (let x = 12; x < 28; x++) { m += a[y * N + x]; n++; } m /= n; let v = 0; for (let y = 12; y < 28; y++) for (let x = 12; x < 28; x++) v += (a[y * N + x] - m) ** 2; return Math.sqrt(v / n) / m; };
    const d = t.sim('vision', { noise: 0, ori: 30, contrast: 1 }, 'vis'), k = d.pooled.indexOf(Math.max(...d.pooled));
    t.ok(cv(d.maps[k]) < 0.15, `quadrature energy of the matched channel is smooth, not striped (CV=${cv(d.maps[k]).toFixed(3)} < 0.15)`);
  },
  // LIF neuron: the f–I curve is monotonic, silent at I=0, and follows the analytic rate
  lif(t) {
    const d = t.sim('lif', {}, 'lif');
    const mono = d.fI.every((q, i) => i === 0 || q[1] >= d.fI[i - 1][1] - 1e-9), silent = d.fI[0][1] === 0, hi = d.fI[d.fI.length - 1][1];
    t.ok(mono && silent && hi > 5, `f–I monotonic & fires above rheobase (0→${hi.toFixed(0)} Hz, silent at I=0=${silent})`);
    const pr = d.pr; let worst = 0, n = 0;
    for (const [I, r] of d.fI) { const drive = pr.R * I, gap = pr.Vth - pr.EL, an = drive > gap ? 1 / (pr.tref + pr.tau * Math.log(drive / (drive - gap))) : 0; if (an > 10) { worst = Math.max(worst, t.rel(r, an)); n++; } else if (an === 0 && r !== 0) worst = 9; }
    t.ok(worst < 0.08 && n > 10, `noise-free f–I vs 1/(t_ref + τ·ln(RI/(RI−(V_th−E_L)))): worst error ${(100 * worst).toFixed(1)}% over ${n} points (tol 8%)`);
    const d2 = t.sim('lif', { refrac: false }, 'lif'); t.ok(d2.fI[24][1] > d.fI[24][1], `without the refractory period the top rate rises (${d.fI[24][1]} → ${d2.fI[24][1]} Hz)`);
  },
  // Rescorla–Wagner: the value TRACKS the reward probability, and follows 1−(1−α)^n exactly under certain reward
  rl(t) {
    const d = t.sim('rl', { nTrials: 300, alpha: 0.12 }, 'rl'); let s = 0, c = 0; for (let k = Math.floor(d.n / 2); k <= d.n; k++) { s += d.V[k]; c++; }
    t.ok(Math.abs(s / c - d.pRew) < 0.1, `time-averaged V → reward prob (mean=${(s / c).toFixed(2)} vs p=${d.pRew})`);
    const a = 0.2, e = t.sim('rl', { pRew: 1, alpha: a, nTrials: 40 }, 'rl'); let w = 0; for (let k = 0; k <= e.n; k++) w = Math.max(w, Math.abs(e.V[k] - (1 - Math.pow(1 - a, k))));
    t.ok(w < 1e-12, `V_n = 1−(1−α)^n when every trial is rewarded (max error ${w.toExponential(1)})`);
  },
  // Decision comparison: both models reduce to chance with no signal; the analytic screen agrees with simulation
  compare(t) {
    const p = t.def('compare'), z0 = t.sim('compare', { A: 0 }, 'cmp0'), d = t.sim('compare', {}, 'cmp');
    const chance = Math.abs(z0.accD - 0.5) < 1e-6 && Math.abs(z0.accS - 0.5) < 1e-6;
    const mono = d.satDDM.every((q, i) => i === 0 || q[1] >= d.satDDM[i - 1][1] - 1e-9);   // accuracy ↑ with the bound
    let inb = true; for (const v of d.grid) if (v < 0.5 - 1e-6 || v > 1 + 1e-6) inb = false;   // metric=0 → accuracy in [0.5,1]
    t.ok(chance, 'chance at A=0 for both models'); t.ok(mono, 'DDM accuracy monotonic in the bound'); t.ok(inb, 'accuracy heatmap ∈ [0.5,1]');
    if (t.has('ddm')) { const e = t.sim('ddm', { A: p.A, c: p.c, z: p.z, dt: 0.002, nTrials: 8000 }, 'cmp-ddm'); let co = 0, er = 0, s = 0; for (let k = 0; k < e.n; k++) { if (e.out[k] === 1) co++; else if (e.out[k] === 2) er++; if (e.out[k]) s += e.rt[k]; }
      t.ok(Math.abs(d.accD - co / (co + er)) < 0.02, `analytic DDM accuracy vs the simulated ddm model: ${d.accD.toFixed(4)} vs ${(co / (co + er)).toFixed(4)} (tol 0.02)`);
      t.ok(t.rel(d.dtD, s / (co + er)) < 0.06, `analytic DDM mean decision time vs simulated: ${d.dtD.toFixed(4)} vs ${(s / (co + er)).toFixed(4)} s (tol 6%)`); }
    const rng = t.SIM.makeRNG('cmp-ss'); let pos = 0; const N = 40000; for (let i = 0; i < N; i++) if (p.A * p.T + p.c * Math.sqrt(p.T) * t.SIM.gaussian(rng) > 0) pos++;
    t.ok(Math.abs(d.accS - pos / N) < 0.01, `one-sample accuracy vs Monte Carlo: ${d.accS.toFixed(4)} vs ${(pos / N).toFixed(4)} (tol 0.01)`);
    t.ok(Math.abs(d.rrD - d.accD / (d.dtD + p.Ter)) < 1e-12 && Math.abs(d.rrS - d.accS / (p.T + p.Ter)) < 1e-12, 'reward rate = accuracy / (decision time + T_er)');
  },
  // Attractor network: strong + coherence drives pool 1 to win (winner-take-all), and a decision is reached
  attractor(t) {
    let win1 = 0, decided = 0; for (let k = 0; k < 8; k++) { const d = t.sim('attractor', { coh: 25 }, 'att' + k); if (d.decT > 0) decided++; if (d.win === 1) win1++; }
    t.ok(win1 >= 6 && decided >= 6, `pool 1 wins at +25% coh ${win1}/8, decided ${decided}/8`);
  },
  // Spatial SIR: epidemic threshold at R0=1; mass is conserved; the well-mixed peak follows its closed form; infection spreads only through D
  sir(t) {
    const d = t.sim('sir', {}, 'sir'), below = d.sweep.find(q => q[0] <= 0.8), above = d.sweep[d.sweep.length - 1];
    const mono = d.sweep.every((q, i) => i === 0 || q[1] >= d.sweep[i - 1][1] - 1e-6);
    t.ok(below[1] < 0.02 && above[1] > 0.2 && mono && d.peakI > 0.05, `peak below R₀=1 = ${(below[1] * 100).toFixed(1)}% « above = ${(above[1] * 100).toFixed(0)}%; threshold monotonic`);
    const leak = e => { let w = 0; for (let i = 0; i < e.nF; i++) w = Math.max(w, Math.abs(e.totS[i] + e.totI[i] + e.totR[i] - 1)); return w; };
    t.ok(leak(d) < 1e-9, `S+I+R = 1 at every stored frame (max deviation ${leak(d).toExponential(1)})`);
    let wp = 0; for (const [R0, pk] of d.sweep) if (R0 >= 1.5) wp = Math.max(wp, Math.abs(pk - (1 - (1 + Math.log(R0)) / R0)));
    t.ok(wp < 0.01, `well-mixed peak vs 1 − (1+ln R₀)/R₀: worst error ${wp.toFixed(4)} (tol 0.01)`);
    const d0 = t.sim('sir', { D: 0 }, 'sir'), dH = t.sim('sir', { D: 0.5 }, 'sir'); t.ok(leak(d0) < 1e-9 && leak(dH) < 1e-9, 'mass is conserved at D=0 and D=0.5');
    const c = (d.N / 2) | 0; let stray = 0, far = 0; for (const row of d0.kymo) for (let x = 0; x < d0.N; x++) if (x !== c && row[x] !== 0) stray++; for (const row of d.kymo) far = Math.max(far, row[c + 10]);
    t.ok(stray === 0 && far > 0.05, `infection spreads only through the coupling: D=0 never leaves the seeded site; at the default D it reaches 10 sites away (peak ${(far * 100).toFixed(0)}%)`);
  },
  // Efficient-coding observer: estimates in range; the likelihood is centred on the measurement in stimulus space; D(θ) ∝ 1/p(θ)
  efficient(t) {
    const d = t.sim('efficient', {}, 'eff');
    const sane = isFinite(d.estBLS) && isFinite(d.estMAP) && d.estBLS >= d.lo && d.estBLS <= d.hi && d.estMAP >= d.lo && d.estMAP <= d.hi && d.bias.length > 0 && d.disc.length > 0;
    t.ok(sane, `BLS/MAP estimates finite ∈[${d.lo},${d.hi}] (BLS=${d.estBLS.toFixed(2)}); bias & discriminability curves present`);
    const e = t.sim('efficient', { theta: -1, sigma: 0.02 }, 'eff-like'); let b = 0; for (let i = 1; i < e.like.length; i++) if (e.like[i] > e.like[b]) b = i;
    t.ok(Math.abs(e.grid[b] - e.mBack) < 0.05, `the likelihood over θ peaks where F(θ) equals the measurement (peak ${e.grid[b].toFixed(3)}, F⁻¹(m) ${e.mBack.toFixed(3)})`);
    const at = x => d.disc.reduce((a, q) => Math.abs(q[0] - x) < Math.abs(a[0] - x) ? q : a)[1], ratio = at(1.4) / at(0), want = Math.exp(1.4 * 1.4 / 2);
    t.ok(t.rel(ratio, want) < 1e-3, `discrimination threshold ∝ 1/p(θ): D(1.4)/D(0) = ${ratio.toFixed(4)} vs p(0)/p(1.4) = ${want.toFixed(4)}`);
  },
  // Causal inference: the ventriloquism bias is N-shaped — it peaks at intermediate disparity, then RELEASES (segregates) at large disparity
  causal(t) {
    const d = t.sim('causal', {}, 'ci'), mags = d.biasV.map(b => Math.abs(b[1])), maxMag = Math.max(...mags), endMag = mags[mags.length - 1];
    t.ok(maxMag > 1e-3 && endMag < maxMag * 0.9 && d.biasV.every(b => isFinite(b[1])), `ventriloquism bias peaks mid-disparity then releases (max=${maxMag.toFixed(2)}, |end|=${endMag.toFixed(2)})`);
  },
  // Working memory: reports CLUSTER at the target far above the uniform-guess rate, in the proportion the mixture predicts
  wm(t) {
    const d = t.sim('wm', {}, 'wm'), wrap = x => { x = (x + Math.PI) % (2 * Math.PI); if (x < 0) x += 2 * Math.PI; return x - Math.PI; };
    let C = 0, S = 0, finite = true; for (let k = 0; k < d.errs.length; k++) { if (!isFinite(d.errs[k])) finite = false; const e = wrap(d.errs[k] - d.target); C += Math.cos(e); S += Math.sin(e); }
    const R = Math.hypot(C, S) / d.errs.length;   // circular resultant toward the target; uniform guessing → R≈0
    t.ok(finite && R > 0.15, `reports concentrate toward target (resultant R=${R.toFixed(2)} » ~0 uniform)`);
    let near = 0; for (const e of d.errs) if (Math.abs(e) < 2 * d.sd) near++; const expect = d.pT * 0.954 + d.pGuess * (4 * d.sd / (2 * Math.PI));
    t.ok(Math.abs(near / d.errs.length - expect) < 0.04, `fraction of reports within 2 SD of the target: ${(near / d.errs.length).toFixed(3)} vs ${expect.toFixed(3)} expected from the mixture (tol 0.04)`);
  },
  // Hopfield: recall at low load then a capacity cliff; W is the Hebbian matrix; the energy is a Lyapunov function
  hopfield(t) {
    const d = t.sim('hopfield', {}, 'hop'), N = d.N;
    const recalled = d.finalOv > 0.9, lowLoadOk = d.sweep[0][1] >= 0.8, falls = d.sweep[d.sweep.length - 1][1] <= d.sweep[0][1];
    t.ok(recalled && lowLoadOk && falls, `cue recalled (overlap=${d.finalOv.toFixed(2)}); accuracy ${(d.sweep[0][1] * 100).toFixed(0)}% at low load → ${(d.sweep[d.sweep.length - 1][1] * 100).toFixed(0)}% at high load`);
    let sym = 0, diag = 0; for (let i = 0; i < N; i++) { diag = Math.max(diag, Math.abs(d.W[i * N + i])); for (let j = 0; j < N; j++) sym = Math.max(sym, Math.abs(d.W[i * N + j] - d.W[j * N + i])); }
    t.ok(sym < 1e-15 && diag === 0, 'W is symmetric with a zero diagonal');
    let w = 0; for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) if (i !== j) { let s = 0; for (const q of d.patterns) s += q[i] * q[j]; w = Math.max(w, Math.abs(d.W[i * N + j] - s / N)); }
    t.ok(w < 1e-15, 'W_ij = (1/N) Σ_μ ξ_i^μ ξ_j^μ');
    let mono = true; for (const cf of [0.1, 0.3, 0.45]) for (const ns of [2, 6, 12]) { const e = t.SIM.MODELS.hopfield.simulate({ nStore: ns, cueFlip: cf }, t.env('hop' + cf + ns)); for (let i = 1; i < e.energies.length; i++) if (e.energies[i] > e.energies[i - 1] + 1e-9) mono = false; }
    t.ok(mono, 'the energy never increases during recall (9 load × corruption settings)');
  },
  // Kuramoto: synchrony (order parameter r) rises with coupling K — incoherent below K_c, synchronised well above
  kuramoto(t) {
    const p = t.def('kuramoto'), d = t.sim('kuramoto', {}, 'kur'), lowK = d.sweep[0][1], hiK = d.sweep[d.sweep.length - 1][1];
    t.ok(lowK < 0.5 && hiK > 0.6 && hiK > lowK + 0.3, `synchrony rises with coupling (r=${lowK.toFixed(2)} at K=0 → ${hiK.toFixed(2)} at K=8; K_c≈${d.Kc.toFixed(2)})`);
    const g0 = 1 / (p.spread * Math.sqrt(2 * Math.PI)); t.ok(Math.abs(d.Kc - 2 / (Math.PI * g0)) < 1e-12, 'K_c = 2/(π·g(0)) for the Gaussian frequency density');
    const lo = d.sweep.filter(q => q[0] <= 0.5 * d.Kc).map(q => q[1]), hi = d.sweep.filter(q => q[0] >= 2.5 * d.Kc).map(q => q[1]);
    t.ok(Math.max(...lo) < 0.35 && Math.min(...hi) > 0.75, `r stays small below K_c/2 (max ${Math.max(...lo).toFixed(2)}) and large above 2.5·K_c (min ${Math.min(...hi).toFixed(2)})`);
  },
  // Belief tracking: the filter is exactly predict-then-update; it concentrates below the uniform prior; error grows with noise
  belief(t) {
    const p = t.def('belief'), d = t.sim('belief', {}, 'bel'), S = d.S;
    let he = 0, c = 0; for (let k = Math.floor(d.nF / 2); k < d.nF; k++) { he += d.entropy[k]; c++; } const meanH = he / c;
    t.ok(meanH < d.Huniform * 0.85 && d.sweep[d.sweep.length - 1][1] > d.sweep[0][1] + 0.3, `concentrates below uniform (H=${meanH.toFixed(2)} < ${d.Huniform.toFixed(2)}); tracking error rises with noise (${d.sweep[0][1].toFixed(1)} → ${d.sweep[d.sweep.length - 1][1].toFixed(1)})`);
    const k0 = 12; t.ok(Math.abs(d.T[k0][k0 + 1] / d.T[k0][k0] - Math.exp(-0.5 / (d.vol * d.vol))) < 1e-12 && Math.abs(d.T[k0][k0 + 3] / d.T[k0][k0] - Math.exp(-0.5 * 9 / (d.vol * d.vol))) < 1e-12, 'the transition kernel is Gaussian in ring distance');
    t.ok(d.beliefs.every(b => Math.abs(b.reduce((a, x) => a + x, 0) - 1) < 1e-9) && d.T.every(r => Math.abs(r.reduce((a, x) => a + x, 0) - 1) < 1e-9), 'every belief and every kernel row sums to 1');
    // an independent forward recursion over the returned T and observations must reproduce the returned beliefs
    const ringD = (a, b) => { const x = Math.abs(a - b); return Math.min(x, S - x); }; let b = new Array(S).fill(1 / S), worst = 0;
    for (let k = 1; k < d.nF; k++) { const pred = new Array(S).fill(0); for (let i = 0; i < S; i++) for (let j = 0; j < S; j++) pred[j] += b[i] * d.T[i][j];
      let z = 0; const nb = pred.map((v, j) => { const q = ringD(j, d.obs[k]) / d.obsNoise, x = v * Math.exp(-0.5 * q * q); z += x; return x; }); b = nb.map(v => v / z);
      for (let j = 0; j < S; j++) worst = Math.max(worst, Math.abs(b[j] - d.beliefs[k][j])); }
    t.ok(worst < 1e-9, `the belief trajectory equals an independent predict → update recursion (max difference ${worst.toExponential(1)})`);
    const H = v => { const e = t.sim('belief', { vol: v }, 'bel'); let s = 0; for (let k = 20; k < e.nF; k++) s += e.entropy[k]; return s / (e.nF - 20); };
    t.ok(H(4) > H(0.4) + 0.15, `belief entropy rises with volatility (${H(0.4).toFixed(3)} → ${H(4).toFixed(3)})`);
    void p;
  },
  // Ring attractor: a localized bump persists after the cue and holds the cued location (population vector ≈ cue)
  ring(t) {
    const d = t.sim('ring', {}, 'ring'), decLast = ((d.dec[d.nF - 1] % 360) + 360) % 360, dd = Math.abs(decLast - d.cue), decErr = Math.min(dd, 360 - dd);
    t.ok(d.amp > 0.5 && d.width > 0.02 && d.width < 0.6 && decErr < 25, `localized bump persists (amp=${d.amp.toFixed(2)}, width=${(d.width * 100).toFixed(0)}% of ring) and holds the cue (decoded ${decLast.toFixed(0)}° vs ${d.cue}°)`);
    const e = t.sim('ring', { noise: 0 }, 'ring'); let drift = 0; for (let i = e.offFrame + 5; i < e.nF; i++) { const x = Math.abs(e.dec[i] - e.cue); drift = Math.max(drift, Math.min(x, 360 - x)); }
    t.ok(drift < 6, `without noise the bump stays within 6° of the cue after cue-off (max ${drift.toFixed(2)}°)`);
  },
  // Retina→V1: the V1 complex-cell tuning decodes the stimulus orientation; the surround changes the output; complex = even² + odd²
  retina(t) {
    const d = t.sim('retina', {}, 'ret'), dd = Math.abs(d.dec - d.ori), decErr = Math.min(dd, 180 - dd), ys = d.sweep.map(q => q[1]), effect = Math.max(...ys) - Math.min(...ys);
    t.ok(decErr < 25 && effect > 1e-3, `V1 tuning decodes orientation (${d.dec.toFixed(0)}° vs ${d.ori}°); surround changes output contrast (Δ=${effect.toFixed(3)})`);
    let s1 = 0, s2 = 0; for (let k = 0; k < d.complex.length; k++) { s1 += d.complex[k]; s2 += d.simple[k] ** 2; }
    t.ok(s1 / s2 > 1.6 && s1 / s2 < 2.4 && Array.from(d.complex).every((v, k) => v >= d.simple[k] ** 2 - 1e-12), `complex-cell energy = even² + odd²: about twice the mean simple² (ratio ${(s1 / s2).toFixed(3)}) and never below simple²`);
  },
  // Causal graph: do(X) recovers the true causal effect; the observed slope is inflated by exactly the backdoor bias
  causalg(t) {
    const p = t.def('causalg'), d = t.sim('causalg', {}, 'cg');
    const doMatches = Math.abs(d.doSlope - d.causal) < 0.15, confounded = d.obsSlope > d.causal + 0.15, sweepRises = d.sweep[d.sweep.length - 1][1] > d.sweep[0][1] + 0.1;
    t.ok(doMatches && confounded && sweepRises, `do(X) recovers the effect (do=${d.doSlope.toFixed(2)} ≈ ${d.causal.toFixed(2)}); observed inflated to ${d.obsSlope.toFixed(2)} by confounding`);
    let so = 0, sd = 0; const n = 24; for (let i = 0; i < n; i++) { const e = t.sim('causalg', {}, 'cg' + i); so += e.obsSlope; sd += e.doSlope; } so /= n; sd /= n; const bias = p.conf ** 2 / (p.conf ** 2 + p.noise ** 2);
    t.ok(Math.abs(so - p.causal - bias) < 0.05, `observed slope − causal effect = conf²/(conf²+σ²): ${(so - p.causal).toFixed(3)} vs ${bias.toFixed(3)} (mean of ${n} seeds, tol 0.05)`);
    t.ok(Math.abs(sd - p.causal) < 0.03, `do-slope = causal effect: ${sd.toFixed(3)} vs ${p.causal} (mean of ${n} seeds, tol 0.03)`);
    t.ok(d.sweep.every(([c, v]) => Math.abs(v - c * c / (c * c + p.noise ** 2)) < 1e-12), 'the bias sweep is the same closed form');
  },
  // Self-attention: each attention row is a softmax of the written score; the output is the weighted mix
  attention(t) {
    const p = t.def('attention'), d = t.sim('attention', {}, 'attn');
    t.ok(d.attn.every(r => Math.abs(r.reduce((a, b) => a + b, 0) - 1) < 1e-9), 'rows are softmax (sum=1)');
    t.ok(d.sweep[0][1] < 0.6 && d.sweep[d.sweep.length - 1][1] > d.sweep[0][1] + 0.2, `entropy rises with temperature (${d.sweep[0][1].toFixed(2)} → ${d.sweep[d.sweep.length - 1][1].toFixed(2)})`);
    let w = 0, w2 = 0; const sc = (i, j) => (-1.2 * (d.type[i] - d.type[j]) ** 2 - p.posBias * Math.abs(i - j)) / p.temp;
    for (let i = 0; i < d.N; i++) { let o = 0; for (let j = 0; j < d.N; j++) { o += d.attn[i][j] * d.value[j]; w = Math.max(w, Math.abs(Math.log(d.attn[i][j] / d.attn[i][i]) - (sc(i, j) - sc(i, i)))); } w2 = Math.max(w2, Math.abs(o - d.out[i])); }
    t.ok(w < 1e-9, 'log-ratio of two weights = difference of their scores −1.2·Δtype² − bias·|Δposition|, over T');
    t.ok(w2 < 1e-12, 'output_i = Σ_j a_ij · value_j');
  },
  // POMDP (tiger): the value-iteration policy is open-left | listen | open-right; Bellman identities; Bayes in the episode
  pomdp(t) {
    const d = t.sim('pomdp', {}, 'pom'), V = b => d.val[Math.round(b * (d.N - 1))][1];
    const ends = d.pol[0] === 1 && d.pol[d.N - 1] === 2, listensMid = d.pol[Math.floor(d.N / 2)] === 0, hasListen = d.listenFrac > 0.05 && d.listenFrac < 0.999;
    const widens = d.sweep[d.sweep.length - 1][1] > d.sweep[0][1] + 0.05;   // bigger penalty → wider listen region
    t.ok(ends && listensMid && hasListen && widens, `policy open-left|listen|open-right (listen ${(d.listenFrac * 100).toFixed(0)}% of beliefs); a bigger penalty widens it (${(d.sweep[0][1] * 100).toFixed(0)}% → ${(d.sweep[d.sweep.length - 1][1] * 100).toFixed(0)}%)`);
    t.ok(Math.abs(d.qOL[0][1] - (d.rSafe + d.gamma * V(0.5))) < 1e-3, `Q(open-left) at b=0 = safe reward + γ·V(½): ${d.qOL[0][1].toFixed(4)} vs ${(d.rSafe + d.gamma * V(0.5)).toFixed(4)}`);
    let sym = 0; for (let k = 0; k < d.N; k++) sym = Math.max(sym, Math.abs(d.val[k][1] - d.val[d.N - 1 - k][1]));
    let conv = true; for (let k = 1; k < d.N - 1; k++) if (d.val[k][1] > (d.val[k - 1][1] + d.val[k + 1][1]) / 2 + 1e-6) conv = false;
    t.ok(sym < 1e-9 && conv, 'V(b) = V(1−b) and V is convex in the belief');
    let okB = true, any = false; for (let seed = 0; seed < 12; seed++) { const e = t.sim('pomdp', {}, 'pom' + seed); for (let k = 1; k < e.traj.length; k++) { any = true; const b = e.traj[k - 1], a = e.obsAcc, pHL = b * a + (1 - b) * (1 - a), u1 = b * a / pHL, u2 = b * (1 - a) / (1 - pHL); if (Math.abs(e.traj[k] - u1) > 1e-12 && Math.abs(e.traj[k] - u2) > 1e-12) okB = false; } }
    t.ok(okB && any, 'every belief step of the episode is Bayes rule (12 seeds)');
  },
  // Wilson–Cowan E/I: a limit cycle at default drive, born at a Hopf bifurcation; inhibition trails excitation
  wilson(t) {
    const d = t.sim('wilson', {}, 'wc');
    t.ok(d.amp > 0.1 && d.sweep[0][1] < 0.05 && d.sweep[d.sweep.length - 1][1] > 0.3, `limit cycle at default (amp=${d.amp.toFixed(2)}); Hopf bifurcation in drive (P=0: ${d.sweep[0][1].toFixed(2)} → P=3: ${d.sweep[d.sweep.length - 1][1].toFixed(2)})`);
    const n = d.nF, h = Math.floor(n / 2); let mE = 0, mI = 0; for (let i = h; i < n; i++) { mE += d.Et[i]; mI += d.It[i]; } mE /= n - h; mI /= n - h;
    const ups = []; for (let i = h + 1; i < n; i++) if (d.Et[i - 1] < mE && d.Et[i] >= mE) ups.push(i); const per = (ups[ups.length - 1] - ups[0]) / (ups.length - 1);
    const corr = lag => { let c = 0, vE = 0, vI = 0; for (let i = h; i < n - lag; i++) { c += (d.Et[i] - mE) * (d.It[i + lag] - mI); vE += (d.Et[i] - mE) ** 2; vI += (d.It[i + lag] - mI) ** 2; } return c / Math.sqrt(vE * vI); };
    let best = -2, lag = 0; for (let k = 0; k < per; k++) { const c = corr(k); if (c > best) { best = c; lag = k; } } const deg = 360 * lag / per;
    t.ok(deg > 5 && deg < 90 && corr(0) > 0, `inhibition trails excitation by a fraction of a cycle, not half of one: I lags E by ${deg.toFixed(0)}° (zero-lag correlation ${corr(0).toFixed(2)})`);
  },
  // Multi-head attention: each head's rows are a softmax; the heads route differently; averaging keeps values in range
  mha(t) {
    const d = t.sim('mha', {}, 'mha');
    const rows1 = d.heads.every(M => M.every(r => Math.abs(r.reduce((a, b) => a + b, 0) - 1) < 1e-9));
    let differ = false; for (let i = 0; i < d.N; i++) for (let j = 0; j < d.N; j++) if (Math.abs(d.heads[0][i][j] - d.heads[1][i][j]) > 0.15) differ = true;
    t.ok(rows1, `${d.H} heads, rows softmax`); t.ok(differ, 'heads route differently'); t.ok(d.sweep[0][1] < d.sweep[d.sweep.length - 1][1] - 0.2, 'entropy rises with temp');
    const e = t.sim('mha', { layers: 3 }, 'mha'), lo = Math.min(...e.layerV[0]), hi = Math.max(...e.layerV[0]);
    t.ok(e.layerV.every(v => v.every(x => x >= lo - 1e-12 && x <= hi + 1e-12)), 'averaging the heads keeps every layer inside the range of the input');
  },
};

/* modules/mslib.js building blocks, keyed by family. g = N(0,1), U = uniform [0,1), both seeded. */
const LIBRARY_CHECKS = t => {
  const { L, SIM } = t, rng = SIM.makeRNG('mslib'), g = () => SIM.gaussian(rng), U = () => rng();
  const fam = ['sde', 'bayes', 'neuron', 'decision', 'rl', 'psy', 'efficient', 'causal', 'wm', 'network', 'osc', 'belief', 'vision', 'attn'].every(k => L[k]);
  t.ok(fam, 'families present'); if (!fam) return;
  { const wgt = L.bayes.weight(0.9, 1); t.ok(wgt > 0 && wgt < 1, 'bayes: weight ∈ (0,1)'); }
  { // neuron
    const fi = L.neuron.fI((s, I, dt) => L.neuron.lifStep(s, I, null, dt), () => ({ v: -65, refr: 0 }), [0.1, 0.3, 0.6, 1.0], 1e-4, 1.0);
    t.ok(fi.every((p, i) => i === 0 || p.rate >= fi[i - 1].rate) && fi[3].rate > fi[0].rate, 'neuron: LIF f–I monotonic');
    const want = { tau: 0.02, EL: -65, R: 100, Vth: -50, Vreset: -65, tref: 0.003 }, D = L.neuron.LIF_DEFAULT;
    t.ok(Object.keys(want).every(k => D[k] === want[k]), 'neuron: LIF_DEFAULT is the documented set (τ 20 ms, E_L −65 mV, R 100 MΩ, V_th −50 mV, V_reset −65 mV, t_ref 3 ms; rheobase 0.15 nA)'); }
  { // decision: Wong & Wang (2006) reduced circuit
    let s = { S1: 0.1, S2: 0.1, In1: 0, In2: 0 }, r; for (let k = 0; k < 3000; k++) r = L.decision.wwStep(s, { coh: 25.6 }, 0.0005, g);
    t.ok(r.r1 > r.r2, 'decision: Wong–Wang unit 1 wins at +coherence');
    const W = L.decision.WW, want = { a: 270, b: 108, d: 0.154, gamma: 0.641, tauS: 0.1, tauN: 0.002, sigma: 0.02, Js: 0.2609, Jc: 0.0497, I0: 0.3255, JAext: 5.2e-4, mu0: 30 };
    t.ok(Object.keys(want).every(k => W[k] === want[k]), 'decision: Wong–Wang constants match the documented table');
    const q = { S1: 0.3, S2: 0.2, In1: 0, In2: 0 }, o = L.decision.wwStep(q, { sigma: 0 }, 0.001, () => 0);
    const I1 = W.Js * 0.3 - W.Jc * 0.2 + W.I0 + W.JAext * W.mu0, r1 = L.decision.phi(I1, W.a, W.b, W.d), S1 = 0.3 + 0.001 * (-0.3 / W.tauS + (1 - 0.3) * W.gamma * r1);
    t.ok(Math.abs(o.r1 - r1) < 1e-9 && Math.abs(q.S1 - S1) < 1e-12, 'decision: one noise-free Wong–Wang step equals the written equations (φ, then dS = −S/τ_S + (1−S)·γ·r)');
    const nr = SIM.makeRNG('ww-noise'), gn = () => SIM.gaussian(nr), z = { S1: 0.1, S2: 0.1, In1: 0, In2: 0 }; let s2 = 0, n = 0;
    for (let k = 0; k < 400000; k++) { L.decision.wwStep(z, {}, 0.0001, gn); if (k > 2000) { s2 += z.In1 * z.In1; n++; } }
    t.ok(t.rel(Math.sqrt(s2 / n), W.sigma) < 0.05, `decision: the noise current inside wwStep has stationary SD σ (${Math.sqrt(s2 / n).toFixed(5)} vs ${W.sigma}, tol 5%)`); }
  { let V = 0; for (let k = 0; k < 200; k++) V = L.rl.rescorlaWagner(V, 1, 0.1); t.ok(Math.abs(V - 1) < 0.01, 'rl: Rescorla–Wagner converges'); }
  { t.ok(L.psy.psychometric(-2, { mu: 0, sigma: 1 }) < L.psy.psychometric(2, { mu: 0, sigma: 1 }), 'psy: psychometric monotonic'); t.ok(Math.abs(L.psy.sdt(0.84, 0.16).dprime - 2) < 0.2, 'psy: SDT sensitivity'); }
  { // efficient coding: consistent zero-noise decode, discriminability ∝ 1/p (tails>peak), skewed likelihood (tail away from prior peak)
    const xs = L.bayes.linspace(-4, 4, 241), npd = (x, m, sd) => Math.exp(-0.5 * ((x - m) / sd) * ((x - m) / sd)) / (sd * Math.sqrt(2 * Math.PI)), pri = Array.from(xs, x => npd(x, 0, 1)), F = L.efficient.cdf(xs, pri);
    t.ok(Math.abs(L.efficient.decode(L.efficient.encode(1.2, xs, F), 1e-3, xs, F, pri, 'BLS') - 1.2) < 0.05, 'efficient: zero-noise decode ≈ θ');
    const dsc = L.efficient.discrim(xs, pri); t.ok(dsc[20] > dsc[120] && dsc[220] > dsc[120], 'efficient: D ∝ 1/p, tails > peak');
    const lk = L.efficient.likelihood(L.efficient.encode(1, xs, F), 0.12, xs, F); let z = 0, mean = 0, mode = 0, md = -1; for (let i = 0; i < xs.length; i++) { z += lk[i]; mean += lk[i] * xs[i]; if (lk[i] > md) { md = lk[i]; mode = xs[i]; } } mean /= z;
    t.ok(mean > mode, 'efficient: likelihood skewed off peak'); t.ok(Math.abs(mode - 1) < 0.05, `efficient: the likelihood of m = F(1) peaks at θ = 1 (${mode.toFixed(3)})`); }
  { // causal: MLE shrinks variance, p(C=1) higher when cues agree, number-game size principle, limits of the CI block
    t.ok(L.causal.cueCombineMLE([1, 3], [0.5, 1]).variance < 0.25, 'causal: MLE variance < the best single cue');
    t.ok(L.causal.ciPosteriorCommon(0.1, -0.1, 2, 9, 12, 0.3) > L.causal.ciPosteriorCommon(10, -10, 2, 9, 12, 0.3), 'causal: p(C=1) agree > disagree');
    const H = L.causal.numberGameHypotheses(100), pst = L.causal.conceptPosterior(H, [2, 4, 8, 16]); let iP = -1, iE = -1; H.forEach((h, i) => { if (h.name === 'powers 2') iP = i; if (h.name === 'even') iE = i; });
    t.ok(pst[iP] > pst[iE], 'causal: size principle, powers of 2 > even');
    const a = L.causal.ciPosteriorCommon(2, -1, 2, 8, 15, 0.2), b = L.causal.ciPosteriorCommon(2, -1, 2, 8, 15, 0.8); t.ok(b > a + 0.1, `causal: p(C=1|x) rises with the prior p_common (${a.toFixed(3)} → ${b.toFixed(3)})`);
    const f = L.causal.ciFusedEstimate(3, -2, 2, 8, 15), wv = 1 / 4, wa = 1 / 64, wp = 1 / 225; t.ok(Math.abs(f - (3 * wv - 2 * wa) / (wv + wa + wp)) < 1e-12, 'causal: fused estimate = precision-weighted mean including the prior');
    t.ok(Math.abs(L.causal.ciFusedEstimate(3, -2, 2, 8, 1e6) - L.causal.cueCombineMLE([3, -2], [2, 8]).estimate) < 1e-6, 'causal: a flat prior reduces fusion to MLE cue combination');
    let z1 = 0, z2 = 0; const sv = 2, sa = 3, sp = 5, h = 0.25; for (let xv = -40; xv <= 40; xv += h) for (let xa = -40; xa <= 40; xa += h) { z1 += L.causal.ciLikCommon(xv, xa, sv, sa, sp) * h * h; z2 += L.causal.ciLikSeparate(xv, xa, sv, sa, sp) * h * h; }
    t.ok(Math.abs(z1 - 1) < 1e-3 && Math.abs(z2 - 1) < 1e-3, `causal: both likelihoods integrate to 1 (${z1.toFixed(5)}, ${z2.toFixed(5)})`); }
  { // working memory: I0(0)=1, κ→SD monotone, von Mises sampler mean≈μ, mixture target proportion≈pT, the mixture is a density
    t.ok(Math.abs(L.wm.besselI0(0) - 1) < 1e-9, 'wm: I0(0)=1'); t.ok(L.wm.kappaToSD(2) > L.wm.kappaToSD(20), 'wm: κ→SD decreasing');
    let sx = 0, sy = 0; for (let i = 0; i < 3000; i++) { const th = L.wm.vmSample(0.6, 8, U); sx += Math.cos(th); sy += Math.sin(th); } t.ok(Math.abs(Math.atan2(sy, sx) - 0.6) < 0.12, 'wm: von Mises sample mean ≈ μ');
    let nt = 0; const TT = 5000; for (let i = 0; i < TT; i++) if (L.wm.mixtureRecall({ target: 0, nontargets: [1.5, -1.5], kappa: 10, pT: 0.6, pSwap: 0.25, pGuess: 0.15 }, U).branch === 'target') nt++;
    t.ok(Math.abs(nt / TT - 0.6) < 0.05, 'wm: mixture target proportion ≈ pT');
    for (const c of [{ kappa: 16, pT: 0.75, pSwap: 0.15, pGuess: 0.1, nontargetOffsets: [1.57, 3.14, -1.57] }, { kappa: 4, pT: 0.6, pSwap: 0, pGuess: 0.4, nontargetOffsets: [] }]) { let z = 0; const n = 4000; for (let i = 0; i < n; i++) z += L.wm.mixturePdf(-Math.PI + 2 * Math.PI * (i + 0.5) / n, c) * 2 * Math.PI / n; t.ok(Math.abs(z - 1) < 1e-4, `wm: mixturePdf integrates to 1 (κ=${c.kappa}: ${z.toFixed(6)})`); }
    t.ok(Math.abs(L.wm.kappaToSD(400) * 20 - 1) < 0.01, 'wm: kappaToSD·√κ → 1 for large κ'); t.ok(t.rel(L.wm.sdToKappa(L.wm.kappaToSD(8)), 8) < 0.03, 'wm: sdToKappa inverts kappaToSD (tol 3%)'); }
  { // network: Hopfield recalls a 1-bit-flipped cue; ring kernel has local excitation and the written form
    const pat8 = [1, -1, 1, -1, 1, -1, 1, -1], Wh = L.network.hopfieldStore([pat8], 8); let sr = Int8Array.from(pat8); sr[0] = -sr[0]; L.network.hopfieldStep(Wh, sr, 8, [0, 1, 2, 3, 4, 5, 6, 7]);
    t.ok(L.network.overlap(Array.from(sr), pat8, 8) > 0.9, 'network: Hopfield recall');
    const Wr = L.network.ringKernel(16, 8, 1.3, 0.3); t.ok(Wr[0] > Wr[8], 'network: ring local excitation');
    const N = 64, W = L.network.ringKernel(N, 8, 1.3, 0.3), dd = 2 * Math.PI * 3 / N; t.ok(Math.abs(W[3] - (8 * Math.exp(-dd * dd / (2 * 0.09)) - 1.3)) < 1e-12 && Math.abs(W[5 * N + 2] - W[3]) < 1e-12, 'network: ring kernel = J·exp(−d²/2σ²) − J_I, translation invariant'); }
  { // osc: identical phases → r≈1; evenly-spread phases → r≈0; the mean-field step equals the pairwise sum
    t.ok(L.osc.kuramotoOrder([0.5, 0.5, 0.5, 0.5]).r > 0.99 && L.osc.kuramotoOrder([0, Math.PI / 2, Math.PI, 3 * Math.PI / 2]).r < 0.05, 'osc: sync vs incoherent r');
    const kr = SIM.makeRNG('kur'), n = 12, ph = Array.from({ length: n }, () => (kr() * 2 - 1) * Math.PI), om = Array.from({ length: n }, () => SIM.gaussian(kr)), K = 2.3, dt = 0.01, out = L.osc.kuramotoStep(ph, om, K, dt, 0, () => 0); let w = 0;
    for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j < n; j++) s += Math.sin(ph[j] - ph[i]); w = Math.max(w, Math.abs(out[i] - (ph[i] + dt * (om[i] + K / n * s)))); }
    t.ok(w < 1e-12, 'osc: Kuramoto mean-field step = (K/N) Σ_j sin(θ_j − θ_i)'); }
  { // belief: predict/update renormalise, update concentrates on the likely state, entropy(certain)=0
    const bp = L.belief.predict([0, 1, 0, 0], [[.5, .5, 0, 0], [0, .5, .5, 0], [0, 0, .5, .5], [.5, 0, 0, .5]]), bu = L.belief.update([.25, .25, .25, .25], [.1, .7, .1, .1]);
    t.ok(Math.abs(bp.reduce((a, b) => a + b, 0) - 1) < 1e-9 && Math.abs(bu.reduce((a, b) => a + b, 0) - 1) < 1e-9 && bu[1] > 0.5 && L.belief.entropy([1, 0, 0, 0]) < 1e-9, 'belief: predict/update normalise + concentrate'); }
  { // vision: a balanced DoG (surround=1) is ~zero-sum (band-pass); a pure centre (surround=0) sums positive (low-pass)
    const dks = L.vision.dogKernel(1.5, 4, 1); let dsum = 0; for (const v of dks.k) dsum += v; const dc = L.vision.dogKernel(1.5, 4, 0); let csum = 0; for (const v of dc.k) csum += v;
    t.ok(Math.abs(dsum) < 0.15 && csum > 0.5, 'vision: DoG band-pass ≈ 0 vs low-pass > 0'); }
  { // attn: softmax sums to 1 and is monotone in logits; uniform attention has entropy ln(N)
    const sm = L.attn.softmax([1, 2, 3]); t.ok(Math.abs(sm.reduce((a, b) => a + b, 0) - 1) < 1e-9 && sm[2] > sm[1] && sm[1] > sm[0], 'attn: softmax sums to 1 + monotone');
    t.ok(Math.abs(L.attn.entropy([.25, .25, .25, .25]) - Math.log(4)) < 1e-9, 'attn: uniform entropy = ln(N)'); }
};

const guarded = (label, fn) => { try { fn(toolkit); } catch (e) { console.log(`    ${label} check threw: ${e.message}   [${ok(false)}]`); } };
console.log('\n--- engine + plot helpers ---');
guarded('core', CORE_CHECKS);
console.log('\n--- analytic checks (tied to each model\'s science) ---');
for (const id of usable) { if (!MODEL_CHECKS[id]) continue; console.log(`  ${id}`); guarded(id, MODEL_CHECKS[id]); }
// Soft enforcement: every model SHOULD carry an analytic check tied to its science (the generic passes
// above only prove it ran and drew). A model without one is a counted warning, not a failure — a
// vacuous check written to silence the gate would be worse than none (see gui-qc.md §1).
{ const missing = ORDER.filter(id => !MODEL_CHECKS[id]);
  if (missing.length) warn(`no analytic check for ${missing.length} model${missing.length > 1 ? 's' : ''}: ${missing.join(', ')} — add one to validate.mjs (see gui-qc.md §1)`); }

// ---- reusable library modules/mslib.js: each block is sane ----
if (MSLIB) { console.log('\n=== mslib.js building blocks ===\n'); guarded('mslib', LIBRARY_CHECKS); }
else console.log('\n(modules/mslib.js is not loaded by index.html — library checks skipped)');

// ---------------------------------------------------------------------------------------------
// Opt-in regression lock for YOUR models: digests of simulate() at defaults and every extreme.
// ---------------------------------------------------------------------------------------------
if (ARGV.includes('--snapshot') || ARGV.includes('--against')) {
  const snap = { format: 1, seed: 'seed-1', models: {} };
  for (const id of usable) { const m = SIM.MODELS[id], base = def(id), cases = { default: base };
    for (const s of (m.params || [])) for (const v of extremesOf(s)) cases[s.name + '=' + v] = { ...base, [s.name]: v };
    const sims = {}; for (const [name, p] of Object.entries(cases)) { try { sims[name] = digest(m.simulate({ ...p }, { rng: SIM.makeRNG('seed-1'), seed: 'seed-1', params: { ...p }, batch: false })); } catch (e) { sims[name] = 'threw'; } }
    snap.models[id] = { params: (m.params || []).map(s => [s.name, s.type || 'num', s.min, s.max, s.step, s.default].join(',')), simulate: sims }; }
  console.log('\n--- snapshot ---');
  if (ARGV.includes('--against')) {
    const file = optOf('--against'); let ref = null; try { ref = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { console.log(`  cannot read ${file}: ${e.message}   [${ok(false)}]`); }
    if (ref) { const diffs = [];
      for (const [id, r] of Object.entries(ref.models || {})) { const now = snap.models[id]; if (!now) { diffs.push(`${id}: model missing`); continue; }
        if (r.params.join(';') !== now.params.join(';')) diffs.push(`${id}: parameter schema changed`);
        for (const [k, v] of Object.entries(r.simulate)) if (now.simulate[k] !== v) diffs.push(`${id}: simulate(${k}) ${v} → ${now.simulate[k]}`); }
      console.log(`  ${Object.keys(ref.models || {}).length} model(s) match ${file}   [${ok(diffs.length === 0)}]`); diffs.slice(0, 20).forEach(d => console.log('    ' + d)); }
  }
  if (ARGV.includes('--snapshot')) { const file = optOf('--snapshot'); if (!file) console.log(`  --snapshot needs a file name   [${ok(false)}]`); else { fs.writeFileSync(file, JSON.stringify(snap, null, 1) + '\n'); console.log(`  wrote ${file}: ${Object.keys(snap.models).length} model(s), ${Object.values(snap.models).reduce((a, m) => a + Object.keys(m.simulate).length, 0)} simulate digests`); } }
}

finish();
