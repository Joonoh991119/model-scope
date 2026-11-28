import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_TEMPLATE = fileURLToPath(new URL('../../skills/model-scope/assets/template/', import.meta.url));
export const SEED = 'seed-1';
export const CANVAS = [560, 320];

export const fnv = (s, h) => { for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; };
const FNV0 = 0x811c9dc5;
const hex = h => h.toString(16).padStart(8, '0');
const num = v => Number.isFinite(v) ? v.toPrecision(10) : String(v);

let REC = null;
const enc = a => typeof a === 'number' ? num(a) : typeof a === 'string' ? a
  : Array.isArray(a) ? '[' + a.map(enc).join(',') + ']'
  : a && a.data ? 'img' + a.data.length + ':' + fnv(Array.prototype.join.call(a.data, ','), FNV0).toString(16)
  : a && a.__cv ? 'cv' : typeof a;
function mkCtx() {
  const store = {};
  return new Proxy(store, {
    get(t, p) {
      if (p === 'measureText') return s => ({ width: String(s).length * 6 });
      if (p === 'createImageData') return (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h });
      if (p in t) return t[p];
      return (...a) => { if (REC) { REC.n++; REC.h = fnv(String(p) + '(' + a.map(enc).join(',') + ')', REC.h); if (REC.ops) REC.ops.push([String(p), a]); } };
    },
    set(t, p, v) { t[p] = v; if (REC) { REC.n++; REC.h = fnv(String(p) + '=' + enc(v), REC.h); if (REC.ops) REC.ops.push(['=' + String(p), [v]]); } return true; },
  });
}
export const mkCanvas = (w = CANVAS[0], h = CANVAS[1]) => { const ctx = mkCtx(); return { __cv: true, width: 0, height: 0, getBoundingClientRect: () => ({ width: w, height: h }), getContext: () => ctx }; };

export function scriptList(dir) {
  const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  return [...html.matchAll(/<script\s+src="([^"]+)"/g)].map(m => m[1]);
}

export function loadTemplate(dir = DEFAULT_TEMPLATE) {
  globalThis.window = globalThis; globalThis.devicePixelRatio = 1;
  globalThis.document = { createElement: () => mkCanvas(1, 1) };
  const scripts = scriptList(dir);
  for (const s of scripts) (0, eval)(fs.readFileSync(path.join(dir, s), 'utf8'));
  return { SIM: globalThis.SIM, Plot: globalThis.Plot, MSLIB: globalThis.MSLIB, scripts, dir };
}

function walk(v, st, depth) {
  if (depth > 12) return;
  if (typeof v === 'number') { st.n++; st.h = fnv(num(v), st.h); }
  else if (typeof v === 'string' || typeof v === 'boolean') st.h = fnv(String(v), st.h);
  else if (typeof v === 'function') st.fn++;
  else if (v && typeof v === 'object') {
    if (ArrayBuffer.isView(v) || Array.isArray(v)) for (let i = 0; i < v.length; i++) walk(v[i], st, depth + 1);
    else for (const k of Object.keys(v).sort()) { st.h = fnv(k, st.h); walk(v[k], st, depth + 1); }
  }
}
export const digest = d => { const st = { n: 0, h: FNV0, fn: 0 }; walk(d, st, 0); return st.n + ':' + hex(st.h); };

export const defaults = m => { const p = {}; (m.params || []).forEach(s => { p[s.name] = s.default; }); return p; };
export const schemaOf = m => (m.params || []).map(s => [s.name, s.type || 'num', s.min, s.max, s.step, s.default, s.int ? 1 : 0, s.unit || '', (s.options || []).join('|')].join(','));
export function cases(m) {
  const base = defaults(m), out = [['default', base]];
  for (const s of (m.params || [])) {
    const vals = s.type === 'enum' ? [0, (s.options || []).length - 1] : s.type === 'bool' ? [false, true] : [s.min, s.max];
    for (const v of vals) out.push([s.name + '=' + v, { ...base, [s.name]: v }]);
  }
  return out;
}
export const envFor = (SIM, p, seed = SEED) => ({ rng: SIM.makeRNG(seed), seed, params: { ...p }, batch: false });

export function lensSpecs(m, p, data) {
  return (m.lenses ? Object.entries(m.lenses) : [['', m]]).map(([key, spec]) => {
    let stages = null, len = 1;
    if (spec.stages) stages = typeof spec.stages === 'function' ? spec.stages(p, data) : spec.stages;
    if (stages && stages.length) len = stages.length;
    else { stages = null; if (spec.anim) { const L = spec.anim.length(p, data); len = Number.isFinite(L) ? Math.max(1, Math.floor(L)) : 1; } }
    return { key, spec, stages, len };
  });
}
export function uiFor(head, p, stages, len) {
  const stage = stages ? Math.min(len - 1, Math.floor(head)) : null;
  return { head, playing: false, params: p, frac: 0, stage, stageKey: stage != null ? stages[stage].key : null, stages, nStages: stages ? stages.length : 0 };
}
export function recordDraw(Plot, view, data, ui, { size = CANVAS, keepOps = false } = {}) {
  REC = { n: 0, h: FNV0, ops: keepOps ? [] : null };
  try { view.draw(Plot.make(mkCanvas(size[0], size[1])), data, ui); const r = { digest: REC.n + ':' + hex(REC.h), n: REC.n, ops: REC.ops }; return r; }
  finally { REC = null; }
}

export function capture({ SIM, Plot }, { draw = true } = {}) {
  const out = { order: SIM.MODEL_ORDER.slice(), schema: {}, simulate: {}, draw: {} };
  for (const id of SIM.MODEL_ORDER) {
    const m = SIM.MODELS[id], base = defaults(m);
    out.schema[id] = schemaOf(m);
    out.simulate[id] = {}; let d0;
    for (const [name, p] of cases(m)) { const d = m.simulate({ ...p }, envFor(SIM, p)); out.simulate[id][name] = digest(d); if (name === 'default') d0 = d; }
    if (!draw) continue;
    out.draw[id] = {};
    for (const { key, spec, stages, len } of lensSpecs(m, base, d0))
      (spec.views || []).forEach((v, vi) => {
        for (const head of (stages ? [0, len - 1] : [0, len]))
          out.draw[id][`${key}/v${vi}@${head === 0 ? 0 : 'end'}`] = recordDraw(Plot, v, d0, uiFor(head, base, stages, len)).digest;
      });
  }
  return out;
}

export function compare(ref, out, { draw = true } = {}) {
  const diffs = [];
  if (ref.order.join() !== out.order.filter(id => ref.order.includes(id)).join()) diffs.push('the relative order of the baseline models changed');
  for (const id of ref.order) {
    if (!out.schema[id]) { diffs.push(`${id}: model missing`); continue; }
    if (ref.schema[id].join(';') !== out.schema[id].join(';')) {
      const a = ref.schema[id], b = out.schema[id], i = a.findIndex((s, k) => s !== b[k]);
      diffs.push(`${id}: parameter schema changed (${a[i] ?? 'none'} -> ${b[i] ?? 'none'})`);
    }
    for (const k of Object.keys(ref.simulate[id])) if (ref.simulate[id][k] !== out.simulate[id][k]) diffs.push(`${id}: simulate(${k}) ${ref.simulate[id][k]} -> ${out.simulate[id][k]}`);
    if (draw) for (const k of Object.keys(ref.draw[id])) if (ref.draw[id][k] !== (out.draw[id] || {})[k]) diffs.push(`${id}: draw ${k} ${ref.draw[id][k]} -> ${(out.draw[id] || {})[k]}`);
  }
  return diffs;
}

export const countCases = (o, k) => Object.values(o[k]).reduce((a, x) => a + Object.keys(x).length, 0);

export function args(argv = process.argv.slice(2)) {
  return { flag: f => argv.includes(f), opt: f => { const i = argv.indexOf(f); return i >= 0 && i + 1 < argv.length ? argv[i + 1] : undefined; }, argv };
}
