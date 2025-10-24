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
  chrome.contextMenus.create({ id: 'dacti-translate', title: 'DACTI • Traduire la sélection', contexts: ['selection'] })
  chrome.contextMenus.create({ id: 'dacti-rewrite',   title: 'DACTI • Reformuler…',            contexts: ['selection'] })
  chrome.contextMenus.create({ id: 'dacti-summarize', title: 'DACTI • Résumer la sélection',   contexts: ['selection'] })
})

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  try {
    const { dactiLocalOnly, dactiMaskPII } = await chrome.storage.local.get(['dactiLocalOnly','dactiMaskPII'])
    const localOnly = Boolean(dactiLocalOnly)

    if (info.menuItemId === 'dacti-translate' && info.selectionText) {
      await openPanel(tab?.id, { title: 'DACTI • Translation', message: '⏳ Translating…' })
      const key = 'tr:' + hash(info.selectionText + '|en' + Number(localOnly))
      const cached = await cacheGet(key)
      if (cached) return updatePanel(tab?.id, { message: `${pathLabel(localOnly, true)}\n\n${String(cached).slice(0,5000)}` })
      const input = (!localOnly && dactiMaskPII) ? maskPII(info.selectionText) : info.selectionText
      const out = await translateText(input, 'en', { localOnly })
      await cacheSet(key, out)
      return updatePanel(tab?.id, { message: `${pathLabel(localOnly)}\n\n${String(out).slice(0,5000)}` })
    }

    if (info.menuItemId === 'dacti-rewrite' && info.selectionText) {
      await openPanel(tab?.id, { title: 'DACTI • Rewrite', message: '⏳ Rewriting…' })
      const key = 'rw:' + hash(info.selectionText + '|simplify' + Number(localOnly))
      const cached = await cacheGet(key)
      if (cached) return updatePanel(tab?.id, { message: `${pathLabel(localOnly, true)}\n\n${String(cached).slice(0,5000)}` })
      const input = (!localOnly && dactiMaskPII) ? maskPII(info.selectionText) : info.selectionText
      const out = await rewriteText(input, { style: 'simplify' }, { localOnly })
      await cacheSet(key, out)
      return updatePanel(tab?.id, { message: `${pathLabel(localOnly)}\n\n${String(out).slice(0,5000)}` })
    }

    if (info.menuItemId === 'dacti-summarize' && info.selectionText) {
      await openPanel(tab?.id, { title: 'DACTI • Summary', message: '⏳ Summarizing…' })
      const key = 'sm:' + hash(info.selectionText + Number(localOnly))
      const cached = await cacheGet(key)
      if (cached) return updatePanel(tab?.id, { message: `${pathLabel(localOnly, true)}\n\n${String(cached).slice(0,5000)}` })
      const input = (!localOnly && dactiMaskPII) ? maskPII(info.selectionText) : info.selectionText
      const out = await summarizePage(input, { localOnly })
      await cacheSet(key, out)
      return updatePanel(tab?.id, { message: `${pathLabel(localOnly)}\n\n${String(out).slice(0,5000)}` })
    }
  } catch (e: any) {
    await updatePanel(tab?.id, { title: 'DACTI • Error', message: e?.message ? String(e.message) : String(e) })
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

chrome.runtime.onMessage.addListener(async (msg, sender) => {
  if (!msg || typeof msg !== 'object') return
  const tabId = sender?.tab?.id
  if (!tabId) return

  const { dactiLocalOnly, dactiMaskPII } = await chrome.storage.local.get(['dactiLocalOnly','dactiMaskPII'])
  const localOnly = Boolean(dactiLocalOnly)

  try {
    if (msg.type === 'DACTI_ACTION') {
      if (msg.action === 'translate') {
        await openPanel(tabId, { title: 'DACTI • Translate', message: '⏳ Translating…' })
        const [{ result: sel }] = await chrome.scripting.executeScript({ target: { tabId }, func: () => window.getSelection()?.toString() || '' })
        if (!sel) return updatePanel(tabId, { message: 'Empty selection.' })
        const key = 'tr:' + hash(sel + '|en' + Number(localOnly))
        const cached = await cacheGet(key)
        if (cached) return updatePanel(tabId, { message: `${pathLabel(localOnly, true)}\n\n${String(cached).slice(0,5000)}` })
        const input = (!localOnly && dactiMaskPII) ? maskPII(sel) : sel
        const out = await translateText(input, 'en', { localOnly })
        await cacheSet(key, out)
        return updatePanel(tabId, { message: `${pathLabel(localOnly)}\n\n${String(out).slice(0,5000)}` })
      }

      if (msg.action === 'rewrite') {
        const style = String(msg.style || 'simplify')
        await openPanel(tabId, { title: 'DACTI • Rewrite', message: '⏳ Rewriting…' })
        const [{ result: sel }] = await chrome.scripting.executeScript({ target: { tabId }, func: () => window.getSelection()?.toString() || '' })
        if (!sel) return updatePanel(tabId, { message: 'Empty selection.' })
        const key = 'rw:' + hash(sel + '|' + style + Number(localOnly))
        const cached = await cacheGet(key)
        if (cached) return updatePanel(tabId, { message: `${pathLabel(localOnly, true)}\n\n${String(cached).slice(0,5000)}` })
        const input = (!localOnly && dactiMaskPII) ? maskPII(sel) : sel
        const out = await rewriteText(input, { style }, { localOnly })
        await cacheSet(key, out)
        return updatePanel(tabId, { message: `${pathLabel(localOnly)}\n\n${String(out).slice(0,5000)}` })
      }

      if (msg.action === 'summarize') {
        await openPanel(tabId, { title: 'DACTI • Summarize', message: '⏳ Summarizing…' })
        const [{ result }] = await chrome.scripting.executeScript({ target: { tabId }, func: () => ({ title: document.title, text: document.body?.innerText?.slice(0, 120000) || '' }) })
        const input = (!localOnly && dactiMaskPII) ? maskPII(`${result.title}\n\n${result.text}`) : `${result.title}\n\n${result.text}`
        const key = 'sm:' + hash(input + Number(localOnly))
        const cached = await cacheGet(key)
        if (cached) return updatePanel(tabId, { message: `${pathLabel(localOnly, true)}\n\n${String(cached).slice(0,5000)}` })
        const out = await summarizePage(input, { localOnly })
        await cacheSet(key, out)
        return updatePanel(tabId, { message: `${pathLabel(localOnly)}\n\n${String(out).slice(0, 5000)}` })
      }

      if (msg.action === 'proofread') {
        await openPanel(tabId, { title: 'DACTI • Proofread', message: '⏳ Proofreading…' })
        const [{ result }] = await chrome.scripting.executeScript({
          target: { tabId },
          func: () => {
            const el = document.activeElement as HTMLElement | null
            const isEditable = !!el && (el.isContentEditable || 'value' in (el as any))
            const text = isEditable ? ((el as HTMLInputElement).value ?? el!.innerText) : ''
            return { isEditable, text }
          }
        })
        if (!result.isEditable) return updatePanel(tabId, { message: 'Place the cursor in an editable field.' })
        const input = (!localOnly && dactiMaskPII) ? maskPII(result.text) : result.text
        const fixed = await proofreadText(input, { localOnly })
        await chrome.scripting.executeScript({ target: { tabId }, args: [fixed], func: (v) => { const el = document.activeElement as any; if (!el) return; if ('value' in el) el.value = v; else el.innerText = v } })
        return updatePanel(tabId, { message: `✓ Proofread applied.\n${pathLabel(localOnly)}` })
      }

      if (msg.action === 'write') {
        await openPanel(tabId, { title: 'DACTI • Write', message: '⏳ Writing…' })
        const [{ result: ctx }] = await chrome.scripting.executeScript({ target: { tabId }, func: () => (document.title + "\n\n" + document.body?.innerText?.slice(0, 5000)) })
        const input = (!localOnly && dactiMaskPII) ? maskPII(ctx) : ctx
        const key = 'wr:' + hash(input + Number(localOnly))
        const cached = await cacheGet(key)
        if (cached) return updatePanel(tabId, { message: `${pathLabel(localOnly, true)}\n\n${String(cached).slice(0,5000)}` })
        const out = await writeFromContext(input, { task: 'Draft a concise email (80–120 words) in English.' }, { localOnly })
        await cacheSet(key, out)
        return updatePanel(tabId, { message: `${pathLabel(localOnly)}\n\n${String(out).slice(0, 5000)}` })
      }
    }
  } catch (e: any) {
    return updatePanel(tabId, { title: 'DACTI • Error', message: e?.message ? String(e.message) : String(e) })
  }
})