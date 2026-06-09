/* =============================================================================
 * validate.mjs — checks each model's simulate() runs and is sane, reusing engine.js.
 *   Run:  node validate.mjs
 * The toolbox imposes no fixed output shape, so the gate is: simulate() returns data
 * without throwing, every view is a function, and a per-model analytic check holds.
 * ========================================================================== */
import fs from 'node:fs';
// plot.js touches `document`/canvas; engine.js only needs it lazily inside views, so
// stub the browser globals it references at module scope. Load mslib.js FIRST — the
// modelbook example models call MSLIB inside simulate() (mirrors index.html's <script> order).
globalThis.window = globalThis; globalThis.devicePixelRatio = 1;
(0, eval)(fs.readFileSync(new URL('./modules/mslib.js', import.meta.url), 'utf8'));
(0, eval)(fs.readFileSync(new URL('./engine.js', import.meta.url), 'utf8'));
const SIM = globalThis.SIM;

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

// Soft enforcement: every model SHOULD carry an analytic check tied to its science (the generic loop
// above only proves it ran). Warn for any model without a dedicated check here — add one (see gui-qc.md §1).
{
  const checked = new Set(['bayes','ddm','compare','attractor','sir','vision','lif','rl']);   // models with an analytic check above
  const missing = SIM.MODEL_ORDER.filter(id => !checked.has(id));
  if (missing.length) console.log(`\n  \x1b[33m⚠ no analytic check: ${missing.join(', ')} — add one to validate.mjs (see gui-qc.md §1)\x1b[0m`);
}

// ---- reusable library modules/mslib.js: each block is sane (loaded above) ----
console.log('\n=== mslib.js building blocks ===\n');
try {
  const L = globalThis.MSLIB, g = () => { let u = Math.random() || 1e-9; return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*Math.random()); }, U = () => Math.random();
  const fam = ['sde','bayes','neuron','decision','rl','psy','efficient','causal','wm'].every(k => L[k]);
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
} catch (e) { console.log('  ' + ok(false) + ' mslib failed: ' + e.message); }

console.log(`\n${fails===0 ? '\x1b[32m✓ ALL CHECKS PASSED\x1b[0m' : `\x1b[31m✗ ${fails} FAILED\x1b[0m`}\n`);
process.exit(fails===0 ? 0 : 1);
