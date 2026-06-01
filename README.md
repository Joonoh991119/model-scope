# model-scope

A Claude Code **marketplace plugin** for building interactive scientific-modeling GUIs.

> Turn **any** parameterised model into a self-contained web app where you move a slider
> per parameter (or flip a condition) and **watch the simulation result change** — shown
> in views the *model* defines. There is no fixed graphic or axis: a Bayesian observer
> draws prior/likelihood/posterior + a central-tendency curve + trial-to-trial prior
> updating; a neuron draws a V(t) trace + spike raster + f–I curve; a decision model
> animates an evidence trajectory + an RT histogram; a POMDP/saccade/RL/population model
> draws whatever makes it intuitive.

It is a toolbox for building simulators that help researchers *understand* a model by
playing with it — Bayesian/ideal-observer, neuron, drift-diffusion & other decision
models, reinforcement learning, POMDP, saccade/oculomotor, population/epidemic,
dynamical-systems, or any Monte-Carlo process.

## What's inside

| Component | What it does |
|---|---|
| **Skill** `model-scope` | The method: a 4-file, no-build architecture (`plot.js` charting helper + pure-math `engine.js` + schema-driven `index.html` + Node `validate.mjs`), the `params` + `simulate()→data` + `views[]` model contract (each view defines its own axes/graphics), two animation idioms — a continuous `anim` playhead **and** a discrete `stages` *process-mode* stepper that walks a model's internal pipeline — and view recipes (distributions, tuning curves, trajectory+histogram, rasters, heatmaps/energy landscapes, learning sequences, process pipelines). Auto-triggers when you ask to build/explore a model GUI. |
| **Agent** `model-gui-builder` | A subagent that builds one of these GUIs end-to-end from a model description, choosing the views that make the model intuitive. |
| **Command** `/model-scope:scaffold` | Scaffolds a new model explorer from the bundled template into a target folder, ready to edit. |
| **Template** (`skills/model-scope/assets/template/`) | A working reference app with **five** worked example models spanning both idioms — *continuous*: a **Bayesian observer** (prior/likelihood/posterior + central-tendency + prior-update) and a **drift-diffusion decision** (animated trajectory + RT histogram); *process-mode* (step through the pipeline): an **efficient-coding observer** (Wei & Stocker), a **causal-inference observer** (Körding), and a **working-memory mixture** model (Bays & Husain) — copy & extend with one registry entry. |
| **Modelbook + `mslib.js`** | A curated, extensible catalogue of canonical model families — Bayesian/ideal observer, **efficient coding & sequential observers** (Wei Ji Ma, Stocker, Luu), **causal inference & Bayesian cognition** (Ernst & Banks, Körding, Tenenbaum), **working memory** (Zhang & Luck, Bays & Husain), decision circuits (Wong–Wang), spiking neurons (LIF/Izhikevich), reinforcement learning, psychophysics/SDT — in `skills/model-scope/references/modelbook/` (equations · parameters · per-stage views · verified open-source sources: Acerbi/Wang/Gardner/Stocker/Bays/MemToolbox/bcitoolbox/Brian2), plus a small reusable code library `mslib.js` (`sde·bayes·neuron·decision·rl·psy·efficient·causal·wm`) you compose inside `simulate()`. Designed as decoupled modules, not overfit to any one paper. |

## Install

```bash
# from inside Claude Code
/plugin marketplace add /Users/joonoh/CompNeuroGUI/model-scope     # local path (or a git URL once pushed)
/plugin install model-scope@joonoh-modeling
```

Then just ask, e.g. *"build me a GUI to explore a leaky integrate-and-fire neuron as I
vary the input current and noise"* — the `model-scope` skill triggers, or run
`/model-scope:scaffold ./my-sim` to start from the template.

## Publish / share

This folder is a self-contained marketplace **and** plugin (the plugin lives at the
repo root, `source: "./"`). To share it:

```bash
cd /Users/joonoh/CompNeuroGUI/model-scope
git init && git add -A && git commit -m "model-scope plugin v1.0.0"
gh repo create model-scope --public --source=. --push      # or push to any git host
```

Collaborators then run `/plugin marketplace add <your-org>/model-scope` and
`/plugin install model-scope@joonoh-modeling`.

## Design lineage

The pattern was distilled from a full DDM/TAFC simulator (the *Decision Lab*): seedable
per-trial RNG for instant, reproducible, addressable trials; a trial-by-trial player
(restart · play · fast-forward · scrub); fixed-axis, Δt-aligned histograms; and a
rank-equalised energy-landscape colour map (yellow = attractor / valley, blue = ridge)
for 2-D models with a bifurcation. See the skill for the full rationale.

MIT licensed.
