# Architecture & the model contract (detail)

## Why 3 classic-script files

`engine.js` is a **classic script** (not an ES module) wrapped as
`(function(global){ … global.SIM = {…} })(typeof window!=='undefined'?window:globalThis)`.
This single trick lets the *same file*:
- load in the browser from `file://` via `<script src="engine.js">` (ES modules are
  blocked over `file://` by CORS — classic scripts are not), and
- be read + `eval`'d in Node by `validate.mjs`, so the test and the app share one source
  of math. No duplication, no drift between what's tested and what's shipped.

`index.html` includes `engine.js` then an inline `<script>` that builds the UI from
`SIM.MODELS`. No bundler, no `npm install` to view it.

## RNG (seedable, per-trial)

```js
function hashSeed(str){ let h=0x811c9dc5; for(const c of String(str)){ h^=c.charCodeAt(0); h=Math.imul(h,0x01000193);} return h>>>0; }
function mulberry32(a){ return function(){ a|=0; a=(a+0x6d2b79f5)|0; let t=Math.imul(a^a>>>15,1|a); t=(t+Math.imul(t^t>>>7,61|t))^t; return ((t^t>>>14)>>>0)/4294967296; }; }
function makeRNG(seed){ return mulberry32(hashSeed(seed)); }
function gaussian(rng){ let u=rng(); if(u<1e-12)u=1e-12; return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*rng()); }
```

Seed **each trial** with `makeRNG(seed + '#' + k)`. Trial *k* is then a pure function of
`(seed, k)`: reproducible, jump-to-able by the scrubber, and cheap to recompute in bulk.
Box–Muller consumes 2 uniforms per draw; this is fine and keeps the stream deterministic.

## Trial runners

Two runners over the same model:
- `runTrialFull(model, p, opts, rng)` → records the whole path `{t[], a[], b[]}` for the
  animated "this trial" view.
- `runTrialFast(model, p, opts, rng)` → outcome + measure only, for the batch.

Both: `s = model.init(p,rng)`; **check `model.done(s,p)` once before stepping** (a start
already past threshold resolves at t=0); then loop `step → done` until non-zero or
`steps ≥ ceil(tMax/dt)`. Return `{ outcome, measure: (model.measure?model.measure(s,p):s.t), … }`.
`outcome === 0` ⇒ non-response.

> Both runners must consume the RNG identically per trial, so a path regenerated for the
> scrubber matches the batch statistics exactly.

## The MODELS contract (full)

| field | required | meaning |
|---|---|---|
| `id`, `name`, `dim` | ✓ | id, display name, 1 or 2 plotted dimensions |
| `blurb`, `note` | ✓ | one-line description; a qualitative prediction / limiting case |
| `params[]` | ✓ | `{name,label,min,max,step,default,unit?}` — the GUI is generated from this |
| `outcomes[]` | ✓ | 1–2 `{key,label,color}` where `color ∈ {'pos','neg','accent'}` (mapped to theme) |
| `init(p,rng)` | ✓ | fresh state object `{t:0, …}`; may draw rng for trial-to-trial variability |
| `step(s,p,dt,rng)` | ✓ | one Euler–Maruyama step, mutate `s` in place incl. `s.t += dt` |
| `done(s,p)` | ✓ | `0` ongoing, else 1-based index into `outcomes` |
| `fields(s)` | ✓ | `[x]` (1-D) or `[y1,y2]` (2-D) — the plotted variables |
| `measure(s,p)` | – | scalar the histogram bins (default `s.t`) |
| `guides(p)` | – | `[{v,label?,color?}]` 1-D horizontal reference lines (thresholds) |
| `yRange(p)` | – | `[lo,hi]` 1-D vertical range (else inferred from guides/data) |
| `derived(p)` | – | `[{label,value,tag}]` read-only computed displays (e.g. λ, eigenvalues) |
| `fieldState(p,y1,y2)` | – | 2-D only: state to evaluate the drift at, with hidden vars at quasi-steady-state (for the energy landscape) |

### Multi-variable / hidden state
Keep every state variable the dynamics need in the `init`/`step` state object, but only
return the ones you want to *plot* from `fields`. Example: a pooled-inhibition model has
decision units `y1,y2` and a hidden inhibitory pool `y3`; `fields` returns `[y1,y2]`,
`step` updates all three, and `fieldState` sets `y3` to its quasi-steady-state value so
the 2-D landscape projects correctly.

### Euler bias (state it honestly)
At coarse `dt`, discrete steps overshoot absorbing boundaries, biasing first-passage
statistics by `O(√dt)`. It converges as `dt → 0`; it does not vanish at `dt = 0.01`. Don't
"fix" it by deviating from Euler — surface it (the validator shows the convergence table)
and let the user shrink `dt`.
