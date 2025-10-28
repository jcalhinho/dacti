import { callGeminiApi } from './gemini-api'

export async function translateText(
  text: string,
  targetLang: string,
  options: { onProgress?: (p: number) => void; localOnly?: boolean; signal?: AbortSignal } = {}
): Promise<string> {
  // On-device d’abord
  // @ts-ignore
  const canLocal = typeof ai !== 'undefined' && ai?.translator?.create
  if (canLocal) {
    try {
      // @ts-ignore
      const tr = await ai.translator.create({ model: 'gemini-nano' })
     const out = await tr.translate({ text, targetLanguage: (targetLang && targetLang !== 'auto') ? targetLang : 'en' })
      return String(out?.text ?? out ?? '')
    } catch (e) {
      if (options?.localOnly) throw e
    }
  }

  if (options?.localOnly) {
    throw new Error('Local-only mode is enabled; cloud translation is disabled.')
  }

   const target = String(targetLang || 'en')
  const detect = target.toLowerCase() === 'auto'
  const basePrompt = "Return only plain text, no markdown or special formatting. "
  const prompt = detect
    ? basePrompt + `Detect the source language and translate into English. Return **only** the translation (no quotes, no preface). Preserve numbers and capitalization.

TEXT:
${text}`
    : basePrompt + `Translate the following text into ${target}. Return **only** the translation (no quotes, no preface). Preserve numbers and capitalization.

TEXT:
${text}`
  return callGeminiApi(prompt, { signal: options?.signal })
}