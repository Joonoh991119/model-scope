# Changelog

The plugin version lives in `.claude-plugin/plugin.json` only. Releases before 1.22.0 are described
in the git history.

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
- Analytic checks keyed by model id in `<script>.checks.mjs` files, skipped for absent models. The
  examples gained checks against independent references (drift-diffusion error rate and decision
  time against the closed forms with the continuity correction, the Bayes filter against an
  independent recursion, and others). A model with no check is still a counted warning.
- The page itself: missing scripts, external hosts or network APIs fail; the bundle is checked when
  `bundle.mjs` is present.
- `--snapshot f.json` / `--against f.json`: an opt-in regression lock for a researcher's own models.
- Seeded-error probe: the gate alone now catches 49 of 52 (before: 7 of 46).
- Every exported `MSLIB` block has at least one closed-form check, including the ones no shipped
  example uses (Kalman update, Izhikevich step, `qUpdate`, `choose`, `besselI1`, `fisherInfo`,
  central tendency, the efficient-coding bias curve, the number-game helpers, and others).

### Template

- `engine.js` is split: the core (RNG, `npdf`, `runChunks`, an empty registry with a commented
  skeleton) where your models go, and `examples.js` with the 21 worked examples, registered after
  yours. Deleting `examples.js`, `examples.checks.mjs` and its script line leaves a working app
  (empty state, clear gate message) instead of a crash. Pure code motion, proven by the baseline.
- Toolbox (`index.html`): a typed 0 no longer becomes the default; a keyboard lens switch no longer
  cancels a `runChunks` computation; the active tab scrolls into view; parameters are remembered per
  model; a `simulate()` error is shown and recovers.
- Accessibility: landmarks, one `<h1>`, a name for every control and canvas, a polite live region,
  4.5:1 text contrast, a visible focus ring. axe: 0 violations on all 60 screens (before: 5 rules
  failed on every screen).
- Phone layout: at 400 px no model overflows (11 of 21 did) and the first plot is on the first
  screen.
- Links: `#model` / `#model-lens` (the form a hosted page passes through), `?p.<name>=` and `?seed=`,
  a **Copy link** button, optional `SIM.APP = {title, tagline}`.
- **Pin**: keep the current result and see it beside every view, with one line naming what differs.
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
  every screenshot regenerated in one reviewed change.
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
- The commands run end to end from an installed copy (path substitution was read in the docs).
