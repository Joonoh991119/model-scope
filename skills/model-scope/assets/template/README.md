# model-scope template

A self-contained, **no-build** interactive model explorer. Open `index.html` (double-click,
or `python3 -m http.server` if your browser blocks `file://` scripts). Move a slider and the
simulation re-runs; the result is shown in **views the model defines** — there is no fixed
graphic or axis.

Ships with two deliberately different examples so you can see the range:
- **Bayesian observer** — prior/likelihood/posterior on a stimulus axis, an estimate-vs-true
  *central-tendency* curve (with a ±SD ribbon), and a trial-to-trial prior-mean update.
- **Drift-diffusion decision** — an animated evidence trajectory + an accumulating
  response-time histogram (correct ↑ / error ↓).

## Files
- `plot.js` — tiny canvas charting helper (`Plot`): `frame`, `line`, `band`, `bars`, `heat`,
  `raster`, `vline`, … Each view defines its own axes. Rarely edited.
- `engine.js` — pure math: RNG + the `MODELS` registry. **This is what you edit.**
- `index.html` — the toolbox: sliders from the schema, the simulate-on-change loop, the
  optional play/scrub transport, and the view grid. Usually untouched.
- `validate.mjs` — `node validate.mjs` checks each model runs and is sane.

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
  // add only if the model is sequential (animate a playhead 0..N):
  // anim:{ length:(p)=>p.nTrials },
},
```

`makeRNG`, `gaussian`, `trialRng`, `npdf` are in scope in `engine.js`; `Plot.*` (helpers,
theme, `histify`) are global in views. Reload `index.html` — your model appears as a tab
with sliders auto-generated from `params`, and your views render and update as you tune.

See the `model-scope` skill (`references/plotting.md`, `references/architecture.md`) for the
full helper API and view recipes (distributions, tuning curves, trajectory+histogram,
spike rasters, heatmaps/energy landscapes, learning sequences).
