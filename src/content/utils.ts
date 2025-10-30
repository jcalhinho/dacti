
export const stripFences = (s: string) => {
  const m = String(s || '').match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (m ? m[1] : String(s || '')).trim();
};

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text) el.textContent = text;
  return el;
}

export const ENTITY_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(input: string): string {
  return input.replace(/[&<>"']/g, (ch) => ENTITY_MAP[ch]);
}

export function renderInlineMarkdown(input: string): string {
  let escaped = escapeHtml(input);

  const codePlaceholders: string[] = [];
  escaped = escaped.replace(/`([^`]+)`/g, (_match, code) => {
    const index = codePlaceholders.push(escapeHtml(code)) - 1;
    return `\u0000${index}\u0000`;
  });

  escaped = escaped.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  escaped = escaped.replace(/__(.+?)__/g, '<strong>$1</strong>');

  escaped = escaped.replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, (_match, prefix, value) => {
    return `${prefix}<em>${value}</em>`;
  });
  escaped = escaped.replace(/(^|[^_])_([^_\n]+?)_(?!_)/g, (_match, prefix, value) => {
    return `${prefix}<em>${value}</em>`;
  });

  escaped = escaped.replace(/\[([^\]]+?)\]\((https?:\/\/[^\s)]+|mailto:[^)]+)\)/g, (_match, label, href) => {
    const safeLabel = escapeHtml(label);
    const safeHref = escapeHtml(href);
    return `<a href="${safeHref}" target="_blank" rel="noopener noreferrer">${safeLabel}</a>`;
  });

  escaped = escaped.replace(/\u0000(\d+)\u0000/g, (_match, idx) => {
    const code = codePlaceholders[Number(idx)] ?? '';
    return `<code>${code}</code>`;
  });

  return escaped;
}

export function secureRender(el: HTMLElement, text: string) {
  el.innerHTML = '';
  el.classList.add('markdown-output');
  if (!text) return;

  const lines = String(text).replace(/\r/g, '').split('\n');
  const blocks: string[] = [];
  let listOpen = false;

  const closeList = () => {
    if (listOpen) {
      blocks.push('</ul>');
      listOpen = false;
    }
  };

  for (const line of lines) {
    const trimmed = line.trimEnd();
    if (!trimmed) {
      closeList();
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      if (!listOpen) {
        blocks.push('<ul>');
        listOpen = true;
      }
      const content = trimmed.replace(/^[-*]\s+/, '');
      blocks.push(`<li>${renderInlineMarkdown(content)}</li>`);
      continue;
    }

    closeList();

    if (/^#{1,3}\s+/.test(trimmed)) {
      const match = trimmed.match(/^#{1,3}/);
      const level = match ? match[0].length + 1 : 2;
      const content = trimmed.replace(/^#{1,3}\s+/, '');
      blocks.push(`<h${level}>${renderInlineMarkdown(content)}</h${level}>`);
      continue;
    }

    if (/^>\s+/.test(trimmed)) {
      const content = trimmed.replace(/^>\s*/, '');
      blocks.push(`<blockquote>${renderInlineMarkdown(content)}</blockquote>`);
      continue;
    }

    if (/^---+$/.test(trimmed)) {
      blocks.push('<hr/>');
      continue;
    }

    blocks.push(`<p>${renderInlineMarkdown(trimmed)}</p>`);
  }

  closeList();
  el.innerHTML = blocks.join('');
}
