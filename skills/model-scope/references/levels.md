# Angles and lenses — replicate, illuminate from many angles, compare

The goal of model-scope: **replicate a model faithfully, illuminate it from the angles natural to its
class, and let the user see — by moving sliders and switching models — what qualitative and
quantitative differences arise from the parameter and model choices.** It is not about reproducing a
paper figure, and there is no single universal pipeline: each model class has its own angles, and a
model with structure (a network's wiring, a CNN's architecture) shows that **structure first**, then
how an input drives it.

The harness reasons about a model's *design purpose* and offers the angles that reveal it. The
**lens switch** presents several angles over the same `simulate()` data; **parameter sweeps** (and a
**model toggle**) are how the user compares.

## Angles by model class

| Model class | Show first | Angles to illuminate | Compare by |
|---|---|---|---|
| **Process / observer** (Bayesian) | the generative + inference rule | *process*: measurement, likelihood, posterior (for the given params/constraints); *trial*: the input-to-output map; *simulation*: Var(θ), bias(θ), θ̂(θ) over many trials | sweep a parameter → coloured curves |
| **Decision** (DDM, race) | the accumulator | *one trial*: evidence accumulates to a bound; *simulation*: RT, accuracy, correct-vs-error-RT histograms, by coherence | parameter sweep; model choice |
| **Single neuron** | the modelled channels / receptors | short-window traces (concentration, conductance, potential); spike pattern | f-I curve; parameter sweep |
| **Network** | connectivity, E/I, plasticity rule | single-cell and population activity from an input; representation across trials; attractor dynamics / energy landscape | parameter sweep; model choice |
| **Vision / CNN** | the architecture | how the input image is transformed layer by layer | parameters, connectivity tuning, bipolar / horizontal cells, receptive-field properties |
| **Other** (RL, MDP/POMDP, causal DAG, oscillation, transformer, connectivity) | the relevant structure | the angles that reveal the model's purpose | parameter sweep; model choice |

Lens *keys and labels are free* — name them for the model's own angles (a process model's
`process / trial / simulation`; a network's `structure / activity / representation / landscape`; a
vision model's `architecture / layers`). The point is not the names but covering the angles that make
the model's behaviour, and its dependence on parameters and model choice, legible.

## What the template ships as worked examples

- **drift-diffusion** — one trial (evidence to a bound) and the RT / accuracy histogram over many trials.
- **early-vision** — the input image, the oriented-filter channels that re-represent it, the decoded readout (static angles driven by sliders).
- **attractor** (network) — the recurrent input to one pool, the pools racing to a winner, and the (S₁,S₂) energy landscape.
- **sir** (macro / field) — a space-time kymograph of a spreading epidemic, the S/I/R curves, and peak-vs-R₀.
- **compare** — a model toggle (integrate vs one sample), a metric heatmap over a parameter grid, and metric bars: the comparison idiom itself.

## Declaring lenses

A model exposes its angles by declaring `lenses`; the toolbox shows a level switch and binds the
active lens's views + playhead over the **same `simulate()` data** (switching is instant — no recompute):

```js
mymodel: {
  id, name, blurb, note, params,
  simulate: (p, env) => {            // compute EVERYTHING the angles need, once
    return { steps0, stepCap: Math.min(steps0.length, 48), ...batch };
  },
  lenses: {
    step:  { label:'Step',  about:'one update of the model',
             anim:{ length:(p,d)=>d.stepCap }, views:[ stepDecompView, runningTraceView ] },
    trial: { label:'Trial', about:'one trial over time',
             anim:{ length:(p,d)=>d.steps0.length }, views:[ trajectoryView ] },
    sim:   { label:'Simulation', about:'many trials → the statistics',
             anim:{ length:(p)=>p.nTrials }, views:[ currentTrialView, histogramView ] },
  },
}
```

Each lens is a `{label, about, views, anim?|stages?}` bundle — the ordinary view/anim/stages contract,
scoped to one angle. A lens may use `stages` instead of `anim` when an angle is a *pipeline* of named
computations rather than a time/step sweep. `about` becomes the toolbar hint. Lenses are **opt-in**:
a model with a single top-level `views`/`anim` keeps working unchanged.

**Lenses vs screens.** Use **lenses** to view ONE model from several angles. Use separate **screens**
(models-as-tabs, see the skill's "Scaling to a whole paper") for different conditions or parts of a paper.

## A step-level angle — decomposing one update

For a time/trial model, one useful angle is the *mechanism level*: take a single update and lay its
contributions out so the reader sees, say, signal vs noise vs leak. Use `g.arrow(x0,y0,x1,y1,{color,label})`
as a waterfall — start at the current state, add each contribution as a labelled arrow, land on the new state:

```js
{ title:'one update of the accumulator', draw:(g,d,ui)=>{ const T=g.TH, k=Math.floor(ui.head), s=d.steps0[k];
    const inc=Math.max(Math.abs(s.drift),Math.abs(s.noise),0.01), pad=inc*2.6+0.015, lo=Math.min(s.x,s.xNext)-pad, hi=Math.max(s.x,s.xNext)+pad;
    g.frame({x:[lo,hi], y:[-0.6,3.6], yticks:1, xlabel:'state (zoomed to this step)', title:`step ${k+1}`});
    g.text(lo,3,'state',{size:10}); g.marker(s.x,3,{color:T.ink,r:4.5,label:s.x.toFixed(3)});
    g.text(lo,2,'+ signal',{size:10}); g.arrow(s.x,2,s.x+s.drift,2,{color:T.accent,label:`+${s.drift.toFixed(3)}`});
    g.text(lo,1,'+ noise',{size:10});  g.arrow(s.x+s.drift,1,s.xNext,1,{color:T.warn,label:`${s.noise>=0?'+':''}${s.noise.toFixed(3)}`});
    g.text(lo,0,'state after',{size:10}); g.marker(s.xNext,0,{color:T.ink,r:4.5,label:s.xNext.toFixed(3)});
} }
```

Guidelines:
- **Zoom to the step** so the contributions are comparable; don't force the full state range. Mark a
  bound/target only when it falls inside the window.
- **One contribution per row**, labelled with its value, in a fixed order; keep colours consistent.
- For a **coupled system** (network/field) the "atom" is one unit's update at fixed neighbour state —
  decompose its net input (self-excitation, cross-inhibition, drive, noise); see the `attractor` model.

## Checklist

- [ ] The model is **replicated faithfully** (equations as given); any reduction is disclosed.
- [ ] It is shown from **the angles that fit its class** (structure first where there is structure).
- [ ] The user can **compare**: a parameter sweep (coloured curves / a heatmap) and, where useful, a model toggle.
- [ ] Each lens has a one-line `about`; switching is instant; axes are fixed from the full result.
- [ ] The model validates and passes GUI QC (`references/gui-qc.md`).
