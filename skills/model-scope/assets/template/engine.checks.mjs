/* =============================================================================
 * engine.checks.mjs — the analytic checks for YOUR models (the ones in engine.js).
 *
 * validate.mjs imports this file because index.html loads engine.js. The default export
 * is a table keyed by model id; each entry runs when that model is registered. A model
 * without a check is a counted warning, not a failure, because a vacuous check written
 * to silence the gate is worse than none.
 *
 * A check ties the model to its science: a closed form, a conservation law, a limit, or
 * an independent re-computation of the same quantity. The toolkit `t`:
 *   t.sim(id, overrides, seed)   run simulate() at defaults + overrides (batch:false)
 *   t.def(id)                    the default parameters
 *   t.ok(condition, text)        record one PASS / FAIL line
 *   t.rel(a, b)                  relative difference |a−b| / |b|
 *   t.SIM, t.Plot, t.L           the engine, the plot helper, MSLIB (modules/mslib.js)
 *
 * Example, for the skeleton model in engine.js (response = 1 − exp(−gain·x)):
 *
 *   mymodel(t) {
 *     const p = t.def('mymodel'), d = t.sim('mymodel', {}, 'check');
 *     const worst = Math.max(...d.curve.map(([x, y]) => Math.abs(y - (1 - Math.exp(-p.gain * x)))));
 *     t.ok(worst < 1e-12, 'the curve equals 1 − exp(−gain·x)');
 *     const flat = t.sim('mymodel', { gain: 0 }, 'check');
 *     t.ok(flat.curve.every(q => q[1] === 0), 'gain 0 gives no response');
 *   },
 *
 * See examples.checks.mjs for twenty-one worked checks.
 * ========================================================================== */
export default {
};
