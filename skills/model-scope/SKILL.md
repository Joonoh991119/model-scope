---
name: model-scope
description: >-
  Build a self-contained, schema-driven web GUI that visualises ANY parameterised
  stochastic or dynamical model trial-by-trial — watch one trial's trajectory
  accumulate from t=0, drop a count into the outcome histogram when it resolves,
  repeat n times to build the distribution, with a slider for every parameter and
  optional 2-D phase-plane + energy-landscape views. USE THIS whenever the user wants
  to "see what happens each trial", explore/tune a model by adjusting parameters, turn
  equations into an interactive simulator, reproduce a modeling-paper figure
  interactively, or build a visualiser for a drift-diffusion / race / accumulator /
  random-walk / population / epidemic (SIR) / predator-prey / integrate-and-fire /
  Monte-Carlo model. NOT only DDM — any model with state that evolves and yields an
  outcome. Also triggers on "modeling GUI", "simulator", "parameter explorer",
  "trajectory + histogram", and follow-ups like "add my model", "change the dynamics",
  "make it a 2-D phase plane".
---

# model-scope — interactive trial-by-trial model GUIs

## What you are building (and why this shape)

A single-page app where the user picks a model, moves a slider per parameter, and sees
two linked things:

1. **This trial** — one trial's state trajectory drawn *as it evolves* from t = 0 until
   it resolves (crosses a threshold / reaches an absorbing state / times out).
2. **The histogram** — when a trial resolves, **one count drops into the outcome
   histogram**; repeat the trial *n* times and that histogram *is* the model's
   prediction (a response-time / first-passage / outcome distribution).

This "watch the process, then watch the distribution it produces" framing is the whole
point: it makes the link between micro-dynamics and macro-statistics visible, and it
lets the user *feel* how each parameter reshapes both. It applies far beyond decision
models — anything you can write as "state, a rule to step it with noise, and a condition
that ends the trial" fits.

**Do not over-build.** The win is a clean instrument, not a dashboard. Implement the
model's math *exactly* as given (never re-derive from memory); surface ambiguity instead
of guessing.

## The architecture — 3 files, no build step

Copy the bundled template (`assets/template/`) as the starting scaffold. It is
deliberately tiny and dependency-free so it opens by double-clicking `index.html`.

```
engine.js     pure math — RNG, MODELS registry, one-step integrator, trial runners.
              NO DOM. Loads as a classic <script> (works from file://) AND is
              eval-able in Node, so the UI and the test share one source of truth.
index.html    the UI — builds all controls from each model's parameter schema, runs
              the trial-by-trial player, and renders trajectory + histogram on <canvas>.
validate.mjs  Node harness — re-uses engine.js to check each model (closed form where
              one exists, otherwise shape/sanity + any analytic limits).
```

Why no framework / no build: a researcher should be able to open it offline, read it,
and edit one registry entry. Classic scripts (not ES modules) load from `file://`;
modules do not.

## The model registry — the one place you edit

Adding or changing a model = editing one declarative entry in `MODELS` (in `engine.js`).
The GUI (sliders, labels, plots, stats) is **generated from this schema** — never
hand-wire controls. Each model is a set of *pure* functions (no globals, no DOM):

```js
mymodel: {
  id: 'mymodel', name: 'My model', dim: 1,            // dim 1 → x(t); dim 2 → (y1,y2)
  blurb: 'one plain-language sentence',
  note:  'a qualitative prediction or limiting case to surface in the UI',
  params: [ { name:'A', label:'Drift', min:0, max:3, step:0.01, default:1, unit:'' }, … ],
  outcomes: [ { key:'up', label:'upper', color:'pos' },                 // 1 or 2 categories
              { key:'dn', label:'lower', color:'neg' } ],
  init:  (p, rng) => ({ t:0, x:p.x0 }),               // fresh trial state (may draw rng)
  step:  (s, p, dt, rng) => { s.x += p.A*dt + p.c*Math.sqrt(dt)*gaussian(rng); s.t+=dt; },
  done:  (s, p) => (s.x>=p.B ? 1 : s.x<=-p.B ? 2 : 0),// 0 = ongoing; else 1-based outcome
  fields:(s) => [s.x],                                // plotted variables: [x] or [y1,y2]
  // optional:
  measure:(s,p) => s.t,                               // scalar binned per trial (default t)
  guides: (p) => [ {v:p.B}, {v:-p.B} ],               // 1-D reference/threshold lines
  yRange: (p) => [-p.B*1.4, p.B*1.4],                 // 1-D vertical range (else inferred)
  derived:(p) => [ {label:'λ = …', value:…, tag:'…'} ],            // read-only computed display
  fieldState:(p,y1,y2) => ({t:0,y1,y2,/*hidden vars at quasi-steady-state*/}),  // 2-D landscape
}
```

Contract notes (the *why*):
- **`done` returns a 1-based outcome index, `0` = not yet.** Trials that never resolve
  before `tMax` are **non-responses** — count and report them, never silently drop them
  (some regimes genuinely don't terminate). Keep ≤ 2 outcome categories for the built-in
  mirrored histogram; >2 needs a small rendering tweak (see `references/rendering.md`).
- **`measure`** is the scalar the histogram accumulates — default is the trial time
  (first-passage / decision time), but it can be a final value, a count, anything.
- **`step` is one Euler–Maruyama step.** Noise enters as `c·dW` with `dW = √dt·N(0,1)`
  (per-step SD `c·√dt`). Compute all increments from the *old* state (simultaneous
  update) for multi-variable models. Cap trials at `tMax/dt` steps.

## Simulation core — reproducible, instant, addressable

Use a **seedable RNG** and seed **each trial independently**: `trialRng(seed, k) =
makeRNG(seed + '#' + k)`. Why per-trial sub-seeds rather than one stream:
- trial *k* is reproducible from `k` alone → the scrubber can jump to any trial, and the
  "this trial" view regenerates the exact path on demand;
- recomputing all *n* trials is deterministic and effectively instant, so changing a
  parameter just re-runs from trial 1 with no caching machinery.

`gaussian(rng)` = Box–Muller (consumes 2 uniforms). `makeRNG(str)` = hash → mulberry32.
The template ships both. A trial runner steps `init → step…step` until `done` ≠ 0 or the
step cap, returning `{outcome, measure, path}`.

## The trial-by-trial player — the signature UX

This is what makes it a *scope* and not a static plot. Implement it as the template does:

- A **transport bar**: ⏮ restart (clear histogram) · ▶/⏸ · ⏭ fast-forward (complete all
  *n* → final histogram) · a **trial scrubber** (jump to "after k trials" + show trial
  *k*'s trajectory) · a **speed** slider (integration steps drawn per frame: low to watch
  one trial, high to fill fast).
- Each animation frame advances the current trial's trajectory; when it resolves, the
  matching histogram **bin grows by one** (a brief highlight sells the link); then the
  next trial starts.
- **Fix the histogram's axes once** (from the full result set: x to a high percentile of
  `measure`, y to the final peak count) so bars *grow into place* instead of rescaling —
  the right-skew and the fill-up read clearly.

See `references/rendering.md` for the player loop, fixed-axis binning, and the light
canvas theme.

## Rendering — read it, don't decorate it

Load `references/rendering.md` before writing UI. The essentials: a **light, eye-friendly**
theme (white-ish background, muted non-fluorescent colours, no neon glow); **device-pixel-ratio**
canvases so lines are crisp; **Δt-aligned histogram bins** (snap bin width to a multiple
of `dt`, else the dt-quantised measures comb); fixed axes; one accent + two outcome
colours, used consistently. Aim for an instrument, not an AI dashboard.

## 2-D dynamical models — phase plane + energy landscape

If `dim === 2`, also draw the `(y1,y2)` phase plane and — when the deterministic drift is
a **gradient field** (true for linearised competing-accumulator models) — an **energy
landscape** that shows *where the attractor sits*. Load `references/dynamical-2d.md` for
the full recipe: read the noise-free drift `F` generically from `step` (a zero-noise
rng), integrate the potential `V` (`F = −∇V`), classify the fixed point (well / line /
saddle) from the Jacobian, and paint a **rank-equalised** colour map with
**yellow = low energy (attractor/valley), blue = high (ridge)**. Rank-equalisation is
essential — plain min–max scaling lets a strong input tilt wash the structure to one
colour. For models without an attractor (uniform drift), say so rather than drawing a
misleading map.

## Validation harness

`validate.mjs` re-uses `engine.js` (no duplicated math). For every model assert it
*runs* and produces sane outcomes (the easier/expected outcome dominates; non-responses
counted). Where a closed form exists, check convergence to it as `dt → 0` and gate at a
stated tolerance (Euler boundary overshoot is `O(√dt)` — converges, doesn't vanish at
coarse dt). Where a known limit exists (e.g. "parameter X → reduces to model Y"), check
it. Run `node validate.mjs` before declaring done.

## How to start

1. **Scaffold**: copy `assets/template/` to the target folder (or run
   `/model-scope:scaffold <dir>`). It already runs, with three example models spanning
   1-D decision, 1-D population, and 2-D competition.
2. **Add the user's model**: write ONE `MODELS` entry from their equations + parameters.
   Pin down the exact equations first; implement them verbatim.
3. **Wire experiment meaning**: in `blurb`/`note` and the controls, connect parameters to
   what they mean (e.g. drift ↔ stimulus strength / coherence, noise ↔ sensory noise,
   threshold ↔ speed–accuracy caution, tMax ↔ deadline). An optional intro/guide overlay
   can hold a parameter↔concept table.
4. **Validate** (`node validate.mjs`) and **open** `index.html`.

## Generality — examples to reach for

The same three functions (`step`, `done`, `measure`) express, e.g.:
decision (drift-diffusion, race, leaky competing accumulators, feedforward, pooled
inhibition) · biased random walk / gambler's ruin · stochastic logistic or exponential
growth (time-to-establish vs extinction) · SIR epidemic (time-to-peak, final size) ·
predator–prey · integrate-and-fire neuron (first-spike latency) · queueing / birth–death
· any first-passage or Monte-Carlo experiment. If the user's model has hidden variables
(like a pooled inhibitory population), keep them in the state and only `fields` the ones
to plot; give `fieldState` a quasi-steady-state projection so the landscape still works.
