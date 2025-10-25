// --- Task management for cancellation ---
const tasks = new Map<number, { abort: AbortController, canceled: boolean, jobId: number }>()
let seq = 0
function startTask(tabId: number) {
  const t = { abort: new AbortController(), canceled: false, jobId: ++seq }
  const prev = tasks.get(tabId)
  if (prev) { try { prev.abort.abort() } catch {} }
  tasks.set(tabId, t)
  return t
}
function getTask(tabId: number) { return tasks.get(tabId) }
function cancelTask(tabId: number) { const t = tasks.get(tabId); if (t) { t.canceled = true; try { t.abort.abort() } catch {} } }

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (!msg || typeof msg !== 'object') return
  if (msg.type === 'DACTI_CANCEL') {
    const tabId = sender?.tab?.id
    if (tabId) {
      cancelTask(tabId)
      updatePanel(tabId, { message: '⏹️ stopped by user.' })
      progress(tabId, 1)
    }
  }
})
function stripFences(s: string): string { const m = String(s||'').match(/```(?:json)?\s*([\s\S]*?)```/i); return (m?m[1]:String(s||'')).trim() }
import { rewriteText } from '@/shared/ai/rewriter'
import { translateText } from '@/shared/ai/translator'
import { summarizePage } from '@/shared/ai/summarizer'
import { proofreadText } from '@/shared/ai/proofreader'
import { writeFromContext } from '@/shared/ai/writer'

// -----------------------------
// Helpers to drive the in-page React panel (content script)
// -----------------------------
function openPanel(tabId: number | undefined, payload: { title: string; message: string }) {
  if (!tabId) return
  return chrome.tabs.sendMessage(tabId, { type: 'DACTI_PANEL_OPEN', ...payload })
}
function updatePanel(tabId: number | undefined, payload: { title?: string; message: string }) {
  if (!tabId) return
  return chrome.tabs.sendMessage(tabId, { type: 'DACTI_PANEL_UPDATE', ...payload })
}
function sendAltTable(tabId: number | undefined, items: any[]) {
  if (!tabId) return
  return chrome.tabs.sendMessage(tabId, { type: 'DACTI_PANEL_ALTTABLE', items })
}
function progress(tabId: number | undefined, value: number) {
  if (!tabId) return
  return chrome.tabs.sendMessage(tabId, { type: 'DACTI_PROGRESS', value })
}

// Toggle the Stop button in the content script
function stopToggle(tabId: number | undefined, show: boolean) {
  if (!tabId) return
  return chrome.tabs.sendMessage(tabId, { type: show ? 'DACTI_STOP_SHOW' : 'DACTI_STOP_HIDE' })
}
function pathLabel(localOnly: boolean, cached = false) {
  const base = localOnly ? '🧠 Local (on-device)' : '☁️ Cloud'
  return cached ? base + ' • (cached)' : base
}

// -----------------------------
// Small session cache
// -----------------------------
async function cacheGet(key: string): Promise<any | null> {
  const v = await chrome.storage.session.get(key)
  return v?.[key] ?? null
}
async function cacheSet(key: string, value: any) {
  await chrome.storage.session.set({ [key]: value })
}
function hash(str: string) {
  let h = 0, i = 0, len = str.length
  while (i < len) { h = (h << 5) - h + str.charCodeAt(i++) | 0 }
  return String(h >>> 0)
}

// -----------------------------
// Basic PII masker (only for cloud path)
// -----------------------------
function maskPII(s: string) {
  return s
    // emails
    .replace(/([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+)\.[a-zA-Z]{2,}/g, '[EMAIL]')
    // phone numbers (broad heuristic)
    .replace(/\b(?:\+\d{1,3}[\s-]?)?(?:\(?\d{2,3}\)?[\s-]?)?\d{3}[\s-]?\d{2,4}[\s-]?\d{2,4}\b/g, '[PHONE]')
    // payment cards (13–19 digits)
    .replace(/\b(?:\d[ -]*?){13,19}\b/g, '[CARD]')
}

// -----------------------------
// Context Menus (right-click)
// -----------------------------
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'dacti-translate', title: 'DACTI • Translate selection', contexts: ['selection'] })
    chrome.contextMenus.create({ id: 'dacti-rewrite',   title: 'DACTI • Rewrite…',            contexts: ['selection'] })
    chrome.contextMenus.create({ id: 'dacti-summarize', title: 'DACTI • Summarize selection', contexts: ['selection'] })
  })
})

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  try {
    const { dactiLocalOnly, dactiMaskPII } = await chrome.storage.local.get(['dactiLocalOnly','dactiMaskPII'])
    const localOnly = Boolean(dactiLocalOnly)
    const t = startTask(tab?.id || -1)
    const signal = t.abort.signal
    stopToggle(tab?.id, true)

    if (info.menuItemId === 'dacti-translate' && info.selectionText) {
      await openPanel(tab?.id, { title: 'DACTI • Translation', message: '⏳ Translating…' })
      const key = 'tr:' + hash(info.selectionText + '|en' + Number(localOnly))
      const cached = await cacheGet(key)
      if (cached) return updatePanel(tab?.id, { message: String(cached).slice(0,5000) })
      const input = (!localOnly && dactiMaskPII) ? maskPII(info.selectionText) : info.selectionText
      const out = await translateText(input, 'en', { localOnly, signal })
      await cacheSet(key, out)
      if (getTask(tab?.id || -1)?.canceled) return
      return updatePanel(tab?.id, { message: String(out).slice(0,5000) })
    }

    if (info.menuItemId === 'dacti-rewrite' && info.selectionText) {
      await openPanel(tab?.id, { title: 'DACTI • Rewrite', message: '⏳ Rewriting…' })
      const key = 'rw:' + hash(info.selectionText + '|simplify' + Number(localOnly))
      const cached = await cacheGet(key)
      if (cached) return updatePanel(tab?.id, { message: String(cached).slice(0,5000) })
      const input = (!localOnly && dactiMaskPII) ? maskPII(info.selectionText) : info.selectionText
      const out = await rewriteText(input, { style: 'simplify' }, { localOnly, signal })
      await cacheSet(key, out)
      if (getTask(tab?.id || -1)?.canceled) return
      return updatePanel(tab?.id, { message: String(out).slice(0,5000) })
    }

    if (info.menuItemId === 'dacti-summarize' && info.selectionText) {
      await openPanel(tab?.id, { title: 'DACTI • Summary', message: '⏳ Summarizing…' })
      const key = 'sm:' + hash(info.selectionText + Number(localOnly))
      const cached = await cacheGet(key)
      if (cached) return updatePanel(tab?.id, { message: String(cached).slice(0,5000) })
      const input = (!localOnly && dactiMaskPII) ? maskPII(info.selectionText) : info.selectionText
      const out = await summarizePage(input, { localOnly, signal })
      await cacheSet(key, out)
      if (getTask(tab?.id || -1)?.canceled) return
      return updatePanel(tab?.id, { message: String(out).slice(0,5000) })
    }
  } catch (e: any) {
    await updatePanel(tab?.id, { title: 'DACTI • Error', message: e?.message ? String(e.message) : String(e) })
  } finally {
    stopToggle(tab?.id, false)
  }
})

// -----------------------------
// Toolbar icon → open panel
// -----------------------------
chrome.action.onClicked.addListener(async (tab) => {
  await openPanel(tab.id, { title: 'DACTI', message: '' })
})

// -----------------------------
// Message bridge (panel buttons)
// -----------------------------

// --- Cloud mode auto-setup if proxy URL present ---
async function autoSetupCloudIfPossible() {
  try {
    const all = await chrome.storage.local.get(null as any)
    const get = (k: string) => (typeof all?.[k] === 'string' ? String(all[k]).trim() : '')
    const candidates = [get('dactiProxyUrl'), get('dactiProxyURL'), get('proxyUrl'), get('PROXY_URL')]
    const url = candidates.find(Boolean)
    if (!url) return
    const mode = typeof all?.dactiCloudMode === 'string' ? all.dactiCloudMode : ''
    const enabled = (typeof all?.dactiCloudEnabled === 'boolean') ? all.dactiCloudEnabled : undefined
    const patch: any = {}
    if (!mode) patch.dactiCloudMode = 'proxy'
    if (enabled === undefined) patch.dactiCloudEnabled = true
    if (Object.keys(patch).length) await chrome.storage.local.set(patch)
  } catch {}
}
chrome.runtime.onStartup?.addListener?.(autoSetupCloudIfPossible)
chrome.runtime.onInstalled.addListener(() => { autoSetupCloudIfPossible() })

chrome.runtime.onMessage.addListener(async (msg, sender) => {
  if (!msg || typeof msg !== 'object') return
  const tabId = sender?.tab?.id
  if (!tabId) return

  const { dactiLocalOnly, dactiMaskPII } = await chrome.storage.local.get(['dactiLocalOnly','dactiMaskPII'])
  const localOnly = Boolean(dactiLocalOnly)

  try {
    if (msg.type === 'DACTI_ACTION') {
      const t = startTask(tabId)
      const signal = t.abort.signal
      const params = msg.params || {}
      stopToggle(tabId, true)
      if (msg.action === 'translate') {
        await openPanel(tabId, { title: 'DACTI • Translate', message: '⏳ Translating…' })
        const fromPanel = params?.source === 'panel' && typeof params?.text === 'string'
        const sel: string = fromPanel
          ? String(params.text)
          : (await chrome.scripting.executeScript({ target: { tabId }, func: () => window.getSelection()?.toString() || '' }))[0].result
        if (!sel) return updatePanel(tabId, { message: 'Empty selection.' })
        const target = String(params.translateTarget || 'en')
        const key = 'tr:' + hash(sel + '|' + target + Number(localOnly))
        const cached = await cacheGet(key)
        if (cached) return updatePanel(tabId, { message: String(cached).slice(0,5000) })
        const input = (!localOnly && dactiMaskPII) ? maskPII(sel) : sel
        const out = await translateText(input, target as any, { localOnly, signal })
        await cacheSet(key, out)
        if (getTask(tabId)?.canceled) { stopToggle(tabId, false); return }
        return updatePanel(tabId, { message: String(out).slice(0,5000) })
      }

      if (msg.action === 'rewrite') {
        const style = String(params?.style || 'simplify')
        await openPanel(tabId, { title: 'DACTI • Rewrite', message: '⏳ Rewriting…' })
        const fromPanel = params?.source === 'panel' && typeof params?.text === 'string'
        const sel: string = fromPanel
          ? String(params.text)
          : (await chrome.scripting.executeScript({ target: { tabId }, func: () => window.getSelection()?.toString() || '' }))[0].result
        if (!sel) return updatePanel(tabId, { message: 'Empty selection.' })
        const key = 'rw:' + hash(sel + '|' + style + Number(localOnly))
        const cached = await cacheGet(key)
        if (cached) return updatePanel(tabId, { message: String(cached).slice(0,5000) })
        const input = (!localOnly && dactiMaskPII) ? maskPII(sel) : sel
        const out = await rewriteText(input, { style }, { localOnly, signal })
        await cacheSet(key, out)
        if (getTask(tabId)?.canceled) { stopToggle(tabId, false); return }
        return updatePanel(tabId, { message: String(out).slice(0,5000) })
      }

      if (msg.action === 'summarize') {
        await openPanel(tabId, { title: 'DACTI • Summarize', message: '⏳ Summarizing…' })
        const fromPanel = params?.source === 'panel' && typeof params?.text === 'string'
        let input: string
        if (fromPanel) {
          input = String(params.text)
        } else {
          const [{ result }] = await chrome.scripting.executeScript({ target: { tabId }, func: () => ({ title: document.title, text: document.body?.innerText?.slice(0, 120000) || '' }) })
          input = `${result.title}\n\n${result.text}`
        }
        if (!input.trim()) return updatePanel(tabId, { message: 'Empty selection.' })
        const masked = (!localOnly && dactiMaskPII) ? maskPII(input) : input
        const key = 'sm:' + hash(masked + String(params.summarizeMode || '') + Number(localOnly))
        const cached = await cacheGet(key)
        if (cached) return updatePanel(tabId, { message: String(cached).slice(0,5000) })
        const out = await summarizePage(masked, { localOnly, mode: params.summarizeMode, signal })
        await cacheSet(key, out)
        if (getTask(tabId)?.canceled) { stopToggle(tabId, false); return }
        return updatePanel(tabId, { message: String(out).slice(0, 5000) })
      }

      if (msg.action === 'altimages') {
        await openPanel(tabId, { title: 'DACTI • Alt Images', message: '🔎 Scanning images…' })
        const [{ result: urls }] = await chrome.scripting.executeScript({
          target: { tabId },
          func: () => Array.from(document.images).map(im => im.currentSrc || im.src).filter(Boolean)
        })
        const uniq = Array.from(new Set((urls || []) as string[])).slice(0, 24)
        if (!uniq.length) return updatePanel(tabId, { message: 'No images found on this page.' })

        const items: Array<{ src:string; alt:string; tags:string[]; preview?:string; category?: string; tone?: string }> = []
        let i = 0
        for (const src of uniq) {
          i++
          progress(tabId, i/uniq.length)
          try {
            if (localOnly) {
              const resp: any = await chrome.tabs.sendMessage(tabId, { type: 'DACTI_CAPTION_LOCAL', src })
              if (resp?.ok) {
                items.push({ src, alt: String(resp.alt||'').slice(0,120), tags: Array.isArray(resp.tags)?resp.tags:[], preview: resp.preview, category: undefined, tone: undefined })
              }
              else {
                items.push({ src, alt: '', tags: [], category: undefined, tone: undefined })
              }
            } else {
              const got: any = await chrome.tabs.sendMessage(tabId, { type: 'DACTI_IMAGE_BASE64', src })
              if (!got?.ok) { items.push({ src, alt: '', tags: [], category: undefined, tone: undefined }); continue }
              const { dactiProxyUrl, dactiProxyToken } = await chrome.storage.local.get(['dactiProxyUrl','dactiProxyToken'])
              const proxy = String(dactiProxyUrl || '').replace(/\/$/, '')
              let alt = '', tags: string[] = []
              if (proxy) {
                const prompt = 'Return STRICT JSON: {"alt":"...","tags":["a","b","c"],"category":"...","tone":"..."}.\nAlt <=120 chars, objective, non-biased.'
                const extId = (typeof chrome !== 'undefined' && chrome?.runtime?.id) ? chrome.runtime.id : ''
                const r = await fetch(`${proxy}/generate-multi`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    ...(dactiProxyToken ? { Authorization: `Bearer ${dactiProxyToken}` } : {}),
                    ...(extId ? { 'x-dacti-ext-id': extId } : {}),
                  },
                  body: JSON.stringify({ prompt, imageBase64: got.base64, mimeType: (got.preview?.startsWith('data:') ? (got.preview.split(';')[0].slice(5) || 'image/png') : 'image/png') }),
                  signal,
                })
                if (r.ok) {
                  const { text } = await r.json() as any
                  const cleaned = stripFences(text)
                  try {
                    const p = JSON.parse(cleaned)
                    if (p?.alt) alt = String(p.alt).slice(0,120)
                    if (Array.isArray(p?.tags)) tags = p.tags
                    var category: string | undefined = p?.category ? String(p.category) : undefined
                    var tone: string | undefined = p?.tone ? String(p.tone) : undefined
                    items.push({ src, alt, tags, preview: got.preview, category, tone })
                    continue
                  } catch {
                    alt = cleaned.slice(0,120)
                  }
                } else {
                  alt = ''
                }
              } else {
                // Legacy fallback
                const prompt = 'You are an alt-text generator. Respond ONLY with JSON of the form {"alt":"...","tags":["a","b","c"]}. Alt <=120 chars.'
                const { callGeminiApi } = await import('@/shared/ai/gemini-api')
                const json = await callGeminiApi(`${prompt}\n\nIMAGE_BASE64:\n${got.base64}`, { signal })
                try { const p = JSON.parse(stripFences(json)); if (p?.alt) { alt = String(p.alt).slice(0,120); tags = Array.isArray(p.tags)?p.tags:[] } else { alt = stripFences(json).slice(0,120) } } catch { alt = stripFences(json).slice(0,120) }
              }
              items.push({ src, alt, tags, preview: got.preview, category: undefined, tone: undefined })
            }
          } catch {
            items.push({ src, alt: '', tags: [], category: undefined, tone: undefined })
          }
          if (getTask(tabId)?.canceled) { stopToggle(tabId, false); return }
        }
        progress(tabId, 1)
        sendAltTable(tabId, items)
        return
      }

      if (msg.action === 'write') {
        await openPanel(tabId, { title: 'DACTI • Write', message: '⏳ Writing…' })
        let ctx: string
        if (params?.source === 'panel' && typeof params?.text === 'string') {
          ctx = String(params.text)
        } else {
          const [{ result: ctxRaw }] = await chrome.scripting.executeScript({ target: { tabId }, func: () => (document.title + "\n\n" + (document.body?.innerText?.slice(0, 5000) || '')) })
          ctx = String(ctxRaw || '')
        }
        const input = (!localOnly && dactiMaskPII) ? maskPII(ctx) : ctx
        const wt = String(params.writeType || 'email')
        const map: Record<string,string> = {
          email: 'Draft a concise email (80–120 words) in English.',
          linkedin: 'Write a professional LinkedIn post (4–6 lines) about the context. Keep it approachable and clear.',
          tweet: 'Write a short social post (max 240 chars) with a friendly tone.',
          minutes: 'Write meeting minutes: agenda, key decisions, action items with owners.',
          commit: 'Write a conventional commit message summarizing the changes (type(scope): subject).',
        }
        const key = 'wr:' + hash(input + wt + Number(localOnly))
        const cached = await cacheGet(key)
        if (cached) return updatePanel(tabId, { message: String(cached).slice(0,5000) })
        const out = await writeFromContext(input, { task: map[wt] || map.email }, { localOnly, signal })
        await cacheSet(key, out)
        if (getTask(tabId)?.canceled) { stopToggle(tabId, false); return }
        return updatePanel(tabId, { message: String(out).slice(0, 5000) })
      }
    }
  } catch (e: any) {
    return updatePanel(tabId, { title: 'DACTI • Error', message: e?.message ? String(e.message) : String(e) })
  } finally {
    stopToggle(tabId, false)
  }
})