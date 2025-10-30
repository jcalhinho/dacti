import { callGeminiApi } from './gemini-api'

export type SummarizeMode = 'tldr' | 'bullets' | 'eli5' | 'sections' | 'facts' ;
export const SUM_MODES: ReadonlyArray<SummarizeMode> = ['tldr','bullets','eli5','sections','facts'] as const;
export const isSumMode = (x: unknown): x is SummarizeMode =>
  typeof x === 'string' && (SUM_MODES as readonly string[]).includes(x);

// Paragraph-aware chunker for consistent summarization chunking
export function chunkTextParagraphAware(s: string, max = 6000): string[] {
  const clean = String(s || '').replace(/\r/g,'').replace(/\t/g,' ').replace(/ {2,}/g,' ')
  const paras = clean.split(/\n{2,}/)
  const out: string[] = []
  let buf = ''
  for (const p of paras) {
    const add = buf ? (buf + '\n\n' + p) : p
    if (add.length <= max) {
      buf = add
    } else {
      if (buf) out.push(buf)
      if (p.length <= max) {
        buf = p
      } else {
        for (let i = 0; i < p.length; i += max) out.push(p.slice(i, i + max))
        buf = ''
      }
    }
  }
  if (buf) out.push(buf)
  return out
}
function buildPrompt(text: string, mode: SummarizeMode ) {
  const baseGuard = `Rules:
- Be faithful to the input.
- No hallucinations. If unsure, say you are unsure.
- Do not add prefaces like "In summary".
- Output plain text only: no Markdown, no quotes, no code fences.
- When using bullets, always prefix items with "- " (dash + space).`;

  switch (mode) {
    case 'tldr':
      return `${baseGuard}
Task: Summarize in 1–2 crisp sentences (TL;DR). No bullets.
CONTENT:
${text}`

    case 'eli5':
      return `${baseGuard}
Task: Explain like I'm five (simple, concrete, friendly). Output 3–6 bullets. Avoid jargon; give tiny examples. Use "- " as bullet prefix.
CONTENT:
${text}`

    case 'sections':
      return `${baseGuard}
Task: Create a sectioned outline with short bullets. Headings should be concise and followed by 2–5 bullets each. Use "- " as bullet prefix.

No extra text.
CONTENT:
${text}`

    case 'facts':
      return `${baseGuard}
Task: Extract key facts (figures, dates, names, outcomes). Return 5–10 bullets, one fact per bullet. Use "- " as bullet prefix. Repeat numbers exactly; no formatting.
CONTENT:
${text}`

    case 'bullets':
    default:
      return `${baseGuard}
Task: Summarize in 5 concise bullets. Use "- " as bullet prefix. No duplication; neutral tone.
CONTENT:
${text}`
  }
}

export async function summarizePage(
  text: string,
  options: { onProgress?: (p: number) => void; localOnly?: boolean; mode?: SummarizeMode; signal?: AbortSignal } = {}
): Promise<string> {
  const mode = (options.mode as SummarizeMode) || 'bullets'

  // Prefer on-device Prompt API for finer control if available
  // @ts-ignore
  const canPromptLocal = typeof ai !== 'undefined' && ai?.prompt?.create
  if (canPromptLocal) {
    try {
      // @ts-ignore
      const pr = await ai.prompt.create({ multimodal: false, model: 'gemini-nano' })
      const instruction = buildPrompt(text, mode)
      const out = await pr.generate({ instruction })
      return String(out ?? '').trim()
    } catch (e) {
      // Fallback to local summarizer if available below
    }
  }

  // Built-in local summarizer (less controllable style-wise)
  // @ts-ignore
  const canSummarizerLocal = typeof ai !== 'undefined' && ai?.summarizer?.create
  if (canSummarizerLocal) {
    try {
      // @ts-ignore
      const sm = await ai.summarizer.create({ model: 'gemini-nano' })
      const base = await sm.summarize({ text })
      const raw = String(base?.text ?? base ?? '')
      // Light post-format according to mode if needed
      if (mode === 'tldr') {
        return raw.split(/\n+/).slice(0,2).join(' ').trim()
      } else if (mode === 'bullets' || mode === 'facts' || mode === 'eli5') {
        const lines = raw
          .split(/\n+/)
          .map(l => l.replace(/^[-*•–]\s*/, '').trim())
          .filter(Boolean);
        const max = mode === 'bullets' ? 5 : Math.min(7, lines.length);
        return lines.slice(0, max).map(l => '- ' + l).join('\n');
      } else if (mode === 'sections') {
        return raw.trim() // keep structure; ensure clean edges
      }
      return raw.trim()
    } catch (e) {
      if (options?.localOnly) throw e
    }
  }

  if (options?.localOnly) {
    throw new Error('Local-only mode is enabled; cloud summarize is disabled.')
  }

  // Cloud path with explicit, mode-aware prompt
  const prompt = buildPrompt(text, mode)
  return callGeminiApi(prompt, { signal: options?.signal })
}

// Consistent chunked summarization and merging for all modes
export async function summarizeLarge(
  text: string,
  options: { onProgress?: (p: number) => void; localOnly?: boolean; mode?: SummarizeMode; signal?: AbortSignal } = {}
): Promise<string> {
  const mode = (options.mode as SummarizeMode) || 'bullets'
  const MAX_IN = 6000
  const parts = chunkTextParagraphAware(text, MAX_IN)
  const outs: string[] = []
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    const one = await summarizePage(part, { ...options, mode })
    if (one && String(one).trim()) outs.push(String(one).trim())
    if (options.onProgress) options.onProgress((i + 1) / parts.length)
  }

  const joined = outs.join('\n')

  // Merge strategy per mode
  if (mode === 'tldr') {
    // Re-summarize the concatenation into a final TL;DR
    return summarizePage(joined, { ...options, mode: 'tldr' })
  }
  if (mode === 'sections') {
    // Keep structure, then a light pass to normalize
    return summarizePage(joined, { ...options, mode: 'sections' })
  }
  // bullets / eli5 / facts: dedup + cap
  const lines = joined.split(/\n+/).map(l => l.replace(/^[-*•–]\s*/, '').trim()).filter(Boolean)
  const cap = mode === 'bullets' ? 5 : (mode === 'eli5' ? Math.min(7, lines.length) : Math.min(10, lines.length))
  const seen = new Set<string>()
  const picked: string[] = []
  for (const l of lines) {
    const key = l.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    picked.push('- ' + l)
    if (picked.length >= cap) break
  }
  return picked.join('\n')
}