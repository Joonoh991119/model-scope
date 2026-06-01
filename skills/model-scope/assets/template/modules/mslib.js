/* =============================================================================
 * mslib.js — model-scope reusable model library (OPTIONAL, classic script).
 *
 * Small, pure, composable building blocks distilled from canonical computational-
 * neuroscience models — NOT copied from any repo; minimal textbook forms you compose
 * inside a model's simulate(). Include only if you need them:
 *     <script src="modules/mslib.js"></script>   (before engine.js)
 * then use e.g. MSLIB.neuron.lifStep(...), MSLIB.bayes.gaussPosterior(...).
 *
 * Design: every function is pure, takes its randomness as a `g` argument
 * (g = () => N(0,1), e.g. ()=>SIM.gaussian(rng)), and is FREE-STANDING — it never uses
 * `this`, so you can destructure (`const { wwStep } = MSLIB.decision`) freely. All times
 * are in SECONDS. Add a family by attaching another sub-object to MSLIB — nothing couples.
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
  const centralTendency = (thetaGrid, sm, mu0, s0) => { const w=weight(sm,s0);
    return thetaGrid.map(th => ({ theta:th, est:w*th+(1-w)*mu0, sd:w*sm })); };        // regression toward the prior
  const weberNoise = (theta, wf, floor=1e-3) => max(floor, wf*abs(theta));            // σ_m = wf·θ (magnitude/time)
  const bayesTrial = (theta, sm, mu0, s0, g) => { const m=theta+sm*g(), post=gaussPosterior(m,sm,mu0,s0); return { m, est:post.mu, post }; };
  const bayes = { gaussPosterior, weight, centralTendency, weberNoise, trial: bayesTrial };

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
  const fI = (stepFn, init, Irange, dt, T) => Irange.map(I => { const s=init(); let n=0; const steps=Math.round(T/dt);
    for (let k=0;k<steps;k++) if (stepFn(s,I,dt)) n++; return { I, rate:n/T }; });      // mean rate (Hz) — dt & T in seconds
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

  global.MSLIB = { sde, bayes, neuron, decision, rl, psy };
})(typeof window !== 'undefined' ? window : globalThis);
