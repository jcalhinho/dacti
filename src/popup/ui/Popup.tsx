import React, { useState } from 'react'
import { summarizePage } from '@/shared/ai/summarizer'
import { translateText } from '@/shared/ai/translator'
import { proofreadText } from '@/shared/ai/proofreader'
import { writeFromContext } from '@/shared/ai/writer'

export function Popup() {
  const [out, setOut] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null)

  async function getActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    return tab
  }

  async function handleAction(action: (onProgress: (progress: number) => void) => Promise<string | string[]>) {
    setIsLoading(true)
    setDownloadProgress(0)
    try {
      const result = await action(setDownloadProgress)
      setOut(Array.isArray(result) ? result.join('\n') : result)
    } catch (e: any) {
      setOut(`Error: ${e.message}`)
    } finally {
      setIsLoading(false)
      setDownloadProgress(null)
    }
  }

  const ActionButton = ({ icon, label, onClick }: { icon: string, label: string, onClick: () => void }) => (
    <button
      onClick={onClick}
      disabled={isLoading}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '4px',
        padding: '12px',
        border: '1px solid #e5e7eb',
        borderRadius: '8px',
        background: 'white',
        cursor: 'pointer',
        fontSize: '12px',
        color: '#374151',
        transition: 'background-color 0.2s',
        opacity: isLoading ? 0.7 : 1,
      }}
    >
      <img src={icon} width={20} height={20} />
      {label}
    </button>
  );

  return (
    <div style={{ width: 320, padding: 12, fontFamily: 'system-ui', color: '#1f2937' }}>
      <header style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        <img src="/icons/icon48.png" width={24} height={24} />
        <h1 style={{ fontSize: 16, margin: 0 }}>DACTI</h1>
      </header>

      {downloadProgress !== null && (
        <div style={{ margin: '8px 0' }}>
          <label htmlFor="progress" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
            Downloading AI model...
          </label>
          <progress id="progress" value={downloadProgress * 100} max="100" style={{ width: '100%' }} />
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <ActionButton icon="/icons/summarize.svg" label="Summarize" onClick={() => handleAction(async (onProgress) => {
          const tab = await getActiveTab()
          const [{ result }] = await chrome.scripting.executeScript({
            target: { tabId: tab.id! },
            func: () => ({ title: document.title, text: document.body?.innerText?.slice(0, 120000) || '' })
          })
          setOut('⏳ Summarizing...')
          return summarizePage(`${result.title}\n\n${result.text}`, { onProgress })
        })} />
        <ActionButton icon="/icons/translate.svg" label="Translate" onClick={() => handleAction(async (onProgress) => {
          const tab = await getActiveTab()
          const [{ result: sel }] = await chrome.scripting.executeScript({
            target: { tabId: tab.id! },
            func: () => window.getSelection()?.toString() || ''
          })
          if (!sel) return 'Empty selection.'
          setOut('⏳ Translating...')
          return translateText(sel, 'en', { onProgress })
        })} />
        <ActionButton icon="/icons/proofread.svg" label="Proofread" onClick={() => handleAction(async (onProgress) => {
          const tab = await getActiveTab()
          setOut('⏳ Proofreading...')
          const [{ result }] = await chrome.scripting.executeScript({
            target: { tabId: tab.id! },
            func: () => {
              const el = document.activeElement as HTMLElement | null
              const isEditable = !!el && (el.isContentEditable || 'value' in (el as any))
              const text = isEditable ? ((el as HTMLInputElement).value ?? el!.innerText) : ''
              return { isEditable, text }
            }
          })
          if (!result.isEditable) return 'Place the cursor in an editable field.'
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
          return '✓ Proofread applied.'
        })} />
        <ActionButton icon="/icons/write.svg" label="Write" onClick={() => handleAction(async (onProgress) => {
          const tab = await getActiveTab()
          const [{ result: ctx }] = await chrome.scripting.executeScript({
            target: { tabId: tab.id! },
            func: () => (document.title + "\n\n" + document.body?.innerText?.slice(0, 5000))
          })
          setOut('⏳ Writing...')
          return writeFromContext(ctx, { task: 'Draft a concise email (80–120 words) in English.' }, { onProgress })
        })} />
      </div>

      <section style={{ marginTop: 12, padding: 10, border: '1px solid #e5e7eb', borderRadius: 8, whiteSpace: 'pre-wrap', minHeight: 60, background: '#f9fafb' }}>
        {isLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ animation: 'spin 1s linear infinite' }}
            >
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
            <style>{`
              @keyframes spin {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
              }
            `}</style>
          </div>
        ) : (
          out
        )}
      </section>
    </div>
  )
}
