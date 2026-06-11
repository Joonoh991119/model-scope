# model-scope — continuation / migration prompt

A self-contained handoff so any new session (Claude or **Fable**) can pick up the work without
re-deriving state or stepping on in-flight edits. Paste the **Resume prompt** below into a fresh
agent, or just read this file (the SessionStart hook points here automatically).

---

## Resume prompt (copy-paste)

> You are continuing work on **model-scope**, a Claude Code marketplace plugin at
> `~/CompNeuroGUI/model-scope` (GitHub `Joonoh991119/model-scope`). It builds a self-contained,
> no-build web GUI that turns any parameterised model into an interactive explorer.
> **Philosophy:** replicate a model faithfully, illuminate it from the angles that fit its *class*
> (structure-first where there is structure), and let the user compare what changes across parameter
> and model choices — NOT pixel-match a figure, NOT one universal pipeline.
> The template ships **21 worked models** (see list below). Before editing, read
> `skills/model-scope/references/architecture.md` (the contract + the gate). **Always run
> `node validate.mjs` and keep it green before committing.** Edit only `engine.js` (the math/registry),
> `plot.js`, or `modules/mslib.js`; never hand-wire UI. Keep README prose free of emojis/symbols
> (Greek + math are fine). Continue with: <state the next task>.

---

## Where things are

```
model-scope/
  .claude-plugin/{plugin.json, marketplace.json}   # version — bump BOTH together
  README.md                                         # researcher-facing; no emojis in prose
  docs/{architecture,graphical-abstract}.{drawio,png}  # .drawio = editable source of the .png
  docs/{ddm-trial.gif, shots/}                      # README gallery assets
  skills/model-scope/
    SKILL.md                                         # the build playbook
    references/{architecture,plotting,levels,gui-qc}.md
    references/modelbook/                            # per-family knowledge (12 families + INDEX)
    assets/template/                                 # THE app you copy + edit
      index.html      # toolbox (sliders, lenses, transport). Rarely edited. No external resources.
      plot.js         # window.Plot — frame + primitives (line/band/bars/heat/image/graph/raster/…)
      engine.js       # window.SIM — RNG + the MODELS registry + MODEL_ORDER.  *** edit this ***
      modules/mslib.js# window.MSLIB — reusable library (compose inside simulate)
      validate.mjs    # the gate: node validate.mjs
    commands/, agents/
```

## The model contract (one place to edit)

One `MODELS` entry + its id in `MODEL_ORDER`: `params` (slider / `type:'bool'` / `type:'enum'`),
`simulate(p,env)→data` (pure, Node-eval-able), and `views[]` — or `lenses:{angle:{label,about,views,
anim?|stages?}}` for several angles on one `simulate()`. `anim:{length}` = continuous playhead;
`stages` = process-mode stepper. Full detail in `references/architecture.md`.

## The 21 shipped models (class coverage)

bayes · efficient · causal · wm · ddm · compare · vision · lif · rl · attractor · sir · hopfield ·
kuramoto · belief · ring · retina · causalg · attention · pomdp · wilson · mha — spanning
behavioural/process, single-neuron, network (+plasticity / continuous-attractor), oscillation
(Kuramoto phase + Wilson–Cowan E/I), macro/field, vision/CNN (single + deep stack), RL,
belief filtering **and** POMDP control, causal DAG (do-operator), and attention (single + multi-head).

## The validation gate — `node validate.mjs` (must exit 0 before commit)

Per model: simulate runs; **every view renders** (head 0 and end, per lens) with finite axes, a
colorbar on every heatmap, and finite heat/image/graph data; **finite at every slider extreme**
(incl. bool/enum) with a non-finite data scan; **a per-model analytic check**; and **per-MSLIB-block
checks**. The PostToolUse hook runs this automatically on each template edit and blocks on failure.

## Working rules (Fable-safe — avoid conflicts)

1. **One writer.** Only the main session edits the template. **Fable & Codex agents are read-only
   reviewers** — spawn them to review/critique, then YOU apply the fixes. Never run two writers on the
   template at once; if you must parallelise, give each agent its own `isolation: "worktree"`.
2. **Gate before commit, always.** `node validate.mjs` green; the hook also enforces it.
3. **Version discipline.** Bump `plugin.json` AND `marketplace.json` together; commit message states
   what changed + the new version; push to `main`.
4. **Browser-verify** new/changed views (headless Chrome screenshot via a deep link
   `index.html?model=ID&lens=KEY&head=N&still=1`) — read the image, don't assume.
5. **Conventions.** Structure-first lenses; no emojis/symbols in README prose; never mangle loanwords;
   `mslib` breadth (unused-by-example blocks) is intentional, not cruft — don't delete it.
6. **Review cadence.** For substantial changes, run a Fable regression pass + a Codex `gpt-5.5`
   code/math pass, apply findings, re-validate, then commit (this is how the last several rounds ran).

## Useful commands

```bash
cd skills/model-scope/assets/template
node validate.mjs                       # the gate
python3 -m http.server 8800             # serve, then open index.html?model=ddm
# headless screenshot (read the PNG):
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu \
  --window-size=1320,760 --virtual-time-budget=6000 --screenshot=/tmp/shot.png \
  "http://localhost:8800/index.html?model=pomdp&lens=policy&still=1"
```

## Open directions (not started — pick per request)

- Deeper variants of covered classes (e.g. a heavy model that actually exercises `SIM.runChunks`;
  dot-product Q/K/V attention; a multi-state POMDP).
- A fresh Fable/Codex regression pass on the full 21-model harness.
- Whatever the researcher (J, SNU CSNL) asks next — replicate their paper via
  `/model-scope:from-paper`.

_Last handoff: 21 models, plugin v1.21.0, gate green, pushed to `main`._
