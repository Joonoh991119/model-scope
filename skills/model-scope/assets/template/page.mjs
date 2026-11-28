export const SCRIPT_TAG = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;

export const srcOf = attrs => {
  const m = /\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i.exec(attrs);
  return m ? (m[1] ?? m[2] ?? m[3]) : undefined;
};

export const withoutHtmlComments = html =>
  html.replace(/(<script\b[^>]*>[\s\S]*?<\/script>)|<!--[\s\S]*?-->/gi, (all, script) => script || '');

export const isRemote = src => /^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(src);

export function pageScripts(html) {
  return [...withoutHtmlComments(html).matchAll(SCRIPT_TAG)].map(m => ({ src: srcOf(m[1]), body: m[2] }));
}

export const stripJsComments = js => js.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[\s;{}(),])\/\/[^\n]*/g, '$1');
