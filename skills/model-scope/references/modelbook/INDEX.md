# The modelbook — canonical model families for model-scope

A curated, **extensible** catalogue of computational-neuroscience / cognitive model
families, distilled from open-source ecosystems into the model-scope contract
(`params` + `simulate(p,env)→data` + `views[]`). Each family file gives: when to reach
for it, the canonical equations, parameters with their meaning + typical ranges, the
views that make it intuitive, a ready `MSLIB` code module, and source pointers.

**These are recipes, not prescriptions.** Use a family as a starting skeleton, then adapt
to the user's exact equations. Do not overfit to one paper's parameterisation — the
`MSLIB` building blocks (`modules/mslib.js`, shipped in the template) are small pure
functions you compose.

## Families

| File | Family | Use for | MSLIB |
|---|---|---|---|
| [bayesian-observer.md](bayesian-observer.md) | Bayesian / ideal observer | perception, magnitude & time estimation, cue combination, central tendency | `bayes` |
| [decision-circuits.md](decision-circuits.md) | Evidence accumulation & attractor decision | 2AFC decisions, RT distributions, speed–accuracy, winner-take-all | `decision`, `sde` |
| [spiking-neurons.md](spiking-neurons.md) | Single-neuron & small networks | membrane dynamics, f–I curves, spike trains, gain | `neuron` |
| [reinforcement-learning.md](reinforcement-learning.md) | Learning & belief update | value learning, choice, volatility, prior updating | `rl` |
| [psychophysics.md](psychophysics.md) | Psychometrics & detection | psychometric curves, SDT, thresholds, scalar timing | `psy` |

## The source ecosystems (for grounding & deeper reference)

- **Acerbi lab** — Bayesian observer modelling + black-box fitting: `acerbilab/pyvbmc`
  (posterior/model inference), `acerbilab/pybads` (robust optimisation for model fitting),
  `acerbilab/pyibs` (likelihoods for *simulator* models). Pair a model-scope simulator
  with these when you move from "explore" to "fit to data".
- **Wang lab** — `xjwanglab/wong-wang-2006`: the reduced two-variable decision circuit
  (self-excitation + effective inhibition + a nonlinear f–I). Also Gerstner's *Neuronal
  Dynamics* exercises (a worked Wong–Wang) and `brian-team/brian2` `examples/frompapers`.
- **Gardner lab** — `justingardner/mgl` + gru.stanford.edu: psychophysics tooling, the
  normalization model of attention (Reynolds–Heeger), pRF encoding, SDT.
- **Brian2** (`brian-team/brian2`), **Neuronal Dynamics** (Gerstner et al.), **Neuromatch
  Academy**: canonical LIF / EIF / Izhikevich / Hodgkin–Huxley / Wilson–Cowan references.

## Adding a family (keep it modular, non-overfit)

1. Add a small pure sub-object to `MSLIB` (e.g. `MSLIB.network = {...}`) — functions that
   take randomness as a `g` argument, no globals. Nothing else in the library couples to it.
2. Add a `modelbook/<family>.md` with the six sections above and a row in this table.
3. (Optional) add a worked example model to the template's `engine.js` registry.

The whole point is breadth without bloat: the toolbox stays tiny; knowledge accretes here.
