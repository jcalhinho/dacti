import { captionImage } from '@/shared/ai/promptMultimodal'
import { rewriteText } from '@/shared/ai/rewriter'
import { translateText } from '@/shared/ai/translator'

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: 'dacti-translate', title: 'DACTI • Traduire la sélection', contexts: ['selection'] })
  chrome.contextMenus.create({ id: 'dacti-rewrite', title: 'DACTI • Reformuler…', contexts: ['selection'] })
  chrome.contextMenus.create({ id: 'dacti-caption', title: 'DACTI • Générer alt-text', contexts: ['image'] })
})

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'dacti-translate' && info.selectionText) {
    const out = await translateText(info.selectionText, 'en')
    console.log('Traduction:', out)
  }
  if (info.menuItemId === 'dacti-rewrite' && info.selectionText) {
    const out = await rewriteText(info.selectionText, { style: 'simplify' })
    console.log('Reformulation:', out)
  }
  if (info.menuItemId === 'dacti-caption' && info.srcUrl) {
    const blob = await (await fetch(info.srcUrl)).blob()
    const res = await captionImage(blob)
    console.log('Alt-text:', res)
  }
})