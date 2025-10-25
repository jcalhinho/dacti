import { callGeminiApi } from './gemini-api'

function stripFences(s: string): string {
  if (!s) return s
  const m = s.match(/```(?:json)?\s*([\s\S]*?)```/i)
  return (m ? m[1] : s).trim()
}

export type Caption = { alt: string; tags: string[] }

export async function captionImage(
  blob: Blob,
  opts: { localOnly?: boolean } = {}
): Promise<Caption> {
  // 1) Chrome Built-in AI Prompt API (multimodal)
  // @ts-ignore
  const hasPrompt = typeof ai !== 'undefined' && ai?.prompt?.create
  if (hasPrompt) {
    try {
      // @ts-ignore
      const prompt = await ai.prompt.create({ multimodal: true, model: 'gemini-nano' })
      const res = await prompt.generate({
        image: blob,
        instruction:
          'Return STRICT JSON: {"alt":"...","tags":["a","b","c"]}. ' +
          'Alt must be <=120 characters, objective, and non-biased. Do not include any extra text.'
      })
      const txt = String(res ?? '')
      try {
        const parsed = JSON.parse(stripFences(txt))
        if (parsed?.alt && Array.isArray(parsed?.tags)) return parsed as Caption
      } catch {}
      // Si le modèle renvoie du texte brut : meilleure effort
      return { alt: txt.slice(0, 120), tags: [] }
    } catch (e) {
      if (opts.localOnly) throw e
      // on passe au cloud
    }
  }

  // 2) Fallback cloud (si autorisé)
  if (!opts.localOnly) {
    const base64 = await blobToBase64(blob)
    const prompt = [
      'You are an alt-text generator. Respond ONLY with JSON of the form',
      '{"alt":"...","tags":["a","b","c"]}.',
      'Rules: Alt <=120 chars, objective, no assumptions. Tags are lowercase single words.'
    ].join(' ')

    try {
      // Try proxy multimodal first
      // @ts-ignore
      const { dactiProxyUrl, dactiProxyToken } = await chrome.storage.local.get(['dactiProxyUrl','dactiProxyToken'])
      const proxy = String(dactiProxyUrl || '').replace(/\/$/, '')
      if (proxy) {
        const r = await fetch(`${proxy}/generate-multi`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(dactiProxyToken ? { Authorization: `Bearer ${dactiProxyToken}` } : {}) },
          body: JSON.stringify({ prompt, imageBase64: base64, mimeType: (blob as any)?.type || 'image/png' }),
        })
        if (r.ok) {
          const { text } = await r.json() as any
          const cleaned = stripFences(String(text || ''))
          try { const parsed = JSON.parse(cleaned); if (parsed?.alt && Array.isArray(parsed?.tags)) return parsed as Caption } catch {}
          return { alt: cleaned.slice(0,120), tags: [] }
        }
      }
    } catch {}

    // Fallback legacy (text-only) – may be weak, but keeps behavior if no proxy configured
    const json = await callGeminiApi(`${prompt}\n\nIMAGE_BASE64:\n${base64}`)
    try {
      const parsed = JSON.parse(stripFences(json))
      if (parsed?.alt && Array.isArray(parsed?.tags)) return parsed as Caption
      const cleaned = stripFences(json)
      return { alt: cleaned.slice(0, 120), tags: [] }
    } catch {
      const cleaned = stripFences(json)
      return { alt: cleaned.slice(0, 120), tags: [] }
    }
  }

  throw new Error('Multimodal AI not available and cloud fallback is disabled.')
}

function blobToBase64(b: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '')
    r.onerror = reject
    r.readAsDataURL(b)
  })
}