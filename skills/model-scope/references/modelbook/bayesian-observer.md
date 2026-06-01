# Bayesian / ideal observer

**Use for:** perception and estimation tasks where an observer infers a latent stimulus θ
from a noisy internal measurement m — magnitude & **duration/time** estimation, cue
combination, orientation/spatial perception, central-tendency (regression-to-the-mean)
biases, prior learning.

**See also:** [efficient-coding.md](efficient-coding.md) when the *encoding* is shaped by the
prior (repulsive/anti-Bayesian bias, bias↔discriminability, decision-conditioned estimation);
[causal-inference.md](causal-inference.md) for cue combination & multisensory fusion.

## Canonical form (Gaussian, generalises)
- Encoding / likelihood: `m | θ ~ N(θ, σ_m²)`. Sensory noise σ_m may be **constant**,
  **Weber-scaled** `σ_m = w_f·θ` (magnitude/time), or set by **efficient coding** (Fisher
  information ∝ prior²; Wei & Stocker 2015 — noise smaller where the prior is dense).
- Prior: `p(θ) = N(μ₀, σ₀²)` (or any shape — skew matters for bias).
- Posterior (Gaussian–Gaussian): `N(μ_post, σ_post²)`, with
  `σ_post² = 1/(1/σ_m² + 1/σ₀²)`, `μ_post = σ_post²(m/σ_m² + μ₀/σ₀²)`.
- Estimator under a loss: **BLS** = posterior mean (L2), **MAP** (0/1 loss), **MLE** (no
  prior). For Gaussians BLS = MAP; for skewed priors they differ — that difference *is* a
  testable signature.
- Key result: `θ̂ = w·m + (1−w)·μ₀`, `w = σ₀²/(σ₀²+σ_m²)` ⇒ estimates **regress toward the
  prior** (central tendency), more so when σ_m is large. `E[θ̂|θ] = wθ+(1−w)μ₀`, `SD = w·σ_m`.
- Trial-to-trial prior update: track the environment, e.g. `μ₀ ← (1−α)μ₀ + α·m` (delta) or
  full sequential Bayes.

## Parameters (meaning · typical range)
- `σ_m` sensory/internal noise — *task difficulty / stimulus reliability* (0.1–2.5).
- `μ₀, σ₀` prior mean & width — *expectation / stimulus statistics the observer learned*.
- `w_f` Weber fraction (if Weber noise) — *scalar variability* (0.05–0.3; time perception).
- `α` prior learning rate — *adaptation speed* (0–0.4).
- loss/estimator choice (BLS / MAP / MLE) — *the readout rule*.

## Recommended views
1. **Inference on one trial** — prior, likelihood, posterior on the stimulus axis; markers
   at θ, m, θ̂. (`g.band`+`g.line`+`g.vline`.)
2. **Estimate vs. true** — `E[θ̂|θ]` curve vs the identity, ±SD ribbon; sweep σ_m to watch
   the central-tendency bias grow.
3. **Bias / variability** — `E[θ̂|θ]−θ` and `SD[θ̂|θ]` vs θ (the matched-bias/SD plot).
4. (sequential) **prior updating** — μ₀ over trials → environment mean (`anim`).

## Code (`MSLIB.bayes`)
```js
const post = MSLIB.bayes.gaussPosterior(m, sigma_m, mu0, sigma0);   // {mu, sigma}
const w    = MSLIB.bayes.weight(sigma_m, sigma0);
const curve= MSLIB.bayes.centralTendency(thetaGrid, sigma_m, sigma0 /* via */, mu0, sigma0);
const sm   = MSLIB.bayes.weberNoise(theta, w_f);                    // Weber-scaled noise
const tr   = MSLIB.bayes.trial(theta, sigma_m, mu0, sigma0, ()=>SIM.gaussian(rng));
```
The template's `bayes` model is a worked instance (inference + estimate curve + prior
update). For skewed priors / non-Gaussian likelihoods, do the posterior numerically on a
grid (normalise `prior·likelihood`) and take the mean/mode.

## Fit to data (beyond exploration)
When you want parameters fit to behaviour: maximise the likelihood with **PyBADS**
(`acerbilab/pybads`); get posteriors/model comparison with **PyVBMC** (`acerbilab/pyvbmc`);
for *simulator-only* likelihoods use **inverse binomial sampling** (`acerbilab/pyibs`).

## Sources
Acerbi lab (acerbilab) · Wei & Stocker 2015 (efficient coding) · Körding & Wolpert 2004 ·
Jazayeri & Shadlen 2010 (Bayesian time) · Petzschner et al. 2015 (central tendency).
