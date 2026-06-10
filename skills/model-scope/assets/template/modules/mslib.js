/* =============================================================================
 * mslib.js — model-scope reusable model library (OPTIONAL, classic script).
 *
 * Small, pure, composable building blocks distilled from canonical computational-
 * neuroscience models — NOT copied from any repo; minimal textbook forms you compose
 * inside a model's simulate(). Include only if you need them:
 *     <script src="modules/mslib.js"></script>   (before engine.js)
 * then use e.g. MSLIB.neuron.lifStep(...), MSLIB.bayes.gaussPosterior(...).
 *
 * Design: every function is pure, takes its randomness as a `g` argument, and is
 * FREE-STANDING — it never uses `this`, so you can destructure (`const { wwStep } =
 * MSLIB.decision`) freely. All times are in SECONDS. Add a family by attaching another
 * sub-object to MSLIB — nothing couples.
 *   RNG CONVENTION (check each call site): sde/bayes/efficient/neuron/decision expect a
 *   GAUSSIAN g = ()=>N(0,1) (e.g. ()=>SIM.gaussian(rng)); the wm samplers (vmSample,
 *   mixtureRecall) and causal's probability-matching expect a UNIFORM g = ()=>[0,1)
 *   (e.g. ()=>rng()). Passing the wrong one gives wrong-shaped draws, not an error.
 *
 * Sources (equations, not code): Wong & Wang 2006 (xjwanglab/wong-wang-2006); Gerstner
 * Neuronal Dynamics & Brian2 (brian-team/brian2) for LIF/Izhikevich; Acerbi lab
 * (acerbilab: pybads/pyvbmc/pyibs) for observer fitting; Green & Swets / Wichmann–Hill for
 * SDT & psychometrics. See references/modelbook/.
 * ========================================================================== */
(function (global) {
  'use strict';
  const exp = Math.exp, sqrt = Math.sqrt, PI = Math.PI, max = Math.max, abs = Math.abs;

  /* ---- sde: stochastic steppers (Euler–Maruyama) ---- */
  const wiener  = (x, drift, c, dt, g) => x + drift*dt + c*sqrt(dt)*g();           // dx = drift·dt + c·dW
  const ou      = (x, theta, mu, sigma, dt, g) => x + theta*(mu-x)*dt + sigma*sqrt(dt)*g(); // Ornstein–Uhlenbeck
  const normpdf = (x, mu, s) => { const z=(x-mu)/s; return exp(-0.5*z*z)/(s*sqrt(2*PI)); };
  const normcdf = (z) => { const t=1/(1+0.2316419*abs(z)), d=0.3989423*exp(-z*z/2),
    p=d*t*(0.3193815+t*(-0.3565638+t*(1.781478+t*(-1.821256+t*1.330274)))); return z>0 ? 1-p : p; };
  const sde = { wiener, ou, normpdf, normcdf };

  /* ---- bayes: Gaussian ideal/Bayesian observer ---- */
  const gaussPosterior = (m, sm, mu0, s0) => { const vm=sm*sm, v0=s0*s0, v=1/(1/vm+1/v0);
    return { mu:(m/vm+mu0/v0)*v, sigma:sqrt(v) }; };
  const weight = (sm, s0) => { const v0=s0*s0; return v0/(v0+sm*sm); };               // reliability of m; θ̂=w·m+(1−w)μ0
  const centralTendency = (thetaGrid, sm, mu0, s0) => { const w=weight(sm,s0);          // regression toward the prior
    return Array.from(thetaGrid, th => ({ theta:th, est:w*th+(1-w)*mu0, sd:w*sm })); };  // Array.from: thetaGrid may be a Float64Array (typed .map would coerce objects→NaN)
  const weberNoise = (theta, wf, floor=1e-3) => max(floor, wf*abs(theta));            // σ_m = wf·θ (magnitude/time)
  const bayesTrial = (theta, sm, mu0, s0, g) => { const m=theta+sm*g(), post=gaussPosterior(m,sm,mu0,s0); return { m, est:post.mu, post }; };
  // generic GRID pipeline (any prior/likelihood shape; the base for efficient-coding & self-consistency)
  const linspace = (lo, hi, n) => { const a=new Float64Array(n), s=(hi-lo)/((n-1)||1); for(let i=0;i<n;i++) a[i]=lo+i*s; return a; };
  const gridPost = (like, prior) => { const n=like.length, p=new Float64Array(n); let z=0;             // normalized discrete posterior ∝ like·prior
    for(let i=0;i<n;i++){ p[i]=max(0,like[i])*max(0,prior[i]); z+=p[i]; } if(z>0) for(let i=0;i<n;i++) p[i]/=z; return p; };
  const gridMean = (post, xs) => { let m=0; for(let i=0;i<post.length;i++) m+=post[i]*xs[i]; return m; };  // BLS / L2 estimate
  const gridMode = (post, xs) => { let b=0; for(let i=1;i<post.length;i++) if(post[i]>post[b]) b=i; return xs[b]; };  // MAP / L0 estimate
  const bayes = { gaussPosterior, weight, centralTendency, weberNoise, trial: bayesTrial, linspace, gridPost, gridMean, gridMode };

  /* ---- neuron: single-cell spiking (all times in SECONDS) ---- */
  const LIF_DEFAULT = { tau:0.02, EL:-65, R:100, Vth:-50, Vreset:-65, tref:0.003 };   // s, mV, MΩ
  const lifStep = (s, I, p, dt) => { p = p || LIF_DEFAULT;                            // returns true on spike; state {v,refr}
    if (s.refr > 0) { s.refr -= dt; s.v = p.Vreset; return false; }
    s.v += dt/p.tau*(-(s.v-p.EL) + p.R*I);
    if (s.v >= p.Vth) { s.v = p.Vreset; s.refr = p.tref; return true; } return false; };
  const IZH_DEFAULT = { a:0.02, b:0.2, c:-65, d:8 };                                  // regular spiking
  const izhStep = (s, I, p, dt) => { p = p || IZH_DEFAULT; const h = dt*1000;          // dt in s → ms internally (Izhikevich is ms-native)
    s.v += h*(0.04*s.v*s.v + 5*s.v + 140 - s.u + I);
    s.u += h*(p.a*(p.b*s.v - s.u));
    if (s.v >= 30) { s.v = p.c; s.u += p.d; return true; } return false; };
  const fI = (stepFn, init, Irange, dt, T) => Array.from(Irange, I => { const s=init(); let n=0; const steps=Math.round(T/dt);
    for (let k=0;k<steps;k++) if (stepFn(s,I,dt)) n++; return { I, rate:n/T }; });      // mean rate (Hz) — dt & T in seconds (Array.from so a typed Irange works)
  const neuron = { LIF_DEFAULT, lifStep, IZH_DEFAULT, izhStep, fI };

  /* ---- decision: Wong & Wang (2006) reduced two-variable circuit ---- */
  const WW = { a:270, b:108, d:0.154, gamma:0.641, tauS:0.100, tauN:0.002, sigma:0.02,
               Js:0.2609, Jc:0.0497, I0:0.3255, JAext:5.2e-4, mu0:30, coh:0 };          // Wong & Wang 2006
  const phi = (I, a, b, d) => { const x=a*I-b; return abs(x)<1e-9 ? 1/d : x/(1-exp(-d*x)); }; // f–I (Hz)
  const wwStep = (s, params, dt, g) => { const p = Object.assign({}, WW, params);       // state {S1,S2,In1,In2}; coh in % (+ favours unit 1)
    const stim1=p.JAext*p.mu0*(1+p.coh/100), stim2=p.JAext*p.mu0*(1-p.coh/100), sN=p.sigma*sqrt(2/p.tauN);
    s.In1 = ou(s.In1, 1/p.tauN, 0, sN, dt, g); s.In2 = ou(s.In2, 1/p.tauN, 0, sN, dt, g);
    const I1=p.Js*s.S1 - p.Jc*s.S2 + p.I0 + stim1 + s.In1, I2=p.Js*s.S2 - p.Jc*s.S1 + p.I0 + stim2 + s.In2;
    const r1=phi(I1,p.a,p.b,p.d), r2=phi(I2,p.a,p.b,p.d);
    s.S1 += dt*(-s.S1/p.tauS + (1-s.S1)*p.gamma*r1); s.S2 += dt*(-s.S2/p.tauS + (1-s.S2)*p.gamma*r2);
    return { r1, r2 }; };
  const decision = { WW, phi, wwStep };

  /* ---- rl: reinforcement-learning / belief-update rules ---- */
  const rescorlaWagner = (V, r, alpha) => V + alpha*(r - V);
  const qUpdate = (Q, a, r, alpha) => { Q[a] += alpha*(r - Q[a]); return Q; };
  const softmax = (vals, beta) => { const m=max(...vals), e=vals.map(v=>exp(beta*(v-m))), z=e.reduce((a,b)=>a+b,0); return e.map(x=>x/z); };
  const choose = (probs, g01) => { let u=g01(), c=0; for (let i=0;i<probs.length;i++){ c+=probs[i]; if (u<c) return i; } return probs.length-1; };
  const kalman = (b, obs, procVar, obsVar) => { const s2=b.sigma*b.sigma+procVar, K=s2/(s2+obsVar); return { mu:b.mu+K*(obs-b.mu), sigma:sqrt((1-K)*s2) }; };
  const rl = { rescorlaWagner, qUpdate, softmax, choose, kalman };

  /* ---- psy: psychophysics — psychometric function & signal-detection theory ---- */
  const zinv = (p) => { // inverse normal CDF (Acklam/Moro), adequate for SDT
    const a=[-3.969683028665376e+01,2.209460984245205e+02,-2.759285104469687e+02,1.383577518672690e+02,-3.066479806614716e+01,2.506628277459239e+00];
    const b=[-5.447609879822406e+01,1.615858368580409e+02,-1.556989798598866e+02,6.680131188771972e+01,-1.328068155288572e+01];
    const c=[-7.784894002430293e-03,-3.223964580411365e-01,-2.400758277161838e+00,-2.549732539343734e+00,4.374664141464968e+00,2.938163982698783e+00];
    const d=[7.784695709041462e-03,3.224671290700398e-01,2.445134137142996e+00,3.754408661907416e+00]; const pl=0.02425; let q,r;
    if (p<pl){ q=sqrt(-2*Math.log(p)); return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5])/((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1); }
    if (p<=1-pl){ q=p-0.5; r=q*q; return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q/(((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1); }
    q=sqrt(-2*Math.log(1-p)); return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5])/((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1); };
  const psychometric = (x, p) => { const k=p.kind||'normcdf', lo=p.gamma||0, la=p.lambda||0; let F;
    if (k==='logistic') F=1/(1+exp(-(x-p.mu)/p.sigma));
    else if (k==='weibull') F=1-exp(-Math.pow(max(0,x)/p.mu, p.beta||3));
    else F=normcdf((x-p.mu)/p.sigma);
    return lo + (1-lo-la)*F; };
  const sdt = (hr, far) => { const clip=x=>Math.min(1-1e-4,max(1e-4,x)), zH=zinv(clip(hr)), zF=zinv(clip(far)); return { dprime:zH-zF, criterion:-0.5*(zH+zF) }; };
  const psy = { psychometric, sdt };

  /* ---- efficient: efficient-coding-constrained Bayesian observer (Wei & Stocker 2015/2017)
         + decision-conditioned / self-consistent estimation (Luu & Stocker 2018). The prior
         RESHAPES sensory encoding: F(θ)=CDF(prior) warps stimulus→uniform sensory space where
         noise is homogeneous; decoding back gives repulsive ("anti-Bayesian") bias and the
         lawful bias↔discriminability relation. Grid-based; composes with bayes.gridPost/Mean. ---- */
  const ecCdf = (xs, prior) => { const n=xs.length, F=new Float64Array(n); let c=0, z=0;            // F(θ)∈[0,1], monotone
    for(let i=0;i<n;i++) z+=max(0,prior[i]);
    for(let i=0;i<n;i++){ c+=max(0,prior[i]); F[i]= z>0 ? c/z : (n>1?i/(n-1):0); } return F; };
  const ecInterp = (x, xs, ys) => { const n=xs.length; if(!n) return 0; if(x<=xs[0]) return ys[0]; if(x>=xs[n-1]) return ys[n-1];
    let lo=0, hi=n-1; while(hi-lo>1){ const mid=(lo+hi)>>1; if(xs[mid]<=x) lo=mid; else hi=mid; }                 // binary search
    const t=(x-xs[lo])/((xs[hi]-xs[lo])||1); return ys[lo]+t*(ys[hi]-ys[lo]); };
  const ecEncode = (theta, xs, F) => ecInterp(theta, xs, F);                                          // F(θ)
  const ecInv = (u, xs, F) => ecInterp(u, F, xs);                                                     // F^{-1}(u)→θ (F monotone)
  const ecMeasure = (theta, sigma, xs, F, g) => ecEncode(theta,xs,F) + sigma*g();                     // sensory sample in F-space
  const ecLikelihood = (mt, sigma, xs, F) => { const n=xs.length, L=new Float64Array(n);              // p(m|θ) over grid (skewed in θ)
    for(let i=0;i<n;i++){ const z=(F[i]-mt)/sigma; L[i]=exp(-0.5*z*z); } return L; };
  const ecDecode = (mt, sigma, xs, F, prior, loss) => { const post=gridPost(ecLikelihood(mt,sigma,xs,F), prior);
    return loss==='MAP' ? gridMode(post,xs) : gridMean(post,xs); };                                    // BLS default → repulsive bias
  const ecBias = (xs, sigma, F, prior, loss, nSamp, g) => { const n=xs.length, b=new Float64Array(n); // E[θ̂|θ]−θ via Monte Carlo
    for(let i=0;i<n;i++){ let s=0; for(let k=0;k<nSamp;k++) s+=ecDecode(F[i]+sigma*g(),sigma,xs,F,prior,loss); b[i]=s/nSamp - xs[i]; } return b; };
  const ecDiscrim = (xs, prior) => { const n=xs.length, d=new Float64Array(n); let mx=0;              // D(θ) ∝ 1/p(θ) (Cramér–Rao), normalized
    for(let i=0;i<n;i++){ d[i]= prior[i]>1e-9 ? 1/prior[i] : Infinity; if(isFinite(d[i])&&d[i]>mx) mx=d[i]; }
    for(let i=0;i<n;i++) d[i]= isFinite(d[i]) ? d[i]/(mx||1) : 1; return d; };
  const ecCondMean = (post, xs, boundary, side) => { let z=0, m=0;                                    // self-consistency: mean of posterior TRUNCATED to the decided side
    for(let i=0;i<xs.length;i++){ const keep = side>=0 ? xs[i]>=boundary : xs[i]<boundary; if(keep){ z+=post[i]; m+=post[i]*xs[i]; } } return z>0 ? m/z : boundary; };
  const efficient = { cdf:ecCdf, interp:ecInterp, encode:ecEncode, inv:ecInv, measure:ecMeasure,
    likelihood:ecLikelihood, decode:ecDecode, biasCurve:ecBias, discrim:ecDiscrim, condMean:ecCondMean };

  /* ---- causal: cue combination (Ernst & Banks 2002), Bayesian causal inference (Körding et
         al. 2007), and Bayesian concept learning / the number game (Tenenbaum 2000). MLE is the
         C=1 (forced-fusion) limit of CI; the number game is the discrete-hypothesis cousin with
         the size-principle likelihood. Gaussian closed forms validate vs bcitoolbox (evans1112). ---- */
  const relWeights = (sig) => { const inv=sig.map(s=>1/(s*s)), z=inv.reduce((a,b)=>a+b,0); return inv.map(v=>v/z); };
  const cueCombineMLE = (cues, sig) => { const w=relWeights(sig); let est=0; for(let i=0;i<cues.length;i++) est+=w[i]*cues[i];
    const v=1/sig.reduce((a,s)=>a+1/(s*s),0); return { estimate:est, variance:v, weights:w }; };          // σ_comb ≤ min σ_i
  const ciLikCommon = (xv,xa,sv,sa,sp,mup=0) => { const sv2=sv*sv,sa2=sa*sa,sp2=sp*sp, D=sv2*sa2+sv2*sp2+sa2*sp2;  // Körding Eq.4
    const num=(xv-xa)*(xv-xa)*sp2 + (xv-mup)*(xv-mup)*sa2 + (xa-mup)*(xa-mup)*sv2; return exp(-0.5*num/D)/(2*PI*sqrt(D)); };
  const ciLikSeparate = (xv,xa,sv,sa,sp,mup=0) => { const a=sv*sv+sp*sp, b=sa*sa+sp*sp;                            // Körding Eq.6
    return exp(-0.5*((xv-mup)*(xv-mup)/a + (xa-mup)*(xa-mup)/b))/(2*PI*sqrt(a*b)); };
  const ciPosteriorCommon = (xv,xa,sv,sa,sp,pc,mup=0) => { const c=ciLikCommon(xv,xa,sv,sa,sp,mup)*pc, s=ciLikSeparate(xv,xa,sv,sa,sp,mup)*(1-pc);
    return (c+s)>0 ? c/(c+s) : pc; };                                                                              // Körding Eq.2
  const ciFusedEstimate = (xv,xa,sv,sa,sp,mup=0) => { const wv=1/(sv*sv),wa=1/(sa*sa),wp=1/(sp*sp); return (xv*wv+xa*wa+mup*wp)/(wv+wa+wp); };
  const ciSegEstimate = (x,sigma,sp,mup=0) => { const w=1/(sigma*sigma),wp=1/(sp*sp); return (x*w+mup*wp)/(w+wp); };
  const ciEstimate = (xv,xa,sv,sa,sp,pc,opts={}) => { const mup=opts.mup||0, strat=opts.strategy||'average', g=opts.g;
    const pC=ciPosteriorCommon(xv,xa,sv,sa,sp,pc,mup), sF=ciFusedEstimate(xv,xa,sv,sa,sp,mup), sV=ciSegEstimate(xv,sv,sp,mup), sA=ciSegEstimate(xa,sa,sp,mup);
    let hv, ha; if(strat==='select'){ const k=pC>0.5; hv=k?sF:sV; ha=k?sF:sA; }
    else if(strat==='match'){ const k=(g?g():0.5)<pC; hv=k?sF:sV; ha=k?sF:sA; }
    else { hv=pC*sF+(1-pC)*sV; ha=pC*sF+(1-pC)*sA; }                                                               // model averaging (default)
    return { pCommon:pC, sFused:sF, sSegV:sV, sSegA:sA, sHatV:hv, sHatA:ha }; };
  const ngHypotheses = (N=100) => { const H=[], add=(name,mem,prior)=>H.push({name,members:new Set(mem),size:mem.length,prior});  // number game
    const rg=(a,b)=>{ const r=[]; for(let i=a;i<=b;i++) r.push(i); return r; };
    for(let k=2;k<=10;k++) add('mult '+k, rg(1,N).filter(x=>x%k===0), 0.5/9);
    for(let k=2;k<=10;k++){ const p=[]; for(let v=k;v<=N;v*=k) p.push(v); add('powers '+k, p, 0.5/9); }
    add('even', rg(1,N).filter(x=>x%2===0), 0.5); add('odd', rg(1,N).filter(x=>x%2), 0.5);
    add('squares', rg(1,N).filter(x=>Number.isInteger(sqrt(x))), 0.5);
    for(let a=1;a<=N;a++) for(let b=a;b<=N;b++) add('['+a+','+b+']', rg(a,b), 0.1/(N*(N+1)/2));                     // interval hypotheses
    return H; };
  const ngLikelihood = (h, ex) => { for(const x of ex) if(!h.members.has(x)) return 0; return Math.pow(1/h.size, ex.length); };  // size principle (1/|h|)^n
  const ngPosterior = (H, ex) => { const w=H.map(h=>ngLikelihood(h,ex)*h.prior); let z=0; for(const v of w) z+=v; return z>0 ? w.map(v=>v/z) : w; };
  const ngGeneralize = (H, post, N=100) => { const out=new Float64Array(N+1); for(let i=0;i<H.length;i++){ if(post[i]<=0) continue; for(const y of H[i].members) out[y]+=post[i]; } return out; };
  const causal = { reliabilityWeights:relWeights, cueCombineMLE, ciLikCommon, ciLikSeparate, ciPosteriorCommon,
    ciFusedEstimate, ciSegEstimate, ciEstimate, numberGameHypotheses:ngHypotheses, sizePrincipleLikelihood:ngLikelihood, conceptPosterior:ngPosterior, generalizationCurve:ngGeneralize };

  /* ---- wm: visual working-memory mixture models — Zhang & Luck (2008) 2-component
         (target+guess), Bays/Husain (2008/2009) 3-component swap model, and the von Mises
         machinery (Best & Fisher 1979 sampler, transcribed from MemToolbox vonmisesrnd.m).
         Angles in RADIANS on (−π,π]; RNG injected as g (∈[0,1)). 2-comp = pSwap:0, no offsets. ---- */
  const TWO_PI = 2*PI, vmWrap = (x) => ((x+PI)%TWO_PI+TWO_PI)%TWO_PI - PI;
  const besselI0 = (k) => { k=abs(k); if(k<15){ let t=1,s=1; for(let m=1;m<60;m++){ t*=(k*k)/(4*m*m); s+=t; if(t<s*1e-15) break; } return s; }
    const e=1/(8*k); return exp(k)/sqrt(TWO_PI*k)*(1+e+4.5*e*e+37.5*e*e*e); };
  const besselI1 = (k) => { const sg=Math.sign(k)||1; k=abs(k); if(k<15){ let t=k/2,s=k/2; for(let m=1;m<60;m++){ t*=(k*k)/(4*m*(m+1)); s+=t; if(t<s*1e-15) break; } return sg*s; }
    const e=1/(8*k); return sg*exp(k)/sqrt(TWO_PI*k)*(1-3*e-7.5*e*e-52.5*e*e*e); };
  const i1i0 = (k) => { k=abs(k); return k>700 ? (1 - 0.5/k - 0.125/(k*k)) : besselI1(k)/besselI0(k); };  // I1/I0 (mean resultant length), stable as κ→∞ (avoids Inf/Inf)
  const vmPdf = (x, mu, kappa) => { if(kappa<=0) return 1/TWO_PI; const logI0 = kappa>700 ? (kappa-0.5*Math.log(TWO_PI*kappa)) : Math.log(besselI0(kappa));
    return exp(kappa*Math.cos(x-mu) - Math.log(TWO_PI) - logI0); };
  const vmSample = (mu, kappa, g) => { if(!(kappa>1e-6)) return vmWrap(g()*TWO_PI-PI);                 // Best & Fisher (1979); tiny/invalid κ → uniform
    const tau=1+sqrt(1+4*kappa*kappa), rho=(tau-sqrt(2*tau))/(2*kappa), r=(1+rho*rho)/(2*rho); let f=1;
    if(!isFinite(r)) return vmWrap(g()*TWO_PI-PI);
    for(let it=0; it<1000; it++){ const u1=g(), u2=g(), z=Math.cos(PI*u1); f=(1+r*z)/(r+z); const c=kappa*(r-f);
      if(c*(2-c)-u2>0) break; if(Math.log(c/u2)+1-c>=0) break; }
    return vmWrap(mu + Math.sign(g()-0.5)*Math.acos(Math.max(-1,Math.min(1,f)))); };
  const kappaToSD = (kappa) => { if(!(kappa>1e-9)) return Infinity; if(!isFinite(kappa)) return 0; const R=i1i0(kappa); return sqrt(-2*Math.log(R)); };
  const sdToKappa = (S) => { const R=exp(-S*S/2); if(R<0.53) return 2*R+R*R*R+5*Math.pow(R,5)/6; if(R<0.85) return -0.4+1.39*R+0.43/(1-R); return 1/(R*R*R-4*R*R+3*R); };
  const fisherInfo = (kappa) => kappa*i1i0(kappa);
  const precisionFromSetsize = (N, opts={}) => { const P1=opts.P1!==undefined?opts.P1:1, k=opts.k!==undefined?opts.k:0.74; return P1*Math.pow(N,-k); };  // Bays & Husain 2008
  const mixtureRecall = (cfg, g) => { const { target, nontargets=[], kappa, pT, pSwap=0, pGuess } = cfg, u=g();
    if(u<pT) return { thetaHat:vmSample(target,kappa,g), branch:'target' };
    if(u<pT+pSwap && nontargets.length){ const j=Math.floor(g()*nontargets.length); return { thetaHat:vmSample(nontargets[j],kappa,g), branch:'swap', swapTo:j }; }
    return { thetaHat:vmWrap(g()*TWO_PI-PI), branch:'guess' }; };
  const mixturePdf = (err, c) => { const { kappa, pT, pSwap=0, pGuess, nontargetOffsets=[] } = c; let p=pT*vmPdf(err,0,kappa)+pGuess*(1/TWO_PI);
    const m=nontargetOffsets.length; if(m) for(const phi of nontargetOffsets) p += (pSwap/m)*vmPdf(err,phi,kappa); return p; };
  const wm = { wrap:vmWrap, besselI0, besselI1, vmPdf, vmSample, kappaToSD, sdToKappa, fisherInfo, precisionFromSetsize, mixtureRecall, mixturePdf };

  /* ---- network: Hopfield associative memory (Hebbian plasticity, attractor recall) ---- */
  const hopfieldStore = (patterns, N) => {   // patterns: array of ±1 vectors (length N) → weight matrix W, zero diagonal
    const W = new Float64Array(N*N);
    for(const p of patterns) for(let i=0;i<N;i++) for(let j=0;j<N;j++){ if(i!==j) W[i*N+j] += p[i]*p[j]; }
    for(let t=0;t<W.length;t++) W[t] /= N; return W; };   // canonical 1/N Hebbian scaling (capacity ≈ 0.138·N)
  const hopfieldEnergy = (W, s, N) => { let E=0; for(let i=0;i<N;i++) for(let j=0;j<N;j++) E -= 0.5*W[i*N+j]*s[i]*s[j]; return E; };  // Lyapunov energy (non-increasing under async sign updates)
  const hopfieldStep = (W, s, N, order) => {   // one ASYNC sweep of sign updates; `order` = index order (defaults 0..N-1)
    const o = order || Array.from({length:N},(_,i)=>i);
    for(const i of o){ let h=0; for(let j=0;j<N;j++) h += W[i*N+j]*s[j]; s[i] = h>=0 ? 1 : -1; } return s; };
  const overlap = (a, b, N) => { let m=0; for(let i=0;i<N;i++) m += a[i]*b[i]; return m/N; };   // pattern overlap ∈ [-1,1]
  // ring / continuous attractor: Mexican-hat connectivity (local excitation − broad inhibition) on a ring of N units
  const ringKernel = (N, Jpos, Jneg, sigma) => { const W=new Float64Array(N*N);
    for(let i=0;i<N;i++) for(let j=0;j<N;j++){ const d=Math.min(Math.abs(i-j), N-Math.abs(i-j))/N*2*PI; W[i*N+j] = Jpos*exp(-d*d/(2*sigma*sigma)) - Jneg; } return W; };  // d = circular distance (rad)
  const ringStep = (r, W, Iext, dt, tau, gain, bias, sigmaN, g) => { const N=r.length, out=new Float64Array(N);   // τ dr/dt = −r + f(gain·(W r + Iext − bias)), f = logistic (bounded [0,1] → no runaway)
    for(let i=0;i<N;i++){ let h=0; for(let j=0;j<N;j++) h += W[i*N+j]*r[j]; const f = 1/(1+exp(-gain*(h + (Iext?Iext[i]:0) - bias)));
      out[i] = max(0, Math.min(1, r[i] + (dt/tau)*(-r[i] + f) + (sigmaN? sigmaN*sqrt(dt)*g() : 0))); } return out; };  // clamp to [0,1] so the rate stays bounded even with noise
  const popVector = (r, N) => { let cx=0, cy=0, tot=0; for(let i=0;i<N;i++){ const a=2*PI*i/N; cx+=r[i]*Math.cos(a); cy+=r[i]*Math.sin(a); tot+=r[i]; } let th=Math.atan2(cy,cx); if(th<0) th+=2*PI; return { angle:th, length: tot>1e-9 ? Math.hypot(cx,cy)/tot : 0 }; };  // decoded heading + concentration ∈ [0,1] (low = no clear bump)
  const network = { hopfieldStore, hopfieldEnergy, hopfieldStep, overlap, ringKernel, ringStep, popVector };

  /* ---- osc: Kuramoto coupled phase oscillators (synchronisation) ---- */
  const kuramotoOrder = (phases) => { let C=0,S=0; const n=phases.length; for(const th of phases){ C+=Math.cos(th); S+=Math.sin(th); } return { r:Math.hypot(C,S)/Math.max(1,n), psi:Math.atan2(S,C) }; };  // r = global synchrony ∈ [0,1]
  const kuramotoStep = (phases, omega, K, dt, sigma, g) => {   // mean-field: dθ_i = [ω_i + K·r·sin(ψ−θ_i)]·dt + noise
    const n=phases.length, { r, psi }=kuramotoOrder(phases), out=new Float64Array(n);
    for(let i=0;i<n;i++){ const d = omega[i] + K*r*Math.sin(psi - phases[i]); out[i] = phases[i] + d*dt + (sigma ? sigma*sqrt(dt)*g() : 0); } return out; };
  const osc = { kuramotoOrder, kuramotoStep };

  /* ---- belief: discrete Bayes filter (HMM forward / belief tracking over a hidden state) ---- */
  const beliefPredict = (b, T) => { const S=b.length, out=new Float64Array(S); for(let i=0;i<S;i++) for(let j=0;j<S;j++) out[j] += b[i]*T[i][j]; return out; };  // propagate through transition T[i][j]=P(j|i)
  const beliefUpdate  = (b, lik) => { const S=b.length, out=new Float64Array(S); let z=0; for(let j=0;j<S;j++){ out[j]=b[j]*lik[j]; z+=out[j]; } if(z>0) for(let j=0;j<S;j++) out[j]/=z; return out; };  // multiply by P(obs|state) and renormalise
  const beliefEntropy = (b) => { let H=0; for(const p of b) if(p>1e-12) H -= p*Math.log(p); return H; };   // uncertainty (nats); 0 = certain
  const belief = { predict:beliefPredict, update:beliefUpdate, entropy:beliefEntropy };

  /* ---- vision: front-end receptive fields (center-surround) for layered sensory models ---- */
  const dogKernel = (sigmaC, sigmaS, wSurr) => {   // difference-of-Gaussians (center − surround) RF; {k,R,sz} for conv2
    const R=max(3, Math.round(sigmaS*2.4)), sz=2*R+1, k=new Float64Array(sz*sz);
    for(let j=-R;j<=R;j++) for(let i=-R;i<=R;i++){ const r2=i*i+j*j,
      cen=exp(-r2/(2*sigmaC*sigmaC))/(2*PI*sigmaC*sigmaC), sur=exp(-r2/(2*sigmaS*sigmaS))/(2*PI*sigmaS*sigmaS);
      k[(j+R)*sz+(i+R)] = cen - wSurr*sur; }   // wSurr=0 → pure low-pass centre; wSurr→1 → ~zero-mean band-pass (the surround does the subtraction)
    return { k, R, sz }; };
  const rfSizeVsEcc = (ecc, base, slope) => base*(1 + slope*ecc);   // receptive-field size grows ~linearly with eccentricity
  const vision = { dogKernel, rfSizeVsEcc };

  /* ---- attn: self-attention building blocks (transformer-style content-based routing) ---- */
  const attnSoftmax = (logits) => { let m=-Infinity; for(const x of logits) if(x>m) m=x; const e=logits.map(x=>exp(x-m)); let z=0; for(const v of e) z+=v; return e.map(v=>v/z); };   // numerically-stable softmax → sums to 1
  const attnEntropy = (p) => { let H=0; for(const q of p) if(q>1e-12) H -= q*Math.log(q); return H; };   // attention entropy (nats); 0 = peaked, ln(N) = uniform
  const attn = { softmax: attnSoftmax, entropy: attnEntropy };

  global.MSLIB = { sde, bayes, neuron, decision, rl, psy, efficient, causal, wm, network, osc, belief, vision, attn };
})(typeof window !== 'undefined' ? window : globalThis);
