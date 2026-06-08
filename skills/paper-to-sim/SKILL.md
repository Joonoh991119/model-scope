---
name: paper-to-sim
description: >-
  Use when the user provides or points to REFERENCE MATERIAL for a scientific model (a paper PDF,
  article, methods/supplement, equations or notes) and wants an autonomous reference → interview →
  GUI flow: ingest the reference, INTERVIEW the user about the visualization purpose + specific
  requests, then build and serve the simulation GUI. Trigger on "turn this paper into an interactive
  sim", "build a GUI from this paper", "interview me and build a simulator from these equations",
  "make a web simulator from this methods section". Do NOT use for ordinary direct model-GUI
  requests where the user already specifies the model and the controls/views they want — use the
  `model-scope` skill for those. Drives `model-scope` for the actual build.
---

# paper-to-sim — reference → interview → web simulator

The autonomous front door to **model-scope**. The user provides *only* reference material; you
extract the model, **interview** them about what the visualisation is for and what they want, then
build and serve the interactive GUI. Four phases: **Ingest → Interview → Build → Serve.** Read the
`model-scope` skill (the build mechanics) and `skills/model-scope/references/levels.md`,
`skills/model-scope/references/gui-qc.md`, `skills/model-scope/references/modelbook/INDEX.md` before phase 3.

Guiding philosophy (from model-scope): **don't reproduce the paper's figures — decompose the
process to the atomic level and show input → transformation → output** at the **step / trial /
simulation** levels. The interview decides scope; the philosophy decides shape.

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
  dynamical system, RL, …) — cross-check `skills/model-scope/references/modelbook/INDEX.md` for a canonical family.
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
3. **Emphasis** — which zoom **lenses** to expose (⚛ Step · ◷ Trial · ∑ Simulation; default all
   three for a dynamical/trial model, fewer for a static curve) and which condition/prediction to
   feature — phrased as concrete options from the brief.
4. **Constraints & delivery** — any must-have panel/aesthetic; acceptable reduction & performance
   (are heavy many-trial screens OK behind a loading screen?); the target app dir/name; and the
   URL kind wanted (local only, a shareable tunnel, or a permanent deploy).

Phrase options concretely from the brief (e.g. "Sweep coherence at 3 levels (3.2 / 12.8 / 51.2 %)"
not "pick a condition"). Always allow the user's free-text "Other". If an answer reveals a deeper
ambiguity, ask one targeted follow-up rather than guessing.

## Phase 3 — Synthesize the spec, then build

1. **Restate the build spec** in 3–6 lines and get a quick confirm: the model + reduction, the
   screens (or the single mechanism), the lenses, conditions-vs-parameters, the claim↔mechanism
   panels, and where it'll be served. This is the contract.
2. **Scaffold by performing the steps directly** (do not invoke a slash command from inside this
   workflow — it would become narration, not action). Resolve the target dir from the interview
   (default a slug from the paper title, e.g. `./<paper-slug>-sim`); refuse to overwrite a
   non-empty dir without confirmation; locate the plugin root (`$CLAUDE_PLUGIN_ROOT`, or search for
   `skills/model-scope/assets/template/engine.js`); copy `skills/model-scope/assets/template/.`
   into the target; run `node validate.mjs` there to confirm the template passes before editing.
3. **Build** following the `model-scope` skill. If you delegate to the `model-gui-builder` agent,
   **pass it the full confirmed contract**: reference path(s) + exact equations with page/section
   anchors, the parameter table (defaults/ranges/units), the condition-vs-parameter split, the
   reduction and its limits, the screens/lenses, the claim↔mechanism map, the interview decisions,
   the target dir, and the serve mode — so it does not re-interview or lose the equations. Apply
   the philosophy: decompose to the atomic step, expose the chosen **lenses**, keep **experimental
   conditions** separate from **model parameters**, organise a paper as **screens**, make the
   **claim↔mechanism** mapping visible, and **be honest about any reduction** (disclose limits
   in-plot + README; measure robustly; never fake a trend). Use `SIM.runChunks` + the loading
   overlay for heavy screens.

## Phase 4 — QC, then serve and verify

1. **Validate & QC** — `node validate.mjs` (add an analytic check tied to the paper), then walk
   `skills/model-scope/references/gui-qc.md`: the visual checklist (no clipped/overlapping text, ceiling/chance lines
   + accuracy clamp, units, legends off the data, colorbar, loading overlay, numbered panels) and
   a two-axis review pass (plot readability + concept clarity). Fix and re-verify.
2. **Serve and verify.** Pick a free port starting at 8799, and start the server in the
   background/a session so the workflow can continue, then open the URL (or drive a Preview/browser
   MCP) and **confirm it actually renders**. Report this as a **local URL**.
   ```bash
   python3 -m http.server "$PORT" --directory "<app-dir>"   # → http://127.0.0.1:$PORT/index.html  (local only)
   ```
   Only if the interview asked for a **shareable** link: check `command -v cloudflared`; if present,
   start `cloudflared tunnel --url "http://127.0.0.1:$PORT"` in the background and capture the
   `https://*.trycloudflare.com` URL (ephemeral — dies when the process stops); if absent, say a
   tunnel isn't available and keep the local URL. For a **permanent** URL, check Wrangler/auth
   first; if login is needed, ask the user to run `npx wrangler login`, then
   `npx wrangler pages deploy "<app-dir>" --project-name "<name>"`. **Always label** each URL as
   local, ephemeral tunnel, or permanent — never report a localhost URL as if it were public.

## Report

Return: the model + any reduction (with its honest limits), the interview decisions, the
screens/lenses built, the claim↔mechanism panels, the validation/QC result, and the live URL +
how to re-serve it. One self-contained summary, not chatter.

## Notes

- **The reference is authoritative.** Transcribe equations exactly; surface assumptions; ask
  rather than silently guess.
- **Interview lightly.** Defaults from the brief should make a one-round confirm enough for a
  simple paper; reserve a second round for genuinely ambiguous scope.
- **Reuse, don't reinvent.** Pull canonical equations + an `MSLIB` module from the modelbook when
  a family fits; compose rather than copying a whole repo.
