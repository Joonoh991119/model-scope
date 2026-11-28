import fs from 'node:fs'; import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { args, DEFAULT_TEMPLATE } from './lib/harness.mjs';

const A = args();
const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, '..');
const PW = path.resolve(A.opt('--pw') || process.env.CCN_SIM_PW || path.join(ROOT, '.scratch', 'pw'));
const skip = new Set((A.opt('--skip') || '').split(',').filter(Boolean));
const node = (file, ...rest) => ['node', [path.join(HERE, file), ...rest], { cwd: ROOT }];

const steps = [
  ['gate', 'node validate.mjs (the shipped gate)', ['node', ['validate.mjs'], { cwd: DEFAULT_TEMPLATE }]],
  ['baseline', 'golden baseline of the 21 examples', node('baseline.mjs', '--check')],
  ['mutations', A.flag('--browser') ? 'mutation probe (gate + baseline + browser smoke)' : 'mutation probe (gate + baseline)', A.flag('--browser') ? node('mutations.mjs', '--pw', PW) : node('mutations.mjs')],
  ['bare', 'the template without its examples', A.flag('--browser') ? node('bare-app.mjs', '--pw', PW) : node('bare-app.mjs')],
  ['docs', 'the docs say what the code is', node('docs-check.mjs')],
];
const hasClaude = spawnSync('claude', ['--version'], { encoding: 'utf8' }).status === 0;
if (hasClaude) steps.push(['plugin', 'claude plugin validate --strict .', ['claude', ['plugin', 'validate', '--strict', '.'], { cwd: ROOT }]]);
else console.log('note: the `claude` CLI is not on PATH — skipping `claude plugin validate --strict .`');
if (A.flag('--browser')) {
  if (!fs.existsSync(path.join(PW, 'node_modules', 'playwright'))) { console.error(`--browser needs playwright under ${PW}\n  npm i --prefix ${path.relative(ROOT, PW) || '.'} playwright@1.56.1 axe-core@4.14.1`); process.exit(2); }
  steps.push(['smoke', 'browser smoke (headless Chrome, file://)', node('smoke.mjs', '--pw', PW, '--sliders', '--a11y', '--phone', '--bundle')]);
}

let failed = 0; const t0 = Date.now();
for (const [name, title, [cmd, argv, opts]] of steps) {
  if (skip.has(name)) { console.log(`\n=== ${name}: skipped`); continue; }
  console.log(`\n=== ${name}: ${title}`);
  const t = Date.now(), r = spawnSync(cmd, argv, { ...opts, encoding: 'utf8', timeout: 1200000 });
  const out = ((r.stdout || '') + (r.stderr || '')).trimEnd().split('\n');
  console.log(out.slice(-(r.status === 0 ? 4 : 30)).map(l => '  ' + l).join('\n'));
  console.log(`  -> ${r.status === 0 ? 'ok' : 'FAILED (exit ' + r.status + ')'} in ${((Date.now() - t) / 1000).toFixed(1)} s`);
  if (r.status !== 0) failed++;
}
console.log(`\n${failed ? `${failed} step(s) FAILED` : 'all steps passed'} in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
process.exit(failed ? 1 : 0);
