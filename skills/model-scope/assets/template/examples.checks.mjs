/* =============================================================================
 * examples.checks.mjs — the analytic checks for the worked examples in examples.js.
 *
 * validate.mjs imports `<script>.checks.mjs` for every script index.html loads, when that
 * file exists. The default export is a table keyed by MODEL ID; a check runs only when a
 * model with that id is registered, so deleting an example never turns the gate red.
 *
 * Each check is a function of a small toolkit `t`:
 *   t.sim(id, overrides, seed)   run that model's simulate() at defaults + overrides (batch:false)
 *   t.def(id)                    its default parameters
 *   t.ok(condition, text)        record one PASS / FAIL line
 *   t.rel(a, b)                  relative difference |a−b| / |b|
 *   t.SIM, t.Plot, t.L           the engine, the plot helper, and MSLIB (modules/mslib.js)
 *   t.env(seed)                  a fresh { rng, seed, params, batch:false }
 * A good check ties the model to its science: a closed form, a conservation law, a limit,
 * or an independent re-computation. "The output is finite" is not a check.
 * ========================================================================== */
export default {
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
