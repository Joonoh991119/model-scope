import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { SCRIPT_TAG, srcOf, withoutHtmlComments, isRemote, stripJsComments } from './page.mjs';

const words = s => String(s).trim().split(/\s+/).filter(Boolean);
export const titleProblem = t => { const n = words(t).length;
  return (n < 2 || n > 4) ? `a title is a name of two to four words (got ${n}: "${t}")` : /[—–:]| - /.test(t) ? `a title is a name, not a name plus an explanation (drop what follows the dash or colon in "${t}")` : null; };
const escText = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
export const escScript = js => js.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\x21--');

export function bundle(dir, { title, standalone = false } = {}) {
  const page = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  const style = [...page.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map(m => m[1].trim()).join('\n');
  const bodyM = /<body\b[^>]*>([\s\S]*)<\/body>/i.exec(page);
  if (!bodyM) throw new Error('index.html has no <body>');
  const scripts = [];
  let body = withoutHtmlComments(bodyM[1]).replace(SCRIPT_TAG, (all, attrs, inline) => {
    const src = srcOf(attrs);
    if (!src) return `<script>${escScript(inline)}</script>`;
    if (isRemote(src)) throw new Error(`index.html loads ${src} from another host; a bundle must be self-contained`);
    const file = path.join(dir, src);
    if (!fs.existsSync(file)) throw new Error(`index.html loads ${src} but that file is missing`);
    scripts.push(src);
    return `<script>\n${escScript(fs.readFileSync(file, 'utf8'))}\n</script>`;
  });
  body = body.replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim();
  const appTitle = (() => { for (const s of scripts) { const m = /\bSIM\.APP\s*=\s*\{[^}]*\btitle\s*:\s*(['"`])((?:(?!\1).)+)\1/.exec(stripJsComments(fs.readFileSync(path.join(dir, s), 'utf8'))); if (m) return m[2]; } return null; })();
  const name = title || (appTitle && !titleProblem(appTitle) ? appTitle : 'Model Scope Explorer');
  const bad = titleProblem(name); if (bad) throw new Error(bad);
  const head = `<title>${escText(name)}</title>\n<style>\n${style}\n</style>`;
  const html = standalone
    ? `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n${head}\n</head>\n<body>\n${body}\n</body>\n</html>\n`
    : `${head}\n${body}\n`;
  return { html, title: name, scripts, bytes: Buffer.byteLength(html) };
}

export function bundleProblems(html, { standalone = false } = {}) {
  const out = [], markup = html.replace(/(<script\b[^>]*>)[\s\S]*?(<\/script>)/gi, '$1$2').replace(/(<style\b[^>]*>)[\s\S]*?(<\/style>)/gi, '$1$2');
  for (const [re, what] of [[/<!doctype/i, 'a doctype'], [/<html[\s>]/i, 'an <html> tag'], [/<head[\s>]/i, 'a <head> tag'], [/<body[\s>]/i, 'a <body> tag']]) {
    if (!standalone && re.test(markup)) out.push(`contains ${what} (the host page supplies it)`);
    if (standalone && !re.test(markup)) out.push(`a standalone document needs ${what}`);
  }
  if (/<[a-z][^>]*\s(?:src|srcset|data|poster)\s*=/i.test(markup)) out.push('an element still references a file (src=)');
  if (/<link\b|<iframe\b|<object\b|<embed\b/i.test(markup)) out.push('contains a <link>, <iframe>, <object> or <embed>');
  if (/<(?:image|use|feImage)\b[^>]*\shref\s*=\s*["']?\s*(?!#|data:)[^\s"'>]/i.test(markup)) out.push('an SVG element still references a file (href=)');
  const css = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '') + [...markup.matchAll(/\sstyle\s*=\s*"([^"]*)"/gi)].map(m => m[1]).join('\n');
  if (/url\(\s*["']?\s*(?!data:|#|["')])/i.test(css) || /image-set\(\s*["']\s*(?!data:)/i.test(css)) out.push('a CSS url() or image-set() still references a file');
  if (/\b(?:src|href)\s*=\s*["']?\s*(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(markup) || /url\(\s*["']?\s*(?:https?:)?\/\//i.test(html) || /@import\b/i.test(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ''))) out.push('references another host');
  const titles = [...html.matchAll(/<title>([\s\S]*?)<\/title>/gi)].map(m => m[1]);
  if (titles.length !== 1) out.push(`has ${titles.length} <title> elements (needs exactly one)`); else { const t = titleProblem(titles[0].replace(/&amp;/g, '&')); if (t) out.push(t); if (html.indexOf('<title>') > 8192) out.push('the <title> is not within the first 8 KB'); }
  if (/<\/?script\b/i.test(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ''))) out.push('a stray script tag is left outside the script elements: a script contains an unescaped closing tag');
  [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].forEach((m, i) => { try { new Function(m[1]); } catch (e) { out.push(`inlined script ${i + 1} does not parse: ${e.message}`); } });
  if (Buffer.byteLength(html) > 16 * 1024 * 1024) out.push('larger than 16 MB');
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2), opt = f => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined; };
  const dir = path.dirname(fileURLToPath(import.meta.url));
  try {
    const standalone = argv.includes('--standalone');
    const b = bundle(dir, { title: opt('--title'), standalone }), problems = bundleProblems(b.html, { standalone });
    if (problems.length) { console.error('bundle.mjs: the bundle is not self-contained:\n  ' + problems.join('\n  ')); process.exit(1); }
    const out = path.resolve(opt('--out') || path.join(dir, 'bundle.html'));
    fs.writeFileSync(out, b.html);
    console.log(`wrote ${out}\n  title    ${b.title}${opt('--title') ? '' : '   (name it with --title "Two To Four Words")'}\n  inlined  ${b.scripts.join(', ')}\n  size     ${(b.bytes / 1024).toFixed(0)} KB, one file, no external resource`);
    console.log(standalone
      ? '  It is a complete document: open it in a browser or send it as one file.'
      : '  It is a fragment (no doctype, <html>, <head> or <body>): a host that wraps pages, such as a Claude\n  Artifact, supplies those. For a file to open or send as it is, add --standalone.');
    console.log('  Link a screen with #<model> or #<model>-<lens>.');
  } catch (e) { console.error('bundle.mjs: ' + e.message); process.exit(1); }
}
