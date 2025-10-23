import { callGeminiApi } from './gemini-api'

export async function rewriteText(
  text: string,
  cfg: { style: string },
  options: { onProgress?: (p: number) => void; localOnly?: boolean } = {}
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

  const prompt = `Rewrite the following text. Style: ${cfg.style}.
Return only the rewritten text, no explanations.

TEXT:
${text}`
  return callGeminiApi(prompt)
}