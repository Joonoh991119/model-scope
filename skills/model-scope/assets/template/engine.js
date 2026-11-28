(function (global) {
  'use strict';

  function hashSeed(s){ s=String(s); let h=0x811c9dc5; for(let i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=Math.imul(h,0x01000193);} return h>>>0; }
  function mulberry32(a){ return function(){ a|=0; a=(a+0x6d2b79f5)|0; let t=Math.imul(a^a>>>15,1|a); t=(t+Math.imul(t^t>>>7,61|t))^t; return ((t^t>>>14)>>>0)/4294967296; }; }
  function makeRNG(s){ return mulberry32(hashSeed(s)); }
  function gaussian(rng){ let u=rng(); if(u<1e-12)u=1e-12; return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*rng()); }
  const trialRng = (seed,k)=>makeRNG(seed+'#'+k);
  const npdf = (x,mu,s)=>Math.exp(-0.5*((x-mu)/s)*((x-mu)/s))/(s*Math.sqrt(2*Math.PI));

  function runChunks(total, doItem, label){
    if(typeof window==='undefined' || !window.requestAnimationFrame){ for(let k=0;k<total;k++) doItem(k); return; }
    const myGen=window.__simGen, chunk=Math.max(1, Math.round(total/60)); let k=0, first=true;
    const step=()=>{ if(window.__simGen!==myGen) return;
      try{ const end=Math.min(total, k+chunk); for(; k<end; k++) doItem(k); }
      catch(e){ if(first) throw e;
        if(window.__setLoading) window.__setLoading(false);
        if(window.__simFailed) window.__simFailed(e); else console.error(e); return; }
      first=false; const done=k>=total, prog=total?k/total:1;
      if(window.__setLoading) window.__setLoading(!done, prog, label);
      if(done){ if(window.__redraw) window.__redraw(); } else window.requestAnimationFrame(step); };
    step();
  }

  const MODELS = {
  };
  const MODEL_ORDER = [];

  function register(models, order){
    for(const id of (order || Object.keys(models))){ if(MODELS[id] || !models[id]) continue; MODELS[id]=models[id]; MODEL_ORDER.push(id); }
  }

  global.SIM = { makeRNG, gaussian, hashSeed, trialRng, npdf, runChunks, MODELS, MODEL_ORDER, register };
})(typeof window !== 'undefined' ? window : globalThis);
