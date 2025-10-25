import React, { useState } from 'react';
import { summarizePage } from '@/shared/ai/summarizer';
import { translateText } from '@/shared/ai/translator';
import { proofreadText } from '@/shared/ai/proofreader';
import { writeFromContext } from '@/shared/ai/writer';
import { rewriteText } from '@/shared/ai/rewriter';
import './Popup.css';

const ActionButton = ({ icon, label, onClick, disabled }: { icon: string, label: string, onClick: () => void, disabled?: boolean }) => (
  <button onClick={onClick} disabled={disabled} className="action-button">
    <img src={icon} alt={`${label} icon`} />
    {label}
  </button>
);

const LoadingSpinner = () => (
  <div className="loading-spinner">
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
      className="spinner-svg"
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  </div>
);

export function Popup() {
  const [output, setOutput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [localOnly, setLocalOnly] = useState(false);

  React.useEffect(() => {
    chrome.storage.local.get('dactiLocalOnly').then(({ dactiLocalOnly }) => {
      setLocalOnly(Boolean(dactiLocalOnly));
    });
  }, []);

  React.useEffect(() => {
    chrome.storage.local.set({ dactiLocalOnly: localOnly });
  }, [localOnly]);

  async function getActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('Could not get active tab.');
    return tab;
  }

  async function handleAction(action: (onProgress: (progress: number) => void) => Promise<string | string[]>) {
    setIsLoading(true);
    setDownloadProgress(null);
    setOutput('');
    try {
      const result = await action(setDownloadProgress);
      setOutput(Array.isArray(result) ? result.join('\n') : result);
    } catch (e: any) {
      setOutput(`Error: ${e.message}`);
    } finally {
      setIsLoading(false);
      setDownloadProgress(null);
    }
  }

  return (
    <div className="popup-container">
      <header className="popup-header">
        <img src="/icons/icon48.png" alt="DACTI logo" />
        <h1>DACTI</h1>
      </header>

      <div className="settings-bar">
        <label className="local-only-label">
          <input type="checkbox" checked={localOnly} onChange={(e) => setLocalOnly(e.target.checked)} />
          On-Device AI
        </label>
        {localOnly && <span className="on-device-badge">Enabled</span>}
      </div>

      {downloadProgress !== null && (
        <div className="progress-container">
          <label htmlFor="progress" className="progress-label">
            Downloading AI model...
          </label>
          <progress id="progress" value={downloadProgress * 100} max="100" className="progress-bar" />
        </div>
      )}

      <div className="action-grid">
        <ActionButton icon="/icons/summarize.svg" label="Summarize" disabled={isLoading} onClick={() => handleAction(async (onProgress) => {
          const tab = await getActiveTab();
          const [{ result }] = await chrome.scripting.executeScript({
            target: { tabId: tab.id! },
            func: () => ({ title: document.title, text: document.body?.innerText?.slice(0, 120000) || '' }),
          });
          setOutput('⏳ Summarizing page content...');
          return summarizePage(`${result.title}\n\n${result.text}`, { onProgress, localOnly });
        })} />
        <ActionButton icon="/icons/translate.svg" label="Translate" disabled={isLoading} onClick={() => handleAction(async (onProgress) => {
          const tab = await getActiveTab();
          const [{ result: selection }] = await chrome.scripting.executeScript({
            target: { tabId: tab.id! },
            func: () => window.getSelection()?.toString() || '',
          });
          if (!selection) return 'Please select text to translate.';
          setOutput('⏳ Translating selected text...');
          return translateText(selection, 'English', { onProgress, localOnly });
        })} />
        <ActionButton icon="/icons/proofread.svg" label="Proofread" disabled={isLoading} onClick={() => handleAction(async (onProgress) => {
          const tab = await getActiveTab();
          setOutput('⏳ Proofreading text in active field...');
          const [{ result }] = await chrome.scripting.executeScript({
            target: { tabId: tab.id! },
            func: () => {
              const el = document.activeElement as HTMLElement | null;
              const isEditable = el && (el.isContentEditable || 'value' in el);
              const text = isEditable ? ((el as HTMLInputElement).value ?? el.innerText) : '';
              return { isEditable, text };
            },
          });
          if (!result.isEditable) return 'To use this feature, please place your cursor in an editable text field.';
          const fixedText = await proofreadText(result.text, { onProgress, localOnly });
          await chrome.scripting.executeScript({
            target: { tabId: tab.id! },
            args: [fixedText],
            func: (text) => {
              const el = document.activeElement as any;
              if (el) {
                if ('value' in el) el.value = text;
                else el.innerText = text;
              }
            },
          });
          return '✓ Proofreading complete. Your text has been updated.';
        })} />
        <ActionButton icon="/icons/write.svg" label="Write" disabled={isLoading} onClick={() => handleAction(async (onProgress) => {
          const tab = await getActiveTab();
          const [{ result: context }] = await chrome.scripting.executeScript({
            target: { tabId: tab.id! },
            func: () => `${document.title}\n\n${document.body?.innerText?.slice(0, 5000)}`,
          });
          setOutput('⏳ Generating a draft based on the page content...');
          return writeFromContext(context, { task: 'Draft a concise email (80–120 words) in English.' }, { onProgress, localOnly });
        })} />
        <ActionButton icon="/icons/rewrite.svg" label="Rewrite" disabled={isLoading} onClick={() => handleAction(async (onProgress) => {
          const tab = await getActiveTab();
          const [{ result: selection }] = await chrome.scripting.executeScript({
            target: { tabId: tab.id! },
            func: () => window.getSelection()?.toString() || '',
          });
          if (!selection) return 'Please select text to rewrite.';
          setOutput('⏳ Rewriting selected text...');
          return rewriteText(selection, { style: 'concise and professional' }, { onProgress, localOnly });
        })} />
      </div>

      <section className="output-section">
        {isLoading ? <LoadingSpinner /> : output}
      </section>
    </div>
  );
}
