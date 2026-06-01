# Architecture & the model contract (detail)

## Why classic scripts, no build

`plot.js` and `engine.js` are **classic scripts** (`window.Plot`, `window.SIM`), not ES
modules, so `index.html` loads them from `file://` (modules are CORS-blocked there).
`engine.js` is also `eval`-able in Node, so `validate.mjs` tests the *same* math the app
runs. No bundler, no install — a researcher opens or reads it directly.

## RNG (seedable, per-trial)

```js
function hashSeed(s){ s=String(s); let h=0x811c9dc5; for(let i=0;i<s.length;i++){h^=s.charCodeAt(i); h=Math.imul(h,0x01000193);} return h>>>0; }
function mulberry32(a){ return function(){ a|=0; a=(a+0x6d2b79f5)|0; let t=Math.imul(a^a>>>15,1|a); t=(t+Math.imul(t^t>>>7,61|t))^t; return ((t^t>>>14)>>>0)/4294967296; }; }
function makeRNG(seed){ return mulberry32(hashSeed(seed)); }
function gaussian(rng){ let u=rng(); if(u<1e-12)u=1e-12; return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*rng()); }
const trialRng=(seed,k)=>makeRNG(seed+'#'+k);
```

`simulate(p, env)` receives `env = { rng: makeRNG(seed), seed, params }`. Use `env.rng`
for one-off draws; use `trialRng(env.seed, k)` so trial *k* is reproducible by index (lets
an animated view regenerate exactly the trial at the playhead, and makes batches
deterministic). `npdf(x,μ,σ)` (normal pdf) is also exported for distribution views.

## The MODELS contract

| field | required | meaning |
|---|---|---|
| `id`, `name` | ✓ | id, display name (the tab) |
| `blurb`, `note` | ✓ | one-line description; the key qualitative effect to point out |
| `params[]` | ✓ | `{name,label,min,max,step,default,unit?,int?}` — sliders are generated from this |
| `simulate(p,env)` | ✓ | run the whole model; **return any data object** the views need |
| `views[]` | ✓ | `[{title, draw(g,data,ui)}]` — each panel draws its own axes/graphics |
| `anim` | – | `{length:(p,data)=>N}` → sequential: toolbox shows play/scrub, `ui.head∈[0,N]` |

`ui = { head, playing, params }`. For non-`anim` models, `head=length=1` and views just
render the static result; the transport bar is hidden.

## What the toolbox (index.html) does

1. Builds the slider rail from `params` (+ a seed field; + transport if `anim`).
2. On any change (debounced): `data = model.simulate({...params}, {rng,seed,params})`,
   cached; `length = anim?anim.length(...):1`; reset `head`; redraw all views.
3. If `anim`, a `requestAnimationFrame` loop advances `head` by `speed/60` per frame while
   playing; ⏭ jumps to the end; the scrubber sets `head`; views read `ui.head`.
4. A generation counter (`S.gen`, bumped on every (re)start) makes superseded async work
   bail — so rapid slider drags or model switches never interleave stale state.

You normally never touch `index.html` — adding a model is purely an `engine.js` edit.

## Keep `simulate` honest & fast
- Implement the equations exactly; if a coarse step (Euler `dt`) biases a result, say so
  (the bias is usually `O(√dt)` and vanishes as `dt→0`) rather than hiding it.
- It runs on every slider move, so keep it light; for very large batches, the toolbox can
  chunk, but most models (curves, a few thousand trials) are instant.
- No DOM, no globals beyond the exported helpers — pure functions only, so the same code
  validates in Node.
