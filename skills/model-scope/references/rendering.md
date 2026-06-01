# Rendering & the trial-by-trial player (detail)

Goal: a calm scientific **instrument**, not a generic dashboard. Light, eye-friendly,
crisp, legible.

## Light theme tokens (CSS variables)

Muted, non-fluorescent, on an off-white page (less glare than pure white):

```
--bg:#f4f3ee; --surface:#fff; --surface-2:#f1efe8; --edge:#e4e1d7; --edge-2:#d6d2c5;
--ink:#33312c; --ink-dim:#6f6b61; --ink-faint:#a39e91;
--pos:#2e8b7a;  /* outcome 1 / "go" — muted teal-green */
--neg:#c25b42;  /* outcome 2 — muted terracotta */
--accent:#4a7a93;  /* UI, thresholds — slate blue */
--grid:rgba(80,75,65,.07);
```

Outcome colours teal-green vs terracotta differ in hue *and* lightness (colour-blind
safer); reinforce with position (outcome 1 up, outcome 2 down) and labels. No glow / no
drop-shadows on data — they smear on a light background.

## Crisp canvases

Scale the backing store by `devicePixelRatio` and draw in CSS pixels:

```js
function setup(cv){ const dpr=Math.max(1,devicePixelRatio||1), r=cv.getBoundingClientRect(),
  w=Math.max(20,r.width), h=Math.max(20,r.height);
  cv.width=Math.round(w*dpr); cv.height=Math.round(h*dpr);
  const ctx=cv.getContext('2d'); ctx.setTransform(dpr,0,0,dpr,0,0); ctx.clearRect(0,0,w,h); return {ctx,w,h}; }
```

## The player loop

State: `trialIdx` (trials committed), `stepIdx` (progress within the current trial),
`curPath` (regenerated trial `trialIdx`), running histogram counts per outcome, plus
`playing`. One `requestAnimationFrame` loop:

```js
function advance(budget){                 // budget = steps this frame = speed
  while(budget>0 && trialIdx<N){
    if(!curPath) curPath = runTrialFull(model, params, opts, trialRng(seed, trialIdx));
    const rem = curPath.len-1-stepIdx, adv = Math.min(budget, Math.max(1,rem));
    stepIdx += adv; budget -= adv;
    if(stepIdx >= curPath.len-1){          // trial resolved → drop one count
      commit(trialIdx);                    // ++ histogram bin for results[trialIdx].outcome (+ flash)
      trialIdx++; stepIdx=0; curPath=null;
    }
  }
}
```

- **Speed** = steps/frame: low (1–3) to watch a single trial; high (hundreds) to fill in
  seconds. ⏭ "to end" sets `trialIdx=N` and bins everything at once.
- The **scrubber** value is `trialIdx`. Dragging it: clear running counts, re-bin
  `results[0..k]`, set `trialIdx=k`, regenerate `curPath` for trial `k` and show it
  complete. (Pre-compute `results[]` = outcome+measure for all `N` first; it's instant.)
- When a trial commits, briefly highlight the bin it landed in — that flash is what makes
  "this trajectory → that bar" legible.

## Fixed axes (do not let bars rescale)

Compute axes **once** from the full `results[]`, before animating, so the histogram fills
*into* its final shape:
- x-max = a high percentile (≈99th) of `measure` over decided trials, so the skewed bulk
  keeps resolution and rare tails overflow into the last bin (note them);
- y-scale = the final peak bin count.

### Δt-aligned bins (kills the comb artifact)
First-passage measures are quantised to multiples of `dt`. If the bin width isn't a
multiple of `dt`, bins alternately capture 1 or 2 levels → a comb. Snap it:

```js
let bw = xmax/nbins; bw = Math.max(1, Math.round(bw/dt)) * dt;   // bin width = k·dt
```

## Mirrored outcome histogram

For 2 outcomes, share a time axis with a centre line: outcome 1 bars grow up, outcome 2
down. The relative volumes show the outcome rates; the right-skew shows in both. For 1
outcome, a single upward histogram. (For 3–4 outcomes, draw them as stacked segments per
bin or small multiples, and use a categorical palette.)

Also draw a dashed **mean-measure** marker per outcome; overlay a theoretical marker when
a closed form exists.

## 1-D "this trial" scope

Trajectory `x(t)` drawn from `t=0` to `stepIdx` in a neutral ink colour while ongoing,
recoloured by outcome once resolved, with a dot at the head. Draw `model.guides(p)` as
dashed horizontal lines (thresholds), label them. Vertical range from `model.yRange(p)`
(or inferred). Time axis ticks; skip the last tick label where the "time →" caption sits
(they overlap otherwise).

## Layout

Left control rail (sliders generated from the schema + globals: trials N, dt, tMax, bins,
speed, seed) · a top "this trial" panel with the transport bar · a bottom histogram panel
with a compact summary (per-outcome count + rate, mean measure, non-responses, trials
done). Fill the viewport; the rail scrolls. Collapse to one column under ~1080 px.
