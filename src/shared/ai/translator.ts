import { callGeminiApi } from './gemini-api'

export async function translateText(
  text: string,
  targetLang: string,
  options: { onProgress?: (p: number) => void; localOnly?: boolean } = {}
): Promise<string> {
  // On-device d’abord
  // @ts-ignore
  const canLocal = typeof ai !== 'undefined' && ai?.translator?.create
  if (canLocal) {
    try {
      // @ts-ignore
      const tr = await ai.translator.create({ model: 'gemini-nano' })
      const out = await tr.translate({ text, targetLanguage: targetLang })
      return String(out?.text ?? out ?? '')
    } catch (e) {
      if (options?.localOnly) throw e
    }
  }

  if (options?.localOnly) {
    throw new Error('Local-only mode is enabled; cloud translation is disabled.')
  }

  const prompt = `Translate the following text into ${targetLang}.
Return only the translated text without quotes or explanation.

TEXT:
${text}`
  return callGeminiApi(prompt)
}