
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

export function secureRender(el: HTMLElement, text: string) {
  el.textContent = '';
  if (!text) return;

  const lines = text.split('\n');
  let list: HTMLUListElement | null = null;

  lines.forEach((line) => {
    if (line.match(/^[\s]*[-*]\s/)) {
      if (!list) {
        list = document.createElement('ul');
        el.appendChild(list);
      }
      const li = document.createElement('li');
      li.textContent = line.replace(/^[\s]*[-*]\s/, '');
      list.appendChild(li);
    } else {
      list = null;
      const p = document.createElement('p');
      p.textContent = line;
      el.appendChild(p);
    }
  });
}
