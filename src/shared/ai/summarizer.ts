import { callGeminiApi } from './gemini-api'

export async function summarizePage(
  text: string,
  options: { onProgress?: (p: number) => void; localOnly?: boolean } = {}
): Promise<string> {
  // On-device d’abord
  // @ts-ignore
  const canLocal = typeof ai !== 'undefined' && ai?.summarizer?.create
  if (canLocal) {
    try {
      // @ts-ignore
      const sm = await ai.summarizer.create({ model: 'gemini-nano' })
      const out = await sm.summarize({ text })
      return String(out?.text ?? out ?? '')
    } catch (e) {
      if (options?.localOnly) throw e
    }
  }

  if (options?.localOnly) {
    throw new Error('Local-only mode is enabled; cloud summarize is disabled.')
  }

  const prompt = 'Summarize the following content in 5–7 concise bullet points. Use clear, neutral language.\n\n' + text
  return callGeminiApi(prompt)
}
