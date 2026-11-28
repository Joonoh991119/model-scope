---
description: Build an interactive simulator from a paper or equations, after a short interview.
argument-hint: "<paper-or-notes> [more paths...]"
disable-model-invocation: true
---

## /ccn-sim:from-paper

Drive the full **reference → interview → web simulator** flow.

Arguments: `$ARGUMENTS`: paths to the reference material (a paper PDF, a methods or supplementary
document, an equations `.md`/`.txt`). Several paths are allowed. If empty, ask the user for a path
or the pasted reference before continuing.

### Steps

1. **Load the `paper-to-sim` skill** and follow it: it owns the workflow.
2. **Ingest** the reference(s) in `$ARGUMENTS` (read PDFs with the Read tool's `pages`; transcribe
   the equations and parameters exactly; build the internal model brief).
3. **Interview** the user yourself, in this session, with `AskUserQuestion`: purpose, scope, which
   angles to show (the ones that fit the model's class), what to compare (a parameter sweep or a
   model toggle), and constraints. Adapt the options to the brief and put a sensible default first,
   so a one-round confirm usually suffices.
4. **Build** the app: copy the template from
   `${CLAUDE_PLUGIN_ROOT}/skills/ccn-sim/assets/template` directly (do not call another slash
   command from inside this one), then follow the `ccn-sim` skill. You may hand the build to the
   `ccn-sim-builder` agent with the confirmed brief and interview decisions; it does not
   interview, it returns open questions to you.
5. **QC** with `${CLAUDE_PLUGIN_ROOT}/skills/ccn-sim/references/gui-qc.md` (gate, visual
   checklist, two-axis review), then **deliver** as the `paper-to-sim` skill says: always a verified
   local URL; also a one-page Artifact when that tool is available and the user wants a link; a
   tunnel or a deploy only on request. Label each URL by kind.

Report the model and any reduction with its limits, the interview decisions, the screens and lenses
built, the QC result, and each URL with how to re-serve it.
