# model-scope template

A self-contained, **no-build** interactive model explorer. Open `index.html` (double-click,
or `python3 -m http.server` if your browser blocks `file://` scripts). Move a slider and the
simulation re-runs; the result is shown in **views the model defines** — there is no fixed
graphic or axis.

Ships with six examples spanning every idiom so you can see the range:
- **Drift-diffusion decision** *(level switch)* — zoom one model through perspectives: ⚛ Step (one
  update = drift + noise → new evidence) · ◷ Trial (a walk to a bound) · ∑ Simulation (the RT
  histogram builds up). The worked example of the three-level lenses.
- **Early vision — orientation** *(level switch)* — an **image-input** model: 🖼 the grating image ·
  🧱 oriented Gabor energy channels re-represent it · 🎯 the orientation tuning + decoded angle.
- **Bayesian observer** *(continuous)* — prior/likelihood/posterior on a stimulus axis, an
  estimate-vs-true *central-tendency* curve (±SD ribbon), and a trial-to-trial prior update.
- **Efficient-coding observer** *(process mode)* — step through prior → warped encoding F(θ) →
  measurement → skewed likelihood → posterior → estimate → bias & discriminability (Wei & Stocker).
- **Causal inference** *(process mode)* — cues → hypothesis likelihoods → p(C=1) → branch
  estimates → combine, with the N-shaped ventriloquism bias (Körding et al.).
- **Working-memory recall** *(process mode)* — allocate → encode on a feature wheel → probe →
  recall → accumulate the error histogram → decompose into target/swap/guess (Bays & Husain).

The process-mode models use `stages` instead of `anim`: the transport becomes a ◀ ▶ stepper
and views read `ui.stage`/`ui.stageKey`. `g.flow(ui.stages, ui.stage)` draws the pipeline strip.

## Files
- `plot.js` — tiny canvas charting helper (`Plot`): `frame`, `line`, `band`, `bars`, `heat`,
  `raster`, `vline`, `flow` (process strip), … Each view defines its own axes. Rarely edited.
- `engine.js` — pure math: RNG + the `MODELS` registry. **This is what you edit.**
- `index.html` — the toolbox: sliders from the schema, the simulate-on-change loop, the
  play/scrub transport (or ◀ ▶ stage stepper for `stages` models), and the view grid. Untouched.
- `modules/mslib.js` — optional reusable library (`MSLIB`: `sde·bayes·neuron·decision·rl·psy·
  efficient·causal·wm`) of canonical building blocks you compose inside `simulate()`.
- `validate.mjs` — `node validate.mjs` checks each model runs and is sane (+ the `mslib` blocks).

## Add your model — one registry entry

In `engine.js`, append to `MODELS` and add the id to `MODEL_ORDER`:

```js
mymodel: {
  id:'mymodel', name:'My model', blurb:'…', note:'…',
  params:[ {name:'g', label:'Gain', min:0, max:5, step:0.01, default:1}, … ],
  // run the model; return whatever your views need (curves, samples, fields, sequences…)
  simulate:(p, env) => { /* env = {rng, seed, params} */ return { /* data */ }; },
  views:[
    { title:'…', draw:(g, data, ui) => {
        g.frame({ x:[0,10], y:[0,1], xlabel:'input', ylabel:'response', title:'tuning' });
        g.line(data.curve, { color:Plot.TH.accent, width:2 });
        // ui.params, and ui.head if you add `anim`
    }},
  ],
  // add only if the model is sequential (animate a continuous playhead 0..N):
  // anim:{ length:(p)=>p.nTrials },
  // …or, for a "see each process step" model, declare stages instead of anim:
  // stages:()=>[ {key:'a',name:'Stage A',about:'…'}, {key:'b',name:'Stage B',about:'…'} ],
},
```

`makeRNG`, `gaussian`, `trialRng`, `npdf` are in scope in `engine.js`; `Plot.*` (helpers,
theme, `histify`) are global in views. Reload `index.html` — your model appears as a tab
with sliders auto-generated from `params`, and your views render and update as you tune.

See the `model-scope` skill (`references/plotting.md`, `references/architecture.md`) for the
full helper API and view recipes (distributions, tuning curves, trajectory+histogram,
spike rasters, heatmaps/energy landscapes, learning sequences, process pipelines).
