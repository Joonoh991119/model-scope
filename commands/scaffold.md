---
description: Copy the model-scope template into a folder, ready for your own model.
argument-hint: "<target-dir> [--bare] [model idea]"
disable-model-invocation: true
---

## /model-scope:scaffold

Create a new **model-scope** app from the bundled template and orient the user to edit it.

Arguments: `$ARGUMENTS`. The first token is the target directory (default `./model-sim`). The
flag `--bare` anywhere in the arguments asks for an app without the 21 worked examples. Anything
else is an optional one-line description of the model to build.

### Steps

1. Resolve the target dir (default `./model-sim`). Refuse to overwrite a non-empty existing dir
   without confirmation.
2. Copy the template:
   ```bash
   mkdir -p "<target>"
   cp -R "${CLAUDE_PLUGIN_ROOT}/skills/model-scope/assets/template/." "<target>/"
   ```
3. **Bare option** (`--bare`): delete `examples.js` and `examples.checks.mjs` from the target and
   remove the `<script src="examples.js">` line from its `index.html` (the line is marked as
   deletable). The page then holds only the models in `engine.js`. Until one is added the page shows
   an empty state and `node validate.mjs` exits 1 with "no model is registered". In the target's
   `README.md`, replace everything from "Ships with twenty-one examples" up to `## Files` with one
   line saying the app was made without the worked examples and holds only the models in
   `engine.js`, and drop the `examples.js` + `examples.checks.mjs` bullet under `## Files`.
4. Confirm the scaffold: list the copied files (`index.html`, `engine.js`, `plot.js`,
   `validate.mjs`, `README.md`, and `examples.js` unless bare) and, unless bare, run
   `node validate.mjs` in the target to show the example models pass.
5. **Then load the `model-scope` skill** and follow it to add the user's model: pin the equations,
   add ONE `MODELS` entry in `engine.js` (`params` + `simulate(p,env)→data` + `views[]`, plus `anim`
   if sequential), validate, and open `index.html`. If a model description was given, start on it;
   the `model-gui-builder` agent can take it end to end.

Report the target path, how to open it (double-click `index.html`, or `python3 -m http.server`),
and the one-entry edit point for adding a model.
