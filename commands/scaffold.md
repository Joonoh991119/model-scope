---
description: >-
  Scaffold a new interactive trial-by-trial modeling GUI from the model-scope template
  into a target folder, ready to edit. Use to start a new simulator/visualiser for any
  stochastic or dynamical model. Usage: /model-scope:scaffold <target-dir> [model idea].
---

## /model-scope:scaffold

Create a new **model-scope** app from the bundled template and orient the user to edit it.

Arguments: `$ARGUMENTS` — the first token is the target directory (default `./model-sim`);
anything after it is an optional one-line description of the model to build.

### Steps

1. Resolve the target dir from `$ARGUMENTS` (default `./model-sim`). Refuse to overwrite a
   non-empty existing dir without confirmation.
2. Copy the template into it (the template lives in this plugin at
   `skills/model-scope/assets/template/`). Use the plugin root env var if available:
   ```bash
   mkdir -p "<target>"
   cp -R "${CLAUDE_PLUGIN_ROOT:-.}/skills/model-scope/assets/template/." "<target>/"
   ```
   If `CLAUDE_PLUGIN_ROOT` is unset, locate the template under the installed plugin cache
   (search for `skills/model-scope/assets/template/engine.js`) and copy from there.
3. Confirm the scaffold: list the copied files (`engine.js`, `index.html`, `validate.mjs`,
   `README.md`) and run `node validate.mjs` in the target to show the example models pass.
4. **Then load the `model-scope` skill** and follow it to add the user's model: pin the
   equations, add ONE `MODELS` entry in `engine.js`, wire outcomes/guides/derived, validate,
   and open `index.html`. If a model description was given in `$ARGUMENTS`, start on it; the
   `model-gui-builder` agent can take it end-to-end.

Report the target path, how to open it (`open index.html` or `python3 -m http.server`), and
the one-entry edit point for adding a model.
