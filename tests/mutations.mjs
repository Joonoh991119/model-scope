// Mutation probe for the gate: copy the template, apply ONE wrong-math or broken-app edit, run the checks.
// A mutation that every layer lets through is a hole.
//
//   node tests/mutations.mjs [--template <dir>] [--pw <dir with node_modules/playwright>] [--only <id,...>] [--jobs N]
//
// Layers, in order: (1) the shipped gate `node validate.mjs`, (2) the golden baseline `tests/baseline.mjs --check`,
// (3) with --pw, the browser smoke `tests/smoke.mjs --quick` for whatever survived 1 and 2.
// The run fails if a find-string no longer matches (a stale mutation) or a threshold below is missed.
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
import { spawn } from 'node:child_process';
import { args, DEFAULT_TEMPLATE } from './lib/harness.mjs';

// Thresholds. Raise them when the gate gets stronger; never lower them to make a run pass.
export const THRESHOLDS = {
  total: 46,            // mutations in the table
  gateMin: 43,          // killed by validate.mjs alone (7 before the gate was rebuilt in v1.22.0)
  gateBaselineMin: 45,  // killed by validate.mjs or the baseline
  allWithSmoke: 46,     // with --pw: killed by any layer
};

// [id, file, find, replace, what is now wrong]
export const MUTATIONS = [
  ['bayes-weight-swapped', 'engine.js', 'w=v0/(v0+vm);', 'w=vm/(v0+vm);', 'reliability weight inverted (trusts the noisier source)'],
  ['bayes-sigPost', 'engine.js', 'const sigPost=Math.sqrt(1/(1/vm+1/v0));', 'const sigPost=Math.sqrt(vm+v0);', 'posterior SD = sqrt(sum of variances)'],
  ['ddm-drift-10pct', 'engine.js', 'while(st<ms){ x+=p.A*p.dt+p.c*Math.sqrt(p.dt)*gaussian(rng); t+=p.dt; st++; if(x>=p.z){o=1;break;}', 'while(st<ms){ x+=0.9*p.A*p.dt+p.c*Math.sqrt(p.dt)*gaussian(rng); t+=p.dt; st++; if(x>=p.z){o=1;break;}', 'drift 10% too small'],
  ['ddm-rt-wrong', 'engine.js', 'out[k]=o; rt[k]=t; }', 'out[k]=o; rt[k]=2*t; }', 'every RT doubled'],
  ['lif-no-leak', 'modules/mslib.js', 's.v += dt/p.tau*(-(s.v-p.EL) + p.R*I);', 's.v += dt/p.tau*(p.R*I);', 'LIF without the leak term (perfect integrator)'],
  ['lif-R-half', 'modules/mslib.js', "LIF_DEFAULT = { tau:0.02, EL:-65, R:100,", "LIF_DEFAULT = { tau:0.02, EL:-65, R:50,", 'membrane resistance halved'],
  ['rw-half-rate', 'modules/mslib.js', 'const rescorlaWagner = (V, r, alpha) => V + alpha*(r - V);', 'const rescorlaWagner = (V, r, alpha) => V + 0.5*alpha*(r - V);', 'learning rate silently halved'],
  ['compare-dt-no-tanh', 'engine.js', '(z/A)*Math.tanh(A*z/cc2);', '(z/A);', 'DDM mean decision time without tanh'],
  ['compare-acc1s', 'engine.js', 'accS=Phi(p.A*Math.sqrt(p.T)/p.c)', 'accS=Phi(p.A*p.T/p.c)', 'single-sample accuracy uses T not sqrt(T)'],
  ['ww-no-saturation', 'modules/mslib.js', 's.S1 += dt*(-s.S1/p.tauS + (1-s.S1)*p.gamma*r1); s.S2 += dt*(-s.S2/p.tauS + (1-s.S2)*p.gamma*r2);', 's.S1 += dt*(-s.S1/p.tauS + 0.5*p.gamma*r1); s.S2 += dt*(-s.S2/p.tauS + 0.5*p.gamma*r2);', 'Wong-Wang gating without the (1-S) saturation'],
  ['ww-noise-scale', 'modules/mslib.js', 'sN=p.sigma*sqrt(2/p.tauN)', 'sN=p.sigma*sqrt(1/p.tauN)', 'Wong-Wang noise amplitude off by sqrt(2)'],
  ['ww-gamma', 'modules/mslib.js', 'gamma:0.641,', 'gamma:0.5,', 'Wong-Wang gamma constant wrong'],
  ['sir-antidiffusion', 'engine.js', 'Itil=I[x]+p.D*(I[xl]+I[xr]-2*I[x])', 'Itil=I[x]-p.D*(I[xl]+I[xr]-2*I[x])', 'spatial coupling has the wrong sign'],
  ['sir-no-recovery-R', 'engine.js', 'nR[x]=R[x]+dt*rec;', 'nR[x]=R[x];', 'recovered compartment never fills (S+I+R not conserved)'],
  ['efficient-unwarped-like', 'modules/mslib.js', 'const z=(F[i]-mt)/sigma; L[i]=exp(-0.5*z*z);', 'const z=(xs[i]-mt)/sigma; L[i]=exp(-0.5*z*z);', 'likelihood ignores the efficient encoding'],
  ['efficient-disc-inverted', 'modules/mslib.js', 'd[i]= prior[i]>1e-9 ? 1/prior[i] : Infinity;', 'd[i]= prior[i]>1e-9 ? prior[i] : Infinity;', 'discrimination threshold proportional to p instead of 1/p'],
  ['causal-prior-swapped', 'modules/mslib.js', 'c=ciLikCommon(xv,xa,sv,sa,sp,mup)*pc, s=ciLikSeparate(xv,xa,sv,sa,sp,mup)*(1-pc);', 'c=ciLikCommon(xv,xa,sv,sa,sp,mup)*(1-pc), s=ciLikSeparate(xv,xa,sv,sa,sp,mup)*pc;', 'p_common and 1-p_common swapped'],
  ['causal-fused-no-prior', 'modules/mslib.js', 'return (xv*wv+xa*wa+mup*wp)/(wv+wa+wp); };', 'return (xv*wv+xa*wa)/(wv+wa); };', 'fused estimate ignores the spatial prior'],
  ['wm-mixpdf-guess', 'modules/mslib.js', 'let p=pT*vmPdf(err,0,kappa)+pGuess*(1/TWO_PI);', 'let p=pT*vmPdf(err,0,kappa)+pGuess*(1/PI);', 'guess floor doubled (mixture no longer integrates to 1)'],
  ['wm-kappaToSD', 'modules/mslib.js', 'return sqrt(-2*Math.log(R)); };', 'return sqrt(-Math.log(R)); };', 'circular SD off by sqrt(2)'],
  ['hopfield-energy-sign', 'modules/mslib.js', 'E -= 0.5*W[i*N+j]*s[i]*s[j]; return E; };', 'E += 0.5*W[i*N+j]*s[i]*s[j]; return E; };', 'Lyapunov energy has the wrong sign (rises during recall)'],
  ['hopfield-diag', 'modules/mslib.js', '{ if(i!==j) W[i*N+j] += p[i]*p[j]; }', '{ W[i*N+j] += p[i]*p[j]; }', 'self-connections not zeroed'],
  ['kuramoto-Kc', 'engine.js', 'const Kc=p.spread*Math.sqrt(8/Math.PI)', 'const Kc=p.spread*Math.sqrt(2/Math.PI)', 'critical coupling formula off by 2x'],
  ['kuramoto-no-r', 'modules/mslib.js', 'const d = omega[i] + K*r*Math.sin(psi - phases[i]);', 'const d = omega[i] + K*Math.sin(psi - phases[i]);', 'mean-field coupling drops the order parameter r'],
  ['belief-kernel', 'engine.js', 'const dd=ringD(i,j), w=Math.exp(-0.5*(dd/volK)*(dd/volK)); row[j]=w; z+=w;', 'const dd=ringD(i,j), w=Math.exp(-0.5*dd/volK); row[j]=w; z+=w;', 'transition kernel exponential instead of Gaussian'],
  ['belief-no-predict', 'engine.js', 'b=BF.predict(b, T); b=BF.update(b, Array.from(obsPmf(y,onS)));', 'b=BF.update(b, Array.from(obsPmf(y,onS)));', 'filter skips the predict step'],
  ['ring-kernel-width', 'modules/mslib.js', 'W[i*N+j] = Jpos*exp(-d*d/(2*sigma*sigma)) - Jneg;', 'W[i*N+j] = Jpos*exp(-d*d/(sigma*sigma)) - Jneg;', 'Mexican-hat width off by sqrt(2)'],
  ['retina-complex-even-only', 'engine.js', 'complex[t]=ev[t]*ev[t]+od[t]*od[t];', 'complex[t]=ev[t]*ev[t];', 'complex cell = even filter only (not phase invariant)'],
  ['vision-energy-even-only', 'engine.js', 'const e=ev[t]*ev[t]+od[t]*od[t]; en[t]=e;', 'const e=ev[t]*ev[t]; en[t]=e;', 'energy model drops the quadrature partner'],
  ['causalg-sweep', 'engine.js', 'sweep.push([c, (c*c)/(c*c + sig*sig)]);', 'sweep.push([c, c/(c + sig)]);', 'analytic confounding bias formula wrong'],
  ['causalg-do-keeps-backdoor', 'engine.js', 'const x=-3+6*rng(), U=g(), M=wXM*x+sig*g()', 'const U=g(), x=wUX*U+sig*g(), M=wXM*x+sig*g()', 'do(X) does not cut U->X (intervention = observation)'],
  ['attention-abs', 'engine.js', 'const score=(i,j,temp)=>(-contentW*(type[i]-type[j])*(type[i]-type[j]) - p.posBias*Math.abs(i-j))/temp;', 'const score=(i,j,temp)=>(-contentW*Math.abs(type[i]-type[j]) - p.posBias*(i-j)*(i-j))/temp;', 'score uses |type| and squared distance (not the stated equation)'],
  ['attention-out-unweighted', 'engine.js', 'let o=0; for(let j=0;j<N;j++) o+=row[j]*value[j]; out.push(o);', 'let o=0; for(let j=0;j<N;j++) o+=value[j]/N; out.push(o);', 'output ignores the attention weights'],
  ['pomdp-no-continuation', 'engine.js', 'QOL:(1-b)*rSafe+b*rTiger+gamma*Vat(V,0.5), QOR:b*rSafe+(1-b)*rTiger+gamma*Vat(V,0.5) }; };', 'QOL:(1-b)*rSafe+b*rTiger, QOR:b*rSafe+(1-b)*rTiger }; };', 'opening a door has no continuation value'],
  ['pomdp-bayes-wrong', 'engine.js', 'b = hearTL ? b*a/pHL : b*(1-a)/(1-pHL); traj.push(b); }', 'b = hearTL ? b+0.1*(1-b) : b-0.1*b; traj.push(b); }', 'episode belief update is not Bayes'],
  ['wilson-wII-sign', 'modules/mslib.js', 'dI=(-s.I + S(p.wIE*s.E - p.wII*s.I + p.Q))/p.tauI;', 'dI=(-s.I + S(p.wIE*s.E + p.wII*s.I + p.Q))/p.tauI;', 'I self-inhibition has the wrong sign'],
  ['wilson-tau', 'engine.js', 'theta:4, k:1, tauE:1, tauI:2}', 'theta:4, k:1, tauE:1, tauI:1.5}', 'inhibitory time constant changed'],
  ['mha-no-average', 'engine.js', 'nv[i]=s/H; }', 'nv[i]=s; }', 'heads summed, not averaged (values blow up with depth)'],
  ['npdf-norm', 'engine.js', 'const npdf = (x,mu,s)=>Math.exp(-0.5*((x-mu)/s)*((x-mu)/s))/(s*Math.sqrt(2*Math.PI));', 'const npdf = (x,mu,s)=>Math.exp(-0.5*((x-mu)/s)*((x-mu)/s))/(s*Math.sqrt(Math.PI));', 'normal pdf does not integrate to 1'],
  ['gaussian-var', 'engine.js', 'return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*rng()); }', 'return Math.sqrt(-1.6*Math.log(u))*Math.cos(2*Math.PI*rng()); }', 'gaussian() has variance 0.8 (every noise source 10% too quiet)'],
  ['rng-const-default', 'engine.js', "{name:'sigma_m', label:'Sensory noise σ_m', min:0.1, max:2.5, step:0.01, default:0.9},", "{name:'sigma_m', label:'Sensory noise σ_m', min:0.1, max:2.5, step:0.01, default:1.9},", 'a shipped default silently changed'],
  ['param-renamed', 'engine.js', "{name:'cueFlip', label:'Cue corruption (fraction flipped)', min:0, max:0.5, step:0.01, default:0.18},", "{name:'cueFlip', label:'Cue corruption (fraction flipped)', min:0, max:0.9, step:0.01, default:0.18},", 'a slider range silently changed'],
  ['plotjs-histify-offbyone', 'plot.js', 'const k=Math.floor((v-lo)/bw); if(k>=0&&k<n) counts[k]++; } // drop', 'const k=Math.floor((v-lo)/bw)+1; if(k>=0&&k<n) counts[k]++; } // drop', 'the real histogram helper bins one bin to the right'],
  ['plotjs-syntax-error', 'plot.js', "global.Plot = { make, setup, TH, histify };", "global.Plot = { make, setup, TH, histify ;", 'plot.js does not even parse'],
  ['indexhtml-broken', 'index.html', "buildModelTabs(); setModel(S.modelId);", "buildModelTabs(); setModel(S.modelIdd.x);", 'the toolbox throws on load'],
  ['view-blank', 'engine.js', "g.line(d.fI,{color:T.accent,width:2}); g.points(d.fI,{color:T.accent,r:2.4}); g.vline(d.I,{color:T.pos,dash:[5,4],label:'current I'});", "", 'the f-I view draws axes but no data'],
];
const A = args();
const SRC = path.resolve(A.opt('--template') || DEFAULT_TEMPLATE);
const PW = A.opt('--pw') ? path.resolve(A.opt('--pw')) : null;
const ONLY = A.opt('--only') ? A.opt('--only').split(',') : null;
const JOBS = Math.max(1, +(A.opt('--jobs') || Math.min(8, os.availableParallelism ? os.availableParallelism() : 4)));
const HERE = path.dirname(new URL(import.meta.url).pathname);
const strip = s => s.replace(/\x1b\[[0-9;]*m/g, '');
const run = (cmd, argv, opts) => new Promise(res => { const c = spawn(cmd, argv, { ...opts, stdio: ['ignore', 'pipe', 'pipe'] }); let out = '', err = '';
  c.stdout.on('data', d => out += d); c.stderr.on('data', d => err += d);
  const t = setTimeout(() => c.kill('SIGKILL'), 300000); c.on('close', code => { clearTimeout(t); res({ status: code, out, err }); }); });

async function probe([id, file, find, repl, what]) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ms-mut-'));
  try {
    fs.cpSync(SRC, dir, { recursive: true });
    const fp = path.join(dir, file); const src = fs.existsSync(fp) ? fs.readFileSync(fp, 'utf8') : '';
    const n = src.split(find).length - 1;
    if (n !== 1) return { id, what, layer: 'SKIP', detail: `find matched ${n}x in ${file}` };
    fs.writeFileSync(fp, src.replace(find, () => repl));
    const g = await run('node', ['validate.mjs'], { cwd: dir });
    if (g.status !== 0) { const failed = strip(g.out).split('\n').filter(l => l.includes('FAIL')).map(l => l.trim().slice(0, 120)); const crash = strip(g.err).split('\n').find(l => /Error/.test(l));
      return { id, what, layer: 'gate', detail: failed[0] || (crash ? 'threw: ' + crash.trim().slice(0, 110) : `exit ${g.status}`) }; }
    const b = await run('node', [path.join(HERE, 'baseline.mjs'), '--check', '--template', dir], {});
    if (b.status !== 0) return { id, what, layer: 'baseline', detail: (strip(b.out).split('\n')[1] || strip(b.err).split('\n').find(l => /Error/.test(l)) || '').trim().slice(0, 120) };
    if (PW) { const s = await run('node', [path.join(HERE, 'smoke.mjs'), '--quick', '--pw', PW, '--template', dir], {});
      if (s.status !== 0) return { id, what, layer: 'smoke', detail: (strip(s.out).split('\n').find(l => /FAIL/.test(l)) || '').trim().slice(0, 120) }; }
    return { id, what, layer: 'SURVIVED', detail: '' };
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

const list = MUTATIONS.filter(m => !ONLY || ONLY.includes(m[0]));
const rows = new Array(list.length); let next = 0;
await Promise.all(Array.from({ length: JOBS }, async () => { while (next < list.length) { const i = next++; rows[i] = await probe(list[i]); } }));

const count = l => rows.filter(r => r.layer === l).length;
const label = { gate: 'killed by the gate', baseline: 'killed by the baseline', smoke: 'killed by the smoke', SURVIVED: 'SURVIVED', SKIP: 'SKIPPED' };
for (const r of rows) console.log(`${label[r.layer].padEnd(23)} ${r.id.padEnd(28)} ${r.what}${r.detail ? '\n' + ' '.repeat(25) + '-> ' + r.detail : ''}`);
const gate = count('gate'), base = count('baseline'), smoke = count('smoke'), surv = count('SURVIVED'), skip = count('SKIP');
console.log(`\n${rows.length} mutations: ${gate} killed by validate.mjs, ${base} more by the baseline${PW ? `, ${smoke} more by the browser smoke` : ''}, ${surv} survived, ${skip} skipped`);

let bad = 0; const need = (ok, msg) => { if (!ok) { bad++; console.log('FAIL ' + msg); } };
need(skip === 0, `${skip} mutation(s) no longer match the source — update the table`);
if (!ONLY) {
  need(rows.length === THRESHOLDS.total, `expected ${THRESHOLDS.total} mutations, ran ${rows.length}`);
  need(gate >= THRESHOLDS.gateMin, `the gate alone must kill at least ${THRESHOLDS.gateMin} (killed ${gate})`);
  need(gate + base >= THRESHOLDS.gateBaselineMin, `gate + baseline must kill at least ${THRESHOLDS.gateBaselineMin} (killed ${gate + base})`);
  if (PW) need(gate + base + smoke >= THRESHOLDS.allWithSmoke, `gate + baseline + smoke must kill all ${THRESHOLDS.allWithSmoke} (killed ${gate + base + smoke})`);
}
process.exit(bad ? 1 : 0);
