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
| `baseline.mjs` | The 21 shipped examples behave as they did at v1.21.1: same parameter ids, ranges and defaults; the same numbers out of `simulate()` at defaults and at every control's min and max; the same drawing through the real `plot.js` (draws are recorded at default parameters only, at the start and end of the playhead; a drawing error that only shows away from the defaults is not caught here). | Node |
| `mutations.mjs` | The gate bites: 54 deliberate wrong-math or broken-app edits, each of which some layer must catch. | Node |
| `bare-app.mjs` | The template works without its examples: with none it fails clearly (gate) and shows an empty state (page); the commented skeleton model and check in `engine.js` / `engine.checks.mjs` are real code; deleting one example leaves the gate green; a model of yours with an example's id hides that example and its check with a warning; `env.params` reaches `simulate()` in the gate as on the page; a throw for one seed only, and two `#model-lens` links that collide, fail the gate; `bundle()` inlines an unquoted `<script src=…>` and `bundleProblems()` reports a relative CSS `url()`. | Node (+ Playwright with `--pw`) |
| `docs-check.mjs` | The docs say what the code is: model and family counts equal the registry and the modelbook INDEX; every MSLIB block and function named exists; every path named in the skill, command and agent files exists; vendored files use `${CLAUDE_PLUGIN_ROOT}` and the literal `model-scope:` only in the two command names; description lengths; one plugin version field. | Node |
| `smoke.mjs` | The page works in a real browser from `file://`: every model and lens paints, no console or page error, no network request, plus accessibility (axe), phone width, and toolbox behaviour. | Playwright |
| `shots.mjs` | Regenerates the gallery (`docs/shots/*.png`, `docs/ddm-trial.gif`) and the README hero `docs/hero.png` (via `hero.py`) from the current template, and with `--all <dir>` a contact sheet of every screen. Run it in the same commit as a change that alters how a screen looks. | Playwright, ffmpeg for the GIF |
| `run.mjs` | Runs the above in order and reports. | Node |
| `lib/harness.mjs` | Loads a template exactly as `index.html` does and digests what it computes and draws. | |
| `fixtures/heavy.js` | A model that fills in through `SIM.runChunks`, so the async path has a test; `?p.fail=1` makes a later chunk throw. | |
| `fixtures/broken.js` | A model whose `simulate()` throws or returns nothing on demand, so the error display has a test. | |
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

`node tests/mutations.mjs` copies the template 54 times, applies one wrong edit to each copy
(a reliability weight inverted, a drift 10% low, a leak term removed, a default changed, a script
that no longer parses, a bundler that stops escaping a closing script tag, ...) and runs the layers in order: the gate, then the baseline, then (with
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

With `--template <dir>` it tests another copy. Checks that need a shipped example (`ddm` for the
query and Copy link round trip, `lif` for the legacy query link) or a model of a given shape are
printed as `SKIP <check> (needs ...)` and counted in the final line, so a short run is visibly short.

What it checks, on every model and lens (60 screens for the shipped template):

- each screen paints, by click navigation and by link, at the largest text size; no console error,
  no page error, no request that is not `file://`;
- axe (wcag2a, wcag2aa, wcag21aa, best-practice): no critical or serious violation, one `<main>`,
  one `<h1>` (`--a11y` makes this fail the run);
- at 400 x 800: no horizontal overflow, and the first plot is on the first screen (`--phone`);
- the active tab is inside the tab strip; a typed 0 stays 0; parameters survive leaving a tab;
- links: `#model-lens` on load and on hash change, the address rewritten on navigation, the older
  `?model=&lens=&head=` form, `?p.<name>=&seed=`, and the **Copy link** round trip;
- the play button's label toggles, the live region speaks on pause and end, every canvas has a name;
- reduced motion: nothing auto-plays, and playback stops when the setting changes mid-session;
- `runChunks` (fixture): a keyboard lens switch mid-compute lets it finish; a slider move supersedes it;
- a `simulate()` that throws (fixture) is reported in the view area and recovers;
- **Pin**: on every screen the canvas count doubles (one reference per view), all painted, and unpin
  restores it; after a parameter change the reference is unchanged and the line names the change;
  resize and text size redraw the references; at 400 x 800 the reference stacks under the live view
  without horizontal overflow (`--phone`);
- with `--bundle`: the page `bundle.mjs` writes, wrapped the way a host wraps a fragment and locked
  down with `Content-Security-Policy: default-src 'none'; script-src 'unsafe-inline'; style-src
  'unsafe-inline'; img-src data: blob:`, opens every screen by `#link` with no error, no CSP
  refusal and no request; inside an iframe it opens the linked screen and hides **Copy link**; the
  `--standalone` document renders in standards mode.
