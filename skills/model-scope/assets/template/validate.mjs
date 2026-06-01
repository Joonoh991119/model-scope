/* =============================================================================
 * validate.mjs — checks each model's simulate() runs and is sane, reusing engine.js.
 *   Run:  node validate.mjs
 * The toolbox imposes no fixed output shape, so the gate is: simulate() returns data
 * without throwing, every view is a function, and a per-model analytic check holds.
 * ========================================================================== */
import fs from 'node:fs';
// plot.js touches `document`/canvas; engine.js only needs it lazily inside views, so
// stub the browser globals it references at module scope, then load engine.
globalThis.window = globalThis; globalThis.devicePixelRatio = 1;
(0, eval)(fs.readFileSync(new URL('./engine.js', import.meta.url), 'utf8'));
const SIM = globalThis.SIM;

let fails = 0; const ok = b => (b ? '\x1b[32mPASS\x1b[0m' : (fails++, '\x1b[31mFAIL\x1b[0m'));
const env = (seed) => ({ rng: SIM.makeRNG(seed), seed, params: {} });

console.log('\n=== model-scope template models ===\n');

// every model: simulate runs, returns an object, and has ≥1 view function
for (const id of SIM.MODEL_ORDER) {
  const m = SIM.MODELS[id]; const p = {}; (m.params||[]).forEach(s => p[s.name] = s.default);
  let data, threw = null; try { data = m.simulate(p, env('v-'+id)); } catch (e) { threw = e; }
  const viewsOk = Array.isArray(m.views) && m.views.length >= 1 && m.views.every(v => typeof v.draw === 'function');
  console.log(`  ${m.name.padEnd(28)} simulate=${threw?'\x1b[31mthrew\x1b[0m':'ok'}  views=${m.views.length}  [${ok(!threw && data && viewsOk)}]`);
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

// ---- optional reusable library: modules/mslib.js loads & each block is sane ----
console.log('\n=== mslib.js building blocks ===\n');
try {
  (0, eval)(fs.readFileSync(new URL('./modules/mslib.js', import.meta.url), 'utf8'));
  const L = globalThis.MSLIB, g = () => { let u = Math.random() || 1e-9; return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*Math.random()); };
  const fam = ['sde','bayes','neuron','decision','rl','psy'].every(k => L[k]);
  const wgt = L.bayes.weight(0.9, 1);
  const fi = L.neuron.fI((s,I,dt)=>L.neuron.lifStep(s,I,null,dt), ()=>({v:-65,refr:0}), [0.1,0.3,0.6,1.0], 1e-4, 1.0);
  const mono = fi.every((p,i)=>i===0||p.rate>=fi[i-1].rate) && fi[3].rate>fi[0].rate;
  let s={S1:0.1,S2:0.1,In1:0,In2:0}, r; for (let k=0;k<3000;k++) r=L.decision.wwStep(s,{coh:25.6},0.0005,g);
  let V=0; for (let t=0;t<200;t++) V=L.rl.rescorlaWagner(V,1,0.1);
  const pm = L.psy.psychometric(-2,{mu:0,sigma:1}) < L.psy.psychometric(2,{mu:0,sigma:1});
  const sdOk = Math.abs(L.psy.sdt(0.84,0.16).dprime - 2) < 0.2;
  console.log(`  families present [${ok(fam)}]   bayes weight∈(0,1) [${ok(wgt>0&&wgt<1)}]   LIF f-I monotonic [${ok(mono)}]`);
  console.log(`  Wong-Wang unit1 wins @ +coh [${ok(r.r1>r.r2)}]   Rescorla-Wagner converges [${ok(Math.abs(V-1)<0.01)}]   psychometric monotonic [${ok(pm)}]   SDT sensitivity [${ok(sdOk)}]`);
} catch (e) { console.log('  ' + ok(false) + ' mslib failed: ' + e.message); }

console.log(`\n${fails===0 ? '\x1b[32m✓ ALL CHECKS PASSED\x1b[0m' : `\x1b[31m✗ ${fails} FAILED\x1b[0m`}\n`);
process.exit(fails===0 ? 0 : 1);
