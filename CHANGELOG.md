# Changelog

The plugin version lives in `.claude-plugin/plugin.json` only. Releases before 1.22.0 are described
in the git history.

## 2.0.0

Major release: the plugin is renamed. Shipped models and their `simulate()` are unchanged (the
baseline passes in full).

### Renamed: model-scope → ccn-sim

- Plugin `ccn-sim`, skill `ccn-sim`, commands `/ccn-sim:from-paper` and `/ccn-sim:scaffold`, agent
  `ccn-sim-builder`, paths `skills/ccn-sim/`. The repository is `Joonoh991119/ccn-sim` (GitHub
  redirects the old URL). The marketplace name `joonoh-modeling` is unchanged.
- The model library is `CCNLIB` in `modules/ccnlib.js` (was `MSLIB` in `modules/mslib.js`). Apps
  generated before this release keep their own copy and are unaffected.
- To move an installed copy: `/plugin uninstall model-scope@joonoh-modeling`, then
  `/plugin marketplace update joonoh-modeling` and `/plugin install ccn-sim@joonoh-modeling`.

### README

- Three GIFs set an original paper figure beside the same model running in the template: Ratcliff &
  McKoon (2008) for drift-diffusion, Wong & Wang (2006) for the attractor network, Körding et al.
  (2007) for causal inference. `tests/shots.mjs --only pairs` rebuilds them with `tests/pairs.py`
  from the crops in `docs/papers/`.
- A References section lists the original paper behind every shipped example, each checked
  against Crossref, OpenAlex or Semantic Scholar.
- `docs/BACKLOG.md` lists canonical models not built yet (TD learning, Q-learning, actor-critic,
  predictive coding, Boltzmann machine, Hodgkin–Huxley and more), each with its paper and the views
  to build.

## 1.23.0

Refactor release. The public surface and every shipped model's `simulate()` are unchanged (the
baseline's schema and simulate sections pass); the draw section was re-recorded for the fixes below.

### No comments, no scattered constants

- Every code comment is gone from the template and the tests. What only a comment said now lives in
  the template `README.md`: the minimal model to paste, its check and the `t` toolkit, the
  `runChunks` pattern, the `MSLIB` randomness convention, and the link grammar. `tests/bare-app.mjs`
  takes the skeleton and its check from there.
- One palette: `Plot.TH` holds every colour and both fonts (`TH.rgb.<name>`, `TH.rgba(name, a)`), the
  canvas draws with it, and `plot.js` writes the page's CSS variables from it. The examples use theme
  tokens instead of colour literals. Text-size range (`Plot.FONT_SCALE`), playback speeds, timings
  and the default seed are each named once.
- `page.mjs` reads `index.html`'s script tags the way the browser does (HTML comments ignored, unquoted
  `src` accepted); the gate, the bundler and the test harness share it.
- The gate checks the `MSLIB` families that are present instead of requiring all fourteen.

### Fixes

- A colorbar's default tick labels show the value (they were rounded, so 0 to 0.384 read "0" and "0").
- Axis ticks no longer print floating-point residue such as `5.6e-17`.
- `frame({ margin })` merges with the defaults; a partial margin no longer blanks the panel.
- The process strip (`g.flow`) scales with the Text size control.
- `histify` no longer adds a bin when the range is an exact multiple of the bin width.
- Leaving a number field without changing it no longer re-runs the model; re-binding a lens keeps
  the chosen playback speed; views read the parameters the current data was computed with.
- An id such as `constructor` registers like any other.
- `vmWrap` and its check describe the range it returns, `[−π, π)`.

### Docs and tests

- README leads with example figures; the detail moved to `docs/GUIDE.md`. `docs-check` reads the
  tables there, guards its section markers, counts the README keyword table, and checks every
  relative link and image in the main docs.
- `tests/hero.py` builds the README hero from what `shots.mjs` measures, in the template palette,
  with any system font. The browser channel and viewport are named once in the test harness.

## 1.22.0

Minor release. The public surface is unchanged: the plugin, skill, command and agent names and roles,
and the paths `skills/model-scope/`, `skills/paper-to-sim/`, `commands/scaffold.md`,
`commands/from-paper.md`, `agents/model-gui-builder.md`. No shipped model changes behaviour: the
golden baseline (`tests/baseline/v1.21.1.json`, captured from v1.21.1) passes on the schema and
`simulate()` sections. Apps generated before this release are standalone copies and are unaffected.

### The gate bites (`validate.mjs`; it only got stricter)

- It loads exactly the scripts `index.html` loads, in order, with the real `plot.js` on a recording
  canvas (no hand copies), and uses a seeded RNG, so two runs print the same text.
- Schema lint for every model; same seed gives the same result; every view drawn at the start,
  middle and end of its playhead, at defaults and at every control's min and max; a view must draw
  data, not only axes.
- Analytic checks keyed by model id in `<script>.checks.mjs` files, skipped for absent models. A
  model of yours with an example's id hides that example: the gate warns and does not run the
  example's check against your model. `simulate(p, env)` gets `env.params` in the gate as on the page. The
  examples gained checks against independent references (drift-diffusion error rate and decision
  time against the closed forms with the continuity correction, the Bayes filter against an
  independent recursion, and others). A model with no check is still a counted warning.
- The page itself: missing scripts, external hosts or network APIs fail; the bundle is checked when
  `bundle.mjs` is present.
- A seed-dependent `simulate()` throw in the view-render pass fails (it used to skip that model in
  silence); every `#model-lens` link must open its own screen (ids and lens keys with `-` can shadow
  each other); the bundle check also reports SVG `href` and CSS `url()` / `image-set()` references to
  files.
- `--snapshot f.json` / `--against f.json`: an opt-in regression lock for a researcher's own models.
- Seeded-error probe: the gate alone now catches 51 of 54 (before: 7 of 46).
- Every exported `MSLIB` function is called directly by at least one closed-form check, including the ones no shipped
  example uses (Kalman update, Izhikevich step, `qUpdate`, `choose`, `besselI1`, `fisherInfo`,
  central tendency, the efficient-coding bias curve, the number-game helpers, `rl.softmax`,
  `popVector`, `ringStep`, `wilsonCowanStep`, `ciEstimate`, and others).

### Template

- `engine.js` is split: the core (RNG, `npdf`, `runChunks`, an empty registry with a commented
  skeleton) where your models go, and `examples.js` with the 21 worked examples, registered after
  yours. Deleting `examples.js`, `examples.checks.mjs` and its script line leaves a working app
  (empty state, clear gate message) instead of a crash. Pure code motion, proven by the baseline.
- Toolbox (`index.html`): a typed 0 no longer becomes the default; a keyboard lens switch no longer
  cancels a `runChunks` computation; the active tab scrolls into view; parameters are remembered per
  model; a `simulate()` error is shown and recovers, including a throw in a later `runChunks` chunk
  (it used to leave the loading overlay on); when the last chunk lands the lens is bound again, so
  `anim.length` and `stages` may depend on the finished data; a typed value in an integer field is
  rounded at once; a copied link is hidden as soon as the state it describes changes; `?text=` is
  clamped to the slider's range.
- Accessibility: landmarks, one `<h1>`, a name for every control and canvas, a polite live region,
  4.5:1 text contrast, a visible focus ring; the playhead, speed and text-size sliders announce their
  value in words (`aria-valuetext`), and the loading overlay is a named progress bar. axe: 0 violations on all 60 screens (before: 5 rules
  failed on every screen).
- Phone layout: at 400 px no model overflows (11 of 21 did) and the first plot is on the first
  screen.
- Links: `#model` / `#model-lens` (the form a hosted page passes through), `?p.<name>=` and `?seed=`,
  a **Copy link** button, optional `SIM.APP = {title, tagline}`.
- **Pin**: keep the current result and see it beside every view, with one line naming what differs.
  Pin keeps the parameters the result was made with, even when pressed while a slider change waits.
- `bundle.mjs` (optional, plain Node): the app as one self-contained page, a fragment for a host such
  as an Artifact, or `--standalone` for a complete document.
- `plot.js`: `Plot.nearestY`, `Plot.ramp`, `Plot.RAMPS`; `examples.js` uses them instead of 11 copies
  of the same search and inline colour ramps (draw output identical); one palette.

### Text corrections (no behaviour change)

- Wilson–Cowan: E and I do not oscillate "in antiphase"; I trails E by about a tenth of a cycle
  (measured: zero-lag correlation +0.78, lag 28 degrees at defaults).
- Hopfield: the weights are `W = (1/N) Σ`, as the code computes, not `(1/P) Σ`.
- Working memory: the note no longer says set size lowers precision in the simulation (kappa is the
  slider's value for every N).
- Attractor network: the Landscape lens is a flow-speed map, not an energy landscape.
- Modelbook: `centralTendency` takes four arguments; Wilson–Cowan uses `MSLIB.osc.wilsonCowanStep`;
  the Wong–Wang defaults are the paper's Appendix set, not its main-text set.
- Attractor network: the darkest point of the flow-speed map can be the saddle, so it reads
  "dark = slow, near a fixed point", not "dark = attractor".
- POMDP: Compare sweeps the tiger penalty, not listening accuracy; less accurate listening does not
  widen the listen region (at defaults it shrinks from 92% to 86% of beliefs between a = 0.85 and 0.55).
- Causal inference: the bias curve is labelled visual bias vs disparity; it is N-shaped only when the
  two senses are comparably reliable (at the defaults, sigma_V = 2 and sigma_A = 8, the expected visual
  bias is monotone and small).
- Integrate vs one sample: the single-sample frontier is not flat; it trades only by observing longer.
- Retina: the DoG kernel is zero-sum only near surround weight 1; a stronger surround removes coarse
  contrast most (band-pass), it does not sharpen edges in the RMS sweep.
- Kuramoto: the marked K_c is the noise-free value; phase noise raises the real threshold.
- Spatial SIR: the Curve lens shows totals over the line of sites, not a well-mixed population.
- LIF: the f-I curve is noise-free; the current noise is drawn per 0.5 ms step.
- Self-attention: the attention map put query 0 in the top row while the y ticks count up from the
  bottom; it now draws query i in row i (a drawing fix; `simulate()` is unchanged).
- These text and drawing fixes changed eight draw digests (causal, compare, retina, attention),
  re-recorded in the same commit; schema and `simulate()` digests are unchanged.
- Template README lists all 21 models (it listed 18); `ui` has eight fields (docs said three).

### Plugin conventions

- One version field (`plugin.json`); the marketplace entry no longer repeats it. Short descriptions.
  `repository` added; no email address in the repository.
- Commands are user-typed only (`disable-model-invocation: true`), with `argument-hint`. Paths use
  `${CLAUDE_PLUGIN_ROOT}` / `${CLAUDE_SKILL_DIR}` instead of plugin-root-relative paths and a `:-.`
  fallback. `scaffold --bare` starts without the examples.
- Agent: `name` set; `model: inherit` instead of forcing Opus; it returns open questions to the
  caller (a subagent cannot ask the user).
- paper-to-sim delivers a verified local URL always, an Artifact when the tool is available and the
  user wants a link, a tunnel or a deploy only on request.
- `MIGRATION.md` no longer claims hooks that do not ship.

### For maintainers

- `tests/` (never shipped in an app): golden baseline, mutation probe, bare-app check, docs
  consistency check, headless-Chrome smoke (axe, phone, links, Pin, bundle), gallery screenshots.
  `node tests/run.mjs [--browser]`.
- `evals/`: four cases for `claude plugin eval`, authored but not run.

### Deferred

Not done in this release, on purpose:

- **Plot readability (planned 6b)**: round 1-2-5 ticks, a left margin sized to the tick labels, a
  process strip that wraps instead of truncating names, one font helper for the custom views,
  captions that wrap. It changes how most screens look, so it needs the draw baseline re-recorded and
  every screenshot regenerated in one reviewed change. Until then, at large text sizes in the pinned
  layout (each pane is half a card wide) titles and process-strip names truncate and some labels
  overlap the graphics.
- Contrast of non-text control edges (`--edge-2` on white is about 1.5:1, below WCAG 1.4.11's 3:1)
  and of the faint canvas text (`#a39e91`, about 2.7:1): a palette change that alters every screen,
  so it goes with 6b.
- The remaining hand-written colour maps (the sqrt and grey maps, per-view colour lists) were not
  moved onto `Plot.ramp`.
- Dark theme with a second canvas palette; Worker offload; predict-then-reveal prompts; named
  presets; per-parameter help popovers; View Transitions; a shipped heavy example that exercises
  `runChunks`; one file per model; a skill-scoped hook that runs the gate; preloading the skill into
  the agent; a plugin icon.
- Running the evals (it spends model calls on the owner's account).
- Checking the Wong–Wang noise scaling and the other model constants against primary sources. The
  library drives the noise so its stationary SD equals σ, which matches the paper's text
  ("σ²_noise is the variance of the noise", jneurosci.org/content/26/4/1314); the equation itself
  is an image there, and a literal reading of the commonly reproduced form gives σ/√2.
- LIF current noise scaled per step rather than as a white-noise density (σ/√dt); POMDP value
  iteration truncated at 200 and 90 sweeps, which is not converged at γ = 0.99; draw digests only at
  default parameters. Each fix changes `simulate()` output or needs a new baseline.

Not verified for this release:

- Browsers other than headless Chrome (Firefox, WebKit, Safari, a real phone).
- Publishing the bundle as an Artifact (not done; the bundle was tested in a host-like frame under a
  strict Content-Security-Policy).
- Pinning inside the bundle, and the accessibility audit of the pinned layout.
- The pinned layout at text sizes above 100% (see Deferred); forced-colours mode; a real screen reader.
- The commands run end to end from an installed copy (path substitution was read in the docs).
