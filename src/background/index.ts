import { captionImage } from '@/shared/ai/promptMultimodal'
import { rewriteText } from '@/shared/ai/rewriter'
import { translateText } from '@/shared/ai/translator'
import { summarizePage } from '@/shared/ai/summarizer'
import { proofreadText } from '@/shared/ai/proofreader'
import { writeFromContext } from '@/shared/ai/writer'

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: 'dacti-translate', title: 'DACTI • Traduire la sélection', contexts: ['selection'] })
  chrome.contextMenus.create({ id: 'dacti-rewrite', title: 'DACTI • Reformuler…', contexts: ['selection'] })
  chrome.contextMenus.create({ id: 'dacti-caption', title: 'DACTI • Générer alt-text', contexts: ['image'] })
  chrome.contextMenus.create({ id: 'dacti-summarize', title: 'DACTI • Résumer la sélection', contexts: ['selection'] })
})
function openPanel(tabId: number | undefined, payload: { title: string; message: string }) {
  if (!tabId) return
  return chrome.tabs.sendMessage(tabId, { type: 'DACTI_PANEL_OPEN', ...payload })
}

function updatePanel(tabId: number | undefined, payload: { title?: string; message: string }) {
  if (!tabId) return
  return chrome.tabs.sendMessage(tabId, { type: 'DACTI_PANEL_UPDATE', ...payload })
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  try {
    const { dactiLocalOnly } = await chrome.storage.local.get('dactiLocalOnly')
    const localOnly = Boolean(dactiLocalOnly)

    if (info.menuItemId === 'dacti-translate' && info.selectionText) {
      await openPanel(tab?.id, { title: 'DACTI • Translation', message: '⏳ Translating…' })
      const out = await translateText(info.selectionText, 'en', { localOnly })
      await updatePanel(tab?.id, { message: out.slice(0, 5000) })
      return
    }
    if (info.menuItemId === 'dacti-rewrite' && info.selectionText) {
      await openPanel(tab?.id, { title: 'DACTI • Rewrite', message: '⏳ Rewriting…' })
      const out = await rewriteText(info.selectionText, { style: 'simplify' }, { localOnly })
      await updatePanel(tab?.id, { message: out.slice(0, 5000) })
      return
    }
    if (info.menuItemId === 'dacti-caption' && info.srcUrl) {
      await openPanel(tab?.id, { title: 'DACTI • Alt text', message: '⏳ Generating alt text…' })
      const blob = await (await fetch(info.srcUrl)).blob()
      const { alt, tags } = await captionImage(blob, { localOnly })
      const msg = `${alt}\n#${tags.join(' #')}`.trim()
      await updatePanel(tab?.id, { message: msg.slice(0, 5000) })
      return
    }
    if (info.menuItemId === 'dacti-summarize' && info.selectionText) {
      await openPanel(tab?.id, { title: 'DACTI • Summary', message: '⏳ Summarizing…' })
      const out = await summarizePage(info.selectionText, { localOnly })
      await updatePanel(tab?.id, { message: String(out).slice(0, 5000) })
      return
    }
  } catch (e: any) {
    await updatePanel(tab?.id, { title: 'DACTI • Error', message: e?.message ? String(e.message) : String(e) })
  }
})

chrome.runtime.onMessage.addListener(async (msg, sender) => {
  if (!msg || typeof msg !== 'object') return
  const tabId = sender?.tab?.id
  if (!tabId) return

  const { dactiLocalOnly } = await chrome.storage.local.get('dactiLocalOnly')
  const localOnly = Boolean(dactiLocalOnly)

  if (msg.type === 'DACTI_ACTION') {
    try {
      if (msg.action === 'translate') {
        await openPanel(tabId, { title: 'DACTI • Translate', message: '⏳ Translating…' })
        const [{ result: sel }] = await chrome.scripting.executeScript({
          target: { tabId },
          func: () => window.getSelection()?.toString() || ''
        })
        if (!sel) return updatePanel(tabId, { message: 'Empty selection.' })
        const out = await translateText(sel, 'en', { localOnly })
        return updatePanel(tabId, { message: out.slice(0, 5000) })
      }

      if (msg.action === 'rewrite') {
        await openPanel(tabId, { title: 'DACTI • Rewrite', message: '⏳ Rewriting…' })
        const [{ result: sel }] = await chrome.scripting.executeScript({
          target: { tabId },
          func: () => window.getSelection()?.toString() || ''
        })
        if (!sel) return updatePanel(tabId, { message: 'Empty selection.' })
        const out = await rewriteText(sel, { style: 'simplify' }, { localOnly })
        return updatePanel(tabId, { message: out.slice(0, 5000) })
      }

      if (msg.action === 'summarize') {
        await openPanel(tabId, { title: 'DACTI • Summarize', message: '⏳ Summarizing…' })
        const [{ result }] = await chrome.scripting.executeScript({
          target: { tabId },
          func: () => ({ title: document.title, text: document.body?.innerText?.slice(0, 120000) || '' })
        })
        const out = await summarizePage(`${result.title}\n\n${result.text}`, { localOnly })
        return updatePanel(tabId, { message: String(out).slice(0, 5000) })
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
        const fixed = await proofreadText(result.text, { localOnly })
        await chrome.scripting.executeScript({
          target: { tabId },
          args: [fixed],
          func: (v) => {
            const el = document.activeElement as any
            if (!el) return
            if ('value' in el) el.value = v; else el.innerText = v
          }
        })
        return updatePanel(tabId, { message: '✓ Proofread applied.' })
      }

      if (msg.action === 'write') {
        await openPanel(tabId, { title: 'DACTI • Write', message: '⏳ Writing…' })
        const [{ result: ctx }] = await chrome.scripting.executeScript({
          target: { tabId },
          func: () => (document.title + "\n\n" + document.body?.innerText?.slice(0, 5000))
        })
        const out = await writeFromContext(ctx, { task: 'Draft a concise email (80–120 words) in English.' }, { localOnly })
        return updatePanel(tabId, { message: String(out).slice(0, 5000) })
      }
    } catch (e: any) {
      return updatePanel(tabId, { title: 'DACTI • Error', message: e?.message ? String(e.message) : String(e) })
    }
  }
})

// Open the panel when the toolbar icon is clicked
chrome.action.onClicked.addListener(async (tab) => {
  await openPanel(tab.id, { title: 'DACTI', message: '' })
})