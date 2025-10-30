import { callGeminiApi } from './gemini-api'

export type SummarizeMode = 'tldr' | 'bullets' | 'eli5' | 'sections' | 'facts'

function buildPrompt(text: string, mode: SummarizeMode = 'bullets') {
  const baseGuard = `Rules:
- Be faithful to the input.
- No hallucinations. If unsure, say you are unsure.
- No prefatory phrases like "In summary".
- Keep formatting exactly as requested.`
  switch (mode) {
    case 'tldr':
      return `${baseGuard}
Task: Summarize in **1–2 crisp sentences** (TL;DR). No bullets.
CONTENT:
${text}`
    case 'eli5':
      return `${baseGuard}
Task: Explain like I'm five (simple, concrete, friendly). Output **3–6 bullets**, each short. Avoid jargon; give tiny examples.
CONTENT:
${text}`
    case 'sections':
      return `${baseGuard}
Task: Create a **sectioned outline** with short bullets. 

No extra text.
CONTENT:
${text}`
    case 'facts':
      return `${baseGuard}
Task: Extract **key facts** (figures, dates, names, outcomes). Return **5–10 bullets**, each 1 fact. Highlight numbers with **bold**.
CONTENT:
${text}`
    case 'bullets':
    default:
      return `${baseGuard}
Task: Summarize in **5 concise bullets**. No duplication; neutral tone.
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
      return String(out ?? '')
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
        return raw.split(/\n+/).slice(0,2).join(' ')
      } else if (mode === 'bullets' || mode === 'facts' || mode === 'eli5') {
        const lines = raw.split(/\n+/).map(l => l.replace(/^[-•]\s*/, '').trim()).filter(Boolean)
        const prefix = '• '
        return lines.slice(0, 7).map(l => prefix + l).join('\n')
      } else if (mode === 'sections') {
        return raw // let it as-is; local summarizer may already produce sections
      }
      return raw
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