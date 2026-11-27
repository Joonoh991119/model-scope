---
name: paper-to-sim
description: >-
  Use when the user provides or points to REFERENCE MATERIAL for a scientific model (a paper PDF,
  an article, a methods section or supplement, equations or notes) and wants it turned into an
  interactive simulator: ingest the reference, interview the user about the purpose of the
  visualisation and their specific requests, then build, check and deliver the simulation GUI.
  Trigger on "turn this paper into an interactive sim", "build a GUI from this paper", "interview
  me and build a simulator from these equations", "make a web simulator from this methods
  section", even when the user only drops a PDF and says "make this explorable". Do NOT use when
  the user already specifies the model and the controls or views they want: use the
  `model-scope` skill for those. Drives `model-scope` for the actual build.
---

# paper-to-sim — reference → interview → web simulator

The autonomous front door to **model-scope**. The user provides *only* reference material; you
extract the model, **interview** them about what the visualisation is for and what they want, then
build and deliver the interactive GUI. Four phases: **Ingest → Interview → Build → Deliver.** Read
the `model-scope` skill (the build mechanics) and `${CLAUDE_PLUGIN_ROOT}/skills/model-scope/references/levels.md`,
`${CLAUDE_PLUGIN_ROOT}/skills/model-scope/references/gui-qc.md` and `${CLAUDE_PLUGIN_ROOT}/skills/model-scope/references/modelbook/INDEX.md`
before phase 3.

Guiding philosophy (from model-scope): **don't reproduce the paper's figures — replicate the model
faithfully, illuminate it from the angles that fit its class (structure first where there is
structure), and let the user compare what changes across parameter sweeps and model choices.** The
interview decides scope; the philosophy decides shape. See `${CLAUDE_PLUGIN_ROOT}/skills/model-scope/references/levels.md`.

---

## Phase 1 — Ingest the reference (no questions yet)

Read whatever was provided (a PDF via the file Read tool's `pages`, a `.md`/`.txt`, pasted
equations, a methods section, a supplementary doc). For a **PDF**, first get the page count, then
read in targeted ranges — abstract/overview, the model/methods/equation sections, parameter
tables, the relevant figure captions, and any supplement — recording a page/section anchor for
every equation, parameter, default, and claim. If the PDF is scanned / OCR-poor or the
equations & defaults aren't recoverable, **stop and ask** for pasted equations or source text
before interviewing. Extract a short **model brief**, internal:

- **Model(s)** present and the class (decision circuit, Bayesian/ideal observer, neuron,
  dynamical system, RL, …) — cross-check `${CLAUDE_PLUGIN_ROOT}/skills/model-scope/references/modelbook/INDEX.md` for a canonical family.
- **Governing equations** *exactly as written* (transcribe; never re-derive from memory).
- **Parameters** with ranges / defaults / units, and which are **experimental conditions** (set
  by the experimenter) vs **model parameters** (the mechanism).
- **Phenomena / claims** the paper explains, and the **mechanism** it attributes each to (the
  claim↔mechanism map).
- **Feasibility**: can it run live in-browser as written, or does it need a reduction (e.g.
  spiking → mean-field rate)? Note the reduction and its honest limits.
- **Ambiguities / missing pieces** you'll need to confirm.

If no reference was supplied, ask for it (a path or pasted text) before continuing. Keep the brief
to yourself; surface only what the interview needs.

## Phase 2 — Interview (the point of this skill)

Run a **focused** interview with the `AskUserQuestion` tool, in the main workflow, before
delegating any build work — **adapt every option to the brief**, put the recommended option first
and label it `(Recommended)` so the user can mostly just confirm. Ask **at most four questions in
the first round**; reserve a second round only for a genuinely ambiguous answer. Skip any the
reference already settles:

1. **Purpose & audience** — teaching demo · talk/lecture figure · personal exploration · lab tool
   (shapes how much explanation vs control to surface).
2. **Scope** — one mechanism in depth, or the whole paper as several **screens** (mechanism →
   condition comparisons → key prediction)? If the paper has multiple models, name the
   recommended one(s) as options.
3. **Angles & emphasis** — which **angles** fit this model's class (process model: process / trial /
   simulation; decision: one trial + the histograms by condition; network: structure / activity /
   representation / landscape; vision: architecture / layer transforms), and what to **compare**
   (which parameter sweep or model toggle) — phrased as concrete options from the brief (see
   `${CLAUDE_PLUGIN_ROOT}/skills/model-scope/references/levels.md` for the per-class catalogue).
4. **Constraints & delivery** — any must-have panel/aesthetic; acceptable reduction & performance
   (are heavy many-trial screens OK behind a loading screen?); the target app dir/name; and the
   delivery wanted (the local page only, or also a link to share: an Artifact when that tool is
   available; a tunnel or a permanent deploy only if they ask).

Phrase options concretely from the brief (e.g. "Sweep coherence at 3 levels (3.2 / 12.8 / 51.2 %)"
not "pick a condition"). Always allow the user's free-text "Other". If an answer reveals a deeper
ambiguity, ask one targeted follow-up rather than guessing.

## Phase 3 — Synthesize the spec, then build

1. **Restate the build spec** in 3–6 lines and get a quick confirm: the model + reduction, the
   screens (or the single mechanism), the lenses, conditions-vs-parameters, the claim↔mechanism
   panels, and how it will be delivered. This is the contract.
2. **Scaffold by performing the steps directly** (do not invoke a slash command from inside this
   workflow — it would become narration, not action). Resolve the target dir from the interview
   (default a slug from the paper title, e.g. `./<paper-slug>-sim`); refuse to overwrite a
   non-empty dir without confirmation; copy `${CLAUDE_PLUGIN_ROOT}/skills/model-scope/assets/template/.` into the
   target; run `node validate.mjs` there to confirm the template passes before editing. If the app
   should hold only the paper's models, delete `examples.js`, `examples.checks.mjs` and the
   `examples.js` script line in `index.html` once your first model is in.
3. **Build** following the `model-scope` skill. If you delegate to the `model-gui-builder` agent,
   **pass it the full confirmed contract**: reference path(s) + exact equations with page/section
   anchors, the parameter table (defaults/ranges/units), the condition-vs-parameter split, the
   reduction and its limits, the screens/angles, the interview decisions, the target dir, and the
   delivery wanted, so it does not lose the equations. The agent cannot ask the user anything; it
   returns open questions to you, and you put them to the user. Apply the philosophy: replicate
   the model, show it from the chosen **angles** (structure first where there is structure), make
   the payoff a **comparison** across parameter sweeps and model choices, keep **experimental
   conditions** separate from **model parameters**, organise a paper as **screens**, and **be honest about any reduction** (disclose limits
   in-plot + README; measure robustly; never fake a trend). Use `SIM.runChunks` + the loading
   overlay for heavy screens.

## Phase 4 — QC, then deliver

1. **Validate & QC**: `node validate.mjs` (add an analytic check tied to the paper in
   `engine.checks.mjs`), then walk `${CLAUDE_PLUGIN_ROOT}/skills/model-scope/references/gui-qc.md`: the visual
   checklist (no clipped or overlapping text, ceiling/chance lines and the accuracy clamp, units,
   legends off the data, colorbar, loading overlay, numbered panels) and an independent two-axis
   review (plot readability and concept clarity). Fix and re-verify.
2. **Always: a verified local URL.** Pick a free port starting at 8799, start the server in the
   background so the workflow can continue, open the page (or drive a browser tool) and **confirm it
   actually renders** before you report it. Label it as local.
   ```bash
   python3 -m http.server "$PORT" --directory "<app-dir>"   # then open /index.html on that port
   ```
   The folder itself also opens from `file://`; say so.
3. **A link to share, when the user wants one and the Artifact tool is available**: run
   `node bundle.mjs --title "<two to four words>"` in the app folder and publish the resulting
   `bundle.html` as an Artifact (it is private until the user shares it). Link a screen with
   `#<model>` or `#<model>-<lens>`. Without the tool, say a hosted link is not available here.
4. **A tunnel or a permanent deploy only on request.** A `cloudflared` quick tunnel is ephemeral (it
   dies with the process); a `wrangler pages deploy` needs the user's account and login. Check the
   tool exists first, and never report a local URL as if it were public. Label every URL as local,
   Artifact, ephemeral tunnel or permanent.

## Report

Return: the model + any reduction (with its honest limits), the interview decisions, the
screens/lenses built, the claim↔mechanism panels, the validation/QC result, and each URL with its
kind and how to re-serve it. One self-contained summary, not chatter.

## Notes

- **The reference is authoritative.** Transcribe equations exactly; surface assumptions; ask
  rather than silently guess.
- **Interview lightly.** Defaults from the brief should make a one-round confirm enough for a
  simple paper; reserve a second round for genuinely ambiguous scope.
- **Reuse, don't reinvent.** Pull canonical equations + an `MSLIB` module from the modelbook when
  a family fits; compose rather than copying a whole repo.
