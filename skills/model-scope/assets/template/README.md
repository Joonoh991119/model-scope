# model-scope template

A self-contained, **no-build** interactive model explorer. Open `index.html` (double-click,
or `python3 -m http.server` if your browser blocks `file://` scripts). Move a slider and the
simulation re-runs; the result is shown in **views the model defines** — there is no fixed
graphic or axis.

Ships with eleven examples spanning the model SCALES (behavioural, single-neuron, sensory, network,
macro) and every idiom, so you can see the range. Each model is replicated and shown from the angles
that fit its class; the payoff is comparing what changes across parameters and model choices.
- **Drift-diffusion decision** *(lens switch)* — the angles: one update (drift plus noise), one trial
  walking to a bound, and the RT histogram over many trials.
- **Decision: integrate vs one sample** *(toggle + heatmap)* — compare two models via a toggle: a
  speed-accuracy overlay, a metric heatmap over a (drift, noise) grid, and metric bars.
- **Attractor network — decision** *(lens switch)* — structure first: the circuit wiring and E/I,
  then one pool's input, winner-take-all dynamics, and the (S1, S2) energy-landscape heatmap.
- **Epidemic (spatial SIR)** *(lens switch)* — a macro model: a space-time kymograph, the S/I/R
  curves, and peak prevalence vs R0 (the epidemic threshold).
- **Early vision — orientation** *(lens switch)* — an image-input model: the grating image, oriented
  Gabor energy channels re-representing it, and the orientation tuning with the decoded angle.
- **Spiking neuron (LIF)** *(lens switch)* — a V(t) trace to threshold, a spike raster over repeats,
  and the f-I transfer curve, with a refractory-period **toggle**.
- **Reinforcement learning (RW)** *(lens switch)* — one Rescorla-Wagner update (δ = r − V), the value
  learning curve, and curves across learning rates α.
- **Bayesian observer** *(continuous)* — prior, likelihood, posterior on a stimulus axis, an
  estimate-vs-true central-tendency curve (with an SD ribbon), and a trial-to-trial prior update.
- **Efficient-coding observer** *(process mode)* — step through prior, warped encoding F(θ),
  measurement, skewed likelihood, posterior, estimate, and bias vs discriminability (Wei & Stocker).
- **Causal inference** *(process mode)* — cues, hypothesis likelihoods, p(C=1), branch estimates,
  and combine, with the ventriloquism bias (Körding et al.).
- **Working-memory recall** *(process mode)* — allocate, encode on a feature wheel, probe, recall,
  accumulate the error histogram, and decompose into target / swap / guess (Bays & Husain).

The process-mode models use `stages` instead of `anim`: the transport becomes a step-by-step stepper
and views read `ui.stage`/`ui.stageKey`. `g.flow(ui.stages, ui.stage)` draws the pipeline strip.

## Files
- `plot.js` — tiny canvas charting helper (`Plot`): `frame`, `line`, `band`, `bars`, `heat`,
  `raster`, `vline`, `flow` (process strip), … Each view defines its own axes. Rarely edited.
- `engine.js` — pure math: RNG + the `MODELS` registry. **This is what you edit.**
- `index.html` — the toolbox: sliders from the schema, the simulate-on-change loop, the
  play/scrub transport (or a step-by-step stage stepper for `stages` models), and the view grid. Untouched.
- `modules/mslib.js` — optional reusable library (`MSLIB`: `sde, bayes, neuron, decision, rl, psy,
  efficient, causal, wm`) of canonical building blocks you compose inside `simulate()`.
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
