# Causal inference, cue combination & Bayesian cognition

**Use for:** multisensory integration, the ventriloquist effect, "do these signals share a
cause?", reliability-weighted cue fusion, and discrete-hypothesis Bayesian cognition
(concept learning). All reduce to one **5-stage pipeline** — *data → hypotheses → likelihoods
→ posterior → combine/predict* — which makes them natural **process-mode** (`stages`) models.
The template's `causal` model is a worked instance.

## Maximum-likelihood cue combination (Ernst & Banks 2002)
Forced fusion: cues are always combined, weighted by reliability.
- `w_i = (1/σ_i²) / Σ_j(1/σ_j²)`, `ŝ = Σ_i w_i x_i`, `1/σ_comb² = Σ_i 1/σ_i²`.
- Key facts to show: `σ_comb ≤ min σ_i` (fusion never hurts); the reliable cue dominates.
- This is the `p_common = 1` limit of causal inference below.

## Bayesian causal inference (Körding, Beierholm, Ma, Quartz, Tenenbaum & Shams 2007)
Infer **whether** two cues `x_v, x_a` share a cause, with prior `p(C=1)=p_common` and a
Gaussian spatial prior `N(μ_p, σ_p²)`. Gaussian closed forms (verify vs `bcitoolbox`):
```
common  p(x|C=1) = exp(-0.5[ (xv-xa)²σp² + (xv-μp)²σa² + (xa-μp)²σv² ] / D) / (2π√D),
        D = σv²σa² + σv²σp² + σa²σp²
separate p(x|C=2) = exp(-0.5[ (xv-μp)²/(σv²+σp²) + (xa-μp)²/(σa²+σp²) ]) / (2π√((σv²+σp²)(σa²+σp²)))
posterior p(C=1|x) = p(x|C=1)p_common / [ p(x|C=1)p_common + p(x|C=2)(1-p_common) ]
fused   ŝ_C1 = (xv/σv² + xa/σa² + μp/σp²)/(1/σv²+1/σa²+1/σp²)
segregated ŝ_v = (xv/σv² + μp/σp²)/(1/σv²+1/σp²)        (ŝ_a symmetric)
```
Three decision strategies → final estimate: **averaging** `ŝ = p(C=1)ŝ_C1 + (1-p(C=1))ŝ_seg`
(main result), **selection** (winner-take-all at 0.5), **probability matching** (sample with
`p(C=1)`; the only stage that needs RNG; Wozny et al. 2010). Signature output: the **N-shaped
bias** of `ŝ_v − s_v` vs disparity (ventriloquism then break-away).

## Bayesian concept learning — the "number game" (Tenenbaum 2000)
Discrete hypotheses `h` over 1..N (rules + intervals), all-positive examples `X`:
- **Size principle:** `p(X|h) = (1/|h|)^n` if every `x∈h` else 0 — smaller sets win
  exponentially fast (the "suspicious coincidence": {2,4,8,16} ⇒ powers-of-2 ≫ even).
- `p(h|X) ∝ p(X|h)p(h)`; **generalization** `p(y∈C|X) = Σ_{h∋y} p(h|X)` — the bumpy gradient.
This is "average the per-hypothesis answer weighted by its posterior" — the same stage-5
operation as CI averaging, over a different hypothesis type (Tenenbaum, Kemp, Griffiths &
Goodman 2011: cognition as Bayesian inference / sampling over structured hypotheses).

## Parameters (meaning · typical)
- `σ_v, σ_a` cue noises — *modality reliabilities* (e.g. vision 2°, audition 9°).
- `σ_p, μ_p` spatial prior — *central bias* (σ_p≈12°, μ_p=0).
- `p_common` — *prior tendency to bind* (Körding fit ≈0.28; 0.05–0.95).
- strategy (average/select/match); (number game) hypothesis space, prior, #examples `n`.

## Process pipeline (stages) & recommended views
1. **cues** arrive (2-D cue plane; diagonal = common-cause ridge); 2. **likelihoods** common
vs separate (bars / 2-D blobs); 3. **causal posterior** p(C=1|x) (a gauge); 4. **branch
estimates** fused vs segregated on the spatial axis; 5. **combine** → final estimate + the
N-shaped bias curve. (Number game: examples → hypothesis lattice+prior → size-principle
likelihood bars → posterior → generalization gradient.)

## Code (`MSLIB.causal`)
```js
const m = MSLIB.causal.cueCombineMLE([xv,xa], [sv,sa]);          // {estimate,variance,weights}
const pC = MSLIB.causal.ciPosteriorCommon(xv,xa,sv,sa,sp,pc);    // p(C=1|x)
const r  = MSLIB.causal.ciEstimate(xv,xa,sv,sa,sp,pc,{strategy:'average', g:()=>rng()});
// r = {pCommon, sFused, sSegV, sSegA, sHatV, sHatA}
const H  = MSLIB.causal.numberGameHypotheses(100);              // number game
const post = MSLIB.causal.conceptPosterior(H, [2,4,8,16]);
const gen  = MSLIB.causal.generalizationCurve(H, post, 100);    // p(y∈C|X) for y=1..100
```

## Sources
Ernst & Banks 2002 *Nature* (MLE; no author repo — it's the `p_common=1` limit of the CI
repos) · Körding et al. 2007 *PLoS ONE*; Wozny et al. 2010 *PLoS Comp Biol*; Zhu, Beierholm &
Shams 2024 (`evans1112/bcitoolbox` Python; `multisensoryperceptionlab/BCIT` MATLAB;
`lacerbi/visvest-causinf` MIT) · Tenenbaum 2000 *NIPS*, Tenenbaum & Griffiths 2001 *BBS*,
Tenenbaum, Kemp, Griffiths & Goodman 2011 *Science* (ProbMods, probmods.org). *(The CI Gaussian
closed forms are rendered as images in PLoS; the forms above are the standard appendix result —
validate numerically against `bcitoolbox`.)*
