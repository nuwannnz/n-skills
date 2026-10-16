import { marked } from 'marked';

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Markdown to HTML. Documents come from the project itself, and the page's CSP blocks scripts. */
export const markdown = (text: string): string => {
  try { return marked.parse(text, { gfm: true, async: false }); } catch { return `<pre>${esc(text)}</pre>`; }
};

/** Splits a document's YAML frontmatter into flat key: value pairs and the body. */
export function parseDoc(text: string) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?/);
  const meta: Record<string, string> = {};
  if (m) for (const line of m[1]!.split('\n')) {
    const i = line.indexOf(':');
    if (i > 0 && !line.startsWith(' ')) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return { meta, body: m ? text.slice(m[0].length) : text };
}
