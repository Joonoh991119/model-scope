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
  const TH = ()=> (global.Plot ? global.Plot.TH : {accent:'#4a7a93',pos:'#2e8b7a',neg:'#c25b42',warn:'#b07d2a',ink:'#33312c',dim:'#6f6b61',faint:'#a39e91',grid:'#e7e3d8',edge:'#d6d2c5'});
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

  // ---- early-vision helpers (an IMAGE-input exemplar): grating → Gabor energy channels → readout ----
  function visScene(N, ori, sf, contrast, noiseAmp, seed){   // a noisy oriented grating, N×N (signed intensities)
    const rng=makeRNG(seed+'#scene'), img=new Float64Array(N*N), th=ori*Math.PI/180, kx=Math.cos(th), ky=Math.sin(th), f=sf*2*Math.PI/N;
    for(let y=0;y<N;y++) for(let x=0;x<N;x++) img[y*N+x]=contrast*Math.sin(f*((x-N/2)*kx+(y-N/2)*ky)) + noiseAmp*gaussian(rng);
    return img; }
  function gaborKernel(ori, sf, sigma, phase, N){           // zero-mean Gabor, radius from sigma
    const R=Math.max(3,Math.round(sigma*2.4)), sz=2*R+1, k=new Float64Array(sz*sz), th=ori*Math.PI/180, ct=Math.cos(th), st=Math.sin(th), f=sf*2*Math.PI/N;
    let s=0; for(let j=-R;j<=R;j++) for(let i=-R;i<=R;i++){ const xp=i*ct+j*st, yp=-i*st+j*ct, g=Math.exp(-(xp*xp+yp*yp)/(2*sigma*sigma))*Math.cos(f*xp+phase); k[(j+R)*sz+(i+R)]=g; s+=g; }
    const m=s/(sz*sz); for(let t=0;t<k.length;t++) k[t]-=m; return {k,R,sz}; }
  function conv2(img, N, ker){ const {k,R,sz}=ker, out=new Float64Array(N*N);
    for(let y=0;y<N;y++) for(let x=0;x<N;x++){ let a=0; for(let j=-R;j<=R;j++){ const yy=y+j; if(yy<0||yy>=N)continue; for(let i=-R;i<=R;i++){ const xx=x+i; if(xx<0||xx>=N)continue; a+=img[yy*N+xx]*k[(j+R)*sz+(i+R)]; } } out[y*N+x]=a; }
    return out; }
  const VGRAY=(v,lim)=>{ const t=Math.max(0,Math.min(1,(v/(lim||1)+1)/2)), c=Math.round(20+225*t); return [c,c,c]; };       // signed → gray
  const VHOT =(v,mx)=>{ const t=Math.max(0,Math.min(1,v/(mx||1))); return [Math.round(34+221*Math.sqrt(t)), Math.round(30+165*t), Math.round(92*(1-t))]; }; // energy → warm

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
          g.frame({x:[d.lo,d.hi], y:[0,ymax], xlabel:'stimulus value', title:'prior, likelihood, posterior'});
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
      note:'Low noise + BLS (L2) loss → bias points AWAY from the prior peak (the "anti-Bayesian" repulsion). Switch to MAP, or raise σ, and the prior wins (attraction). Discriminability is best where the prior is densest. Step through the stages.',
      params:[
        {name:'theta',   label:'True stimulus θ', min:-3, max:3, step:0.05, default:1.1},
        {name:'sigma',   label:'Sensory noise σ', min:0.02, max:0.5, step:0.005, default:0.1},
        {name:'priorSD', label:'Prior width σ_prior', min:0.4, max:2.5, step:0.05, default:1},
        {name:'lossMAP', label:'Loss function', type:'enum', options:['BLS','MAP'], default:0},
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
        { title:'Likelihood, prior, posterior', draw:(g,d,ui)=>{ const T=TH(), p=ui.params;
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
        {name:'strategy', label:'Combination rule', type:'enum', options:['average','select','match'], default:0},
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
      note:'Raise set size N and the resource per item drops (lower precision). Swaps put mass under the non-targets; guesses raise a flat floor. The error histogram = target peak (κ) + swap bumps + uniform. Step through encode, recall, and decompose.',
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
          g.text(1.15,0.13,'κ='+d.kappa+' ,  circ.SD≈'+(d.sd*180/Math.PI).toFixed(0)+'°',{color:T.dim});
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
      blurb:'A pure evidence accumulator — the atom of decision models. Each timestep adds a fixed DRIFT (the signal) plus a random NOISE kick; repeat the atom and evidence random-walks to a bound (+z correct / −z error). Use the lens switch (top) to zoom: one update → one trial → the whole distribution.',
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
      // THREE LENSES over the same data — step (one atomic update), trial (one decision), simulation (the statistics)
      lenses:{
        step:{ label:'Step', about:'one atomic update: evidence ← evidence + drift (signal) + noise',
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
        trial:{ label:'Trial', about:'one trial: the atom repeated until evidence hits a bound — a choice and its RT',
          anim:{ length:(p,d)=>d.steps0.length },
          views:[
            { title:'one trial: evidence random-walks to a bound', draw:(g,d,ui)=>{ const T=TH(), z=d.pp.z, k=Math.min(d.steps0.length-1,Math.floor(ui.head)), tView=Math.max(0.2,d.rtMax*1.05);
              g.frame({x:[0,tView], y:[-z*1.5,z*1.5], xlabel:'time (s)', title:'evidence x(t) — trial 1'});
              g.hline(0,{color:'rgba(80,75,65,.12)',dash:null}); g.hline(z,{color:T.pos,dash:[5,4],label:'+z (correct)'}); g.hline(-z,{color:T.neg,dash:[5,4],label:'−z (error)'});
              const pts=[[0,0]]; for(let i=0;i<=k;i++) pts.push([d.steps0[i].t+d.pp.dt, d.steps0[i].xNext]);
              const last=d.steps0[k], done=!!last.cross && k>=d.steps0.length-1;
              g.clip().line(pts,{color:done?(last.cross===1?T.pos:T.neg):'#6b675d',width:2}).unclip();
              const tip=pts[pts.length-1]; g.marker(tip[0],Math.max(-z*1.5,Math.min(z*1.5,tip[1])),{color:done?(last.cross===1?T.pos:T.neg):T.ink,r:3.4});
              if(done) g.text(tip[0],(last.cross===1?1:-1)*z*1.34,`${last.cross===1?'✓ correct':'✗ error'}, RT ${(last.t+d.pp.dt).toFixed(2)} s`,{color:last.cross===1?T.pos:T.neg,size:10,align:'right'});
            }},
          ] },
        sim:{ label:'Simulation', about:'thousands of trials → the choice proportions & RT histogram the model predicts',
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
              g.frame({x:[0,d.rtMax], y:[-mx,mx], xlabel:'RT (s)', yticks:4, title:'correct above, error below'});
              g.hline(0,{color:'rgba(80,75,65,.18)',dash:null});
              g.bars(hc,{dir:'up',baseY:0,color:'rgba(46,139,122,.78)',max:mx,height:g.Y(0)-g.frameRect().py});
              g.bars(he,{dir:'down',baseY:0,color:'rgba(194,91,66,.78)',max:mx,height:g.frameRect().py+g.frameRect().ph-g.Y(0)});
              const dec=cor.length+err.length, er=dec?100*err.length/dec:0;
              g.text(d.rtMax*0.02, mx*0.92, `${dec.toLocaleString()} trials, error ${er.toFixed(1)}%`, {color:T.dim});
            }},
          ] },
      },
    },

    /* ---- COMPARISON exemplar: two decision strategies sharing the same signal/noise, switched by a
       TOGGLE — drift-diffusion (integrate to a bound) vs a single-sample observer. Showcases comparing
       a model CHOICE + PARAMETERS via sliders/toggles, a 2-D metric HEATMAP, and several METRICS. Analytic. */
    compare: {
      id:'compare', name:'Decision: integrate vs one sample',
      blurb:'Two 2-alternative strategies with the SAME signal (drift A) and noise c — toggle between them: a drift-diffusion model INTEGRATES evidence to a bound ±z (variable time), or a single-sample observer takes ONE noisy reading over a fixed time T and reports its sign. Panel 1 overlays their speed-accuracy frontiers, panel 2 maps the chosen metric over the (drift, noise) plane, panel 3 compares accuracy, speed, and reward at the operating point, panel 4 shows the mechanism.',
      note:'Same A, c — only the mechanism differs. DDM: accuracy 1/(1+e^(−2Az/c²)), mean decision time (z/A)·tanh(Az/c²) — raising the bound z buys accuracy but costs time, so reward rate is NON-monotonic in z. Single-sample: a FIXED accuracy Φ(A√T/c) and a flat tradeoff (it can only trade by observing longer). Integration dominates when the signal is strong; they converge at low noise. The toggle re-skins panels 2 and 3; the Metric selector swaps the surface in panel 2. (Bogacz et al. 2006; Gold & Shadlen 2007.)',
      params:[
        {name:'A', label:'Drift A (signal)', min:0, max:3, step:0.01, default:1.0},
        {name:'c', label:'Noise c', min:0.2, max:2.5, step:0.01, default:1.0},
        {name:'z', label:'DDM bound z', min:0.2, max:2.5, step:0.01, default:1.0},
        {name:'T', label:'Single-sample obs. time T', min:0.05, max:2.0, step:0.01, default:0.5, unit:'s'},
        {name:'Ter', label:'Non-decision time', min:0, max:0.6, step:0.01, default:0.2, unit:'s'},
        {name:'metric', label:'Heatmap metric', type:'enum', options:['accuracy','RT','reward'], default:0},
        {name:'useDDM', label:'Model: single-sample vs DDM', type:'bool', default:true},
      ],
      simulate:(p, env)=>{ const Phi=global.MSLIB.sde.normcdf, c2=p.c*p.c;
        const accDDM=(A,z,cc2)=>1/(1+Math.exp(-2*A*z/cc2)), dtDDM=(A,z,cc2)=>Math.abs(A)<1e-6? z*z/cc2 : (z/A)*Math.tanh(A*z/cc2);
        const accD=accDDM(p.A,p.z,c2), dtD=dtDDM(p.A,p.z,c2), accS=Phi(p.A*Math.sqrt(p.T)/p.c), dtS=p.T;
        const rrD=accD/(dtD+p.Ter), rrS=accS/(dtS+p.Ter);
        const NB=60, satDDM=[], satSS=[]; for(let i=0;i<=NB;i++){ const zz=0.15+(2.6-0.15)*i/NB; satDDM.push([dtDDM(p.A,zz,c2)+p.Ter, accDDM(p.A,zz,c2)]);
          const TT=0.03+(2.2-0.03)*i/NB; satSS.push([TT+p.Ter, Phi(p.A*Math.sqrt(TT)/p.c)]); }
        const tMax=Math.max(satDDM[NB][0], satSS[NB][0])*1.04;
        const NX=44, NY=44, Amin=0, Amax=3, cmin=0.2, cmax=2.5, grid=new Float64Array(NX*NY); let gmin=Infinity, gmax=-Infinity;
        for(let i=0;i<NX;i++){ const A=Amin+(Amax-Amin)*i/(NX-1);
          for(let j=0;j<NY;j++){ const cc=cmin+(cmax-cmin)*j/(NY-1), cc2=cc*cc; let v;
            if(p.useDDM){ const a=accDDM(A,p.z,cc2), t=dtDDM(A,p.z,cc2)+p.Ter; v=p.metric===0?a:p.metric===1?t:a/t; }
            else { const a=Phi(A*Math.sqrt(p.T)/cc), t=p.T+p.Ter; v=p.metric===0?a:p.metric===1?t:a/t; }
            grid[j*NX+i]=v; if(v<gmin)gmin=v; if(v>gmax)gmax=v; } }
        const metricName=['accuracy','mean RT (s)','reward rate (1/s)'][p.metric];
        return { accD, dtD, accS, dtS, rrD, rrS, satDDM, satSS, tMax, grid, NX, NY, Amin, Amax, cmin, cmax, gmin, gmax, metric:p.metric, metricName, useDDM:p.useDDM, A:p.A, c:p.c, z:p.z, T:p.T, Ter:p.Ter }; },
      views:[
        { title:'speed–accuracy: integrate-to-bound vs one sample', draw:(g,d)=>{ const T=TH();
          g.frame({x:[0,d.tMax], y:[0.46,1.02], xlabel:'time to decision (s)', ylabel:'accuracy', title:'DDM trades time for accuracy along the bound; one sample is flat'});
          g.hline(1,{color:'rgba(80,75,65,.28)',dash:[2,3],label:'ceiling'}); g.hline(0.5,{color:'rgba(80,75,65,.3)',dash:[4,3],label:'chance'});
          const clip=a=>a.map(q=>[q[0],Math.max(0.5,Math.min(1,q[1]))]);
          g.line(clip(d.satDDM),{color:T.accent,width:d.useDDM?2.6:1.3,dash:d.useDDM?null:[4,3]});
          g.line(clip(d.satSS),{color:T.neg,width:d.useDDM?1.3:2.6,dash:d.useDDM?[4,3]:null});
          g.marker(d.dtD+d.Ter, Math.max(0.5,Math.min(1,d.accD)), {color:T.accent,stroke:'#fff',r:5,label:'DDM'});
          g.marker(d.T+d.Ter, Math.max(0.5,Math.min(1,d.accS)), {color:T.neg,stroke:'#fff',r:5,label:'1-sample'});
          g.legend([{label:'DDM (sweep bound z)',color:T.accent},{label:'1-sample (sweep T)',color:T.neg}],{corner:'br'}); }},
        { title:'metric over (drift, noise) — heatmap', draw:(g,d)=>{ const T=TH();
          const cmap=v=>{ const t=Math.max(0,Math.min(1,(v-d.gmin)/((d.gmax-d.gmin)||1))); return [Math.round(246-150*t), Math.round(241-78*t), Math.round(228-92*t)]; };
          g.frame({cbar:true, x:[d.Amin,d.Amax], y:[d.cmin,d.cmax], xlabel:'drift A', ylabel:'noise c', title:(d.useDDM?'DDM, ':'1-sample, ')+d.metricName+' over (A × c)'});
          g.heat(d.NX, d.NY, (i,j)=>d.grid[j*d.NX+i], cmap);
          const fmt=v=>d.metric===0?v.toFixed(2):v.toFixed(2); g.colorbar(d.gmin, d.gmax, cmap, {ticks:[{v:d.gmin,label:fmt(d.gmin)},{v:(d.gmin+d.gmax)/2,label:fmt((d.gmin+d.gmax)/2)},{v:d.gmax,label:fmt(d.gmax)}], label:d.metricName});
          g.marker(d.A, d.c, {color:'#fff', stroke:T.ink, r:5, label:'now'}); }},
        { title:'this operating point — DDM vs 1-sample', draw:(g,d)=>{ const T=TH(), ctx=g.ctx;
          const groups=[{name:'accuracy',dv:d.accD,sv:d.accS,f:x=>x.toFixed(2),floor:0.5},{name:'speed (1/s)',dv:1/(d.dtD+d.Ter),sv:1/(d.T+d.Ter),f:x=>x.toFixed(1)},{name:'reward (1/s)',dv:d.rrD,sv:d.rrS,f:x=>x.toFixed(2)}];
          g.frame({x:[-0.5,2.5], y:[0,1.18], yticks:2, xticklabels:groups.map(q=>q.name), title:'accuracy floored at chance (0=chance); speed/reward scaled to the larger bar'});
          const bw=0.17, aD=d.useDDM?1:0.4, aS=d.useDDM?0.4:1;
          groups.forEach((q,i)=>{ const h=q.floor!=null?(v=>Math.max(0,Math.min(1,(v-q.floor)/(1-q.floor)))):(v=>v/Math.max(q.dv,q.sv,1e-9)), hD=h(q.dv), hS=h(q.sv), y0=g.Y(0);
            ctx.fillStyle='rgba(74,122,147,'+aD+')'; ctx.fillRect(g.X(i-bw*1.05)-1, g.Y(hD), g.X(i)-g.X(i-bw*1.05), y0-g.Y(hD));
            ctx.fillStyle='rgba(194,91,66,'+aS+')'; ctx.fillRect(g.X(i+0.02), g.Y(hS), g.X(i+bw*1.05)-g.X(i+0.02), y0-g.Y(hS));
            ctx.fillStyle=T.dim; ctx.font=(9*(g.FS||1)).toFixed(1)+'px "IBM Plex Mono",monospace'; ctx.textAlign='center';
            ctx.fillText(q.f(q.dv), g.X(i-bw*0.52), g.Y(hD)-4); ctx.fillText(q.f(q.sv), g.X(i+bw*0.54), g.Y(hS)-4); });
          g.legend([{label:'DDM',color:T.accent},{label:'1-sample',color:T.neg}],{corner:'tr'}); }},
        { title:'mechanism: walk-to-bound vs single draw', draw:(g,d)=>{ const T=TH();
          g.frame({x:[0,d.tMax], y:[-d.z*1.7,d.z*1.7], xlabel:'time (s)', ylabel:'evidence', title:'DDM integrates to ±z, 1-sample draws once at T, decides sign'});
          g.hline(d.z,{color:T.pos,dash:[5,4],label:'+z'}); g.hline(-d.z,{color:T.neg,dash:[5,4],label:'−z'}); g.hline(0,{color:'rgba(80,75,65,.18)',dash:null});
          g.line([[0,0],[d.dtD, Math.min(d.z, d.A*d.dtD)]],{color:T.accent,width:2.4}); g.vline(d.dtD+d.Ter,{color:T.accent,dash:[3,3],label:'mean DT'});
          const yMu=Math.max(-d.z*1.7,Math.min(d.z*1.7, d.A*d.T)), sd=d.c*Math.sqrt(d.T);
          g.line([[d.T, Math.max(-d.z*1.7,yMu-sd)],[d.T, Math.min(d.z*1.7,yMu+sd)]],{color:T.neg,width:3}); g.marker(d.T, yMu,{color:T.neg,stroke:'#fff',r:4,label:'one draw ±SD'});
          g.vline(d.T+d.Ter,{color:T.neg,dash:[3,3]});
          g.legend([{label:'DDM drift→bound',color:T.accent},{label:'1-sample @ T',color:T.neg}],{corner:'bl'}); }},
      ],
    },

    /* ---- An IMAGE-input exemplar (a different model class): early-vision orientation readout.
       STRUCTURE FIRST (the filter-bank architecture + receptive fields), then the input image,
       the channel transform, and the readout. Shows the harness generalises to image/CNN models. */
    vision: {
      id:'vision', name:'Early vision — orientation',
      blurb:'A SENSORY model with IMAGE input. A noisy oriented grating is filtered by a bank of oriented Gabor energy channels; pooling them reads out the orientation. Use the lens switch for the angles — structure first: the filter-bank architecture (the channels and their receptive fields), the input image, how each channel re-represents it, the orientation readout. Move the sliders and watch them update.',
      note:'Each channel is a quadrature Gabor pair (energy = even² + odd²) tuned to one orientation, so the image becomes one energy map per channel. Pooled energy across channels is an orientation tuning curve whose population-vector peak is the decoded orientation. Higher contrast or lower noise gives sharper tuning and a more accurate read-out. A different model class from the trial-based models (no time axis) — same harness, angles chosen to fit.',
      params:[
        {name:'ori', label:'Orientation θ (condition)', min:0, max:179, step:1, default:45, unit:'°'},
        {name:'sf', label:'Spatial frequency', min:1, max:8, step:0.1, default:3, unit:'cyc/img'},
        {name:'contrast', label:'Contrast', min:0, max:1, step:0.01, default:0.8},
        {name:'noise', label:'Pixel noise', min:0, max:1, step:0.01, default:0.25},
      ],
      simulate:(p, env)=>{ const N=40, K=6, oris=[]; for(let k=0;k<K;k++) oris.push(k*180/K);
        const img=visScene(N, p.ori, p.sf, p.contrast, p.noise, env.seed), sigma=N/12;
        let imgLim=1e-6; for(let t=0;t<img.length;t++) imgLim=Math.max(imgLim, Math.abs(img[t]));
        const maps=[], pooled=[]; let emax=1e-9;
        for(let k=0;k<K;k++){ const ev=conv2(img,N,gaborKernel(oris[k],p.sf,sigma,0,N)), od=conv2(img,N,gaborKernel(oris[k],p.sf,sigma,Math.PI/2,N)), en=new Float64Array(N*N);
          let s=0; for(let t=0;t<N*N;t++){ const e=ev[t]*ev[t]+od[t]*od[t]; en[t]=e; if(e>emax)emax=e; s+=e; } maps.push(en); pooled.push(s/(N*N)); }
        let sx=0,sy=0; for(let k=0;k<K;k++){ const a=2*oris[k]*Math.PI/180; sx+=pooled[k]*Math.cos(a); sy+=pooled[k]*Math.sin(a); }   // orientation is π-periodic → decode on 2θ
        let dec=Math.atan2(sy,sx)*90/Math.PI; dec=((dec%180)+180)%180;
        return { N, K, oris, img, imgLim, maps, pooled, dec, emax, pmax:Math.max(...pooled,1e-9), ori:p.ori, sf:p.sf };
      },
      lenses:{
        architecture:{ label:'Architecture', about:'the model structure — a bank of oriented Gabor channels and their receptive fields, before any input',
          views:[ { title:'filter-bank architecture — oriented Gabor receptive fields', draw:(g,d)=>{ const T=TH(), ctx=g.ctx, W=g.w, H=g.h, F=g.FS, K=d.K, M=26, sig=M/5, sfD=Math.max(1.2, d.sf*M/d.N);
            ctx.textAlign='center'; ctx.fillStyle=T.ink; ctx.font=(13*F)+'px sans-serif';
            ctx.fillText('the architecture: '+K+' oriented Gabor channels, each a receptive field', W/2, 22*F);
            const pw=Math.min(86*F, (W-40*F)/K - 8*F), gap=(W-40*F - K*pw)/Math.max(1,K-1), y0=46*F, x0=20*F;
            for(let k=0;k<K;k++){ const x=x0 + k*(pw+gap), gk=gaborKernel(d.oris[k], sfD, sig, 0, M), sz=gk.sz;
              let lim=1e-6; for(let t=0;t<gk.k.length;t++) lim=Math.max(lim, Math.abs(gk.k[t]));
              g.image(sz, sz, (i,j)=>gk.k[j*sz+i], v=>VGRAY(v,lim), {x, y:y0, w:pw, h:pw});
              ctx.strokeStyle=T.edge; ctx.lineWidth=1; ctx.strokeRect(x,y0,pw,pw);
              const hit=Math.abs(((d.oris[k]-d.ori+90)%180)-90)<16; ctx.fillStyle=hit?T.accent:T.dim; ctx.font=(11*F)+'px monospace'; ctx.textAlign='center';
              ctx.fillText(d.oris[k].toFixed(0)+'°', x+pw/2, y0+pw+15*F); }
            const fy=y0+pw+44*F; ctx.textAlign='center';
            ctx.fillStyle=T.dim; ctx.font=(12*F)+'px sans-serif';
            ctx.fillText('input image, filtered by each oriented channel, energy = even² + odd², pooled across channels, decoded to θ̂', W/2, fy);
            ctx.fillStyle=T.faint; ctx.font=(11*F)+'px sans-serif';
            ctx.fillText('The channel matching the stimulus responds most; tuning width and accuracy depend on contrast, frequency, and noise.', W/2, fy+20*F);
          }} ] },
        input:{ label:'Input', about:'the stimulus image — a noisy grating at orientation θ (all the model sees)',
          views:[ { title:'input image', draw:(g,d)=>{ const N=d.N;
            g.frame({cbar:true, x:[0,N], y:[0,N], xticks:1, yticks:1, xlabel:'pixels', title:`input image — θ=${d.ori}° (vary θ, frequency, contrast, noise)`});
            g.heat(N,N,(i,j)=> d.img[j*N+i], v=>VGRAY(v,d.imgLim));
            g.colorbar(-d.imgLim, d.imgLim, v=>VGRAY(v,d.imgLim), {ticks:[{v:-d.imgLim,label:'−'},{v:0,label:'0'},{v:d.imgLim,label:'+'}], label:'intensity'});
          }} ] },
        transform:{ label:'Transform', about:'each oriented channel re-represents the image as an energy map',
          views:[ { title:'oriented Gabor energy maps — one per channel', draw:(g,d)=>{ const N=d.N, K=d.K, cols=3, rows=Math.ceil(K/cols);
            g.frame({cbar:true, x:[0,cols*N], y:[0,rows*N], xticks:1, yticks:1, title:'how each orientation channel re-represents the image'});
            g.heat(cols*N, rows*N, (i,j)=>{ const col=Math.floor(i/N), rowB=Math.floor(j/N), k=(rows-1-rowB)*cols+col; if(k<0||k>=K) return -1; return d.maps[k][(j%N)*N+(i%N)]; }, v=> v<0?[244,243,238]:VHOT(v,d.emax), {smooth:false});
            for(let k=0;k<K;k++){ const col=k%cols, row=Math.floor(k/cols), cx=(col+0.5)*N, cy=(rows-1-row)*N + N*0.9, hit=Math.abs(((d.oris[k]-d.ori+90)%180)-90)<16;
              g.text(cx, cy, d.oris[k].toFixed(0)+'°', {color: hit?'#fff':'rgba(255,255,255,.82)', size:9.5, align:'center'}); }
            g.colorbar(0, d.emax, v=>VHOT(v,d.emax), {label:'energy'});
          }} ] },
        readout:{ label:'Readout', about:'pool the channels → orientation tuning curve → decoded orientation',
          views:[ { title:'orientation tuning (pooled energy) → decoded θ̂', draw:(g,d)=>{ const T=TH();
            g.frame({x:[-12,180], y:[0, d.pmax*1.18], xlabel:'channel orientation (°)', ylabel:'pooled energy', title:`readout: tuning peak = decoded θ̂ = ${d.dec.toFixed(0)}° (true ${d.ori}°)`});
            const pts=d.oris.map((o,k)=>[o,d.pooled[k]]); g.line(pts,{color:T.accent,width:2}); g.points(pts,{color:T.accent,r:4});
            g.vline(d.ori,{color:'rgba(80,75,65,.5)',dash:[4,3],label:'true θ'});
            g.vline(d.dec,{color:T.pos,dash:[5,4],label:'decoded θ̂'});
          }} ] },
      },
    },

    /* ---- single-neuron biophysics: leaky integrate-and-fire (composed from MSLIB.neuron) ---- */
    lif: {
      id:'lif', name:'Spiking neuron (LIF)',
      blurb:'A leaky integrate-and-fire neuron: input current charges the membrane until it hits threshold, fires a spike, and resets. Use the lens switch for the angles: one V(t) trace, a spike raster over repeats, the f-I transfer curve. Move the current, noise, and membrane sliders.',
      note:'dV/dt = (−(V−EL) + R·I)/τ with a hard threshold→reset (Vth→Vreset) and a refractory period. Stronger current → faster charging → higher rate (the f–I curve); current noise jitters spike times (the raster); toggle the refractory period off and the f–I curve loses its ceiling. A canonical single-neuron model, composed from MSLIB.neuron.',
      params:[
        {name:'I', label:'Input current I (condition)', min:0, max:0.8, step:0.005, default:0.35, unit:'nA'},
        {name:'sigma', label:'Current noise σ', min:0, max:0.3, step:0.005, default:0.06, unit:'nA'},
        {name:'tau', label:'Membrane τ', min:5, max:40, step:1, default:20, unit:'ms'},
        {name:'reps', label:'Repeats (raster)', min:5, max:60, step:1, default:30, int:true},
        {name:'refrac', label:'Refractory period (toggle)', type:'bool', default:true},
      ],
      simulate:(p, env)=>{ const ML=global.MSLIB.neuron, dt=0.0005, T=0.5, nS=Math.round(T/dt), pr={...ML.LIF_DEFAULT, tau:p.tau/1000, tref: p.refrac===false?0:ML.LIF_DEFAULT.tref};
        const rng0=trialRng(env.seed,0), v=new Float64Array(nS), tm=new Float64Array(nS), sp0=[]; { const s={v:pr.EL,refr:0};
          for(let k=0;k<nS;k++){ const fired=ML.lifStep(s, p.I + p.sigma*gaussian(rng0), pr, dt); v[k]=fired?4:s.v; tm[k]=k*dt; if(fired) sp0.push(k*dt); } }
        const reps=Math.round(p.reps), raster=[]; let totSp=0;
        for(let r=0;r<reps;r++){ const rng=trialRng(env.seed,r+1), s={v:pr.EL,refr:0}, row=[];
          for(let k=0;k<nS;k++){ if(ML.lifStep(s, p.I + p.sigma*gaussian(rng), pr, dt)) row.push(k*dt); } raster.push(row); totSp+=row.length; }
        const fI=[]; for(let i=0;i<=24;i++){ const I=i*0.8/24, s={v:pr.EL,refr:0}; let n=0; for(let k=0;k<nS;k++) if(ML.lifStep(s,I,pr,dt)) n++; fI.push([I, n/T]); }
        return { dt, T, nS, v, tm, sp0, raster, reps, rate:totSp/(reps*T), fI, I:p.I, pr, vmin:pr.Vreset-3 };
      },
      lenses:{
        trace:{ label:'V(t) trace', about:'one trial: the membrane integrates current and fires when it reaches threshold',
          anim:{ length:(p,d)=>d.nS },
          views:[ { title:'membrane potential V(t)', draw:(g,d,ui)=>{ const T=TH(), k=Math.min(d.nS-1,Math.floor(ui.head));
            g.frame({x:[0,d.T], y:[d.vmin,6], xlabel:'time (s)', ylabel:'V (mV)', title:'integrate → spike → reset'});
            g.hline(d.pr.Vth,{color:T.warn,dash:[5,4],label:'threshold'}); g.hline(d.pr.EL,{color:'rgba(80,75,65,.25)',dash:[2,3],label:'rest'});
            const pts=[]; for(let i=0;i<=k;i++) pts.push([d.tm[i],d.v[i]]); g.line(pts,{color:T.accent,width:1.7});
          }} ] },
        raster:{ label:'Raster', about:'many repeats → spike raster + the mean firing rate',
          anim:{ length:(p,d)=>d.reps },
          views:[ { title:'spike raster over repeats', draw:(g,d,ui)=>{ const T=TH(), k=Math.min(d.reps,Math.floor(ui.head));
            g.frame({x:[0,d.T], y:[0,d.reps], xlabel:'time (s)', ylabel:'repeat #', title:`raster — mean rate ${d.rate.toFixed(1)} Hz`});
            g.raster(d.raster.slice(0,k),{color:T.ink,width:1.2});
          }} ] },
        fI:{ label:'f–I curve', about:'firing rate vs input current — the neuron’s transfer function',
          views:[ { title:'f–I transfer curve', draw:(g,d)=>{ const T=TH(), ymax=Math.max(10,...d.fI.map(q=>q[1]))*1.12;
            g.frame({x:[0,0.8], y:[0,ymax], xlabel:'input current I (nA)', ylabel:'firing rate (Hz)', title:'rate rises with current (rheobase, then ~linear)'});
            g.line(d.fI,{color:T.accent,width:2}); g.points(d.fI,{color:T.accent,r:2.4}); g.vline(d.I,{color:T.pos,dash:[5,4],label:'current I'});
          }} ] },
      },
    },

    /* ---- learning: Rescorla–Wagner value updating (composed from MSLIB.rl) ---- */
    rl: {
      id:'rl', name:'Reinforcement learning (RW)',
      blurb:'A Rescorla–Wagner learner: a cue predicts value V; a reward arrives (prob p); the prediction error δ = r − V nudges V by α·δ. Use the lens switch for the angles: one update decomposed, the learning curve, and how the learning rate α changes it.',
      note:'V ← V + α·(r − V). The prediction error δ = r − V is the teaching signal; α sets how fast V tracks the reward probability (its asymptote ≈ p). Small α = slow & stable; large α = fast & jittery. Composed from MSLIB.rl.',
      params:[
        {name:'alpha', label:'Learning rate α (condition)', min:0.01, max:0.9, step:0.01, default:0.2},
        {name:'pRew', label:'Reward probability', min:0, max:1, step:0.01, default:0.7},
        {name:'nTrials', label:'Trials', min:20, max:300, step:5, default:120, int:true},
      ],
      simulate:(p, env)=>{ const ML=global.MSLIB.rl, n=Math.round(p.nTrials), rng=trialRng(env.seed,0);
        const V=new Float64Array(n+1), r=new Int8Array(n), delta=new Float64Array(n);
        for(let t=0;t<n;t++){ r[t]=rng()<p.pRew?1:0; delta[t]=r[t]-V[t]; V[t+1]=ML.rescorlaWagner(V[t], r[t], p.alpha); }
        const alphas=[0.05,0.2,0.6], curves=alphas.map(a=>{ const vv=new Float64Array(n+1), rg=trialRng(env.seed,0); for(let t=0;t<n;t++){ const rr=rg()<p.pRew?1:0; vv[t+1]=ML.rescorlaWagner(vv[t],rr,a); } return {a, vv}; });
        return { n, V, r, delta, pRew:p.pRew, alpha:p.alpha, curves };
      },
      lenses:{
        update:{ label:'Update', about:'one trial: the prediction error δ = r − V nudges V by α·δ',
          anim:{ length:(p,d)=>d.n },
          views:[ { title:'one update: V′ = V + α·(r − V)', draw:(g,d,ui)=>{ const T=TH(), t=Math.min(d.n-1,Math.floor(ui.head)), V=d.V[t], r=d.r[t], dl=d.delta[t], Vn=d.V[t+1];
            g.frame({x:[-0.1,1.1], y:[-0.6,3.6], yticks:1, xlabel:'value / reward', title:`trial ${t+1}: reward ${r} → δ = ${dl.toFixed(2)}`});
            g.text(-0.1,3,'V',{color:T.dim,size:10}); g.marker(V,3,{color:T.ink,r:4.5,label:V.toFixed(2)});
            g.text(-0.1,2,'reward r',{color:T.dim,size:10}); g.marker(r,2,{color:r?T.pos:T.neg,r:4.5,label:String(r)});
            g.text(-0.1,1,'+ α·δ',{color:T.dim,size:10}); g.arrow(V,1,Vn,1,{color:T.accent,label:`${dl>=0?'+':''}${(d.alpha*dl).toFixed(3)}`});
            g.text(-0.1,0,'V′',{color:T.dim,size:10}); g.marker(Vn,0,{color:T.ink,r:4.5,label:Vn.toFixed(2)});
          }} ] },
        learn:{ label:'Learning', about:'the value tracks the reward probability over trials',
          anim:{ length:(p,d)=>d.n },
          views:[ { title:'learning curve V(trial)', draw:(g,d,ui)=>{ const T=TH(), k=Math.min(d.n,Math.floor(ui.head));
            g.frame({x:[0,d.n], y:[0,1.05], xlabel:'trial', ylabel:'value V', title:`α=${d.alpha} → V approaches reward prob ${d.pRew}`});
            g.hline(d.pRew,{color:T.warn,dash:[5,4],label:'reward prob'});
            const pts=[]; for(let i=0;i<=k;i++) pts.push([i,d.V[i]]); g.line(pts,{color:T.accent,width:2});
          }} ] },
        rate:{ label:'Rate sweep', about:'how the learning rate α changes speed and stability',
          views:[ { title:'learning curves across α', draw:(g,d)=>{ const T=TH(), cols=['#86b0c4','#4a7a93','#c25b42'];
            g.frame({x:[0,d.n], y:[0,1.05], xlabel:'trial', ylabel:'value V', title:'small α = slow & smooth, large α = fast & jittery'});
            g.hline(d.pRew,{color:T.warn,dash:[5,4],label:'reward prob'});
            d.curves.forEach((c,i)=>{ const pts=[]; for(let t=0;t<=d.n;t++) pts.push([t,c.vv[t]]); g.line(pts,{color:cols[i],width:1.8}); });
            g.legend(d.curves.map((c,i)=>({label:'α='+c.a,color:cols[i]})),{corner:'br'});
          }} ] },
      },
    },

    /* ---- NETWORK-level exemplar: a 2-population attractor decision circuit (Wong–Wang reduced,
       MSLIB.decision). STRUCTURE FIRST (the wiring + E/I), then the network's angles:
       Structure (the circuit) - Step (one pool's recurrent input) - Dynamics (the pools race) - Landscape. */
    attractor: {
      id:'attractor', name:'Attractor network — decision',
      blurb:'A recurrent 2-population decision circuit (Wong & Wang reduced). Two pools excite themselves and inhibit each other; a small coherence bias plus noise tips the network into one of two attractors. Use the lens switch for the angles — structure first: Structure (the circuit wiring and E/I), Step (one pool’s recurrent input), Dynamics (the pools race to a winner), Landscape (the state-space the network rolls down).',
      note:'Each pool’s gating S obeys dS/dt = −S/τ_S + (1−S)·γ·φ(I), with input I = J_s·S_self − J_c·S_other + I₀ + stimulus + noise; self-excitation vs cross-inhibition is the competition. Strong cross-inhibition J_c destabilises the symmetric state, giving two stable attractors (winner-take-all); coherence biases which one wins. The Landscape lens maps the flow speed over (S₁,S₂): dark = slow = near a fixed point. Composed from MSLIB.decision.',
      params:[
        {name:'coh', label:'Coherence (condition, + favors pool 1)', min:-40, max:40, step:1, default:8, unit:'%'},
        {name:'Jc', label:'Cross-inhibition J_c', min:0, max:0.12, step:0.001, default:0.0497},
        {name:'sigma', label:'Noise σ', min:0, max:0.05, step:0.001, default:0.02},
      ],
      simulate:(p, env)=>{ const D=global.MSLIB.decision, WW=D.WW, phi=D.phi, dt=0.0005, T=1.0, nS=Math.round(T/dt), STORE=10, thr=15;
        const rng=makeRNG(env.seed+'#'+(p.coh|0)), g=()=>gaussian(rng);
        const s={S1:0.1,S2:0.1,In1:0,In2:0}, t=[], r1=[], r2=[], s1=[], s2=[]; let decT=-1, win=0;
        for(let k=0;k<=nS;k++){ const o=D.wwStep(s,{coh:p.coh,Jc:p.Jc,sigma:p.sigma},dt,g);
          if(k%STORE===0){ t.push(k*dt); r1.push(o.r1); r2.push(o.r2); s1.push(s.S1); s2.push(s.S2); }
          if(decT<0 && Math.max(o.r1,o.r2)>=thr){ decT=k*dt; win=o.r1>o.r2?1:2; } }
        const NG=40, stim1=WW.JAext*WW.mu0*(1+p.coh/100), stim2=WW.JAext*WW.mu0*(1-p.coh/100), flow=new Float64Array(NG*NG); let fmax=1e-9;
        const der=(Sa,Sb,stim)=>{ const I=WW.Js*Sa - p.Jc*Sb + WW.I0 + stim, r=phi(I,WW.a,WW.b,WW.d); return -Sa/WW.tauS + (1-Sa)*WW.gamma*r; };
        for(let i=0;i<NG;i++){ const S1=i/(NG-1); for(let j=0;j<NG;j++){ const S2=j/(NG-1);
          const sp=Math.hypot(der(S1,S2,stim1), der(S2,S1,stim2)); flow[j*NG+i]=sp; if(sp>fmax)fmax=sp; } }
        return { t, r1, r2, s1, s2, nF:t.length, decT, win, thr, flow, NG, fmax, coh:p.coh, Jc:p.Jc, WW, phi, stim1 };
      },
      lenses:{
        structure:{ label:'Structure', about:'the circuit wiring: two pools, self-excitation, mutual inhibition, and the stimulus drive',
          views:[ { title:'circuit structure — self-excitation vs mutual inhibition', draw:(g,d)=>{ const T=TH(), ctx=g.ctx, W=g.w, H=g.h, F=g.FS;
            const r=Math.min(W,H)*0.135, cy=H*0.46, x1=W*0.31, x2=W*0.69;
            ctx.textAlign='center'; ctx.fillStyle=T.ink; ctx.font=(13*F)+'px sans-serif';
            ctx.fillText('the circuit: two recurrent pools compete', W/2, 20*F);
            const pool=(cx,col,name)=>{ ctx.beginPath(); ctx.arc(cx,cy,r,0,7); ctx.globalAlpha=0.16; ctx.fillStyle=col; ctx.fill(); ctx.globalAlpha=1;
              ctx.lineWidth=2.4; ctx.strokeStyle=col; ctx.stroke();
              ctx.fillStyle=T.ink; ctx.font=(13*F)+'px sans-serif'; ctx.fillText(name,cx,cy+4*F); };
            pool(x1,T.pos,'Pool 1'); pool(x2,T.neg,'Pool 2');
            const selfLoop=(cx,col)=>{ ctx.strokeStyle=col; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(cx,cy-r-11*F,12*F,0.7,Math.PI*2-0.2); ctx.stroke();
              const a=0.7, ax=cx+12*F*Math.cos(a), ay=cy-r-11*F+12*F*Math.sin(a); ctx.fillStyle=col; ctx.beginPath(); ctx.arc(ax,ay,2.8*F,0,7); ctx.fill();
              ctx.fillStyle=T.dim; ctx.font=(11*F)+'px monospace'; ctx.fillText('+Js self-excite',cx,cy-r-30*F); };
            selfLoop(x1,T.pos); selfLoop(x2,T.neg);
            const yI=cy-10*F; ctx.strokeStyle=T.neg; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(x1+r+3*F,yI); ctx.lineTo(x2-r-3*F,yI); ctx.stroke();
            const tbar=x=>{ ctx.beginPath(); ctx.moveTo(x,yI-6*F); ctx.lineTo(x,yI+6*F); ctx.stroke(); }; tbar(x1+r+3*F); tbar(x2-r-3*F);
            ctx.fillStyle=T.neg; ctx.font=(11*F)+'px monospace'; ctx.fillText('−Jc mutual inhibition',(x1+x2)/2,yI-12*F);
            const inp=(cx,txt)=>{ ctx.strokeStyle=T.accent; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(cx,cy+r+36*F); ctx.lineTo(cx,cy+r+8*F); ctx.stroke();
              ctx.fillStyle=T.accent; ctx.beginPath(); ctx.moveTo(cx,cy+r+3*F); ctx.lineTo(cx-4.5*F,cy+r+12*F); ctx.lineTo(cx+4.5*F,cy+r+12*F); ctx.closePath(); ctx.fill();
              ctx.fillStyle=T.dim; ctx.font=(11*F)+'px monospace'; ctx.fillText(txt,cx,cy+r+50*F); };
            inp(x1,'stimulus +coh'); inp(x2,'stimulus −coh');
            ctx.fillStyle=T.dim; ctx.font=(11.5*F)+'px sans-serif';
            ctx.fillText('Strong cross-inhibition gives two attractors (winner-take-all); coherence biases which pool wins.', W/2, H-12*F);
          }} ] },
        step:{ label:'Step', about:'one pool’s recurrent input: self-excitation − cross-inhibition + drive → rate',
          anim:{ length:(p,d)=>d.nF },
          views:[ { title:'pool 1 input: I₁ = Js·S₁ − Jc·S₂ + drive', draw:(g,d,ui)=>{ const T=TH(), k=Math.min(d.nF-1,Math.floor(ui.head)), W=d.WW;
            const S1=d.s1[k], S2=d.s2[k], self=W.Js*S1, cross=-d.Jc*S2, drive=W.I0+d.stim1, I1=self+cross+drive, r1=d.phi(I1,W.a,W.b,W.d);
            const lo=Math.min(0,self+cross)-0.04, hi=Math.max(I1,self)+0.06;
            g.frame({x:[lo,hi], y:[-0.6,3.6], yticks:1, xlabel:'input current to pool 1', title:`step ${k+1}: self-excite vs cross-inhibit → r₁ = ${r1.toFixed(0)} Hz`});
            g.text(lo,3,'self +Js·S₁',{color:T.dim,size:10}); g.arrow(0,3,self,3,{color:T.pos,label:'+'+self.toFixed(3)});
            g.text(lo,2,'cross −Jc·S₂',{color:T.dim,size:10}); g.arrow(self,2,self+cross,2,{color:T.neg,label:cross.toFixed(3)});
            g.text(lo,1,'+ drive',{color:T.dim,size:10}); g.arrow(self+cross,1,I1,1,{color:T.accent,label:'+'+drive.toFixed(3)});
            g.text(lo,0,'= I₁',{color:T.dim,size:10}); g.marker(I1,0,{color:T.ink,r:4.5,label:I1.toFixed(3)});
          }} ] },
        dynamics:{ label:'Dynamics', about:'the two pools race; strong cross-inhibition makes one win',
          anim:{ length:(p,d)=>d.nF },
          views:[ { title:'pool rates r₁, r₂ over time', draw:(g,d,ui)=>{ const T=TH(), k=Math.min(d.nF-1,Math.floor(ui.head)), tE=d.t[d.nF-1]||1, ymax=Math.max(40, Math.max(...d.r1), Math.max(...d.r2))*1.1;
            g.frame({x:[0,tE], y:[0,ymax], xlabel:'time (s)', ylabel:'rate (Hz)', title:'winner-take-all: one pool rises, the other is suppressed'});
            g.hline(d.thr,{color:'#7a5a93',dash:[5,4],label:'decision threshold'});
            const p1=[],p2=[]; for(let i=0;i<=k;i++){ p1.push([d.t[i],d.r1[i]]); p2.push([d.t[i],d.r2[i]]); }
            g.line(p1,{color:T.pos,width:2.2}); g.line(p2,{color:T.neg,width:2.2});
            if(d.decT>=0 && d.t[k]>=d.decT) g.vline(d.decT,{color:T.ink,label:'decided, pool '+d.win});
            g.legend([{label:'pool 1',color:T.pos},{label:'pool 2',color:T.neg}],{corner:'tl'});
          }} ] },
        landscape:{ label:'Landscape', about:'the (S₁,S₂) state plane — dark = slow = where the network settles',
          views:[ { title:'state-space flow (dark = attractor) + this trajectory', draw:(g,d)=>{ const T=TH();
            const cmap=v=>{ const tt=Math.max(0,Math.min(1,v/(d.fmax||1))); return [Math.round(40+205*tt), Math.round(38+198*tt), Math.round(72+165*tt)]; };
            g.frame({cbar:true, x:[0,1], y:[0,1], xlabel:'S₁ (pool 1 gating)', ylabel:'S₂ (pool 2 gating)', title:'two basins = two choices; the path rolls into one'});
            g.heat(d.NG, d.NG, (i,j)=>d.flow[j*d.NG+i], cmap);
            g.line([[0,0],[1,1]],{color:'rgba(255,255,255,.35)',dash:[3,3]});
            const path=[]; for(let i=0;i<d.nF;i++) path.push([d.s1[i],d.s2[i]]); g.line(path,{color:'#fff',width:2});
            g.marker(d.s1[0],d.s2[0],{color:T.dim,stroke:'#fff',r:4}); g.marker(d.s1[d.nF-1],d.s2[d.nF-1],{color:d.win===1?T.pos:T.neg,stroke:'#fff',r:5,label:'pool '+d.win});
            g.colorbar(0,d.fmax,cmap,{label:'|dS/dt|'});
          }} ] },
      },
    },

    /* ---- MACRO-level exemplar: a spatial SIR epidemic on a 1-D line of sites (reaction–diffusion).
       A different scale entirely (no neurons, no trials) — angles fit a population/field model:
       Spread (space-time kymograph), Curve (well-mixed totals), Threshold (peak vs R0). */
    sir: {
      id:'sir', name:'Epidemic (spatial SIR)',
      blurb:'A population model at the MACRO scale: Susceptible, Infected, Recovered on a line of coupled sites. Infection spreads locally (diffusion) and recovers at rate γ. Use the lens switch for the angles: Spread (the epidemic as a space-time map), Curve (the classic S/I/R totals), Threshold (how the peak depends on R0). Move R0, γ, and spread.',
      note:'Per site: dS=−βS·Ĩ, dI=βS·Ĩ−γI, dR=γI, where Ĩ = I + D·(neighbours−I) couples sites (a discrete diffusion); β = R0·γ. Below the epidemic THRESHOLD R0=1 the outbreak fizzles; above it, a travelling wave sweeps the line (the Spread map) and the well-mixed curve shows the familiar infected peak. The Threshold lens traces peak prevalence vs R0 — flat then rising sharply past 1. Same harness, angles chosen for a field/population model.',
      params:[
        {name:'R0', label:'Basic reproduction number R₀ (condition)', min:0, max:4, step:0.05, default:2.5},
        {name:'gamma', label:'Recovery rate γ', min:0.05, max:0.5, step:0.01, default:0.12, unit:'/day'},
        {name:'D', label:'Spatial spread (diffusion)', min:0, max:0.5, step:0.01, default:0.18},
      ],
      simulate:(p, env)=>{ const N=60, dt=0.1, T=150, nS=Math.round(T/dt), STORE=8, beta=p.R0*p.gamma;
        let S=new Float64Array(N).fill(1), I=new Float64Array(N), R=new Float64Array(N);
        const c=(N/2)|0; S[c]-=0.02; I[c]=0.02;
        const kymo=[], times=[], totS=[], totI=[], totR=[]; let peakI=0, iMax=1e-6;
        for(let k=0;k<=nS;k++){ if(k%STORE===0){ kymo.push(Float64Array.from(I)); times.push(k*dt); let s=0,ii=0,r=0; for(let x=0;x<N;x++){ s+=S[x]; ii+=I[x]; r+=R[x]; if(I[x]>iMax)iMax=I[x]; } totS.push(s/N); totI.push(ii/N); totR.push(r/N); if(ii/N>peakI)peakI=ii/N; }
          const nS_=new Float64Array(N), nI=new Float64Array(N), nR=new Float64Array(N);
          for(let x=0;x<N;x++){ const xl=(x-1+N)%N, xr=(x+1)%N, Itil=I[x]+p.D*(I[xl]+I[xr]-2*I[x]), inf=Math.max(0,beta*S[x]*Itil), rec=p.gamma*I[x];
            nS_[x]=Math.max(0,S[x]-dt*inf); nI[x]=Math.max(0,I[x]+dt*(inf-rec)); nR[x]=R[x]+dt*rec; }
          S=nS_; I=nI; R=nR; }
        const sweep=[]; for(let i=0;i<=40;i++){ const R0=4*i/40, b=R0*p.gamma; let s=0.999,ii=0.001,pk=0; for(let k=0;k<2400;k++){ const inf=b*s*ii, rec=p.gamma*ii; s=Math.max(0,s-dt*inf); ii=Math.max(0,ii+dt*(inf-rec)); if(ii>pk)pk=ii; } sweep.push([R0,pk]); }
        return { N, kymo, times, totS, totI, totR, nF:times.length, peakI, iMax, sweep, R0:p.R0, gamma:p.gamma, T };
      },
      lenses:{
        spread:{ label:'Spread', about:'the epidemic as a space×time map — a travelling wave above threshold',
          views:[ { title:'infected fraction over space (x) and time', draw:(g,d)=>{ const T=TH();
            const cmap=v=>{ const t=Math.max(0,Math.min(1,v/(d.iMax||1))); return [Math.round(245-20*t), Math.round(245-205*t), Math.round(232-150*t)]; }; // cream→deep red
            g.frame({cbar:true, x:[0,d.N], y:[0,d.T], xlabel:'site (space)', ylabel:'time (days)', title:'where & when infection peaks (R₀='+d.R0.toFixed(2)+')'});
            g.heat(d.N, d.nF, (i,j)=> d.kymo[j][i], cmap, {smooth:false});
            g.colorbar(0, d.iMax, cmap, {ticks:[{v:0,label:'0'},{v:d.iMax,label:d.iMax.toFixed(2)}], label:'infected'}); }} ] },
        curve:{ label:'Curve', about:'the well-mixed S / I / R totals — the classic epidemic curve',
          views:[ { title:'population fractions S, I, R over time', draw:(g,d)=>{ const T=TH(), tE=d.times[d.nF-1]||1;
            g.frame({x:[0,tE], y:[0,1.02], xlabel:'time (days)', ylabel:'fraction of population', title:'peak infected = '+(d.peakI*100).toFixed(0)+'% (R₀='+d.R0.toFixed(2)+')'});
            const mk=a=>a.map((v,i)=>[d.times[i],v]); g.line(mk(d.totS),{color:T.accent,width:2}); g.line(mk(d.totI),{color:T.neg,width:2.4}); g.line(mk(d.totR),{color:T.pos,width:2});
            g.legend([{label:'S susceptible',color:T.accent},{label:'I infected',color:T.neg},{label:'R recovered',color:T.pos}],{corner:'tr'}); }} ] },
        threshold:{ label:'Threshold', about:'peak prevalence vs R₀ — flat below 1, rising sharply above',
          views:[ { title:'epidemic threshold: peak infected vs R₀', draw:(g,d)=>{ const T=TH(), ymax=Math.max(0.05,...d.sweep.map(q=>q[1]))*1.12;
            g.frame({x:[0,4], y:[0,ymax], xlabel:'basic reproduction number R₀', ylabel:'peak infected fraction', title:'no outbreak below R₀ = 1; epidemic above'});
            g.vline(1,{color:'#7a5a93',dash:[5,4],label:'threshold R₀=1'}); g.line(d.sweep,{color:T.warn,width:2.2});
            g.marker(d.R0, (function(){ let best=d.sweep[0]; for(const q of d.sweep) if(Math.abs(q[0]-d.R0)<Math.abs(best[0]-d.R0)) best=q; return best[1]; })(), {color:T.neg,stroke:'#fff',r:5,label:'now'}); }} ] },
      },
    },

    /* ---- NETWORK with PLASTICITY: a Hopfield associative memory (Hebbian). STRUCTURE FIRST —
       the weight matrix IS the stored memory. Angles: Structure (W), Store (the memories + the
       Hebbian rule), Recall (a noisy cue settles into an attractor), Capacity (load sweep). */
    hopfield: {
      id:'hopfield', name:'Hopfield memory (Hebbian)',
      blurb:'An associative memory: ±1 patterns are stored by Hebbian plasticity into a symmetric weight matrix W = Σ ξξᵀ; a noisy cue then settles, by repeated sign updates, into the nearest stored pattern (an attractor). Use the lens switch for the angles — structure first: Structure (the weight matrix), Store (the stored memories and the rule that wrote them), Recall (the cue settling in), Capacity (how recall fails as you store more).',
      note:'Plasticity writes the memories into the connectivity: W_ij = (1/P)Σ_p ξ_i^p ξ_j^p (zero diagonal). Recall runs async sign updates s_i ← sign(Σ_j W_ij s_j), which never increase the Lyapunov energy E = −½ Σ s_i W_ij s_j, so the state rolls downhill into a stored pattern. Capacity is finite: above ≈0.138·N stored patterns the memories interfere and recall breaks down. Raise the cue corruption or the load and watch recall fail. Composed from MSLIB.network.',
      params:[
        {name:'nStore', label:'Patterns stored (load)', min:1, max:12, step:1, default:3, int:true},
        {name:'cueFlip', label:'Cue corruption (fraction flipped)', min:0, max:0.5, step:0.01, default:0.18},
      ],
      simulate:(p, env)=>{ const NET=global.MSLIB.network, side=8, N=side*side, nStore=Math.max(1,Math.round(p.nStore));
        const rpat=(k)=>{ const r=makeRNG(env.seed+'#pat'+k), v=new Int8Array(N); for(let i=0;i<N;i++) v[i]= r()<0.5?-1:1; return v; };
        const shuffle=(rng)=>{ const a=Array.from({length:N},(_,i)=>i); for(let i=N-1;i>0;i--){ const j=Math.floor(rng()*(i+1)); const t=a[i]; a[i]=a[j]; a[j]=t; } return a; };
        const patterns=[]; for(let k=0;k<nStore;k++) patterns.push(rpat(k));
        const W=NET.hopfieldStore(patterns, N), target=patterns[0], nflip=Math.round(p.cueFlip*N);
        const rng=makeRNG(env.seed+'#cue'), cue=Int8Array.from(target); { const idx=shuffle(rng); for(let f=0;f<nflip;f++) cue[idx[f]]*=-1; }
        const states=[Array.from(cue)], energies=[NET.hopfieldEnergy(W,cue,N)], ovs=[NET.overlap(cue,target,N)];
        let s=Int8Array.from(cue); for(let sw=0;sw<8;sw++){ NET.hopfieldStep(W,s,N,shuffle(rng)); states.push(Array.from(s)); energies.push(NET.hopfieldEnergy(W,s,N)); ovs.push(NET.overlap(s,target,N));
          if(NET.overlap(states[states.length-1],states[states.length-2],N)>0.999) break; }
        const sweep=[]; for(let m=1;m<=20;m++){ const pats=[]; for(let k=0;k<m;k++) pats.push(rpat(k)); const Wm=NET.hopfieldStore(pats,N);
          let acc=0; const trials=Math.min(m,5); for(let t=0;t<trials;t++){ const tg=pats[t], st=Int8Array.from(tg), rr=makeRNG(env.seed+'#cap'+m+'_'+t), id2=shuffle(rr); for(let f=0;f<nflip;f++) st[id2[f]]*=-1;
            for(let sw=0;sw<6;sw++) NET.hopfieldStep(Wm,st,N,shuffle(rr)); if(Math.abs(NET.overlap(st,tg,N))>0.95) acc++; }
          sweep.push([m/N, acc/trials]); }
        let Wmax=1e-9; for(let t=0;t<W.length;t++) Wmax=Math.max(Wmax,Math.abs(W[t]));
        return { side, N, nStore, patterns, W, Wmax, target, cue:Array.from(cue), states, energies, ovs, nF:states.length, sweep, cap:0.138, load:nStore/N, finalOv:ovs[ovs.length-1] };
      },
      lenses:{
        structure:{ label:'Structure', about:'the symmetric weight matrix W = Σ ξξᵀ — the stored memories ARE the connectivity',
          views:[ { title:'weight matrix W (Hebbian): the memories live in the connections', draw:(g,d)=>{ const N=d.N;
            const cmapW=v=>{ const t=Math.max(-1,Math.min(1,v/(d.Wmax||1))); if(t>=0) return [Math.round(245-(245-194)*t),Math.round(243-(243-91)*t),Math.round(238-(238-66)*t)]; const u=-t; return [Math.round(245-(245-74)*u),Math.round(243-(243-122)*u),Math.round(238-(238-147)*u)]; };
            g.frame({cbar:true, x:[0,N], y:[0,N], xticks:1, yticks:1, xlabel:'unit j', ylabel:'unit i', title:`W = (1/P) Σ ξ ξᵀ over ${d.nStore} stored pattern(s) — symmetric, zero diagonal`});
            g.heat(N,N,(i,j)=>d.W[j*N+i], cmapW, {smooth:false});
            g.colorbar(-d.Wmax, d.Wmax, cmapW, {ticks:[{v:-d.Wmax,label:'−'},{v:0,label:'0'},{v:d.Wmax,label:'+'}], label:'weight'});
          }} ] },
        store:{ label:'Store', about:'the stored memories — Hebbian plasticity writes each pattern into W',
          views:[ { title:'stored memories (Hebbian plasticity wrote these into W)', draw:(g,d)=>{ const T=TH(), ctx=g.ctx, W=g.w, H=g.h, F=g.FS, side=d.side, K=d.nStore, show=Math.min(K,8);
            ctx.textAlign='center'; ctx.fillStyle=T.ink; ctx.font=(13*F)+'px sans-serif'; ctx.fillText(`${K} stored ±1 pattern(s) — each written into the weights by an outer product ξξᵀ`, W/2, 22*F);
            const pw=Math.min(96*F,(W-40*F)/show-8*F), gap=show>1?(W-40*F-show*pw)/(show-1):0, y0=46*F, x0=20*F;
            for(let k=0;k<show;k++){ const x=x0+k*(pw+gap), pat=d.patterns[k];
              g.image(side, side, (i,j)=>pat[j*side+i], v=> v>0?[51,49,44]:[235,232,224], {x, y:y0, w:pw, h:pw, smooth:false});
              ctx.strokeStyle=T.edge; ctx.lineWidth=1; ctx.strokeRect(x,y0,pw,pw); ctx.fillStyle=k===0?T.accent:T.dim; ctx.font=(11*F)+'px monospace'; ctx.textAlign='center';
              ctx.fillText('memory '+(k+1)+(k===0?' (cued)':''), x+pw/2, y0+pw+15*F); }
            ctx.fillStyle=T.faint; ctx.font=(11.5*F)+'px sans-serif'; ctx.fillText('More memories share the same weights, so they interfere — recall stays perfect only up to a capacity (see the Capacity lens).', W/2, y0+pw+44*F);
          }} ] },
        recall:{ label:'Recall', about:'a corrupted cue settles, by sign updates, into the nearest stored memory',
          anim:{ length:(p,d)=>d.nF-1 },
          views:[
            { title:'the state settling in (sweep by sweep)', draw:(g,d,ui)=>{ const T=TH(), k=Math.min(d.nF-1,Math.floor(ui.head)), side=d.side, st=d.states[k];
              g.frame({x:[0,side], y:[0,side], xticks:1, yticks:1, title:`sweep ${k} of ${d.nF-1}: overlap with the target = ${(d.ovs[k]).toFixed(2)} (1 = recalled)`});
              g.image(side,side,(i,j)=>st[j*side+i], v=> v>0?[51,49,44]:[235,232,224], {smooth:false}); }},
            { title:'overlap rises to 1 and energy falls as it settles', draw:(g,d,ui)=>{ const T=TH(), k=Math.min(d.nF-1,Math.floor(ui.head)), emin=Math.min(...d.energies), emax=Math.max(...d.energies,emin+1);
              g.frame({x:[0,d.nF-1], y:[-1.05,1.05], xlabel:'async sweep', ylabel:'overlap with target', title:'overlap → 1 means the cue has been recalled as the stored memory'});
              g.hline(1,{color:T.faint,dash:[4,3]}); g.line(d.ovs.map((v,i)=>[i,v]),{color:T.pos,width:2.4}); g.points(d.ovs.map((v,i)=>[i,v]),{color:T.pos,r:3});
              g.line(d.energies.map((v,i)=>[i, -1+2*(v-emin)/(emax-emin)]),{color:T.warn,width:1.8,dash:[5,3]});
              g.vline(k,{color:T.ink,dash:[2,3]}); g.legend([{label:'overlap',color:T.pos},{label:'energy (scaled)',color:T.warn}],{corner:'br'}); }},
          ] },
        capacity:{ label:'Capacity', about:'recall accuracy vs memory load — the ≈0.14·N capacity cliff',
          views:[ { title:'recall accuracy vs load (capacity ≈ 0.14·N)', draw:(g,d)=>{ const T=TH();
            g.frame({x:[0, d.sweep[d.sweep.length-1][0]*1.02], y:[0,1.05], xlabel:'memory load (patterns / N)', ylabel:'recall accuracy', title:'reliable recall up to ≈ 0.14·N, then it breaks down'});
            g.hline(1,{color:T.faint,dash:[4,3]}); g.vline(d.cap,{color:'#7a5a93',dash:[5,4],label:'≈0.14·N'}); g.line(d.sweep,{color:T.accent,width:2.4}); g.points(d.sweep,{color:T.accent,r:3});
            g.marker(d.load, (function(){ let b=d.sweep[0]; for(const q of d.sweep) if(Math.abs(q[0]-d.load)<Math.abs(b[0]-d.load)) b=q; return b[1]; })(), {color:T.neg,stroke:'#fff',r:5,label:'now'}); }} ] },
      },
    },

    /* ---- OSCILLATION: Kuramoto coupled phase oscillators. STRUCTURE FIRST — the natural-frequency
       spread + all-to-all coupling. Angles: Structure, Dynamics (phases on a circle), Sync (r vs K). */
    kuramoto: {
      id:'kuramoto', name:'Kuramoto oscillators (sync)',
      blurb:'N phase oscillators, each with its own natural frequency, all-to-all coupled with strength K. Below a critical coupling they drift incoherently; above it they spontaneously synchronise. Use the lens switch for the angles — structure first: Structure (the frequency spread and the coupling), Dynamics (the phases racing around a circle), Sync (the order parameter r as a function of K — the synchronization transition).',
      note:'Mean-field Kuramoto: dθ_i/dt = ω_i + K·r·sin(ψ − θ_i), where the order parameter r·e^{iψ} = (1/N)Σ e^{iθ_j} measures global synchrony (r=0 incoherent, r=1 locked). Synchrony emerges above a critical coupling K_c ≈ 2/(π·g(0)) set by the spread of natural frequencies g (for a Gaussian spread σ, K_c ≈ 1.6σ). Raise K past K_c, or narrow the frequency spread, and r jumps up. Composed from MSLIB.osc.',
      params:[
        {name:'K', label:'Coupling K', min:0, max:8, step:0.05, default:3, unit:''},
        {name:'spread', label:'Natural-frequency spread σ', min:0.2, max:3, step:0.05, default:1},
        {name:'noise', label:'Phase noise', min:0, max:1, step:0.01, default:0.1},
      ],
      simulate:(p, env)=>{ const O=global.MSLIB.osc, N=80, dt=0.02, T=20, nS=Math.round(T/dt), STORE=4;
        const rng=makeRNG(env.seed+'#kur'), omega=new Float64Array(N); for(let i=0;i<N;i++) omega[i]=p.spread*gaussian(rng);
        let ph=new Float64Array(N); for(let i=0;i<N;i++) ph[i]=(rng()*2-1)*Math.PI;
        const snaps=[], rt=[], times=[];
        for(let k=0;k<=nS;k++){ if(k%STORE===0){ snaps.push(Array.from(ph)); rt.push(O.kuramotoOrder(ph).r); times.push(k*dt); }
          ph=O.kuramotoStep(ph, omega, p.K, dt, p.noise, ()=>gaussian(rng)); }
        const sweep=[]; for(let kk=0;kk<=24;kk++){ const Kc=kk*(8/24); let p2=new Float64Array(N); const rr=makeRNG(env.seed+'#sw'+kk); for(let i=0;i<N;i++) p2[i]=(rr()*2-1)*Math.PI;
          for(let s=0;s<350;s++) p2=O.kuramotoStep(p2, omega, Kc, dt, p.noise, ()=>gaussian(rr));
          let racc=0,cnt=0; for(let s=0;s<120;s++){ p2=O.kuramotoStep(p2, omega, Kc, dt, p.noise, ()=>gaussian(rr)); racc+=O.kuramotoOrder(p2).r; cnt++; } sweep.push([Kc, racc/cnt]); }
        const Kc=p.spread*Math.sqrt(8/Math.PI), omLim=Math.max(0.5,...omega.map(Math.abs))*1.1;
        return { N, omega:Array.from(omega), omLim, snaps, rt, times, nF:snaps.length, sweep, K:p.K, Kc, spread:p.spread, rFinal:rt[rt.length-1] };
      },
      lenses:{
        structure:{ label:'Structure', about:'the natural-frequency spread and the all-to-all coupling that must overcome it',
          views:[ { title:'natural frequencies ω (the heterogeneity coupling must overcome)', draw:(g,d)=>{ const T=TH();
            const h=Plot.histify(d.omega, 19, -d.omLim, d.omLim), ymax=Math.max(...h.counts,1)*1.2;
            g.frame({x:[-d.omLim,d.omLim], y:[0,ymax], xlabel:'natural frequency ω_i', ylabel:'# oscillators', title:`${d.N} oscillators, all-to-all coupling K=${d.K.toFixed(2)} (critical K_c ≈ ${d.Kc.toFixed(2)})`});
            g.bars(h,{color:T.accent}); g.vline(0,{color:T.faint,dash:[4,3]});
            g.text(0, ymax*0.92, 'wider spread → larger K_c (harder to synchronise)', {color:T.dim, size:10.5, align:'center'});
          }} ] },
        dynamics:{ label:'Dynamics', about:'the phases racing around a circle; the arrow is the synchrony r',
          anim:{ length:(p,d)=>d.nF-1 },
          views:[
            { title:'phases on the unit circle (arrow length = synchrony r)', draw:(g,d,ui)=>{ const T=TH(), ctx=g.ctx, W=g.w, H=g.h, F=g.FS, k=Math.min(d.nF-1,Math.floor(ui.head)), ph=d.snaps[k];
              const cx=W/2, cy=H/2+8*F, R=Math.min(W,H)*0.34;
              ctx.textAlign='center'; ctx.fillStyle=T.ink; ctx.font=(13*F)+'px sans-serif'; ctx.fillText(`t = ${d.times[k].toFixed(1)} s — bunched = synchronised, spread = incoherent`, W/2, 20*F);
              ctx.strokeStyle=T.faint; ctx.lineWidth=1.2; ctx.beginPath(); ctx.arc(cx,cy,R,0,7); ctx.stroke();
              ctx.fillStyle=T.accent; for(const t of ph){ ctx.beginPath(); ctx.arc(cx+R*Math.cos(t), cy-R*Math.sin(t), 3*F, 0, 7); ctx.fill(); }
              let C=0,S=0; for(const t of ph){ C+=Math.cos(t); S+=Math.sin(t); } const r=Math.hypot(C,S)/ph.length, psi=Math.atan2(S,C);
              ctx.strokeStyle=T.neg; ctx.fillStyle=T.neg; ctx.lineWidth=3; ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(cx+R*r*Math.cos(psi), cy-R*r*Math.sin(psi)); ctx.stroke();
              ctx.font=(12*F)+'px monospace'; ctx.fillText('r = '+r.toFixed(2), cx, cy+R+24*F); }},
            { title:'synchrony r(t) building up', draw:(g,d,ui)=>{ const T=TH(), k=Math.min(d.nF-1,Math.floor(ui.head)), tE=d.times[d.nF-1]||1;
              g.frame({x:[0,tE], y:[0,1.05], xlabel:'time (s)', ylabel:'order parameter r', title:'r settles high if K exceeds K_c, stays near 0 if not'});
              g.hline(1,{color:T.faint,dash:[4,3]}); g.line(d.rt.map((v,i)=>[d.times[i],v]),{color:T.pos,width:2.4}); g.vline(d.times[k],{color:T.ink,dash:[2,3]}); }},
          ] },
        sync:{ label:'Sync', about:'the synchronization transition — steady-state r as a function of coupling K',
          views:[ { title:'synchronization transition: r vs coupling K', draw:(g,d)=>{ const T=TH();
            g.frame({x:[0,8], y:[0,1.05], xlabel:'coupling K', ylabel:'steady-state synchrony r', title:'incoherent (r≈0) below K_c, synchronised (r→1) above'});
            g.vline(d.Kc,{color:'#7a5a93',dash:[5,4],label:'K_c ≈ '+d.Kc.toFixed(2)}); g.line(d.sweep,{color:T.accent,width:2.4}); g.points(d.sweep,{color:T.accent,r:3});
            g.marker(d.K, (function(){ let b=d.sweep[0]; for(const q of d.sweep) if(Math.abs(q[0]-d.K)<Math.abs(b[0]-d.K)) b=q; return b[1]; })(), {color:T.neg,stroke:'#fff',r:5,label:'now'}); }} ] },
      },
    },

    /* ---- PARTIAL OBSERVABILITY: belief tracking with a discrete Bayes filter (HMM forward).
       A hidden location diffuses on a ring; each step gives a noisy reading; the filter keeps a
       BELIEF over where it is. STRUCTURE FIRST. Angles: Structure, Belief, Compare(noise). */
    belief: {
      id:'belief', name:'Belief tracking (Bayes filter)',
      blurb:'A hidden location moves on a ring and is never seen directly — each step gives only a noisy reading. A Bayes filter keeps a BELIEF (a probability distribution) over where it is: predict (diffuse the belief through the transition), then correct (multiply by the observation likelihood). Use the lens switch for the angles — structure first: Structure (the hidden states, the transition, the observation model), Belief (the belief distribution evolving as observations arrive), Compare (how observation noise blurs tracking).',
      note:'Discrete Bayes filter / HMM forward: predict b⁻(s′)=Σ_s T(s′|s) b(s), then update b(s′) ∝ P(obs|s′) b⁻(s′). The belief sharpens when observations are informative (low noise) and spreads when they are not, or when the state diffuses fast (high volatility). Tracking error and belief entropy both grow with observation noise. Honestly scoped as belief TRACKING (filtering), not full POMDP control. Composed from MSLIB.belief.',
      params:[
        {name:'obsNoise', label:'Observation noise σ', min:0.3, max:6, step:0.1, default:1.5},
        {name:'vol', label:'State volatility (diffusion)', min:0.4, max:4, step:0.1, default:1},
      ],
      simulate:(p, env)=>{ const BF=global.MSLIB.belief, S=24, Tn=40, rng=makeRNG(env.seed+'#bel');
        const wrap=i=>((i%S)+S)%S, ringD=(a,b)=>{ const d=Math.abs(a-b); return Math.min(d,S-d); }, volK=Math.max(0.4,p.vol);
        const T=[]; for(let i=0;i<S;i++){ const row=new Float64Array(S); let z=0; for(let j=0;j<S;j++){ const dd=ringD(i,j), w=Math.exp(-0.5*(dd/volK)*(dd/volK)); row[j]=w; z+=w; } for(let j=0;j<S;j++) row[j]/=z; T.push(Array.from(row)); }
        const onS=Math.max(0.4,p.obsNoise);
        const cat=(pmf,u)=>{ let c=0; for(let j=0;j<S;j++){ c+=pmf[j]; if(u<c) return j; } return S-1; };   // categorical sample
        const obsPmf=(center,sd)=>{ const a=new Float64Array(S); let z=0; for(let j=0;j<S;j++){ const dd=ringD(j,center); a[j]=Math.exp(-0.5*(dd/sd)*(dd/sd)); z+=a[j]; } for(let j=0;j<S;j++) a[j]/=z; return a; };
        let x=Math.floor(S/2), b=new Float64Array(S).fill(1/S);
        const beliefs=[Array.from(b)], trueX=[x], obs=[null], entropy=[BF.entropy(b)];
        for(let t=0;t<Tn;t++){ x=cat(T[x], rng()); const y=cat(obsPmf(x,onS), rng());   // generate from the SAME discrete transition + observation model the filter assumes
          b=BF.predict(b, T); b=BF.update(b, Array.from(obsPmf(y,onS)));                 // likelihood P(obs=y|state j) ∝ obs pmf centred at y (symmetric)
          beliefs.push(Array.from(b)); trueX.push(x); obs.push(y); entropy.push(BF.entropy(b)); }
        const bmean=(bb)=>{ let cx=0,cy=0; for(let j=0;j<S;j++){ const a=2*Math.PI*j/S; cx+=bb[j]*Math.cos(a); cy+=bb[j]*Math.sin(a); } return wrap(Math.round(Math.atan2(cy,cx)/(2*Math.PI)*S)); };
        const sweep=[]; for(let n=0;n<=20;n++){ const on=Math.max(0.4,0.3+n*(6/20)); let bb=new Float64Array(S).fill(1/S), xx=Math.floor(S/2), rr=makeRNG(env.seed+'#bsw'+n), errAcc=0,cnt=0;
          for(let t=0;t<Tn;t++){ xx=cat(T[xx], rr()); const yy=cat(obsPmf(xx,on), rr()); bb=BF.predict(bb,T); bb=BF.update(bb, Array.from(obsPmf(yy,on)));
            if(t>Tn/2){ errAcc+=ringD(bmean(bb),xx); cnt++; } } sweep.push([on, errAcc/Math.max(1,cnt)]); }
        let bmax=1e-9; for(const bb of beliefs) for(const v of bb) if(v>bmax) bmax=v;
        return { S, Tn, beliefs, trueX, obs, entropy, nF:beliefs.length, T, sweep, obsNoise:onS, vol:volK, bmax, Huniform:Math.log(S) };
      },
      lenses:{
        structure:{ label:'Structure', about:'the model: a hidden state that diffuses (transition) and is seen only through noisy observations',
          views:[ { title:'the two ingredients: a transition kernel and an observation likelihood', draw:(g,d)=>{ const T=TH(), S=d.S, c=Math.floor(S/2);
            g.frame({x:[0,S], y:[0,1.05], xlabel:'state (a ring of locations)', ylabel:'probability (relative)', title:'predict with the transition, then correct with the observation likelihood'});
            const tr=d.T[c], trm=Math.max(...tr); g.band(tr.map((v,i)=>[i+0.5, v/trm]),{color:'rgba(74,122,147,.20)'}); g.line(tr.map((v,i)=>[i+0.5, v/trm]),{color:T.accent,width:2});
            const onS=d.obsNoise, ll=[]; for(let j=0;j<S;j++){ const dd=Math.min(Math.abs(j-c), S-Math.abs(j-c)); ll.push([j+0.5, Math.exp(-0.5*(dd/onS)*(dd/onS))]); } g.line(ll,{color:T.neg,width:2,dash:[5,3]});
            g.vline(c+0.5,{color:T.faint,dash:[3,3],label:'current / observed state'});
            g.legend([{label:'transition P(next|state)',color:T.accent},{label:'observation P(obs|state)',color:T.neg}],{corner:'tr'});
          }} ] },
        belief:{ label:'Belief', about:'the belief distribution evolving as observations arrive',
          anim:{ length:(p,d)=>d.nF-1 },
          views:[
            { title:'belief over states across time (brighter = more probable)', draw:(g,d,ui)=>{ const T=TH(), S=d.S, k=Math.min(d.nF-1,Math.floor(ui.head));
              const cmap=v=>{ const t=Math.max(0,Math.min(1,v/(d.bmax||1))); return [Math.round(247-(247-74)*t), Math.round(245-(245-122)*t), Math.round(240-(240-147)*t)]; };
              g.frame({cbar:true, x:[0,S], y:[0,d.Tn], xlabel:'state (location)', ylabel:'time step', title:'the belief trajectory; the line is the true hidden state'});
              g.heat(S, d.nF, (i,j)=>d.beliefs[j][i], cmap, {smooth:false});
              const path=[]; for(let t=0;t<d.trueX.length;t++){ if(t>0 && Math.abs(d.trueX[t]-d.trueX[t-1])>S/2) path.push([NaN,NaN]); path.push([d.trueX[t]+0.5, t]); } g.line(path,{color:'rgba(255,255,255,.9)',width:1.8});
              g.hline(k,{color:T.ink,dash:[2,3],label:'now'}); g.colorbar(0,d.bmax,cmap,{label:'belief'});
            }},
            { title:'belief at this step: where the filter thinks it is', draw:(g,d,ui)=>{ const T=TH(), S=d.S, k=Math.min(d.nF-1,Math.floor(ui.head)), bb=d.beliefs[k], bm=Math.max(...bb)*1.18;
              g.frame({x:[0,S], y:[0,bm], xlabel:'state (location)', ylabel:'belief probability', title:`step ${k}: belief (bars) vs the true state and the noisy observation`});
              g.band(bb.map((v,i)=>[i+0.5,v]),{color:'rgba(74,122,147,.18)'}); g.line(bb.map((v,i)=>[i+0.5,v]),{color:T.accent,width:2}); g.points(bb.map((v,i)=>[i+0.5,v]),{color:T.accent,r:2.4});
              g.vline(d.trueX[k]+0.5,{color:T.pos,width:2,label:'true state'}); if(d.obs[k]!=null) g.marker(d.obs[k]+0.5, bm*0.06, {color:T.neg,r:5,label:'observation'});
              g.legend([{label:'belief',color:T.accent},{label:'true',color:T.pos},{label:'obs',color:T.neg}],{corner:'tr'});
            }},
          ] },
        compare:{ label:'Compare', about:'how observation noise blurs tracking — error vs noise',
          views:[ { title:'tracking error grows with observation noise', draw:(g,d)=>{ const T=TH(), ymax=Math.max(0.5,...d.sweep.map(q=>q[1]))*1.12;
            g.frame({x:[d.sweep[0][0], d.sweep[d.sweep.length-1][0]], y:[0,ymax], xlabel:'observation noise σ', ylabel:'tracking error (states)', title:'noisier observations → blurrier belief → larger tracking error'});
            g.line(d.sweep,{color:T.warn,width:2.4}); g.points(d.sweep,{color:T.warn,r:3});
            g.marker(d.obsNoise, (function(){ let b=d.sweep[0]; for(const q of d.sweep) if(Math.abs(q[0]-d.obsNoise)<Math.abs(b[0]-d.obsNoise)) b=q; return b[1]; })(), {color:T.neg,stroke:'#fff',r:5,label:'now'}); }} ] },
      },
    },

    /* ---- NETWORK with CONTINUOUS REPRESENTATION: a ring attractor (Mexican-hat connectivity).
       STRUCTURE FIRST. A localized activity bump codes a continuous variable and PERSISTS after the
       cue is gone (working memory). Angles: Structure, Dynamics, Representation, Compare (E/I). */
    ring: {
      id:'ring', name:'Ring attractor (working memory)',
      blurb:'A ring of units with Mexican-hat connectivity (local excitation, broad inhibition). A brief cue starts a localized activity bump that the recurrence sustains — and the bump PERSISTS after the cue is gone, holding the remembered location (a working-memory mechanism). The population-vector peak decodes the held value. Use the lens switch for the angles — structure first: Structure (the connectivity), Dynamics (the bump), Representation (the decoded heading over time), Compare (how the E/I balance sets the bump).',
      note:'Each unit i prefers a location θ_i on a ring; W_ij = J_E·exp(−d²/2σ²) − J_I (d = circular distance) excites neighbours and inhibits the rest. Rates follow τ dr/dt = −r + logistic(gain·(Wr + input − bias)). A cue seeds a bump; recurrence holds it after the cue ends (persistent activity), and the population vector reads out the remembered location. Strong inhibition sharpens the bump; too little floods the ring, too much kills it. Composed from MSLIB.network.',
      params:[
        {name:'cue', label:'Cue location (condition)', min:0, max:359, step:1, default:107, unit:'°'},
        {name:'JI', label:'Inhibition J_I (E/I balance)', min:0.4, max:2.5, step:0.05, default:1.3},
        {name:'noise', label:'Neural noise', min:0, max:0.15, step:0.005, default:0.02},
      ],
      simulate:(p, env)=>{ const NET=global.MSLIB.network, N=64, JE=8, sigma=0.3, gain=7, bias=1.7, dt=0.001, tau=0.01;
        const W=NET.ringKernel(N, JE, p.JI, sigma), rng=makeRNG(env.seed+'#ring'), g=()=>gaussian(rng);
        const cueIdx=Math.round(p.cue/360*N)%N, Iext=new Float64Array(N); for(let i=0;i<N;i++){ const dd=Math.min(Math.abs(i-cueIdx),N-Math.abs(i-cueIdx))/N*2*Math.PI; Iext[i]=Math.exp(-dd*dd/(2*0.35*0.35)); }
        let r=new Float64Array(N).fill(0.05); const driveSteps=200, holdSteps=500, STORE=10, snaps=[], dec=[], conf=[], times=[];
        for(let t=0;t<=driveSteps+holdSteps;t++){ if(t%STORE===0){ snaps.push(Array.from(r)); const pv=NET.popVector(r,N); dec.push(pv.angle*180/Math.PI); conf.push(pv.length); times.push(t*dt); }
          r=NET.ringStep(r, W, t<driveSteps?Iext:null, dt, tau, gain, bias, p.noise, g); }
        const offFrame=Math.round(driveSteps/STORE), offTime=driveSteps*dt, prof=snaps[snaps.length-1];
        let amp=Math.max(...prof); const half=amp/2; let fwhm=0; for(const v of prof) if(v>half) fwhm++;
        const ang=Array.from({length:N},(_,i)=>i/N*360), c=Math.floor(N/2), kernelRow=[];
        for(let o=-N/2;o<=N/2;o++){ const j=((c+o)%N+N)%N; kernelRow.push([o/N*360, W[c*N+j]]); }
        const sweep=[]; for(let s=0;s<=20;s++){ const JIv=0.4+s*(2.5-0.4)/20, Ws=NET.ringKernel(N,JE,JIv,sigma), rg=makeRNG(env.seed+'#rsw'+s), gg=()=>gaussian(rg); let rr=new Float64Array(N).fill(0.05);
          for(let t=0;t<200;t++) rr=NET.ringStep(rr,Ws,Iext,dt,tau,gain,bias,0,gg); for(let t=0;t<200;t++) rr=NET.ringStep(rr,Ws,null,dt,tau,gain,bias,0,gg);
          const a=Math.max(...rr); let w=0; if(a>0.2){ const h=a/2; for(const v of rr) if(v>h) w++; } sweep.push([JIv, w/N]); }
        const widthNow=(amp<0.2?0:fwhm/N);
        return { N, snaps, dec, conf, times, ang, nF:snaps.length, offFrame, offTime, prof, amp, fwhm:fwhm/N, sweep, cue:p.cue, JI:p.JI, kernelRow, width:widthNow };
      },
      lenses:{
        structure:{ label:'Structure', about:'the Mexican-hat connectivity: each unit excites its neighbours and inhibits the rest',
          views:[ { title:'Mexican-hat connectivity (from one unit to the ring)', draw:(g,d)=>{ const T=TH(), ys=d.kernelRow.map(q=>q[1]), ymin=Math.min(...ys), ymax=Math.max(...ys);
            g.frame({x:[-180,180], y:[ymin-Math.abs(ymin)*0.15-0.05, ymax*1.18], xlabel:'relative location (°)', ylabel:'connection weight', title:'local excitation (+) and broad inhibition (−) → one bump is stable'});
            g.hline(0,{color:T.faint,dash:[4,3]}); g.band(d.kernelRow,{color:'rgba(74,122,147,.16)', base:0}); g.line(d.kernelRow,{color:T.accent,width:2.4});
            g.text(0, ymax*0.98, 'excite neighbours', {color:T.pos, size:10.5, align:'center'}); g.text(120, ymin*0.55, 'inhibit the rest', {color:T.neg, size:10.5, align:'center'});
          }} ] },
        dynamics:{ label:'Dynamics', about:'a cue seeds a localized bump; recurrence holds it after the cue ends',
          anim:{ length:(p,d)=>d.nF-1 },
          views:[
            { title:'activity bump over the ring (persists after the cue)', draw:(g,d,ui)=>{ const T=TH(), k=Math.min(d.nF-1,Math.floor(ui.head)), r=d.snaps[k], pts=d.ang.map((a,i)=>[a,r[i]]), on=k<=d.offFrame;
              g.frame({x:[0,360], y:[0,1.08], xlabel:'location on the ring (°)', ylabel:'unit activity', title:`t=${d.times[k].toFixed(2)}s — ${on?'cue ON: bump forming':'cue OFF: bump persisting (working memory)'}`});
              g.band(pts,{color:'rgba(74,122,147,.18)'}); g.line(pts,{color:T.accent,width:2.2});
              g.vline(d.cue,{color:T.dim,dash:[4,3],label:'cued'}); if(d.conf[k]>0.15) g.vline(((d.dec[k]%360)+360)%360,{color:T.pos,label:'decoded'}); }},
            { title:'the bump over time (a space-time kymograph)', draw:(g,d,ui)=>{ const T=TH(), k=Math.min(d.nF-1,Math.floor(ui.head)), N=d.N;
              const cmap=v=>{ const t=Math.max(0,Math.min(1,v)); return [Math.round(247-(247-74)*t), Math.round(245-(245-122)*t), Math.round(240-(240-147)*t)]; };
              g.frame({cbar:true, x:[0,360], y:[0, d.times[d.nF-1]||1], xlabel:'location (°)', ylabel:'time (s)', title:'a sustained stripe = a stable memory of the cued location'});
              g.heat(N, d.nF, (i,j)=>d.snaps[j][i], cmap, {smooth:false}); g.hline(d.offTime,{color:T.neg,dash:[4,3],label:'cue off'}); g.hline(d.times[k],{color:T.ink,dash:[2,3]}); g.colorbar(0,1,cmap,{label:'activity'}); }},
          ] },
        representation:{ label:'Representation', about:'the decoded heading over time — it tracks the cue, then holds it',
          anim:{ length:(p,d)=>d.nF-1 },
          views:[ { title:'decoded location (population vector) tracks then holds the cue', draw:(g,d,ui)=>{ const T=TH(), k=Math.min(d.nF-1,Math.floor(ui.head)), tE=d.times[d.nF-1]||1;
            g.frame({x:[0,tE], y:[0,360], yticks:4, xlabel:'time (s)', ylabel:'decoded location (°)', title:'the bump holds the remembered location after the cue is gone'});
            g.hline(d.cue,{color:T.dim,dash:[4,3],label:'true cue'}); g.vline(d.offTime,{color:T.neg,dash:[4,3],label:'cue off'});
            const pts=[]; for(let i=0;i<=k;i++){ if(d.conf[i]<=0.15 || (i>0 && Math.abs(d.dec[i]-d.dec[i-1])>180)) pts.push([NaN,NaN]); if(d.conf[i]>0.15) pts.push([d.times[i], ((d.dec[i]%360)+360)%360]); } g.line(pts,{color:T.pos,width:2.4});
            g.text(tE*0.5, 30, 'a flat line after “cue off” = the location is held in memory', {color:T.faint, size:10.5, align:'center'}); }} ] },
        compare:{ label:'Compare', about:'how the E/I balance sets the bump — width vs inhibition',
          views:[ { title:'bump width vs inhibition (the E/I balance)', draw:(g,d)=>{ const T=TH();
            g.frame({x:[0.4,2.5], y:[0,1.05], xlabel:'inhibition J_I', ylabel:'fraction of ring active', title:'too little inhibition floods the ring; more sharpens, then kills, the bump'});
            g.line(d.sweep,{color:T.accent,width:2.4}); g.points(d.sweep,{color:T.accent,r:3});
            g.marker(d.JI, (function(){ let b=d.sweep[0]; for(const q of d.sweep) if(Math.abs(q[0]-d.JI)<Math.abs(b[0]-d.JI)) b=q; return b[1]; })(), {color:T.neg,stroke:'#fff',r:5,label:'now'}); }} ] },
      },
    },

    /* ---- VISION / CNN, DEEP STACK: retina → V1. STRUCTURE (architecture) FIRST, then the image
       transformed layer by layer. Center-surround (bipolar/horizontal) → ganglion → V1 simple
       (oriented) → V1 complex (energy). Angles: Architecture, Layers, RF, Compare(surround). */
    retina: {
      id:'retina', name:'Retina → V1 (layered vision)',
      blurb:'A layered early-vision model on an image: photoreceptors → a center-surround stage (bipolar + horizontal cells, a difference-of-Gaussians receptive field) → ganglion edge signals → V1 simple cells (oriented Gabor) → V1 complex cells (orientation energy). Use the lens switch for the angles — architecture first: Architecture (the layer stack and its receptive fields), Layers (the image transformed stage by stage), RF (the receptive-field profiles and V1 tuning), Compare (how the horizontal-cell surround changes the output).',
      note:'The center-surround stage is a difference-of-Gaussians RF: an excitatory center minus an inhibitory surround supplied by horizontal cells. Being zero-mean, it suppresses uniform regions and enhances edges/contrast (lateral inhibition). V1 simple cells are oriented Gabors on that edge signal; complex cells pool the quadrature pair (even² + odd²) for phase-invariant orientation energy. Turn the surround up and flat regions vanish while edges sharpen. Composed from MSLIB.vision (DoG) + the oriented-filter helpers.',
      params:[
        {name:'ori', label:'Orientation θ (condition)', min:0, max:179, step:1, default:60, unit:'°'},
        {name:'sf', label:'Spatial frequency', min:1, max:7, step:0.1, default:3, unit:'cyc/img'},
        {name:'surround', label:'Horizontal-cell surround', min:0, max:1.4, step:0.02, default:0.9},
        {name:'contrast', label:'Contrast', min:0.1, max:1, step:0.01, default:0.8},
      ],
      simulate:(p, env)=>{ const V=global.MSLIB.vision, N=40, sigma=N/12, sC=N/22, sS=N/9;
        const img=visScene(N, p.ori, p.sf, p.contrast, 0.05, env.seed);
        const dk=V.dogKernel(sC, sS, p.surround), dog=conv2(img, N, dk);
        const ev=conv2(dog, N, gaborKernel(p.ori, p.sf, sigma, 0, N)), od=conv2(dog, N, gaborKernel(p.ori, p.sf, sigma, Math.PI/2, N));
        const simple=ev, complex=new Float64Array(N*N); for(let t=0;t<N*N;t++) complex[t]=ev[t]*ev[t]+od[t]*od[t];
        const lim=a=>{ let m=1e-6; for(const v of a) m=Math.max(m,Math.abs(v)); return m; };
        const K=12, oris=[], tuning=[]; for(let k=0;k<K;k++){ const o=k*180/K; oris.push(o); const e=conv2(dog,N,gaborKernel(o,p.sf,sigma,0,N)), d2=conv2(dog,N,gaborKernel(o,p.sf,sigma,Math.PI/2,N)); let s=0; for(let t=0;t<N*N;t++) s+=e[t]*e[t]+d2[t]*d2[t]; tuning.push([o, s/(N*N)]); }
        const prof=[]; for(let i=-dk.R;i<=dk.R;i++) prof.push([i, dk.k[dk.R*dk.sz+(i+dk.R)]]);   // DoG center-surround 1-D cross-section
        const sweep=[]; for(let s2=0;s2<=16;s2++){ const wS=s2/16*1.4, dg=conv2(img,N,V.dogKernel(sC,sS,wS)); let mean=0; for(const v of dg) mean+=v; mean/=dg.length; let varr=0; for(const v of dg) varr+=(v-mean)*(v-mean); sweep.push([wS, Math.sqrt(varr/dg.length)]); }
        const gk=gaborKernel(p.ori, p.sf, sigma, 0, N);
        return { N, img, dog, simple, complex, imgLim:lim(img), dogLim:lim(dog), simpleLim:lim(simple), complexMax:lim(complex), oris, tuning, tmax:Math.max(...tuning.map(q=>q[1]),1e-9), prof, dk, gk, sweep, surround:p.surround, ori:p.ori, dec:(function(){ let sx=0,sy=0; for(let k=0;k<K;k++){ const a=2*oris[k]*Math.PI/180; sx+=tuning[k][1]*Math.cos(a); sy+=tuning[k][1]*Math.sin(a); } let dd=Math.atan2(sy,sx)*90/Math.PI; return ((dd%180)+180)%180; })() };
      },
      lenses:{
        architecture:{ label:'Architecture', about:'the layer stack and its receptive fields, before the image',
          views:[ { title:'retina → V1 architecture (each stage has a receptive field)', draw:(g,d)=>{ const T=TH(), ctx=g.ctx, W=g.w, H=g.h, F=g.FS;
            ctx.textAlign='center'; ctx.fillStyle=T.ink; ctx.font=(13*F)+'px sans-serif'; ctx.fillText('a feedforward stack: each layer re-represents the image through its receptive field', W/2, 20*F);
            const stages=['Image / receptors','Center-surround\n(bipolar + horizontal)','Ganglion\n(edges)','V1 simple\n(oriented)','V1 complex\n(energy)'], n=stages.length;
            const bw=Math.min(176*F,(W-40*F)/n-10*F), gap=(W-40*F-n*bw)/Math.max(1,n-1), y0=58*F, bh=58*F, x0=20*F, cy=y0+bh/2;
            for(let i=0;i<n;i++){ const x=x0+i*(bw+gap); ctx.fillStyle=i===1?'#eef3f5':'#ffffff'; ctx.strokeStyle=i===1?T.warn:T.accent; ctx.lineWidth=1.8;
              const rr=8*F; ctx.beginPath(); ctx.moveTo(x+rr,y0); ctx.arcTo(x+bw,y0,x+bw,y0+bh,rr); ctx.arcTo(x+bw,y0+bh,x,y0+bh,rr); ctx.arcTo(x,y0+bh,x,y0,rr); ctx.arcTo(x,y0,x+bw,y0,rr); ctx.closePath(); ctx.fill(); ctx.stroke();
              ctx.fillStyle=T.ink; ctx.font=(11.5*F)+'px sans-serif'; const lines=stages[i].split('\n'); lines.forEach((ln,li)=>ctx.fillText(ln, x+bw/2, cy-4*F+li*13*F+(lines.length===1?4*F:0)));
              if(i<n-1){ const ax=x+bw, ay=cy; ctx.strokeStyle=T.dim; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(ax,ay); ctx.lineTo(ax+gap,ay); ctx.stroke(); ctx.fillStyle=T.dim; ctx.beginPath(); ctx.moveTo(ax+gap,ay); ctx.lineTo(ax+gap-5*F,ay-4*F); ctx.lineTo(ax+gap-5*F,ay+4*F); ctx.closePath(); ctx.fill(); } }
            // RF thumbnails under the center-surround and V1-simple stages
            const thumb=(stageIdx, ker, label)=>{ const x=x0+stageIdx*(bw+gap), pwh=Math.min(72*F,bw), tx=x+(bw-pwh)/2, ty=y0+bh+26*F, sz=ker.sz; let kl=1e-6; for(const v of ker.k) kl=Math.max(kl,Math.abs(v));
              g.image(sz, sz, (i,j)=>ker.k[j*sz+i], v=>VGRAY(v,kl), {x:tx, y:ty, w:pwh, h:pwh}); ctx.strokeStyle=T.edge; ctx.lineWidth=1; ctx.strokeRect(tx,ty,pwh,pwh); ctx.fillStyle=T.dim; ctx.font=(10.5*F)+'px monospace'; ctx.textAlign='center'; ctx.fillText(label, x+bw/2, ty+pwh+14*F); };
            thumb(1, d.dk, 'center-surround RF'); thumb(3, d.gk, 'oriented RF');
            ctx.fillStyle=T.faint; ctx.font=(11*F)+'px sans-serif'; ctx.textAlign='center'; ctx.fillText('Adjust the surround, orientation, and frequency, then watch the Layers and RF lenses change.', W/2, H-12*F);
          }} ] },
        layers:{ label:'Layers', about:'the input image transformed stage by stage down the stack',
          views:[
            { title:'1. input image', draw:(g,d)=>{ const N=d.N; g.frame({cbar:true, x:[0,N], y:[0,N], xticks:1, yticks:1, title:`input — grating at θ=${d.ori}°`}); g.heat(N,N,(i,j)=>d.img[j*N+i], v=>VGRAY(v,d.imgLim)); g.colorbar(-d.imgLim,d.imgLim,v=>VGRAY(v,d.imgLim),{ticks:[{v:-d.imgLim,label:'−'},{v:0,label:'0'},{v:d.imgLim,label:'+'}],label:'intensity'}); }},
            { title:'2. center-surround (bipolar + horizontal)', draw:(g,d)=>{ const N=d.N; g.frame({cbar:true, x:[0,N], y:[0,N], xticks:1, yticks:1, title:'edges enhanced, flat regions suppressed (lateral inhibition)'}); g.heat(N,N,(i,j)=>d.dog[j*N+i], v=>VGRAY(v,d.dogLim)); g.colorbar(-d.dogLim,d.dogLim,v=>VGRAY(v,d.dogLim),{ticks:[{v:-d.dogLim,label:'−'},{v:0,label:'0'},{v:d.dogLim,label:'+'}],label:'response'}); }},
            { title:'3. V1 simple cell (oriented)', draw:(g,d)=>{ const N=d.N; g.frame({cbar:true, x:[0,N], y:[0,N], xticks:1, yticks:1, title:`oriented Gabor response at θ=${d.ori}°`}); g.heat(N,N,(i,j)=>d.simple[j*N+i], v=>VGRAY(v,d.simpleLim)); g.colorbar(-d.simpleLim,d.simpleLim,v=>VGRAY(v,d.simpleLim),{ticks:[{v:-d.simpleLim,label:'−'},{v:0,label:'0'},{v:d.simpleLim,label:'+'}],label:'response'}); }},
            { title:'4. V1 complex cell (energy)', draw:(g,d)=>{ const N=d.N; g.frame({cbar:true, x:[0,N], y:[0,N], xticks:1, yticks:1, title:'phase-invariant orientation energy = even² + odd²'}); g.heat(N,N,(i,j)=>d.complex[j*N+i], v=>VHOT(v,d.complexMax)); g.colorbar(0,d.complexMax,v=>VHOT(v,d.complexMax),{label:'energy'}); }},
          ] },
        rf:{ label:'RF', about:'the receptive-field profiles — center-surround and V1 orientation tuning',
          views:[
            { title:'center-surround receptive field (difference of Gaussians)', draw:(g,d)=>{ const T=TH(), ys=d.prof.map(q=>q[1]), ymin=Math.min(...ys), ymax=Math.max(...ys);
              g.frame({x:[d.prof[0][0],d.prof[d.prof.length-1][0]], y:[ymin-Math.abs(ymin)*0.2-1e-3, ymax*1.2], xlabel:'distance from RF centre (pixels)', ylabel:'sensitivity', title:'excitatory centre, inhibitory surround (the horizontal-cell antagonism)'});
              g.hline(0,{color:T.faint,dash:[4,3]}); g.band(d.prof,{color:'rgba(74,122,147,.16)', base:0}); g.line(d.prof,{color:T.accent,width:2.4}); }},
            { title:'V1 orientation tuning (complex-cell energy)', draw:(g,d)=>{ const T=TH(); g.frame({x:[-10,180], y:[0,d.tmax*1.18], xlabel:'channel orientation (°)', ylabel:'pooled energy', title:`tuning peaks at the stimulus orientation (decoded ${d.dec.toFixed(0)}° vs ${d.ori}°)`});
              const tun=d.tuning.concat([[180, d.tuning[0][1]]]);   // axial: close the curve at 180°=0°
              g.line(tun,{color:T.accent,width:2}); g.points(d.tuning,{color:T.accent,r:3.5}); g.vline(d.ori,{color:T.pos,dash:[4,3],label:'stimulus θ'}); }},
          ] },
        compare:{ label:'Compare', about:'how the horizontal-cell surround changes the output',
          views:[ { title:'edge enhancement vs surround strength', draw:(g,d)=>{ const T=TH(), ymax=Math.max(...d.sweep.map(q=>q[1]))*1.15;
            g.frame({x:[0,1.4], y:[0,ymax], xlabel:'horizontal-cell surround strength', ylabel:'output contrast (RMS)', title:'a stronger surround removes flat regions and sharpens edges (band-pass)'});
            g.line(d.sweep,{color:T.accent,width:2.4}); g.points(d.sweep,{color:T.accent,r:3});
            g.marker(d.surround, (function(){ let b=d.sweep[0]; for(const q of d.sweep) if(Math.abs(q[0]-d.surround)<Math.abs(b[0]-d.surround)) b=q; return b[1]; })(), {color:T.neg,stroke:'#fff',r:5,label:'now'}); }} ] },
      },
    },

    /* ---- CAUSAL GRAPH (Pearl-style structural causal model). STRUCTURE FIRST — the DAG.
       A confounder U biases the OBSERVED X–Y association; an intervention do(X) cuts the backdoor and
       reveals the true causal effect. Angles: Structure (the graph), Observe, Intervene, Compare. */
    causalg: {
      id:'causalg', name:'Causal graph — intervention (do)',
      blurb:'A structural causal model (a linear-Gaussian DAG): a confounder U drives both the treatment X and the outcome Y, while X affects Y through a mediator M (X→M→Y). The OBSERVED X–Y association mixes the real causal path with the confounding backdoor X←U→Y; an INTERVENTION do(X) cuts that backdoor and reveals the true effect. Use the lens switch for the angles — structure first: Structure (the graph), Observe (the confounded association), Intervene (do(X) vs what you see), Compare (how confounding inflates the observed effect).',
      note:'Linear-Gaussian SCM: U=ε; X=w_UX·U+ε; M=w_XM·X+ε; Y=M+w_UY·U+ε. The causal effect of X on Y is w_XM (through M, with M→Y weight 1). Regressing Y on X (observational) also picks up the backdoor X←U→Y, so its slope overstates the effect. do(X=x) severs U→X, so U no longer covaries with X and the do-slope ≈ w_XM — the real effect. The gap between observed and do is exactly the confounding. This is Pearl-style causal modelling, distinct from the multisensory "causal inference" model. Composed inline.',
      params:[
        {name:'conf', label:'Confounding (U→X, U→Y)', min:0, max:1.5, step:0.05, default:0.9},
        {name:'causal', label:'Causal effect X→M', min:0, max:1.5, step:0.05, default:0.6},
        {name:'noise', label:'Noise σ', min:0.2, max:1, step:0.05, default:0.5},
      ],
      simulate:(p, env)=>{ const rng=makeRNG(env.seed+'#cg'), g=()=>gaussian(rng), n=400, wUX=p.conf, wUY=p.conf, wXM=p.causal, wMY=1, sig=p.noise;
        const fit=(pts)=>{ let mx=0,my=0; for(const[a,b]of pts){mx+=a;my+=b;} mx/=pts.length;my/=pts.length; let sxy=0,sxx=0; for(const[a,b]of pts){sxy+=(a-mx)*(b-my);sxx+=(a-mx)*(a-mx);} return {slope:sxx>1e-9?sxy/sxx:0, mx, my}; };
        const obs=[]; for(let i=0;i<n;i++){ const U=g(), X=wUX*U+sig*g(), M=wXM*X+sig*g(), Y=wMY*M+wUY*U+sig*g(); obs.push([X,Y]); }
        const doPts=[]; for(let i=0;i<n;i++){ const x=-3+6*rng(), U=g(), M=wXM*x+sig*g(), Y=wMY*M+wUY*U+sig*g(); doPts.push([x,Y]); }   // do(X=x): X is SET, U independent of X
        const fo=fit(obs), fd=fit(doPts), causal=wXM*wMY;
        const sweep=[]; for(let s=0;s<=20;s++){ const c=s*1.5/20, r2=makeRNG(env.seed+'#cgs'+s), gg=()=>gaussian(r2), buf=[];
          for(let i=0;i<300;i++){ const U=gg(), X=c*U+sig*gg(), M=wXM*X+sig*gg(), Y=wMY*M+c*U+sig*gg(); buf.push([X,Y]); } sweep.push([c, fit(buf).slope-causal]); }
        let xlo=0,xhi=0,ylo=0,yhi=0; for(const[a,b]of obs.concat(doPts)){ if(a<xlo)xlo=a; if(a>xhi)xhi=a; if(b<ylo)ylo=b; if(b>yhi)yhi=b; }
        return { obs, doPts, obsSlope:fo.slope, doSlope:fd.slope, obsMx:fo.mx, obsMy:fo.my, doMx:fd.mx, doMy:fd.my, causal, conf:p.conf, wXM, sweep, xlo, xhi, ylo, yhi };
      },
      lenses:{
        structure:{ label:'Structure', about:'the causal graph — a confounder U behind both X and Y',
          views:[ { title:'the causal graph: X→M→Y (causal) and X←U→Y (confound)', draw:(g,d)=>{ const T=TH(), ctx=g.ctx, W=g.w, H=g.h, F=g.FS;
            ctx.textAlign='center'; ctx.fillStyle=T.ink; ctx.font=(13*F)+'px sans-serif'; ctx.fillText('a structural causal model — the confounder U is the problem', W/2, 22*F);
            const nodes=[{x:0.5,y:0.24,label:'U',color:T.neg},{x:0.24,y:0.62,label:'X',color:T.accent},{x:0.5,y:0.62,label:'M'},{x:0.78,y:0.62,label:'Y',color:T.pos}];
            const edges=[{from:0,to:1,label:d.conf.toFixed(2),color:T.neg,dash:[5,4]},{from:0,to:3,label:d.conf.toFixed(2),color:T.neg,dash:[5,4]},{from:1,to:2,label:d.wXM.toFixed(2),color:T.accent},{from:2,to:3,label:'1.0',color:T.accent}];
            g.graph(nodes, edges, {r:18*F});
            ctx.fillStyle=T.neg; ctx.font=(11.5*F)+'px sans-serif'; ctx.textAlign='center'; ctx.fillText('U → X and U → Y is the backdoor (confounding, dashed)', W/2, H-30*F);
            ctx.fillStyle=T.accent; ctx.fillText('X → M → Y is the real causal path', W/2, H-14*F);
          }} ] },
        observe:{ label:'Observe', about:'the observed X–Y association — confounded by U',
          views:[ { title:'what you SEE: Y vs X (the observed association)', draw:(g,d)=>{ const T=TH();
            g.frame({x:[d.xlo,d.xhi], y:[d.ylo,d.yhi], xlabel:'treatment X', ylabel:'outcome Y', title:`observed slope = ${d.obsSlope.toFixed(2)} — mixes the causal effect with confounding`});
            g.points(d.obs,{color:'rgba(74,122,147,.45)',r:2.3});
            g.line([[d.xlo, d.obsMy+d.obsSlope*(d.xlo-d.obsMx)],[d.xhi, d.obsMy+d.obsSlope*(d.xhi-d.obsMx)]],{color:T.accent,width:2.6});
          }} ] },
        intervene:{ label:'Intervene', about:'do(X) cuts the backdoor — the true causal effect',
          views:[ { title:'what you would CHANGE: Y vs do(X)', draw:(g,d)=>{ const T=TH();
            g.frame({x:[d.xlo,d.xhi], y:[d.ylo,d.yhi], xlabel:'intervention do(X = x)', ylabel:'outcome Y', title:`do-slope = ${d.doSlope.toFixed(2)} ≈ the true causal effect ${d.causal.toFixed(2)}`});
            g.points(d.doPts,{color:'rgba(46,139,122,.45)',r:2.3});
            g.line([[d.xlo, d.obsMy+d.obsSlope*(d.xlo-d.obsMx)],[d.xhi, d.obsMy+d.obsSlope*(d.xhi-d.obsMx)]],{color:T.accent,width:2,dash:[5,4]});
            g.line([[d.xlo, d.doMy+d.doSlope*(d.xlo-d.doMx)],[d.xhi, d.doMy+d.doSlope*(d.xhi-d.doMx)]],{color:T.pos,width:2.6});
            g.legend([{label:'observed (confounded)',color:T.accent},{label:'do(X): causal',color:T.pos}],{corner:'tl'});
          }} ] },
        compare:{ label:'Compare', about:'how confounding inflates the observed effect',
          views:[ { title:'confounding inflates the observed effect (observed − causal)', draw:(g,d)=>{ const T=TH(), ymax=Math.max(0.1,...d.sweep.map(q=>q[1]))*1.15;
            g.frame({x:[0,1.5], y:[Math.min(0,...d.sweep.map(q=>q[1]))-0.05, ymax], xlabel:'confounding strength', ylabel:'observed slope − causal effect', title:'with no confounding the observed effect equals the causal effect; it inflates as U strengthens'});
            g.hline(0,{color:T.faint,dash:[4,3]}); g.line(d.sweep,{color:T.warn,width:2.4}); g.points(d.sweep,{color:T.warn,r:3});
            g.marker(d.conf, (function(){ let b=d.sweep[0]; for(const q of d.sweep) if(Math.abs(q[0]-d.conf)<Math.abs(b[0]-d.conf)) b=q; return b[1]; })(), {color:T.neg,stroke:'#fff',r:5,label:'now'}); }} ] },
      },
    },

    /* ---- TRANSFORMER self-attention: content-based routing as soft, learned connectivity.
       STRUCTURE FIRST — the attention matrix (who attends to whom). Angles: Structure, Mix, Compare(temp). */
    attention: {
      id:'attention', name:'Self-attention (transformer)',
      blurb:'A row of tokens, each with a type and a value. Self-attention lets every token attend to others by CONTENT (same type) and POSITION (nearby), via a softmax — then each token’s output is the attention-weighted mix of the others’ values. Attention is soft, content-based connectivity. Use the lens switch for the angles — structure first: Structure (the attention matrix — who attends to whom), Mix (how the values get routed and combined), Compare (how temperature sharpens or blurs attention).',
      note:'For query i and key j: score(i,j) = −contentW·(type_i−type_j)² − posBias·|i−j|; attention = softmax(score / temperature) over j; output_i = Σ_j attention(i,j)·value_j. Low temperature → sharp, near-hard attention (each token copies its best match); high temperature → uniform averaging. Same type and nearby position both raise attention. This is the core transformer mechanism (one head), framed as content-addressable routing. Composed from MSLIB.attn.',
      params:[
        {name:'temp', label:'Temperature (softmax)', min:0.1, max:3, step:0.05, default:0.6},
        {name:'posBias', label:'Positional locality', min:0, max:2, step:0.05, default:0.4},
        {name:'query', label:'Inspect query token (condition)', min:0, max:9, step:1, default:3, int:true},
      ],
      simulate:(p, env)=>{ const A=global.MSLIB.attn, N=10, rng=makeRNG(env.seed+'#attn'), contentW=1.2;
        const type=[], value=[]; for(let i=0;i<N;i++){ type.push(Math.floor(rng()*3)); value.push(Math.round((rng()*2-1)*100)/100); }
        const score=(i,j,temp)=>(-contentW*(type[i]-type[j])*(type[i]-type[j]) - p.posBias*Math.abs(i-j))/temp;
        const attn=[], out=[], ent=[]; for(let i=0;i<N;i++){ const row=A.softmax(Array.from({length:N},(_,j)=>score(i,j,p.temp))); attn.push(row);
          let o=0; for(let j=0;j<N;j++) o+=row[j]*value[j]; out.push(o); ent.push(A.entropy(row)/Math.log(N)); }
        const sweep=[]; for(let s=0;s<=20;s++){ const tp=0.1+s*(3-0.1)/20; let he=0; for(let i=0;i<N;i++){ const row=A.softmax(Array.from({length:N},(_,j)=>score(i,j,tp))); he+=A.entropy(row)/Math.log(N); } sweep.push([tp, he/N]); }
        const q=Math.max(0,Math.min(N-1,Math.round(p.query)));
        const TYPECOL=['#4a7a93','#c25b42','#2e8b7a'];
        return { N, type, value, attn, out, ent, sweep, q, qWeights:attn[q], temp:p.temp, meanEnt:ent.reduce((a,b)=>a+b,0)/N, TYPECOL };
      },
      lenses:{
        structure:{ label:'Structure', about:'the attention matrix — which token (row) attends to which (col)',
          views:[ { title:'attention matrix: query i (row) attends to key j (column)', draw:(g,d)=>{ const T=TH(), N=d.N, amax=Math.max(...d.attn.flat());
            g.frame({cbar:true, x:[0,N], y:[0,N], xticks:1, yticks:1, xlabel:'key token j', ylabel:'query token i', title:'bright blocks = tokens attend to others of the same type (and nearby)'});
            g.heat(N, N, (i,j)=>d.attn[N-1-j][i], v=>{ const t=Math.max(0,Math.min(1,v/amax)); return [Math.round(247-(247-74)*t),Math.round(245-(245-122)*t),Math.round(240-(240-147)*t)]; }, {smooth:false});
            g.colorbar(0, amax, v=>{ const t=Math.max(0,Math.min(1,v/amax)); return [Math.round(247-(247-74)*t),Math.round(245-(245-122)*t),Math.round(240-(240-147)*t)]; }, {label:'attention'});
          }} ] },
        mix:{ label:'Mix', about:'how one token’s output is the attention-weighted mix of the values',
          views:[
            { title:'the inspected token attends to these keys', draw:(g,d)=>{ const T=TH(), N=d.N, q=d.q;
              g.frame({x:[-0.5,N-0.5], y:[0, Math.max(...d.qWeights)*1.2], xticklabels:Array.from({length:N},(_,i)=>String(i)), xlabel:'key token (colour = type)', ylabel:'attention weight', title:`token ${q} (type ${d.type[q]}) attends mostly to same-type, nearby tokens`});
              const ctx=g.ctx; for(let j=0;j<N;j++){ const x0=g.X(j-0.34), x1=g.X(j+0.34), y0=g.Y(0), y1=g.Y(d.qWeights[j]); ctx.fillStyle=d.TYPECOL[d.type[j]]; ctx.globalAlpha=j===q?1:0.85; ctx.fillRect(x0, y1, x1-x0, y0-y1); ctx.globalAlpha=1; } }},
            { title:'values in → attention-mixed values out', draw:(g,d)=>{ const T=TH(), N=d.N, lo=Math.min(...d.value,...d.out), hi=Math.max(...d.value,...d.out);
              g.frame({x:[-0.5,N-0.5], y:[lo-0.1, hi+0.1], xlabel:'token position', ylabel:'value', title:'each output = the attention-weighted average of the input values'});
              g.points(d.value.map((v,i)=>[i,v]),{color:T.dim,r:4}); g.line(d.out.map((v,i)=>[i,v]),{color:T.accent,width:2}); g.points(d.out.map((v,i)=>[i,v]),{color:T.accent,r:3.5});
              g.legend([{label:'input values',color:T.dim},{label:'attention output',color:T.accent}],{corner:'tr'}); }},
          ] },
        compare:{ label:'Compare', about:'how temperature sharpens or blurs attention',
          views:[ { title:'attention sharpness vs temperature', draw:(g,d)=>{ const T=TH();
            g.frame({x:[0.1,3], y:[0,1.05], xlabel:'softmax temperature', ylabel:'attention entropy (0 = peaked, 1 = uniform)', title:'low temperature = sharp, near-hard attention; high = uniform averaging'});
            g.line(d.sweep,{color:T.accent,width:2.4}); g.points(d.sweep,{color:T.accent,r:3});
            g.marker(d.temp, (function(){ let b=d.sweep[0]; for(const q of d.sweep) if(Math.abs(q[0]-d.temp)<Math.abs(b[0]-d.temp)) b=q; return b[1]; })(), {color:T.neg,stroke:'#fff',r:5,label:'now'}); }} ] },
      },
    },
  };
  const MODEL_ORDER = ['bayes','efficient','causal','wm','ddm','compare','vision','lif','rl','attractor','sir','hopfield','kuramoto','belief','ring','retina','causalg','attention'];

  global.SIM = { makeRNG, gaussian, hashSeed, trialRng, npdf, ddmPath, ddmSteps, runChunks, MODELS, MODEL_ORDER };
})(typeof window !== 'undefined' ? window : globalThis);
