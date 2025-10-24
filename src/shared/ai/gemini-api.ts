// Unified cloud caller with optional proxy support. No API keys hardcoded in bundle.
// Settings (chrome.storage.local):
//  - dactiCloudEnabled: boolean
//  - dactiCloudMode: 'proxy' | 'userkey'
//  - dactiProxyUrl: string (e.g., https://your-proxy.example.com)
//  - dactiProxyToken: string (optional bearer passed to proxy)
//  - dactiUserApiKey: string (NOT RECOMMENDED; user-provided Gemini key)

export async function callGeminiApi(prompt: string): Promise<string> {
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

  // Auto-detect mode if not explicitly set
  const cloudModeRaw = typeof dactiCloudMode === 'string' ? dactiCloudMode.trim() : ''
  const proxyUrlRaw = typeof dactiProxyUrl === 'string' ? dactiProxyUrl.trim() : ''
  const userKeyRaw = typeof dactiUserApiKey === 'string' ? dactiUserApiKey.trim() : ''
  let mode: 'proxy' | 'userkey' | '' = (cloudModeRaw === 'proxy' || cloudModeRaw === 'userkey') ? (cloudModeRaw as any) : ''
  if (!mode) {
    if (proxyUrlRaw) mode = 'proxy'
    else if (userKeyRaw) mode = 'userkey'
  }

  if (!dactiCloudEnabled) {
    throw new Error('Cloud fallback is disabled in settings.')
  }

  // Preferred: proxy mode
  if (mode === 'proxy') {
    const base = proxyUrlRaw
    if (!base) throw new Error('Cloud proxy is not configured.')
    const url = base.replace(/\/$/, '') + '/generate'
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(dactiProxyToken ? { 'Authorization': `Bearer ${dactiProxyToken}` } : {}),
      },
      body: JSON.stringify({ prompt }),
    })
    if (!res.ok) {
      const body = await safeText(res)
      throw new Error(`Proxy error ${res.status}: ${body}`)
    }
    const data = await res.json().catch(() => ({} as any))
    const text = data?.text ?? data?.output ?? data?.result ?? ''
    if (!text) throw new Error('Proxy returned no text.')
    return String(text)
  }

  // Fallback: direct Gemini with user key (NOT recommended)
  if (mode === 'userkey') {
    const key = userKeyRaw
    if (!key) throw new Error('No user API key configured.')
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(key)}`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    })
    if (!res.ok) {
      const body = await safeText(res)
      throw new Error(`Gemini API error ${res.status}: ${body}`)
    }
    const data = await res.json()
    const t = data?.candidates?.[0]?.content?.parts?.[0]?.text
    if (t) return String(t)
    if (data?.promptFeedback?.blockReason) throw new Error(`Blocked: ${data.promptFeedback.blockReason}`)
    throw new Error('Gemini API returned no content.')
  }

  throw new Error('Cloud mode is not configured. Set chrome.storage.local.dactiCloudMode to "proxy" or "userkey", or provide dactiProxyUrl (proxy) / dactiUserApiKey (userkey).')
}

async function safeText(res: Response) {
  try { return await res.text() } catch { return '' }
}