/* =============================================================================
 * validate.mjs — the model-scope correctness gate, reusing engine.js (and a Plot stub).
 *   Run:  node validate.mjs
 * The toolbox imposes no fixed output shape, so the gate is layered:
 *   (1) simulate() returns data without throwing; every view is a function;
 *   (2) view-render pass — every view DRAWS (recording stub) at head=0 and the end, per lens,
 *       without throwing, with finite axes and a colorbar on every heatmap;
 *   (3) parameter property pass — simulate() stays finite at each slider's min and max;
 *   (4) a per-model analytic check tied to the science; plus the mslib building-block checks.
 * ========================================================================== */
import fs from 'node:fs';
// plot.js touches `document`/canvas; engine.js only needs it lazily inside views, so
// stub the browser globals it references at module scope. Load mslib.js FIRST — the
// modelbook example models call MSLIB inside simulate() (mirrors index.html's <script> order).
globalThis.window = globalThis; globalThis.devicePixelRatio = 1;
(0, eval)(fs.readFileSync(new URL('./modules/mslib.js', import.meta.url), 'utf8'));
(0, eval)(fs.readFileSync(new URL('./engine.js', import.meta.url), 'utf8'));
const SIM = globalThis.SIM;

// Minimal Plot global so the view-render pass below can run views that call Plot.histify / Plot.TH
// directly (plot.js touches document at load, so we can't eval it here — supply just the pure pieces
// views use). histify is copied verbatim from plot.js.
globalThis.Plot = {
  TH: {accent:'#4a7a93',pos:'#2e8b7a',neg:'#c25b42',warn:'#b07d2a',ink:'#33312c',dim:'#6f6b61',faint:'#a39e91',grid:'#e7e3d8',edge:'#d6d2c5'},
  histify(values, bins, lo, hi, quant){
    bins=Math.max(1,Math.floor(bins||1)); if(!(hi>lo)) hi=lo+(quant>0?quant:1);
    let bw=(hi-lo)/bins; if(quant>0) bw=Math.max(quant, Math.round(bw/quant)*quant); if(!(bw>0)) bw=(hi-lo)||1;
    const n=Math.max(1,Math.ceil((hi-lo)/bw)), counts=new Array(n).fill(0), edges=new Array(n);
    for(let i=0;i<n;i++) edges[i]=lo+i*bw;
    for(const v of values){ if(!(v>=lo && v<hi)) continue; const k=Math.floor((v-lo)/bw); if(k>=0&&k<n) counts[k]++; }
    return { edges, counts, binW:bw, max:Math.max(1,...counts) };
  }
};

let fails = 0; const ok = b => (b ? '\x1b[32mPASS\x1b[0m' : (fails++, '\x1b[31mFAIL\x1b[0m'));
const env = (seed) => ({ rng: SIM.makeRNG(seed), seed, params: {}, batch: false });   // batch:false → heavy models run a SMALL synchronous batch here (see runChunks pattern)

console.log('\n=== model-scope template models ===\n');

// every model: simulate runs, returns an object, and has ≥1 view function
for (const id of SIM.MODEL_ORDER) {
  const m = SIM.MODELS[id]; const p = {}; (m.params||[]).forEach(s => p[s.name] = s.default);
  let data, threw = null; try { data = m.simulate(p, env('v-'+id)); } catch (e) { threw = e; }
  const specs = m.lenses ? Object.values(m.lenses) : [m];   // a lens model carries its views per lens
  const viewsOk = specs.length >= 1 && specs.every(s => Array.isArray(s.views) && s.views.length >= 1 && s.views.every(v => typeof v.draw === 'function'));
  const nv = specs.reduce((a,s)=>a+((s.views&&s.views.length)||0),0);
  console.log(`  ${m.name.padEnd(28)} simulate=${threw?'\x1b[31mthrew\x1b[0m':'ok'}  views=${nv}${m.lenses?` (${specs.length} lenses)`:''}  [${ok(!threw && data && viewsOk)}]`);
  if (threw) console.log('    ' + threw.message);
}

// ---- view-render pass: every view must DRAW without throwing (at head=0 AND the end of its
//      playhead, per lens), with FINITE axis ranges and a COLORBAR on every heatmap. This is the
//      machine-checkable slice of gui-qc.md, now enforced — a view that dies on first paint, a NaN
//      axis (blank panel), or a heatmap with no scale, all FAIL the gate instead of shipping. ----
function stubG(){
  const ctx = new Proxy({}, { get(t,p){ if(p==='measureText') return s=>({width:String(s).length*6}); if(p in t) return t[p]; return ()=>{}; }, set(t,p,v){ t[p]=v; return true; } });
  const fr = {px:40,py:20,pw:520,ph:340,x:[0,1],y:[0,1]}, rec = {badFrame:false,badData:false,heat:0,colorbar:0}, num = v => (typeof v==='number' && isFinite(v));
  const sample = (nx,ny,val) => { if(!val) return; for(const [i,j] of [[0,0],[nx-1,ny-1],[nx>>1,ny>>1]]) if(!num(val(i,j))) rec.badData=true; };   // a heatmap/image that feeds non-finite values renders black — flag it
  const g = { ctx, w:600, h:400, FS:1, _rec:rec, TH: globalThis.Plot.TH,
    frame(o){ o=o||{}; if(o.x&&(!num(o.x[0])||!num(o.x[1]))) rec.badFrame=true; if(o.y&&(!num(o.y[0])||!num(o.y[1]))) rec.badFrame=true; if(o.x)fr.x=o.x; if(o.y)fr.y=o.y; return g; },
    line:()=>g, band:()=>g, points:()=>g, marker:()=>g, arrow:()=>g, vline:()=>g, hline:()=>g, bars:()=>g, raster:()=>g, text:()=>g, legend:()=>g, flow:()=>g, note:()=>g, clip:()=>g, unclip:()=>g,
    heat(nx,ny,val){ rec.heat++; sample(nx,ny,val); return g; }, image(nx,ny,val){ sample(nx,ny,val); return g; }, colorbar(){ rec.colorbar++; return g; },
    graph(nodes, edges){ nodes=nodes||[]; for(const e of (edges||[])){ const a=nodes[e.from], b=nodes[e.to]; if(!a||!b||!num(a.x)||!num(a.y)||!num(b.x)||!num(b.y)) rec.badData=true; } for(const nd of nodes){ if(nd&&(!num(nd.x)||!num(nd.y))) rec.badData=true; } return g; },
    X(v){ return fr.px+(v-fr.x[0])/((fr.x[1]-fr.x[0])||1)*fr.pw; }, Y(v){ return fr.py+fr.ph*(1-(v-fr.y[0])/((fr.y[1]-fr.y[0])||1)); }, frameRect(){ return fr; } };
  return g;
}
console.log('\n--- view render (draws, finite axes, colorbar on heatmaps) ---');
for (const id of SIM.MODEL_ORDER) {
  const m = SIM.MODELS[id]; const p = {}; (m.params||[]).forEach(s => p[s.name] = s.default);
  let data; try { data = m.simulate(p, env('r-'+id)); } catch(e) { continue; }   // simulate-throw already reported above
  const specs = m.lenses ? Object.entries(m.lenses) : [['', m]];
  const drew=[], axis=[], cbar=[], dat=[];
  for (const [key, spec] of specs) {
    let stageList=null, length=1;
    try { stageList = spec.stages ? ((typeof spec.stages==='function')?spec.stages(p,data):spec.stages) : null; } catch(e){}
    if (stageList && stageList.length) length = stageList.length;
    else if (spec.anim) { try { const L = spec.anim.length(p,data); length = isFinite(L)?Math.max(1,Math.floor(L)):1; } catch(e){ length=1; } }
    const heads = stageList ? [0, length-1] : [0, length];
    (spec.views||[]).forEach((v, vi) => { const tag=(key?key+'/':'')+'v'+vi;
      for (const head of heads) { const g=stubG();
        const stage = stageList ? Math.min(length-1, Math.floor(head)) : null;
        const ui = { head, params:p, playing:false, frac:0, stage, stageKey:(stage!=null&&stageList)?stageList[stage].key:null, stages:stageList, nStages:stageList?stageList.length:1 };
        try { v.draw(g, data, ui); } catch(e){ if(!drew.find(f=>f.tag===tag)) drew.push({tag,msg:e.message}); }
        if (g._rec.badFrame && !axis.includes(tag)) axis.push(tag);
        if (g._rec.badData && !dat.includes(tag)) dat.push(tag);
        if (g._rec.heat>0 && g._rec.colorbar===0 && !cbar.includes(tag)) cbar.push(tag);
      } });
  }
  const good = !drew.length && !axis.length && !cbar.length && !dat.length;
  console.log(`  ${m.name.padEnd(28)}[${ok(good)}]`+(drew.length?`  threw: ${drew.map(f=>f.tag).join(',')}`:'')+(axis.length?`  non-finite axis: ${axis.join(',')}`:'')+(dat.length?`  non-finite heatmap/image data: ${dat.join(',')}`:'')+(cbar.length?`  heatmap w/o colorbar: ${cbar.join(',')}`:''));
  drew.forEach(f => console.log('    '+f.tag+': '+f.msg));
}

// ---- parameter property pass: simulate() returns finite data at each parameter's MIN and MAX,
//      not just defaults — catches NaN/throws at a slider extreme (e.g. zero drift, tiny dt). ----
console.log('\n--- parameter extremes (simulate stays finite at each slider min/max) ---');
const allFinite = (v, depth=0) => {   // scan returned data for a non-finite number (bounded: ≤3000 per array level, depth ≤6)
  if (typeof v === 'number') return isFinite(v);
  if (depth > 6) return true;
  if (Array.isArray(v) || ArrayBuffer.isView(v)) { const n=Math.min(v.length,3000); for (let i=0;i<n;i++) if (!allFinite(v[i], depth+1)) return false; return true; }
  if (v && typeof v === 'object') { for (const k in v) if (!allFinite(v[k], depth+1)) return false; return true; }   // recurse into the returned object's fields (models return an object, so this is the live path)
  return true;   // strings / functions / null: skip
};
for (const id of SIM.MODEL_ORDER) {
  const m = SIM.MODELS[id]; const base = {}; (m.params||[]).forEach(s => base[s.name] = s.default);
  const bad = [];
  for (const s of (m.params||[])) {
    let vals;   // extremes to probe, per control type
    if (s.type==='enum') vals = [0, (s.options?.length||1)-1];
    else if (s.type==='bool') vals = [false, true];
    else if (typeof s.min==='number' && typeof s.max==='number') vals = [s.min, s.max];
    else continue;
    for (const v of vals) { const p = { ...base, [s.name]: v };
      try { const d = m.simulate(p, env('p-'+id+'-'+s.name+v));
        if(!d || typeof d!=='object') bad.push(`${s.name}=${v}(no data)`);
        else if(!allFinite(d)) bad.push(`${s.name}=${v}(non-finite data)`); }
      catch(e){ bad.push(`${s.name}=${v}: ${e.message}`); }
    }
  }
  console.log(`  ${m.name.padEnd(28)}[${ok(!bad.length)}]`+(bad.length?'  '+bad.slice(0,3).join(' | '):''));
}

// Bayesian observer: reliability weight in (0,1); estimate lies between measurement & prior mean
{
  const m = SIM.MODELS.bayes, p = {}; m.params.forEach(s => p[s.name] = s.default);
  const d = m.simulate(p, env('bayes'));
  const between = (d.muPost - p.mu0) * (d.m - d.muPost) >= -1e-9;   // μ̂ between μ0 and m
  console.log(`\n  Bayesian: w=${d.w.toFixed(3)} (0<w<1) · θ̂ between m and μ₀   [${ok(d.w>0 && d.w<1 && between)}]`);
}

// Drift-diffusion: error rate near the closed form 1/(1+e^{2Az/c²}) (Euler-biased but close)
{
  const m = SIM.MODELS.ddm, p = {}; m.params.forEach(s => p[s.name] = s.default); p.dt = 0.005; p.nTrials = 40000;
  const d = m.simulate(p, env('ddm'));
  let cor = 0, err = 0; for (let k = 0; k < d.n; k++){ if (d.out[k]===1) cor++; else if (d.out[k]===2) err++; }
  const ER = err/(cor+err), th = 1/(1+Math.exp(2*p.A*p.z/(p.c*p.c)));
  console.log(`  DDM: sim ER=${(100*ER).toFixed(2)}%  theory=${(100*th).toFixed(2)}%   [${ok(Math.abs(ER-th)/th < 0.12)}]`);
}

// Early-vision: a high-contrast, low-noise grating decodes back to its true orientation (circular error small)
{
  const m = SIM.MODELS.vision, p = {}; m.params.forEach(s => p[s.name] = s.default); p.contrast = 1; p.noise = 0.02;
  let worst = 0; for (const th of [20, 60, 110, 150]) { const d = m.simulate({ ...p, ori: th }, env('vis'+th));
    const e = Math.abs(((d.dec - th + 90) % 180) - 90); if (e > worst) worst = e; }
  console.log(`  vision: worst orientation decode error = ${worst.toFixed(1)}° (clean grating)   [${ok(worst < 25)}]`);
}

// LIF neuron: the f–I curve is monotonic and fires above rheobase, silent at I=0
{
  const m = SIM.MODELS.lif, p = {}; m.params.forEach(s => p[s.name] = s.default);
  const d = m.simulate(p, env('lif'));
  const mono = d.fI.every((q,i)=> i===0 || q[1] >= d.fI[i-1][1] - 1e-9), silent = d.fI[0][1] === 0, hi = d.fI[d.fI.length-1][1];
  console.log(`  LIF: f–I monotonic & fires above rheobase (0→${hi.toFixed(0)} Hz, silent at I=0=${silent})   [${ok(mono && silent && hi > 5)}]`);
}

// Rescorla–Wagner: the value TRACKS the reward probability (single-point V is exponentially-weighted
// and noisy, so check the time-average of V over the second half, which converges to p)
{
  const m = SIM.MODELS.rl, p = {}; m.params.forEach(s => p[s.name] = s.default); p.nTrials = 300; p.alpha = 0.12;
  const d = m.simulate(p, env('rl'));
  let s = 0, c = 0; for (let t = Math.floor(d.n/2); t <= d.n; t++) { s += d.V[t]; c++; }
  const meanV = s/c;
  console.log(`  RW: time-averaged V → reward prob (mean=${meanV.toFixed(2)} vs p=${d.pRew})   [${ok(Math.abs(meanV - d.pRew) < 0.1)}]`);
}

// Decision comparison: both models reduce to chance with no signal; DDM accuracy is monotonic in the bound
{
  const m = SIM.MODELS.compare, p = {}; m.params.forEach(s => p[s.name] = s.default);
  const z0 = m.simulate({ ...p, A: 0 }, env('cmp0'));
  const chance = Math.abs(z0.accD - 0.5) < 1e-6 && Math.abs(z0.accS - 0.5) < 1e-6;
  const d = m.simulate(p, env('cmp'));
  const mono = d.satDDM.every((q,i)=> i===0 || q[1] >= d.satDDM[i-1][1] - 1e-9);   // accuracy ↑ with the bound
  let inb = true; for (const v of d.grid) if (v < 0.5 - 1e-6 || v > 1 + 1e-6) inb = false;   // metric=0 → accuracy in [0.5,1]
  console.log(`  compare: chance@A=0 [${ok(chance)}]   DDM accuracy monotonic in bound [${ok(mono)}]   accuracy heatmap∈[0.5,1] [${ok(inb)}]`);
}

// Attractor network: strong + coherence drives pool 1 to win (winner-take-all), and a decision is reached
{
  const m = SIM.MODELS.attractor, p = {}; m.params.forEach(s => p[s.name] = s.default);
  let win1 = 0, decided = 0; for (let k = 0; k < 8; k++) { const d = m.simulate({ ...p, coh: 25 }, env('att'+k)); if (d.decT > 0) decided++; if (d.win === 1) win1++; }
  console.log(`  attractor: pool 1 wins at +25% coh ${win1}/8, decided ${decided}/8   [${ok(win1 >= 6 && decided >= 6)}]`);
}

// Spatial SIR: epidemic threshold at R0=1 — below it the outbreak fizzles, above it a real peak; sweep is monotonic
{
  const m = SIM.MODELS.sir, p = {}; m.params.forEach(s => p[s.name] = s.default);
  const d = m.simulate(p, env('sir'));
  const below = d.sweep.find(q => q[0] <= 0.8), above = d.sweep[d.sweep.length-1];
  const mono = d.sweep.every((q,i)=> i===0 || q[1] >= d.sweep[i-1][1] - 1e-6);
  console.log(`  SIR: peak below R₀=1 = ${(below[1]*100).toFixed(1)}% « above = ${(above[1]*100).toFixed(0)}%; threshold monotonic [${ok(below[1] < 0.02 && above[1] > 0.2 && mono && d.peakI > 0.05)}]`);
}

// Efficient-coding observer: BLS & MAP estimates are finite and inside the stimulus range; bias/discriminability curves exist
{
  const m = SIM.MODELS.efficient, p = {}; m.params.forEach(s => p[s.name] = s.default);
  const d = m.simulate(p, env('eff'));
  const sane = isFinite(d.estBLS) && isFinite(d.estMAP) && d.estBLS>=d.lo && d.estBLS<=d.hi && d.estMAP>=d.lo && d.estMAP<=d.hi && d.bias.length>0 && d.disc.length>0;
  console.log(`  efficient: BLS/MAP estimates finite ∈[${d.lo},${d.hi}] (BLS=${d.estBLS.toFixed(2)}); bias & discriminability curves present   [${ok(sane)}]`);
}

// Causal inference: the ventriloquism bias is N-shaped — it peaks at intermediate disparity, then RELEASES (segregates) at large disparity
{
  const m = SIM.MODELS.causal, p = {}; m.params.forEach(s => p[s.name] = s.default);
  const d = m.simulate(p, env('ci'));
  const mags = d.biasV.map(b => Math.abs(b[1])), maxMag = Math.max(...mags), endMag = mags[mags.length-1];
  const nShape = maxMag > 1e-3 && endMag < maxMag*0.9 && d.biasV.every(b => isFinite(b[1]));   // bias largest mid-disparity, smaller at the extreme (capture then release)
  console.log(`  causal: ventriloquism bias peaks mid-disparity then releases (max=${maxMag.toFixed(2)}, |end|=${endMag.toFixed(2)})   [${ok(nShape)}]`);
}

// Working memory: with a target-dominated mixture, reports CLUSTER at the target far above the uniform-guess rate
{
  const m = SIM.MODELS.wm, p = {}; m.params.forEach(s => p[s.name] = s.default);
  const d = m.simulate(p, env('wm'));
  const wrap = x => { x=(x+Math.PI)%(2*Math.PI); if(x<0)x+=2*Math.PI; return x-Math.PI; };
  let C=0,S=0, finite=true; for (let k=0;k<d.errs.length;k++){ if(!isFinite(d.errs[k]))finite=false; const e=wrap(d.errs[k]-d.target); C+=Math.cos(e); S+=Math.sin(e); }
  const R = Math.hypot(C,S)/d.errs.length;   // circular resultant toward the target; uniform guessing → R≈0, a target-dominated mixture → R well above 0
  console.log(`  wm: reports concentrate toward target (resultant R=${R.toFixed(2)} » ~0 uniform)   [${ok(finite && R>0.15)}]`);
}

// Hopfield: at low load a corrupted cue is recalled (final overlap≈1); recall accuracy falls with load (capacity)
{
  const m = SIM.MODELS.hopfield, p = {}; m.params.forEach(s => p[s.name] = s.default);
  const d = m.simulate(p, env('hop'));
  const recalled = d.finalOv > 0.9, lowLoadOk = d.sweep[0][1] >= 0.8, falls = d.sweep[d.sweep.length-1][1] <= d.sweep[0][1];
  console.log(`  hopfield: cue recalled (overlap=${d.finalOv.toFixed(2)}); accuracy ${(d.sweep[0][1]*100).toFixed(0)}% at low load → ${(d.sweep[d.sweep.length-1][1]*100).toFixed(0)}% at high load   [${ok(recalled && lowLoadOk && falls)}]`);
}

// Kuramoto: synchrony (order parameter r) rises with coupling K — incoherent at K=0, synchronised at high K
{
  const m = SIM.MODELS.kuramoto, p = {}; m.params.forEach(s => p[s.name] = s.default);
  const d = m.simulate(p, env('kur'));
  const lowK = d.sweep[0][1], hiK = d.sweep[d.sweep.length-1][1], rises = hiK > lowK + 0.3;
  console.log(`  kuramoto: synchrony rises with coupling (r=${lowK.toFixed(2)} at K=0 → ${hiK.toFixed(2)} at K=8; K_c≈${d.Kc.toFixed(2)})   [${ok(lowK<0.5 && hiK>0.6 && rises)}]`);
}

// Belief tracking: the belief concentrates below the uniform prior, and tracking error grows with observation noise
{
  const m = SIM.MODELS.belief, p = {}; m.params.forEach(s => p[s.name] = s.default);
  const d = m.simulate(p, env('bel'));
  let he=0,c=0; for (let t=Math.floor(d.nF/2);t<d.nF;t++){ he+=d.entropy[t]; c++; } const meanH=he/c;
  const concentrates = meanH < d.Huniform*0.85, errRises = d.sweep[d.sweep.length-1][1] > d.sweep[0][1] + 0.3;
  console.log(`  belief: concentrates below uniform (H=${meanH.toFixed(2)} < ${d.Huniform.toFixed(2)}); tracking error rises with noise (${d.sweep[0][1].toFixed(1)} → ${d.sweep[d.sweep.length-1][1].toFixed(1)})   [${ok(concentrates && errRises)}]`);
}

// Ring attractor: a localized bump persists after the cue and holds the cued location (population vector ≈ cue)
{
  const m = SIM.MODELS.ring, p = {}; m.params.forEach(s => p[s.name] = s.default);
  const d = m.simulate(p, env('ring'));
  const decLast = ((d.dec[d.nF-1]%360)+360)%360, dd = Math.abs(decLast - d.cue), decErr = Math.min(dd, 360-dd);
  const bump = d.amp > 0.5 && d.width > 0.02 && d.width < 0.6, holds = decErr < 25;
  console.log(`  ring: localized bump persists (amp=${d.amp.toFixed(2)}, width=${(d.width*100).toFixed(0)}% of ring) and holds the cue (decoded ${decLast.toFixed(0)}° vs ${d.cue}°)   [${ok(bump && holds)}]`);
}

// Retina→V1: the V1 complex-cell tuning decodes the stimulus orientation; the surround changes the output
{
  const m = SIM.MODELS.retina, p = {}; m.params.forEach(s => p[s.name] = s.default);
  const d = m.simulate(p, env('ret'));
  const dd = Math.abs(d.dec - d.ori), decErr = Math.min(dd, 180-dd), ys = d.sweep.map(q=>q[1]), effect = Math.max(...ys) - Math.min(...ys);
  console.log(`  retina: V1 tuning decodes orientation (${d.dec.toFixed(0)}° vs ${d.ori}°); surround changes output contrast (Δ=${effect.toFixed(3)})   [${ok(decErr<25 && effect>1e-3)}]`);
}

// Causal graph: do(X) recovers the true causal effect; the observed slope is inflated by confounding; the gap grows with confounding
{
  const m = SIM.MODELS.causalg, p = {}; m.params.forEach(s => p[s.name] = s.default);
  const d = m.simulate(p, env('cg'));
  const doMatches = Math.abs(d.doSlope - d.causal) < 0.15, confounded = d.obsSlope > d.causal + 0.15, sweepRises = d.sweep[d.sweep.length-1][1] > d.sweep[0][1] + 0.1;
  console.log(`  causal-graph: do(X) recovers the effect (do=${d.doSlope.toFixed(2)} ≈ ${d.causal.toFixed(2)}); observed inflated to ${d.obsSlope.toFixed(2)} by confounding   [${ok(doMatches && confounded && sweepRises)}]`);
}

// Self-attention: each attention row is a softmax (sums to 1); sharpness — entropy rises with temperature
{
  const m = SIM.MODELS.attention, p = {}; m.params.forEach(s => p[s.name] = s.default);
  const d = m.simulate(p, env('attn'));
  const rowsum1 = d.attn.every(r => Math.abs(r.reduce((a,b)=>a+b,0)-1) < 1e-9);
  const sharpens = d.sweep[0][1] < 0.6 && d.sweep[d.sweep.length-1][1] > d.sweep[0][1] + 0.2;
  console.log(`  attention: rows are softmax (sum=1) [${ok(rowsum1)}]; entropy rises with temperature (${d.sweep[0][1].toFixed(2)} → ${d.sweep[d.sweep.length-1][1].toFixed(2)}) [${ok(sharpens)}]`);
}

// POMDP (tiger): the value-iteration policy is open-left | listen | open-right; a less accurate ear widens the listen region
{
  const m = SIM.MODELS.pomdp, p = {}; m.params.forEach(s => p[s.name] = s.default);
  const d = m.simulate(p, env('pom'));
  const ends = d.pol[0]===1 && d.pol[d.N-1]===2, listensMid = d.pol[Math.floor(d.N/2)]===0, hasListen = d.listenFrac>0.05 && d.listenFrac<0.999;
  const widens = d.sweep[d.sweep.length-1][1] > d.sweep[0][1] + 0.05;   // bigger penalty → wider listen region
  console.log(`  pomdp: policy open-left|listen|open-right (listen ${(d.listenFrac*100).toFixed(0)}% of beliefs); a bigger penalty widens it (${(d.sweep[0][1]*100).toFixed(0)}% → ${(d.sweep[d.sweep.length-1][1]*100).toFixed(0)}%)   [${ok(ends && listensMid && hasListen && widens)}]`);
}

// Wilson-Cowan E/I: a limit cycle at default drive, born at a Hopf bifurcation (flat below a critical drive, oscillating above)
{
  const m = SIM.MODELS.wilson, p = {}; m.params.forEach(s => p[s.name] = s.default);
  const d = m.simulate(p, env('wc'));
  const osc = d.amp > 0.1, lowFlat = d.sweep[0][1] < 0.05, highOsc = d.sweep[d.sweep.length-1][1] > 0.3;
  console.log(`  wilson-cowan: limit cycle at default (amp=${d.amp.toFixed(2)}); Hopf bifurcation in drive (P=0: ${d.sweep[0][1].toFixed(2)} → P=3: ${d.sweep[d.sweep.length-1][1].toFixed(2)})   [${ok(osc && lowFlat && highOsc)}]`);
}

// Multi-head attention: each head's rows are a softmax; the heads route differently; entropy rises with temperature
{
  const m = SIM.MODELS.mha, p = {}; m.params.forEach(s => p[s.name] = s.default);
  const d = m.simulate(p, env('mha'));
  const rows1 = d.heads.every(M => M.every(r => Math.abs(r.reduce((a,b)=>a+b,0)-1) < 1e-9));
  let differ=false; for(let i=0;i<d.N;i++) for(let j=0;j<d.N;j++) if(Math.abs(d.heads[0][i][j]-d.heads[1][i][j])>0.15) differ=true;
  const sharpens = d.sweep[0][1] < d.sweep[d.sweep.length-1][1] - 0.2;
  console.log(`  mha: ${d.H} heads, rows softmax [${ok(rows1)}]; heads route differently [${ok(differ)}]; entropy rises with temp [${ok(sharpens)}]`);
}

// Soft enforcement: every model SHOULD carry an analytic check tied to its science (the generic loop
// above only proves it ran). Warn for any model without a dedicated check here — add one (see gui-qc.md §1).
{
  const checked = new Set(['bayes','ddm','compare','attractor','sir','vision','lif','rl','efficient','causal','wm','hopfield','kuramoto','belief','ring','retina','causalg','attention','pomdp','wilson','mha']);   // models with an analytic check above
  const missing = SIM.MODEL_ORDER.filter(id => !checked.has(id));
  if (missing.length) console.log(`\n  \x1b[33m⚠ no analytic check: ${missing.join(', ')} — add one to validate.mjs (see gui-qc.md §1)\x1b[0m`);
}

// ---- reusable library modules/mslib.js: each block is sane (loaded above) ----
console.log('\n=== mslib.js building blocks ===\n');
try {
  const L = globalThis.MSLIB, g = () => { let u = Math.random() || 1e-9; return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*Math.random()); }, U = () => Math.random();
  const fam = ['sde','bayes','neuron','decision','rl','psy','efficient','causal','wm','network','osc','belief','vision','attn'].every(k => L[k]);
  const wgt = L.bayes.weight(0.9, 1);
  const fi = L.neuron.fI((s,I,dt)=>L.neuron.lifStep(s,I,null,dt), ()=>({v:-65,refr:0}), [0.1,0.3,0.6,1.0], 1e-4, 1.0);
  const mono = fi.every((p,i)=>i===0||p.rate>=fi[i-1].rate) && fi[3].rate>fi[0].rate;
  let s={S1:0.1,S2:0.1,In1:0,In2:0}, r; for (let k=0;k<3000;k++) r=L.decision.wwStep(s,{coh:25.6},0.0005,g);
  let V=0; for (let t=0;t<200;t++) V=L.rl.rescorlaWagner(V,1,0.1);
  const pm = L.psy.psychometric(-2,{mu:0,sigma:1}) < L.psy.psychometric(2,{mu:0,sigma:1});
  const sdOk = Math.abs(L.psy.sdt(0.84,0.16).dprime - 2) < 0.2;
  console.log(`  families present [${ok(fam)}]   bayes weight∈(0,1) [${ok(wgt>0&&wgt<1)}]   LIF f-I monotonic [${ok(mono)}]`);
  console.log(`  Wong-Wang unit1 wins @ +coh [${ok(r.r1>r.r2)}]   Rescorla-Wagner converges [${ok(Math.abs(V-1)<0.01)}]   psychometric monotonic [${ok(pm)}]   SDT sensitivity [${ok(sdOk)}]`);
  // efficient coding: consistent zero-noise decode, discriminability ∝ 1/p (tails>peak), skewed likelihood (tail away from prior peak)
  const xs=L.bayes.linspace(-4,4,241), npd=(x,m,sd)=>Math.exp(-0.5*((x-m)/sd)*((x-m)/sd))/(sd*Math.sqrt(2*Math.PI)), pri=Array.from(xs,x=>npd(x,0,1)), F=L.efficient.cdf(xs,pri);
  const decok = Math.abs(L.efficient.decode(L.efficient.encode(1.2,xs,F),1e-3,xs,F,pri,'BLS')-1.2)<0.05;
  const dsc=L.efficient.discrim(xs,pri), dscok = dsc[20]>dsc[120] && dsc[220]>dsc[120];
  const lk=L.efficient.likelihood(L.efficient.encode(1,xs,F),0.12,xs,F); let z=0,mean=0,mode=0,md=-1; for(let i=0;i<xs.length;i++){ z+=lk[i]; mean+=lk[i]*xs[i]; if(lk[i]>md){md=lk[i];mode=xs[i];} } mean/=z;
  console.log(`  efficient: zero-noise decode≈θ [${ok(decok)}]   D∝1/p tails>peak [${ok(dscok)}]   likelihood skewed off peak [${ok(mean>mode)}]`);
  // causal: MLE shrinks variance, p(C=1) higher when cues agree, number-game size principle
  const mle=L.causal.cueCombineMLE([1,3],[0.5,1]), mleok=mle.variance<0.25;
  const agree=L.causal.ciPosteriorCommon(0.1,-0.1,2,9,12,0.3)>L.causal.ciPosteriorCommon(10,-10,2,9,12,0.3);
  const H=L.causal.numberGameHypotheses(100), pst=L.causal.conceptPosterior(H,[2,4,8,16]); let iP=-1,iE=-1; H.forEach((h,i)=>{ if(h.name==='powers 2')iP=i; if(h.name==='even')iE=i; });
  console.log(`  causal: MLE var<min single [${ok(mleok)}]   p(C=1) agree>disagree [${ok(agree)}]   size principle powers>even [${ok(pst[iP]>pst[iE])}]`);
  // working memory: I0(0)=1, κ→SD monotone, von Mises sampler mean≈μ, mixture target proportion≈pT
  const i0=Math.abs(L.wm.besselI0(0)-1)<1e-9, sdm=L.wm.kappaToSD(2)>L.wm.kappaToSD(20);
  let sx=0,sy=0; for(let i=0;i<3000;i++){ const t=L.wm.vmSample(0.6,8,U); sx+=Math.cos(t); sy+=Math.sin(t); } const cmOk=Math.abs(Math.atan2(sy,sx)-0.6)<0.12;
  let nt=0,TT=5000; for(let i=0;i<TT;i++) if(L.wm.mixtureRecall({target:0,nontargets:[1.5,-1.5],kappa:10,pT:0.6,pSwap:0.25,pGuess:0.15},U).branch==='target') nt++;
  console.log(`  wm: I0(0)=1 [${ok(i0)}]   κ→SD decreasing [${ok(sdm)}]   vonMises mean≈μ [${ok(cmOk)}]   mixture target≈pT [${ok(Math.abs(nt/TT-0.6)<0.05)}]`);
  // network: Hopfield recalls a 1-bit-flipped cue; ring kernel has local excitation
  const pat8=[1,-1,1,-1,1,-1,1,-1], Wh=L.network.hopfieldStore([pat8],8); let sr=Int8Array.from(pat8); sr[0]=-sr[0]; L.network.hopfieldStep(Wh,sr,8,[0,1,2,3,4,5,6,7]); const recOK=L.network.overlap(Array.from(sr),pat8,8)>0.9;
  const Wr=L.network.ringKernel(16,8,1.3,0.3), ringOK=Wr[0]>Wr[8];
  // osc: identical phases → r≈1; evenly-spread phases → r≈0
  const oscOK=L.osc.kuramotoOrder([0.5,0.5,0.5,0.5]).r>0.99 && L.osc.kuramotoOrder([0,Math.PI/2,Math.PI,3*Math.PI/2]).r<0.05;
  // belief: predict/update renormalise, update concentrates on the likely state, entropy(certain)=0
  const bp=L.belief.predict([0,1,0,0],[[.5,.5,0,0],[0,.5,.5,0],[0,0,.5,.5],[.5,0,0,.5]]), bpOK=Math.abs(bp.reduce((a,b)=>a+b,0)-1)<1e-9;
  const bu=L.belief.update([.25,.25,.25,.25],[.1,.7,.1,.1]), buOK=Math.abs(bu.reduce((a,b)=>a+b,0)-1)<1e-9 && bu[1]>0.5 && L.belief.entropy([1,0,0,0])<1e-9;
  // vision: a balanced DoG (surround=1) is ~zero-sum (band-pass); a pure centre (surround=0) sums positive (low-pass)
  const dks=L.vision.dogKernel(1.5,4,1); let dsum=0; for(const v of dks.k) dsum+=v; const dc=L.vision.dogKernel(1.5,4,0); let csum=0; for(const v of dc.k) csum+=v; const dogOK=Math.abs(dsum)<0.15 && csum>0.5;
  console.log(`  network: Hopfield recall [${ok(recOK)}]  ring local-excitation [${ok(ringOK)}]   osc: sync vs incoherent r [${ok(oscOK)}]`);
  console.log(`  belief: predict/update normalise + concentrate [${ok(bpOK&&buOK)}]   vision: DoG band-pass≈0 vs low-pass>0 [${ok(dogOK)}]`);
  // attn: softmax sums to 1 and is monotone in logits; uniform attention has entropy ln(N)
  const sm=L.attn.softmax([1,2,3]), smOK=Math.abs(sm.reduce((a,b)=>a+b,0)-1)<1e-9 && sm[2]>sm[1] && sm[1]>sm[0], entU=Math.abs(L.attn.entropy([.25,.25,.25,.25])-Math.log(4))<1e-9;
  console.log(`  attn: softmax sums to 1 + monotone [${ok(smOK)}]   uniform entropy = ln(N) [${ok(entU)}]`);
} catch (e) { console.log('  ' + ok(false) + ' mslib failed: ' + e.message); }

console.log(`\n${fails===0 ? '\x1b[32m✓ ALL CHECKS PASSED\x1b[0m' : `\x1b[31m✗ ${fails} FAILED\x1b[0m`}\n`);
process.exit(fails===0 ? 0 : 1);
