# Plotting helper `g` + view recipes

A view is `draw(g, data, ui)`. `g` is created per-canvas by the toolbox; you call
`g.frame(...)` once to define this view's axes, then draw in data coordinates. `ui =
{head, playing, params}`.

## The `g` API (see plot.js)

- `g.frame({x:[lo,hi], y:[lo,hi], xlabel?, ylabel?, title?, xticks?, yticks?, xticklabels?, margin?})`
  — grid + ticks + labels + title; sets the data→pixel scales. Call first. The `title`
  auto-ellipsises to the canvas width (never clips) — so put the **key word first**. `xticklabels:[…]`
  draws **categorical** labels at integer x positions (for bar charts) instead of numeric ticks.
  Call `frame` twice with different `margin` to stack two panels in one view (e.g. input + rate).
- `g.X(v)`, `g.Y(v)` — data→pixel (for custom drawing via `g.ctx`). `g.frameRect()` →
  `{px,py,pw,ph,x,y}`. `g.clip()/g.unclip()` — clip to the frame.
- `g.line(pts,{color,width,dash})` — polyline of `[x,y]`.
- `g.band(pts,{color,base})` — filled area between the curve and `base` (default y-min).
- `g.points(pts,{color,r})`, `g.marker(x,y,{color,stroke,r,label})`.
- `g.vline(x,{color,dash,label})`, `g.hline(y,{color,dash,label})`.
- `g.arrow(x0,y0,x1,y1,{color,width,head,label})` — arrow in data coords with a head + centred label;
  the building block for a **step-level view** (state, +contribution, +contribution, new state).
- `g.bars(hist,{dir:'up'|'down', baseY, color, max, height})` — `hist` from `Plot.histify`.
- `g.heat(nx,ny,(i,j)=>value, (value)=>[r,g,b])` — fills the frame with a colour map (the value
  can be raw, e.g. Hz, if your cmap maps it; return a background colour for "not yet" cells).
  Pass `frame({…,cbar:true})` and `g.colorbar(...)` so the scale fits; pass `{smooth:false}` for discrete/tiled maps.
- `g.colorbar(vmin,vmax,cmap,{ticks:[{v,label}],label,x,y,w,h})` — a vertical colour scale; pass the
  **same** cmap. **Give every heatmap a colorbar** (reserve right margin via `frame({cbar:true})`).
- `g.image(nx,ny,(i,j)=>value, cmap, {x,y,w,h,smooth})` — like `heat` but into an arbitrary PIXEL
  sub-rect (no colorbar implied) — for layer/channel/RF maps, small multiples, binary pattern grids.
- `g.graph(nodes,edges,{r})` — node-link diagram: `nodes:[{x,y in 0..1, label, color?, fill?}]`,
  `edges:[{from,to, label?, color?, dash?, inhib?}]` — for DAGs / connectomes / circuit schematics.
- `g.raster(rows,{color,width})` — `rows[i]` = array of event x-positions → lane of ticks.
- `g.text(x,y,str,{color,size,font,align})`, `g.legend([{label,color}],{x,y} | {corner:'tl'|'tr'|'bl'|'br'})`
  (translucent panel; height auto-clamps to the frame; `corner` anchors it to a frame corner so you can
  keep it **off the data**), `g.note(str)` (centred placeholder).
- `g.flow(stages, active, {y,h,pad,gap,caption})` — a **process pipeline** strip (PIXEL space,
  needs no `frame`): ordered stage boxes with arrows, the `active` one highlighted, earlier
  ones marked done; `stages[active].about` renders as a caption. Pass `ui.stages, ui.stage`.
- `Plot.histify(values, bins, lo, hi, quant?)` → `{edges, counts, binW, max}`. Pass
  `quant = dt` so bin width is a multiple of `dt` (else dt-quantised values comb).
- `Plot.TH` — theme colours: `ink, dim, faint, accent, pos, neg, warn, series[]`.

Theme is light/eye-friendly and DPR-correct already. Extend `plot.js` (a violin, a
contour, a vector field) rather than working around it.

**Text size.** Fonts, frame margins and label offsets all scale with `window.__plotFontScale`
(the toolbox's "Text size" control), so larger text keeps its own space instead of overlapping the
graphics — never hard-code pixel offsets that assume one font size.

**Readability conventions — make every plot self-interpretable:**
- Label every axis **with units**; give every heatmap a **colorbar** (`g.colorbar`).
- **Never put two different units on one y-axis.** To show, say, input (model units) and rate (Hz)
  together, use two stacked panels (`g.frame` twice with `margin`) — and put a threshold line only on
  the axis it belongs to. A shared "a.u." axis that mixes currents and firing rates *will* be misread.
- Use **categorical tick labels** (`frame({xticklabels})`) for bars over categories, not numeric ticks.
- Encode meaning **redundantly** — colour **and** dash/width/label — never colour alone (colourblind safety).
- Keep captions in **reserved headroom** (widen the y-range a little), not over the data; keep them short.
- A figure should answer "what am I looking at, in what units?" without the prose. Then explain the
  *idea* in one short caption; leave the details to the model's `note`/README.
- **Number the panels** (`①②③…` in the title) and reference them by number in `blurb`/`note`, so the
  prose and the figures line up.
- **Accuracy / probability:** draw a **ceiling (1.0)** line and a **chance** line (1/nAlt), and **clamp**
  the plotted value to `[chance, 1]` — below chance is sampling noise, not signal. If a condition
  saturates at ceiling, say so in the title and point to the panel that carries the effect.
- **Legends off the data:** `g.legend(..,{corner})`; pick the empty corner (rising ramps → `'tl'`).
- **Heavy screens:** return `{loading:true}` and fill via `SIM.runChunks` (loading overlay + progressive
  redraw + supersede-guard); views draw a placeholder until the data arrives. See `gui-qc.md`.

## Recipes

### Distributions & inference (Bayesian / ideal observer)
```js
g.frame({x:[lo,hi], y:[0,ymax], xlabel:'stimulus', title:'prior · likelihood · posterior'});
g.band(prior,{color:'rgba(74,122,147,.12)'}).line(prior,{color:TH.accent,dash:[4,3]});
g.line(likelihood,{color:TH.faint});
g.band(posterior,{color:'rgba(46,139,122,.16)'}).line(posterior,{color:TH.pos,width:2});
g.vline(theta,{label:'θ'}); g.vline(m,{label:'m'}); g.vline(thetaHat,{color:TH.pos,label:'θ̂'});
```
Build curve arrays with `npdf(x,mu,sd)` over a grid in `simulate` or the view.

### Tuning / transfer curve with ±SD ribbon (bias, f–I, psychometric)
```js
g.frame({x:[lo,hi], y:[lo,hi], xlabel:'true θ', ylabel:'estimate θ̂'});
g.line([[lo,lo],[hi,hi]],{color:TH.faint,dash:[3,3]});   // identity / baseline
// ribbon: fill between up[] and dn[] via g.ctx + g.X/g.Y, then the mean curve:
g.line(estimate,{color:TH.pos,width:2});
```
Sweep a parameter (e.g. sensory noise) and the curve deforms — the intuition the
researcher is after.

### Animated trajectory + accumulating histogram (decision / first-passage)
`anim:{length:p=>nTrials}`. View A regenerates the current trial's path from `ui.head`
(`floor(head)` = trial index, frac = within-trial progress) and draws it to thresholds.
View B bins outcomes of completed trials (`Plot.histify(rt[0..floor(head)])`) into a
mirrored correct↑/error↓ histogram. (See the `ddm` model in `engine.js`.)

### Spike raster + voltage trace (neurons)
```js
g.frame({x:[0,T], y:[vmin,vmax], xlabel:'time (ms)', title:'V(t)'}); g.line(trace);
// second view:
g.frame({x:[0,T], y:[0,nTrials], xlabel:'time (ms)', title:'spikes'}); g.raster(spikeRowsPerTrial);
```

### Heatmap / energy landscape (2-D dynamical, belief field)
For a 2-D system whose noise-free drift `F(y1,y2)` is a gradient field, show *where the
attractor is*: read `F` by calling the model's step with the noise zeroed (a constant rng
`()=>0.25` makes `gaussian`→0); integrate the potential `V` (`F=−∇V`) on a grid; classify
the fixed point from the Jacobian (well / line / saddle); then
```js
g.heat(80,80,(i,j)=>rank[i][j], t => yellowToBlue(t));   // rank = percentile of V
```
**Rank-equalise** `V` (colour by percentile, not min–max) so a strong input tilt doesn't
wash the structure to one colour, and map **low V → yellow (attractor/valley), high → blue
(ridge)**. Overlay the vector field (`g.line` short arrows), thresholds, and the
fixed-point marker. Compute once per parameter change; cache; redraw cheaply.

### Step-level view (one update of the model)
Lay one update's contributions out as a waterfall of `g.arrow`s (state, +signal, +noise, new state),
**zoomed to the step** so signal and noise are comparable in size. See the recipe + the per-class
angle catalogue in [`levels.md`](levels.md); the template's drift-diffusion model is the worked example.

### Sequence / learning (RL value, POMDP belief, prior update)
```js
g.frame({x:[0,N], y:[lo,hi], xlabel:'trial', ylabel:'value'});
const k=Math.floor(ui.head); g.line(seq.slice(0,k+1)); g.marker(k, seq[k]);
```

### Process pipeline (step through a model's internal stages)
For *"see each process in sequence"* models, declare `stages` (not `anim`) on the model:
```js
stages: () => [ {key:'prior',name:'Prior',about:'…'}, {key:'encode',name:'Encoding',about:'…'}, … ],
```
The toolbox turns the playhead into a discrete stepper (◀ ▶ + a stage-named readout). One view
draws the **pipeline overview**; the others reveal their panel when the stage is reached:
```js
{ title:'Process', draw:(g,d,ui)=> g.flow(ui.stages, ui.stage) },           // the strip
{ title:'Likelihood', draw:(g,d,ui)=>{ g.frame({…});
    g.line(prior);                                  // earlier stages stay drawn
    if(ui.stage>=3) g.line(likelihood);             // reveal at the 'likelihood' stage
    if(ui.stage>=4){ g.band(posterior); g.line(posterior); }
}},
```
Gate by `ui.stage` (index) or `switch(ui.stageKey)`. Use `ui.frac` (0→1 within a stage) to fade
a panel in. Compute everything once in `simulate`; the stages only choose what to *show*. See
the `efficient`, `causal`, `wm` models in `engine.js` for full worked pipelines.

## Layout & animation notes
- Views auto-fit a responsive grid; 1–4 per model reads best. Each view is independent —
  recomputing all on every frame is fine for cheap draws; if one view is expensive and
  static, you may guard it on `ui.playing`.
- For sequential models, **fix axes from the full result** (`simulate` returns the final
  ranges) so animated bars/curves grow into place instead of rescaling.
