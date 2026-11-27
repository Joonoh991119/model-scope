# model-scope template

A self-contained, **no-build** interactive model explorer. Open `index.html` (double-click,
or `python3 -m http.server` if your browser blocks `file://` scripts). Move a slider and the
simulation re-runs; the result is shown in **views the model defines** — there is no fixed
graphic or axis.

Ships with twenty-one examples spanning the model SCALES (behavioural, single-neuron, sensory, network,
macro) and every idiom, so you can see the range. Each model is replicated and shown from the angles
that fit its class; the payoff is comparing what changes across parameters and model choices.
- **Drift-diffusion decision** *(lens switch)* — the angles: one update (drift plus noise), one trial
  walking to a bound, and the RT histogram over many trials.
- **Decision: integrate vs one sample** *(toggle + heatmap)* — compare two models via a toggle: a
  speed-accuracy overlay, a metric heatmap over a (drift, noise) grid, and metric bars.
- **Attractor network — decision** *(lens switch)* — structure first: the circuit wiring and E/I,
  then one pool's input, winner-take-all dynamics, and the (S1, S2) flow-speed map
  (dark = slow, near a fixed point: the two attractors and the saddle between them).
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
- **Hopfield memory (Hebbian)** *(lens switch)* — structure first: the weight matrix, the stored
  patterns, a corrupted cue settling into an attractor, and recall accuracy vs load (the capacity cliff).
- **Kuramoto oscillators** *(lens switch)* — the frequency spread and coupling, phases synchronising on
  a circle, and the order parameter r vs coupling K (the synchronization transition).
- **Belief tracking (Bayes filter)** *(lens switch)* — the transition and observation model, the belief
  distribution tracking a hidden state over time, and tracking error vs observation noise.
- **Ring attractor** *(lens switch)* — the Mexican-hat connectivity, a bump that persists after the cue
  (working memory), the decoded heading holding the cue, and bump width vs the E/I balance.
- **Retina → V1 (layered vision)** *(lens switch)* — architecture first: the layer stack and receptive
  fields, the image transformed stage by stage, the RF profiles, and output vs the horizontal-cell surround.
- **Causal graph — intervention** *(lens switch)* — a Pearl-style DAG: the graph (a confounder behind
  X and Y), the observed (confounded) association, do(X) vs what you see, and the gap vs confounding.
- **Self-attention (transformer)** *(lens switch)* — the attention matrix (who attends to whom), how a
  token’s output mixes the values, and attention sharpness (entropy) vs softmax temperature.
- **POMDP — the tiger (value iteration)** *(lens switch)* — the reward and observation structure, the
  value function over belief with the listen / open policy regions, a belief-updating episode, and
  caution vs the penalty.
- **Wilson–Cowan E/I (oscillation)** *(lens switch)* — the excitatory–inhibitory circuit, the E and I
  rates oscillating with the phase-plane limit cycle, and oscillation amplitude vs drive (the
  bifurcation).
- **Multi-head attention (heads + layers)** *(lens switch)* — each head's attention matrix (content,
  previous-token, local), how stacking layers mixes the sequence, and sharpness vs temperature.

The process-mode models use `stages` instead of `anim`: the transport becomes a step-by-step stepper
and views read `ui.stage`/`ui.stageKey`. `g.flow(ui.stages, ui.stage)` draws the pipeline strip.

## Files
- `plot.js` — tiny canvas charting helper (`Plot`): `frame`, `line`, `band`, `bars`, `heat`,
  `raster`, `vline`, `flow` (process strip), … Each view defines its own axes. Global helpers:
  `Plot.histify`, `Plot.nearestY(points, x)`, `Plot.ramp(from, to)`, `Plot.RAMPS`, `Plot.TH`.
  Rarely edited.
- `engine.js` — pure math: RNG + the `MODELS` registry. **Your models go here; this is what you edit.**
- `engine.checks.mjs` — the analytic checks for your models (ships as a commented example).
- `examples.js` + `examples.checks.mjs` — the worked examples and their checks. Optional: delete both
  files and the `examples.js` script line in `index.html` to ship only your own models.
- `index.html` — the toolbox: sliders from the schema, the simulate-on-change loop, the
  play/scrub transport (or a step-by-step stage stepper for `stages` models), and the view grid. You
  do not edit it. Link a screen with `index.html#<model>-<lens>`; add `?p.<name>=<value>&seed=<seed>`
  to open with given parameters (the **Copy link** button writes that link for you). **Pin** keeps
  the current result as a reference beside every view, with a line naming what changed since;
  **Unpin** removes it.
- `modules/mslib.js` — optional reusable library (`MSLIB`: `sde, bayes, neuron, decision, rl, psy,
  efficient, causal, wm, network, osc, belief, vision, attn`) of canonical building blocks you compose inside `simulate()`.
- `validate.mjs` — the gate. `node validate.mjs` loads what `index.html` loads and checks every model:
  schema, a deterministic `simulate()`, every view drawn through the real `plot.js` at defaults and at
  every control's min and max, an analytic check tied to the science, and the `mslib` blocks.
  `--snapshot f.json` / `--against f.json` lock your own model's numbers before a refactor.
- `bundle.mjs` — optional, and never needed to run or edit the app. `node bundle.mjs` writes the
  whole app as ONE self-contained page (`bundle.html`: the style and every script inlined, no file
  beside it, no external resource). See "Share it as one page" below.

## Add your model — one registry entry

In `engine.js`, add an entry to `MODELS` and its id to `MODEL_ORDER` (a commented skeleton is already
there). Your models come first in the tab order; the examples follow:

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
Then write its check in `engine.checks.mjs` (a property the science guarantees) and run
`node validate.mjs`.

## Share it as one page

The folder already works as it is: open `index.html`, or copy the folder. When one file is easier
to hand over, run the bundler (plain Node, no install):

```bash
node bundle.mjs --title "Drift Diffusion Lab"                 # bundle.html, a fragment for a host that wraps pages
node bundle.mjs --standalone --out explorer.html              # a complete document: open it, or send it as one file
```

- The default output is a **fragment**: one `<title>`, the style, the markup and the scripts, with
  no doctype, `<html>`, `<head>` or `<body>`. That is the form a host that wraps pages expects, for
  example a Claude Artifact (private until you share it). `--standalone` adds the wrapper, so the
  file opens correctly on its own.
- `--title` is the page's name: two to four words, no explanation after a dash or colon. Without it
  the bundler uses `SIM.APP.title` if it fits, else a neutral default.
- It bundles what `index.html` loads. Delete the `examples.js` script line first if the page should
  hold only your own models (231 KB with the 21 examples, 85 KB without them, before your own models).
- A hosted page passes only a plain `#name` through its link, so link a screen with `#<model>` or
  `#<model>-<lens>`. Inside a host frame the **Copy link** button is hidden, because the frame's own
  address is not the link to share; use the host's share link.
- `node validate.mjs` checks the bundle too (one page, no file or host reference, scripts parse).

See the `model-scope` skill (`references/plotting.md`, `references/architecture.md`) for the
full helper API and view recipes (distributions, tuning curves, trajectory+histogram,
spike rasters, heatmaps and flow fields, learning sequences, process pipelines).
