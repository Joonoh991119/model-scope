---
description: >-
  Turn reference material into an interactive simulation GUI, end to end: read the paper/equations,
  INTERVIEW you about the visualization purpose and specific requests, then build the GUI and start
  a verified local URL, with an optional shareable tunnel or permanent deploy when tooling/auth allow.
  Usage: /model-scope:from-paper <path-to-paper-or-notes> [more paths…]  (or paste the reference,
  or run with no args and you'll be asked for it).
---

## /model-scope:from-paper

Drive the full **reference → interview → web simulator** flow.

Arguments: `$ARGUMENTS` — paths to the reference material (a paper PDF, a methods/supplementary
doc, an equations `.md`/`.txt`). Multiple paths are allowed. If empty, ask the user to provide a
path or paste the reference before continuing.

### Steps

1. **Load the `paper-to-sim` skill** and follow it exactly — it owns the workflow.
2. **Ingest** the reference(s) in `$ARGUMENTS` (read PDFs with the Read tool's `pages`; transcribe
   the equations/parameters exactly; build the internal model brief).
3. **Interview** the user with `AskUserQuestion` about purpose, scope, which angles to show (the ones
   that fit the model's class), what to compare (parameter sweep or model toggle), and constraints —
   options adapted to the brief, with sensible defaults so a one-round confirm usually suffices.
4. **Build** the app: scaffold by copying the template directly (perform the scaffold steps — do
   not call another slash command from inside this one), then follow the `model-scope` skill,
   delegating to the `model-gui-builder` agent with the confirmed paper brief + interview contract.
   Apply atomic-level decomposition, the chosen lenses, experimental conditions kept separate from
   model parameters, a paper organised as screens, the claim↔mechanism mapping made visible, and
   any reduction disclosed honestly.
5. **QC** with `skills/model-scope/references/gui-qc.md` (visual checklist + two-axis review), then
   **serve & verify**: start `python3 -m http.server <free-port> --directory <app-dir>` in the
   background and confirm it renders → a **local** URL. If a shareable link was requested and the
   tooling exists, offer a `cloudflared` quick tunnel (ephemeral) or `wrangler pages deploy`
   (permanent); always label which kind of URL it is.

Report the model + any reduction and its limits, the interview decisions, the screens/lenses
built, the QC result, and the live URL with how to re-serve it.
