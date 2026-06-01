/* =============================================================================
 * validate.mjs — correctness gate, reusing engine.js (no duplicated math).
 *   Run:  node validate.mjs
 *
 * 1. Shape test — every model runs, produces valid outcomes, and reports
 *    non-responses (never crashes / drops).
 * 2. Closed-form test — the biased random walk converges to the drift-diffusion
 *    first-passage formulae as dt → 0 (the pattern for "validate where a closed
 *    form exists"; Euler boundary overshoot is O(√dt)).
 * ========================================================================== */
import fs from 'node:fs';
const code = fs.readFileSync(new URL('./engine.js', import.meta.url), 'utf8');
(0, eval)(code);
const SIM = globalThis.SIM;

let fails = 0;
const ok = (b) => (b ? '\x1b[32mPASS\x1b[0m' : (fails++, '\x1b[31mFAIL\x1b[0m'));
const pct = (x) => (100 * x).toFixed(2) + '%';
const trialRng = (seed, k) => SIM.makeRNG(seed + '#' + k);

function batch(model, p, opts, N, seed) {
  let counts = [0, 0, 0], sum = [0, 0, 0];   // index 0 = non-response
  for (let k = 0; k < N; k++) {
    const r = SIM.runTrialFast(model, p, opts, trialRng(seed, k));
    counts[r.outcome]++; if (r.outcome) sum[r.outcome] += r.measure;
  }
  return { counts, sum };
}

console.log('\n=== 1. Shape test (every model runs & resolves sanely) ===\n');
const cases = {
  walk:     { A:1, c:1, B:1, x0:0 },
  logistic: { r:1.2, K:1, c:0.09, x0:0.1 },
  compete:  { I1:4, I2:3, c:0.4, k:6, w:6, Z:0.5 },
};
for (const id of SIM.MODEL_ORDER) {
  const m = SIM.MODELS[id], r = batch(m, cases[id], { dt:0.005, tMax:30 }, 20000, 'shape-'+id);
  const dec = r.counts[1] + r.counts[2];
  const rate1 = dec ? r.counts[1] / dec : NaN;          // expected (outcome 1) should dominate
  const valid = dec > 0 && rate1 >= 0.5;
  console.log(`  ${m.name.padEnd(28)} outcome1=${pct(rate1).padStart(7)}  non-resp=${String(r.counts[0]).padStart(5)}  [${ok(valid)}]`);
}

console.log('\n=== 2. Closed form — random walk → drift-diffusion (Eqs. 8/9) ===\n');
const A=1, c=1, B=1;
const ER_th = 1/(1+Math.exp(2*A*B/(c*c))), DT_th = (B/A)*Math.tanh(A*B/(c*c));
console.log(`  theory:  P(−B) = ${pct(ER_th)}   mean first-passage = ${DT_th.toFixed(4)}\n   dt      P(−B)     T̄        |dER|    |dT|`);
console.log('  ' + '-'.repeat(46));
let last;
for (const dt of [0.02, 0.005, 0.001, 0.0003]) {
  const N = dt <= 0.001 ? 120000 : 60000;
  const r = batch(SIM.MODELS.walk, {A,c,B,x0:0}, {dt, tMax:60}, N, 'cf-'+dt);
  const dec = r.counts[1] + r.counts[2], ER = r.counts[2]/dec, T = (r.sum[1]+r.sum[2])/dec;
  const dER = Math.abs(ER-ER_th)/ER_th, dT = Math.abs(T-DT_th)/DT_th;
  console.log(`  ${dt.toString().padEnd(7)} ${pct(ER).padStart(7)} ${T.toFixed(4).padStart(8)} ${pct(dER).padStart(7)} ${pct(dT).padStart(7)}`);
  last = { dER, dT };
}
console.log('  ' + '-'.repeat(46));
console.log(`  [${ok(last.dER < 0.04)}] P(−B) within 4% at finest dt   (Euler O(√dt) bias → 0)`);
console.log(`  [${ok(last.dT  < 0.04)}] mean first-passage within 4%`);

console.log(`\n${fails===0 ? '\x1b[32m✓ ALL CHECKS PASSED\x1b[0m' : `\x1b[31m✗ ${fails} FAILED\x1b[0m`}\n`);
process.exit(fails===0 ? 0 : 1);
