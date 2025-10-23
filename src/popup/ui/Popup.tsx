import React, { useState } from 'react'
import { summarizePage } from '@/shared/ai/summarizer'
import { translateText } from '@/shared/ai/translator'
import { proofreadText } from '@/shared/ai/proofreader'
import { writeFromContext } from '@/shared/ai/writer'

export function Popup() {
  const [out, setOut] = useState('')
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null)

  async function getActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    return tab
  }

  async function handleAction(action: (onProgress: (progress: number) => void) => Promise<string | string[]>) {
    setDownloadProgress(0)
    try {
      const result = await action(setDownloadProgress)
      setOut(Array.isArray(result) ? result.join('\n') : result)
    } catch (e: any) {
      setOut(`Erreur : ${e.message}`)
    } finally {
      setDownloadProgress(null)
    }
  }

  return (
    <div style={{ width: 320, padding: 12, fontFamily: 'system-ui' }}>
      <header style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <img src="/icons/icon48.png" width={24} height={24} />
        <h1 style={{ fontSize: 16, margin: 0 }}>DACTI</h1>
      </header>

      {downloadProgress !== null && (
        <div style={{ margin: '8px 0' }}>
          <label htmlFor="progress" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
            Téléchargement du modèle IA…
          </label>
          <progress id="progress" value={downloadProgress * 100} max="100" style={{ width: '100%' }} />
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <button onClick={() => handleAction(async (onProgress) => {
          const tab = await getActiveTab()
          const [{ result }] = await chrome.scripting.executeScript({
            target: { tabId: tab.id! },
            func: () => ({ title: document.title, text: document.body?.innerText?.slice(0, 120000) || '' })
          })
          setOut('⏳ Résumé…')
          return summarizePage(`${result.title}\n\n${result.text}`, { onProgress })
        })}>Résumer</button>

        <button onClick={() => handleAction(async (onProgress) => {
          const tab = await getActiveTab()
          const [{ result: sel }] = await chrome.scripting.executeScript({
            target: { tabId: tab.id! },
            func: () => window.getSelection()?.toString() || ''
          })
          if (!sel) return 'Sélection vide.'
          setOut('⏳ Traduction…')
          return translateText(sel, 'en', { onProgress })
        })}>Traduire</button>

        <button onClick={() => handleAction(async (onProgress) => {
          const tab = await getActiveTab()
          setOut('⏳ Correction…')
          const [{ result }] = await chrome.scripting.executeScript({
            target: { tabId: tab.id! },
            func: () => {
              const el = document.activeElement as HTMLElement | null
              const isEditable = !!el && (el.isContentEditable || 'value' in (el as any))
              const text = isEditable ? ((el as HTMLInputElement).value ?? el!.innerText) : ''
              return { isEditable, text }
            }
          })
          if (!result.isEditable) return 'Placez le curseur dans un champ éditable.'
          const fixed = await proofreadText(result.text, { onProgress })
          await chrome.scripting.executeScript({
            target: { tabId: tab.id! },
            args: [fixed],
            func: (v) => {
              const el = document.activeElement as any
              if (!el) return
              if ('value' in el) el.value = v; else el.innerText = v
            }
          })
          return '✓ Correction appliquée.'
        })}>Corriger</button>

        <button onClick={() => handleAction(async (onProgress) => {
          const tab = await getActiveTab()
          const [{ result: ctx }] = await chrome.scripting.executeScript({
            target: { tabId: tab.id! },
            func: () => (document.title + "\n\n" + document.body?.innerText?.slice(0, 5000))
          })
          setOut('⏳ Rédaction…')
          return writeFromContext(ctx, { task: 'Draft a concise email (80–120 words) in English.' }, { onProgress })
        })}>Rédiger</button>
      </div>

      <section style={{ marginTop: 10, padding: 10, border: '1px solid #e5e7eb', borderRadius: 12, whiteSpace: 'pre-wrap', minHeight: 48 }}>
        {out}
      </section>
    </div>
  )
}
