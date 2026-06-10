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
| [bayesian-observer.md](bayesian-observer.md) | Bayesian / ideal observer | perception, magnitude & time estimation, central tendency, prior learning | `bayes` |
| [efficient-coding.md](efficient-coding.md) | Efficient coding & sequential observers | prior-shaped encoding, repulsive/anti-Bayesian bias, bias↔discriminability, decision-conditioned estimation | `efficient`, `bayes` |
| [causal-inference.md](causal-inference.md) | Causal inference & Bayesian cognition | multisensory fusion, ventriloquism, cue combination, concept learning | `causal` |
| [working-memory.md](working-memory.md) | Working memory & mixture models | continuous report, precision/capacity, swap errors, von Mises mixtures | `wm` |
| [decision-circuits.md](decision-circuits.md) | Evidence accumulation & attractor decision | 2AFC decisions, RT distributions, speed–accuracy, winner-take-all | `decision`, `sde` |
| [spiking-neurons.md](spiking-neurons.md) | Single-neuron & small networks | membrane dynamics, f–I curves, spike trains, gain | `neuron` |
| [reinforcement-learning.md](reinforcement-learning.md) | Learning & belief update | value learning, choice, volatility, prior updating | `rl` |
| [psychophysics.md](psychophysics.md) | Psychometrics & detection | psychometric curves, SDT, thresholds, scalar timing | `psy` |
| [network.md](network.md) | Recurrent networks & plasticity | associative memory, attractor dynamics, Hebbian learning, capacity, connectivity | `network` |
| [oscillation.md](oscillation.md) | Oscillations & synchronization | coupled oscillators, phase-locking, neural-mass rhythms, sync transitions | `osc` |
| [belief-tracking.md](belief-tracking.md) | Belief tracking & partial observability | Bayes filters / HMMs, belief evolution, volatility, the filtering core of POMDPs | `belief` |
| [vision.md](vision.md) | Vision & layered sensory | image input, oriented-energy / DoG / CNN stacks, receptive fields, tuning | `vision` (+ inline) |
| [causal-graph.md](causal-graph.md) | Causal graphs & interventions | structural causal models / DAGs, the do-operator, confounding, backdoor paths, treatment effects | (inline) |
| [transformer.md](transformer.md) | Attention & transformers | self-attention, content-based routing, the attention matrix, temperature/heads, soft connectivity | `attn` |

Several families ship as **process-mode** worked examples (a `stages` pipeline you step
through): efficient-coding, causal-inference, and working-memory each render their internal
computation stage by stage. See [../architecture.md](../architecture.md) ("Process mode").

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
- **Stocker lab & Wei Ji Ma lab** — efficient-coding observers and the canonical Bayesian
  pipeline: `lingqiz/speed-prior-2021`, `cpc-lab-stocker/{Self-consistent-model,
  adapt-discr-efficient-code,conditioned-versus-full-inference}`; Ma–Kording–Goldreich
  *Bayesian Models of Perception and Action* (cns.nyu.edu/malab/bayesianbook.html).
- **Körding & Shams labs** — Bayesian causal inference: `evans1112/bcitoolbox` (Python),
  `multisensoryperceptionlab/BCIT` (MATLAB), `lacerbi/visvest-causinf`. **Tenenbaum / ProbMods**
  (probmods.org) for discrete-hypothesis Bayesian cognition.
- **Bays lab & MemToolbox** — working-memory mixture models: `visionlab/MemToolbox`,
  paulbays.com/toolbox, `JimGrange/mixtur`, `eddjberry/mixturer`.
- **Brian2** (`brian-team/brian2`), **Neuronal Dynamics** (Gerstner et al.), **Neuromatch
  Academy**: canonical LIF / EIF / Izhikevich / Hodgkin–Huxley / Wilson–Cowan references.

## Adding a family (keep it modular, non-overfit)

1. Add a small pure sub-object to `MSLIB` (e.g. `MSLIB.network = {...}`) — functions that
   take randomness as a `g` argument, no globals. Nothing else in the library couples to it.
2. Add a `modelbook/<family>.md` with the six sections above and a row in this table.
3. (Optional) add a worked example model to the template's `engine.js` registry.

The whole point is breadth without bloat: the toolbox stays tiny; knowledge accretes here.
