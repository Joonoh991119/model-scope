import fs from 'node:fs'; import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadTemplate, DEFAULT_TEMPLATE } from './lib/harness.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rel = p => path.relative(ROOT, p);
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const problems = []; let checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) problems.push(msg); };
const walk = d => fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }).flatMap(e =>
  e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const lineOf = (s, i) => s.slice(0, i).split('\n').length;

const { SIM, CCNLIB } = loadTemplate(DEFAULT_TEMPLATE);
const nModels = SIM.MODEL_ORDER.length;
const index = read('skills/ccn-sim/references/modelbook/INDEX.md');
const familyRows = [...index.matchAll(/^\| \[([\w-]+)\.md\]\(\1\.md\) \|/gm)].map(m => m[1]);
const nFamilies = familyRows.length;
for (const f of familyRows) ok(fs.existsSync(path.join(ROOT, 'skills/ccn-sim/references/modelbook', f + '.md')), `INDEX.md lists ${f}.md, which does not exist`);
const modelbookFiles = fs.readdirSync(path.join(ROOT, 'skills/ccn-sim/references/modelbook')).filter(f => f.endsWith('.md') && f !== 'INDEX.md');
ok(modelbookFiles.length === nFamilies, `modelbook has ${modelbookFiles.length} family files, INDEX.md lists ${nFamilies}`);

const VENDORED = [...walk('skills/ccn-sim').filter(f => /\.(md|json)$/.test(f)), ...walk('skills/paper-to-sim'),
  'commands/scaffold.md', 'commands/from-paper.md', 'agents/ccn-sim-builder.md'];
const DOCS = [...new Set(['README.md', 'docs/GUIDE.md', 'MIGRATION.md', '.claude-plugin/plugin.json', '.claude-plugin/marketplace.json',
  'tests/README.md', ...VENDORED])];

const WORDS = { eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, 'twenty-one': 21, 'twenty-two': 22, 'twenty-three': 23,
  'twenty-four': 24, 'twenty-five': 25 };
const NUM = `(\\d+|${Object.keys(WORDS).sort((a, b) => b.length - a.length).join('|')})`;
const val = t => /^\d+$/.test(t) ? +t : WORDS[t.toLowerCase()];
for (const f of DOCS) {
  const s = read(f);
  for (const m of s.matchAll(new RegExp(`\\b${NUM}(?:\\*\\*)?\\s+(?:(?:worked|shipped|example|bundled)\\s+)*(models|examples)\\b`, 'gi')))
    ok(val(m[1]) === nModels, `${f}:${lineOf(s, m.index)} says "${m[0]}", the registry holds ${nModels}`);
  for (const m of s.matchAll(new RegExp(`\\b${NUM}(?:\\*\\*)?\\s+(?:(?:canonical|model)\\s+)*families\\b`, 'gi')))
    ok(val(m[1]) === nFamilies, `${f}:${lineOf(s, m.index)} says "${m[0]}", INDEX.md lists ${nFamilies}`);
}
const section = (doc, name, from, to) => { const s = read(doc), i = s.indexOf(from), j = i < 0 ? -1 : s.indexOf(to, i);
  ok(i >= 0 && j > i, `${doc}: cannot find the ${name} (between "${from}" and "${to}")`); return i >= 0 && j > i ? s.slice(i, j) : ''; };
const boldRows = t => t.split('\n').filter(l => /^\| \*\*/.test(l)).map(l => l.split('|')[1].trim());
{ const rows = boldRows(section('docs/GUIDE.md', 'example table', '| Model | Domain', 'Copy one, swap in'));
  ok(rows.length === nModels, `docs/GUIDE.md example table has ${rows.length} rows, the registry holds ${nModels}`);
  ok(new Set(rows).size === rows.length, 'docs/GUIDE.md example table names a model twice'); }
{ const rows = boldRows(section('docs/GUIDE.md', 'family table', '| Family | Use it for', 'These are **recipes'));
  ok(rows.length === nFamilies, `docs/GUIDE.md family table has ${rows.length} rows, INDEX.md lists ${nFamilies}`); }
{ const items = section('README.md', 'example keyword table', '| Domain | Models |', '\n\n').split('\n').slice(2).flatMap(l => l.split('|')[2].split('·').map(x => x.trim()).filter(Boolean));
  ok(items.length === nModels, `README.md example keyword table names ${items.length} models, the registry holds ${nModels}`); }
for (const doc of ['README.md', 'docs/GUIDE.md', 'docs/BACKLOG.md', 'MIGRATION.md', 'tests/README.md', 'skills/ccn-sim/assets/template/README.md', 'skills/ccn-sim/references/modelbook/INDEX.md']) {
  const s = read(doc), base = path.dirname(path.join(ROOT, doc));
  for (const m of s.matchAll(/!?\[[^\]]*\]\(([^)\s]+)\)|<img\s+src="([^"]+)"/g)) {
    const target = (m[1] || m[2]).split('#')[0];
    if (!target || /^[a-z]+:/i.test(target)) continue;
    ok(fs.existsSync(path.join(base, target)), `${doc}:${lineOf(s, m.index)} links to ${target}, which does not exist`);
  }
}
const tReadme = read('skills/ccn-sim/assets/template/README.md');
const tList = tReadme.slice(0, tReadme.indexOf('## Files')).split('\n').filter(l => /^- \*\*/.test(l)).length;
ok(tList === nModels, `template README.md lists ${tList} examples, the registry holds ${nModels}`);

for (const f of DOCS) {
  const s = read(f);
  for (const m of s.matchAll(/\bCCNLIB\.(\w+)(?:\.(\w+))?/g)) {
    const [, block, fn] = m;
    ok(CCNLIB[block] !== undefined, `${f}:${lineOf(s, m.index)} names CCNLIB.${block}, which ccnlib.js does not export`);
    if (fn && CCNLIB[block] && typeof CCNLIB[block] === 'object')
      ok(CCNLIB[block][fn] !== undefined, `${f}:${lineOf(s, m.index)} names CCNLIB.${block}.${fn}, which ccnlib.js does not export`);
  }
}

const SKILL_FILES = ['skills/ccn-sim/SKILL.md', 'skills/paper-to-sim/SKILL.md', 'commands/scaffold.md', 'commands/from-paper.md', 'agents/ccn-sim-builder.md'];
const MS = 'skills/ccn-sim';
for (const f of SKILL_FILES) {
  const s = read(f);
  for (const m of s.matchAll(/`([^`\s]*(?:references|assets|modelbook|\$\{CLAUDE_(?:PLUGIN_ROOT|SKILL_DIR)\})[^`\s]*)`/g)) {
    let p = m[1].replace(/\/\.$/, '');
    if (/[<>*]/.test(p)) continue;
    p = p.replace('${CLAUDE_PLUGIN_ROOT}/', '').replace('${CLAUDE_SKILL_DIR}/', MS + '/');
    if (!p.startsWith('skills/')) {
      ok(f.startsWith(MS + '/'), `${f}:${lineOf(s, m.index)} names \`${m[1]}\` relative to the ccn-sim skill; from ${f} write \${CLAUDE_PLUGIN_ROOT}/${MS}/${p}`);
      p = path.join(MS, p); }
    ok(fs.existsSync(path.join(ROOT, p)), `${f}:${lineOf(s, m.index)} names \`${m[1]}\`, which does not exist (${p})`);
    ok(!m[1].includes('${CLAUDE_SKILL_DIR}') || f === 'skills/ccn-sim/SKILL.md', `${f}:${lineOf(s, m.index)} uses \${CLAUDE_SKILL_DIR} outside the ccn-sim skill`);
  }
}

for (const f of VENDORED) {
  const s = read(f);
  for (const m of s.matchAll(/ccn-sim:(?!scaffold\b|from-paper\b)/g))
    ok(false, `${f}:${lineOf(s, m.index)} has a literal "ccn-sim:" outside the two command names`);
  for (const m of s.matchAll(/skills\/ccn-sim\//g))
    ok(s.slice(Math.max(0, m.index - 22), m.index) === '${CLAUDE_PLUGIN_ROOT}/', `${f}:${lineOf(s, m.index)} has a plugin-root-relative skills/ccn-sim/ path without \${CLAUDE_PLUGIN_ROOT}`);
}

{ const sc = read('commands/scaffold.md'), tr = read('skills/ccn-sim/assets/template/README.md');
  for (const q of ['Ships with twenty-one examples', '## Files', '`examples.js` + `examples.checks.mjs`'])
    ok(sc.includes(q) && tr.includes(q), `commands/scaffold.md quotes "${q}" from the template README, but one of the two no longer has it`); }

for (const f of ['skills/ccn-sim/SKILL.md', 'skills/paper-to-sim/SKILL.md']) {
  const fm = read(f).split(/^---$/m)[1] || '';
  const d = (fm.match(/^description:\s*>-?\n((?:[ \t]+.*\n?)+)/m) || fm.match(/^description:\s*(.*)$/m) || [, ''])[1];
  const len = d.split('\n').map(x => x.trim()).filter(Boolean).join(' ').length;
  ok(len > 0 && len < 1024, `${f}: description is ${len} characters (must be 1 to 1,023)`);
}
const pj = JSON.parse(read('.claude-plugin/plugin.json')), mj = JSON.parse(read('.claude-plugin/marketplace.json'));
ok(pj.description.length < 300, `plugin.json description is ${pj.description.length} characters (must be under 300)`);
ok(/^\d+\.\d+\.\d+$/.test(pj.version || ''), 'plugin.json has no semver version');
for (const p of mj.plugins || []) ok(!('version' in p), `marketplace.json entry ${p.name} repeats "version" (plugin.json is the one that wins)`);

console.log(`docs-check: ${nModels} models, ${nFamilies} families; ${checks} checks`);
if (problems.length) { for (const p of problems) console.log('  FAIL ' + p); console.log(`${problems.length} problem(s)`); process.exit(1); }
console.log('all docs checks passed');
