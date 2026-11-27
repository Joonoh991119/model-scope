---
name: model-scope
description: >-
  Build a self-contained, no-build web GUI that turns any parameterised model into an
  interactive explorer: a slider per parameter (or a condition toggle) re-runs the simulation
  live, in views the MODEL defines, with no fixed graphic or axis. Covers Bayesian and
  ideal observers, neurons, drift-diffusion and other decision models, reinforcement
  learning, POMDPs, networks and attractors, oscillators, vision stacks, attention,
  epidemics and any Monte-Carlo or dynamical process. Use it whenever the user wants a
  simulator, a parameter explorer, "see how the result changes as I tune X", "turn these
  equations into something I can play with", an interactive figure or a teaching demo, and
  when adding a model, a view or an animation to an existing model-scope app, even if they
  never say "GUI". When a paper or reference is handed over to be turned into a simulator,
  the paper-to-sim skill is the front door and drives this one.
---

# model-scope — interactive model explorers (any model, any view)

## What you build, and the one idea

A single-page app for researchers: a **control rail** (a slider per parameter, generated from a
schema) and a **grid of views**. Moving any control re-runs the model and redraws the views, so the
researcher *sees how the result changes* and builds intuition by play.

**The toolbox imposes no visualisation.** Each model declares its own `views`, and each view draws
whatever is intuitive for that model (distributions, tuning curves, rasters, phase portraits, belief
simplices, eye traces) with a small plotting helper. The drift-diffusion "trajectory plus RT
histogram" is one recipe among many.

Implement the model's math **exactly** as given; never re-derive it from memory, because a
plausible-looking wrong equation is the failure nobody catches by eye. Surface any ambiguity instead
of guessing. Aim for a clean instrument, not a dashboard.

## The philosophy: replicate, illuminate from many angles, compare

The goal is not to pixel-match a paper's figures and not to force every model through one pipeline.
**Replicate the model faithfully, illuminate it from the angles natural to its class, and let the
user compare**, by moving sliders and switching models, the qualitative and quantitative differences
the choices produce.

- **Replicate** the equations as given; disclose any reduction honestly.
- **Show structure first** where there is structure (a network's connectivity, E/I and plasticity
  rule; a CNN's architecture), then how an input drives it.
- **Illuminate from the angles that fit the class.** An observer: measurement, likelihood, posterior,
  the per-trial input-to-output map, many-trial metrics. A decision model: one trial to a bound, and
  RT/accuracy histograms by condition. A neuron: short-window traces and the spike pattern. A network:
  single-cell and population activity, the representation, attractor dynamics. The per-class
  catalogue is `references/levels.md`.
- **Compare.** A parameter sweep drawn as coloured curves or a heatmap, and a model toggle, are the
  payoff. Reproducing a specific figure is at most a check.

## Angles as first-class UI: `lenses`

A model declares its angles as **lenses**; the toolbox renders a lens switch and swaps the active
views and playhead per lens over the **same `simulate()` data** (no recompute on switch). Lens keys
and labels are free: name them for the model's own angles (`step`, `trial`, `simulation` for a
decision model; `architecture`, `input`, `transform`, `readout` for a vision model; `structure`,
`dynamics`, `landscape` for a network).

```js
lenses: {
  trial: { label:'Trial', about:'one trial over time',
           anim:{length:(p,d)=>d.nSteps}, views:[ /* the trajectory / readout */ ] },
  sim:   { label:'Simulation', about:'many trials → the statistics; sweep a parameter to compare',
           anim:{length:(p)=>p.nTrials}, views:[ /* histogram / coloured curves */ ] },
}
```

Each lens is a `{label, about, views, anim?|stages?}` bundle. `simulate()` computes what every lens
needs once. A model may keep a single top-level `views`/`anim` when one angle suffices. Use lenses
for one model seen from several angles; use separate **screens** (models as tabs) for different
conditions or parts of a paper. The template's drift-diffusion model is the worked exemplar.

## The template: no build step

Copy `${CLAUDE_SKILL_DIR}/assets/template` into the user's folder. It opens by double-clicking
`index.html` (or `python3 -m http.server`): plain classic `<script>` tags, no bundler, no
`npm install`, no external resource at run time. Keep it that way; a generated app must never need
dev tooling to run or be edited.

```
index.html          the toolbox: sliders from each schema, simulate() on change, the playhead,
                    lens switch, links, Pin, Copy link. You do not edit it.
engine.js           yours. RNG + the MODELS registry (window.SIM), pure math, no DOM, runs in Node.
                    Your models go here and come first in the tab order.
engine.checks.mjs   yours. Analytic checks for your models, keyed by model id.
examples.js         the gallery: 21 worked examples, registered after yours. Read one as a recipe
                    for a model of the same class. Optional: delete it, examples.checks.mjs and
                    its <script> line (marked in index.html) to ship only your own models.
examples.checks.mjs the examples' analytic checks.
plot.js             the canvas helper (window.Plot): frame + primitives, nearestY, colour ramps.
modules/mslib.js    optional library (window.MSLIB) of canonical building blocks to compose inside
                    simulate(); see the modelbook below.
validate.mjs        the gate: node validate.mjs.
bundle.mjs          optional: writes the whole app as one self-contained page (see "Deliver").
README.md           quick start for the copied app.
```

**Model ids.** An id of yours that equals an example's id (`lif`, `ddm`, `bayes`, `rl`, ... see
`MODEL_ORDER` in `examples.js`) hides that example: its tab and its analytic check are dropped and
the gate warns. Pick a distinct id unless replacing the example is the point.

**An app made before 1.22.** If the folder has no `examples.js` and no `engine.checks.mjs` (every
model sits in `engine.js`), it is the old layout, and its `validate.mjs` never reads
`engine.checks.mjs`. There, add the model to `engine.js` (`MODELS` and `MODEL_ORDER`) and write its
check inside that app's `validate.mjs`, next to the existing ones. Pin, Copy link, links and
`bundle.mjs` do not exist in such an app; do not promise them. Moving it to the current layout is
a separate job: ask the user first.

## The model contract: the one place you edit

Adding or altering a model is one declarative entry in `MODELS` in `engine.js` (plus its id in
`MODEL_ORDER`; a commented skeleton is already there). A model is pure (no DOM, no globals), so the
same code runs in the browser and in the gate:

```js
mymodel: {
  id:'mymodel', name:'My model',
  blurb:'one plain-language sentence', note:'a key qualitative effect to point out',
  params: [ {name:'sigma', label:'Noise σ', min:0.1, max:3, step:0.01, default:1, unit:'a.u.'},
            {name:'refr', label:'Refractory', type:'bool', default:true},
            {name:'rule', label:'Rule', type:'enum', options:['MAP','mean'], default:0} ],
  // run the whole simulation; return ANY data the views need. env = { rng, seed, params }.
  simulate: (p, env) => { /* curves, samples, fields, sequences… */ return data; },
  views: [
    { title:'…', draw:(g, data, ui) => {
        g.frame({ x:[lo,hi], y:[lo,hi], xlabel, ylabel, title });   // this view's own axes
        g.line(pts); g.band(pts); g.bars(hist); g.vline(x); g.heat(...); g.raster(...);
    }},
  ],
  anim:   { length:(p,data)=> N },              // OPTIONAL continuous playhead: ui.head ∈ [0,N]
  stages: (p,data)=> [ {key,name,about}, … ],   // OPTIONAL instead of anim: process-mode stepper
  lenses: { a:{label,about,views,anim?|stages?}, … },  // OPTIONAL instead of top-level views
}
```

`ui` has eight fields: `head`, `playing`, `params`, `frac` (the fractional part of `head`),
`stage`, `stageKey`, `stages` and `nStages`. Views decide what `head` means (a trial, a time, an
iteration). Read `references/architecture.md` for the full contract and runtime.

- **`simulate` returns whatever you want.** The views interpret it; that is what removes the fixed
  graphic.
- **`views` own their axes.** One view is a density on a stimulus axis, the next a heatmap.
- **`anim` is optional.** Static models just redraw on slider change. Sequential ones get play,
  pause, fast-forward, scrub and speed.
- **`stages` is process mode**: a ◀ ▶ stepper with a stage-named readout, for seeing each
  computation in sequence (stimulus → encoding → measurement → likelihood → posterior → estimate).
  Views read `ui.stage`/`ui.stageKey`; `g.flow(ui.stages, ui.stage)` draws the pipeline strip.

**Reproducible and instant.** Use the seedable RNG; for trial-based models seed trial *k* as
`trialRng(seed, k)` so the player can jump to it and the batch recomputes deterministically.
`makeRNG`, `gaussian`, `trialRng`, `npdf` are in scope in `engine.js`. Keep `simulate` fast enough
for every slider move.

## The plotting helper `g`

Read `references/plotting.md` for the API and the view recipes (distributions and inference, tuning
curves, trajectory plus accumulating histogram, raster plus trace, heatmaps and phase fields,
learning sequences, process pipelines). In one line: `g.frame({x,y,xlabel,ylabel,title})` sets this
view's axes, then `g.line / band / points / marker / bars / heat / raster / vline / hline / arrow /
text` draw in data coordinates (`graph` takes 0..1 canvas fractions; `image`, `legend`, `colorbar` and
`flow` place themselves in pixels; `note` centres a message); `g.X(v)`/`g.Y(v)`
map to pixels for raw `g.ctx`. Global helpers: `Plot.histify(values, bins, lo, hi, quant?)`,
`Plot.nearestY(points, x)` (the y of the sample nearest x, for a marker on a sweep curve),
`Plot.ramp(from, to)` and `Plot.RAMPS` (shared colour maps), `Plot.TH` (the theme colours).
Extend the helper freely rather than fighting it.

**Legibility.** Light, muted colours; the helper is DPR-correct and the toolbox's **Text size**
control scales every plot font, so do not hard-code offsets that assume one size. Make every plot
self-interpretable: axis labels with units, a colorbar on every heatmap, categorical tick labels for
category bars, redundant encoding (never colour alone), and never two units on one y-axis (stack two
panels with `margin`). Keep captions short; the figure should read without the text.

## Model families: the modelbook

Do not invent a model from scratch when a canonical family fits. Read
`references/modelbook/INDEX.md`: it lists every family, what it is for, and its `MSLIB` module. Then
open that family's file for the canonical equations, parameters with their meaning, recommended
views and source pointers. Treat these as starting skeletons; adapt them to the user's exact
equations and compose the small `MSLIB` functions rather than copying a whole repository. Adding a
family is an `MSLIB` sub-object, a `modelbook/<family>.md` and an INDEX row.

## Scaling to a whole paper: screens, conditions and the claim map

Each entry in `MODEL_ORDER` is a top tab, a **screen**. Organise a paper as a few screens:

1. **Structure / mechanism**: what the model is (wiring, architecture, or generative plus inference
   rule) and how one input is processed. Model parameters are sliders here.
2. **Condition comparisons**: one screen per experimental condition the paper manipulates, holding
   the model parameters at the paper's defaults and sweeping the condition across fixed levels.
3. **Predictions / signatures**: the paper's key testable prediction.

**Keep conditions and parameters separate and say which is which.** Experimental conditions
(stimulus strength, set size, contrast) are what the experimenter sets; on comparison screens they
are swept, not free sliders. Model parameters (gains, time constants, noise) are the mechanism.

**Map the claims, do not just re-plot figures.** For each key observation, find the mechanism the
paper attributes it to and build a panel that makes that link visible; state the mapping in `note`.
If the thesis is "X is held fixed; the effect comes from Y", make X visibly fixed and Y visibly
varying.

**Be honest about a reduction.** A reduced or mean-field version reproduces qualitative mechanism,
not exact numbers: disclose it (README and in-plot), measure robustly (a peak slope, not a
fixed-window slope an easy condition saturates past), and never tune a panel to fake a trend.

**Heavy screens.** Return data at once with `loading:true`, run the batch with
`SIM.runChunks(total, doItem, label)` (it shows the loading overlay with a progress bar, redraws the
views once after the last chunk and stops when a newer run supersedes it); clear `loading` in the last
`doItem`, and have views draw a placeholder while it is set.
Keep the mechanism screen instant.

## What the toolbox already gives the user

You get these without writing code; mention them in the report rather than rebuilding them.

- **Links.** `index.html#<model>` or `#<model>-<lens>` opens a screen (the only form a hosted page
  passes through). A query adds state: `?p.<name>=<value>&seed=<seed>`, plus `head=`, `still=1`,
  `text=`. **Copy link** writes the model, lens, seed and changed parameters (`head=`, `still=1` and
`text=` are added by hand). Parameters are remembered per model
  while the page is open. Optional `SIM.APP = {title, tagline}` names the page.
- **Pin.** Pin keeps the current parameters, seed and data as a reference; every view then shows the
  reference beside the live canvas (stacked on a phone), with one line naming what differs. Unpin
  restores the normal layout.
- **Accessibility and phones.** Named controls and canvases, a live region, a 400 px layout. Keep
  view titles meaningful, since they name the canvases.

## Validation and GUI QC

`node validate.mjs` loads exactly what `index.html` loads, with the real `plot.js`. For every model
it lints the schema, runs `simulate()` and requires the same result for the same seed, draws every
view at defaults and at each control's min and max, and runs the analytic checks in each
`X.checks.mjs` beside an `X.js` the page loads. Add a check for each of your models to
`engine.checks.mjs` where one exists (a closed form, a conservation law, a known limit), preferably
against an independent reference rather than "the output is finite". A model without one is a
counted warning, not a failure, so do not write a vacuous check to silence it.
`--snapshot f.json` / `--against f.json` lock your model's numbers before a refactor.

Then run the QC pipeline in `references/gui-qc.md`: the visual checklist (no clipped or overlapping
text, ceiling and chance lines, accuracy clamped to `[chance, 1]`, units on every axis, legends off
the data, a colorbar on every heatmap, a loading overlay on heavy screens) and an independent
two-axis review (plot readability and concept clarity). Fix and re-verify. The gate must pass before
you call the work done.

## Deliver

The folder is the deliverable: it runs from `file://` and can be copied as it is. Report how to open
it. When one file is easier to hand over, `node bundle.mjs --title "Two To Four Words"` writes the
app as one self-contained page, a fragment for a host that wraps pages (for example an Artifact);
`--standalone --out app.html` writes a complete document. Delete the `examples.js` script line first
if the page should hold only the user's models. The gate checks the bundle too. Details are in the
template's `README.md`.

## How to start

1. **Scaffold**: copy `${CLAUDE_SKILL_DIR}/assets/template` into the target folder (or let the user
   type `/model-scope:scaffold <dir>`). It runs with the 21 worked examples, which span behavioural,
   single-neuron, sensory, network and macro scales and every idiom (lens switch, continuous `anim`,
   process-mode `stages`, a model toggle with a metric heatmap). Keep them while you learn from them;
   remove them for a focused app.
2. **Add the model**: pin the equations and parameters, then write one `MODELS` entry in `engine.js`.
3. **Connect to the science**: in `blurb`, `note` and labels, relate each parameter to what it means
   for the researcher, so moving a slider tells a story.
4. **For a whole paper**, add several screens (mechanism → condition comparisons → predictions).
5. **Validate and QC**: `node validate.mjs`, open `index.html`, walk `references/gui-qc.md`.

The `model-gui-builder` agent can take a model description end to end.
