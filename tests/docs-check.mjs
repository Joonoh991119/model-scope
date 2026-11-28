// Docs consistency check (dev only). The docs must say what the code is.
//
//   node tests/docs-check.mjs
//
// 1. Every "N models / N examples" and "N families" in the docs equals the registry and the
//    modelbook INDEX; the docs/GUIDE.md gallery table and the template README list name every example.
// 2. Every MSLIB.<block> and MSLIB.<block>.<fn> named in the docs exists in modules/mslib.js.
// 3. Every path named in the skill, command and agent files exists.
// 4. Vendored files (another repository copies them and rewrites the prefix) contain the literal
//    `model-scope:` only in the two command names, and no plugin-root-relative
//    `skills/model-scope/` path without ${CLAUDE_PLUGIN_ROOT}.
// 5. Skill descriptions are under 1,024 characters; plugin.json's description under 300; the plugin
//    version is set in plugin.json only.
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

// ---- what the code says
const { SIM, MSLIB } = loadTemplate(DEFAULT_TEMPLATE);
const nModels = SIM.MODEL_ORDER.length;
const index = read('skills/model-scope/references/modelbook/INDEX.md');
const familyRows = [...index.matchAll(/^\| \[([\w-]+)\.md\]\(\1\.md\) \|/gm)].map(m => m[1]);
const nFamilies = familyRows.length;
for (const f of familyRows) ok(fs.existsSync(path.join(ROOT, 'skills/model-scope/references/modelbook', f + '.md')), `INDEX.md lists ${f}.md, which does not exist`);
const modelbookFiles = fs.readdirSync(path.join(ROOT, 'skills/model-scope/references/modelbook')).filter(f => f.endsWith('.md') && f !== 'INDEX.md');
ok(modelbookFiles.length === nFamilies, `modelbook has ${modelbookFiles.length} family files, INDEX.md lists ${nFamilies}`);

// ---- the docs (CHANGELOG.md is history: it may quote old counts)
const VENDORED = [...walk('skills/model-scope').filter(f => /\.(md|json)$/.test(f)), ...walk('skills/paper-to-sim'),
  'commands/scaffold.md', 'commands/from-paper.md', 'agents/model-gui-builder.md'];
const DOCS = [...new Set(['README.md', 'docs/GUIDE.md', 'MIGRATION.md', '.claude-plugin/plugin.json', '.claude-plugin/marketplace.json',
  'tests/README.md', ...VENDORED])];

// 1. counts
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
const guide = read('docs/GUIDE.md');
const gallery = guide.slice(guide.indexOf('| Model | Domain'), guide.indexOf('Copy one, swap in'));
const galleryRows = gallery.split('\n').filter(l => /^\| \*\*/.test(l)).length;
ok(galleryRows === nModels, `docs/GUIDE.md example table has ${galleryRows} rows, the registry holds ${nModels}`);
const familyTable = guide.slice(guide.indexOf('| Family | Use it for'), guide.indexOf('These are **recipes'));
const familyTableRows = familyTable.split('\n').filter(l => /^\| \*\*/.test(l)).length;
ok(familyTableRows === nFamilies, `docs/GUIDE.md family table has ${familyTableRows} rows, INDEX.md lists ${nFamilies}`);
const tReadme = read('skills/model-scope/assets/template/README.md');
const tList = tReadme.slice(0, tReadme.indexOf('## Files')).split('\n').filter(l => /^- \*\*/.test(l)).length;
ok(tList === nModels, `template README.md lists ${tList} examples, the registry holds ${nModels}`);

// 2. MSLIB names
for (const f of DOCS) {
  const s = read(f);
  for (const m of s.matchAll(/\bMSLIB\.(\w+)(?:\.(\w+))?/g)) {
    const [, block, fn] = m;
    ok(MSLIB[block] !== undefined, `${f}:${lineOf(s, m.index)} names MSLIB.${block}, which mslib.js does not export`);
    if (fn && MSLIB[block] && typeof MSLIB[block] === 'object')
      ok(MSLIB[block][fn] !== undefined, `${f}:${lineOf(s, m.index)} names MSLIB.${block}.${fn}, which mslib.js does not export`);
  }
}

// 3. paths named in the skill, command and agent files
const SKILL_FILES = ['skills/model-scope/SKILL.md', 'skills/paper-to-sim/SKILL.md', 'commands/scaffold.md', 'commands/from-paper.md', 'agents/model-gui-builder.md'];
const MS = 'skills/model-scope';
for (const f of SKILL_FILES) {
  const s = read(f);
  for (const m of s.matchAll(/`([^`\s]*(?:references|assets|modelbook|\$\{CLAUDE_(?:PLUGIN_ROOT|SKILL_DIR)\})[^`\s]*)`/g)) {
    let p = m[1].replace(/\/\.$/, '');
    if (/[<>*]/.test(p)) continue;                                    // a pattern, not a path
    p = p.replace('${CLAUDE_PLUGIN_ROOT}/', '').replace('${CLAUDE_SKILL_DIR}/', MS + '/');
    if (!p.startsWith('skills/')) {                                   // relative to the model-scope skill: only resolves from inside it
      ok(f.startsWith(MS + '/'), `${f}:${lineOf(s, m.index)} names \`${m[1]}\` relative to the model-scope skill; from ${f} write \${CLAUDE_PLUGIN_ROOT}/${MS}/${p}`);
      p = path.join(MS, p); }
    ok(fs.existsSync(path.join(ROOT, p)), `${f}:${lineOf(s, m.index)} names \`${m[1]}\`, which does not exist (${p})`);
    ok(!m[1].includes('${CLAUDE_SKILL_DIR}') || f === 'skills/model-scope/SKILL.md', `${f}:${lineOf(s, m.index)} uses \${CLAUDE_SKILL_DIR} outside the model-scope skill`);
  }
}

// 4. vendored files
for (const f of VENDORED) {
  const s = read(f);
  for (const m of s.matchAll(/model-scope:(?!scaffold\b|from-paper\b)/g))
    ok(false, `${f}:${lineOf(s, m.index)} has a literal "model-scope:" outside the two command names`);
  for (const m of s.matchAll(/skills\/model-scope\//g))
    ok(s.slice(Math.max(0, m.index - 22), m.index) === '${CLAUDE_PLUGIN_ROOT}/', `${f}:${lineOf(s, m.index)} has a plugin-root-relative skills/model-scope/ path without \${CLAUDE_PLUGIN_ROOT}`);
}

// 4b. the --bare steps in commands/scaffold.md edit the template README by quoting it: the quoted text must be there
{ const sc = read('commands/scaffold.md'), tr = read('skills/model-scope/assets/template/README.md');
  for (const q of ['Ships with twenty-one examples', '## Files', '`examples.js` + `examples.checks.mjs`'])
    ok(sc.includes(q) && tr.includes(q), `commands/scaffold.md quotes "${q}" from the template README, but one of the two no longer has it`); }

// 5. lengths and the version field
for (const f of ['skills/model-scope/SKILL.md', 'skills/paper-to-sim/SKILL.md']) {
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
