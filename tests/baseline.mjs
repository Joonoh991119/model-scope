import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadTemplate, capture, compare, countCases, args, DEFAULT_TEMPLATE, SEED, CANVAS } from './lib/harness.mjs';

const A = args();
const REF = path.resolve(A.opt('--ref') || fileURLToPath(new URL('./baseline/v1.21.1.json', import.meta.url)));
const T = path.resolve(A.opt('--template') || DEFAULT_TEMPLATE);
const write = o => JSON.stringify(o, null, 1) + '\n';

if (A.flag('--list')) {
  const ref = JSON.parse(fs.readFileSync(REF, 'utf8'));
  console.log(ref.order.map(id => `${id}=${ref.simulate[id].default}`).join(' '));
  process.exit(0);
}

const out = capture(loadTemplate(T), { draw: !A.flag('--no-draw') });

if (A.opt('--capture')) {
  const file = path.resolve(A.opt('--capture'));
  if (fs.existsSync(file)) { console.error(`refusing to overwrite ${file}`); process.exit(2); }
  const src = A.opt('--source') || 'unspecified';
  fs.writeFileSync(file, write({ format: 1, source: src, captured_with: 'node ' + process.version, seed: SEED, canvas: CANVAS, ...out }));
  console.log(`wrote ${file}: ${out.order.length} models, ${countCases(out, 'simulate')} simulate cases, ${countCases(out, 'draw')} view draws`);
  process.exit(0);
}

const ref = JSON.parse(fs.readFileSync(REF, 'utf8'));

if (A.flag('--write-draw')) {
  const locked = compare(ref, out, { draw: false });
  if (locked.length) { console.error(`refusing to re-record the draw section: schema or simulate() differ from the baseline (${locked.length})\n  ` + locked.slice(0, 12).join('\n  ')); process.exit(1); }
  const before = compare(ref, out, { draw: true });
  const draw = {}; for (const id of ref.order) draw[id] = out.draw[id];
  fs.writeFileSync(REF, write({ ...ref, draw }));
  console.log(`re-recorded the draw section of ${path.relative(process.cwd(), REF)}: ${before.length} view draw(s) changed`);
  for (const d of before.slice(0, 40)) console.log('  ' + d);
  if (before.length > 40) console.log(`  ... and ${before.length - 40} more`);
  process.exit(0);
}

const diffs = compare(ref, out, { draw: !A.flag('--no-draw') });
if (diffs.length) {
  console.log(`BASELINE MISMATCH (${diffs.length})\n  ` + diffs.slice(0, 20).join('\n  ') + (diffs.length > 20 ? `\n  ... and ${diffs.length - 20} more` : ''));
  process.exit(1);
}
console.log(`baseline OK: ${ref.order.length} models identical to ${path.basename(REF)} (parameter schema, ${countCases(ref, 'simulate')} simulate cases at defaults and extremes${A.flag('--no-draw') ? '' : `, ${countCases(ref, 'draw')} view draw streams`})`);
