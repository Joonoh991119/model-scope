# Architecture & the model contract (detail)

## Why classic scripts, no build

`plot.js` and `engine.js` are **classic scripts** (`window.Plot`, `window.SIM`), not ES
modules, so `index.html` loads them from `file://` (modules are CORS-blocked there).
`engine.js` is also `eval`-able in Node, so `validate.mjs` tests the *same* math the app
runs. No bundler, no install — a researcher opens or reads it directly.

**Zero external resources.** `index.html` loads no CDN, font, or analytics — only its three
local scripts (`plot.js`, `mslib.js`, `engine.js`). Fonts fall back to the system UI /
monospace stack (`IBM Plex …, system-ui` / `…, ui-monospace`), so the app is self-contained
and works offline. Nothing to delete, nothing to phone home.

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
| `id`, `name` | yes | id, display name (the tab) |
| `blurb`, `note` | yes | one-line description; the key qualitative effect to point out |
| `params[]` | yes | `{name,label,min,max,step,default,unit?,int?}` — a slider per param. Also `{type:'bool',default}` → a toggle, and `{type:'enum',options:['a','b','c'],default:0}` → a segmented control (value is the option index) for a model/condition choice |
| `simulate(p,env)` | yes | run the whole model; **return any data object** the views need |
| `views[]` | yes | `[{title, draw(g,data,ui)}]` — each panel draws its own axes/graphics |
| `anim` | – | `{length:(p,data)=>N}` → **continuous** sequential: play/scrub, `ui.head∈[0,N]` (a trial index, a time, an iteration) |
| `stages` | – | `(p,data)=>[{key,name,about}]` (or a static array) → **process mode**: the playhead steps through the model's named pipeline stages; views switch on `ui.stage`/`ui.stageKey` to reveal each computation in turn |
| `lenses` | – | `{angleA,angleB,…}` — several ANGLES on the same `simulate()` data (keys are free); each is `{label,about,views,anim?\|stages?}`. The toolbox shows a lens switch and binds the active lens's views + playhead (no recompute on switch). Use instead of top-level `views`/`anim`/`stages`. See the skill's "Angles as first-class UI" + `references/levels.md` |

`ui = { head, playing, params, frac, stage, stageKey, stages, nStages }`. `head` is the
continuous playhead (∈[0,length]); `frac = head−⌊head⌋` is within-step progress (use it to
fade a stage in). A model declares **either** `anim` (continuous; `stage` is null — views
read `head`) **or** `stages` (discrete process steps; `length = stages.length`,
`stage = ⌊head⌋` clamped to the last stage, `stageKey` is that stage's `key`). If both are
present, `stages` wins. For static models `head=length=1`, `stage=null`, and the transport
bar is hidden.

### Process mode — render a model's pipeline step by step

`stages` is for the *"see each process in sequence"* idiom: a Bayesian observer as
stimulus → encoding → measurement → likelihood → prior → posterior → loss → estimate; a
causal-inference observer as cues → per-hypothesis likelihoods → causal posterior →
branch estimates → combine. Declare the ordered stages, give the toolbar ◀ ▶ single-step
buttons + a stage-named readout (it auto-appears), and in each view either (a) draw the
whole **pipeline overview** with `g.flow(ui.stages, ui.stage)` (the active box lights up),
or (b) `switch(ui.stageKey)` / compare `ui.stage` to reveal that stage's panel — earlier
stages stay drawn, the current one is emphasised. The playhead auto-advances slowly
(≈1.4 stages/s) so each step is readable; ◀ ▶ and the scrubber step discretely.

## What the toolbox (index.html) does

1. Builds the slider rail from `params` (+ a seed field; + transport if `anim`).
2. On any change (debounced): `data = model.simulate({...params}, {rng,seed,params})`,
   cached; `length = anim?anim.length(...):1`; reset `head`; redraw all views.
3. If `anim`, a `requestAnimationFrame` loop advances `head` by `speed/60` per frame while
   playing; ⏭ jumps to the end; the scrubber sets `head`; views read `ui.head`.
4. A generation counter (`S.gen`, bumped on every (re)start, mirrored to `window.__simGen`)
   makes superseded async work bail — so rapid slider drags or model switches never interleave
   stale state.
5. For **heavy** screens it exposes a loading overlay: `window.__setLoading(on,prog,label)`,
   `window.__redraw()` (repaint), and `window.__simGen` (the live generation). `SIM.runChunks`
   in `engine.js` uses all three — a `simulate()` returns `{loading:true}` immediately and the
   batch fills in across frames. In Node (no rAF) `runChunks` runs synchronously, so the same
   code validates.

**Multiple models = screens.** Each `MODEL_ORDER` entry is a top tab. A whole paper is built
as a few screens (mechanism → condition comparisons → prediction), each its own `MODELS` entry
— see the skill's "Scaling to a whole paper". You normally never touch `index.html` — adding a
screen is purely an `engine.js` edit.

## The validation gate (`validate.mjs`)

`node validate.mjs` is the single gate — it loads the real `engine.js`/`plot.js`/`mslib.js`
(no mocks of the math) and **must exit 0 before any commit**. It enforces, for every model:

1. **simulate runs** at defaults and returns an object; `MODEL_ORDER` and `MODELS` agree.
2. **Every view renders** without throwing — at the playhead head=0 **and** end, for **each lens** —
   onto a recording stub `g`. The stub flags: a heatmap drawn without a colorbar, a non-finite axis
   range, and any non-finite value sampled from `heat`/`image`/`graph` data (bad node/edge included).
3. **Parameter extremes** — `simulate` stays finite at every slider's min and max (including `bool`
   and `enum` choices); the returned data object is scanned for any non-finite number.
4. **A per-model analytic check** — a property the science guarantees (e.g. Hopfield recall at low
   load then a capacity cliff; do(X) recovers the causal slope; the POMDP listen-region widens with the
   penalty; a Hopf bifurcation in Wilson–Cowan). Every model in `MODEL_ORDER` must be in the `checked`
   set or the gate warns.
5. **Per-`MSLIB`-block checks** — each library family has a sanity test (softmax sums to 1, a DoG is
   band-pass, predict/update normalise, …).

This is what the optional edit hook runs after each change (see `MIGRATION.md`); the gate biting is
the contract that "the math you read is the math that runs."

## The `MSLIB` library (`modules/mslib.js`)

`window.MSLIB` is an **optional, reusable library** of canonical building blocks
(`sde, bayes, neuron, decision, rl, psy, efficient, causal, wm, network, osc, belief, vision, attn`)
to compose inside `simulate()`. It is deliberately **broader than the shipped examples** — knowledge
accretes here so the next model is a few lines, not a rebuild. A block (or a function in it, e.g.
`neuron.izhStep`, `rl.kalman`) being unused by a current example is **intended breadth, not dead code**;
each is small, exported, documented in the modelbook, and covered by a block check. Add to it when a
model needs a primitive others will reuse.

## Keep `simulate` honest & fast
- Implement the equations exactly; if a coarse step (Euler `dt`) biases a result, say so
  (the bias is usually `O(√dt)` and vanishes as `dt→0`) rather than hiding it.
- It runs on every slider move, so keep it light; for very large batches (many trials per
  condition on a comparison screen), use `SIM.runChunks(total, doItem, label)` — async chunks +
  loading overlay + supersede-guard — instead of blocking. Most models (curves, a few thousand
  trials) are instant and need none.
- No DOM, no globals beyond the exported helpers — pure functions only, so the same code
  validates in Node.
