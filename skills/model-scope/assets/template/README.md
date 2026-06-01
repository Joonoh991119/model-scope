# model-scope template

A self-contained, **no-build** interactive simulator. Open `index.html` (double-click,
or `python3 -m http.server` if your browser blocks `file://` scripts). Move a slider and
watch each trial's trajectory resolve and drop a count into the outcome histogram; the
accumulated histogram is the model's prediction.

Ships with three example models — **biased random walk** (decision / first-passage),
**stochastic logistic growth** (population: establish vs. extinct), and **two-population
competition** (2-D, with a phase plane + energy landscape). They share one interface, so
the same controls/plots work for all three.

## Files
- `engine.js` — pure math: RNG, the `MODELS` registry, trial runners. **Edit this.**
- `index.html` — the UI, generated from each model's parameter schema. Usually untouched.
- `validate.mjs` — `node validate.mjs` checks every model runs and that the random walk
  matches the drift-diffusion closed form.

## Add your model — one registry entry

In `engine.js`, append to `MODELS` and add the id to `MODEL_ORDER`:

```js
mymodel: {
  id:'mymodel', name:'My model', dim:1,           // dim 1 → x(t); dim 2 → (y1,y2) + phase/landscape
  blurb:'…', note:'…',
  params:[ {name:'A',label:'Rate',min:0,max:3,step:0.01,default:1}, … ],
  outcomes:[ {key:'hit',label:'reaches target',color:'pos'} ],   // 1 or 2 categories (color: pos|neg|accent)
  init:(p)=>({t:0, x:0}),
  step:(s,p,dt,rng)=>{ s.x += p.A*dt + p.c*Math.sqrt(dt)*gaussian(rng); s.t+=dt; },
  done:(s,p)=> s.x>=p.target ? 1 : 0,             // 0 = ongoing; else 1-based outcome index
  fields:(s)=>[s.x],
  guides:(p)=>[ {v:p.target, label:'target', color:'pos'} ],     // 1-D reference lines (optional)
  yRange:(p)=>[0, p.target*1.2],                  // 1-D vertical range (optional)
  // measure:(s,p)=>s.t,   // scalar binned per trial (default = trial time)
  // derived:(p)=>[{label:'λ',value:…,tag:'…'}],          // read-only computed display
  // fieldState:(p,y1,y2)=>({t:0,y1,y2,/*hidden vars at steady state*/}),  // 2-D landscape only
},
```

`gaussian(rng)` and the RNG are already in scope. Reload `index.html` — your model appears
as a tab with sliders auto-generated from `params`. Trials that never resolve before
`Max time` are reported as non-responses.

For the full rationale (per-trial seeding, the player loop, fixed-axis Δt-aligned
histograms, the 2-D energy-landscape recipe), see the `model-scope` skill that generated
this template.
