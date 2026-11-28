(function (global) {
  'use strict';
  const SIM = global.SIM, TOTAL = 240;
  const heavy = {
    id: 'heavy', name: 'Heavy (fixture)', blurb: 'fills in through runChunks', note: 'test fixture',
    params: [{ name: 'n', label: 'Work per item', min: 1, max: 9, step: 1, default: 3, int: true },
      { name: 'fail', label: 'Throw at item 100', type: 'bool', default: false }],
    simulate: (p, env) => {
      const d = { acc: 0, done: 0, total: TOTAL, loading: true };
      if (typeof window !== 'undefined') window.__heavy = d;
      const doItem = k => { if (p.fail && k === 100) throw new Error('chunk boom from the fixture'); let s = 0; for (let i = 0; i < p.n * 4e5; i++) s += Math.sin(i); d.acc += s; d.done = k + 1; if (k === TOTAL - 1) d.loading = false; };
      if (env.batch === false) { for (let k = 0; k < TOTAL; k++) doItem(k); } else SIM.runChunks(TOTAL, doItem, 'heavy fixture');
      return d;
    },
    lenses: {
      a: { label: 'A', about: 'rising line once loaded', views: [{ title: 'lens A', draw: (g, d) => { g.frame({ x: [0, 1], y: [0, 1], xlabel: 'x', ylabel: 'y' }); if (d.loading) g.note('loading ' + d.done + ' / ' + d.total); else g.line([[0, 0], [1, 1]]); } }] },
      b: { label: 'B', about: 'falling line once loaded', views: [{ title: 'lens B', draw: (g, d) => { g.frame({ x: [0, 1], y: [0, 1], xlabel: 'x', ylabel: 'y' }); if (d.loading) g.note('loading ' + d.done + ' / ' + d.total); else g.line([[0, 1], [1, 0]]); } }] },
    },
  };
  if (typeof SIM.register === 'function') SIM.register({ heavy }, ['heavy']);
  else { SIM.MODELS.heavy = heavy; if (!SIM.MODEL_ORDER.includes('heavy')) SIM.MODEL_ORDER.push('heavy'); }
})(typeof window !== 'undefined' ? window : globalThis);
