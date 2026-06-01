---
name: model-scope
description: >-
  Build a self-contained web GUI that turns ANY parameterised model into an interactive
  explorer: move a slider per parameter (or flip a condition) and watch the simulation
  result update live, shown in views the MODEL defines — there is NO fixed graphic or
  axis. A Bayesian observer draws prior/likelihood/posterior + a bias (central-tendency)
  curve + trial-to-trial prior updating; a neuron draws a V(t) trace + spike raster +
  f–I curve; a decision model animates an evidence trajectory + an RT histogram; a
  saccade model draws eye paths + a landing map; a POMDP draws belief evolution. USE THIS
  whenever the user wants a simulator / parameter explorer / "see how the result changes
  as I tune X" / "turn these equations into something I can play with" / a teaching demo
  for researchers — neuron models, Bayesian/ideal-observer models, drift-diffusion or
  other decision models, reinforcement learning, POMDP, saccade/oculomotor, population /
  epidemic / dynamical-systems, or any Monte-Carlo process. Also triggers on "modeling
  GUI", "interactive figure", "add a view", "change the plot", "make it animate".
---

# model-scope — interactive model explorers (any model, any view)

## What you build, and the one idea

A single-page app for researchers: a **control rail** (a slider per parameter, generated
from a schema) and a **grid of views**. Moving any control re-runs the model and redraws
the views, so the researcher *sees how the result changes* — building intuition by play.

The crucial design decision: **the toolbox imposes no visualisation.** It does not assume
a trajectory, a histogram, or any particular axes. Each model declares its own `views`,
and each view draws *whatever is intuitive for that model* — distributions, tuning
curves, rasters, phase portraits, belief simplices, eye traces — using a small plotting
helper. The decision-model "evidence trajectory + RT histogram" is just *one* recipe.

Implement the model's math **exactly** as given (never re-derive from memory). Surface any
ambiguity instead of guessing. Aim for a clean instrument, not a dashboard.

## Architecture — 4 files, no build step

Copy the bundled template (`assets/template/`). It opens by double-clicking `index.html`
(or `python3 -m http.server`). All classic `<script>`s — no bundler, no `npm install`.

```
plot.js       a tiny canvas charting helper (window.Plot): frame({x,y,…}) sets up a
              view's OWN axes, then line/band/points/bars/heat/raster/vline/… draw in
              data coordinates. Theme- & devicePixelRatio-correct. You rarely edit it.
engine.js     pure math (window.SIM): RNG + the MODELS registry. NO DOM. Eval-able in
              Node so validate.mjs shares the same source. You mostly edit ONLY this.
index.html    the toolbox: builds sliders from each model's schema, runs simulate() on
              change, drives the optional playhead, and calls each view's draw().
validate.mjs  Node gate — every model's simulate() runs & is sane; analytic checks where
              one exists.
modules/mslib.js  OPTIONAL reusable model library (window.MSLIB): canonical building
              blocks (sde, bayes, neuron, decision/Wong–Wang, rl, psy). Include only if a
              model needs them; compose inside simulate(). See the modelbook below.
```

## The model contract — the one place you edit

Adding/altering a model = one declarative entry in `MODELS` (+ its id in `MODEL_ORDER`).
A model is pure (no DOM, no globals):

```js
mymodel: {
  id:'mymodel', name:'My model',
  blurb:'one plain-language sentence', note:'a key qualitative effect to point out',
  params: [ {name:'sigma', label:'Noise σ', min:0.1, max:3, step:0.01, default:1, unit?}, … ],
  // run the whole simulation for these parameters; return ANY data the views need.
  // env = { rng, seed, params } — rng is seeded from the seed field (reproducible).
  simulate: (p, env) => { /* compute curves, samples, fields, sequences… */ return data; },
  // one or more panels; each draws its own axes & graphics via g (see plot.js).
  views: [
    { title:'…', draw:(g, data, ui) => {
        g.frame({ x:[lo,hi], y:[lo,hi], xlabel, ylabel, title });   // YOUR axes
        g.line(pts); g.band(pts); g.bars(hist); g.vline(x); g.heat(...); g.raster(...);
        // ui = { head, playing, params } — read ui.head for sequential animation
    }},
  ],
  // OPTIONAL: makes the model sequential → the toolbox shows play/scrub + a playhead.
  anim: { length:(p,data)=> N },     // continuous: head runs 0..N; views read ui.head
  // OPTIONAL (instead of anim): PROCESS MODE — step through the model's internal pipeline.
  stages: (p,data)=> [ {key,name,about}, … ],  // ◀ ▶ stepper; views read ui.stage/ui.stageKey
}
```

Why this shape:
- **`simulate` returns whatever you want.** Distributions, a tuning curve, sampled
  trajectories, a 2-D field, a trial-by-trial sequence — the views interpret it. This is
  what removes the fixed-graphic constraint.
- **`views` own their axes.** `g.frame(...)` is per-view; one view can be a probability
  density on a stimulus axis, the next an estimate-vs-true curve, the next a heatmap.
- **`anim` is optional.** Static models (a tuning curve that just depends on params)
  need none — they redraw on slider change. Sequential models (trial-by-trial learning,
  an accumulating histogram, a spike train) declare `anim.length`; the toolbox provides a
  playhead `ui.head ∈ [0,length]`, play/pause, fast-forward, scrub, and a speed control.
  Views decide what `head` means (a trial index, a time, an iteration).
- **`stages` is the process-mode alternative.** When the point is to *see each computation
  in sequence* (a Bayesian observer: stimulus → encoding → measurement → likelihood →
  posterior → estimate; a causal-inference observer: cues → likelihoods → causal posterior →
  estimates), declare `stages` instead of `anim`. The toolbox turns the playhead into a
  discrete **◀ ▶ stepper** with a stage-named readout; views read `ui.stage`/`ui.stageKey`
  and progressively reveal each stage, and `g.flow(ui.stages, ui.stage)` draws the pipeline
  strip. See `references/plotting.md` ("Process pipeline") and the modelbook process examples.

## Reproducible & instant simulation

Use the seedable RNG; for trial-based models seed each trial as `trialRng(seed, k) =
makeRNG(seed + '#' + k)` so trial *k* is reproducible from `k` (the player can jump to it)
and the whole batch recomputes deterministically and fast. `gaussian(rng)`, `makeRNG`,
`npdf` (normal pdf) ship in `engine.js`. Keep `simulate` fast enough to run on every
slider move (chunk only for very large batches).

## The plotting helper `g`

Load `references/plotting.md` for the full API and view recipes. In one line: call
`g.frame({x,y,xlabel,ylabel,title})` to define this view's axes, then draw with
`g.line / g.band / g.points / g.marker / g.bars / g.heat / g.raster / g.vline / g.hline /
g.text / g.legend / g.note / g.flow` (`g.flow` = a process-pipeline strip for `stages`
models). `g.X(v)`/`g.Y(v)` map data→pixels if you need raw `g.ctx`.
`Plot.histify(values, bins, lo, hi, quant?)` bins data (snap bin width to a multiple of
`quant` such as `dt` to avoid comb artifacts). It's a small, plain helper — extend it
freely (add a contour, a violin, a vector field) rather than fighting it.

## Recipes (reach for the one that fits the model)

`references/plotting.md` has worked snippets for each:
- **Distributions & inference** (Bayesian/ideal observer): prior/likelihood/posterior as
  bands+lines on a stimulus axis; markers at θ, m, θ̂.
- **Tuning / transfer curves** (bias/central-tendency, f–I, psychometric): a curve vs an
  identity or baseline, with a ±SD ribbon; sweep a parameter and watch it deform.
- **Animated trajectory + accumulating histogram** (decision / first-passage): `anim`
  over trials; one view regenerates the current trial's path (`ui.head`), another bins the
  outcomes of completed trials.
- **Spike raster + trace** (neurons): a `V(t)` line + `g.raster(spikeRowsPerTrial)`.
- **Heatmap / phase field** (2-D dynamical, energy landscape, belief simplex): `g.heat`
  with a colormap; for an energy landscape, integrate the noise-free drift into a
  potential and **rank-equalise** the colour (yellow = low/attractor, blue = high) so a
  strong tilt doesn't wash out the structure.
- **Sequence / learning** (RL value, POMDP belief, prior update): plot the quantity vs
  iteration up to `ui.head`.

These compose — a model can mix static curves and an animated view in the same grid.

## Theme & legibility

Light, eye-friendly (off-white page, muted non-fluorescent colours, no glow); the helper
already enforces it and is DPR-correct. Give each view a clear title, axis labels, and
units. Let views breathe — the grid auto-fits; 1–4 views is typical.

## Model families — the modelbook

Don't invent a model from scratch when a canonical family fits. `references/modelbook/`
is a curated, extensible catalogue distilled from open-source comp-neuro ecosystems
(Acerbi lab observer/fitting, Wang lab decision circuits, Gardner lab psychophysics,
Brian2 / Neuronal Dynamics neurons). Read `references/modelbook/INDEX.md` to pick a
family, then its file for canonical equations, parameters + meaning, recommended views,
and the matching `MSLIB` code module:

- **bayesian-observer** — perception / magnitude & time estimation, central tendency,
  prior learning (`MSLIB.bayes`; fit with Acerbi's PyBADS/PyVBMC/IBS).
- **efficient-coding** — prior-shaped encoding, repulsive/anti-Bayesian bias, bias↔
  discriminability, decision-conditioned estimation (`MSLIB.efficient`; Wei&Stocker, Luu&Stocker).
- **causal-inference** — cue combination, multisensory fusion / ventriloquism, concept
  learning (`MSLIB.causal`; Ernst&Banks, Körding, Tenenbaum).
- **working-memory** — continuous report, precision/capacity, swap errors, von Mises mixtures
  (`MSLIB.wm`; Zhang&Luck, Bays&Husain, MemToolbox).
- **decision-circuits** — DDM, leaky competing accumulators, Wong–Wang reduced circuit
  (`MSLIB.decision`, `MSLIB.sde`).
- **spiking-neurons** — LIF / EIF / Izhikevich / HH, f–I curves, rasters (`MSLIB.neuron`).
- **reinforcement-learning** — Rescorla–Wagner, Q-softmax, Kalman/volatility (`MSLIB.rl`).
- **psychophysics** — psychometric functions, SDT, scalar timing (`MSLIB.psy`).

Treat these as starting skeletons, not prescriptions — adapt to the user's exact
equations, and compose the small `MSLIB` functions rather than copying a whole repo
(don't overfit to one paper's parameterisation). Adding a family = a new `MSLIB`
sub-object + a `modelbook/<family>.md` + an INDEX row (see INDEX.md's "Adding a family").

## Validation

`validate.mjs` reuses `engine.js` (and sanity-checks `modules/mslib.js`). Minimum gate: each model's `simulate()` runs without
throwing and returns data, and every view is a function. Add a per-model analytic check
where one exists (Bayesian reliability weight in (0,1); decision-model error rate vs the
closed form; a known limit). `node validate.mjs` must pass before declaring done.

## How to start

1. **Scaffold**: copy `assets/template/` (or run `/model-scope:scaffold <dir>`). It runs,
   with five worked examples spanning both idioms — *continuous* anim (a Bayesian observer
   with prior updating; a drift-diffusion decision with an RT histogram) and *process mode*
   `stages` (an efficient-coding observer, a causal-inference observer, and a working-memory
   mixture model that each step through their pipeline).
2. **Add the model**: pin the equations/parameters, then write ONE `MODELS` entry — its
   `params`, a `simulate` that returns the data the model is about, and a `views` list
   that draws what's intuitive. Add `anim` only if it's sequential.
3. **Connect to the science**: in `blurb`/`note` and labels, relate parameters to what
   they mean for the researcher (a stimulus/condition, a noise source, a learning rate, a
   gain), so moving a slider tells a story.
4. **Validate** (`node validate.mjs`) and **open** `index.html`.

The `model-gui-builder` agent can take a model description end-to-end.
