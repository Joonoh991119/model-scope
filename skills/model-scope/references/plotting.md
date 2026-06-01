# Plotting helper `g` + view recipes

A view is `draw(g, data, ui)`. `g` is created per-canvas by the toolbox; you call
`g.frame(...)` once to define this view's axes, then draw in data coordinates. `ui =
{head, playing, params}`.

## The `g` API (see plot.js)

- `g.frame({x:[lo,hi], y:[lo,hi], xlabel?, ylabel?, title?, xticks?, yticks?, margin?})`
  — grid + ticks + labels + title; sets the data→pixel scales. Call first.
- `g.X(v)`, `g.Y(v)` — data→pixel (for custom drawing via `g.ctx`). `g.frameRect()` →
  `{px,py,pw,ph,x,y}`. `g.clip()/g.unclip()` — clip to the frame.
- `g.line(pts,{color,width,dash})` — polyline of `[x,y]`.
- `g.band(pts,{color,base})` — filled area between the curve and `base` (default y-min).
- `g.points(pts,{color,r})`, `g.marker(x,y,{color,stroke,r,label})`.
- `g.vline(x,{color,dash,label})`, `g.hline(y,{color,dash,label})`.
- `g.bars(hist,{dir:'up'|'down', baseY, color, max, height})` — `hist` from `Plot.histify`.
- `g.heat(nx,ny,(i,j)=>t∈[0,1], (t)=>[r,g,b])` — fills the frame with a colour map.
- `g.raster(rows,{color,width})` — `rows[i]` = array of event x-positions → lane of ticks.
- `g.text(x,y,str,{color,font,align})`, `g.legend([{label,color}],{x})`, `g.note(str)` (centred placeholder).
- `g.flow(stages, active, {y,h,pad,gap,caption})` — a **process pipeline** strip (PIXEL space,
  needs no `frame`): ordered stage boxes with arrows, the `active` one highlighted, earlier
  ones marked done; `stages[active].about` renders as a caption. Pass `ui.stages, ui.stage`.
- `Plot.histify(values, bins, lo, hi, quant?)` → `{edges, counts, binW, max}`. Pass
  `quant = dt` so bin width is a multiple of `dt` (else dt-quantised values comb).
- `Plot.TH` — theme colours: `ink, dim, faint, accent, pos, neg, warn, series[]`.

Theme is light/eye-friendly and DPR-correct already. Extend `plot.js` (a violin, a
contour, a vector field) rather than working around it.

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
