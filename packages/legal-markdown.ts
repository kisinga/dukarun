export interface LegalMarkdownSection {
  id: string;
  title: string;
}

export interface RenderedLegalMarkdown {
  html: string;
  title: string;
  sections: LegalMarkdownSection[];
}

export type SafeMarkdownSection = LegalMarkdownSection;
export type RenderedSafeMarkdown = RenderedLegalMarkdown;

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function inline(value: string): string {
  return escapeHtml(value)
    .replace(/\[([^\]]+)]\(([^)\s]+)\)/g, (_match, label: string, href: string) => {
      const safe = /^(https?:\/\/|mailto:|#|\/)/i.test(href) ? href : '#';
      const external = /^https?:\/\//i.test(safe)
        ? ' target="_blank" rel="noopener noreferrer"'
        : '';
      return `<a href="${safe}"${external}>${label}</a>`;
    })
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
}

function slug(value: string, used: Set<string>): string {
  const base =
    value
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-') || 'section';
  let result = base;
  let suffix = 2;
  while (used.has(result)) result = `${base}-${suffix++}`;
  used.add(result);
  return result;
}

export function renderLegalMarkdown(
  source: string,
  options: { includeTitle?: boolean } = {}
): RenderedLegalMarkdown {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const html: string[] = [];
  const sections: LegalMarkdownSection[] = [];
  const used = new Set<string>();
  let title = 'Legal document';
  let paragraph: string[] = [];
  let list: 'ul' | 'ol' | null = null;

  const closeParagraph = () => {
    if (paragraph.length) html.push(`<p>${inline(paragraph.join(' '))}</p>`);
    paragraph = [];
  };
  const closeList = () => {
    if (list) html.push(`</${list}>`);
    list = null;
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      closeParagraph();
      closeList();
      continue;
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      closeParagraph();
      closeList();
      const level = heading[1].length;
      const text = heading[2].trim();
      const id = slug(text, used);
      if (level === 1) title = text;
      if (level === 2) sections.push({ id, title: text });
      if (level === 1 && options.includeTitle === false) continue;
      html.push(`<h${level} id="${id}">${inline(text)}</h${level}>`);
      continue;
    }

    const unordered = /^[-*]\s+(.+)$/.exec(line);
    const ordered = /^\d+[.)]\s+(.+)$/.exec(line);
    if (unordered || ordered) {
      closeParagraph();
      const nextList = unordered ? 'ul' : 'ol';
      if (list !== nextList) {
        closeList();
        list = nextList;
        html.push(`<${list}>`);
      }
      html.push(`<li>${inline((unordered ?? ordered)?.[1] ?? '')}</li>`);
      continue;
    }

    closeList();
    const quote = /^>\s?(.+)$/.exec(line);
    if (quote) {
      closeParagraph();
      html.push(`<blockquote>${inline(quote[1])}</blockquote>`);
      continue;
    }
    paragraph.push(line);
  }

  closeParagraph();
  closeList();
  return { html: html.join('\n'), title, sections };
}

/** Shared escaped Markdown renderer for public and privileged authored content. */
export const renderSafeMarkdown = renderLegalMarkdown;
