/* =============================================================================
 * plot.js — a tiny canvas charting helper so each model defines its OWN axes &
 * graphics. No fixed layout: a view's draw(g, data, ui) calls g.frame({x,y,…})
 * to set up whatever axes it wants, then draws primitives in data coordinates.
 *
 * Classic script → window.Plot = { make, setup, TH, histify }.
 * Text size scales with window.__plotFontScale (the app's "Text size" control):
 * fonts, frame margins and label offsets all grow together so larger text still
 * gets its own space and never overlaps the graphics. Theme is light; DPR-correct.
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

  function make(cv){
    const {ctx,w,h}=setup(cv); let sx=v=>v, sy=v=>v, fr=null;
    const FS=Math.max(0.75, Math.min(1.9, (global.__plotFontScale||1)));         // global text-size scale (bounded so labels never crowd out the data area)
    const MONO=px=>`${(px*FS).toFixed(1)}px "IBM Plex Mono",monospace`;
    const SANS=(px,wt)=>`${wt?wt+' ':''}${(px*FS).toFixed(1)}px "IBM Plex Sans",system-ui,sans-serif`;
    function wrap2(str,maxw){ const words=String(str).split(/\s+/), lines=[]; let cur='';   // greedy wrap to ≤2 lines
      for(let k=0;k<words.length;k++){ const wd=words[k], t=cur?cur+' '+wd:wd;
        if(ctx.measureText(t).width<=maxw||!cur){ cur=t; } else { lines.push(cur); cur=wd; if(lines.length===2){ cur=''; break; } } }
      if(cur&&lines.length<2) lines.push(cur);
      for(let i=0;i<lines.length;i++){ let s=lines[i]; if(ctx.measureText(s).width>maxw){ while(s.length>1&&ctx.measureText(s+'…').width>maxw) s=s.slice(0,-1); lines[i]=s+'…'; } }
      return lines.length?lines:['']; }
    const g = { ctx, w, h, TH, FS,
      frame(o){ const M=o.margin||{l:Math.round(48*FS), r:Math.round((o.cbar?62:14)*FS), t:Math.round((o.title?26:12)*FS), b:Math.round((o.xlabel?44:26)*FS)};
        const px=M.l, py=M.t, pw=Math.max(2,w-M.l-M.r), ph=Math.max(2,h-M.t-M.b);
        fr={px,py,pw,ph,x:o.x,y:o.y};
        sx=v=>px+(v-o.x[0])/((o.x[1]-o.x[0])||1)*pw; sy=v=>py+ph*(1-(v-o.y[0])/((o.y[1]-o.y[0])||1));
        ctx.strokeStyle=TH.grid; ctx.lineWidth=1; ctx.font=MONO(11); ctx.fillStyle=TH.dim;
        const nx=o.xticks||5, ny=o.yticks||4;
        if(o.xticklabels){ ctx.textAlign='center'; for(let i=0;i<o.xticklabels.length;i++){ const X=sx(i);     // categorical ticks at integer positions
            ctx.beginPath(); ctx.moveTo(X,py); ctx.lineTo(X,py+ph); ctx.stroke(); ctx.fillText(o.xticklabels[i],X,py+ph+13*FS); } }
        else for(let i=0;i<=nx;i++){ const t=o.x[0]+(o.x[1]-o.x[0])*i/nx, X=sx(t);
          ctx.beginPath(); ctx.moveTo(X,py); ctx.lineTo(X,py+ph); ctx.stroke();
          ctx.textAlign='center'; if(!(i===nx && (px+pw) > w-26*FS)) ctx.fillText(fmtTick(t),X,py+ph+13*FS); }  // skip last tick only if it would clip the edge
        for(let j=0;j<=ny;j++){ const t=o.y[0]+(o.y[1]-o.y[0])*j/ny, Y=sy(t);
          ctx.beginPath(); ctx.moveTo(px,Y); ctx.lineTo(px+pw,Y); ctx.stroke();
          ctx.textAlign='right'; ctx.fillText(fmtTick(t),px-6*FS,Y+3.2*FS); }
        ctx.fillStyle=TH.dim;
        if(o.xlabel){ ctx.textAlign='center'; ctx.fillText(o.xlabel, px+pw/2, py+ph+31*FS); }            // own line below the ticks (no overlap)
        if(o.ylabel){ ctx.save(); ctx.translate(px-37*FS,py+ph/2); ctx.rotate(-Math.PI/2); ctx.textAlign='center'; ctx.fillText(o.ylabel,0,0); ctx.restore(); }
        if(o.title){ ctx.textAlign='left'; ctx.font=SANS(11,'600'); let tt=String(o.title); const tmax=w-px-6*FS;   // single-line title, ellipsised so it never clips the canvas edge
          if(ctx.measureText(tt).width>tmax){ while(tt.length>1&&ctx.measureText(tt+'…').width>tmax) tt=tt.slice(0,-1); tt+='…'; } ctx.fillText(tt,px,py-10*FS); }
        return g; },
      X:v=>sx(v), Y:v=>sy(v), frameRect:()=>fr,
      clip(){ ctx.save(); ctx.beginPath(); ctx.rect(fr.px,fr.py,fr.pw,fr.ph); ctx.clip(); return g; },
      unclip(){ ctx.restore(); return g; },
      line(pts,o={}){ if(!pts||pts.length<2)return g; ctx.strokeStyle=o.color||TH.accent; ctx.lineWidth=o.width||1.8;
        if(o.dash)ctx.setLineDash(o.dash); ctx.beginPath(); let pen=false;       // non-finite points break the path into segments (a NaN never blanks the whole curve)
        for(let i=0;i<pts.length;i++){ const a=pts[i][0],b=pts[i][1]; if(!isFinite(a)||!isFinite(b)){ pen=false; continue; } const X=sx(a),Y=sy(b); if(pen)ctx.lineTo(X,Y); else { ctx.moveTo(X,Y); pen=true; } }
        ctx.stroke(); ctx.setLineDash([]); return g; },
      band(pts,o={}){ pts=pts&&pts.filter(p=>isFinite(p[0])&&isFinite(p[1])); if(!pts||pts.length<2)return g; const base=o.base!==undefined?o.base:fr.y[0];
        ctx.fillStyle=o.color||'rgba(74,122,147,.16)'; ctx.beginPath(); ctx.moveTo(sx(pts[0][0]),sy(base));
        for(const p of pts) ctx.lineTo(sx(p[0]),sy(p[1])); ctx.lineTo(sx(pts[pts.length-1][0]),sy(base)); ctx.closePath(); ctx.fill(); return g; },
      points(pts,o={}){ ctx.fillStyle=o.color||TH.accent; const r=o.r||2.6; for(const p of pts){ if(!isFinite(p[0])||!isFinite(p[1]))continue; ctx.beginPath(); ctx.arc(sx(p[0]),sy(p[1]),r,0,7); ctx.fill(); } return g; },
      marker(x,y,o={}){ const X=sx(x),Y=sy(y); ctx.fillStyle=o.color||TH.ink; ctx.strokeStyle=o.stroke||'#fff'; ctx.lineWidth=1.4;
        ctx.beginPath(); ctx.arc(X,Y,o.r||4,0,7); ctx.fill(); if(o.stroke)ctx.stroke();
        if(o.label){ ctx.fillStyle=o.color||TH.ink; ctx.font=MONO(10); ctx.textAlign='center'; ctx.fillText(o.label,X,Y-7*FS); } return g; },
      // arrow in DATA coords (x0,y0)→(x1,y1) with a head + optional centred label — for step-decomposition / waterfall views
      arrow(x0,y0,x1,y1,o={}){ const X0=sx(x0),Y0=sy(y0),X1=sx(x1),Y1=sy(y1); ctx.strokeStyle=o.color||TH.ink; ctx.fillStyle=o.color||TH.ink; ctx.lineWidth=o.width||2;
        ctx.beginPath(); ctx.moveTo(X0,Y0); ctx.lineTo(X1,Y1); ctx.stroke();
        const a=Math.atan2(Y1-Y0,X1-X0), hd=(o.head||6)*FS, dist=Math.hypot(X1-X0,Y1-Y0);
        if(dist>1){ ctx.beginPath(); ctx.moveTo(X1,Y1); ctx.lineTo(X1-hd*Math.cos(a-0.42),Y1-hd*Math.sin(a-0.42)); ctx.lineTo(X1-hd*Math.cos(a+0.42),Y1-hd*Math.sin(a+0.42)); ctx.closePath(); ctx.fill(); }
        if(o.label){ ctx.font=MONO(9.5); ctx.textAlign='center'; ctx.fillText(o.label,(X0+X1)/2,Math.min(Y0,Y1)-5*FS); } return g; },
      vline(x,o={}){ ctx.strokeStyle=o.color||TH.dim; ctx.lineWidth=o.width||1.2; if(o.dash!==null)ctx.setLineDash(o.dash||[4,3]);
        ctx.beginPath(); ctx.moveTo(sx(x),fr.py); ctx.lineTo(sx(x),fr.py+fr.ph); ctx.stroke(); ctx.setLineDash([]);
        if(o.label){ ctx.fillStyle=o.color||TH.dim; ctx.font=MONO(10); ctx.textAlign='center'; ctx.fillText(o.label,sx(x),fr.py-3*FS); } return g; },
      hline(y,o={}){ ctx.strokeStyle=o.color||TH.dim; ctx.lineWidth=o.width||1.2; if(o.dash!==null)ctx.setLineDash(o.dash||[4,3]);
        ctx.beginPath(); ctx.moveTo(fr.px,sy(y)); ctx.lineTo(fr.px+fr.pw,sy(y)); ctx.stroke(); ctx.setLineDash([]);
        if(o.label){ ctx.fillStyle=o.color||TH.dim; ctx.font=MONO(10); ctx.textAlign='left'; ctx.fillText(o.label,fr.px+4*FS,sy(y)-3.5*FS); } return g; },
      bars(hist,o={}){ const dir=o.dir||'up', baseY=o.baseY!==undefined?o.baseY:0, col=o.color||TH.accent, mx=o.max||Math.max(1,...hist.counts);
        ctx.fillStyle=col; const yb=sy(baseY); for(let i=0;i<hist.counts.length;i++){ const x0=sx(hist.edges[i]), x1=sx(hist.edges[i]+hist.binW), hpx=(hist.counts[i]/mx)*(o.height||(dir==='up'?(yb-fr.py):(fr.py+fr.ph-yb)))*0.96;
        if(hpx<=0)continue; const wpx=Math.max(1,x1-x0-0.7); if(dir==='up') ctx.fillRect(x0+0.35,yb-hpx,wpx,hpx); else ctx.fillRect(x0+0.35,yb,wpx,hpx); } return g; },
      heat(nx,ny,val,cmap,opt={}){ const off=document.createElement('canvas'); off.width=nx; off.height=ny; const oc=off.getContext('2d'), img=oc.createImageData(nx,ny);
        for(let i=0;i<nx;i++)for(let j=0;j<ny;j++){ const c=cmap(val(i,j)), o=((ny-1-j)*nx+i)*4; img.data[o]=c[0];img.data[o+1]=c[1];img.data[o+2]=c[2];img.data[o+3]=255; }
        oc.putImageData(img,0,0); ctx.imageSmoothingEnabled=opt.smooth!==false; ctx.drawImage(off,fr.px,fr.py,fr.pw,fr.ph); ctx.imageSmoothingEnabled=true; return g; },   // smooth:false for discrete/tiled maps (no cell bleed)
      // like heat() but into an arbitrary PIXEL sub-rect {x,y,w,h} (defaults to the frame) — for layer/channel/RF maps, small multiples, architecture views
      image(nx,ny,val,cmap,o={}){ const off=document.createElement('canvas'); off.width=nx; off.height=ny; const oc=off.getContext('2d'), im=oc.createImageData(nx,ny);
        for(let i=0;i<nx;i++)for(let j=0;j<ny;j++){ const c=cmap(val(i,j)), q=((ny-1-j)*nx+i)*4; im.data[q]=c[0];im.data[q+1]=c[1];im.data[q+2]=c[2];im.data[q+3]=255; }
        oc.putImageData(im,0,0); ctx.imageSmoothingEnabled=o.smooth!==false; ctx.drawImage(off, o.x!=null?o.x:fr.px, o.y!=null?o.y:fr.py, o.w!=null?o.w:fr.pw, o.h!=null?o.h:fr.ph); ctx.imageSmoothingEnabled=true; return g; },
      // node-link diagram for graphs / DAGs / connectomes. nodes:[{x,y in 0..1 of the canvas, label, color?, fill?}], edges:[{from,to (indices), label?, color?, dash?, inhib?}]
      graph(nodes, edges, o={}){ const nr=o.r||16*FS, P=nd=>[nd.x*w, nd.y*h], okN=nd=>nd&&isFinite(nd.x)&&isFinite(nd.y); nodes=nodes||[];
        for(const e of (edges||[])){ const na=nodes[e.from], nb=nodes[e.to]; if(!okN(na)||!okN(nb)||e.from===e.to) continue;   // skip dangling edges, non-finite coords, self-loops
          const [x0,y0]=P(na), [x1,y1]=P(nb), a=Math.atan2(y1-y0,x1-x0), c=Math.cos(a), s=Math.sin(a);
          const X0=x0+nr*c, Y0=y0+nr*s, X1=x1-nr*c, Y1=y1-nr*s; ctx.strokeStyle=e.color||TH.dim; ctx.fillStyle=e.color||TH.dim; ctx.lineWidth=e.width||2;
          if(e.dash) ctx.setLineDash(e.dash); ctx.beginPath(); ctx.moveTo(X0,Y0); ctx.lineTo(X1,Y1); ctx.stroke(); ctx.setLineDash([]); const hd=8*FS;
          if(e.inhib){ ctx.lineWidth=2.4; ctx.beginPath(); ctx.moveTo(X1-hd*0.5*s, Y1+hd*0.5*c); ctx.lineTo(X1+hd*0.5*s, Y1-hd*0.5*c); ctx.stroke(); }   // T-bar = inhibitory
          else { ctx.beginPath(); ctx.moveTo(X1,Y1); ctx.lineTo(X1-hd*Math.cos(a-0.42),Y1-hd*Math.sin(a-0.42)); ctx.lineTo(X1-hd*Math.cos(a+0.42),Y1-hd*Math.sin(a+0.42)); ctx.closePath(); ctx.fill(); }
          if(e.label!=null){ ctx.fillStyle=e.color||TH.dim; ctx.font=MONO(10); ctx.textAlign='center'; ctx.fillText(String(e.label), (X0+X1)/2, (Y0+Y1)/2 - 5*FS); } }
        for(const nd of nodes){ if(!okN(nd)) continue; const [x,y]=P(nd); ctx.fillStyle=nd.fill||'#fff'; ctx.strokeStyle=nd.color||TH.accent; ctx.lineWidth=2.2; ctx.beginPath(); ctx.arc(x,y,nr,0,7); ctx.fill(); ctx.stroke();
          ctx.fillStyle=TH.ink; ctx.font=SANS(12,'600'); ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(nd.label||'', x, y); ctx.textBaseline='alphabetic'; }
        return g; },
      raster(rows,o={}){ const col=o.color||TH.ink, n=rows.length, lane=fr.ph/Math.max(1,n);
        ctx.strokeStyle=col; ctx.lineWidth=o.width||1; for(let r=0;r<n;r++){ const y0=fr.py+r*lane+lane*0.15, y1=fr.py+(r+1)*lane-lane*0.15; for(const x of rows[r]){ const X=sx(x); ctx.beginPath(); ctx.moveTo(X,y0); ctx.lineTo(X,y1); ctx.stroke(); } } return g; },
      text(x,y,str,o={}){ ctx.fillStyle=o.color||TH.dim; ctx.font=o.font||MONO(o.size||10); ctx.textAlign=o.align||'left'; ctx.fillText(str,sx(x),sy(y)); return g; },
      // legend with a translucent panel behind it, so it stays readable over the data
      legend(items,o={}){ ctx.font=MONO(10); const sw=8*FS, pad=6*FS;
        let lh=14*FS; const maxH=(fr?fr.ph:h)*0.94; if(items.length*lh+pad>maxH) lh=Math.max(9, (maxH-pad)/items.length);  // clamp so a big-font legend can't exceed the frame
        let maxw=0; for(const it of items) maxw=Math.max(maxw, ctx.measureText(it.label).width);
        const boxW=maxw+sw+pad*2+6*FS, boxH=items.length*lh+pad;
        let x0, y0; const mrg=6*FS;            // o.corner:'tl'|'tr'|'bl'|'br' anchors the box to a frame corner (place it away from the data)
        if(o.corner){ x0 = o.corner[1]==='l' ? fr.px+mrg : fr.px+fr.pw-boxW-mrg; y0 = o.corner[0]==='b' ? fr.py+fr.ph-boxH-mrg : fr.py+mrg; }
        else { const xR=(o.x!==undefined?o.x:fr.px+fr.pw-6*FS); x0=xR-boxW; y0=(o.y!==undefined?o.y:fr.py+6*FS); }
        ctx.fillStyle='rgba(255,255,255,.82)'; roundRect(ctx,x0,y0,boxW,boxH,6*FS); ctx.fill();
        ctx.strokeStyle=TH.edge; ctx.lineWidth=1; ctx.stroke();
        let yy=y0+pad+lh*0.5; ctx.textBaseline='middle';
        for(const it of items){ ctx.fillStyle=it.color; ctx.fillRect(x0+pad, yy-sw/2, sw, sw); ctx.fillStyle=TH.dim; ctx.textAlign='left'; ctx.fillText(it.label, x0+pad+sw+5*FS, yy); yy+=lh; }
        ctx.textBaseline='alphabetic'; return g; },
      note(str){ ctx.fillStyle=TH.faint; ctx.font=MONO(11); ctx.textAlign='center'; ctx.fillText(str, w/2, h/2); return g; },
      // vertical colour scale for a heatmap. cmap(value)→[r,g,b] (same fn the heat() used).
      // o:{x,y,w,h} pixel rect (defaults to a strip just right of the current frame), label, ticks:[{v,label}].
      colorbar(vmin,vmax,cmap,o={}){ const bw=o.w||10*FS, gap=8*FS, lgap=4*FS;
        ctx.font=MONO(9); const ticks=o.ticks||[{v:vmin},{v:vmax}]; let maxW=0;
        for(const tk of ticks) maxW=Math.max(maxW, ctx.measureText((tk.label!=null?tk.label:Math.round(tk.v)).toString()).width);
        let x=o.x!==undefined?o.x:(fr?fr.px+fr.pw+gap:w-bw-30*FS);
        x=Math.min(x, w-2-bw-lgap-maxW);   // clamp so the bar AND its right-side labels stay inside the canvas (no clipping, no overlap onto the heatmap)
        const y=o.y!==undefined?o.y:(fr?fr.py:10), bh=o.h!==undefined?o.h:(fr?fr.ph:h-20), steps=o.steps||64;
        for(let s=0;s<steps;s++){ const v=vmin+(vmax-vmin)*(s/(steps-1)), c=cmap(v);
          ctx.fillStyle=`rgb(${c[0]|0},${c[1]|0},${c[2]|0})`; ctx.fillRect(x, y+bh*(1-(s+1)/steps), bw, bh/steps+1); }
        ctx.strokeStyle=TH.edge; ctx.lineWidth=1; ctx.strokeRect(x,y,bw,bh);
        ctx.fillStyle=TH.dim; ctx.font=MONO(9); ctx.textBaseline='middle'; ctx.textAlign='left';   // labels always to the RIGHT of the bar
        for(const tk of ticks){ const yy=y+bh*(1-(tk.v-vmin)/((vmax-vmin)||1));
          ctx.fillText((tk.label!=null?tk.label:Math.round(tk.v)).toString(), x+bw+lgap, yy); }
        ctx.textBaseline='alphabetic'; if(o.label){ ctx.textAlign='right'; ctx.fillText(o.label, w-2, y-5*FS); }   // top axis label right-aligned to the canvas edge
        return g; },
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
          ctx.font=SANS(9,'600'); ctx.textAlign='left'; ctx.fillStyle=cur?'rgba(255,255,255,.85)':TH.faint; ctx.fillText(String(i+1),x+6,top+9);
          ctx.font=SANS(10.5,'600'); ctx.textAlign='center'; ctx.fillStyle=cur?'#fff':(done?TH.accent:TH.dim);
          const lines=wrap2(stages[i].name,bw-12), lh=12*FS, y0=top+bh/2-(lines.length-1)*lh/2; lines.forEach((ln,li)=>ctx.fillText(ln,x+bw/2,y0+li*lh)); }
        if(hasCap && active!=null && stages[active] && stages[active].about){ ctx.textBaseline='top'; ctx.textAlign='center';
          ctx.font=SANS(11); ctx.fillStyle=TH.dim;
          const maxw=w-2*pad, words=String(stages[active].about).split(/\s+/), L=[]; let line='';
          for(const wd of words){ const t=line?line+' '+wd:wd; if(ctx.measureText(t).width>maxw&&line){ L.push(line); line=wd; if(L.length===3)break; } else line=t; }
          if(line&&L.length<3) L.push(line); let cy=top+bh+13; for(const ln of L){ ctx.fillText(ln,w/2,cy); cy+=15*FS; } }
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
