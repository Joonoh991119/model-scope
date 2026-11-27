/* =============================================================================
 * validate.mjs — the model-scope correctness gate.          Run:  node validate.mjs
 *
 * It loads exactly what index.html loads (the same <script src> list, in the same order, with
 * the REAL plot.js drawing onto a recording canvas stub), so the math and the views it checks are
 * the ones the page runs. The toolbox imposes no fixed output shape, so the gate is layered:
 *   (0) page      — every listed script exists and loads; nothing references another host or a
 *                   network API (the app must work offline from file://); the inline script parses;
 *                   the single-page bundle (bundle.mjs, if present) is self-contained;
 *   (1) schema    — every model's id, parameters, lenses and views are well-formed;
 *   (2) simulate  — runs at defaults, returns data, and is deterministic for a given seed;
 *   (3) views     — every view DRAWS at the start, middle and end of its playhead, per lens, with
 *                   finite axes, finite heatmap/image/graph data, a colorbar on every heatmap, and
 *                   (at the end of the playhead) at least one mark that is not axis furniture;
 *   (4) extremes  — simulate() stays finite and every view still draws at each control's min and max;
 *   (5) analytic  — per-model checks tied to the science (a closed form, a conservation law, a limit),
 *                   read from `<script>.checks.mjs` next to each script the page loads
 *                   (engine.checks.mjs for your models, examples.checks.mjs for the examples);
 *   (6) library   — the modules/mslib.js building blocks.
 * Options:
 *   --snapshot <file>   write digests of simulate() (defaults + every extreme) for YOUR models
 *   --against  <file>   compare with such a file and fail on any difference (an opt-in regression lock)
 * Deterministic: no Math.random, no clock — two runs print the same text.
 * ========================================================================== */
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

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
// bundle.mjs (optional) writes the app as one page: check that what it would write is self-contained.
if (fs.existsSync(new URL('bundle.mjs', HERE))) {
  let problems = [], size = 0;
  try { const B = await import(new URL('bundle.mjs', HERE).href), b = B.bundle(fileURLToPath(HERE), { title: 'Gate Check Bundle' }); size = b.bytes; problems = B.bundleProblems(b.html);
    // a script that contains a closing tag or an HTML comment opener must come out inert, and mean the same
    const probe = "const a='</script>', b='<!-- x', c=/<\\/SCRIPT>/i;", safe = B.escScript(probe), val = s => JSON.stringify(new Function(s + ' return [a, b, c.test("</script>")];')());
    if (/<\/script/i.test(safe) || /<!--/.test(safe)) problems.push('a closing script tag or an HTML comment opener inside a script is not escaped (the page would be cut short)');
    else if (val(safe) !== val(probe)) problems.push('escaping a script changed what it computes'); }
  catch (e) { problems = [e.message]; }
  console.log(`  bundle is self-contained: one page, ${(size / 1024).toFixed(0)} KB, no doctype/html/head/body, no file or host reference, scripts parse   [${ok(problems.length === 0)}]`);
  problems.forEach(b => console.log('    ' + b));
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
if (ORDER.length === 0) fatal('no model is registered — add one to MODELS and MODEL_ORDER in engine.js, or put the examples.js script line back in index.html');
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
//        The per-model tables are separate files (`<script>.checks.mjs`), so a researcher's
//        checks sit next to the researcher's models and the examples' checks leave with them.
// ---------------------------------------------------------------------------------------------
const rel = (a, b) => Math.abs(a - b) / Math.max(1e-300, Math.abs(b));
let nAsserts = 0;   // t.ok calls so far — a check that asserts nothing does not count as a check
const toolkit = {
  SIM, Plot, L: MSLIB, env, def, rel,
  has: id => !!SIM.MODELS[id],
  sim: (id, over, seed) => SIM.MODELS[id].simulate({ ...def(id), ...(over || {}) }, env(seed)),
  ok: (cond, text) => { nAsserts++; console.log(`    ${text}   [${ok(!!cond)}]`); },
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

/* Per-model checks live next to the script that registers the model: for every `X.js` that
   index.html loads, `X.checks.mjs` is imported when it exists. Its default export is a table
   keyed by model id (see examples.checks.mjs for the worked examples, engine.checks.mjs for yours). */
const MODEL_CHECKS = {}, CHECK_FILES = [];
for (const s of scripts) {
  if (isRemote(s) || !/\.js$/i.test(s)) continue;
  const file = s.replace(/\.js$/i, '.checks.mjs'), url = new URL(file, HERE);
  if (!fs.existsSync(url)) continue;
  let table; try { table = (await import(url.href)).default; } catch (e) { fatal(`${file} failed to load: ${e.message}`); }
  if (!table || typeof table !== 'object') fatal(`${file} must export default { modelId(t) { ... } }`);
  const ids = Object.keys(table).filter(id => typeof table[id] === 'function');
  for (const id of ids) { if (MODEL_CHECKS[id]) warn(`${file}: a check for '${id}' is already defined by an earlier checks file — keeping the first`); else MODEL_CHECKS[id] = table[id]; }
  CHECK_FILES.push(`${file} (${ids.length})`);
}

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
console.log(`\n--- analytic checks (tied to each model's science) — from ${CHECK_FILES.join(', ') || 'no checks file'} ---`);
const asserted = new Set();
for (const id of usable) { if (!MODEL_CHECKS[id]) continue; console.log(`  ${id}`); const n0 = nAsserts; guarded(id, MODEL_CHECKS[id]); if (nAsserts > n0) asserted.add(id); }
// Soft enforcement: every model SHOULD carry an analytic check tied to its science (the generic passes
// above only prove it ran and drew). A model without one is a counted warning, not a failure — a
// vacuous check written to silence the gate would be worse than none (see gui-qc.md §1).
{ const missing = ORDER.filter(id => !asserted.has(id));
  if (missing.length) warn(`no analytic check for ${missing.length} model${missing.length > 1 ? 's' : ''}: ${missing.join(', ')} — write one in engine.checks.mjs (see gui-qc.md §1)`); }

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
