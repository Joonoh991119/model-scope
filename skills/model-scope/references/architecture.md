# Architecture & the model contract (detail)

## Why classic scripts, no build

`plot.js`, `engine.js` and `examples.js` are **classic scripts** (`window.Plot`, `window.SIM`), not ES
modules, so `index.html` loads them from `file://` (modules are CORS-blocked there).
They are also `eval`-able in Node, so `validate.mjs` tests the *same* math and the *same*
`plot.js` the app runs. No bundler, no install — a researcher opens or reads it directly.

**Zero external resources.** `index.html` loads no CDN, font, or analytics — only its local
scripts (`plot.js`, `modules/mslib.js`, `engine.js`, and optionally `examples.js`). Fonts fall back to the system UI /
monospace stack (`IBM Plex …, system-ui` / `…, ui-monospace`), so the app is self-contained
and works offline. Nothing to delete, nothing to phone home.

**One page, when a host wants one.** `bundle.mjs` (optional, plain Node, never needed to run or
edit the app) inlines the style and every script `index.html` loads and writes `bundle.html`. The
default output is a fragment with no doctype, `<html>`, `<head>` or `<body>`, which is what a host
that wraps pages expects (a Claude Artifact, for example); `--standalone` writes a complete
document to open or send as one file; `--title "Two To Four Words"` names the page. It is still
the same classic scripts, only inlined, so nothing about the model code changes.

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
4. A generation counter (`S.gen`, mirrored to `window.__simGen`) is bumped whenever `simulate()`
   is run again (a slider move, a model switch, Re-simulate), which makes superseded async work
   bail — so rapid slider drags or model switches never interleave stale state. A **lens switch
   does not bump it**: the data is the same, so a `runChunks` computation that is still filling in
   keeps going while the other lens is shown. Stopping playback and superseding a simulation are
   separate operations (`stopPlayback()` and `supersede()` in `index.html`).
5. For **heavy** screens it exposes a loading overlay: `window.__setLoading(on,prog,label)`,
   `window.__redraw()` (the last chunk landed: bind the lens again from the finished data),
   `window.__simFailed(error)` (a later chunk threw: show it where the views would be) and
   `window.__simGen` (the live generation). `SIM.runChunks` in `engine.js` uses them: a
   `simulate()` returns `{loading:true}` immediately and the batch fills in across frames;
   playback starts once it is done. In Node (no rAF) `runChunks` runs synchronously, so the same
   code validates.

6. If `simulate()` throws or returns no object, the view area says so (with the message) instead
   of showing blank panels, and the views come back as soon as it runs again.
7. It remembers each model's parameter values and lens while the page is open, keeps the active tab
   inside the tab strip, and stops auto-play when the system asks for reduced motion (also when
   that setting changes while the page is open).

### Links

| form | meaning |
|---|---|
| `#<modelId>` or `#<modelId>-<lensKey>` | the model and lens. Read on load and on `hashchange`; rewritten with `history.replaceState` as you navigate. A plain `#name` is the only link state a hosted page (for example a Claude Artifact) passes through, which is why ids should stick to letters, digits and hyphens. |
| `?model=&lens=` | the same, as a query (kept for existing links and screenshot commands; the hash wins if both are given) |
| `?p.<name>=<value>` | a parameter of that model: a number (clamped to the control's range), `1`/`0` for a toggle, an option label or index for an `enum` |
| `?seed=` | the RNG seed |
| `?head=N`, `?still=1` | open paused at playhead `N`, or at the last frame |
| `?text=1.4` | plot text size |

The query describes the state to **open** with and is applied once; when you then click another tab
or lens the address becomes the plain `#model-lens` form. The **Copy link** button builds the full
link (query plus hash) for the current model, lens, seed and every parameter that differs from its
default.

### Pin and compare

The **Pin** button (beside Reset) keeps the current `{params, seed, data}` for that model while the
page is open. Every view card then shows two panes, the live canvas and the pinned reference (a
dashed edge and a "pinned" tag), side by side, stacked below 700 px. One line above the views names
what differs ("Pinned → now: <label> a → b, seed x → y"). The reference is drawn by the same
`draw(g, data, ui)` with the pinned data, at the live stage or the same fraction of the run, and is
redrawn on resize and text-size change. **Unpin** restores the normal layout. Pins are not part of
links. Pin is disabled while a `runChunks` computation is loading or after a `simulate()` error. No
model needs any code for it.

### Naming the page

An app built for one paper can set `SIM.APP = { title: 'Wei & Stocker 2015', tagline: 'efficient
coding predicts repulsion' }` in `engine.js`; the toolbox uses it for the heading and the page title.

### Accessibility the toolbox provides

One `<h1>`, a `<main>` landmark, a named control for every parameter (slider and number field), a
`role="img"` name on every canvas taken from the view's `title` (so write titles that say what the
view shows), a polite live region that announces pause, step and end (never every frame), a play
button whose label toggles, a visible focus ring, and text at 4.5:1 or better. At phone width the
layout is one column with the plots before the controls. What it cannot provide is a text
alternative for the *content* of a plot; the model's `note` and each lens's `about` carry that.

**Multiple models = screens.** Each `MODEL_ORDER` entry is a top tab. A whole paper is built
as a few screens (mechanism → condition comparisons → prediction), each its own `MODELS` entry
— see the skill's "Scaling to a whole paper". You normally never touch `index.html` — adding a
screen is purely an `engine.js` edit.

## Where models live: `engine.js` and `examples.js`

`engine.js` is the core (RNG, `npdf`, `runChunks`, the registry) and the place a researcher's own
models go: an entry in `MODELS`, its id in `MODEL_ORDER`. `examples.js` holds the twenty-one worked
examples and calls `SIM.register(models, order)`, which appends them after whatever `engine.js`
already registered, so your models come first in the tab order. The first model registered under an
id keeps it.

`examples.js` is optional. To ship an app that holds only your own models, delete `examples.js`,
`examples.checks.mjs` and the `examples.js` script line in `index.html`. Nothing else
refers to them. With no model registered at all, the page shows a short message that says where to
add one, and the gate fails with the same message.

Analytic checks sit next to the script that registers the model: for every `X.js` the page loads,
`validate.mjs` imports `X.checks.mjs` if it exists. `engine.checks.mjs` is yours (it ships
empty; the template README shows a worked check); `examples.checks.mjs` holds the checks for the examples. Each is a table keyed
by model id, and an entry runs only when that model is registered.

## The validation gate (`validate.mjs`)

`node validate.mjs` is the single gate, and it **must exit 0 before any commit**. It reads the
`<script src>` list out of `index.html` and evaluates those files in that order, with the **real**
`plot.js` drawing onto a recording canvas stub, so the math and the views it checks are the ones the
page runs (no mocks, no hand copies). It is deterministic: seeded RNG only, no clock, so two runs
print the same text. Layers:

0. **Page** — every listed script exists and loads; `index.html` and the scripts reference no other
   host and no network API (`fetch`, `XMLHttpRequest`, `WebSocket`, `import()`, …), so the app keeps
   working offline from `file://`; the inline toolbox script parses; and, when `bundle.mjs` is
   present, the single page it would write is self-contained (no doctype or wrapper tags, no file
   or host reference left, one `<title>` of two to four words, every inlined script parses).
1. **Schema** — for every model: `id` equals its `MODELS` key, uses only letters, digits, `_`, `-`,
   and is not a reserved link name; parameter names are unique identifiers with a label; numeric
   controls have `min < max`, `step > 0` and a default inside the range; `enum` and `bool` controls
   are well-formed; every view has a `title` and a `draw`; every lens has a `label`. `MODEL_ORDER`
   and `MODELS` agree.
2. **simulate** runs at defaults, returns an object, and returns the *same* data for the same seed.
3. **Every view renders** without throwing — at the start, middle **and** end of its playhead, for
   **each lens**. The gate flags a heatmap drawn without a colorbar, a non-finite axis range, a
   non-finite value sampled from `heat`/`image`/`graph` data, and a view that draws only axis
   furniture (no data mark) at the end of its playhead.
4. **Parameter extremes** — at every control's min and max (including `bool` and `enum` choices)
   `simulate` stays finite (the returned object is scanned) and every view still draws.
5. **A per-model analytic check** — a property the science guarantees, checked against an
   independent reference where one exists (the drift-diffusion error rate and mean decision time
   against the closed forms; SIR mass conservation; the Bayes-filter trajectory against a second
   forward recursion; do(X) recovering the causal slope; a Hopf bifurcation in Wilson–Cowan). The
   checks are tables keyed by model id in `engine.checks.mjs` (yours) and `examples.checks.mjs`,
   and run only for registered models. A model without one, or with one that asserts nothing, is
   a counted warning, not a failure.
6. **Per-`MSLIB`-block checks** — each library family has a test (softmax sums to 1, a DoG is
   band-pass, predict/update normalise, the Wong–Wang constants match the documented table, …).

Opt-in regression lock for your own models: `node validate.mjs --snapshot my.json` writes digests of
`simulate()` at defaults and every extreme; `node validate.mjs --against my.json` fails if any of
them changed. Use it before a refactor.

The gate biting is the contract that "the math you read is the math that runs." What it cannot see
is the toolbox running in a browser; open `index.html` for that (see `gui-qc.md`).

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
