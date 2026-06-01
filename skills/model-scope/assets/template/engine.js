/* =============================================================================
 * engine.js — model-scope template core (math only, no DOM).
 *
 * Classic script: loads from file:// in the browser (window.SIM) AND is eval-able in
 * Node by validate.mjs, so the UI and the test share ONE source of truth.
 *
 * To add a model: append ONE entry to MODELS (and its id to MODEL_ORDER). The GUI is
 * generated from the parameter schema — you never touch index.html.
 *
 * Convention: Euler–Maruyama with timestep dt; noise enters as c·dW, dW = √dt·N(0,1).
 * done(s,p): 0 = trial ongoing; 1..K = resolved with that outcome (1-based into
 * `outcomes`). A trial that hits the step cap (tMax/dt) without resolving is a
 * NON-RESPONSE (outcome 0) — counted, never dropped.
 * ========================================================================== */
(function (global) {
  'use strict';

  /* ---- seedable RNG (seed each trial independently: makeRNG(seed + '#' + k)) ---- */
  function hashSeed(str){ str=String(str); let h=0x811c9dc5; for(let i=0;i<str.length;i++){ h^=str.charCodeAt(i); h=Math.imul(h,0x01000193);} return h>>>0; }
  function mulberry32(a){ return function(){ a|=0; a=(a+0x6d2b79f5)|0; let t=Math.imul(a^a>>>15,1|a); t=(t+Math.imul(t^t>>>7,61|t))^t; return ((t^t>>>14)>>>0)/4294967296; }; }
  function makeRNG(seed){ return mulberry32(hashSeed(seed)); }
  function gaussian(rng){ let u=rng(); if(u<1e-12)u=1e-12; return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*rng()); }

  // shared 2-D "first to reach Z" rule (ties → outcome 1)
  function decide2(y1,y2,Z){ return (y1>=Z||y2>=Z) ? (y1>=y2?1:2) : 0; }

  /* ============================== MODEL REGISTRY ============================== *
   * Three deliberately different examples — decision, population, neural — to show
   * the same (step, done, measure) interface spans very different models.
   * ========================================================================== */
  const MODELS = {

    /* 1-D · biased random walk / drift-diffusion (a decision / first-passage process) */
    walk: {
      id:'walk', name:'Biased random walk', dim:1,
      blurb:'Evidence x drifts at rate A with Gaussian noise until it reaches +B or −B.',
      note:'The drift–diffusion / accumulator template: A is signal strength, c is noise, B is caution. Larger A or B → more accurate; larger c → noisier.',
      params:[
        {name:'A', label:'Drift', min:0, max:3, step:0.01, default:1},
        {name:'c', label:'Noise', min:0.05, max:2, step:0.01, default:1},
        {name:'B', label:'Boundary', min:0.1, max:3, step:0.01, default:1},
        {name:'x0',label:'Start', min:-2, max:2, step:0.01, default:0},
      ],
      outcomes:[ {key:'up', label:'reaches +B', color:'pos'},
                 {key:'dn', label:'reaches −B', color:'neg'} ],
      init:(p)=>({t:0, x:p.x0}),
      step:(s,p,dt,rng)=>{ s.x += p.A*dt + p.c*Math.sqrt(dt)*gaussian(rng); s.t+=dt; },
      done:(s,p)=> s.x>=p.B ? 1 : s.x<=-p.B ? 2 : 0,
      fields:(s)=>[s.x],
      guides:(p)=>[ {v:p.B, label:'+B', color:'pos'}, {v:-p.B, label:'−B', color:'neg'} ],
      yRange:(p)=>[-p.B*1.5, p.B*1.5],
    },

    /* 1-D · stochastic logistic growth (a population reaches carrying capacity or dies) */
    logistic: {
      id:'logistic', name:'Logistic growth', dim:1,
      blurb:'A population x grows logistically toward capacity K with noise; the trial ends when it establishes (0.95·K) or goes extinct (0).',
      note:'Time-to-establish is the measure. Higher noise c → more extinctions and a wider, more skewed establishment-time distribution.',
      params:[
        {name:'r',  label:'Growth rate', min:0.1, max:4, step:0.01, default:1.2},
        {name:'K',  label:'Capacity',    min:0.3, max:3, step:0.01, default:1},
        {name:'c',  label:'Noise',       min:0.01, max:0.4, step:0.005, default:0.09},
        {name:'x0', label:'Initial size',min:0.02, max:1, step:0.01, default:0.1},
      ],
      outcomes:[ {key:'est', label:'establishes', color:'pos'},
                 {key:'ext', label:'goes extinct', color:'neg'} ],
      init:(p)=>({t:0, x:p.x0}),
      step:(s,p,dt,rng)=>{ s.x += p.r*s.x*(1-s.x/p.K)*dt + p.c*Math.sqrt(dt)*gaussian(rng); s.t+=dt; },
      done:(s,p)=> s.x>=0.95*p.K ? 1 : s.x<=0 ? 2 : 0,
      fields:(s)=>[s.x],
      guides:(p)=>[ {v:0.95*p.K, label:'0.95·K', color:'pos'}, {v:0, label:'extinct', color:'neg'} ],
      yRange:(p)=>[-0.12*p.K, p.K*1.15],
    },

    /* 2-D · two competing populations (leaky competing accumulators) — phase plane + landscape */
    compete: {
      id:'compete', name:'Two-population competition', dim:2,
      blurb:'Two units y₁,y₂ accumulate inputs while leaking (rate k) and inhibiting each other (strength w); first to threshold Z wins.',
      note:'The difference behaves like an Ornstein–Uhlenbeck process with λ = w − k: λ<0 stable/slow, λ=0 ≈ random walk, λ>0 winner-take-all. See the energy-landscape panel.',
      params:[
        {name:'I1', label:'Input 1', min:0, max:10, step:0.01, default:4},
        {name:'I2', label:'Input 2', min:0, max:10, step:0.01, default:3},
        {name:'c',  label:'Noise',   min:0.05, max:2, step:0.01, default:0.4},
        {name:'k',  label:'Leak',    min:0, max:20, step:0.05, default:6},
        {name:'w',  label:'Inhibition', min:0, max:20, step:0.05, default:6},
        {name:'Z',  label:'Threshold', min:0.05, max:2, step:0.01, default:0.5},
      ],
      outcomes:[ {key:'a', label:'unit 1 wins', color:'pos'},
                 {key:'b', label:'unit 2 wins', color:'neg'} ],
      init:()=>({t:0, y1:0, y2:0}),
      step:(s,p,dt,rng)=>{ const sd=Math.sqrt(dt);
        const d1=(-p.k*s.y1 - p.w*s.y2 + p.I1)*dt + p.c*sd*gaussian(rng);
        const d2=(-p.k*s.y2 - p.w*s.y1 + p.I2)*dt + p.c*sd*gaussian(rng);
        s.y1+=d1; s.y2+=d2; s.t+=dt; },
      done:(s,p)=>decide2(s.y1,s.y2,p.Z),
      fields:(s)=>[s.y1,s.y2],
      derived:(p)=>{ const lam=p.w-p.k; return [{label:'λ = w − k', value:lam,
        tag: lam<-1e-9?'stable · slow':(lam>1e-9?'winner-take-all':'≈ random walk')}]; },
    },
  };
  const MODEL_ORDER = ['walk','logistic','compete'];

  /* ------------------------------ trial runners ------------------------------ */
  const maxSteps = (opts)=>Math.max(1, Math.round(opts.tMax/opts.dt));
  function runTrialFull(model,p,opts,rng){
    const s=model.init(p,rng), f0=model.fields(s);
    const T=[s.t], A=[f0[0]], B=[f0.length>1?f0[1]:0];
    let out=model.done(s,p), n=0; const ms=maxSteps(opts);
    while(!out && n<ms){ model.step(s,p,opts.dt,rng); n++; const f=model.fields(s); T.push(s.t); A.push(f[0]); B.push(f.length>1?f[1]:0); out=model.done(s,p); }
    return { outcome:out, measure: model.measure?model.measure(s,p):s.t, t:T, a:A, b:B, len:T.length, nonresp:out===0 };
  }
  function runTrialFast(model,p,opts,rng){
    const s=model.init(p,rng); let out=model.done(s,p), n=0; const ms=maxSteps(opts);
    while(!out && n<ms){ model.step(s,p,opts.dt,rng); n++; out=model.done(s,p); }
    return { outcome:out, measure: model.measure?model.measure(s,p):s.t, nonresp:out===0 };
  }

  /* ------------------------------ small helpers ------------------------------ */
  function mean(a){ if(!a.length) return 0; let s=0; for(const v of a)s+=v; return s/a.length; }
  function quantileSorted(a,q){ if(!a.length) return 0; const i=Math.min(a.length-1,Math.max(0,Math.floor(q*(a.length-1)))); return a[i]; }

  global.SIM = { makeRNG, gaussian, hashSeed, decide2, MODELS, MODEL_ORDER, runTrialFull, runTrialFast, maxSteps, mean, quantileSorted };
})(typeof window !== 'undefined' ? window : globalThis);
