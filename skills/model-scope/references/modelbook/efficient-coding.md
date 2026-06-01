# Efficient coding & sequential Bayesian observers

**Use for:** perception/estimation where the *encoding itself* is shaped by the prior, the
characteristic **repulsive ("anti-Bayesian") biases** and the **bias↔discriminability law**
(Wei & Stocker), and **decision-conditioned / sequential** estimation where an early choice
biases the later estimate (Luu & Stocker). This is the advanced cousin of
[bayesian-observer.md](bayesian-observer.md) — read that first for the plain Gaussian case.

These models are the showcase for **process mode** (`stages`): render the pipeline
*stimulus → encoding → measurement → likelihood → prior → posterior → estimate → bias* and
step through it. The template's `efficient` model is a worked instance.

## The base pipeline (Ma, Kording & Goldreich 2023)

`θ ~ p(θ)` → measurement `m | θ ~ p(m|θ)` → likelihood `L(θ)=p(m|θ)` → posterior
`p(θ|m) ∝ p(m|θ)p(θ)` → estimate under a loss: **BLS** = posterior mean (L2), **MAP** = mode
(L0), median (L1). Do it on a grid (`MSLIB.bayes.linspace`/`gridPost`/`gridMean`/`gridMode`)
when the prior or likelihood is non-Gaussian. (PPCs — Ma, Beck, Latham & Pouget 2006 — give
the neural version: summing Poisson population activity multiplies likelihoods.)

## Efficient coding (Wei & Stocker 2015, 2017)

The prior reshapes the sensory code so resolution is spent where stimuli are common:
- **Fisher information ∝ prior²:** `J(θ) ∝ p(θ)²` (the 2017 text uses a square-root/density
  convention `p ∝ √J`; label the convention in any UI).
- **Encoding = prior CDF:** `F(θ) = ∫_{-∞}^{θ} p(χ)dχ` warps stimulus space; noise is
  **homogeneous in F-space**: `m̃ = F(θ) + η, η ~ N(0,σ²)`.
- **Skewed likelihood:** pulled back to θ-space `p(m̃|θ) ∝ N(F(θ); m̃, σ²)` is asymmetric, its
  long tail pointing **away** from the prior peak — this is the repulsion engine.
- **Estimator sets the sign:** BLS (mean) → net **repulsion** from the prior peak
  ("anti-Bayesian"); MAP → attraction. The net bias depends on loss × noise — *let the user
  sweep σ and flip the loss to see it.* The effect is small for a Gaussian prior, larger for
  a peaked/skewed one.
- **Discrimination threshold:** `D(θ) ∝ 1/√J ∝ 1/p(θ)` (Cramér–Rao) — *lowest* (discrimination
  best) where the prior is dense. (Wei & Stocker call this "discriminability"; it is the JND.)
- **Lawful relation (2017):** `b(θ) ∝ (D(θ)²)'` — bias is the derivative of squared
  discriminability. Present this + repulsion as verified; don't hard-code one BLS constant.

## Self-consistency / decision-conditioned estimation (Luu & Stocker 2018)

Two-stage: a categorical decision `Ĉ = argmax_C p(C|m)` is committed, then the estimate is the
mean of the posterior **truncated to the chosen side** of the boundary: zero the
boundary-violating half, renormalise, take the mean (`MSLIB.efficient.condMean`). Conditioning
pushes the estimate **away from the boundary** — post-decision bias / sequential dependence,
even with no new evidence. Toggle conditioned-vs-full to contrast (Qiu, Luu & Stocker 2020).

## Parameters (meaning · typical)
- `σ` sensory noise **in F-space** (0.02–0.5 of the unit CDF range) — *task difficulty*. Low σ
  + BLS = clearest repulsion.
- prior shape/width — *learned stimulus statistics*; narrower/peaked → stronger warp & bias.
- loss (BLS/MAP) — *the readout rule* (sets bias sign).
- `σ_motor`, `σ_mem`, category boundary, `p(C)` (self-consistency).

## Process pipeline (stages) & recommended views
1. **prior** p(θ); 2. **encoding** F(θ)=CDF — the *warped-axis nomogram* (θ↔F mapping) is the
signature view; 3. **measurement** m̃ in F-space; 4. **likelihood** (skewed) in θ-space; 5.
**posterior**; 6. **estimate** (mark BLS vs MAP); 7. **aggregate** → bias lobes `b(θ)` +
discriminability `D(θ)∝1/p`. For self-consistency the signature view is the **boundary-truncated
posterior** + a dual-branch (cw/ccw) bias curve.

## Code (`MSLIB.efficient`, `MSLIB.bayes` grid)
```js
const grid = MSLIB.bayes.linspace(-4,4,241);
const prior = Array.from(grid, x => SIM.npdf(x,0,priorSD));
const F = MSLIB.efficient.cdf(grid, prior);                       // encoding = prior CDF
const mt = MSLIB.efficient.measure(theta, sigma, grid, F, ()=>SIM.gaussian(rng));
const thetaHat = MSLIB.efficient.decode(mt, sigma, grid, F, prior, 'BLS');   // 'MAP' too
const bias = MSLIB.efficient.biasCurve(grid, sigma, F, prior, 'BLS', 200, ()=>SIM.gaussian(rng));
const D    = MSLIB.efficient.discrim(grid, prior);               // ∝ 1/p(θ)
// self-consistency: truncate the posterior to the decided side, then mean
const est  = MSLIB.efficient.condMean(post, grid, /*boundary*/0, /*side*/+1);
```
**Build curve arrays with `Array.from(grid, …)`, not `grid.map(…)`** — `grid` is a
`Float64Array` and typed-array `.map` coerces `[x,y]` pairs to `NaN`. Restrict the bias
display to the central region; near the grid edges the posterior mean is pulled inward (a
finite-support artifact, not the model).

## Sources
Ma, Kording & Goldreich 2023 *Bayesian Models of Perception and Action* (lab page
cns.nyu.edu/malab/bayesianbook.html; no canonical public repo — adjacent: `drbenvincent/
bayesian2afc`) · Wei & Stocker 2015 *Nat Neurosci*, 2017 *PNAS* (`lingqiz/speed-prior-2021`,
`cpc-lab-stocker/adapt-discr-efficient-code`, `lingqiz/orientation-encoding`; Ganguli &
Simoncelli 2014; Stocker & Simoncelli 2006) · Luu & Stocker 2018 *eLife*
(`cpc-lab-stocker/Self-consistent-model`), Qiu, Luu & Stocker 2020 *Psych Rev*
(`cpc-lab-stocker/conditioned-versus-full-inference`). *(NB the old `zlqzcc/*` repos are dead —
renamed to `lingqiz/*`.)* Fit with Acerbi's PyBADS/PyVBMC.
