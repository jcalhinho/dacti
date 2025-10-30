const DBG = true
const debugWarn = (...a: any[]) => {
  if (!DBG) return
  try { console.warn('[DACTI][DBG]', ...a) } catch {}
}
const log = (...a: any[]) => {
  try { console.log('[DACTI]', ...a) } catch (err) { debugWarn('console.log failed', err) }
}
const CANCELED_MSG = '⛔️ Request canceled by user.'
type PanelAction = 'summarize' | 'translate' | 'write' | 'rewrite' | 'proofread'

async function markPanelActive(tabId: number | undefined, action: PanelAction) {
  if (!tabId) return
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'DACTI_PANEL_ACTIVE', kind: action })
  } catch (err) {
    const msg = String((err as any)?.message || err || '')
    if (!/receiving end does not exist/i.test(msg)) {
      debugWarn('Failed to set panel active state', { tabId, action, err: msg })
    }
  }
}
// --- Task management for cancellation ---
const tasks = new Map<number, { abort: AbortController, canceled: boolean, jobId: number }>()
let seq = 0
function startTask(tabId: number) {
  const t = { abort: new AbortController(), canceled: false, jobId: ++seq }
  const prev = tasks.get(tabId)
  if (prev) {
    try { prev.abort.abort() } catch (err) { debugWarn('Failed to abort previous task', { tabId, err }) }
  }
  tasks.set(tabId, t)
  return t
}
function getTask(tabId: number) { return tasks.get(tabId) }
function cancelTask(tabId: number) {
  const t = tasks.get(tabId)
  if (t) {
    t.canceled = true
    try { t.abort.abort() } catch (err) { debugWarn('Abort controller cancel failed', { tabId, err }) }
  }
}

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (!msg || typeof msg !== 'object') return
  if (msg.type === 'DACTI_CANCEL') {
    const tabId = sender?.tab?.id
    if (tabId) {
      cancelTask(tabId)
      if (!(msg as any).silent) {
        updatePanel(tabId, { message: CANCELED_MSG })
        progress(tabId, 1)
      }
    }
  }
})
function stripFences(s: string): string { const m = String(s||'').match(/```(?:json)?\s*([\s\S]*?)```/i); return (m?m[1]:String(s||'')).trim() }
import { rewriteText } from '@/shared/ai/rewriter'
import { translateText } from '@/shared/ai/translator'
import { summarizePage, isSumMode } from '@/shared/ai/summarizer'
import type { SummarizeMode } from '@/shared/ai/summarizer'
import { proofreadText } from '@/shared/ai/proofreader'
import { writeFromContext } from '@/shared/ai/writer'
import { callGeminiApi } from '@/shared/ai/gemini-api'
import { maskPII } from '@/shared/utils/mask'
// --- Chunking helpers (paragraph-aware + sequential mapper) ---
function chunkText(s: string, max = 6000): string[] {
  const clean = String(s || '').replace(/\r/g,'').replace(/\t/g,' ').replace(/ {2,}/g,' ')
  const paras = clean.split(/\n{2,}/)
  const out: string[] = []
  let buf = ''
  for (const p of paras) {
    const add = buf ? (buf + '\n\n' + p) : p
    if (add.length <= max) {
      buf = add
    } else {
      if (buf) out.push(buf)
      if (p.length <= max) {
        buf = p
      } else {
        for (let i = 0; i < p.length; i += max) out.push(p.slice(i, i + max))
        buf = ''
      }
    }
  }
  if (buf) out.push(buf)
  return out
}

async function mapChunks(
  text: string,
  max: number,
  worker: (part: string, i: number, total: number) => Promise<string>,
  joiner = '\n'
): Promise<string> {
  const parts = chunkText(text, max)
  const outs: string[] = []
  for (let i = 0; i < parts.length; i++) {
    outs.push(await worker(parts[i], i, parts.length))
  }
  return outs.join(joiner)
}

// -----------------------------
// Helpers to drive the in-page panel (content script)
// -----------------------------
function openPanel(tabId: number | undefined, payload: { title: string; message?: string }) {
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

function sanitizeError(e: any): string {
  const msg = String(e?.message || e || 'An unknown error occurred.')
  if (/fetch failed|network error|offline/i.test(msg)) {
    return 'Network error. Please check your connection.'
  }
  return msg.substring(0, 200)
}

// -----------------------------
// PII masker with Luhn check for credit cards
// -----------------------------
import { maskPII } from '@/shared/utils/mask'

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
      ['fr', '→ French'],
      ['es', '→ Spanish'],
      ['de', '→ German'],
      ['pt', '→ Portuguese'],
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
      await openPanel(tab?.id, { title: 'DACTI', message: '' });
      await loading(tab?.id, true);
      await markPanelActive(tab?.id, 'translate');

      // Determine target language
      let target = 'en'
      if (String(info.menuItemId).startsWith('dacti-tr-')) {
        target = String(info.menuItemId).replace('dacti-tr-', '')
        try { await chrome.storage.local.set({ dactiTranslateTarget: target }) } catch (err) { debugWarn('Failed to store translate target', { err, target }) }
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
        updatePanel(tab?.id, { title: 'DACTI • Translate', message: sanitizeError(e) })
        loading(tab?.id, false)
        return
      }

      await cacheSet(key, out)
      if (getTask(tab?.id || -1)?.canceled) return
      return updatePanel(tab?.id, { message: String(out).slice(0,5000) })
    }

    if ((info.menuItemId === 'dacti-rewrite' || String(info.menuItemId).startsWith('dacti-rw-')) && info.selectionText) {
      await openPanel(tab?.id, { title: 'DACTI', message: '' });
      await loading(tab?.id, true);
      await markPanelActive(tab?.id, 'rewrite');

      // Determine style: submenu explicit or last saved for parent click
      let style = 'simplify'
      if (String(info.menuItemId).startsWith('dacti-rw-')) {
        style = String(info.menuItemId).replace('dacti-rw-', '')
        try { await chrome.storage.local.set({ dactiRewriteStyle: style }) } catch (err) { debugWarn('Failed to store rewrite style', { err, style }) }
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
      await openPanel(tab?.id, { title: 'DACTI', message: '' });
      await loading(tab?.id, true);
      await markPanelActive(tab?.id, 'summarize');

      // Determine mode: submenu explicit or last saved for parent click
      let mode: SummarizeMode = 'bullets'
      if (String(info.menuItemId).startsWith('dacti-sum-')) {
        const parsed = String(info.menuItemId).replace('dacti-sum-', '')
        if (isSumMode(parsed)) {
          mode = parsed
          try { await chrome.storage.local.set({ dactiSummarizeMode: mode }) } catch (err) { debugWarn('Failed to store summarize mode', { err, mode }) }
        } else {
          debugWarn('Invalid summarize mode from context menu', { parsed })
        }
      } else {
        const { dactiSummarizeMode } = await chrome.storage.local.get(['dactiSummarizeMode'])
        if (isSumMode(dactiSummarizeMode)) {
          mode = dactiSummarizeMode
        }
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
    await updatePanel(tab?.id, { title: 'DACTI', message: sanitizeError(e) })
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

    await openPanel(tab.id, { title: 'DACTI', message: '' });
    await loading(tab.id, true);
    await markPanelActive(tab.id, 'summarize');

    const [{ result: sel } = { result: '' }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.getSelection()?.toString() || ''
    })
    if (!sel) { updatePanel(tab.id, { message: 'Empty selection.' }); return }

    const modeStr = command.replace('dacti-sum-','')
    const mode: SummarizeMode = isSumMode(modeStr) ? modeStr : 'bullets'
    try { await chrome.storage.local.set({ dactiSummarizeMode: mode }) } catch (err) { debugWarn('Failed to store summarize mode (command)', { err, mode }) }

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
      if (tab?.id) updatePanel(tab.id, { title: 'DACTI • Error', message: sanitizeError(e) })
    } catch (err) { debugWarn('Failed to propagate command error to panel', err) }
  } finally {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (tab?.id) { loading(tab.id, false); stopToggle(tab.id, false) }
    } catch (err) { debugWarn('Failed to reset loading state after command', err) }
  }
})


// -----------------------------
// Toolbar icon → open panel
// -----------------------------
chrome.action.onClicked.addListener(async (tab) => {
  await openPanel(tab.id, { title: 'DACTI', message: undefined })
})

// -----------------------------
// Message bridge (panel buttons)
// -----------------------------

// --- Cloud mode auto-setup if proxy URL present ---
async function autoSetupCloudIfPossible() {
  try {
    const raw = (await chrome.storage.local.get(null as any)) as unknown
    const all = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {}
    const get = (k: string) => {
      const v = all[k]
      return typeof v === 'string' ? v.trim() : ''
    }
    const candidates = [get('dactiProxyUrl'), get('dactiProxyURL'), get('proxyUrl'), get('PROXY_URL')]
    const url = candidates.find(Boolean)
    if (!url) return
    const modeRaw = all['dactiCloudMode']
    const mode = typeof modeRaw === 'string' ? modeRaw : ''
    const enabledRaw = all['dactiCloudEnabled']
    const enabled = (typeof enabledRaw === 'boolean') ? enabledRaw : undefined
    const patch: any = {}
    if (!mode) patch.dactiCloudMode = 'proxy'
    if (enabled === undefined) patch.dactiCloudEnabled = true
    if (Object.keys(patch).length) await chrome.storage.local.set(patch)
  } catch (err) { debugWarn('autoSetupCloudIfPossible failed', err) }
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
        await loading(tabId, true);
        await markPanelActive(tabId, 'translate');
        const fromPanel = params?.source === 'panel' && typeof params?.text === 'string'
        const selResult = fromPanel
          ? String(params.text)
          : (await chrome.scripting.executeScript({ target: { tabId }, func: () => window.getSelection()?.toString() || '' }))[0]?.result
        let sel = typeof selResult === 'string' ? selResult : ''
        if (!sel) {
          const [{ result }] = await chrome.scripting.executeScript({ target: { tabId }, func: () => ({ title: document.title, text: document.body?.innerText?.slice(0, 120000) || '' }) })
          sel = `${result?.title}\n\n${result?.text}`
        }
        if (!sel.trim()) return updatePanel(tabId, { message: 'The page is empty or no text was selected.' })
        const target = String(params.translateTarget || 'en')
        const key = 'tr:' + hash(sel + '|' + target + Number(localOnly))
        const cached = await cacheGet(key)
        if (cached) return updatePanel(tabId, { message: String(cached).slice(0,5000) })
        const input = (!localOnly && dactiMaskPII) ? maskPII(sel) : sel
        log('PATH', localOnly ? 'LOCAL' : 'CLOUD', { action: 'translate' })
        // --- Chunked translation ---
        const MAX_IN = 6000
        let out: string
        if (localOnly) {
          out = await mapChunks(input, MAX_IN, async (part) => {
            const resp: any = await chrome.tabs.sendMessage(tabId, { type: 'DACTI_TRANSLATE_LOCAL', text: part, target })
            if (!resp?.ok) throw new Error(resp?.error || 'Local translate failed')
            return String(resp.text || '')
          }, '\n')
        } else {
          out = await mapChunks(input, MAX_IN, async (part) => {
            return await translateText(part, target as any, { localOnly: false, signal })
          }, '\n')
        }
        log('translate done', { localOnly, len: out?.length })
        await cacheSet(key, out)
        if (getTask(tabId)?.canceled) { stopToggle(tabId, false); return }
        return updatePanel(tabId, { message: String(out).slice(0,5000) })
      }

      if (msg.action === 'rewrite') {
        const style = String(params?.style || 'simplify')
        await loading(tabId, true);
        await markPanelActive(tabId, 'rewrite');
        const fromPanel = params?.source === 'panel' && typeof params?.text === 'string'
        const selResult = fromPanel
          ? String(params.text)
          : (await chrome.scripting.executeScript({ target: { tabId }, func: () => window.getSelection()?.toString() || '' }))[0]?.result
        let sel = typeof selResult === 'string' ? selResult : ''
        if (!sel) {
          const [{ result }] = await chrome.scripting.executeScript({ target: { tabId }, func: () => ({ title: document.title, text: document.body?.innerText?.slice(0, 120000) || '' }) })
          sel = `${result?.title}\n\n${result?.text}`
        }
        if (!sel.trim()) return updatePanel(tabId, { message: 'The page is empty or no text was selected.' })
        const key = 'rw:' + hash(sel + '|' + style + Number(localOnly))
        const cached = await cacheGet(key)
        if (cached) return updatePanel(tabId, { message: String(cached).slice(0,5000) })
        const input = (!localOnly && dactiMaskPII) ? maskPII(sel) : sel
        log('PATH', localOnly ? 'LOCAL' : 'CLOUD', { action: 'rewrite' })
        // --- Chunked rewrite ---
        const MAX_IN = 6000
        let out: string
        if (localOnly) {
          out = await mapChunks(input, MAX_IN, async (part) => {
            const resp: any = await chrome.tabs.sendMessage(tabId, { type: 'DACTI_REWRITE_LOCAL', text: part, style })
            if (!resp?.ok) throw new Error(resp?.error || 'Local rewrite failed')
            return String(resp.text || '')
          }, '\n\n')
        } else {
          out = await mapChunks(input, MAX_IN, async (part) => {
            return await rewriteText(part, { style }, { localOnly: false, signal })
          }, '\n\n')
        }
        log('rewrite done', { localOnly, len: out?.length })
        await cacheSet(key, out)
        if (getTask(tabId)?.canceled) { stopToggle(tabId, false); return }
        return updatePanel(tabId, { message: String(out).slice(0,5000) })
      }

      if (msg.action === 'summarize') {
        await loading(tabId, true);
        await markPanelActive(tabId, 'summarize');
        const fromPanel = params?.source === 'panel' && typeof params?.text === 'string'
        let input: string
        if (fromPanel) {
          input = String(params.text)
        } else {
          const [{ result }] = await chrome.scripting.executeScript({ target: { tabId }, func: () => ({ title: document.title, text: document.body?.innerText?.slice(0, 120000) || '' }) })
          input = `${result?.title}\n\n${result?.text}`
        }
        if (!input.trim()) return updatePanel(tabId, { message: 'Empty selection.' })
        const masked = (!localOnly && dactiMaskPII) ? maskPII(input) : input
        const requestedMode = typeof params.summarizeMode === 'string' ? params.summarizeMode : undefined
        const mode = requestedMode && isSumMode(requestedMode) ? requestedMode : undefined
        log('PATH', localOnly ? 'LOCAL' : 'CLOUD', { action: 'summarize', mode })
        const key = 'sm:' + hash(masked + String(mode || '') + Number(localOnly))
        const cached = await cacheGet(key)
        if (cached) return updatePanel(tabId, { message: String(cached).slice(0,5000) })
        let out: string
        if (localOnly) {
          const resp: any = await chrome.tabs.sendMessage(tabId, { type: 'DACTI_SUMMARIZE_LOCAL', text: masked, mode: mode ?? requestedMode ?? '' })
          if (!resp?.ok) throw new Error(resp?.error || 'Local summarize failed')
          out = String(resp.text || '')
          if (!out.trim()) { out = '(no summary produced by local model)' }
        } else {
          try {
            out = await summarizePage(masked, { localOnly, mode, signal })
          } catch (err: any) {
            log('summarize cloud path error, falling back to direct API', err?.message)
            out = ''
          }
          if (!out || /input\s+is\s+undefined/i.test(String(out))) {
            try {
              const m = mode || 'bullets'
              const prompt = (
                m === 'tldr'     ? `TL;DR in 1–2 sentences using Markdown (no fences).\n\n${masked}` :
                m === 'eli5'     ? `Explain simply (ELI5) using Markdown bullets and **bold** key words. Use short sentences.\n\n${masked}` :
                m === 'sections' ? `Summarize by sections with Markdown headings (##, ###).\n\n${masked}` :
                m === 'facts'    ? `Extract key facts and numbers as Markdown bullet points (- item).\n\n${masked}` :
                                   `Summarize in 5 concise Markdown bullet points (- item).\n\n${masked}`
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
        await loading(tabId, true);
        await markPanelActive(tabId, 'write');
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
          email: 'You are a helpful assistant. Write a clear, friendly but professional email in English for the given audience. Open with a short greeting, include the key points (max 4 bullet-equivalent sentences), a clear action/request, and end with a polite closing. Use Markdown (**bold**, _italic_, bullet lists) to highlight key elements, and do not invent facts beyond the context.',
          linkedin: 'Create a professional yet approachable LinkedIn post in English (250-350 words). Begin with a hook that explains why the update matters, highlight 2-3 concrete takeaways (use Markdown headings or bullets), invite discussion at the end, and avoid hashtags beyond at most two relevant ones. Stick strictly to the provided context.',
          tweet: 'Write a concise social update (max 280 characters). Use an engaging tone, present one key message, add a short call-to-action, and use at most two relevant hashtags. Markdown emphasis (e.g., **bold**) is allowed. No emojis and do not fabricate information beyond the supplied context.',
          minutes: 'Produce structured meeting minutes. Include sections: "Agenda", "Key Decisions" (bullet list), "Action Items" (bullet list with owners and due dates if available). Format the output with Markdown headings and bullets, keep each bullet under 120 characters, and do not invent decisions outside the context.',
          commit: `Compose a Conventional Commit message summarizing the changes. Format:
type(scope): concise subject
- detail line 1
- detail line 2 (optional)
Only use types feat/fix/chore/docs/refactor/test/style/perf/build and keep subject <= 60 chars. Use Markdown bullet points only in the body section, and rely strictly on the context provided.`,
        }
        const key = 'wr:' + hash(input + wt + Number(localOnly))
        const cached = await cacheGet(key)
        if (cached) return updatePanel(tabId, { message: String(cached).slice(0,5000) })
        log('PATH', localOnly ? 'LOCAL' : 'CLOUD', { action: 'write' })
        // --- Chunked summarize → condense → write ---
        // Pre-summarize the context in chunks to keep token budget sane, then write once for coherence
        const MAX_IN = 6000
        const chunkSummary = async (part: string) => {
          if (localOnly) {
            const resp: any = await chrome.tabs.sendMessage(tabId, { type: 'DACTI_SUMMARIZE_LOCAL', text: part, mode: 'bullets' })
            if (!resp?.ok) throw new Error(resp?.error || 'Local summarize failed')
            return String(resp.text || '')
          } else {
            return await summarizePage(part, { localOnly: false, mode: 'bullets', signal })
          }
        }
        const summarized = await mapChunks(input, MAX_IN, (part) => chunkSummary(part), '\n')
        // Optional condensation pass
        let condensed: string
        if (localOnly) {
          const resp: any = await chrome.tabs.sendMessage(tabId, { type: 'DACTI_SUMMARIZE_LOCAL', text: summarized, mode: 'bullets' })
          condensed = String(resp?.text || summarized)
        } else {
          try {
            condensed = await summarizePage(summarized, { localOnly: false, mode: 'bullets', signal })
          } catch { condensed = summarized }
        }
        let out: string
        if (localOnly) {
          const resp: any = await chrome.tabs.sendMessage(tabId, {
            type: 'DACTI_GENERATE_LOCAL_TEXT',
            context: condensed,
            task: map[wt] || map.email,
          })
          if (!resp?.ok) throw new Error(resp?.error || 'Local write failed')
          out = String(resp.text || '')
        } else {
          out = await writeFromContext(condensed, { task: map[wt] || map.email }, { localOnly: false, signal })
        }
        await cacheSet(key, out)
        if (getTask(tabId)?.canceled) { stopToggle(tabId, false); return }
        return updatePanel(tabId, { message: String(out).slice(0, 5000) })
      }

      if (msg.action === 'proofread') {
        await openPanel(tabId, { title: 'DACTI', message: '' })
        loading(tabId, true)
        await markPanelActive(tabId, 'proofread');
        const text = String(params.text || '')
        if (!text.trim()) return updatePanel(tabId, { message: 'Empty text.' })

        const key = 'pr:' + hash(text + Number(localOnly))
        const cached = await cacheGet(key)
        if (cached) return updatePanel(tabId, { message: String(cached).slice(0,5000) })

        const input = (!localOnly && dactiMaskPII) ? maskPII(text) : text
        log('PATH', localOnly ? 'LOCAL' : 'CLOUD', { action: 'proofread' })

        const out = await proofreadText(input, { localOnly, signal })

        log('proofread done', { localOnly, len: out?.length })
        await cacheSet(key, out)
        if (getTask(tabId)?.canceled) { stopToggle(tabId, false); return }
        return updatePanel(tabId, { message: String(out).slice(0, 5000) })
      }
    }
  } catch (e: any) {
    log('panel action error', msg?.action, e?.message)
    const canceled = !!getTask(tabId)?.canceled || String(e?.name||'').toLowerCase() === 'aborterror'
    return updatePanel(tabId, { title: 'DACTI • Error', message: canceled ? CANCELED_MSG : sanitizeError(e) })
  } finally {
    loading(tabId, false)
    stopToggle(tabId, false)
  }
})
