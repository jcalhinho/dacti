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
    const lang = (targetLang && targetLang !== 'auto') ? targetLang.toLowerCase() : 'en'
const out = await tr.translate({ text, targetLanguage: lang })
return String(out?.text ?? out ?? '').trim()
    } catch (e) {
      if (options?.localOnly) throw e
    }
  }

  if (options?.localOnly) {
    throw new Error('Local-only mode is enabled; cloud translation is disabled.')
  }

   const target = String(targetLang || 'en')
  const detect = target.toLowerCase() === 'auto'
  const basePrompt = "Use Markdown formatting when it adds clarity (plain text is acceptable). Do not add a preface. "
  const prompt = detect
    ? basePrompt + `Detect the source language and translate into English. Return **only** the translation formatted as Markdown. Preserve numbers and capitalization.

TEXT:
${text}`
    : basePrompt + `Translate the following text into ${target}. Return **only** the translation formatted as Markdown. Preserve numbers and capitalization.

TEXT:
${text}`
  return callGeminiApi(prompt, { signal: options?.signal })
}
