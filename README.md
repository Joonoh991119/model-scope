# model-scope

A Claude Code **marketplace plugin** for building interactive scientific-modeling GUIs.

> Turn a model — *any* model whose state evolves stochastically and produces an
> outcome — into a self-contained web app where you move a slider per parameter and
> **watch what happens on each trial**: one trial's trajectory unfolds, and when it
> resolves a count drops into the outcome histogram; repeat *n* times to build the
> distribution. Optional 2-D phase-plane and energy-landscape views.

It generalises the Bogacz, Brown, Moehlis, Holmes & Cohen (2006) two-alternative
decision-model simulator into a reusable pattern: drift-diffusion, race, accumulator,
random walk, population/epidemic, predator–prey, integrate-and-fire, or any Monte-Carlo
process.

## What's inside

| Component | What it does |
|---|---|
| **Skill** `model-scope` | The method: a 3-file, no-build architecture (pure-math `engine.js` + schema-driven `index.html` + Node `validate.mjs`), a model-registry interface, a trial-by-trial player, light-theme canvas rendering, and the optional 2-D phase/energy-landscape recipe. Auto-triggers when you ask to build/explore a model GUI. |
| **Agent** `model-gui-builder` | A subagent that builds one of these GUIs end-to-end from a model description (equations + parameters). |
| **Command** `/model-scope:scaffold` | Scaffolds a new model GUI from the bundled template into a target folder, ready to edit. |
| **Template** (`skills/model-scope/assets/template/`) | A working, generalised reference app with three example models (biased random walk, stochastic logistic growth, two-population competition) — copy it and edit one registry entry to add your own. |

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
