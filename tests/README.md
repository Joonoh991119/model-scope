# tests — developer checks for the plugin

Nothing here ships inside a generated app, and nobody needs it to run or edit one. The template's
own gate is `skills/model-scope/assets/template/validate.mjs`; this folder holds the checks that
guard the plugin itself while it is being changed.

```bash
node tests/run.mjs              # everything that needs only Node (plus `claude plugin validate` if the CLI is installed)
node tests/run.mjs --browser    # ... plus the headless-Chrome smoke test
```

| File | What it proves | Needs |
|---|---|---|
| `baseline.mjs` | The 21 shipped examples behave as they did at v1.21.1: same parameter ids, ranges and defaults; the same numbers out of `simulate()` at defaults and at every control's min and max; the same drawing through the real `plot.js`. | Node |
| `mutations.mjs` | The gate bites: 46 deliberate wrong-math or broken-app edits, each of which some layer must catch. | Node |
| `smoke.mjs` | The page works in a real browser from `file://`: every model and lens paints, no console or page error, no network request, plus accessibility (axe), phone width, and toolbox behaviour. | Playwright |
| `run.mjs` | Runs the above in order and reports. | Node |
| `lib/harness.mjs` | Loads a template exactly as `index.html` does and digests what it computes and draws. | |
| `fixtures/heavy.js` | A model that fills in through `SIM.runChunks`, so the async path has a test. | |
| `baseline/v1.21.1.json` | The reference digests. | |

## The baseline

`baseline/v1.21.1.json` was captured **once**, from a pristine `git archive 4517c70` (v1.21.1), never
from a working tree. For each model it stores the parameter schema, a digest of every number
`simulate()` returns (FNV-1a over `toPrecision(10)`, seed `seed-1`, `batch:false`) at defaults and at
each control's two extremes (183 cases), and a digest of the canvas op stream of every view at the
start and end of its playhead (172 draws).

```bash
node tests/baseline.mjs --check              # schema + simulate + draw
node tests/baseline.mjs --check --no-draw    # schema + simulate only
node tests/baseline.mjs --write-draw         # re-record the draw section (refuses if schema or simulate differ)
node tests/baseline.mjs --list               # the stored default-case digests
```

Rules:

- The `schema` and `simulate` sections never change. A difference there is a behaviour change of a
  shipped model; if it is a correction of a real error, say so in the commit and the release notes
  with the evidence, and capture a new reference file under a new name.
- The `draw` section changes only in a commit that deliberately changes how something is drawn.
  Re-record it with `--write-draw` in that same commit and say so in the message.
- Digests use ten significant digits, not bit-equality: the last digits of `Math.exp`, `Math.sin`
  and friends differ between JavaScript engines.

## The mutation probe

`node tests/mutations.mjs` copies the template 46 times, applies one wrong edit to each copy
(a reliability weight inverted, a drift 10% low, a leak term removed, a default changed, a script
that no longer parses, ...) and runs the layers in order: the gate, then the baseline, then (with
`--pw <dir>`) the browser smoke. Thresholds live at the top of the file. Raise them when the gate
gets stronger; do not lower them to make a run pass. A mutation whose find-string no longer matches
the source fails the run, so the table cannot rot silently.

## The browser smoke

Playwright is a dev tool and is deliberately not a dependency of the plugin. Install it anywhere
outside the tracked tree, for example:

```bash
npm i --prefix .scratch/pw playwright@1.56.1 axe-core@4.14.1     # .scratch/ is git-ignored
node tests/smoke.mjs --pw .scratch/pw                            # add --a11y --phone to enforce those passes
```

It drives the installed Chrome (`channel: 'chrome'`) from `file://`. Only Chrome is covered;
Firefox, WebKit and real phones are not.
