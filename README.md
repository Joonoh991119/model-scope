# model-scope

**Turn any parameterised model into an interactive explorer you can think with.**

![model-scope graphical abstract: replicate a model, illuminate it from the angles that fit its class, and compare what changes across parameters and model choices](docs/graphical-abstract.png)

`model-scope` is a [Claude Code](https://docs.claude.com/en/docs/claude-code) marketplace
plugin that builds a self-contained web app for *your* model: one slider per parameter (an
integer parameter acts as a discrete condition selector), and the simulation re-runs live —
shown in views the **model itself defines**. There is no fixed graphic and no fixed axis.
Move a slider, watch the result move, and build intuition by play instead of by re-reading
the equations.

> A **Bayesian observer** draws prior, likelihood, posterior and a central-tendency curve.
> A **leaky integrate-and-fire neuron** draws a *V(t)* trace, a spike raster, and an *f–I* curve.
> A **drift-diffusion** model animates an evidence trajectory and a response-time histogram.
> A **causal-inference**, **working-memory**, **RL**, **attractor-network**, or
> **epidemic** model draws whatever makes *it* intuitive.

It is built for researchers in perception, decision-making, learning, memory, and
single-neuron dynamics who want to *understand* a model by tuning it.

---

## How it works

Give it a paper and the autonomous flow takes over: it reads the reference, **interviews** you
briefly (purpose, scope, which angles, what to compare), **replicates** the model as an interactive
simulator, and chooses the angles that fit the model's class so you can **compare** what changes as
you vary parameters or switch models.

The model is replicated faithfully and shown from the **angles that fit its class** — and a model
with structure (a network's wiring, a CNN's architecture) shows that structure first. Move a slider
or switch the model and read off the qualitative and quantitative difference. (See the per-class
angle catalogue in [`references/levels.md`](skills/model-scope/references/levels.md).)

---

## At a glance

- **Hand it a paper, get a simulator.** `/model-scope:from-paper <paper>` reads the reference,
  **interviews** you about the visualisation purpose and what you want (purpose, scope, which
  angles, what to compare), then builds the GUI and **starts a verified local URL** — with an
  optional shareable tunnel or permanent deploy when the tooling's available. You only supply the
  reference material.
- **Replicate, illuminate, compare — don't reproduce the figure.** Replicate the model, show it from
  the angles that fit its class (structure first where there is structure), and compare what changes
  across parameter sweeps and model choices.
- **Bring your own equations.** Adding a model is *one* declarative entry —
  `params`, a `simulate()` that returns data, and `views[]`. The sliders, the animation transport, and
  the redraw loop are generated for you; you never wire up a control by hand.
- **The model picks the picture.** Each view sets its own axes and draws whatever is
  intuitive: distributions, tuning / psychometric curves, rasters, phase portraits,
  energy landscapes, belief simplices, learning curves.
- **Switch angle, not just play.** A lens switch shows one model from the angles that fit it: a
  decision model gets one trial and the many-trial statistics; a network gets its structure, then
  activity, representation, and landscape; an image/CNN model gets its architecture first, then the
  layer-by-layer transforms — each driven by a continuous playhead or a step-by-step stepper.
- **No build step, no `npm install`, runs from `file://`.** Plain `<script>` tags — open
  `index.html`, or read the source top to bottom (the UI font is a webfont with a system
  fallback). The *same* `engine.js` is re-checked by a Node validation gate, so the math you
  read is the math that runs.
- **Readable by default.** The plotting helper carries the conventions that make a figure
  self-interpretable — axis labels with units, a colorbar on every heatmap, categorical ticks,
  legends that don't occlude data, and a **Text size** control that scales every label (handy for
  talks). It never mixes two units on one axis.
- **Grounded, not invented.** A *modelbook* of canonical families distilled from real
  open-source computational-neuroscience ecosystems, plus a small reusable code library
  (`mslib.js`) to compose from.

---

## What you can build — the examples that ship

The bundled template runs **eighteen** worked models that **span the model scales and classes** —
behavioural / process, single-neuron, sensory / image, network (with plasticity), oscillation, macro,
partial-observability inference, causal graphs, and attention — across every idiom (a continuous playhead, a
process-mode stepper, and the **lens switch**):

| Model | Domain / scale | Idiom | What you watch |
|---|---|---|---|
| **Drift-diffusion decision** | decision-making | lens switch | one update (drift plus noise to new evidence); one trial walking to a bound; the RT histogram building up |
| **Decision: integrate vs one sample** | comparison | sliders + toggle | toggle two models; a speed-accuracy overlay; a metric heatmap over a (drift, noise) grid; accuracy / speed / reward bars; the mechanism |
| **Early vision (orientation)** | sensory / image | lens switch | the filter-bank architecture (oriented Gabor receptive fields), structure first; the input grating; the channels re-representing it; the orientation tuning and decoded angle |
| **Attractor network** | network | lens switch | one pool's recurrent input; the pools racing (winner-take-all); the (S1, S2) energy-landscape heatmap and trajectory |
| **Epidemic (spatial SIR)** | macro / population | lens switch | a space-time kymograph of a travelling infection wave; the S/I/R curves; peak prevalence vs R0 (the epidemic threshold) |
| **Spiking neuron (LIF)** | single-neuron biophysics | lens switch | a V(t) trace integrating to threshold; a spike raster over repeats; the f-I transfer curve (with a refractory toggle) |
| **Reinforcement learning (RW)** | learning | lens switch | one Rescorla-Wagner update; the value learning curve; curves across learning rates |
| **Bayesian observer** | perception / inference | continuous | prior, likelihood, posterior on a stimulus axis; an estimate-vs-true central-tendency curve (with an SD ribbon); trial-to-trial prior updating |
| **Efficient-coding observer** (Wei & Stocker) | perception | process mode | prior, warped encoding, measurement, skewed likelihood, posterior, estimate; bias and discriminability |
| **Causal inference** (Körding et al.) | multisensory | process mode | cues, per-hypothesis likelihoods, p(common cause), branch estimates, combine; the ventriloquism bias |
| **Working-memory recall** (Bays & Husain) | memory | process mode | allocate, encode on a feature wheel, probe, recall; the error histogram; target / swap / guess decomposition |
| **Hopfield memory (Hebbian)** | network / plasticity | lens switch | the weight matrix W (the memories are the wiring), structure first; the stored patterns; a corrupted cue settling into an attractor; recall accuracy vs load (the capacity cliff) |
| **Kuramoto oscillators** | network / oscillation | lens switch | the natural-frequency spread and coupling, structure first; phases racing around a circle; the order parameter r vs coupling K (the synchronization transition) |
| **Belief tracking (Bayes filter)** | inference / partial observability | lens switch | the transition and observation model, structure first; the belief distribution tracking a hidden state over time; tracking error vs observation noise |
| **Ring attractor** | network / working memory | lens switch | the Mexican-hat connectivity, structure first; a localized bump that persists after the cue (working memory); the decoded heading holding the cue; bump width vs the E/I balance |
| **Retina → V1 (layered vision)** | sensory / image (deep stack) | lens switch | the layer-stack architecture and its receptive fields, structure first; the image transformed stage by stage (center-surround, V1 simple, V1 complex); the RF profiles and tuning; output vs the horizontal-cell surround |
| **Causal graph — intervention** | causal inference (Pearl / DAG) | lens switch | the causal DAG (a confounder behind X and Y), structure first; the observed (confounded) association; do(X) vs what you see; the observed-minus-causal gap vs confounding |
| **Self-attention (transformer)** | attention / sequence | lens switch | the attention matrix (who attends to whom), structure first; how one token's output mixes the values; attention sharpness (entropy) vs temperature |

Copy one, swap in your equations, and it is yours.

---

## A tour of the GUI

One harness, many control + view types — every plot is live, so you build intuition by tuning.

**Trial-level animation** — play it and watch evidence accumulate to a bound (drift-diffusion, Trial lens):

![drift-diffusion trial animation](docs/ddm-trial.gif)

<table>
<tr>
<td width="50%"><img src="docs/shots/ddm-step.png" alt="step decomposition with sliders"><br/><b>Sliders and a step view.</b> One update split into signal and noise; every parameter is a live slider (Step lens).</td>
<td width="50%"><img src="docs/shots/vision-transform.png" alt="oriented filter energy maps"><br/><b>Colormaps and the representation.</b> An input image re-represented as oriented-filter energy maps (early vision, Transform lens).</td>
</tr>
<tr>
<td width="50%"><img src="docs/shots/lif-fI.png" alt="LIF f-I curve with a refractory toggle"><br/><b>Toggles and sliders.</b> A boolean toggle (refractory on/off) beside sliders; the f-I transfer curve (LIF, f-I lens).</td>
<td width="50%"><img src="docs/shots/lif-raster.png" alt="LIF spike raster"><br/><b>Spike raster.</b> Repeats stack into a raster with the mean firing rate (LIF neuron, Raster lens).</td>
</tr>
<tr>
<td width="50%"><img src="docs/shots/rl-rate.png" alt="learning curves across learning rates"><br/><b>Multi-condition overlay.</b> Learning curves across learning rates, drawn as coloured lines (reinforcement learning, Rate-sweep lens).</td>
<td width="50%"><img src="docs/shots/ddm-sim.png" alt="response-time histogram building up"><br/><b>Statistics over many trials.</b> The response-time histogram building up, correct above and error below (drift-diffusion, Simulation lens).</td>
</tr>
<tr>
<td width="50%"><img src="docs/shots/compare.png" alt="comparing two decision models via a toggle"><br/><b>Compare models via a toggle.</b> Switch DDM versus single-sample; an overlay, a metric <b>heatmap</b> over a (drift, noise) grid, and metric <b>bars</b>.</td>
<td width="50%"><img src="docs/shots/sir-spread.png" alt="space-time kymograph of a spatial SIR epidemic"><br/><b>Heatmap, a travelling wave.</b> A spatial SIR epidemic as a space-time kymograph (macro scale, Spread lens).</td>
</tr>
<tr>
<td width="50%"><img src="docs/shots/attractor-landscape.png" alt="energy landscape of an attractor network"><br/><b>Heatmap, an energy landscape.</b> A decision network's (S1, S2) flow field with the trajectory rolling into a basin (network scale, Landscape lens).</td>
<td width="50%"><b>Same harness, any scale.</b> These heatmaps (a metric landscape, an epidemic kymograph, a phase-plane flow) all come from the same <code>g.heat</code> and <code>g.colorbar</code>; the eighteen models span behavioural, single-neuron, sensory, network, and macro scales.</td>
</tr>
</table>

Every state is **deep-linkable** for sharing or screenshots: open `index.html?model=lif&lens=raster&head=30`
(`model`, `lens`, `head`, `still=1`, `text=`). The **Text size** control on the left rail scales
every label for talks.

---

## Architecture

There are two layers: the **plugin** you install (a skill, an agent, a command, a
template, and a modelbook) and the **explorer** it produces — a no-build app of four core
files (`index.html`, `engine.js`, `plot.js`, `validate.mjs`) plus an optional
reusable-model library, `mslib.js`, that the bundled examples use.

![How model-scope is built and how it runs](docs/architecture.png)

**The loop.** On any slider change the toolbox (debounced) calls `simulate(params, env)`
once, caches the returned `data`, then calls each view's `draw(g, data, ui)` to redraw. For
sequential models an animation loop advances a playhead and redraws the views; a generation
counter cancels any in-flight playback, so rapid changes never leave stale state on screen.
You normally touch only `engine.js`. The same `engine.js` is re-checked in Node by
`validate.mjs`, so the math you read is the math that runs.

---

## Why a harness — not just a prompt?

You *could* ask a chatbot "write me a simulator for model X" and paste the code back. That result
is a **one-off**: regenerated from scratch each time, unverified, and different on every run.
model-scope is a **harness** instead — it fixes the stable machinery and constrains each model to a
small, validated contract, so the unreliable part (an LLM writing code) is channelled into the one
place that *should* vary: the model's math and its views.

**What's fixed vs. what varies.** The toolbox (`index.html`), the plotting helper (`plot.js`), the
seedable RNG, the transport / lens UI, and the loading + QC machinery are all **fixed and reused**.
The only thing written per model is **one declarative `MODELS` entry** (`params` + `simulate()` +
`views`). There is far less surface to get wrong, and the plumbing can't regress because it is never
rewritten.

**How that structure buys reliability — versus asking a chatbot each time:**

| | ad-hoc "write me a simulator" | a model-scope harness |
|---|---|---|
| **Reproducibility** | non-deterministic; re-runs differ | a seedable per-trial RNG: same seed, same result; any trial is addressable by index |
| **Correctness** | rarely checked; errors ship silently | `node validate.mjs` re-runs the *same* `engine.js` the browser runs, plus analytic checks tied to the science, before it's "done" |
| **Separation of concerns** | math, UI, controls tangled in one blob | pure math (`engine.js`, no DOM), rendering (`plot.js`), toolbox (`index.html`) — edit one, the rest is already proven |
| **Consistency** | every request reinvents controls, axes, layout | every model gets the same sliders, readability conventions, perspectives, and QC for free |
| **Stable change** | adding a feature regenerates the whole app, with fresh bugs | adding a model is one entry; the battle-tested toolbox is untouched |
| **Accumulation** | starts from zero each time | a *modelbook* of canonical families + a reusable `mslib.js` to compose from |
| **Bounded LLM** | free-form code, easy to hallucinate scaffolding | the skill/agent work *inside* the contract + the GUI-QC pipeline — freedom goes to the science, not the plumbing |

In short, a harness turns a stochastic code generator into a **dependable producer** by (1) fixing
the plumbing, (2) constraining output to a validated contract, (3) gating with deterministic checks,
and (4) accumulating reusable parts. It's the same reason engineers reach for a framework + tests
instead of hand-rolling every app: the variance is confined to one small, checked place.

---

## The model contract — add your own model in one entry

A model is a pure, DOM-free object you append to the `MODELS` registry in `engine.js`
(and its id to `MODEL_ORDER`):

```js
mymodel: {
  id:'mymodel', name:'My model',
  blurb:'one plain-language sentence', note:'a key qualitative effect to point out',
  params: [ {name:'sigma', label:'Noise σ', min:0.1, max:3, step:0.01, default:1, unit:'a.u.'}, … ],

  // Run the WHOLE simulation for these parameters and return ANY data the views need.
  // env = { rng, seed, params } — rng is seeded from the seed field, so runs are reproducible.
  simulate: (p, env) => { /* compute curves, samples, fields, sequences… */ return data; },

  // One or more panels; each draws its own axes & graphics via the helper g.
  views: [
    { title:'…', draw:(g, data, ui) => {
        g.frame({ x:[lo,hi], y:[lo,hi], xlabel, ylabel, title });   // YOUR axes
        g.line(pts); g.band(pts); g.bars(hist); g.vline(x); g.heat(…); g.raster(…);
        // ui = { head, playing, params, frac, stage, stageKey, stages, nStages } — read it to animate
    }},
  ],

  // OPTIONAL — choose ONE if the model is sequential:
  anim:   { length:(p,data)=> N },              // continuous playhead: ui.head ∈ [0,N]
  stages: (p,data)=> [ {key,name,about}, … ],   // process mode: a step-by-step stage stepper
}
```

The control rail, the simulate-on-change loop, the transport, and the view grid are all
generated from this one entry — you never wire up a control or a redraw by hand. (A
histogram, like any graphic, is drawn inside a view with `g.bars` + `Plot.histify`.) Why
this shape works:

- **`simulate` returns whatever you want** — distributions, a tuning curve, sampled
  trajectories, a 2-D field, a trial-by-trial sequence. The views interpret it; this is
  what removes the fixed-graphic constraint.
- **`views` own their axes.** One view can be a density on a stimulus axis, the next an
  estimate-vs-true curve, the next a heatmap.
- **`anim` / `stages` are optional.** A static curve that depends only on parameters needs
  neither — it just redraws on slider change.

### The two animation idioms

| | `anim` — continuous | `stages` — process mode |
|---|---|---|
| **Transport** | play, pause, fast-forward, scrub | step-by-step, with a stage-named readout |
| **Playhead** | `ui.head` in [0, length] — a trial, a time, an iteration | `ui.stage` — the current pipeline step |
| **Reach for it when** | trials accumulate, evidence drifts, a value updates | you want to *see each computation in sequence* |
| **Example** | drift-diffusion; the Bayesian observer's prior updating | the efficient-coding, causal-inference and working-memory pipelines |

### Angles (`lenses`)

A model can declare `lenses` and the toolbox shows a **lens switch** that views the same
simulation from several **angles** chosen for the model's class — the lens keys are free. A
decision model: one update, one trial, the statistics. A network: structure, activity,
representation, landscape. A vision model: architecture, layer transforms. Where there is
structure, show it first. The template's drift-diffusion, attractor, and early-vision models are
the worked exemplars; see [`references/levels.md`](skills/model-scope/references/levels.md).

### Scaling to a whole paper — screens and conditions

A whole paper isn't one grid: each entry in `MODEL_ORDER` is a **top tab (a screen)**, so you
build the paper as a few screens — a mechanism screen, then condition comparisons (sweep one
experimental condition at fixed model parameters), then the key prediction. Keep **experimental
conditions** (swept across fixed levels) separate from **model parameters** (sliders), and make
the comparison the payoff: read off what changes across the sweep. Heavy comparison screens stream
their trials via `SIM.runChunks` behind a loading overlay. See
[`references/gui-qc.md`](skills/model-scope/references/gui-qc.md).

See [`references/plotting.md`](skills/model-scope/references/plotting.md) for the full `g`
API and worked view recipes,
[`references/architecture.md`](skills/model-scope/references/architecture.md) for the model
contract and runtime, and [`references/gui-qc.md`](skills/model-scope/references/gui-qc.md) for
the GUI QC pipeline (static gate + visual checklist + two-axis review) every build passes.

---

## Install

From inside Claude Code, once the repo is on GitHub:

```
/plugin marketplace add Joonoh991119/model-scope
/plugin install model-scope@joonoh-modeling
```

Or from a local clone — point the marketplace at the cloned folder (a path relative to your
Claude Code working directory, or an absolute path):

```bash
git clone https://github.com/Joonoh991119/model-scope
```
```
/plugin marketplace add ./model-scope          # or an absolute path to the clone
/plugin install model-scope@joonoh-modeling
```

## Use

**Hand it a paper (the autonomous flow).** Give it *only* the reference material — it interviews
you about what you want, then builds the GUI and starts a verified local URL, with an optional
shareable tunnel or permanent deploy when the tooling is available:

```
/model-scope:from-paper ./furman-wang-2008.pdf
```

The `paper-to-sim` skill reads the reference, runs a short `AskUserQuestion` interview (purpose,
scope, which angles to show, what to compare, constraints) with defaults drawn from the paper,
then drives the build + QC and verifies the local URL before reporting it. It
also triggers on plain language — *“turn this paper into an interactive sim”*, *“interview me and
build a simulator from these equations.”*

**Or describe a model directly.** The `model-scope` skill triggers and the `model-gui-builder`
agent can take it end to end:

> *“Build me a GUI to explore a leaky integrate-and-fire neuron as I vary the input current
> and the noise.”*

To start from the template by hand:

```
/model-scope:scaffold ./my-sim "a leaky integrate-and-fire neuron"
```

Then `cd ./my-sim`, run `node validate.mjs` to check it, and open `index.html` to use it.

---

## The modelbook — canonical model families

Don't invent a model from scratch when a canonical family fits.
[`references/modelbook/`](skills/model-scope/references/modelbook/INDEX.md) is a curated,
extensible catalogue: for each family it gives the canonical equations, parameters with
their meaning and typical ranges, the views that make it intuitive, a ready-to-compose
`MSLIB` code module, and source pointers.

| Family | Use it for | `MSLIB` |
|---|---|---|
| **Bayesian / ideal observer** | perception, magnitude & time estimation, central tendency, prior learning | `bayes` |
| **Efficient coding & sequential observers** | prior-shaped encoding, repulsive/anti-Bayesian bias, bias vs discriminability | `efficient`, `bayes` |
| **Causal inference & Bayesian cognition** | multisensory fusion, ventriloquism, cue combination, concept learning | `causal` |
| **Working memory & mixture models** | continuous report, precision / capacity, swap errors, von Mises mixtures | `wm` |
| **Evidence accumulation & attractor decision** | 2AFC decisions, RT distributions, speed–accuracy, winner-take-all | `decision`, `sde` |
| **Single neurons & small networks** | membrane dynamics, *f–I* curves, spike trains, gain | `neuron` |
| **Reinforcement learning & belief update** | value learning, choice, volatility, prior updating | `rl` |
| **Psychometrics & detection** | psychometric curves, SDT, thresholds, scalar timing | `psy` |
| **Recurrent networks & plasticity** | associative memory, attractor dynamics, Hebbian learning, capacity | `network` |
| **Oscillations & synchronization** | coupled oscillators, phase-locking, neural-mass rhythms, sync transitions | `osc` |
| **Belief tracking & partial observability** | Bayes filters / HMMs, belief evolution, volatility | `belief` |
| **Vision & layered sensory** | image input, oriented-energy / DoG / CNN stacks, receptive fields | `vision` |
| **Causal graphs & interventions** | structural causal models / DAGs, the do-operator, confounding, treatment effects | inline |
| **Attention & transformers** | self-attention, content-based routing, the attention matrix, temperature / heads | `attn` |

These are **recipes, not prescriptions** — start from a family, then adapt it to your exact
equations and compose the small `MSLIB` functions rather than copying a whole repo. The
families are distilled from named open-source ecosystems for grounding and deeper
reference: Acerbi lab (observer modelling + PyVBMC / PyBADS / PyIBS fitting), Wang lab
(the reduced Wong–Wang decision circuit), Gardner lab (psychophysics, the normalization
model of attention), Stocker & Wei Ji Ma labs (efficient-coding observers), Körding & Shams
labs (Bayesian causal inference, `bcitoolbox`), Bays lab / MemToolbox (working-memory
mixtures), and Brian2 / *Neuronal Dynamics* / Neuromatch (canonical neuron models).

---

## Validation & reproducibility

- **Math implemented as given.** The method's rule is to transcribe the equations exactly,
  never re-derive them from memory, and to *state* any discretisation bias (e.g. an Euler
  step's `O(√Δt)` boundary bias) rather than hide it.
- **Reproducible.** A seedable RNG makes every run deterministic; trial-based models seed
  each trial independently as `trialRng(seed, k)`, so the player can jump straight to trial *k*.
- **Validated.** `validate.mjs` re-evaluates the *same* `engine.js` the browser runs and
  checks that every model's `simulate()` returns sane data and every view is a function,
  plus a per-model analytic check where one exists — a Bayesian reliability weight in
  (0, 1), and a drift-diffusion error rate within tolerance of the closed form
  `1/(1 + e^{2Az/c²})`. It then sanity-checks the `mslib.js` building blocks (an *f–I* curve
  that increases monotonically, a Wong–Wang unit winning at positive coherence,
  Rescorla–Wagner converging, and more). It must pass before a model is "done".
- **GUI QC pipeline.** Beyond the static gate, every build walks
  [`references/gui-qc.md`](skills/model-scope/references/gui-qc.md): a **visual checklist**
  (no clipped/overlapping text, ceiling/chance reference lines, accuracy clamped to `[chance,1]`,
  units on every axis, legends off the data, a colorbar on every heatmap, a loading overlay on
  heavy screens) and a **two-axis review pass** (scientific-plot readability + concept clarity) —
  fix and re-verify.

```bash
node skills/model-scope/assets/template/validate.mjs   # prints: ALL CHECKS PASSED
```

---

## Repository layout

```
model-scope/
├── .claude-plugin/              plugin.json + marketplace.json (the repo root is both)
├── agents/
│   └── model-gui-builder.md     the subagent that builds an explorer end-to-end
├── commands/
│   ├── scaffold.md              /model-scope:scaffold <dir> [model idea]
│   └── from-paper.md            /model-scope:from-paper <paper> (interview, build, serve)
├── skills/paper-to-sim/
│   └── SKILL.md                 the autonomous flow: ingest reference, interview, build, serve
└── skills/model-scope/
    ├── SKILL.md                 the method (auto-loaded when you ask to build a model GUI)
    ├── references/
    │   ├── architecture.md      the model contract + runtime, in detail
    │   ├── plotting.md          the g API + view recipes + readability conventions
    │   ├── levels.md            the per-class angle catalogue (replicate, illuminate, compare)
    │   ├── gui-qc.md            the QC pipeline: static gate + visual checklist + review
    │   └── modelbook/           one file per canonical family + INDEX.md
    └── assets/template/         the app you copy & extend
        ├── README.md            quick-start for the copied app
        ├── index.html           the toolbox — sliders, the loop, the transport (untouched)
        ├── engine.js            seedable RNG + the MODELS registry   (you edit this)
        ├── plot.js              the canvas charting helper g
        ├── modules/mslib.js     optional reusable model library (MSLIB)
        └── validate.mjs         the Node correctness gate
```

---

## Design lineage

The pattern was distilled from a full drift-diffusion decision simulator (after Bogacz,
Brown, Moehlis, Holmes & Cohen, 2006) — a seedable per-trial RNG, a trial-by-trial player, and
fixed-axis histograms — and generalised into a builder for any model.

---

MIT licensed, Joonoh Park ([joonop99@snu.ac.kr](mailto:joonop99@snu.ac.kr))
