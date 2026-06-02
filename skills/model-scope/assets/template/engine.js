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

  // regenerate one drift-diffusion trial's path (for the animated "this trial" view)
  function ddmPath(pp, seed, k){ const rng=trialRng(seed,k); let x=0,t=0,st=0; const ms=Math.round(20/pp.dt), out=[[0,0]];
    while(st<ms){ x+=pp.A*pp.dt+pp.c*Math.sqrt(pp.dt)*gaussian(rng); t+=pp.dt; st++; out.push([t,x]); if(x>=pp.z){return {pts:out,outcome:1};} if(x<=-pp.z){return {pts:out,outcome:2};} }
    return {pts:out, outcome:0}; }
  // ATOMIC decomposition of one trial: each step's update split into its drift (signal) and noise contributions.
  // steps[i] = {i, t, x, drift, noise, dx, xNext, cross?} — the atom the step-lens animates and the trial-lens replays.
  function ddmSteps(pp, seed, k){ const rng=trialRng(seed,k), ms=Math.round(20/pp.dt), steps=[]; let x=0, t=0;
    for(let st=0; st<ms; st++){ const drift=pp.A*pp.dt, noise=pp.c*Math.sqrt(pp.dt)*gaussian(rng), xn=x+drift+noise;
      const s={ i:st, t, x, drift, noise, dx:drift+noise, xNext:xn }; t+=pp.dt;
      if(xn>=pp.z) s.cross=1; else if(xn<=-pp.z) s.cross=2; steps.push(s); x=xn; if(s.cross) break; }
    return steps; }

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

    /* ---- Efficient-coding observer (Wei & Stocker): the prior reshapes the sensory code.
            A PROCESS-mode model — step the playhead through the pipeline stages. ---- */
    efficient: {
      id:'efficient', name:'Efficient-coding observer',
      blurb:'An efficient sensory code spends resolution where the prior is dense: the encoding F(θ)=CDF(prior) warps stimulus space so noise is uniform in sensory space. Decoding back skews the likelihood and biases the percept — repelled from the prior peak (Wei & Stocker).',
      note:'Low noise + BLS (L2) loss → bias points AWAY from the prior peak (the "anti-Bayesian" repulsion). Switch to MAP, or raise σ, and the prior wins (attraction). Discriminability is best where the prior is densest. Step ▶ through the stages.',
      params:[
        {name:'theta',   label:'True stimulus θ', min:-3, max:3, step:0.05, default:1.1},
        {name:'sigma',   label:'Sensory noise σ', min:0.02, max:0.5, step:0.005, default:0.1},
        {name:'priorSD', label:'Prior width σ_prior', min:0.4, max:2.5, step:0.05, default:1},
        {name:'lossMAP', label:'Loss: BLS(0) / MAP(1)', min:0, max:1, step:1, default:0, int:true},
      ],
      simulate:(p,env)=>{ const E=global.MSLIB.efficient, B=global.MSLIB.bayes, lo=-4, hi=4, NG=241;
        const grid=B.linspace(lo,hi,NG), prior=Array.from(grid,x=>npdf(x,0,p.priorSD)), F=E.cdf(grid,prior);
        const loss=p.lossMAP?'MAP':'BLS';
        const mt=E.measure(p.theta,p.sigma,grid,F,()=>gaussian(env.rng));         // one measurement in F-space
        const like=E.likelihood(mt,p.sigma,grid,F), post=B.gridPost(like,prior);
        const estBLS=B.gridMean(post,grid), estMAP=B.gridMode(post,grid), est=loss==='MAP'?estMAP:estBLS;
        const mBack=E.inv(Math.max(0,Math.min(1,mt)),grid,F);                      // measurement mapped back to stimulus space
        const cg=B.linspace(-1.4,1.4,43), bias=[], disc=[], dAll=E.discrim(grid,prior);   // central region (avoid finite-grid edge artifact that dwarfs the lobes)
        for(const th of cg){ let s=0,n=220; for(let k=0;k<n;k++) s+=E.decode(E.encode(th,grid,F)+p.sigma*gaussian(env.rng),p.sigma,grid,F,prior,loss);
          bias.push([th, s/n-th]); disc.push([th, E.interp(th,grid,dAll)]); }
        return { grid, prior, F, mt, mBack, like, post, est, estBLS, estMAP, lo, hi, bias, disc }; },
      stages:()=>[
        {key:'prior',  name:'Prior',                  about:'The stimulus prior p(θ) — which values occur often. It drives the entire efficient code.'},
        {key:'encode', name:'Efficient encoding F(θ)', about:'Resources follow the prior: the encoding is the prior CDF F(θ). It warps stimulus space so equal sensory steps span small stimulus steps where the prior is dense.'},
        {key:'measure',name:'Noisy measurement',       about:'A homogeneous Gaussian measurement m̃ = F(θ)+η lands in the uniform sensory space.'},
        {key:'like',   name:'Likelihood (skewed)',     about:'Pulled back to stimulus space the likelihood p(m̃|θ) is asymmetric — its long tail points away from the prior peak.'},
        {key:'post',   name:'Posterior',               about:'Posterior ∝ likelihood × prior. The prior pulls toward its peak; the skewed likelihood pushes away.'},
        {key:'est',    name:'Estimate',                about:'BLS (posterior mean) and MAP (mode) differ for a skewed posterior — BLS can be repelled from the prior (anti-Bayesian).'},
        {key:'pop',    name:'Bias & discriminability', about:'Across θ: bias b(θ)=E[θ̂]−θ (repulsion lobes) and the discrimination threshold D(θ)∝1/p(θ) — lowest (discrimination best) where the prior is densest.'},
      ],
      views:[
        { title:'Process pipeline', draw:(g,d,ui)=> g.flow(ui.stages, ui.stage) },
        { title:'Prior & efficient encoding', draw:(g,d,ui)=>{ const T=TH(), p=ui.params;
          g.frame({x:[d.lo,d.hi],y:[0,1.05],xlabel:'stimulus θ',ylabel:'F(θ)',title:'prior p(θ) → encoding F(θ)=CDF'});
          const pm=Math.max(...d.prior), pri=Array.from(d.grid,(x,i)=>[x,d.prior[i]/pm*0.9]);
          g.band(pri,{color:'rgba(74,122,147,.10)'}).line(pri,{color:T.accent,width:1.2,dash:[4,3]});
          if(ui.stage>=1){ const Fp=Array.from(d.grid,(x,i)=>[x,d.F[i]]); g.line(Fp,{color:T.ink,width:2});
            g.marker(p.theta, global.MSLIB.efficient.encode(p.theta,d.grid,d.F),{color:T.ink,stroke:'#fff',r:4,label:'F(θ)'}); }
          g.vline(p.theta,{color:T.faint,label:'θ'});
          if(ui.stage>=2){ const my=Math.max(0,Math.min(1,d.mt)); g.hline(my,{color:T.warn,dash:[3,3],label:'m̃'}); g.marker(d.mBack,my,{color:T.warn,stroke:'#fff',r:3.5}); }
          g.legend([{label:'prior',color:T.accent},{label:'F(θ)',color:T.ink}]);
        }},
        { title:'Likelihood · prior · posterior', draw:(g,d,ui)=>{ const T=TH(), p=ui.params;
          const pm=Math.max(...d.prior), lm=Math.max(...d.like)||1, pom=Math.max(...d.post)||1;
          g.frame({x:[d.lo,d.hi],y:[0,1.1],xlabel:'stimulus θ',title:'inference in stimulus space'});
          const pri=Array.from(d.grid,(x,i)=>[x,d.prior[i]/pm]); g.band(pri,{color:'rgba(74,122,147,.10)'}).line(pri,{color:T.accent,width:1.1,dash:[4,3]});
          if(ui.stage>=3){ const lik=Array.from(d.grid,(x,i)=>[x,d.like[i]/lm]); g.line(lik,{color:T.warn,width:1.6}); }
          if(ui.stage>=4){ const pos=Array.from(d.grid,(x,i)=>[x,d.post[i]/pom]); g.band(pos,{color:'rgba(46,139,122,.16)'}).line(pos,{color:T.pos,width:2}); }
          g.vline(p.theta,{color:T.ink,label:'θ'});
          if(ui.stage>=2) g.vline(d.mBack,{color:T.warn,label:'m'});
          if(ui.stage>=5){ g.vline(d.est,{color:T.pos,label:'θ̂'}); g.vline(p.lossMAP?d.estBLS:d.estMAP,{color:T.faint,dash:[2,2],label:p.lossMAP?'BLS':'MAP'}); }
          g.legend([{label:'prior',color:T.accent},{label:'likelihood',color:T.warn},{label:'posterior',color:T.pos}]);
        }},
        { title:'Bias & discriminability', draw:(g,d,ui)=>{ const T=TH();
          if(ui.stage<6){ g.frame({x:[-1.4,1.4],y:[-1,1],xlabel:'stimulus θ',title:'bias & discriminability'}); g.note('→ advance to the final stage'); return; }
          let mn=0,mx=0; for(const b of d.bias){ mn=Math.min(mn,b[1]); mx=Math.max(mx,b[1]); } const pad=(mx-mn)*0.25||0.1;
          g.frame({x:[-1.4,1.4],y:[mn-pad,mx+pad],xlabel:'stimulus θ',ylabel:'bias b(θ)',title:'repulsion lobes + discriminability D∝1/p (dashed)'});
          g.hline(0,{color:T.faint,dash:[3,3]}); g.vline(0,{color:'rgba(80,75,65,.12)',dash:null,label:'prior peak'});
          const dmax=Math.max(...d.disc.map(c=>c[1]))||1, scale=(mx-mn)||1, dpts=d.disc.map(c=>[c[0], mn + c[1]/dmax*scale*0.9]);
          g.line(dpts,{color:T.faint,width:1.4,dash:[5,4]}); g.line(d.bias,{color:T.pos,width:2});
        }},
      ],
    },

    /* ---- Bayesian causal inference (Körding et al. 2007): infer whether two senses share
            a cause, then fuse or segregate. PROCESS mode. ---- */
    causal: {
      id:'causal', name:'Causal inference',
      blurb:'Two senses report a location. The observer infers whether they share one cause (C=1) or two (C=2), then estimates — fusing when a common cause is likely, segregating when not (Körding et al. 2007).',
      note:'Small disparity → p(C=1) high → estimates fuse (ventriloquism). Large disparity → segregate, each sense trusts itself. Lower p_common or raise the noises to change the regime. Averaging blends the branches by p(C=1); Select switches; Match samples.',
      params:[
        {name:'sV',      label:'Visual position sᵥ', min:-15, max:15, step:0.5, default:6},
        {name:'sA',      label:'Auditory position sₐ', min:-15, max:15, step:0.5, default:-4},
        {name:'sigV',    label:'Visual noise σᵥ', min:0.5, max:12, step:0.5, default:2},
        {name:'sigA',    label:'Auditory noise σₐ', min:0.5, max:15, step:0.5, default:8},
        {name:'sigP',    label:'Prior width σ_p', min:2, max:30, step:1, default:15},
        {name:'pCommon', label:'p(common cause)', min:0.05, max:0.95, step:0.05, default:0.5},
        {name:'strategy',label:'Avg(0)/Select(1)/Match(2)', min:0, max:2, step:1, default:0, int:true},
      ],
      simulate:(p,env)=>{ const C=global.MSLIB.causal, strat=['average','select','match'][p.strategy]||'average';
        const xv=p.sV+p.sigV*gaussian(env.rng), xa=p.sA+p.sigA*gaussian(env.rng);
        const r=C.ciEstimate(xv,xa,p.sigV,p.sigA,p.sigP,p.pCommon,{strategy:strat,g:()=>env.rng()});
        const lc=C.ciLikCommon(xv,xa,p.sigV,p.sigA,p.sigP), ls=C.ciLikSeparate(xv,xa,p.sigV,p.sigA,p.sigP);
        const biasV=[]; for(let dsp=-20; dsp<=20; dsp+=1){ const svT=dsp/2, saT=-dsp/2; let s=0,n=240;
          for(let k=0;k<n;k++){ const xv2=svT+p.sigV*gaussian(env.rng), xa2=saT+p.sigA*gaussian(env.rng);
            s+=C.ciEstimate(xv2,xa2,p.sigV,p.sigA,p.sigP,p.pCommon,{strategy:strat,g:()=>env.rng()}).sHatV; }
          biasV.push([dsp, s/n - svT]); }
        return { xv, xa, lc, ls, r, biasV }; },
      stages:()=>[
        {key:'cues',    name:'Cues arrive',           about:'Each sense gives a noisy reading: xᵥ~N(sᵥ,σᵥ²), xₐ~N(sₐ,σₐ²). Their disparity is the evidence about cause.'},
        {key:'lik',     name:'Hypothesis likelihoods', about:'How well does ONE common cause explain the pair vs TWO separate causes? Compute p(x|C=1) and p(x|C=2).'},
        {key:'postC',   name:'Causal posterior',       about:'Bayes with the prior p_common gives p(C=1|x) — the belief the senses share a cause.'},
        {key:'branch',  name:'Branch estimates',       about:'Fused estimate (assume common) vs segregated estimates (assume separate), each reliability-weighted with the prior.'},
        {key:'combine', name:'Combine',                about:'Blend the branches by p(C=1) (or Select / Match). The N-shaped bias vs disparity is the signature.'},
      ],
      views:[
        { title:'Process pipeline', draw:(g,d,ui)=> g.flow(ui.stages, ui.stage) },
        { title:'Cue plane', draw:(g,d,ui)=>{ const T=TH();
          g.frame({x:[-18,18],y:[-18,18],xlabel:'visual xᵥ',ylabel:'auditory xₐ',title:'cues in 2-D (diagonal = common cause)'});
          g.line([[-18,-18],[18,18]],{color:T.faint,dash:[4,4]});
          g.vline(0,{color:'rgba(80,75,65,.10)',dash:null}); g.hline(0,{color:'rgba(80,75,65,.10)',dash:null});
          g.marker(d.xv,d.xa,{color:T.accent,r:5,label:'(xᵥ,xₐ)'});
        }},
        { title:'Causal evidence', draw:(g,d,ui)=>{ const T=TH();
          g.frame({x:[0,1],y:[0,1],title:'one cause vs two → p(C=1|x)'}); const fr=g.frameRect(), ctx=g.ctx;
          if(ui.stage>=1){ const den=Math.max(d.lc,d.ls)||1, bw=fr.pw*0.16, bx1=fr.px+fr.pw*0.24, bx2=fr.px+fr.pw*0.58;
            ctx.fillStyle='rgba(74,122,147,.75)'; const h1=d.lc/den*fr.ph*0.72; ctx.fillRect(bx1,fr.py+fr.ph-h1,bw,h1);
            ctx.fillStyle='rgba(194,91,66,.75)'; const h2=d.ls/den*fr.ph*0.72; ctx.fillRect(bx2,fr.py+fr.ph-h2,bw,h2);
            ctx.fillStyle=T.dim; ctx.font='10px "IBM Plex Mono",monospace'; ctx.textAlign='center';
            ctx.fillText('common',bx1+bw/2,fr.py+fr.ph+13); ctx.fillText('separate',bx2+bw/2,fr.py+fr.ph+13); }
          if(ui.stage>=2){ const pc=d.r.pCommon; ctx.fillStyle=T.ink; ctx.font='600 13px "IBM Plex Sans",system-ui,sans-serif'; ctx.textAlign='center';
            ctx.fillText('p(C=1) = '+pc.toFixed(2), fr.px+fr.pw*0.5, fr.py+16);
            const gy=fr.py+30, gw=fr.pw*0.6, gx=fr.px+fr.pw*0.2; ctx.fillStyle='rgba(80,75,65,.12)'; ctx.fillRect(gx,gy,gw,7);
            ctx.fillStyle=T.pos; ctx.fillRect(gx,gy,gw*pc,7); }
        }},
        { title:'Estimates & bias', draw:(g,d,ui)=>{ const T=TH();
          if(ui.stage>=4){ let mn=0,mx=0; for(const b of d.biasV){ mn=Math.min(mn,b[1]); mx=Math.max(mx,b[1]); } const pad=(mx-mn)*0.15||1;
            g.frame({x:[-20,20],y:[mn-pad,mx+pad],xlabel:'disparity sᵥ−sₐ',ylabel:'visual bias',title:'N-shaped bias (ventriloquism)'});
            g.hline(0,{color:T.faint,dash:[3,3]}); g.line(d.biasV,{color:T.pos,width:2});
          } else { g.frame({x:[-18,18],y:[0,1],xlabel:'spatial position',title:'estimates on the spatial axis'});
            g.vline(d.xv,{color:T.accent,label:'xᵥ'}); g.vline(d.xa,{color:T.neg,label:'xₐ'});
            if(ui.stage>=3){ g.vline(d.r.sFused,{color:T.pos,dash:[3,2],label:'fused'}); g.vline(d.r.sSegV,{color:T.warn,dash:[3,2],label:'seg'}); } }
        }},
      ],
    },

    /* ---- Working-memory recall (Bays & Husain; Zhang & Luck): a limited resource sets
            precision; reports mix target / swap / guess. PROCESS mode + trial accumulation. ---- */
    wm: {
      id:'wm', name:'Working-memory recall',
      blurb:'Remember N items on a feature circle, then report one. A limited resource sets recall precision; reports are a mixture of accurate memory, swaps to a non-target, and uniform guesses (Bays & Husain; Zhang & Luck).',
      note:'Raise set size N → resource per item drops (precision↓). Swaps put mass under the non-targets; guesses raise a flat floor. The error histogram = target peak (κ) + swap bumps + uniform. Step ▶ through encode → recall → decompose.',
      params:[
        {name:'N',      label:'Set size N', min:1, max:8, step:1, default:4, int:true},
        {name:'kappa',  label:'Precision κ', min:1, max:60, step:1, default:16},
        {name:'pSwap',  label:'Swap rate β', min:0, max:0.6, step:0.02, default:0.15},
        {name:'pGuess', label:'Guess rate γ', min:0, max:0.6, step:0.02, default:0.1},
        {name:'nTrials',label:'Trials', min:100, max:6000, step:100, default:1500, int:true},
      ],
      simulate:(p,env)=>{ const W=global.MSLIB.wm, TWO=2*Math.PI, N=Math.round(p.N);
        // effective, self-consistent weights (sum to 1): no swaps without non-targets; renormalise if β+γ>1
        let pSwap = N<2 ? 0 : p.pSwap, pGuess = p.pGuess, pT = 1 - pSwap - pGuess;
        if(pT < 0){ const s=pSwap+pGuess; pSwap/=s; pGuess/=s; pT=0; }
        const offs=[]; for(let i=1;i<N;i++) offs.push(W.wrap(TWO*i/N));                       // fixed non-target offsets (clean demo)
        const tBase=W.wrap(-1.3+0.5*gaussian(env.rng)), items=[tBase].concat(offs.map(o=>W.wrap(tBase+o)));
        const cfg=k=>({target:k===undefined?0:k, nontargets: k===undefined?offs:items.slice(1), kappa:p.kappa, pT, pSwap, pGuess});
        const sample=W.mixtureRecall(cfg(tBase), ()=>env.rng());
        const n=Math.round(p.nTrials), errs=new Float64Array(n);
        for(let k=0;k<n;k++){ const rng=trialRng(env.seed,k); errs[k]=W.mixtureRecall(cfg(), ()=>rng()).thetaHat; }
        return { N, items, target:tBase, offs, sample, errs, pT, pSwap, pGuess, kappa:p.kappa, sd:W.kappaToSD(p.kappa) }; },
      stages:()=>[
        {key:'allocate',name:'Allocate resource', about:'A fixed memory resource is split across the N items: more items → less precision each (Bays & Husain power law).'},
        {key:'encode',  name:'Encode array',      about:'Each item is stored on the feature circle with a spread set by its precision (κ → circular SD).'},
        {key:'maintain',name:'Maintain',          about:'Items are held over the delay; here precision is fixed (the slots-vs-resource debate is about how κ changes).'},
        {key:'probe',   name:'Probe',             about:'One item is cued as the target; the others become potential swap targets.'},
        {key:'recall',  name:'Recall draw',       about:'Report = accurate memory (von Mises around target), a swap to a non-target, or a uniform guess.'},
        {key:'accum',   name:'Accumulate errors', about:'Over many trials the report error θ̂−θ builds a histogram: a peak at 0, bumps under non-targets, a flat floor.'},
        {key:'decomp',  name:'Decompose',         about:'Overlay the mixture: α·VM(target) + β·swap + γ·uniform — the Bays/Zhang–Luck decomposition.'},
      ],
      views:[
        { title:'Process pipeline', draw:(g,d,ui)=> g.flow(ui.stages, ui.stage) },
        { title:'Feature memory wheel', draw:(g,d,ui)=>{ const T=TH(), ctx=g.ctx, cx=g.w/2, cy=g.h/2+8, R=Math.min(g.w,g.h)*0.33;
          ctx.strokeStyle=T.faint; ctx.lineWidth=1.4; ctx.beginPath(); ctx.arc(cx,cy,R,0,2*Math.PI); ctx.stroke();
          ctx.fillStyle=T.dim; ctx.font='600 11px "IBM Plex Sans",system-ui,sans-serif'; ctx.textAlign='left'; ctx.fillText('feature circle (orientation / hue)',10,15);
          const P=(a,r)=>[cx+r*Math.cos(a), cy-r*Math.sin(a)], sd=Math.min(1.2,d.sd);
          if(ui.stage>=1) for(let i=0;i<d.items.length;i++){ const a=d.items[i], isT=i===0;
            ctx.strokeStyle=isT?'rgba(46,139,122,.30)':'rgba(74,122,147,.26)'; ctx.lineWidth=6; ctx.beginPath(); ctx.arc(cx,cy,R,-a-sd,-a+sd); ctx.stroke();
            const q=P(a,R); ctx.fillStyle=isT?T.pos:T.accent; ctx.beginPath(); ctx.arc(q[0],q[1],isT?5.5:4,0,7); ctx.fill(); }
          if(ui.stage>=3){ const t=P(d.target,R); ctx.strokeStyle=T.pos; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(t[0],t[1],9,0,7); ctx.stroke();
            ctx.fillStyle=T.pos; ctx.font='10px "IBM Plex Mono",monospace'; ctx.textAlign='center'; ctx.fillText('probe',t[0],t[1]-13); }
          if(ui.stage>=4 && d.sample){ const col=d.sample.branch==='target'?T.pos:d.sample.branch==='swap'?T.warn:T.neg, e=P(d.sample.thetaHat,R);
            ctx.strokeStyle=col; ctx.lineWidth=2.4; ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(e[0],e[1]); ctx.stroke();
            ctx.fillStyle=col; ctx.beginPath(); ctx.arc(e[0],e[1],4,0,7); ctx.fill(); ctx.textAlign='center'; ctx.font='10px "IBM Plex Mono",monospace'; ctx.fillText('report: '+d.sample.branch,cx,g.h-9); }
        }},
        { title:'Set size → precision', draw:(g,d,ui)=>{ const T=TH(), W=global.MSLIB.wm;
          g.frame({x:[1,8],y:[0,1.05],xlabel:'set size N',ylabel:'precision (rel.)',title:'shared-resource power law  P ∝ N^-0.74'});
          const pts=[1,2,3,4,5,6,7,8].map(N=>[N, W.precisionFromSetsize(N,{k:0.74})]);
          g.line(pts,{color:T.accent,width:2}); g.points(pts,{color:T.accent,r:3});
          g.marker(d.N, W.precisionFromSetsize(d.N,{k:0.74}),{color:T.pos,stroke:'#fff',r:5,label:'N='+d.N});
          g.text(1.15,0.13,'κ='+d.kappa+'  ·  circ.SD≈'+(d.sd*180/Math.PI).toFixed(0)+'°',{color:T.dim});
        }},
        { title:'Recall error & mixture', draw:(g,d,ui)=>{ const T=TH(), PIc=Math.PI, W=global.MSLIB.wm;
          if(ui.stage<5){ g.frame({x:[-PIc,PIc],y:[0,1],xlabel:'report error θ̂−θ (rad)',title:'recall-error histogram'}); g.note('→ recall over many trials'); return; }
          const hist=Plot.histify(Array.from(d.errs),61,-PIc,PIc); let mx=hist.max, curve=null, guessY=0;
          if(ui.stage>=6){ const comps={kappa:d.kappa,pT:d.pT,pSwap:d.pSwap,pGuess:d.pGuess,nontargetOffsets:d.offs}, NG=180; curve=[];
            for(let i=0;i<=NG;i++){ const x=-PIc+2*PIc*i/NG; curve.push([x, W.mixturePdf(x,comps)*d.errs.length*hist.binW]); }
            guessY=d.pGuess*(1/(2*PIc))*d.errs.length*hist.binW; mx=Math.max(mx,...curve.map(c=>c[1])); }
          g.frame({x:[-PIc,PIc],y:[0,mx*1.08],xlabel:'report error θ̂−θ (rad)',title:'target peak + swap bumps + guess floor'});
          for(const o of d.offs) g.vline(o,{color:'rgba(176,125,42,.45)',dash:[2,3]});
          g.bars(hist,{dir:'up',baseY:0,color:'rgba(74,122,147,.55)',max:mx});
          if(curve){ g.hline(guessY,{color:T.neg,dash:[4,3],label:'guess floor'}); g.line(curve,{color:T.pos,width:2}); g.legend([{label:'data',color:'rgba(74,122,147,.8)'},{label:'mixture',color:T.pos}]); }
        }},
      ],
    },

    /* ---- A drift-diffusion decision: animate one trial's evidence, accumulate RTs. ---- */
    ddm: {
      id:'ddm', name:'Drift-diffusion decision',
      blurb:'A pure evidence accumulator — the atom of decision models. Each timestep adds a fixed DRIFT (the signal) plus a random NOISE kick; repeat the atom and evidence random-walks to a bound (+z correct / −z error). Use the LEVEL switch (top) to zoom: one update → one trial → the whole distribution.',
      note:'Step: x′ = x + A·dt + c·√dt·ξ — signal vs noise made explicit. Trial: that atom repeated until a bound is hit = one choice and its RT. Simulation: thousands of trials → the choice proportions and RT histogram the model predicts (what you compare to data). Larger A → faster & more accurate; larger z → slower & more accurate; larger c → noisier.',
      params:[
        {name:'A', label:'Drift A (signal)', min:0, max:3, step:0.01, default:1},
        {name:'c', label:'Noise c', min:0.1, max:2, step:0.01, default:1},
        {name:'z', label:'Boundary z', min:0.2, max:2.5, step:0.01, default:1},
        {name:'dt',label:'dt', min:0.002, max:0.03, step:0.001, default:0.01, unit:'s'},
        {name:'nTrials', label:'Trials', min:100, max:8000, step:100, default:2000, int:true},
      ],
      simulate:(p, env)=>{ const n=Math.round(p.nTrials), out=new Int8Array(n), rt=new Float64Array(n), ms=Math.round(20/p.dt);
        for(let k=0;k<n;k++){ const rng=trialRng(env.seed,k); let x=0,t=0,st=0,o=0; while(st<ms){ x+=p.A*p.dt+p.c*Math.sqrt(p.dt)*gaussian(rng); t+=p.dt; st++; if(x>=p.z){o=1;break;} if(x<=-p.z){o=2;break;} } out[k]=o; rt[k]=t; }
        const dec=[]; for(let k=0;k<n;k++) if(out[k]) dec.push(rt[k]); dec.sort((a,b)=>a-b);
        const rtMax=dec.length?Math.min(20,dec[Math.floor(0.99*(dec.length-1))]*1.08):1;
        const pp={A:p.A,c:p.c,z:p.z,dt:p.dt}, steps0=ddmSteps(pp, env.seed, 0), stepCap=Math.min(steps0.length, 48);
        return { n, out, rt, rtMax, pp, seed:env.seed, steps0, stepCap }; },
      // THREE LENSES over the same data — step (one atomic update) · trial (one decision) · simulation (the statistics)
      lenses:{
        step:{ label:'⚛ Step', about:'one atomic update: evidence ← evidence + drift (signal) + noise',
          anim:{ length:(p,d)=>d.stepCap },
          views:[
            { title:'one update: x′ = x + drift + noise', draw:(g,d,ui)=>{ const T=TH(), z=d.pp.z, k=Math.min(d.stepCap-1,Math.floor(ui.head)), s=d.steps0[k];
              const inc=Math.max(Math.abs(s.drift), Math.abs(s.noise), 0.01), pad=inc*2.6+0.015, lo=Math.min(s.x,s.xNext)-pad, hi=Math.max(s.x,s.xNext)+pad;   // zoom to the ATOM so drift vs noise are comparable
              g.frame({x:[lo,hi], y:[-0.6,3.6], yticks:1, xlabel:'evidence x (zoomed to this step)', title:`one update — step ${k+1}: signal vs noise`});
              if(z<=hi&&z>=lo) g.vline(z,{color:T.pos,dash:[5,4],label:'+z'}); if(-z>=lo&&-z<=hi) g.vline(-z,{color:T.neg,dash:[5,4],label:'−z'}); if(0>=lo&&0<=hi) g.vline(0,{color:'rgba(80,75,65,.16)',dash:[2,3]});
              const gl=(xv,y0,y1)=>g.line([[xv,y0],[xv,y1]],{color:'rgba(80,75,65,.16)',dash:[2,3],width:1});
              gl(s.x,3,2); gl(s.x+s.drift,2,1); gl(s.xNext,1,0);
              g.text(lo,3,'x',{color:T.dim,size:10}); g.marker(s.x,3,{color:T.ink,r:4.5,label:s.x.toFixed(3)});
              g.text(lo,2,'+ drift',{color:T.dim,size:10}); g.arrow(s.x,2,s.x+s.drift,2,{color:T.accent,label:`A·dt +${s.drift.toFixed(3)}`});
              g.text(lo,1,'+ noise',{color:T.dim,size:10}); g.arrow(s.x+s.drift,1,s.xNext,1,{color:s.noise>=0?T.warn:T.neg,label:`${s.noise>=0?'+':''}${s.noise.toFixed(3)}`});
              g.text(lo,0,'x′',{color:T.dim,size:10}); g.marker(s.xNext,0,{color:s.cross?(s.cross===1?T.pos:T.neg):T.ink,r:4.5,label:s.xNext.toFixed(3)});
              if(s.cross) g.text((lo+hi)/2,-0.45,s.cross===1?'✓ crossed +z → correct':'✗ crossed −z → error',{color:s.cross===1?T.pos:T.neg,size:10,align:'center'});
            }},
            { title:'…repeat the atom → a trajectory', draw:(g,d,ui)=>{ const T=TH(), z=d.pp.z, k=Math.min(d.stepCap-1,Math.floor(ui.head)), tWin=Math.max(0.05,d.stepCap*d.pp.dt);
              g.frame({x:[0,tWin], y:[-z*1.5,z*1.5], xlabel:'time (s)', title:`first ${d.stepCap} steps`});
              g.hline(0,{color:'rgba(80,75,65,.12)',dash:null}); g.hline(z,{color:T.pos,dash:[5,4],label:'+z'}); g.hline(-z,{color:T.neg,dash:[5,4],label:'−z'});
              const pts=[[0,0]]; for(let i=0;i<=k;i++) pts.push([d.steps0[i].t+d.pp.dt, d.steps0[i].xNext]);
              g.clip().line(pts,{color:T.accent,width:2}).unclip(); const tip=pts[pts.length-1]; g.marker(tip[0],Math.max(-z*1.5,Math.min(z*1.5,tip[1])),{color:T.ink,r:3.2});
            }},
          ] },
        trial:{ label:'◷ Trial', about:'one trial: the atom repeated until evidence hits a bound — a choice and its RT',
          anim:{ length:(p,d)=>d.steps0.length },
          views:[
            { title:'one trial: evidence random-walks to a bound', draw:(g,d,ui)=>{ const T=TH(), z=d.pp.z, k=Math.min(d.steps0.length-1,Math.floor(ui.head)), tView=Math.max(0.2,d.rtMax*1.05);
              g.frame({x:[0,tView], y:[-z*1.5,z*1.5], xlabel:'time (s)', title:'evidence x(t) — trial 1'});
              g.hline(0,{color:'rgba(80,75,65,.12)',dash:null}); g.hline(z,{color:T.pos,dash:[5,4],label:'+z (correct)'}); g.hline(-z,{color:T.neg,dash:[5,4],label:'−z (error)'});
              const pts=[[0,0]]; for(let i=0;i<=k;i++) pts.push([d.steps0[i].t+d.pp.dt, d.steps0[i].xNext]);
              const last=d.steps0[k], done=!!last.cross && k>=d.steps0.length-1;
              g.clip().line(pts,{color:done?(last.cross===1?T.pos:T.neg):'#6b675d',width:2}).unclip();
              const tip=pts[pts.length-1]; g.marker(tip[0],Math.max(-z*1.5,Math.min(z*1.5,tip[1])),{color:done?(last.cross===1?T.pos:T.neg):T.ink,r:3.4});
              if(done) g.text(tip[0],(last.cross===1?1:-1)*z*1.34,`${last.cross===1?'✓ correct':'✗ error'} · RT ${(last.t+d.pp.dt).toFixed(2)} s`,{color:last.cross===1?T.pos:T.neg,size:10,align:'right'});
            }},
          ] },
        sim:{ label:'∑ Simulation', about:'thousands of trials → the choice proportions & RT histogram the model predicts',
          anim:{ length:(p)=>Math.round(p.nTrials) },
          views:[
            { title:'each trial flashes by', draw:(g,d,ui)=>{ const T=TH(), k=Math.min(d.n-1,Math.floor(ui.head)), frac=ui.playing?(ui.head-Math.floor(ui.head)):1;
              const path=ddmPath(d.pp,d.seed,k), z=d.pp.z, tView=Math.max(0.2,d.rtMax*1.05);
              g.frame({x:[0,tView], y:[-z*1.5,z*1.5], xlabel:'time (s)', title:`trial ${k+1} of ${d.n.toLocaleString()}`});
              g.hline(0,{color:'rgba(80,75,65,.12)',dash:null}); g.hline(z,{color:T.pos,dash:[5,4],label:'+z'}); g.hline(-z,{color:T.neg,dash:[5,4],label:'−z'});
              const nshow=Math.max(2,Math.floor(path.pts.length*frac)), done=nshow>=path.pts.length&&path.outcome;
              g.clip().line(path.pts.slice(0,nshow),{color:done?(path.outcome===1?T.pos:T.neg):'#6b675d',width:1.6}).unclip();
            }},
            { title:'response-time distribution (building up)', draw:(g,d,ui)=>{ const T=TH(), k=Math.min(d.n,Math.floor(ui.head)); const cor=[],err=[];
              for(let i=0;i<k;i++){ if(d.out[i]===1)cor.push(d.rt[i]); else if(d.out[i]===2)err.push(d.rt[i]); }
              const hc=HIST(cor,52,0,d.rtMax,d.pp.dt), he=HIST(err,52,0,d.rtMax,d.pp.dt), mx=Math.max(hc.max,he.max,1);
              g.frame({x:[0,d.rtMax], y:[-mx,mx], xlabel:'RT (s)', yticks:4, title:'correct ↑   ·   error ↓'});
              g.hline(0,{color:'rgba(80,75,65,.18)',dash:null});
              g.bars(hc,{dir:'up',baseY:0,color:'rgba(46,139,122,.78)',max:mx,height:g.Y(0)-g.frameRect().py});
              g.bars(he,{dir:'down',baseY:0,color:'rgba(194,91,66,.78)',max:mx,height:g.frameRect().py+g.frameRect().ph-g.Y(0)});
              const dec=cor.length+err.length, er=dec?100*err.length/dec:0;
              g.text(d.rtMax*0.02, mx*0.92, `${dec.toLocaleString()} trials · error ${er.toFixed(1)}%`, {color:T.dim});
            }},
          ] },
      },
    },
  };
  const MODEL_ORDER = ['bayes','efficient','causal','wm','ddm'];

  global.SIM = { makeRNG, gaussian, hashSeed, trialRng, npdf, ddmPath, ddmSteps, runChunks, MODELS, MODEL_ORDER };
})(typeof window !== 'undefined' ? window : globalThis);
