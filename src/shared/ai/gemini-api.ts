// Unified cloud caller with optional proxy support. No API keys hardcoded in bundle.
// Settings (chrome.storage.local):
//  - dactiCloudEnabled: boolean
//  - dactiCloudMode: 'proxy' | 'userkey'
//  - dactiProxyUrl: string (e.g., https://your-proxy.example.com)
//  - dactiProxyToken: string (optional bearer passed to proxy)
//  - dactiUserApiKey: string (NOT RECOMMENDED; user-provided Gemini key)
const cloudLog = (...a: any[]) => { try { console.log('[DACTI][CLOUD]', ...a) } catch {} }
export async function callGeminiApi(prompt: string, options: { signal?: AbortSignal } = {}): Promise<string> {
  const {
    dactiCloudEnabled,
    dactiCloudMode,
    dactiProxyUrl,
    dactiProxyToken,
    dactiUserApiKey,
  } = await chrome.storage.local.get([
    'dactiCloudEnabled',
    'dactiCloudMode',
    'dactiProxyUrl',
    'dactiProxyToken',
    'dactiUserApiKey',
  ])

  // Back-compat keys and normalization
  const extra = await chrome.storage.local.get([
    'dactiProxyURL','proxyUrl','PROXY_URL','proxyToken','PROXY_TOKEN'
  ])
  const cloudModeRaw = typeof dactiCloudMode === 'string' ? dactiCloudMode.trim() : ''
  const proxyUrlCanon = typeof dactiProxyUrl === 'string' ? dactiProxyUrl.trim() : ''
  const proxyUrlCompat = [extra?.dactiProxyURL, extra?.proxyUrl, extra?.PROXY_URL]
    .map(v => typeof v === 'string' ? v.trim() : '')
    .find(v => !!v) || ''
  let proxyUrlRaw = proxyUrlCanon || proxyUrlCompat
  
  const userKeyRaw = typeof dactiUserApiKey === 'string' ? dactiUserApiKey.trim() : ''
  const proxyTokCanon = typeof dactiProxyToken === 'string' ? dactiProxyToken.trim() : ''
  const proxyTokCompat = [extra?.proxyToken, extra?.PROXY_TOKEN]
    .map(v => typeof v === 'string' ? v.trim() : '')
    .find(v => !!v) || ''
  let proxyTokenRaw = proxyTokCanon || proxyTokCompat
cloudLog('config', {
  cloudEnabled: dactiCloudEnabled,
  cloudMode: cloudModeRaw || '',
  hasProxyUrl: !!proxyUrlRaw,
  hasUserKey: !!userKeyRaw,
  hasProxyToken: !!proxyTokenRaw,
})
  // Last-resort sweep across all keys if nothing found (handles dev console sets)
  if (!proxyUrlRaw || !proxyTokenRaw) {
    try {
      const all = (await chrome.storage.local.get()) as Record<string, unknown>
      const pick = (pred: (k: string, v: unknown) => boolean) => {
  for (const [k,v] of Object.entries(all||{})) if (pred(k,v)) return typeof v === 'string' ? v.trim() : ''
  return ''
}
      if (!proxyUrlRaw) proxyUrlRaw = pick((k) => /proxy.*url/i.test(k) || /PROXY_URL/i.test(k))
      if (!proxyTokenRaw) proxyTokenRaw = pick((k) => /proxy.*token/i.test(k) || /PROXY_TOKEN/i.test(k))
    } catch {}
  }

  // Auto-fix: if a proxy URL or user API key exists but cloud mode isn't set, persist a sane default
  try {
    const patch: Record<string, any> = {}
    if (!cloudModeRaw) {
      if (proxyUrlRaw) patch.dactiCloudMode = 'proxy'
      else if (userKeyRaw) patch.dactiCloudMode = 'userkey'
    }
    if (Object.keys(patch).length) {
      if (typeof dactiCloudEnabled !== 'boolean') patch.dactiCloudEnabled = true
      await chrome.storage.local.set(patch)
    }
  } catch {}

  // Infer mode; cloud enabled by default unless explicitly disabled
  let mode: 'proxy' | 'userkey' | '' = (cloudModeRaw === 'proxy' || cloudModeRaw === 'userkey') ? (cloudModeRaw as any) : ''
  if (!mode) {
    if (proxyUrlRaw) mode = 'proxy'
    else if (userKeyRaw) mode = 'userkey'
  }
  const cloudEnabled = (typeof dactiCloudEnabled === 'boolean') ? dactiCloudEnabled : true
  cloudLog('mode chosen', { mode, cloudEnabled })
  if (!cloudEnabled) {
      cloudLog('cloud disabled by settings')
    throw new Error('Cloud fallback is disabled in settings. Enable it in the panel or set dactiCloudEnabled=true.')
  }

  if (mode === 'proxy') {
    const base = proxyUrlRaw
    if (!base) throw new Error('Cloud proxy is not configured.')
    const url = base.replace(/\/$/, '') + '/generate'
    const extId = (typeof chrome !== 'undefined' && chrome?.runtime?.id) ? chrome.runtime.id : ''
    cloudLog('proxy request → /generate', { base, hasToken: !!proxyTokenRaw })
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(proxyTokenRaw ? { 'Authorization': `Bearer ${proxyTokenRaw}` } : {}),
        ...(extId ? { 'x-dacti-ext-id': extId } : {}),
      },
      body: JSON.stringify({ prompt }),
      signal: options.signal,
    })
    if (!res.ok) {
      cloudLog('proxy error', res.status)
      const body = await safeText(res)
      throw new Error(`Proxy error ${res.status}: ${body}`)
    }
    const data = await res.json().catch(() => ({} as any))
    const text = data?.text ?? data?.output ?? data?.result ?? ''
    cloudLog('proxy ok', { hasText: !!text })
    if (!text) throw new Error('Proxy returned no text.')
    return String(text)
  }

  if (mode === 'userkey') {
    const key = userKeyRaw
    if (!key) throw new Error('No user API key configured.')
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(key)}`
   cloudLog('userkey request → generateContent', { endpoint: url.replace(/key=[^&]+/, 'key=***') })
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      signal: options.signal,
    })
    if (!res.ok) {
      cloudLog('userkey error', res.status)
      const body = await safeText(res)
      throw new Error(`Gemini API error ${res.status}: ${body}`)
    }
    const data = await res.json()
    const t = data?.candidates?.[0]?.content?.parts?.[0]?.text
    cloudLog('userkey ok', { hasText: !!t })
    if (t) return String(t)
    if (data?.promptFeedback?.blockReason) throw new Error(`Blocked: ${data.promptFeedback.blockReason}`)
    throw new Error('Gemini API returned no content.')
  }

  // If mode still empty but we have a proxy URL or user key, attempt without requiring mode
  if (proxyUrlRaw) {
    const url = proxyUrlRaw.replace(/\/$/, '') + '/generate'
    const extId = (typeof chrome !== 'undefined' && chrome?.runtime?.id) ? chrome.runtime.id : ''
    cloudLog('proxy request (fallback) → /generate', { base: proxyUrlRaw, hasToken: !!proxyTokenRaw })
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(proxyTokenRaw ? { 'Authorization': `Bearer ${proxyTokenRaw}` } : {}),
        ...(extId ? { 'x-dacti-ext-id': extId } : {}),
      },
      body: JSON.stringify({ prompt }),
      signal: options.signal,
    })
    if (!res.ok) {
      cloudLog('proxy error (fallback)', res.status)
      const body = await safeText(res)
      throw new Error(`Proxy error ${res.status}: ${body}`)
    }
    const data = await res.json().catch(() => ({} as any))
    const text = data?.text ?? data?.output ?? data?.result ?? ''
    cloudLog('proxy ok (fallback)', { hasText: !!text })
    if (!text) throw new Error('Proxy returned no text.')
    return String(text)
  }
  if (userKeyRaw) {
    const key = userKeyRaw
  
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(key)}`
  cloudLog('userkey request (fallback) → generateContent', { endpoint: url.replace(/key=[^&]+/, 'key=***') })
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      signal: options.signal,
    })
    if (!res.ok) {
      cloudLog('userkey error (fallback)', res.status)
      const body = await safeText(res)
      throw new Error(`Gemini API error ${res.status}: ${body}`)
    }
    const data = await res.json()
    const t = data?.candidates?.[0]?.content?.parts?.[0]?.text
    cloudLog('userkey ok (fallback)', { hasText: !!t })
    if (t) return String(t)
    if (data?.promptFeedback?.blockReason) throw new Error(`Blocked: ${data.promptFeedback.blockReason}`)
    throw new Error('Gemini API returned no content.')
  }

  throw new Error('Cloud mode is not configured. Provide dactiProxyUrl (or dactiProxyURL/proxyUrl/PROXY_URL) for proxy mode, or dactiUserApiKey for userkey mode; optionally set dactiCloudMode to "proxy" or "userkey".')
}

async function safeText(res: Response) {
  try { return await res.text() } catch { return '' }
}