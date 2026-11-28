import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { pageScripts, isRemote, stripJsComments as stripComments } from './page.mjs';

const HERE = new URL('./', import.meta.url);
const ARGV = process.argv.slice(2);
const optOf = f => { const i = ARGV.indexOf(f); return i >= 0 ? ARGV[i + 1] : undefined; };
const SCAN_LIMIT = 3000, STUB_CANVAS = [600, 400], SNAPSHOT_SEED = 'seed-1';
let fails = 0, warns = 0;
const ok = b => (b ? '\x1b[32mPASS\x1b[0m' : (fails++, '\x1b[31mFAIL\x1b[0m'));
const warn = msg => { warns++; console.log(`  \x1b[33m⚠ ${msg}\x1b[0m`); };
const finish = () => { console.log(`\n${fails === 0 ? '\x1b[32m✓ ALL CHECKS PASSED\x1b[0m' : `\x1b[31m✗ ${fails} FAILED\x1b[0m`}${warns ? `  (${warns} warning${warns > 1 ? 's' : ''})` : ''}\n`); process.exit(fails === 0 ? 0 : 1); };
const fatal = msg => { console.log(`  ${msg}   [${ok(false)}]`); finish(); };

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

console.log('\n=== ccn-sim gate ===\n');
if (!fs.existsSync(new URL('index.html', HERE))) fatal('index.html not found next to validate.mjs');
const html = fs.readFileSync(new URL('index.html', HERE), 'utf8');
const tags = pageScripts(html);
const scripts = tags.filter(t => t.src).map(t => t.src), inline = tags.filter(t => !t.src).map(t => t.body);
const sources = {};
console.log(`--- page: index.html loads ${scripts.length} script${scripts.length === 1 ? '' : 's'} (${scripts.join(', ')}) ---`);
const OWNER = {}, SHADOWED = {}; let current = null;
for (const s of scripts) {
  if (isRemote(s)) continue;
  if (!fs.existsSync(new URL(s, HERE))) fatal(`index.html loads ${s} but that file is missing`);
  sources[s] = fs.readFileSync(new URL(s, HERE), 'utf8');
  const before = new Set((globalThis.SIM && globalThis.SIM.MODEL_ORDER) || []); current = s;
  try { (0, eval)(sources[s]); } catch (e) { fatal(`${s} failed to load: ${e.message}`); }
  const G = globalThis.SIM;
  if (G && Array.isArray(G.MODEL_ORDER)) for (const id of G.MODEL_ORDER) if (!before.has(id) && !OWNER[id]) OWNER[id] = s;
  if (G && typeof G.register === 'function' && !G.register.gateWrapped) {
    const reg = G.register;
    G.register = Object.assign((models, order) => { for (const id of (order || Object.keys(models || {}))) if (models && Object.hasOwn(models, id) && Object.hasOwn(G.MODELS, id)) (SHADOWED[current] = SHADOWED[current] || []).push(id); return reg(models, order); }, { gateWrapped: true });
  }
}
const SIM = globalThis.SIM, Plot = globalThis.Plot, CCNLIB = globalThis.CCNLIB;
if (!SIM || !SIM.MODELS || !Array.isArray(SIM.MODEL_ORDER)) fatal('no script defined window.SIM with MODELS and MODEL_ORDER (engine.js)');
if (!Plot || typeof Plot.make !== 'function') fatal('no script defined window.Plot (plot.js)');

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
if (fs.existsSync(new URL('bundle.mjs', HERE))) {
  let problems = [], size = 0;
  try { const B = await import(new URL('bundle.mjs', HERE).href), b = B.bundle(fileURLToPath(HERE), { title: 'Gate Check Bundle' }); size = b.bytes; problems = B.bundleProblems(b.html);
    const probe = "const a='</script>', b='<!-- x', c=/<\\/SCRIPT>/i;", safe = B.escScript(probe), val = s => JSON.stringify(new Function(s + ' return [a, b, c.test("</script>")];')());
    if (/<\/script/i.test(safe) || /<!--/.test(safe)) problems.push('a closing script tag or an HTML comment opener inside a script is not escaped (the page would be cut short)');
    else if (val(safe) !== val(probe)) problems.push('escaping a script changed what it computes'); }
  catch (e) { problems = [e.message]; }
  console.log(`  bundle is self-contained: one page, ${(size / 1024).toFixed(0)} KB, no doctype/html/head/body, no file or host reference, scripts parse   [${ok(problems.length === 0)}]`);
  problems.forEach(b => console.log('    ' + b));
}

const env = (seed, p) => ({ rng: SIM.makeRNG(seed), seed, params: { ...(p || {}) }, batch: false });
const def = id => { const p = {}; (SIM.MODELS[id].params || []).forEach(s => { p[s.name] = s.default; }); return p; };
const isNum = v => typeof v === 'number' && isFinite(v);
const allFinite = (v, depth = 0) => {
  if (typeof v === 'number') return isFinite(v);
  if (depth > 6) return true;
  if (Array.isArray(v) || ArrayBuffer.isView(v)) { const n = Math.min(v.length, SCAN_LIMIT); for (let i = 0; i < n; i++) if (!allFinite(v[i], depth + 1)) return false; return true; }
  if (v && typeof v === 'object') { for (const k in v) if (!allFinite(v[k], depth + 1)) return false; return true; }
  return true;
};
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

const CHROME = ['frame', 'legend', 'colorbar', 'note', 'vline', 'hline', 'text'];
function drawView(view, data, ui) {
  const rec = { badFrame: false, badData: false, heat: 0, colorbar: 0, dataInk: 0, chromeInk: 0, chrome: 0, threw: null };
  REC = rec;
  try {
    const g = Plot.make(mkCanvas(...STUB_CANVAS));
    const sample = (nx, ny, val) => { if (typeof val !== 'function') return; for (const [i, j] of [[0, 0], [nx - 1, ny - 1], [nx >> 1, ny >> 1]]) if (!isNum(val(i, j))) rec.badData = true; };
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

const ID_RE = /^[A-Za-z0-9_-]+$/, NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const RESERVED = id => ['settings', 'sidebar', 'customize', 'upgrade', 'downloads'].includes(id) || /^comment-/.test(id);
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
{
  const lensOf = id => (SIM.MODELS[id] && SIM.MODELS[id].lenses) || null;
  const resolve = h => { if (ORDER.includes(h)) return h; for (let i = h.indexOf('-'); i > 0; i = h.indexOf('-', i + 1)) { const id = h.slice(0, i), k = h.slice(i + 1); if (ORDER.includes(id) && lensOf(id) && Object.prototype.hasOwnProperty.call(lensOf(id), k)) return id + ' lens ' + k; } return 'nothing'; };
  const clash = []; for (const id of ORDER) for (const k of Object.keys(lensOf(id) || {})) { const r = resolve(id + '-' + k); if (r !== id + ' lens ' + k) clash.push(`#${id}-${k} opens ${r}, not ${id} lens ${k}: rename the id or the lens key`); }
  console.log(`  every #model-lens link opens its own screen   [${ok(clash.length === 0)}]`); clash.forEach(c => console.log('    ' + c));
}
const usable = [];
for (const id of ORDER) {
  const m = SIM.MODELS[id], lint = lintModel(id, m), p = def(id);
  let data, threw = null; try { data = m.simulate({ ...p }, env('v-' + id, p)); } catch (e) { threw = e; }
  const specs = m.lenses ? Object.values(m.lenses) : [m];
  const viewsOk = specs.length >= 1 && specs.every(s => Array.isArray(s.views) && s.views.length >= 1 && s.views.every(v => typeof v.draw === 'function'));
  const nv = specs.reduce((a, s) => a + ((s.views && s.views.length) || 0), 0);
  const ran = !threw && !!data && typeof data === 'object';
  let same = false, detErr = null; if (ran) { try { same = digest(m.simulate({ ...p }, env('det-' + id, p))) === digest(m.simulate({ ...p }, env('det-' + id, p))); } catch (e) { same = false; detErr = e; } }
  console.log(`  ${label(m)}schema [${ok(lint.length === 0)}]  simulate=${threw ? '\x1b[31mthrew\x1b[0m' : 'ok'}  views=${nv}${m.lenses ? ` (${specs.length} lenses)` : ''}  [${ok(ran && viewsOk)}]  deterministic [${ok(ran && same)}]`);
  lint.forEach(l => console.log('    schema: ' + l));
  if (threw) console.log('    ' + threw.message);
  if (detErr) console.log(`    simulate() threw with another seed ('det-${id}'): ${(detErr && detErr.message) || detErr}`);
  else if (ran && !same) console.log('    two runs with the same seed returned different data — draw every random number from env.rng / trialRng(env.seed, k)');
  if (ran && viewsOk) usable.push(id);
}

console.log('\n--- view render at defaults (draws · finite axes · colorbar on heatmaps · not empty) ---');
for (const id of usable) {
  const m = SIM.MODELS[id], p = def(id);
  let data; try { data = m.simulate({ ...p }, env('r-' + id, p)); } catch (e) { console.log(`  ${label(m)}[${ok(false)}]  simulate() threw with seed 'r-${id}' (it ran with 'v-${id}'): ${(e && e.message) || e}`); continue; }
  const r = renderModel(m, p, data, { nonEmpty: true });
  console.log(`  ${label(m)}[${ok(r.good)}]  ${r.draws} draws${r.text}`);
  r.threw.forEach(f => console.log('    ' + f.tag + ': ' + f.msg));
}

console.log('\n--- parameter extremes (simulate stays finite, views still draw, at each control min/max) ---');
for (const id of usable) {
  const m = SIM.MODELS[id], base = def(id), bad = []; let draws = 0;
  for (const s of (m.params || [])) for (const v of extremesOf(s)) {
    const p = { ...base, [s.name]: v };
    try {
      const d = m.simulate({ ...p }, env('p-' + id + '-' + s.name + v, p));
      if (!d || typeof d !== 'object') { bad.push(`${s.name}=${v}(no data)`); continue; }
      if (!allFinite(d)) bad.push(`${s.name}=${v}(non-finite data)`);
      const r = renderModel(m, p, d); draws += r.draws; if (!r.good) bad.push(`${s.name}=${v}(views:${r.text.replace(/\s+/g, ' ')}${r.threw.length ? ' — ' + r.threw[0].msg : ''})`);
    } catch (e) { bad.push(`${s.name}=${v}: ${e.message}`); }
  }
  console.log(`  ${label(m)}[${ok(!bad.length)}]  ${draws} draws` + (bad.length ? '  ' + bad.slice(0, 3).join(' | ') : ''));
}

const rel = (a, b) => Math.abs(a - b) / Math.max(1e-300, Math.abs(b));
let nAsserts = 0;
const toolkit = {
  SIM, Plot, L: CCNLIB, env, def, rel,
  has: id => !!SIM.MODELS[id] && !(SHADOWED[checkScript] || []).includes(id),
  sim: (id, over, seed) => { const p = { ...def(id), ...(over || {}) }; return SIM.MODELS[id].simulate({ ...p }, env(seed, p)); },
  ok: (cond, text) => { nAsserts++; console.log(`    ${text}   [${ok(!!cond)}]`); },
  info: text => console.log(`    ${text}`),
};

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

const MODEL_CHECKS = {}, CHECK_SRC = {}, CHECK_FILES = []; let checkScript = null;
for (const s of scripts) {
  if (isRemote(s) || !/\.js$/i.test(s)) continue;
  const file = s.replace(/\.js$/i, '.checks.mjs'), url = new URL(file, HERE);
  if (!fs.existsSync(url)) continue;
  let table; try { table = (await import(url.href)).default; } catch (e) { fatal(`${file} failed to load: ${e.message}`); }
  if (!table || typeof table !== 'object') fatal(`${file} must export default { modelId(t) { ... } }`);
  const ids = Object.keys(table).filter(id => typeof table[id] === 'function');
  for (const id of ids) {
    if ((SHADOWED[s] || []).includes(id)) continue;
    if (MODEL_CHECKS[id]) warn(`${file}: a check for '${id}' is already defined by an earlier checks file — keeping the first`); else { MODEL_CHECKS[id] = table[id]; CHECK_SRC[id] = s; } }
  CHECK_FILES.push(`${file} (${ids.length})`);
}
for (const [s, ids] of Object.entries(SHADOWED)) for (const id of ids)
  warn(`model '${id}' from ${OWNER[id] || 'an earlier script'} hides the ${s} model with the same id: that model's tab and its analytic check are skipped — rename yours to keep both`);

const LIBRARY_CHECKS = t => {
  const { L, SIM } = t, rng = SIM.makeRNG('ccnlib'), g = () => SIM.gaussian(rng), U = () => rng();
  const has = (...ks) => ks.every(k => L[k]);
  t.info(`families: ${Object.keys(L).join(', ')}`);
  if (has('bayes')) { const wgt = L.bayes.weight(0.9, 1); t.ok(wgt > 0 && wgt < 1, 'bayes: weight ∈ (0,1)'); }
  if (has('neuron')) {
    const fi = L.neuron.fI((s, I, dt) => L.neuron.lifStep(s, I, null, dt), () => ({ v: -65, refr: 0 }), [0.1, 0.3, 0.6, 1.0], 1e-4, 1.0);
    t.ok(fi.every((p, i) => i === 0 || p.rate >= fi[i - 1].rate) && fi[3].rate > fi[0].rate, 'neuron: LIF f–I monotonic');
    const want = { tau: 0.02, EL: -65, R: 100, Vth: -50, Vreset: -65, tref: 0.003 }, D = L.neuron.LIF_DEFAULT;
    t.ok(Object.keys(want).every(k => D[k] === want[k]), 'neuron: LIF_DEFAULT is the documented set (τ 20 ms, E_L −65 mV, R 100 MΩ, V_th −50 mV, V_reset −65 mV, t_ref 3 ms; rheobase 0.15 nA)'); }
  if (has('decision')) {
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
  if (has('rl')) { let V = 0; for (let k = 0; k < 200; k++) V = L.rl.rescorlaWagner(V, 1, 0.1); t.ok(Math.abs(V - 1) < 0.01, 'rl: Rescorla–Wagner converges'); }
  if (has('psy')) { t.ok(L.psy.psychometric(-2, { mu: 0, sigma: 1 }) < L.psy.psychometric(2, { mu: 0, sigma: 1 }), 'psy: psychometric monotonic'); t.ok(Math.abs(L.psy.sdt(0.84, 0.16).dprime - 2) < 0.2, 'psy: SDT sensitivity'); }
  if (has('bayes', 'efficient')) {
    const xs = L.bayes.linspace(-4, 4, 241), npd = (x, m, sd) => Math.exp(-0.5 * ((x - m) / sd) * ((x - m) / sd)) / (sd * Math.sqrt(2 * Math.PI)), pri = Array.from(xs, x => npd(x, 0, 1)), F = L.efficient.cdf(xs, pri);
    t.ok(Math.abs(L.efficient.decode(L.efficient.encode(1.2, xs, F), 1e-3, xs, F, pri, 'BLS') - 1.2) < 0.05, 'efficient: zero-noise decode ≈ θ');
    const dsc = L.efficient.discrim(xs, pri); t.ok(dsc[20] > dsc[120] && dsc[220] > dsc[120], 'efficient: D ∝ 1/p, tails > peak');
    const lk = L.efficient.likelihood(L.efficient.encode(1, xs, F), 0.12, xs, F); let z = 0, mean = 0, mode = 0, md = -1; for (let i = 0; i < xs.length; i++) { z += lk[i]; mean += lk[i] * xs[i]; if (lk[i] > md) { md = lk[i]; mode = xs[i]; } } mean /= z;
    t.ok(mean > mode, 'efficient: likelihood skewed off peak'); t.ok(Math.abs(mode - 1) < 0.05, `efficient: the likelihood of m = F(1) peaks at θ = 1 (${mode.toFixed(3)})`); }
  if (has('causal')) {
    t.ok(L.causal.cueCombineMLE([1, 3], [0.5, 1]).variance < 0.25, 'causal: MLE variance < the best single cue');
    t.ok(L.causal.ciPosteriorCommon(0.1, -0.1, 2, 9, 12, 0.3) > L.causal.ciPosteriorCommon(10, -10, 2, 9, 12, 0.3), 'causal: p(C=1) agree > disagree');
    const H = L.causal.numberGameHypotheses(100), pst = L.causal.conceptPosterior(H, [2, 4, 8, 16]); let iP = -1, iE = -1; H.forEach((h, i) => { if (h.name === 'powers 2') iP = i; if (h.name === 'even') iE = i; });
    t.ok(pst[iP] > pst[iE], 'causal: size principle, powers of 2 > even');
    const a = L.causal.ciPosteriorCommon(2, -1, 2, 8, 15, 0.2), b = L.causal.ciPosteriorCommon(2, -1, 2, 8, 15, 0.8); t.ok(b > a + 0.1, `causal: p(C=1|x) rises with the prior p_common (${a.toFixed(3)} → ${b.toFixed(3)})`);
    const f = L.causal.ciFusedEstimate(3, -2, 2, 8, 15), wv = 1 / 4, wa = 1 / 64, wp = 1 / 225; t.ok(Math.abs(f - (3 * wv - 2 * wa) / (wv + wa + wp)) < 1e-12, 'causal: fused estimate = precision-weighted mean including the prior');
    t.ok(Math.abs(L.causal.ciFusedEstimate(3, -2, 2, 8, 1e6) - L.causal.cueCombineMLE([3, -2], [2, 8]).estimate) < 1e-6, 'causal: a flat prior reduces fusion to MLE cue combination');
    let z1 = 0, z2 = 0; const sv = 2, sa = 3, sp = 5, h = 0.25; for (let xv = -40; xv <= 40; xv += h) for (let xa = -40; xa <= 40; xa += h) { z1 += L.causal.ciLikCommon(xv, xa, sv, sa, sp) * h * h; z2 += L.causal.ciLikSeparate(xv, xa, sv, sa, sp) * h * h; }
    t.ok(Math.abs(z1 - 1) < 1e-3 && Math.abs(z2 - 1) < 1e-3, `causal: both likelihoods integrate to 1 (${z1.toFixed(5)}, ${z2.toFixed(5)})`); }
  if (has('wm')) {
    t.ok(Math.abs(L.wm.besselI0(0) - 1) < 1e-9, 'wm: I0(0)=1'); t.ok(L.wm.kappaToSD(2) > L.wm.kappaToSD(20), 'wm: κ→SD decreasing');
    let sx = 0, sy = 0; for (let i = 0; i < 3000; i++) { const th = L.wm.vmSample(0.6, 8, U); sx += Math.cos(th); sy += Math.sin(th); } t.ok(Math.abs(Math.atan2(sy, sx) - 0.6) < 0.12, 'wm: von Mises sample mean ≈ μ');
    let nt = 0; const TT = 5000; for (let i = 0; i < TT; i++) if (L.wm.mixtureRecall({ target: 0, nontargets: [1.5, -1.5], kappa: 10, pT: 0.6, pSwap: 0.25, pGuess: 0.15 }, U).branch === 'target') nt++;
    t.ok(Math.abs(nt / TT - 0.6) < 0.05, 'wm: mixture target proportion ≈ pT');
    for (const c of [{ kappa: 16, pT: 0.75, pSwap: 0.15, pGuess: 0.1, nontargetOffsets: [1.57, 3.14, -1.57] }, { kappa: 4, pT: 0.6, pSwap: 0, pGuess: 0.4, nontargetOffsets: [] }]) { let z = 0; const n = 4000; for (let i = 0; i < n; i++) z += L.wm.mixturePdf(-Math.PI + 2 * Math.PI * (i + 0.5) / n, c) * 2 * Math.PI / n; t.ok(Math.abs(z - 1) < 1e-4, `wm: mixturePdf integrates to 1 (κ=${c.kappa}: ${z.toFixed(6)})`); }
    t.ok(Math.abs(L.wm.kappaToSD(400) * 20 - 1) < 0.01, 'wm: kappaToSD·√κ → 1 for large κ'); t.ok(t.rel(L.wm.sdToKappa(L.wm.kappaToSD(8)), 8) < 0.03, 'wm: sdToKappa inverts kappaToSD (tol 3%)'); }
  if (has('network')) {
    const pat8 = [1, -1, 1, -1, 1, -1, 1, -1], Wh = L.network.hopfieldStore([pat8], 8); let sr = Int8Array.from(pat8); sr[0] = -sr[0]; L.network.hopfieldStep(Wh, sr, 8, [0, 1, 2, 3, 4, 5, 6, 7]);
    t.ok(L.network.overlap(Array.from(sr), pat8, 8) > 0.9, 'network: Hopfield recall');
    const Wr = L.network.ringKernel(16, 8, 1.3, 0.3); t.ok(Wr[0] > Wr[8], 'network: ring local excitation');
    const N = 64, W = L.network.ringKernel(N, 8, 1.3, 0.3), dd = 2 * Math.PI * 3 / N; t.ok(Math.abs(W[3] - (8 * Math.exp(-dd * dd / (2 * 0.09)) - 1.3)) < 1e-12 && Math.abs(W[5 * N + 2] - W[3]) < 1e-12, 'network: ring kernel = J·exp(−d²/2σ²) − J_I, translation invariant'); }
  if (has('osc')) {
    t.ok(L.osc.kuramotoOrder([0.5, 0.5, 0.5, 0.5]).r > 0.99 && L.osc.kuramotoOrder([0, Math.PI / 2, Math.PI, 3 * Math.PI / 2]).r < 0.05, 'osc: sync vs incoherent r');
    const kr = SIM.makeRNG('kur'), n = 12, ph = Array.from({ length: n }, () => (kr() * 2 - 1) * Math.PI), om = Array.from({ length: n }, () => SIM.gaussian(kr)), K = 2.3, dt = 0.01, out = L.osc.kuramotoStep(ph, om, K, dt, 0, () => 0); let w = 0;
    for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j < n; j++) s += Math.sin(ph[j] - ph[i]); w = Math.max(w, Math.abs(out[i] - (ph[i] + dt * (om[i] + K / n * s)))); }
    t.ok(w < 1e-12, 'osc: Kuramoto mean-field step = (K/N) Σ_j sin(θ_j − θ_i)'); }
  if (has('belief')) {
    const bp = L.belief.predict([0, 1, 0, 0], [[.5, .5, 0, 0], [0, .5, .5, 0], [0, 0, .5, .5], [.5, 0, 0, .5]]), bu = L.belief.update([.25, .25, .25, .25], [.1, .7, .1, .1]);
    t.ok(Math.abs(bp.reduce((a, b) => a + b, 0) - 1) < 1e-9 && Math.abs(bu.reduce((a, b) => a + b, 0) - 1) < 1e-9 && bu[1] > 0.5 && L.belief.entropy([1, 0, 0, 0]) < 1e-9, 'belief: predict/update normalise + concentrate'); }
  if (has('vision')) {
    const dks = L.vision.dogKernel(1.5, 4, 1); let dsum = 0; for (const v of dks.k) dsum += v; const dc = L.vision.dogKernel(1.5, 4, 0); let csum = 0; for (const v of dc.k) csum += v;
    t.ok(Math.abs(dsum) < 0.15 && csum > 0.5, 'vision: DoG band-pass ≈ 0 vs low-pass > 0'); }
  if (has('attn')) {
    const sm = L.attn.softmax([1, 2, 3]); t.ok(Math.abs(sm.reduce((a, b) => a + b, 0) - 1) < 1e-9 && sm[2] > sm[1] && sm[1] > sm[0], 'attn: softmax sums to 1 + monotone');
    t.ok(Math.abs(L.attn.entropy([.25, .25, .25, .25]) - Math.log(4)) < 1e-9, 'attn: uniform entropy = ln(N)'); }
  if (has('sde')) {
    t.ok(Math.abs(L.sde.wiener(0.2, 1.5, 0.8, 0.01, () => 0.7) - (0.2 + 1.5 * 0.01 + 0.8 * 0.1 * 0.7)) < 1e-15, 'sde: wiener step = x + drift·dt + c·√dt·ξ');
    t.ok(Math.abs(L.sde.ou(0.3, 4, -1, 0.5, 0.01, () => -1.2) - (0.3 + 4 * (-1 - 0.3) * 0.01 + 0.5 * 0.1 * -1.2)) < 1e-15, 'sde: OU step = x + θ(μ−x)·dt + σ·√dt·ξ');
    t.ok(Math.abs(L.sde.normpdf(1.3, 1.3, 0.5) - 1 / (0.5 * Math.sqrt(2 * Math.PI))) < 1e-12 && Math.abs(L.sde.normpdf(2.3, 1.3, 0.5) / L.sde.normpdf(1.3, 1.3, 0.5) - Math.exp(-2)) < 1e-12, 'sde: normpdf peak 1/(σ√2π), falls by e^(−z²/2)');
    t.ok(Math.abs(L.sde.normcdf(0) - 0.5) < 3e-7 && Math.abs(L.sde.normcdf(1.959964) - 0.975) < 3e-7 && Math.abs(L.sde.normcdf(-1) - 0.158655254) < 3e-7, 'sde: normcdf(0)=0.5, Φ(1.96)=0.975, Φ(−1)=0.1587 (tol 3e-7, the Abramowitz–Stegun 26.2.17 approximation)'); }
  if (has('bayes')) {
    const w = 1 / (1 + 0.8 * 0.8), ct = L.bayes.centralTendency([-2, 0, 3], 0.8, 0.5, 1);
    t.ok(ct.every(q => Math.abs(q.est - (w * q.theta + (1 - w) * 0.5)) < 1e-12 && Math.abs(q.sd - w * 0.8) < 1e-12), 'bayes: centralTendency = w·θ + (1−w)·μ0, SD w·σ_m (w = σ0²/(σ0²+σ_m²))');
    t.ok(Math.abs(L.bayes.weberNoise(-4, 0.15) - 0.6) < 1e-12 && L.bayes.weberNoise(0, 0.15) === 1e-3, 'bayes: weberNoise = wf·|θ|, floored');
    const tr = L.bayes.trial(2, 0.8, 0.5, 1, () => 0.25); t.ok(Math.abs(tr.m - 2.2) < 1e-12 && Math.abs(tr.est - (w * 2.2 + (1 - w) * 0.5)) < 1e-12, 'bayes: trial draws m = θ + σ_m·ξ and estimates the posterior mean'); }
  if (has('neuron')) {
    const D = L.neuron.IZH_DEFAULT; t.ok(D.a === 0.02 && D.b === 0.2 && D.c === -65 && D.d === 8, 'neuron: IZH_DEFAULT is regular spiking (a .02, b .2, c −65, d 8)');
    const s = { v: -60, u: -12 }, h = 0.5, v1 = -60 + h * (0.04 * 3600 + 5 * -60 + 140 + 12 + 10), u1 = -12 + h * (0.02 * (0.2 * v1 + 12));
    L.neuron.izhStep(s, 10, null, h / 1000); t.ok(Math.abs(s.v - v1) < 1e-12 && Math.abs(s.u - u1) < 1e-12, 'neuron: one Izhikevich step equals the written equations (dt in s, model in ms)');
    const sp = { v: 29, u: 0 }, vPeak = 29 + (0.04 * 29 * 29 + 5 * 29 + 140 + 10), fired = L.neuron.izhStep(sp, 10, null, 0.001);
    t.ok(fired && sp.v === -65 && Math.abs(sp.u - (0.02 * 0.2 * vPeak + 8)) < 1e-9, 'neuron: Izhikevich reset v → c, u → u + d at v ≥ 30');
    const fz = L.neuron.fI((st, I, dt) => L.neuron.izhStep(st, I, null, dt), () => ({ v: -65, u: -13 }), [3, 10], 0.00025, 2);
    t.ok(fz[0].rate === 0 && fz[1].rate > 12 && fz[1].rate < 35, `neuron: Izhikevich RS silent at I = 3, tonic at I = 10 (${fz[1].rate} Hz)`); }
  if (has('rl')) {
    const Q = L.rl.qUpdate([0.2, 0.5, -1], 1, 1, 0.3); t.ok(Q[0] === 0.2 && Math.abs(Q[1] - (0.5 + 0.3 * (1 - 0.5))) < 1e-15 && Q[2] === -1, 'rl: qUpdate = Rescorla–Wagner on arm a, the others untouched');
    const pr = [0.2, 0.5, 0.3], cnt = [0, 0, 0], n = 20000; for (let i = 0; i < n; i++) cnt[L.rl.choose(pr, U)]++; t.ok(cnt.every((c, i) => Math.abs(c / n - pr[i]) < 0.015), `rl: choose draws arm i with probability p_i (${cnt.map(c => (c / n).toFixed(3)).join(', ')})`);
    const k = L.rl.kalman({ mu: 1, sigma: 0.8 }, 3, 0.25, 2), pv = 0.64 + 0.25, post = 1 / (1 / pv + 1 / 2);
    t.ok(Math.abs(k.sigma * k.sigma - post) < 1e-12 && Math.abs(k.mu - (1 + pv / (pv + 2) * 2)) < 1e-12, 'rl: kalman posterior 1/σ² = 1/(σ²+q) + 1/r, mean moves by the gain K = (σ²+q)/(σ²+q+r)'); }
  if (has('bayes', 'efficient')) {
    const xs = [-2, -1, 0, 1, 2], post = [0.1, 0.2, 0.4, 0.2, 0.1];
    t.ok(Math.abs(L.efficient.condMean(post, xs, 0, 1) - (0.4 * 0 + 0.2 * 1 + 0.1 * 2) / 0.7) < 1e-12 && Math.abs(L.efficient.condMean(post, xs, 0, -1) - (-0.1 * 2 - 0.2) / 0.3) < 1e-12, 'efficient: condMean = posterior mean truncated to the decided side');
    const gx = L.bayes.linspace(-4, 4, 81), pri = Array.from(gx, x => Math.exp(-x * x / 2)), F = L.efficient.cdf(gx, pri), br = SIM.makeRNG('ec-bias'), b = L.efficient.biasCurve(gx, 0.08, F, pri, 'BLS', 600, () => SIM.gaussian(br));
    t.ok(b[50] > 0.01 && b[30] < -0.01, `efficient: BLS bias is repulsive, away from the prior peak (θ=+1: ${b[50].toFixed(3)}, θ=−1: ${b[30].toFixed(3)})`); }
  if (has('causal')) {
    const rw = L.causal.reliabilityWeights([1, 2]); t.ok(Math.abs(rw[0] - 0.8) < 1e-12 && Math.abs(rw[1] - 0.2) < 1e-12, 'causal: reliabilityWeights ∝ 1/σ², sum to 1');
    t.ok(Math.abs(L.causal.ciSegEstimate(6, 2, 4, 1) - (6 / 4 + 1 / 16) / (1 / 4 + 1 / 16)) < 1e-12, 'causal: segregated estimate = precision-weighted cue and prior mean');
    const h = { members: new Set([2, 4, 6, 8]), size: 4 }; t.ok(Math.abs(L.causal.sizePrincipleLikelihood(h, [2, 8]) - 1 / 16) < 1e-15 && L.causal.sizePrincipleLikelihood(h, [2, 3]) === 0, 'causal: size principle (1/|h|)^n, 0 if an example is outside h');
    const H = L.causal.numberGameHypotheses(100), iE = H.findIndex(x => x.name === 'even'), gc = L.causal.generalizationCurve(H, H.map((_, i) => i === iE ? 1 : 0), 100);
    t.ok(gc[64] === 1 && gc[63] === 0 && gc.reduce((a, v) => a + v, 0) === 50, 'causal: generalization of a posterior on "even" = indicator of the even numbers'); }
  if (has('wm')) {
    const In = (nn, x) => { const M = 2000; let s = 0; for (let k = 0; k < M; k++) { const tt = Math.PI * (k + 0.5) / M; s += Math.exp(x * Math.cos(tt)) * Math.cos(nn * tt); } return s / M; };
    let e1 = 0, ef = 0; for (const k of [0.5, 1, 5, 14.9, 15, 20, 40]) { e1 = Math.max(e1, t.rel(L.wm.besselI1(k), In(1, k))); ef = Math.max(ef, t.rel(L.wm.fisherInfo(k), k * In(1, k) / In(0, k))); }
    t.ok(e1 < 1e-5 && Math.abs(L.wm.besselI1(-1) + L.wm.besselI1(1)) < 1e-15, `wm: besselI1 matches the integral, odd in κ (max rel err ${e1.toExponential(1)})`);
    t.ok(ef < 1e-5, `wm: fisherInfo = κ·I1(κ)/I0(κ) (max rel err ${ef.toExponential(1)})`);
    t.ok(Math.abs(L.wm.precisionFromSetsize(4, { P1: 2, k: 0.5 }) - 1) < 1e-12, 'wm: precisionFromSetsize = P1·N^(−k)'); }
  if (has('vision')) { t.ok(Math.abs(L.vision.rfSizeVsEcc(10, 0.5, 0.2) - 1.5) < 1e-12, 'vision: rfSizeVsEcc = base·(1 + slope·ecc)'); }
  if (has('bayes')) { const gp = L.bayes.gaussPosterior(1, 1, 0, 1); t.ok(Math.abs(gp.mu - 0.5) < 1e-12 && Math.abs(gp.sigma - Math.SQRT1_2) < 1e-12, 'bayes: gaussPosterior(m=1, σm=1, μ0=0, σ0=1) = N(0.5, 1/2)');
    const xs = L.bayes.linspace(-4, 4, 161), npd = (x, m, sd) => Math.exp(-0.5 * ((x - m) / sd) ** 2), post = L.bayes.gridPost(Array.from(xs, x => npd(x, 1, 1)), Array.from(xs, x => npd(x, 0, 1)));
    t.ok(Math.abs(post.reduce((a, b) => a + b, 0) - 1) < 1e-12 && Math.abs(L.bayes.gridMean(post, xs) - 0.5) < 1e-5 && Math.abs(L.bayes.gridMode(post, xs) - 0.5) < 1e-9, 'bayes: gridPost normalises like·prior; gridMean and gridMode of that Gaussian posterior = 0.5'); }
  if (has('rl')) { const p = L.rl.softmax([1, 2, 3], 2), u = L.rl.softmax([1, 2, 3], 0);
    t.ok(Math.abs(p.reduce((a, b) => a + b, 0) - 1) < 1e-12 && Math.abs(p[1] / p[0] - Math.exp(2)) < 1e-9 && u.every(v => Math.abs(v - 1 / 3) < 1e-12) && L.rl.softmax([1000, 0], 1)[0] === 1, 'rl: softmax sums to 1, odds = e^{β·Δv}, β=0 is uniform, no overflow at large values'); }
  if (has('bayes', 'efficient')) { const xs = L.bayes.linspace(-4, 4, 241), F = L.efficient.cdf(xs, Array.from(xs, x => Math.exp(-0.5 * x * x)));
    t.ok(Math.abs(L.efficient.interp(0.25, [0, 1], [0, 10]) - 2.5) < 1e-12 && Math.abs(L.efficient.inv(L.efficient.encode(1.2, xs, F), xs, F) - 1.2) < 1e-3, 'efficient: interp is linear; inv undoes encode (F⁻¹(F(θ)) = θ)');
    t.ok(Math.abs(L.efficient.measure(1, 0.1, xs, F, () => 1) - (L.efficient.encode(1, xs, F) + 0.1)) < 1e-12, 'efficient: measure = F(θ) + σ·noise'); }
  if (has('causal')) { const [xv, xa, sv, sa, sp, pc] = [2, -1, 1, 2, 10, 0.4], e = L.causal.ciEstimate(xv, xa, sv, sa, sp, pc), pC = L.causal.ciPosteriorCommon(xv, xa, sv, sa, sp, pc), sF = L.causal.ciFusedEstimate(xv, xa, sv, sa, sp);
    const sV = (xv / sv ** 2) / (1 / sv ** 2 + 1 / sp ** 2), sel = L.causal.ciEstimate(xv, xa, sv, sa, sp, pc, { strategy: 'select' });
    t.ok(Math.abs(e.pCommon - pC) < 1e-12 && Math.abs(e.sSegV - sV) < 1e-12 && Math.abs(e.sHatV - (pC * sF + (1 - pC) * sV)) < 1e-12 && sel.sHatV === (pC > 0.5 ? sF : e.sSegV), 'causal: ciEstimate averages fused and segregated estimates by p(C=1) (select picks one)'); }
  if (has('wm')) { const w = L.wm.wrap; t.ok(Math.abs(w(3 * Math.PI / 2) + Math.PI / 2) < 1e-12 && Math.abs(w(-3 * Math.PI / 2) - Math.PI / 2) < 1e-12 && Math.abs(w(0.3) - 0.3) < 1e-15, 'wm: wrap maps angles into [−π, π)');
    let z = 0; const n = 4000; for (let i = 0; i < n; i++) z += L.wm.vmPdf(-Math.PI + 2 * Math.PI * (i + 0.5) / n, 0.7, 6) * 2 * Math.PI / n; t.ok(Math.abs(z - 1) < 1e-6 && L.wm.vmPdf(0.7, 0.7, 6) > L.wm.vmPdf(2, 0.7, 6), `wm: vmPdf integrates to 1 and peaks at μ (${z.toFixed(8)})`); }
  if (has('network')) { const pat = [1, -1, 1, 1, -1, -1, 1, -1], W = L.network.hopfieldStore([pat], 8), s = Int8Array.from(pat); s[0] = -s[0]; s[3] = -s[3];
    const E0 = L.network.hopfieldEnergy(W, s, 8); L.network.hopfieldStep(W, s, 8); const E1 = L.network.hopfieldEnergy(W, s, 8);
    t.ok(E1 <= E0 && Math.abs(E1 - L.network.hopfieldEnergy(W, Int8Array.from(pat), 8)) < 1e-12, `network: hopfieldEnergy falls under an async sweep to the stored pattern's energy (${E0.toFixed(3)} → ${E1.toFixed(3)})`);
    const N = 12, r = L.network.ringStep(new Float64Array(N).fill(0.2), new Float64Array(N * N), null, 0.5, 1, 1, 0, 0, () => 0);
    t.ok(r.every(v => Math.abs(v - (0.2 + 0.5 * (0.5 - 0.2))) < 1e-12), 'network: ringStep is one Euler step of τ dr/dt = −r + f(·) (no input: f = 1/2)');
    const one = new Float64Array(8); one[3] = 2.5; const pv = L.network.popVector(one, 8), flat = L.network.popVector(new Float64Array(8).fill(1), 8);
    t.ok(Math.abs(pv.angle - 2 * Math.PI * 3 / 8) < 1e-12 && Math.abs(pv.length - 1) < 1e-12 && flat.length < 1e-12, 'network: popVector decodes a one-unit bump at its angle (length 1 whatever its rate), a flat profile has length 0'); }
  if (has('osc')) { const p = { wEE: 12, wEI: 10, wIE: 10, wII: 2, P: 1, Q: 0, theta: 4, k: 1, tauE: 1, tauI: 2 }, S = x => 1 / (1 + Math.exp(-(x - p.theta) / p.k)), s0 = { E: 0.3, I: 0.2 }, dt = 0.01, o = L.osc.wilsonCowanStep(s0, p, dt);
    t.ok(Math.abs(o.E - (0.3 + dt * (-0.3 + S(12 * 0.3 - 10 * 0.2 + 1)) / 1)) < 1e-12 && Math.abs(o.I - (0.2 + dt * (-0.2 + S(10 * 0.3 - 2 * 0.2 + 0)) / 2)) < 1e-12, 'osc: wilsonCowanStep is one Euler step of the Wilson–Cowan equations'); }
};

const guarded = (label, fn) => { try { fn(toolkit); } catch (e) { console.log(`    ${label} check threw: ${e.message}   [${ok(false)}]`); } };
console.log('\n--- engine + plot helpers ---');
guarded('core', CORE_CHECKS);
console.log(`\n--- analytic checks (tied to each model's science) — from ${CHECK_FILES.join(', ') || 'no checks file'} ---`);
const asserted = new Set();
for (const id of usable) { if (!MODEL_CHECKS[id]) continue; console.log(`  ${id}`); const n0 = nAsserts; checkScript = CHECK_SRC[id]; guarded(id, MODEL_CHECKS[id]); checkScript = null; if (nAsserts > n0) asserted.add(id); }
{ const missing = ORDER.filter(id => !asserted.has(id));
  if (missing.length) warn(`no analytic check for ${missing.length} model${missing.length > 1 ? 's' : ''}: ${missing.join(', ')} — write one in engine.checks.mjs (README.md, "Write its check")`); }

if (CCNLIB) { console.log('\n=== ccnlib.js building blocks ===\n'); guarded('ccnlib', LIBRARY_CHECKS); }
else console.log('\n(modules/ccnlib.js is not loaded by index.html — library checks skipped)');

if (ARGV.includes('--snapshot') || ARGV.includes('--against')) {
  const snap = { format: 1, seed: SNAPSHOT_SEED, models: {} };
  for (const id of usable) { const m = SIM.MODELS[id], base = def(id), cases = { default: base };
    for (const s of (m.params || [])) for (const v of extremesOf(s)) cases[s.name + '=' + v] = { ...base, [s.name]: v };
    const sims = {}; for (const [name, p] of Object.entries(cases)) { try { sims[name] = digest(m.simulate({ ...p }, { rng: SIM.makeRNG(SNAPSHOT_SEED), seed: SNAPSHOT_SEED, params: { ...p }, batch: false })); } catch (e) { sims[name] = 'threw'; } }
    snap.models[id] = { params: (m.params || []).map(s => [s.name, s.type || 'num', s.min, s.max, s.step, s.default].join(',')), simulate: sims }; }
  console.log('\n--- snapshot ---');
  if (ARGV.includes('--against')) {
    const file = optOf('--against'); let ref = null; try { ref = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { console.log(`  cannot read ${file}: ${e.message}   [${ok(false)}]`); }
    if (ref) { const diffs = [];
      for (const [id, r] of Object.entries(ref.models || {})) { const now = snap.models[id]; if (!now) { diffs.push(`${id}: model missing`); continue; }
        if (r.params.join(';') !== now.params.join(';')) diffs.push(`${id}: parameter schema changed`);
        for (const [k, v] of Object.entries(r.simulate)) if (now.simulate[k] !== v) diffs.push(`${id}: simulate(${k}) ${v} → ${now.simulate[k]}`); }
      const n = Object.keys(ref.models || {}).length, nDiff = new Set(diffs.map(d => d.split(':')[0])).size;
      console.log(`  ${nDiff === 0 ? `${n} model(s) match ${file}` : `${nDiff} of ${n} model(s) differ from ${file}`}   [${ok(diffs.length === 0)}]`); diffs.slice(0, 20).forEach(d => console.log('    ' + d)); if (diffs.length > 20) console.log(`    … and ${diffs.length - 20} more`); }
  }
  if (ARGV.includes('--snapshot')) { const file = optOf('--snapshot'); if (!file) console.log(`  --snapshot needs a file name   [${ok(false)}]`); else { fs.writeFileSync(file, JSON.stringify(snap, null, 1) + '\n'); console.log(`  wrote ${file}: ${Object.keys(snap.models).length} model(s), ${Object.values(snap.models).reduce((a, m) => a + Object.keys(m.simulate).length, 0)} simulate digests`); } }
}

finish();
