---
name: model-scope
description: >-
  Build a self-contained web GUI that turns ANY parameterised model into an interactive
  explorer: move a slider per parameter (or flip a condition) and watch the simulation
  result update live, shown in views the MODEL defines — there is NO fixed graphic or
  axis. A Bayesian observer draws prior/likelihood/posterior + a bias (central-tendency)
  curve + trial-to-trial prior updating; a neuron draws a V(t) trace + spike raster +
  f–I curve; a decision model animates an evidence trajectory + an RT histogram; an
  attractor network draws its circuit then winner-take-all dynamics + an energy landscape;
  a spatial epidemic draws a space-time spread map. USE THIS
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

## The philosophy: replicate, illuminate from many angles, compare

The goal is **not** to pixel-match a paper's figures, and **not** to force every model into one
universal pipeline. It is to **replicate the model faithfully, illuminate it from the angles natural
to its class, and let the user compare** — by moving sliders and switching models — the qualitative
and quantitative differences the parameter and model choices produce.

- **Replicate** the model's equations as given; disclose any reduction honestly.
- **Show structure first** where there is structure — a network's connectivity, E/I and plasticity
  rule; a CNN's architecture — then how an input drives it.
- **Illuminate from the angles that fit the class.** A process/observer model: its measurement,
  likelihood and posterior, the per-trial input-to-output map, many-trial metrics (Var(θ), bias(θ),
  θ̂(θ)). A decision model: one trial accumulating to a bound, and RT/accuracy histograms by
  condition. A single neuron: short-window conductance/potential traces and the spike pattern. A
  network: single-cell and population activity, the representation across trials, attractor dynamics
  and energy landscape. (See `references/levels.md` for the per-class catalogue.)
- **Compare.** A parameter sweep drawn as coloured curves or a heatmap, and a model toggle, are the
  payoff — they reveal what changes and by how much.

Reproducing a specific figure is at most a *check*, never the point.

## Angles as first-class UI — `lenses`

A model declares its **angles** as **lenses**; the toolbox renders a lens switch and swaps the
active views + playhead per lens, over the **same `simulate()` data** (no recompute on switch). The
lens *keys/labels are free* — name them for the model's own angles:

- **Decision / dynamical / RL**: e.g. `step` (one update), `trial` (one trial), `simulation` (the statistics).
- **Sensory / image / CNN**: e.g. `architecture` (the filter bank / receptive fields, structure first), then `input`, `transform` (how channels re-represent it), `readout`.
- **Network**: e.g. `structure`, `dynamics`, `landscape`.  **Inference**: a `stages` pipeline.

A lens in code:

```js
lenses: {
  trial: { label:'Trial', about:'one trial over time',
           anim:{length:(p,d)=>d.nSteps}, views:[ /* the trajectory / readout */ ] },
  sim:   { label:'Simulation', about:'many trials → the statistics; sweep a parameter to compare',
           anim:{length:(p)=>p.nTrials}, views:[ /* histogram / coloured curves */ ] },
}
```

Each lens is just a `{label, about, views, anim?|stages?}` bundle — the same view/anim/stages
contract below, scoped to one angle. `simulate()` computes everything all lenses need
once (e.g. the per-step data of trial 0 **and** the batch outcomes). A model may still use a
single top-level `views`/`anim` when one angle suffices — `lenses` is opt-in and fully
back-compatible. See `references/levels.md` for the per-class angle catalogue; the template's
**drift-diffusion** model is the worked exemplar. Use lenses to view ONE model from several
angles; use separate **screens** (models-as-tabs) for different conditions or parts of a paper.

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
  // OPTIONAL (instead of top-level views/anim/stages): ANGLES — a lens switch over the same data.
  lenses: { angleA:{label,about,views,anim?|stages?}, angleB:{…}, … },   // see "Angles as first-class UI" above
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
already enforces it and is DPR-correct. Make every plot **self-interpretable**: a clear title,
axis labels **with units**, a **colorbar** on every heatmap (`g.colorbar`), **categorical tick
labels** for category bars, and **redundant** encoding (colour + dash/width/label, never colour
alone). **Never mix two units on one y-axis** — stack two panels (`g.frame` twice with `margin`)
and keep a threshold line on the axis it belongs to. Put captions in reserved headroom, kept short;
the toolbox's **Text size** control scales all plot fonts, so don't hard-code offsets that assume
one size. Explain each panel's *idea* in one plain line at the right moment; leave the rest to the
model's `note`/README. Let views breathe — the grid auto-fits; 1–4 views is typical. See
`references/plotting.md` for the full conventions.

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

## Scaling to a whole paper — screens, conditions, and the claim map

When the target is a whole **paper** (not a lone equation), don't cram everything into one
view grid. Use the structure the toolbox already gives you — **each entry in `MODEL_ORDER`
is a top tab, i.e. a SCREEN.** Organise a paper as a few screens that tell the story in order:

1. **Structure / mechanism** — show what the model *is*: a network's connectivity, E/I and
   plasticity rule, or a CNN's architecture, or an observer's generative + inference rule — and
   how one input is processed. Expose the model parameters as sliders here; use `anim` (watch
   one run build) or `stages` (step a pipeline) where it is sequential.
2. **Condition comparisons** — one screen per experimental condition the paper manipulates:
   hold the model parameters at the paper's defaults and **sweep that condition across a few
   fixed levels**, showing the summary curves (accuracy, RT, gain, error pattern…).
3. **Predictions / signatures** — the paper's key testable prediction or headline figure (a
   specific error structure, a regime boundary, an optimum).

**Conditions vs parameters — keep them separate and say which is which** (in `blurb`/labels):
- **Experimental conditions** = what the experimenter sets (stimulus strength, set size,
  contrast, number of options). On comparison screens these are *swept across fixed levels*,
  not offered as free sliders (offer only a re-seed / trial #).
- **Model parameters** = the circuit's mechanism (gains, time constants, noise, a threshold).
  Sliders on the mechanism screen; held at paper defaults on the comparison screens.

**Map the paper's claims — don't just re-plot figures.** For each key empirical observation
the paper explains, find the MECHANISM it attributes the effect to, and build a panel that
makes that link visible; state the mapping in `note`. The goal is *"the reader sees WHY the
data look that way,"* not a pixel-match of the figure. If the thesis is "X is held fixed; the
effect comes from Y," make **X visibly fixed and Y visibly varying** across the panels.

**Order by the model, not a fixed arc.** Where there is structure (a network, a CNN), show it
first; otherwise start from the model's rule or observer process. Then show the
class-appropriate angle (one trial, the activity, a layer transform), and finish with the
**comparison** — parameter sweeps and condition or model-choice comparisons. The order serves
the model, not a universal pipeline.

**Be honest about a reduction.** A reduced/mean-field version reproduces *qualitative
mechanism*, not exact numbers — disclose it (README + in-plot, e.g. "model Hz"), and **measure
robustly**: pick a summary that reflects the real trend rather than an artifact (a *peak*
slope, not a fixed-window slope that an easy condition saturates past). Never tune a panel to
fake a trend the model doesn't produce; show what it does and state the gap. If a condition
saturates (e.g. accuracy at ceiling), say so and point to the panel that does carry the effect.

**Heavy screens.** A comparison screen running many trials per level will freeze the UI.
Return data immediately with `loading:true`, run the batch with `SIM.runChunks(total, doItem,
label)` (it shows the loading overlay, repaints progressively via `window.__redraw`, and bails
when a newer run supersedes it via `window.__simGen`), and have views draw a placeholder until
the data fills in. Keep the mechanism screen instant.

## Validation & GUI QC

Before calling it done, run the QC pipeline in `references/gui-qc.md`: the **static gate**
(`node validate.mjs`), the **visual checklist** (no clipped or overlapping text; ceiling/chance
reference lines; accuracy clamped to `[chance, 1]`; units on every axis; legends off the data
via `g.legend(..,{corner})`; a colorbar on every heatmap; numbered panels; a loading overlay on
heavy screens), and a **two-axis review pass** (scientific-plot readability + concept clarity) —
then fix and re-verify.

`validate.mjs` reuses `engine.js` (and sanity-checks `modules/mslib.js`). Minimum gate: each model's `simulate()` runs without
throwing and returns data, and every view is a function. Add a per-model analytic check
where one exists (Bayesian reliability weight in (0,1); decision-model error rate vs the
closed form; a known limit). `node validate.mjs` must pass before declaring done.

## How to start

1. **Scaffold**: copy `assets/template/` (or run `/model-scope:scaffold <dir>`). It runs, with
   eleven worked examples spanning the model SCALES — behavioural/process, single-neuron, sensory,
   network, macro — and every idiom: the **lens switch** (drift-diffusion across its angles; a
   `compare` model-vs-model **toggle** with a metric heatmap; an **early-vision** image model; a
   **LIF** neuron with a refractory toggle; a **Rescorla-Wagner** learner; an **attractor network**
   with an energy landscape; a spatial **SIR** epidemic kymograph), *continuous* anim (a Bayesian observer), and *process mode*
   `stages` (efficient-coding, causal-inference, working-memory pipelines).
2. **Add the model**: pin the equations/parameters, then write ONE `MODELS` entry — its
   `params`, a `simulate` that returns the data the model is about, and a `views` list
   that draws what's intuitive. Add `anim` only if it's sequential.
3. **Connect to the science**: in `blurb`/`note` and labels, relate parameters to what
   they mean for the researcher (a stimulus/condition, a noise source, a learning rate, a
   gain), so moving a slider tells a story.
4. **For a whole paper**, add several models as **screens** (mechanism → condition comparisons
   → predictions); separate experimental conditions from model parameters; make the paper's
   claim↔mechanism mapping visible (see "Scaling to a whole paper" above).
5. **Validate & QC**: `node validate.mjs`, open `index.html`, then run the GUI QC pipeline
   (`references/gui-qc.md`) — visual checklist + a two-axis review pass — before declaring done.

The `model-gui-builder` agent can take a model description end-to-end.
