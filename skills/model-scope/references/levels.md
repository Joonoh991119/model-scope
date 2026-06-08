# Perspectives (lenses) — decompose the process, don't reproduce the figure

The model-scope philosophy: make the **mechanism** legible — *given an input, what transformation
does it undergo to produce what output* — by decomposing a model into the **perspectives** that fit
its structure, and letting the user switch between them and manipulate the model live. Reproducing a
paper figure is at most a *check*, never the goal.

A **perspective (lens)** answers one question about the model. For ANY model, ask the same four and
pick the lenses that fit: **What is the INPUT? What TRANSFORMS it? What is the OUTPUT/readout? What
EMERGES over many runs?** The right set depends on the model class:

## Perspectives by model class

| Model class | INPUT | TRANSFORM | OUTPUT / readout | EMERGES (many runs) |
|---|---|---|---|---|
| **Decision / accumulator** (DDM, race) | the evidence/stimulus | ⚛ one update = signal + noise → new state | ◷ a trial: walk to a bound | ∑ choice & RT distributions |
| **Sensory / image** (vision, RFs) | 🖼 the image/stimulus | 🧱 filter/feature-map channels re-represent it | 🎯 pooled tuning → decoded feature | ∑ tuning/accuracy across stimuli |
| **Bayesian / inference** | stimulus + measurement | prior → likelihood → posterior (a stage walk) | the estimate (loss-dependent) | bias & variability across stimuli |
| **Dynamical / network** (attractor, ring) | external drive | per-unit update + recurrent coupling | population state / winner | behaviour across conditions |
| **Learning / RL** | reward / outcome | one value update (prediction error) | policy / choice | the learning curve over episodes |

The default trio for a **time/trial-based** model is the canonical arc **⚛ Step → ◷ Trial →
∑ Simulation** (mechanism → one outcome → what it predicts). A **sensory/image** model has no time
axis, so its trio is **🖼 Input → 🧱 Transform → 🎯 Readout** instead. Lens *keys and labels are
free* — choose them to name the model's own perspectives; the harness just renders a switch.

### The canonical trio (time/trial models)

| Lens | What it shows | Playhead (`ui.head`) | Typical views |
|---|---|---|---|
| **⚛ Step** | ONE atomic update, decomposed into its contributions (signal, leak/decay, recurrent, noise, gain) → new state | a step index within one trial | the update decomposed (arrows/waterfall) + a running mini-trace |
| **◷ Trial** | the atom **repeated over time** until the model emits an output | time within one trial | the trajectory to a bound / the readout forming |
| **∑ Simulation** | the trial **repeated many times** → the emergent statistics | a trial index | a histogram / curve building up; the current trial flashing by |

The template's **drift-diffusion** model is the worked example of this trio; the **early-vision**
model is the worked example of the 🖼/🧱/🎯 sensory trio (a static lens per perspective — no playhead,
just live sliders). Both are in `assets/template/engine.js`.

## Declaring lenses

A model exposes the levels by declaring `lenses`; the toolbox shows a level switch and binds the
active lens's views + playhead over the **same `simulate()` data** (switching is instant — no
recompute):

```js
mymodel: {
  id, name, blurb, note, params,
  simulate: (p, env) => {            // compute EVERYTHING all lenses need, once:
    const steps0 = atomicSteps(p, env.seed, 0);   //   the decomposed steps of trial 0 (step + trial lenses)
    const batch  = runTrials(p, env.seed);        //   the many-trial outcomes (sim lens)
    return { steps0, stepCap: Math.min(steps0.length, 48), ...batch };
  },
  lenses: {
    step:  { label:'⚛ Step',  about:'one atomic update: state ← state + Σ(contributions)',
             anim:{ length:(p,d)=>d.stepCap }, views:[ stepDecompView, runningTraceView ] },
    trial: { label:'◷ Trial', about:'one trial over time → an output',
             anim:{ length:(p,d)=>d.steps0.length }, views:[ trajectoryView ] },
    sim:   { label:'∑ Simulation', about:'many trials → the statistics',
             anim:{ length:(p)=>p.nTrials }, views:[ currentTrialView, histogramView ] },
  },
}
```

Each lens is a `{label, about, views, anim?|stages?}` bundle — the ordinary view/anim/stages
contract, scoped to one zoom level. A lens may use `stages` instead of `anim` when the atom is a
*pipeline* of named computations rather than a time/step sweep. `about` becomes the toolbar hint.
Lenses are **opt-in**: a model with a single top-level `views`/`anim` keeps working unchanged.

**Lenses vs screens.** Use **lenses** to zoom into ONE process (step ↔ trial ↔ simulation of the
same model). Use separate **screens** (models-as-tabs, see the skill's "Scaling to a whole paper")
for different experimental conditions or different parts of a paper.

## The atomic-step recipe (the ⚛ Step lens)

The step lens is where the decomposition lives: take one update and lay its contributions out so
the reader sees *signal vs noise vs leak*. Use `g.arrow(x0,y0,x1,y1,{color,label})` as a
waterfall — start at the current state, add each contribution as a labelled arrow, land on the
new state:

```js
{ title:'one update: state ← state + Σ(contributions)', draw:(g,d,ui)=>{ const T=g.TH, k=Math.floor(ui.head), s=d.steps0[k];
    // zoom to THIS step so the contributions are comparable in size (don't force the whole axis)
    const inc=Math.max(Math.abs(s.drift),Math.abs(s.noise),0.01), pad=inc*2.6+0.015, lo=Math.min(s.x,s.xNext)-pad, hi=Math.max(s.x,s.xNext)+pad;
    g.frame({x:[lo,hi], y:[-0.6,3.6], yticks:1, xlabel:'state (zoomed to this step)', title:`one update — step ${k+1}`});
    g.text(lo,3,'state',{size:10}); g.marker(s.x,3,{color:T.ink,r:4.5,label:s.x.toFixed(3)});           // before
    g.text(lo,2,'+ signal',{size:10}); g.arrow(s.x,2,s.x+s.drift,2,{color:T.accent,label:`+${s.drift.toFixed(3)}`});
    g.text(lo,1,'+ noise',{size:10});  g.arrow(s.x+s.drift,1,s.xNext,1,{color:T.warn,label:`${s.noise>=0?'+':''}${s.noise.toFixed(3)}`});
    g.text(lo,0,'state′',{size:10}); g.marker(s.xNext,0,{color:T.ink,r:4.5,label:s.xNext.toFixed(3)});   // after
} }
```

Guidelines:
- **Zoom to the atom.** Scale the axis to the step's own contributions so signal and noise are
  visually comparable — don't force the full state range (that makes every kick look like zero).
  Mark a bound/target only when it falls inside the zoomed window.
- **One contribution per row** (or one arrow per term), labelled with its numeric value, in a
  fixed order (state → +signal → +leak → +noise → state′). Keep colours consistent across lenses
  (signal = accent, noise = warn/neg, leak = a third hue).
- **Pair it with a running trace** so the reader sees the same atom, repeated, *becoming* the
  trajectory — that hands off to the trial lens.

## Checklist

- [ ] `simulate()` returns the decomposed steps of one trial AND the many-trial batch (one pass).
- [ ] Step lens decomposes a single update into named contributions (signal/leak/noise/…), zoomed.
- [ ] Trial lens replays the atom over time to the output (bound/readout), marking the result.
- [ ] Sim lens shows the statistic building up over trials (fix axes from the full result).
- [ ] Each lens has a one-line `about`; colours/labels are consistent across the three.
- [ ] The model still validates and passes GUI QC (`references/gui-qc.md`).
