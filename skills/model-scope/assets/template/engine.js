/* =============================================================================
 * engine.js — the model-scope core, and the place YOUR models go (math only, no DOM).
 *
 * A model declares parameters, a simulate(params, env) → data function, and a list
 * of VIEWS. Each view draws WHATEVER it wants (its own axes & graphics) via the
 * plotting helper `g` (see plot.js). There is NO fixed visualisation: a Bayesian
 * observer draws distributions + a bias curve; a decision model animates a trajectory
 * + a histogram; a neuron draws a voltage trace + a raster. The toolbox just
 * generates sliders, recomputes `simulate` when you move them, and redraws the views.
 *
 * Optional `anim` makes a model sequential: the toolbox provides a playhead `head`
 * (0..length) + transport controls, and views read `ui.head` to animate.
 *
 * This file holds the core (seedable RNG, npdf, runChunks, the registry). The twenty-one
 * worked examples live in examples.js, which is optional: read them as recipes, keep
 * them as a gallery, or delete that file and its <script> line to ship only your own.
 *
 * Classic script → window.SIM ; also eval-able in Node for validate.mjs.
 * ========================================================================== */
(function (global) {
  'use strict';

  /* RNG (seed each trial: trialRng(seed,k)) */
  function hashSeed(s){ s=String(s); let h=0x811c9dc5; for(let i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=Math.imul(h,0x01000193);} return h>>>0; }
  function mulberry32(a){ return function(){ a|=0; a=(a+0x6d2b79f5)|0; let t=Math.imul(a^a>>>15,1|a); t=(t+Math.imul(t^t>>>7,61|t))^t; return ((t^t>>>14)>>>0)/4294967296; }; }
  function makeRNG(s){ return mulberry32(hashSeed(s)); }
  function gaussian(rng){ let u=rng(); if(u<1e-12)u=1e-12; return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*rng()); }
  const trialRng = (seed,k)=>makeRNG(seed+'#'+k);
  const npdf = (x,mu,s)=>Math.exp(-0.5*((x-mu)/s)*((x-mu)/s))/(s*Math.sqrt(2*Math.PI));

  /* runChunks — for HEAVY screens (e.g. many trials per condition for a clean estimate).
     Runs doItem(0..total-1) in async frames so the UI never freezes, shows the toolbox
     loading overlay, and BAILS if a newer run supersedes this one (window.__simGen).
     Pattern inside simulate():
       const d = { perCond:[…], loading:true };           // views show a placeholder while loading
       const acc = …;                                      // mutable accumulators
       const doItem = k => { … ; Object.assign(d.perCond[i], summarise(acc[i])); };  // update progressively
       if (env.batch===false) { for(let k=0;k<total;k++) doItem(k); d.loading=false; } // sync for validate.mjs / Node
       else runChunks(total, doItem, 'sweeping conditions');
       return d;                                           // returns immediately; chunks fill it in + call __redraw
     In Node (no rAF) it runs synchronously. */
  function runChunks(total, doItem, label){
    if(typeof window==='undefined' || !window.requestAnimationFrame){ for(let k=0;k<total;k++) doItem(k); return; }
    const myGen=window.__simGen, chunk=Math.max(1, Math.round(total/60)); let k=0;
    const step=()=>{ if(window.__simGen!==myGen) return;                       // a newer slider move / model switch superseded us
      const end=Math.min(total, k+chunk); for(; k<end; k++) doItem(k);
      const done=k>=total, prog=total?k/total:1;
      if(window.__setLoading) window.__setLoading(!done, prog, label);
      if(done){ if(window.__redraw) window.__redraw(); } else window.requestAnimationFrame(step); };
    step();
  }

  /* ---- YOUR MODELS ------------------------------------------------------------------------
     Add an entry to MODELS and its id to MODEL_ORDER (the tab order). Yours come first; the
     examples registered by examples.js follow. A minimal entry:

       mymodel: {
         id:'mymodel', name:'My model',
         blurb:'one line: what this model is',
         note:'the key effect to look for when a slider moves',
         params:[ {name:'gain', label:'Gain', min:0, max:5, step:0.01, default:1} ],
         simulate:(p, env)=>{                       // env = { rng, seed, params }; return ANY data your views need
           const curve=[]; for(let i=0;i<=100;i++){ const x=i/10; curve.push([x, 1-Math.exp(-p.gain*x)]); }
           return { curve };
         },
         views:[ { title:'response', draw:(g, d, ui)=>{
           g.frame({ x:[0,10], y:[0,1], xlabel:'input', ylabel:'response', title:'saturating response' });
           g.line(d.curve, { color:g.TH.accent, width:2 });
         } } ],
       },

     Then write its analytic check in engine.checks.mjs and run `node validate.mjs`. */
  const MODELS = {
  };
  const MODEL_ORDER = [];

  /* register(models, order) — append models to the registry (examples.js uses it; so can any
     extra script you load after engine.js). The first model registered under an id keeps it, so
     an entry of yours above is never replaced by an example with the same id. */
  function register(models, order){
    for(const id of (order || Object.keys(models))){ if(MODELS[id] || !models[id]) continue; MODELS[id]=models[id]; MODEL_ORDER.push(id); }
  }

  global.SIM = { makeRNG, gaussian, hashSeed, trialRng, npdf, runChunks, MODELS, MODEL_ORDER, register };
})(typeof window !== 'undefined' ? window : globalThis);
