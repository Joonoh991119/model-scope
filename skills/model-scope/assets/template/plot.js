/* =============================================================================
 * plot.js — a tiny canvas charting helper so each model defines its OWN axes &
 * graphics. No fixed layout: a view's draw(g, data, ui) calls g.frame({x,y,…})
 * to set up whatever axes it wants, then draws primitives in data coordinates.
 *
 * Classic script → window.Plot = { make, setup, TH, histify }.
 * Theme matches index.html (light, eye-friendly). DPR-correct.
 * ========================================================================== */
(function (global) {
  'use strict';
  const TH = {
    ink:'#33312c', dim:'#6f6b61', faint:'#a39e91', grid:'rgba(80,75,65,.07)',
    edge:'rgba(80,75,65,.28)', accent:'#4a7a93', pos:'#2e8b7a', neg:'#c25b42', warn:'#b07d2a',
    series:['#4a7a93','#c25b42','#2e8b7a','#b07d2a','#7a5a93','#3f7d5e'],
  };
  function setup(cv){ const dpr=Math.max(1,(global.devicePixelRatio||1)), r=cv.getBoundingClientRect(),
    w=Math.max(20,r.width), h=Math.max(20,r.height);
    cv.width=Math.round(w*dpr); cv.height=Math.round(h*dpr);
    const ctx=cv.getContext('2d'); ctx.setTransform(dpr,0,0,dpr,0,0); ctx.clearRect(0,0,w,h); return {ctx,w,h}; }
  const fmtTick=(t)=>{ const a=Math.abs(t); if(a!==0 && (a<0.01||a>=1e4)) return t.toExponential(1);
    return (Math.round(t*1000)/1000).toString(); };
  function roundRect(ctx,x,y,w,h,r){ r=Math.min(r,h/2,w/2); ctx.beginPath(); ctx.moveTo(x+r,y);
    ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); }
  function wrap2(ctx,str,maxw){ const words=String(str).split(/\s+/), lines=[]; let cur='';   // greedy wrap to ≤2 lines
    for(let k=0;k<words.length;k++){ const wd=words[k], t=cur?cur+' '+wd:wd;
      if(ctx.measureText(t).width<=maxw||!cur){ cur=t; } else { lines.push(cur); cur=wd; if(lines.length===2){ cur=''; break; } } }
    if(cur&&lines.length<2) lines.push(cur);
    for(let i=0;i<lines.length;i++){ let s=lines[i]; if(ctx.measureText(s).width>maxw){ while(s.length>1&&ctx.measureText(s+'…').width>maxw) s=s.slice(0,-1); lines[i]=s+'…'; } }
    return lines.length?lines:['']; }

  function make(cv){
    const {ctx,w,h}=setup(cv); let sx=v=>v, sy=v=>v, fr=null;
    const g = { ctx, w, h, TH,
      frame(o){ const M=o.margin||{l:48,r:14,t:o.title?24:12,b:o.xlabel?42:26};
        const px=M.l, py=M.t, pw=Math.max(2,w-M.l-M.r), ph=Math.max(2,h-M.t-M.b);
        fr={px,py,pw,ph,x:o.x,y:o.y};
        sx=v=>px+(v-o.x[0])/((o.x[1]-o.x[0])||1)*pw; sy=v=>py+ph*(1-(v-o.y[0])/((o.y[1]-o.y[0])||1));
        ctx.strokeStyle=TH.grid; ctx.lineWidth=1; ctx.font='11px "IBM Plex Mono",monospace'; ctx.fillStyle=TH.dim;
        const nx=o.xticks||5, ny=o.yticks||4;
        for(let i=0;i<=nx;i++){ const t=o.x[0]+(o.x[1]-o.x[0])*i/nx, X=sx(t);
          ctx.beginPath(); ctx.moveTo(X,py); ctx.lineTo(X,py+ph); ctx.stroke();
          ctx.textAlign='center'; if(!(i===nx && (px+pw) > w-26)) ctx.fillText(fmtTick(t),X,py+ph+13); }  // skip last tick only if it would clip the edge
        for(let j=0;j<=ny;j++){ const t=o.y[0]+(o.y[1]-o.y[0])*j/ny, Y=sy(t);
          ctx.beginPath(); ctx.moveTo(px,Y); ctx.lineTo(px+pw,Y); ctx.stroke();
          ctx.textAlign='right'; ctx.fillText(fmtTick(t),px-6,Y+3); }
        ctx.fillStyle=TH.dim;
        if(o.xlabel){ ctx.textAlign='center'; ctx.fillText(o.xlabel, px+pw/2, py+ph+31); }            // own line below the ticks (no overlap)
        if(o.ylabel){ ctx.save(); ctx.translate(px-37,py+ph/2); ctx.rotate(-Math.PI/2); ctx.textAlign='center'; ctx.fillText(o.ylabel,0,0); ctx.restore(); }
        if(o.title){ ctx.textAlign='left'; ctx.font='600 11px "IBM Plex Sans",system-ui,sans-serif'; ctx.fillText(o.title,px,py-9); }
        return g; },
      X:v=>sx(v), Y:v=>sy(v), frameRect:()=>fr,
      clip(){ ctx.save(); ctx.beginPath(); ctx.rect(fr.px,fr.py,fr.pw,fr.ph); ctx.clip(); return g; },
      unclip(){ ctx.restore(); return g; },
      line(pts,o={}){ if(!pts||pts.length<2)return g; ctx.strokeStyle=o.color||TH.accent; ctx.lineWidth=o.width||1.8;
        if(o.dash)ctx.setLineDash(o.dash); ctx.beginPath();
        for(let i=0;i<pts.length;i++){ const X=sx(pts[i][0]),Y=sy(pts[i][1]); i?ctx.lineTo(X,Y):ctx.moveTo(X,Y); }
        ctx.stroke(); ctx.setLineDash([]); return g; },
      band(pts,o={}){ if(!pts||pts.length<2)return g; const base=o.base!==undefined?o.base:fr.y[0];
        ctx.fillStyle=o.color||'rgba(74,122,147,.16)'; ctx.beginPath(); ctx.moveTo(sx(pts[0][0]),sy(base));
        for(const p of pts) ctx.lineTo(sx(p[0]),sy(p[1])); ctx.lineTo(sx(pts[pts.length-1][0]),sy(base)); ctx.closePath(); ctx.fill(); return g; },
      points(pts,o={}){ ctx.fillStyle=o.color||TH.accent; const r=o.r||2.6; for(const p of pts){ ctx.beginPath(); ctx.arc(sx(p[0]),sy(p[1]),r,0,7); ctx.fill(); } return g; },
      marker(x,y,o={}){ const X=sx(x),Y=sy(y); ctx.fillStyle=o.color||TH.ink; ctx.strokeStyle=o.stroke||'#fff'; ctx.lineWidth=1.4;
        ctx.beginPath(); ctx.arc(X,Y,o.r||4,0,7); ctx.fill(); if(o.stroke)ctx.stroke();
        if(o.label){ ctx.fillStyle=o.color||TH.ink; ctx.font='10px "IBM Plex Mono",monospace'; ctx.textAlign='center'; ctx.fillText(o.label,X,Y-7); } return g; },
      vline(x,o={}){ ctx.strokeStyle=o.color||TH.dim; ctx.lineWidth=o.width||1.2; if(o.dash!==null)ctx.setLineDash(o.dash||[4,3]);
        ctx.beginPath(); ctx.moveTo(sx(x),fr.py); ctx.lineTo(sx(x),fr.py+fr.ph); ctx.stroke(); ctx.setLineDash([]);
        if(o.label){ ctx.fillStyle=o.color||TH.dim; ctx.font='10px "IBM Plex Mono",monospace'; ctx.textAlign='center'; ctx.fillText(o.label,sx(x),fr.py-2); } return g; },
      hline(y,o={}){ ctx.strokeStyle=o.color||TH.dim; ctx.lineWidth=o.width||1.2; if(o.dash!==null)ctx.setLineDash(o.dash||[4,3]);
        ctx.beginPath(); ctx.moveTo(fr.px,sy(y)); ctx.lineTo(fr.px+fr.pw,sy(y)); ctx.stroke(); ctx.setLineDash([]);
        if(o.label){ ctx.fillStyle=o.color||TH.dim; ctx.font='10px "IBM Plex Mono",monospace'; ctx.textAlign='left'; ctx.fillText(o.label,fr.px+4,sy(y)-3); } return g; },
      // bars from a histify() result {edges,counts,binW}; dir 'up' grows from baseY upward, 'down' downward
      bars(hist,o={}){ const dir=o.dir||'up', baseY=o.baseY!==undefined?o.baseY:0, col=o.color||TH.accent, mx=o.max||Math.max(1,...hist.counts);
        ctx.fillStyle=col; const yb=sy(baseY); for(let i=0;i<hist.counts.length;i++){ const x0=sx(hist.edges[i]), x1=sx(hist.edges[i]+hist.binW), hpx=(hist.counts[i]/mx)*(o.height||(dir==='up'?(yb-fr.py):(fr.py+fr.ph-yb)))*0.96;
        if(hpx<=0)continue; const wpx=Math.max(1,x1-x0-0.7); if(dir==='up') ctx.fillRect(x0+0.35,yb-hpx,wpx,hpx); else ctx.fillRect(x0+0.35,yb,wpx,hpx); } return g; },
      // heatmap over the frame: val(i,j)∈[0,1] on an nx×ny grid; cmap(t)→[r,g,b]
      heat(nx,ny,val,cmap){ const off=document.createElement('canvas'); off.width=nx; off.height=ny; const oc=off.getContext('2d'), img=oc.createImageData(nx,ny);
        for(let i=0;i<nx;i++)for(let j=0;j<ny;j++){ const c=cmap(val(i,j)), o=((ny-1-j)*nx+i)*4; img.data[o]=c[0];img.data[o+1]=c[1];img.data[o+2]=c[2];img.data[o+3]=255; }
        oc.putImageData(img,0,0); ctx.imageSmoothingEnabled=true; ctx.drawImage(off,fr.px,fr.py,fr.pw,fr.ph); return g; },
      // spike raster: rows = array of arrays of event-x; each row a horizontal lane
      raster(rows,o={}){ const col=o.color||TH.ink, n=rows.length, lane=fr.ph/Math.max(1,n);
        ctx.strokeStyle=col; ctx.lineWidth=o.width||1; for(let r=0;r<n;r++){ const y0=fr.py+r*lane+lane*0.15, y1=fr.py+(r+1)*lane-lane*0.15; for(const x of rows[r]){ const X=sx(x); ctx.beginPath(); ctx.moveTo(X,y0); ctx.lineTo(X,y1); ctx.stroke(); } } return g; },
      text(x,y,str,o={}){ ctx.fillStyle=o.color||TH.dim; ctx.font=o.font||'10px "IBM Plex Mono",monospace'; ctx.textAlign=o.align||'left'; ctx.fillText(str,sx(x),sy(y)); return g; },
      legend(items,o={}){ let yy=fr.py+8; const xx=o.x!==undefined?o.x:fr.px+fr.pw-8; ctx.textAlign='right'; ctx.font='10px "IBM Plex Mono",monospace';
        for(const it of items){ ctx.fillStyle=it.color; ctx.fillRect(xx-2,yy-7,8,8); ctx.fillStyle=TH.dim; ctx.fillText(it.label,xx-14,yy); yy+=14; } return g; },
      note(str){ ctx.fillStyle=TH.faint; ctx.font='11px "IBM Plex Mono",monospace'; ctx.textAlign='center'; ctx.fillText(str, w/2, h/2); return g; },
      // process pipeline (PIXEL space — needs no frame): an ordered strip of stage boxes
      // with arrows; the active stage is highlighted, earlier ones marked done. Use it as a
      // "process overview" view so the whole sequence is visible while you step the playhead.
      // stages=[{key,name,about}]; active=index; o:{y,h,pad,gap,caption}. about → caption line.
      flow(stages,active,o={}){ if(!stages||!stages.length) return g; const n=stages.length;
        const pad=o.pad||12, gap=o.gap||9, bh=o.h||46, hasCap=o.caption!==false;
        const top=o.y!==undefined?o.y:Math.round(hasCap? h*0.30 : h/2-bh/2);
        const bw=Math.max(30,(w-2*pad-gap*(n-1))/n);
        ctx.save(); ctx.lineJoin='round'; ctx.textBaseline='middle';
        for(let i=0;i<n;i++){ const x=pad+i*(bw+gap), cur=i===active, done=active!=null&&i<active;
          if(i>0){ const ay=top+bh/2; ctx.strokeStyle=TH.faint; ctx.fillStyle=TH.faint; ctx.lineWidth=1.3;
            ctx.beginPath(); ctx.moveTo(x-gap+1,ay); ctx.lineTo(x-3.5,ay); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(x-1,ay); ctx.lineTo(x-5,ay-3); ctx.lineTo(x-5,ay+3); ctx.closePath(); ctx.fill(); }
          ctx.fillStyle=cur?TH.accent:(done?'rgba(74,122,147,.12)':'#fff'); roundRect(ctx,x,top,bw,bh,8); ctx.fill();
          ctx.lineWidth=cur?1.5:1; ctx.strokeStyle=cur?TH.accent:TH.edge; ctx.stroke();
          ctx.font='600 9px "IBM Plex Mono",monospace'; ctx.textAlign='left'; ctx.fillStyle=cur?'rgba(255,255,255,.85)':TH.faint; ctx.fillText(String(i+1),x+6,top+9);
          ctx.font='600 10.5px "IBM Plex Sans",system-ui,sans-serif'; ctx.textAlign='center'; ctx.fillStyle=cur?'#fff':(done?TH.accent:TH.dim);
          const lines=wrap2(ctx,stages[i].name,bw-12), lh=12, y0=top+bh/2-(lines.length-1)*lh/2; lines.forEach((ln,li)=>ctx.fillText(ln,x+bw/2,y0+li*lh)); }
        if(hasCap && active!=null && stages[active] && stages[active].about){ ctx.textBaseline='top'; ctx.textAlign='center';
          ctx.font='11px "IBM Plex Sans",system-ui,sans-serif'; ctx.fillStyle=TH.dim;
          const maxw=w-2*pad, words=String(stages[active].about).split(/\s+/), L=[]; let line='';
          for(const wd of words){ const t=line?line+' '+wd:wd; if(ctx.measureText(t).width>maxw&&line){ L.push(line); line=wd; if(L.length===3)break; } else line=t; }
          if(line&&L.length<3) L.push(line); let cy=top+bh+13; for(const ln of L){ ctx.fillText(ln,w/2,cy); cy+=15; } }
        ctx.restore(); return g; },
    };
    return g;
  }
  // bin values into `bins` over [lo,hi]; snap bin width to a multiple of `quant` (e.g. dt) if given
  function histify(values, bins, lo, hi, quant){
    bins=Math.max(1,Math.floor(bins||1)); if(!(hi>lo)) hi=lo+(quant>0?quant:1);     // guard degenerate range
    let bw=(hi-lo)/bins; if(quant>0) bw=Math.max(quant, Math.round(bw/quant)*quant); if(!(bw>0)) bw=(hi-lo)||1;
    const n=Math.max(1,Math.ceil((hi-lo)/bw)), counts=new Array(n).fill(0), edges=new Array(n);
    for(let i=0;i<n;i++) edges[i]=lo+i*bw;
    for(const v of values){ if(!(v>=lo && v<hi)) continue; const k=Math.floor((v-lo)/bw); if(k>=0&&k<n) counts[k]++; } // drop out-of-range (no fake edge mass)
    return { edges, counts, binW:bw, max:Math.max(1,...counts) };
  }
  global.Plot = { make, setup, TH, histify };
})(typeof window!=='undefined'?window:globalThis);
