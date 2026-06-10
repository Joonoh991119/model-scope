# Belief tracking & partial observability

**Reach for it when** the agent never sees the world state directly, only noisy/partial
observations, and must maintain a **belief** (a distribution over the hidden state) — Bayesian
filtering, HMMs, Kalman/volatility tracking, change-point and hazard-rate inference, and the
*filtering* core of POMDPs. **Show the structure first** (the hidden states, the transition,
the observation model), then the belief evolving, then how noise/volatility shape it.

> Two shipped exemplars span the spectrum: `belief` is pure **tracking/filtering** (a discrete Bayes
> filter), while `pomdp` adds **control** — actions, rewards, and value iteration over the belief (the
> Tiger problem), giving an optimal listen/open policy over the belief simplex.

## Canonical forms

- **Discrete Bayes filter / HMM forward** (template exemplar `belief`). Belief b over S states;
  each step **predict** `b⁻(s′) = Σ_s T(s′|s) b(s)` (diffuse through the transition), then
  **correct** `b(s′) ∝ P(obs|s′) b⁻(s′)` (multiply by the observation likelihood, renormalise).
  Belief sharpens with informative observations and spreads with noise or fast state diffusion.
- **Kalman filter / volatility** (compose from `bayes`; `MSLIB.rl.kalman` exists) — continuous
  Gaussian belief (mean + variance) for a drifting scalar; volatility sets the learning rate.

## Parameters (meaning + typical ranges)

- `obsNoise` observation noise σ — low ⇒ sharp belief & accurate tracking; high ⇒ blurry belief.
- `vol` state volatility (transition diffusion) — fast drift ⇒ the belief can never fully sharpen.

## Angles (structure first)

1. **Structure** — the hidden states, the transition kernel, and the observation likelihood.
2. **Belief** — the belief distribution evolving over time (a state×time trajectory with the
   true hidden state overlaid), and the belief vs the true state and the observation at each step.
3. **Compare** — tracking error (or belief entropy) vs observation noise or volatility.

## MSLIB (`belief`)

`predict(b, T)` propagate through transition T; `update(b, lik)` multiply by P(obs|state) and
renormalise; `entropy(b)` belief uncertainty. For Gaussian belief, compose with `bayes`.

## Sources

Rabiner 1989 (HMMs); Thrun–Burgard–Fox *Probabilistic Robotics* (Bayes/Kalman filters); Behrens
et al. 2007 (volatility learning); Kaelbling–Littman–Cassandra 1998 (POMDPs, for the control extension).
