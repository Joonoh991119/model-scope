# model-scope: maintainer handoff

A self-contained handoff so a new session (any agent or person) can pick up work on the plugin
without re-deriving its state. Paste the **Resume prompt** into a fresh session, or just read this
file. What changed in each release is in [CHANGELOG.md](CHANGELOG.md).

---

## Resume prompt (copy-paste)

> You are continuing work on **model-scope**, a Claude Code marketplace plugin (GitHub
> `Joonoh991119/model-scope`). It builds a self-contained, no-build web GUI that turns any
> parameterised model into an interactive explorer. **Philosophy:** replicate a model faithfully,
> illuminate it from the angles that fit its *class* (structure first where there is structure), and
> let the user compare what changes across parameter and model choices; not a pixel-match of a
> figure, not one universal pipeline. The template ships **21 worked models**. Before editing, read
> `skills/model-scope/references/architecture.md` (the contract and the gate). Run
> `node validate.mjs` in the template and `node tests/run.mjs` at the root, and keep both green
> before committing. A researcher's models go in `engine.js`; the worked examples are in
> `examples.js`; never hand-wire UI. Keep README prose free of emojis. Continue with: <the next task>.

---

## Where things are

```
model-scope/
  .claude-plugin/plugin.json        # the plugin manifest; its "version" is the only plugin version
  .claude-plugin/marketplace.json   # the marketplace (repo root = plugin root); no plugin version here
  README.md, CHANGELOG.md, MIGRATION.md
  docs/                             # *.drawio = editable sources of the *.png; shots/ + ddm-trial.gif = README gallery
  commands/{scaffold,from-paper}.md # user-typed only (disable-model-invocation)
  agents/model-gui-builder.md       # model: inherit; returns open questions to the caller
  skills/paper-to-sim/SKILL.md      # reference -> interview -> build -> deliver
  skills/model-scope/
    SKILL.md                        # the build playbook
    references/{architecture,plotting,levels,gui-qc}.md
    references/modelbook/           # 14 families + INDEX.md
    assets/template/                # THE app a user copies
      index.html        toolbox (sliders, lenses, transport, links, Pin). No external resources.
      engine.js         window.SIM: RNG, runChunks, the MODELS registry. A researcher's models go here.
      engine.checks.mjs analytic checks for those models (ships as a commented example)
      examples.js       the 21 worked examples, registered after engine.js's models (optional)
      examples.checks.mjs their analytic checks
      plot.js           window.Plot: frame + primitives, histify, nearestY, ramp, RAMPS, TH
      modules/mslib.js  window.MSLIB: reusable building blocks
      validate.mjs      the gate
      bundle.mjs        optional: the app as one self-contained page
  tests/                            # developer checks; never shipped inside a generated app
  evals/                            # authored eval cases for `claude plugin eval` (not run yet)
```

`skills/model-scope/`, `skills/paper-to-sim/`, `commands/scaffold.md`, `commands/from-paper.md` and
`agents/model-gui-builder.md` are vendored by another repository at exactly these paths, which
rewrites the literal `model-scope:` prefix. So: keep these paths; anything the template needs lives
inside `skills/model-scope/`; refer to plugin files as `${CLAUDE_PLUGIN_ROOT}/skills/model-scope/...`
(or `${CLAUDE_SKILL_DIR}/...` inside the model-scope skill); write the literal `model-scope:` only in
the two command names.

## The model contract (one place to edit)

One `MODELS` entry plus its id in `MODEL_ORDER`: `params` (sliders, `type:'bool'`, `type:'enum'`),
`simulate(p,env)→data` (pure, runs in Node) and `views[]`, or
`lenses:{angle:{label,about,views,anim?|stages?}}` for several angles on one `simulate()`.
`anim:{length}` is a continuous playhead; `stages` is the process-mode stepper. Full detail in
`references/architecture.md`.

## The 21 shipped models

bayes, efficient, causal, wm, ddm, compare, vision, lif, rl, attractor, sir, hopfield, kuramoto,
belief, ring, retina, causalg, attention, pomdp, wilson, mha: behavioural/process, single-neuron,
network (plasticity, continuous attractor), oscillation (Kuramoto, Wilson–Cowan), macro, vision
(single and deep stack), RL, belief filtering and POMDP control, a causal DAG, and attention (single
and multi-head).

## Checks

```bash
cd skills/model-scope/assets/template && node validate.mjs   # the gate (shipped; ~10 s)
node tests/run.mjs                                         # gate, baseline, mutation probe, bare app, docs, plugin validate (~1 min)
node tests/run.mjs --browser                               # + headless-Chrome smoke (needs Playwright, see tests/README.md)
node tests/docs-check.mjs                                  # counts, names and paths in the docs match the code
claude plugin validate .
```

- The gate must pass at every commit and may only get stricter.
- `tests/baseline/v1.21.1.json` locks the numbers and drawing of the 21 examples. A difference in its
  schema or simulate sections is a behaviour change: allowed only as a verified correction, with the
  evidence in the commit and in CHANGELOG.md. The draw section is re-recorded only in a commit that
  deliberately changes drawing, together with `node tests/shots.mjs` for the README gallery.
- Nothing runs these for you: there is no plugin hook. Run them yourself.

## Working rules

1. **One writer.** Only one session edits the template at a time. Reviewers (other agents or
   models) read and report; their findings are claims to verify against the code, not facts.
2. **Version discipline.** Bump `version` in `.claude-plugin/plugin.json` only (it overrides any
   marketplace entry), and add a CHANGELOG.md entry. Work on a branch; the owner merges.
3. **Look at the page.** For a new or changed view, open it (a deep link such as
   `index.html#ddm-sim` or `index.html?model=ddm&lens=sim&still=1`) and read a screenshot; do not
   assume. `node tests/shots.mjs --all <dir>` writes a contact sheet of every screen.
4. **Conventions.** Structure-first lenses; no emojis in README prose; `mslib` breadth (blocks no
   example uses) is intentional, not cruft.

## Open directions

See "Deferred" in [CHANGELOG.md](CHANGELOG.md) for the list carried over from 1.22.0.
