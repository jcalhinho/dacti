import { callGeminiApi } from './gemini-api'

export async function rewriteText(
  text: string,
  cfg: { style: string },
  options: { onProgress?: (p: number) => void; localOnly?: boolean; signal?: AbortSignal } = {}
): Promise<string> {
  // On-device d’abord
  // @ts-ignore
  const canLocal = typeof ai !== 'undefined' && ai?.rewriter?.create
  if (canLocal) {
    try {
      // @ts-ignore
      const rw = await ai.rewriter.create({ model: 'gemini-nano' })
      const out = await rw.rewrite({ text, tone: cfg.style })
      return String(out?.text ?? out ?? '')
    } catch (e) {
      if (options?.localOnly) throw e
    }
  }

  if (options?.localOnly) {
    throw new Error('Local-only mode is enabled; cloud rewrite is disabled.')
  }

   const prompt = `You are a precise rewriter. Rewrite the text in the requested style while preserving meaning and factual content.
Rules:
- Do not add facts.
- No meta commentary.
- Keep URLs, numbers and entities.
- Output only the rewritten text. No markdown, no asterisks, no special formatting.

Style: ${cfg.style}

TEXT:
${text}`
  return callGeminiApi(prompt, { signal: options?.signal })
}