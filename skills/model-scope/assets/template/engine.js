/* =============================================================================
 * engine.js — model-scope template core (math only, no DOM).
 *
 * A model declares parameters, a simulate(params, env) → data function, and a list
 * of VIEWS. Each view draws WHATEVER it wants (its own axes & graphics) via the
 * plotting helper `g` (see plot.js). There is NO fixed visualisation: a Bayesian
 * observer draws distributions + a bias curve; a decision model animates a trajectory
 * + a histogram; a neuron would draw a voltage trace + a raster. The toolbox just
 * generates sliders, recomputes `simulate` when you move them, and redraws the views.
 *
 * Optional `anim` makes a model sequential: the toolbox provides a playhead `head`
 * (0..length) + transport controls, and views read `ui.head` to animate.
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
  const TH = ()=> (global.Plot ? global.Plot.TH : {accent:'#4a7a93',pos:'#2e8b7a',neg:'#c25b42',ink:'#33312c',dim:'#6f6b61',faint:'#a39e91'});
  const HIST = (v,b,lo,hi,q)=> global.Plot.histify(v,b,lo,hi,q);

  // regenerate one drift-diffusion trial's path (for the animated "this trial" view)
  function ddmPath(pp, seed, k){ const rng=trialRng(seed,k); let x=0,t=0,st=0; const ms=Math.round(20/pp.dt), out=[[0,0]];
    while(st<ms){ x+=pp.A*pp.dt+pp.c*Math.sqrt(pp.dt)*gaussian(rng); t+=pp.dt; st++; out.push([t,x]); if(x>=pp.z){return {pts:out,outcome:1};} if(x<=-pp.z){return {pts:out,outcome:2};} }
    return {pts:out, outcome:0}; }

  const MODELS = {

    /* ---- A Bayesian observer: estimate a stimulus θ from a noisy measurement m,
            combining a prior with the likelihood (L2 loss → posterior mean). ---- */
    bayes: {
      id:'bayes', name:'Bayesian observer',
      blurb:'Estimate a stimulus θ from a noisy measurement m by combining a Gaussian prior with the likelihood; the L2-optimal estimate θ̂ is the posterior mean. Estimates regress toward the prior — the central-tendency effect.',
      note:'Raise sensory noise σ_m → the estimate leans on the prior, so θ̂ is pulled toward μ₀ and the estimate curve flattens. With α>0 the prior mean adapts trial-to-trial toward the stimulus mean.',
      params:[
        {name:'theta',   label:'True stimulus θ', min:-3, max:3, step:0.05, default:1.6},
        {name:'sigma_m', label:'Sensory noise σ_m', min:0.1, max:2.5, step:0.01, default:0.9},
        {name:'mu0',     label:'Prior mean μ₀', min:-3, max:3, step:0.05, default:0},
        {name:'sigma0',  label:'Prior SD σ₀', min:0.15, max:3, step:0.01, default:1},
        {name:'alpha',   label:'Prior update rate α', min:0, max:0.4, step:0.005, default:0.05},
        {name:'stimMean',label:'Stimulus mean (environment)', min:-3, max:3, step:0.05, default:1.2},
        {name:'nTrials', label:'Trials', min:20, max:1500, step:20, default:300, int:true},
      ],
      simulate:(p, env)=>{
        const vm=p.sigma_m*p.sigma_m, v0=p.sigma0*p.sigma0, w=v0/(v0+vm);   // reliability weight on the measurement
        const sigPost=Math.sqrt(1/(1/vm+1/v0));
        const m=p.theta + p.sigma_m*gaussian(env.rng), muPost=w*m+(1-w)*p.mu0;
        // frame from the actual support so θ, m, θ̂ are always on-plot (even at extreme settings)
        const span=3.2*Math.max(p.sigma0, p.sigma_m, 0.5);
        let lo=Math.min(p.mu0-span, p.theta-2*p.sigma_m, m-2*p.sigma_m, muPost),
            hi=Math.max(p.mu0+span, p.theta+2*p.sigma_m, m+2*p.sigma_m, muPost);
        const padd=(hi-lo)*0.04||0.1; lo-=padd; hi+=padd;
        // trial-to-trial prior-mean update toward the stimulus environment
        const N=Math.round(p.nTrials), muSeq=new Float64Array(N+1); muSeq[0]=p.mu0; let mu=p.mu0;
        for(let t=0;t<N;t++){ const stim=p.stimMean+0.55*gaussian(env.rng), mm=stim+p.sigma_m*gaussian(env.rng); mu=(1-p.alpha)*mu+p.alpha*mm; muSeq[t+1]=mu; }
        // the prior-update view needs its own y-range: μ can adapt past the inference support
        let sLo=Math.min(p.stimMean, lo), sHi=Math.max(p.stimMean, hi);
        for(let t=0;t<=N;t++){ if(muSeq[t]<sLo)sLo=muSeq[t]; if(muSeq[t]>sHi)sHi=muSeq[t]; }
        const sp=(sHi-sLo)*0.06||0.1;
        return { w, sigPost, m, muPost, lo, hi, seqLo:sLo-sp, seqHi:sHi+sp, N, muSeq };
      },
      views:[
        { title:'Inference on one trial', draw:(g,d,ui)=>{ const p=ui.params, T=TH();
          const xs=[]; const NG=160; for(let i=0;i<=NG;i++) xs.push(d.lo+(d.hi-d.lo)*i/NG);
          const pri=xs.map(x=>[x,npdf(x,p.mu0,p.sigma0)]), lik=xs.map(x=>[x,npdf(x,d.m,p.sigma_m)]), pos=xs.map(x=>[x,npdf(x,d.muPost,d.sigPost)]);
          const ymax=Math.max(...pri.map(a=>a[1]),...lik.map(a=>a[1]),...pos.map(a=>a[1]))*1.1;
          g.frame({x:[d.lo,d.hi], y:[0,ymax], xlabel:'stimulus value', title:'prior · likelihood · posterior'});
          g.band(pri,{color:'rgba(74,122,147,.12)'}).line(pri,{color:T.accent,width:1.4,dash:[4,3]});
          g.line(lik,{color:T.faint,width:1.6});
          g.band(pos,{color:'rgba(46,139,122,.16)'}).line(pos,{color:T.pos,width:2});
          g.vline(p.theta,{color:T.ink,label:'θ'}); g.vline(d.m,{color:T.faint,label:'m'}); g.vline(d.muPost,{color:T.pos,label:'θ̂'});
          g.legend([{label:'prior',color:T.accent},{label:'likelihood',color:T.faint},{label:'posterior',color:T.pos}]);
        }},
        { title:'Estimate vs. true (central tendency)', draw:(g,d,ui)=>{ const p=ui.params, T=TH();
          g.frame({x:[d.lo,d.hi], y:[d.lo,d.hi], xlabel:'true θ', ylabel:'estimate θ̂', title:'estimate curve — regression toward the prior'});
          g.line([[d.lo,d.lo],[d.hi,d.hi]],{color:T.faint,width:1,dash:[3,3]});                 // identity (unbiased)
          const xs=[]; for(let i=0;i<=80;i++){ const th=d.lo+(d.hi-d.lo)*i/80; xs.push(th); }
          const est=xs.map(th=>[th, d.w*th+(1-d.w)*p.mu0]);
          const up=xs.map(th=>[th, d.w*th+(1-d.w)*p.mu0 + d.w*p.sigma_m]);
          const dn=xs.map((th,i)=>[th, d.w*th+(1-d.w)*p.mu0 - d.w*p.sigma_m]);
          // ±SD ribbon
          g.ctx.fillStyle='rgba(46,139,122,.12)'; g.ctx.beginPath();
          up.forEach((pt,i)=>{const X=g.X(pt[0]),Y=g.Y(pt[1]); i?g.ctx.lineTo(X,Y):g.ctx.moveTo(X,Y);});
          for(let i=dn.length-1;i>=0;i--){const X=g.X(dn[i][0]),Y=g.Y(dn[i][1]); g.ctx.lineTo(X,Y);} g.ctx.closePath(); g.ctx.fill();
          g.line(est,{color:T.pos,width:2});
          g.vline(p.mu0,{color:T.accent,label:'μ₀'});
        }},
        { title:'Prior mean updating over trials', draw:(g,d,ui)=>{ const p=ui.params, T=TH();
          g.frame({x:[0,d.N], y:[d.seqLo,d.seqHi], xlabel:'trial', ylabel:'prior mean μ', title:'trial-to-trial prior update'});
          g.hline(p.stimMean,{color:T.faint,dash:[5,4],label:'stimulus mean'});
          const k=Math.max(1,Math.min(d.N,Math.floor(ui.head)));
          const pts=[]; for(let t=0;t<=k;t++) pts.push([t,d.muSeq[t]]); g.line(pts,{color:T.accent,width:1.8});
          g.marker(k,d.muSeq[k],{color:T.accent,stroke:'#fff'});
        }},
      ],
      anim:{ length:(p)=>Math.round(p.nTrials) },
    },

    /* ---- A drift-diffusion decision: animate one trial's evidence, accumulate RTs. ---- */
    ddm: {
      id:'ddm', name:'Drift-diffusion decision',
      blurb:'Evidence x integrates a drift A plus Gaussian noise until it reaches +z (correct) or −z (error). Watch each trial accumulate; the response-time histogram builds up trial by trial.',
      note:'Larger drift A → faster & more accurate; larger boundary z → slower & more accurate; larger noise c → noisier. The classic decision / first-passage recipe.',
      params:[
        {name:'A', label:'Drift A', min:0, max:3, step:0.01, default:1},
        {name:'c', label:'Noise c', min:0.1, max:2, step:0.01, default:1},
        {name:'z', label:'Boundary z', min:0.2, max:2.5, step:0.01, default:1},
        {name:'dt',label:'dt', min:0.002, max:0.03, step:0.001, default:0.01, unit:'s'},
        {name:'nTrials', label:'Trials', min:100, max:8000, step:100, default:2000, int:true},
      ],
      simulate:(p, env)=>{ const n=Math.round(p.nTrials), out=new Int8Array(n), rt=new Float64Array(n), ms=Math.round(20/p.dt);
        for(let k=0;k<n;k++){ const rng=trialRng(env.seed,k); let x=0,t=0,st=0,o=0; while(st<ms){ x+=p.A*p.dt+p.c*Math.sqrt(p.dt)*gaussian(rng); t+=p.dt; st++; if(x>=p.z){o=1;break;} if(x<=-p.z){o=2;break;} } out[k]=o; rt[k]=t; }
        const dec=[]; for(let k=0;k<n;k++) if(out[k]) dec.push(rt[k]); dec.sort((a,b)=>a-b);
        const rtMax=dec.length?Math.min(20,dec[Math.floor(0.99*(dec.length-1))]*1.08):1;
        return { n, out, rt, rtMax, pp:{A:p.A,c:p.c,z:p.z,dt:p.dt}, seed:env.seed }; },
      views:[
        { title:'This trial', draw:(g,d,ui)=>{ const T=TH(), k=Math.min(d.n-1,Math.floor(ui.head)), frac=ui.playing?(ui.head-Math.floor(ui.head)):1;
          const path=ddmPath(d.pp, d.seed, k), z=d.pp.z, tView=Math.max(0.2,d.rtMax*1.05);
          g.frame({x:[0,tView], y:[-z*1.5,z*1.5], xlabel:'time (s)', title:`evidence x(t) — trial ${k+1}`});
          g.hline(0,{color:'rgba(80,75,65,.12)',dash:null}); g.hline(z,{color:T.pos,dash:[5,4],label:'+z'}); g.hline(-z,{color:T.neg,dash:[5,4],label:'−z'});
          const nshow=Math.max(2,Math.floor(path.pts.length*frac)), done=nshow>=path.pts.length&&path.outcome;
          g.clip().line(path.pts.slice(0,nshow),{color:done?(path.outcome===1?T.pos:T.neg):'#6b675d',width:2}).unclip();
          const tip=path.pts[nshow-1]; g.marker(tip[0],Math.max(-z*1.5,Math.min(z*1.5,tip[1])),{color:done?(path.outcome===1?T.pos:T.neg):T.ink,r:3.2});
        }},
        { title:'Response-time distribution', draw:(g,d,ui)=>{ const T=TH(), k=Math.min(d.n,Math.floor(ui.head)); const cor=[],err=[];
          for(let i=0;i<k;i++){ if(d.out[i]===1)cor.push(d.rt[i]); else if(d.out[i]===2)err.push(d.rt[i]); }
          const hc=HIST(cor,52,0,d.rtMax,d.pp.dt), he=HIST(err,52,0,d.rtMax,d.pp.dt), mx=Math.max(hc.max,he.max,1);
          g.frame({x:[0,d.rtMax], y:[-mx,mx], xlabel:'RT (s)', yticks:4, title:'correct ↑   ·   error ↓'});
          g.hline(0,{color:'rgba(80,75,65,.18)',dash:null});
          g.bars(hc,{dir:'up',baseY:0,color:'rgba(46,139,122,.78)',max:mx,height:g.Y(0)-g.frameRect().py});
          g.bars(he,{dir:'down',baseY:0,color:'rgba(194,91,66,.78)',max:mx,height:g.frameRect().py+g.frameRect().ph-g.Y(0)});
          const dec=cor.length+err.length, er=dec?100*err.length/dec:0;
          g.text(d.rtMax*0.02, mx*0.92, `${dec.toLocaleString()} trials · error ${er.toFixed(1)}%`, {color:T.dim});
        }},
      ],
      anim:{ length:(p)=>Math.round(p.nTrials) },
    },
  };
  const MODEL_ORDER = ['bayes','ddm'];

  global.SIM = { makeRNG, gaussian, hashSeed, trialRng, npdf, ddmPath, MODELS, MODEL_ORDER };
})(typeof window !== 'undefined' ? window : globalThis);
