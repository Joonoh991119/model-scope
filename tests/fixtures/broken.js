/* Test fixture (dev only): a model whose simulate() throws when its toggle is on, and returns nothing
   when its enum says so. The smoke test loads it next to a temp copy of the template to check that the
   toolbox says what failed where the plots would be, and recovers when the control goes back. */
(function (global) {
  'use strict';
  const SIM = global.SIM;
  const broken = {
    id: 'broken', name: 'Broken (fixture)', blurb: 'throws on demand', note: 'test fixture',
    params: [{ name: 'boom', label: 'Throw in simulate', type: 'bool', default: false },
             { name: 'mode', label: 'Return', type: 'enum', options: ['data', 'nothing'], default: 0 }],
    simulate: p => { if (p.boom) throw new Error('boom from the fixture'); if (p.mode === 1) return undefined; return { pts: [[0, 0], [1, 1]] }; },
    views: [{ title: 'a line', draw: (g, d) => { g.frame({ x: [0, 1], y: [0, 1], xlabel: 'x', ylabel: 'y' }); g.line(d.pts); } }],
  };
  if (typeof SIM.register === 'function') SIM.register({ broken }, ['broken']);
  else { SIM.MODELS.broken = broken; if (!SIM.MODEL_ORDER.includes('broken')) SIM.MODEL_ORDER.push('broken'); }
})(typeof window !== 'undefined' ? window : globalThis);
