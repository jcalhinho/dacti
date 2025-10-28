const log = (...a: any[]) => { try { console.log('[DACTI]', ...a) } catch {} }
const CANCELED_MSG = '⛔️ Request canceled by user.'
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
      updatePanel(tabId, { message: CANCELED_MSG })
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
import { callGeminiApi } from '@/shared/ai/gemini-api'

// -----------------------------
// Helpers to drive the in-page panel (content script)
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
function loading(tabId: number | undefined, show: boolean) {
  if (!tabId) return
  return chrome.tabs.sendMessage(tabId, { type: 'DACTI_LOADING', show })
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
  chrome.contextMenus.removeAll(async () => {
    // Base items
    chrome.contextMenus.create({ id: 'dacti-translate', title: 'DACTI • Translate selection', contexts: ['selection'] })
    chrome.contextMenus.create({ id: 'dacti-rewrite',   title: 'DACTI • Rewrite selection',   contexts: ['selection'] })
    chrome.contextMenus.create({ id: 'dacti-summarize', title: 'DACTI • Summarize selection', contexts: ['selection'] })

    // Read saved prefs
    const { dactiSummarizeMode, dactiTranslateTarget, dactiRewriteStyle } = await chrome.storage.local.get([
      'dactiSummarizeMode','dactiTranslateTarget','dactiRewriteStyle'
    ])

    // Summarize submenu (radio)
    const currentSum = (typeof dactiSummarizeMode === 'string') ? dactiSummarizeMode : 'bullets'
    const sumModes = [
      ['tldr',     'TL;DR (1–2 sentences)'],
      ['bullets',  '5 bullet points'],
      ['eli5',     'ELI5 (simplify)'],
      ['sections', 'By sections (H2/H3)'],
      ['facts',    'Key facts & numbers'],
    ] as const
    for (const [id, title] of sumModes) {
      chrome.contextMenus.create({
        id: `dacti-sum-${id}`,
        parentId: 'dacti-summarize',
        title,
        contexts: ['selection'],
        type: 'radio',
        checked: currentSum === id,
      })
    }

    // Translate submenu (radio)
    const currentTr = (typeof dactiTranslateTarget === 'string') ? dactiTranslateTarget : 'en'
    const trModes = [
      ['en', '→ English'],
      ['fr', '→ Français'],
      ['es', '→ Español'],
      ['de', '→ Deutsch'],
      ['pt', '→ Português'],
      ['auto', 'Auto → English'],
    ] as const
    for (const [id, title] of trModes) {
      chrome.contextMenus.create({
        id: `dacti-tr-${id}`,
        parentId: 'dacti-translate',
        title,
        contexts: ['selection'],
        type: 'radio',
        checked: currentTr === id,
      })
    }

    // Rewrite submenu (radio)
    const currentRw = (typeof dactiRewriteStyle === 'string') ? dactiRewriteStyle : 'simplify'
    const rwModes = [
      ['simplify', 'Simplify (clear & plain)'],
      ['formal',   'More formal/professional'],
      ['friendly', 'Friendlier / conversational'],
      ['shorten',  'Shorter / concise'],
      ['expand',   'Longer / more details'],
    ] as const
    for (const [id, title] of rwModes) {
      chrome.contextMenus.create({
        id: `dacti-rw-${id}`,
        parentId: 'dacti-rewrite',
        title,
        contexts: ['selection'],
        type: 'radio',
        checked: currentRw === id,
      })
    }
  })
})

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  try {
    log('contextMenu clicked', info.menuItemId, { localOnly: undefined })
    const { dactiLocalOnly, dactiMaskPII } = await chrome.storage.local.get(['dactiLocalOnly','dactiMaskPII'])
    const localOnly = Boolean(dactiLocalOnly)
    const t = startTask(tab?.id || -1)
    const signal = t.abort.signal
    stopToggle(tab?.id, true)

    if ((info.menuItemId === 'dacti-translate' || String(info.menuItemId).startsWith('dacti-tr-')) && info.selectionText) {
      await openPanel(tab?.id, { title: 'DACTI', message: '' })
      loading(tab?.id, true)

      // Determine target language
      let target = 'en'
      if (String(info.menuItemId).startsWith('dacti-tr-')) {
        target = String(info.menuItemId).replace('dacti-tr-', '')
        try { await chrome.storage.local.set({ dactiTranslateTarget: target }) } catch {}
      } else {
        const { dactiTranslateTarget } = await chrome.storage.local.get(['dactiTranslateTarget'])
        target = (typeof dactiTranslateTarget === 'string') ? dactiTranslateTarget : 'en'
      }

      const key = 'tr:' + hash(info.selectionText + '|' + target + Number(localOnly))
      const cached = await cacheGet(key)
      if (cached) return updatePanel(tab?.id, { message: String(cached).slice(0,5000) })

      const raw = info.selectionText
      const input = (!localOnly && dactiMaskPII) ? maskPII(raw) : raw
      log('PATH', localOnly ? 'LOCAL' : 'CLOUD', { action: 'translate', source: 'context', target })

      let out: string
      try {
        if (localOnly) {
          const resp: any = await chrome.tabs.sendMessage(tab?.id as number, { type: 'DACTI_TRANSLATE_LOCAL', text: input, target: (target === 'auto' ? 'en' : target) })
          if (!resp?.ok) throw new Error(resp?.error || 'Local translate failed')
          out = String(resp.text || '')
          if (!out.trim()) out = '(no translation produced by local model)'
        } else {
          // Cloud path via shared translator; if it fails (offline), fallback to local
          try {
            out = await translateText(input, (target === 'auto' ? 'en' : target) as any, { localOnly: false, signal })
          } catch (e: any) {
            const msg = String(e?.message || e || '')
            log('translate cloud path error, attempting local fallback', msg)
            const resp: any = await chrome.tabs.sendMessage(tab?.id as number, { type: 'DACTI_TRANSLATE_LOCAL', text: input, target: (target === 'auto' ? 'en' : target) })
            if (!resp?.ok) throw new Error(`Cloud translate failed and local fallback failed: ${resp?.error || 'unknown error'}`)
            out = String(resp.text || '')
            if (!out.trim()) out = '(no translation produced by local model)'
          }
        }
      } catch (e) {
        updatePanel(tab?.id, { title: 'DACTI • Translate', message: String((e as any)?.message || e) })
        loading(tab?.id, false)
        return
      }

      await cacheSet(key, out)
      if (getTask(tab?.id || -1)?.canceled) return
      return updatePanel(tab?.id, { message: String(out).slice(0,5000) })
    }

    if ((info.menuItemId === 'dacti-rewrite' || String(info.menuItemId).startsWith('dacti-rw-')) && info.selectionText) {
      await openPanel(tab?.id, { title: 'DACTI', message: '' })
      loading(tab?.id, true)

      // Determine style: submenu explicit or last saved for parent click
      let style = 'simplify'
      if (String(info.menuItemId).startsWith('dacti-rw-')) {
        style = String(info.menuItemId).replace('dacti-rw-', '')
        try { await chrome.storage.local.set({ dactiRewriteStyle: style }) } catch {}
      } else {
        const { dactiRewriteStyle } = await chrome.storage.local.get(['dactiRewriteStyle'])
        style = (typeof dactiRewriteStyle === 'string') ? dactiRewriteStyle : 'simplify'
      }

      const key = 'rw:' + hash(info.selectionText + '|' + style + Number(localOnly))
      const cached = await cacheGet(key)
      if (cached) return updatePanel(tab?.id, { message: String(cached).slice(0,5000) })

      const raw = info.selectionText
      const input = (!localOnly && dactiMaskPII) ? maskPII(raw) : raw
      log('PATH', localOnly ? 'LOCAL' : 'CLOUD', { action: 'rewrite', source: 'context', style })

      let out: string
      if (localOnly) {
        const resp: any = await chrome.tabs.sendMessage(tab?.id as number, { type: 'DACTI_REWRITE_LOCAL', text: input, style })
        if (!resp?.ok) throw new Error(resp?.error || 'Local rewrite failed')
        out = String(resp.text || '')
      } else {
        out = await rewriteText(input, { style }, { localOnly, signal })
      }

      await cacheSet(key, out)
      if (getTask(tab?.id || -1)?.canceled) return
      return updatePanel(tab?.id, { message: String(out).slice(0,5000) })
    }

    if ((info.menuItemId === 'dacti-summarize' || String(info.menuItemId).startsWith('dacti-sum-')) && info.selectionText) {
      await openPanel(tab?.id, { title: 'DACTI', message: '' })
      loading(tab?.id, true)

      // Determine mode: submenu explicit or last saved for parent click
      let mode = 'bullets'
      if (String(info.menuItemId).startsWith('dacti-sum-')) {
        mode = String(info.menuItemId).replace('dacti-sum-', '')
        try { await chrome.storage.local.set({ dactiSummarizeMode: mode }) } catch {}
      } else {
        const { dactiSummarizeMode } = await chrome.storage.local.get(['dactiSummarizeMode'])
        mode = (typeof dactiSummarizeMode === 'string') ? dactiSummarizeMode : 'bullets'
      }

      const key = 'sm:' + hash(info.selectionText + '|' + mode + Number(localOnly))
      const cached = await cacheGet(key)
      if (cached) return updatePanel(tab?.id, { message: String(cached).slice(0,5000) })

      const input = (!localOnly && dactiMaskPII) ? maskPII(info.selectionText) : info.selectionText
      log('PATH', localOnly ? 'LOCAL' : 'CLOUD', { action: 'summarize', source: 'context', mode })

      let out: string
      if (localOnly) {
        const resp: any = await chrome.tabs.sendMessage(tab?.id as number, { type: 'DACTI_SUMMARIZE_LOCAL', text: input, mode })
        if (!resp?.ok) throw new Error(resp?.error || 'Local summarize failed')
        out = String(resp.text || '')
        if (!out.trim()) { out = '(no summary produced by local model)' }
      } else {
        out = await summarizePage(input, { localOnly, mode, signal })
      }

      await cacheSet(key, out)
      if (getTask(tab?.id || -1)?.canceled) return
      return updatePanel(tab?.id, { message: String(out).slice(0,5000) })
    }
  } catch (e: any) {
    await updatePanel(tab?.id, { title: 'DACTI', message: e?.message ? String(e.message) : String(e) })
  } finally {
    loading(tab?.id, false)
    stopToggle(tab?.id, false)
  }
})
// Keyboard shortcuts (panel-independent). Requires manifest "commands" entries.
chrome.commands?.onCommand.addListener(async (command) => {
  try {
    if (!/^dacti-sum-(tldr|bullets|eli5|sections)$/.test(command)) return
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id) return

    const { dactiLocalOnly, dactiMaskPII } = await chrome.storage.local.get(['dactiLocalOnly','dactiMaskPII'])
    const localOnly = Boolean(dactiLocalOnly)

    const t = startTask(tab.id)
    const signal = t.abort.signal
    stopToggle(tab.id, true)

    await openPanel(tab.id, { title: 'DACTI', message: '' })
    loading(tab.id, true)

    const [{ result: sel } = { result: '' }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.getSelection()?.toString() || ''
    })
    if (!sel) { updatePanel(tab.id, { message: 'Empty selection.' }); return }

    const mode = command.replace('dacti-sum-','')
    try { await chrome.storage.local.set({ dactiSummarizeMode: mode }) } catch {}

    const key = 'sm:' + hash(sel + '|' + mode + Number(localOnly))
    const cached = await cacheGet(key)
    if (cached) { updatePanel(tab.id, { message: String(cached).slice(0,5000) }); return }

    const input = (!localOnly && dactiMaskPII) ? maskPII(sel) : sel
    log('PATH', localOnly ? 'LOCAL' : 'CLOUD', { action: 'summarize', source: 'command', mode })

    let out: string
    if (localOnly) {
      const resp: any = await chrome.tabs.sendMessage(tab.id, { type: 'DACTI_SUMMARIZE_LOCAL', text: input, mode })
      if (!resp?.ok) throw new Error(resp?.error || 'Local summarize failed')
      out = String(resp.text || '')
      if (!out.trim()) { out = '(no summary produced by local model)' }
    } else {
      out = await summarizePage(input, { localOnly, mode, signal })
    }

    await cacheSet(key, out)
    if (getTask(tab.id)?.canceled) { stopToggle(tab.id, false); return }
    updatePanel(tab.id, { message: String(out).slice(0,5000) })
  } catch (e) {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (tab?.id) updatePanel(tab.id, { title: 'DACTI • Error', message: String((e as any)?.message || e) })
    } catch {}
  } finally {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (tab?.id) { loading(tab.id, false); stopToggle(tab.id, false) }
    } catch {}
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
  const localOnly = (typeof (msg as any).localOnly === 'boolean') ? Boolean((msg as any).localOnly) : Boolean(dactiLocalOnly)

  log('panel action received', msg?.action, { localOnly, tabId })

  try {
    if (msg.type === 'DACTI_ACTION') {
      const t = startTask(tabId)
      const signal = t.abort.signal
      const params = msg.params || {}
      stopToggle(tabId, true)
      if (msg.action === 'translate') {
        await openPanel(tabId, { title: 'DACTI', message: '' })
        loading(tabId, true)
        const fromPanel = params?.source === 'panel' && typeof params?.text === 'string'
        let sel: string = fromPanel
          ? String(params.text)
          : (await chrome.scripting.executeScript({ target: { tabId }, func: () => window.getSelection()?.toString() || '' }))[0].result
        if (!sel) {
          const [{ result }] = await chrome.scripting.executeScript({ target: { tabId }, func: () => ({ title: document.title, text: document.body?.innerText?.slice(0, 120000) || '' }) })
          sel = `${result.title}\n\n${result.text}`
        }
        if (!sel.trim()) return updatePanel(tabId, { message: 'The page is empty or no text was selected.' })
        const target = String(params.translateTarget || 'en')
        const key = 'tr:' + hash(sel + '|' + target + Number(localOnly))
        const cached = await cacheGet(key)
        if (cached) return updatePanel(tabId, { message: String(cached).slice(0,5000) })
        const input = (!localOnly && dactiMaskPII) ? maskPII(sel) : sel
      log('PATH', localOnly ? 'LOCAL' : 'CLOUD', { action: 'translate' })
        let out: string
        if (localOnly) {
          const resp: any = await chrome.tabs.sendMessage(tabId, { type: 'DACTI_TRANSLATE_LOCAL', text: input, target })
          if (!resp?.ok) throw new Error(resp?.error || 'Local translate failed')
          out = String(resp.text || '')
        } else {
          out = await translateText(input, target as any, { localOnly, signal })
        }
        log('translate done', { localOnly, len: out?.length })
        await cacheSet(key, out)
        if (getTask(tabId)?.canceled) { stopToggle(tabId, false); return }
        return updatePanel(tabId, { message: String(out).slice(0,5000) })
      }

      if (msg.action === 'rewrite') {
        const style = String(params?.style || 'simplify')
        await openPanel(tabId, { title: 'DACTI', message: '' })
        loading(tabId, true)
        const fromPanel = params?.source === 'panel' && typeof params?.text === 'string'
        let sel: string = fromPanel
          ? String(params.text)
          : (await chrome.scripting.executeScript({ target: { tabId }, func: () => window.getSelection()?.toString() || '' }))[0].result
        if (!sel) {
          const [{ result }] = await chrome.scripting.executeScript({ target: { tabId }, func: () => ({ title: document.title, text: document.body?.innerText?.slice(0, 120000) || '' }) })
          sel = `${result.title}\n\n${result.text}`
        }
        if (!sel.trim()) return updatePanel(tabId, { message: 'The page is empty or no text was selected.' })
        const key = 'rw:' + hash(sel + '|' + style + Number(localOnly))
        const cached = await cacheGet(key)
        if (cached) return updatePanel(tabId, { message: String(cached).slice(0,5000) })
        const input = (!localOnly && dactiMaskPII) ? maskPII(sel) : sel
      log('PATH', localOnly ? 'LOCAL' : 'CLOUD', { action: 'rewrite' })
        let out: string
        if (localOnly) {
          const resp: any = await chrome.tabs.sendMessage(tabId, { type: 'DACTI_REWRITE_LOCAL', text: input, style })
          if (!resp?.ok) throw new Error(resp?.error || 'Local rewrite failed')
          out = String(resp.text || '')
        } else {
          out = await rewriteText(input, { style }, { localOnly, signal })
        }
        log('rewrite done', { localOnly, len: out?.length })
        await cacheSet(key, out)
        if (getTask(tabId)?.canceled) { stopToggle(tabId, false); return }
        return updatePanel(tabId, { message: String(out).slice(0,5000) })
      }

      if (msg.action === 'summarize') {
        await openPanel(tabId, { title: 'DACTI', message: '' })
        loading(tabId, true)
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
        log('PATH', localOnly ? 'LOCAL' : 'CLOUD', { action: 'summarize', mode: params?.summarizeMode })
        const key = 'sm:' + hash(masked + String(params.summarizeMode || '') + Number(localOnly))
        const cached = await cacheGet(key)
        if (cached) return updatePanel(tabId, { message: String(cached).slice(0,5000) })
        let out: string
        if (localOnly) {
          const resp: any = await chrome.tabs.sendMessage(tabId, { type: 'DACTI_SUMMARIZE_LOCAL', text: masked, mode: params.summarizeMode })
          if (!resp?.ok) throw new Error(resp?.error || 'Local summarize failed')
          out = String(resp.text || '')
          if (!out.trim()) { out = '(no summary produced by local model)' }
        } else {
          try {
            out = await summarizePage(masked, { localOnly, mode: params.summarizeMode, signal })
          } catch (err: any) {
            log('summarize cloud path error, falling back to direct API', err?.message)
            out = ''
          }
          if (!out || /input\s+is\s+undefined/i.test(String(out))) {
            try {
              const m = String(params.summarizeMode || 'bullets')
              const basePrompt = "Return only plain text, no markdown or special formatting. "
              const prompt = basePrompt + (
                m === 'tldr'     ? `TL;DR in 1–2 sentences.\n\n${masked}` :
                m === 'eli5'     ? `Explain simply (ELI5). Use short sentences.\n\n${masked}` :
                m === 'sections' ? `Summarize by sections with H2/H3 headings.\n\n${masked}` :
                m === 'facts'    ? `Extract key facts and numbers as bullet points.\n\n${masked}` :
                                   `Summarize in 5 concise bullet points.\n\n${masked}`
              )
              out = await callGeminiApi(prompt, { signal })
            } catch (e: any) {
              if (!out) throw e
            }
          }
        }
        log('summarize done', { localOnly, len: out?.length })
        await cacheSet(key, out)
        if (getTask(tabId)?.canceled) { stopToggle(tabId, false); return }
        return updatePanel(tabId, { message: String(out).slice(0, 5000) })
      }

      if (msg.action === 'write') {
        await openPanel(tabId, { title: 'DACTI', message: '' })
        loading(tabId, true)
        let ctx: string
        if (params?.source === 'panel' && typeof params?.text === 'string') {
          ctx = String(params.text)
        } else {
          const [{ result: ctxRaw }] = await chrome.scripting.executeScript({ target: { tabId }, func: () => (document.title + "\n\n" + (document.body?.innerText?.slice(0, 5000) || '')) })
          ctx = String(ctxRaw || '')
        }
        const input = (!localOnly && dactiMaskPII) ? maskPII(ctx) : input
        const wt = String(params.writeType || 'email')
        const basePrompt = "Return only plain text, no markdown or special formatting. "
        const map: Record<string,string> = {
          email: basePrompt + 'Draft a concise email (400-600 words) in English.',
          linkedin: basePrompt + 'Write a professional LinkedIn post (300-400 words) about the context. Keep it approachable and clear.',
          tweet: basePrompt + 'Write a short social post (max 1500 chars) with a friendly tone.',
          minutes: basePrompt + 'Write meeting minutes: agenda, key decisions, action items with owners.',
          commit: basePrompt + 'Write a conventional commit message summarizing the changes (type(scope): subject).',
        }
        const key = 'wr:' + hash(input + wt + Number(localOnly))
        const cached = await cacheGet(key)
        if (cached) return updatePanel(tabId, { message: String(cached).slice(0,5000) })
      log('PATH', localOnly ? 'LOCAL' : 'CLOUD', { action: 'write' })
let out: string
if (localOnly) {
  const resp: any = await chrome.tabs.sendMessage(tabId, {
    type: 'DACTI_GENERATE_LOCAL_TEXT',
    context: input,
    task: map[wt] || map.email,
  })
  if (!resp?.ok) throw new Error(resp?.error || 'Local write failed')
  out = String(resp.text || '')
} else {
  out = await writeFromContext(input, { task: map[wt] || map.email }, { localOnly, signal })
}
await cacheSet(key, out)
if (getTask(tabId)?.canceled) { stopToggle(tabId, false); return }
return updatePanel(tabId, { message: String(out).slice(0, 5000) })
      }

      if (msg.action === 'proofread') {
        await openPanel(tabId, { title: 'DACTI', message: '' })
        loading(tabId, true)
        const text = String(params.text || '')
        if (!text.trim()) return updatePanel(tabId, { message: 'Empty text.' })

        const key = 'pr:' + hash(text + Number(localOnly))
        const cached = await cacheGet(key)
        if (cached) return updatePanel(tabId, { message: String(cached).slice(0,5000) })

        const input = (!localOnly && dactiMaskPII) ? maskPII(text) : text
        log('PATH', localOnly ? 'LOCAL' : 'CLOUD', { action: 'proofread' })

        let out: string
        if (localOnly) {
          // Proofreading is not available in local mode, fallback to cloud
          out = await proofreadText(input, { localOnly: false, signal })
        } else {
          out = await proofreadText(input, { localOnly, signal })
        }

        log('proofread done', { localOnly, len: out?.length })
        await cacheSet(key, out)
        if (getTask(tabId)?.canceled) { stopToggle(tabId, false); return }
        return updatePanel(tabId, { message: String(out).slice(0, 5000) })
      }
    }
  } catch (e: any) {
    log('panel action error', msg?.action, e?.message)
    const canceled = !!getTask(tabId)?.canceled || String(e?.name||'').toLowerCase() === 'aborterror'
    return updatePanel(tabId, { title: 'DACTI • Error', message: canceled ? CANCELED_MSG : (e?.message ? String(e.message) : String(e)) })
  } finally {
    loading(tabId, false)
    stopToggle(tabId, false)
  }
})