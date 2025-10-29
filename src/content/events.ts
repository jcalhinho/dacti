
import { ensurePanel } from './panel';
import { log } from './globals';
import { secureRender } from './utils';

export function setupListeners() {
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || typeof msg !== 'object') return;

    if (msg.type === 'DACTI_LOADING') {
      ensurePanel();
      const panelAPI = (ensurePanel() as any).panelAPI;
      if (msg.show) panelAPI?.startLoading();
      else panelAPI?.stopLoading();
      return;
    }

    if (msg.type === 'DACTI_SUMMARIZE_LOCAL') {
      (async () => {
        try {
          const text = String(msg.text || '');
          const mode = String(msg.mode || '');
          const Summ = (self as any)?.Summarizer || (typeof ai !== 'undefined' ? (ai as any).summarizer : undefined);
          const LM = (self as any)?.LanguageModel || (typeof ai !== 'undefined' ? (ai as any).prompt : undefined);
          log('LOCAL summarize using', { Summ: !!Summ, LM: !!LM, mode });

          let out = '';

          function chunkText(s: string, max = 6000): string[] {
            const clean = String(s || '')
              .replace(/\r/g, '')
              .replace(/\t/g, ' ')
              .replace(/ {2,}/g, ' ');
            const paras = clean.split(/\n{2,}/);
            const parts: string[] = [];
            let buf = '';
            for (const p of paras) {
              const add = buf ? buf + '\n\n' + p : p;
              if (add.length <= max) {
                buf = add;
              } else {
                if (buf) parts.push(buf);
                if (p.length <= max) {
                  buf = p;
                } else {
                  for (let i = 0; i < p.length; i += max) parts.push(p.slice(i, i + max));
                  buf = '';
                }
              }
            }
            if (buf) parts.push(buf);
            return parts;
          }

          if (Summ && (Summ as any).create) {
            const summarizeOne = async (s: string): Promise<string> => {
              const sm: any = await (Summ as any).create({ type: 'key-points', outputLanguage: 'en' });
              return String(await sm.summarize?.(s) ?? '');
            };

            const trySummarizeDynamic = async (initialMax: number) => {
              let maxChunk = initialMax;
              const MIN = 800;

              const processChunks = async (src: string, maxLen: number): Promise<string> => {
                const chunks = chunkText(src, maxLen);
                log('LOCAL summarize chunk plan', { chunks: chunks.length, maxLen });
                const parts: string[] = [];
                for (let i = 0; i < chunks.length; i++) {
                  const piece = chunks[i];
                  let attempt = piece;
                  let localMax = Math.min(maxLen, Math.max(MIN, piece.length));
                  while (true) {
                    try {
                      log('LOCAL summarize chunk', { index: i + 1, total: chunks.length, size: attempt.length });
                      const t = await summarizeOne(attempt);
                      if (t && t.trim()) parts.push(t.trim());
                      break;
                    } catch (err: any) {
                      const msg = String(err?.message || err || '');
                      if (/quota|too\s+large/i.test(msg) && localMax > MIN) {
                        localMax = Math.max(MIN, Math.floor(localMax * 0.66));
                        log('LOCAL summarize shrink chunk due to quota', { from: attempt.length, nextMax: localMax });
                        const sub = chunkText(piece, localMax);
                        for (const subpart of sub) {
                          try {
                            const t2 = await summarizeOne(subpart);
                            if (t2 && t2.trim()) parts.push(t2.trim());
                          } catch (e2: any) {
                            const m2 = String(e2?.message || e2 || '');
                            if (/quota|too\s+large/i.test(m2) && localMax > MIN) {
                              const sub2 = chunkText(subpart, Math.max(MIN, Math.floor(localMax * 0.66)));
                              for (const subsub of sub2) {
                                const t3 = await summarizeOne(subsub).catch(() => '');
                                if (t3 && t3.trim()) parts.push(t3.trim());
                              }
                            } else {
                              throw e2;
                            }
                          }
                        }
                        break;
                      } else {
                        throw err;
                      }
                    }
                  }
                }
                return parts.join('\n\n');
              };

              let merged = await processChunks(text, maxChunk);
              if (merged.length > maxChunk) {
                const again = await processChunks(merged, Math.max(MIN, Math.floor(maxChunk * 0.8)));
                if (again.trim()) merged = again;
              }
              return merged;
            };

            try {
              out = await trySummarizeDynamic(5000);
            } catch (e: any) {
              if (/quota|too\s+large/i.test(String(e?.message || e))) {
                log('LOCAL summarize retry with smaller dynamic chunks due to quota', e?.message || String(e));
                out = await trySummarizeDynamic(3000);
              } else {
                throw e;
              }
            }
          } else if (LM && (LM as any).create) {
            const pr: any = await (LM as any).create({
              expectedInputs: [{ type: 'text' }],
              expectedOutputs: [{ type: 'text' }],
            });
            const chunks = chunkText(text, 7000);
            const partials: string[] = [];
            for (let i = 0; i < chunks.length; i++) {
              const prompt = [
                'Summarize the following text clearly as concise bullet points.',
                mode ? `Mode: ${mode}` : '',
                `Chunk ${i + 1}/${chunks.length}:`,
                chunks[i],
              ]
                .filter(Boolean)
                .join('\n\n');
              const t = String(await pr.prompt?.(prompt) ?? '');
              if (t.trim()) partials.push(t.trim());
            }
            out = partials.join('\n\n');
            if (partials.length > 1) {
              const mergePrompt = `Merge and deduplicate the bullet points below into a concise summary (max 8 bullets). Return only the bullets.\n\n${out}`;
              const merged = String(await pr.prompt?.(mergePrompt) ?? '');
              if (merged.trim()) out = merged.trim();
            }
          } else {
            throw new Error('Local summarize API unavailable');
          }

          if (!out.trim()) {
            out = '(No summary produced by local model)';
          }
          sendResponse({ ok: true, text: out });
        } catch (e: any) {
          log('LOCAL summarize error:', e);
          sendResponse({ ok: false, error: e?.message || String(e) });
        }
      })();
      return true;
    }

    if (msg.type === 'DACTI_TRANSLATE_LOCAL') {
      (async () => {
        try {
          const text = String(msg.text || '');
          const target = String(msg.target || 'en');
          const LM = (self as any)?.LanguageModel || (typeof ai !== 'undefined' ? (ai as any).prompt : undefined);
          log('LOCAL translate using', { LM: !!LM, target });
          if (!(LM && (LM as any).create)) throw new Error('Local translate API unavailable');
          const pr: any = await (LM as any).create({
            expectedInputs: [{ type: 'text' }],
            expectedOutputs: [{ type: 'text' }],
          });
          const prompt = `Translate into ${target}. Return only the translation.\n\n${text}`;
          const out = String(await pr.prompt?.(prompt) ?? '');
          sendResponse({ ok: true, text: out });
        } catch (e: any) {
          log('LOCAL translate error:', e);
          sendResponse({ ok: false, error: e?.message || String(e) });
        }
      })();
      return true;
    }

    if (msg.type === 'DACTI_REWRITE_LOCAL') {
      (async () => {
        try {
          const text = String(msg.text || '');
          const style = String(msg.style || 'simplify');
          const LM = (self as any)?.LanguageModel || (typeof ai !== 'undefined' ? (ai as any).prompt : undefined);
          log('LOCAL rewrite using', { LM: !!LM, style });
          if (!(LM && (LM as any).create)) throw new Error('Local rewrite API unavailable');
          const pr: any = await (LM as any).create({
            expectedInputs: [{ type: 'text' }],
            expectedOutputs: [{ type: 'text' }],
          });
          const prompt = `Rewrite the text with style: ${style}. Return only the result.\n\n${text}`;
          const out = String(await pr.prompt?.(prompt) ?? '');
          sendResponse({ ok: true, text: out });
        } catch (e: any) {
          log('LOCAL rewrite error:', e);
          sendResponse({ ok: false, error: e?.message || String(e) });
        }
      })();
      return true;
    }
    if (msg.type === 'DACTI_GENERATE_LOCAL_TEXT') {
      (async () => {
        try {
          const context = String(msg.context || '');
          const task = String(msg.task || 'Write a concise paragraph based on the context.');
          const Summ = (self as any)?.Summarizer || (typeof ai !== 'undefined' ? (ai as any).summarizer : undefined);
          const LM = (self as any)?.LanguageModel || (typeof ai !== 'undefined' ? (ai as any).prompt : undefined);
          let out = '';
          if (LM && (LM as any).create) {
            const pr: any = await (LM as any).create({
              expectedInputs: [{ type: 'text' }],
              expectedOutputs: [{ type: 'text' }],
            });
            const req = [
              'You are a helpful writing assistant.',
              'TASK:',
              task,
              'CONTEXT:',
              context,
              'Return only the final text (no explanations).',
            ].join('\\n\\n');
            out = String(await pr.prompt?.(req) ?? '');
          } else if (Summ && (Summ as any).create) {
            const sm: any = await (Summ as any).create({ type: 'key-points', outputLanguage: 'en' });
            out = String(await sm.summarize?.(`${task}\\n\\n${context}`) ?? '');
          } else {
            throw new Error('Local text generation API unavailable');
          }
          sendResponse({ ok: true, text: out });
        } catch (e: any) {
          sendResponse({ ok: false, error: e?.message || String(e) });
        }
      })();
      return true;
    }

    if (msg.type === 'DACTI_PROGRESS') {
      const r = ensurePanel()!;
      const progressWrap = r.root.querySelector('.progressWrap') as HTMLDivElement;
      const progressBar = r.root.querySelector('.progressBar') as HTMLDivElement;
      const v = Math.max(0, Math.min(1, Number(msg.value || 0)));
      progressWrap.style.display = 'block';
      progressBar.style.width = (v * 100).toFixed(0) + '%';
      if (v >= 1)
        setTimeout(() => {
          progressWrap.style.display = 'none';
          progressBar.style.width = '0%';
        }, 400);
      return;
    }

    if (msg.type === 'DACTI_PANEL_OPEN') {
      setContent(msg.title, msg.message);
      return;
    }
    if (msg.type === 'DACTI_PANEL_UPDATE') {
      setContent(msg.title, msg.message);
      return;
    }

    if (msg.type === 'DACTI_STOP_SHOW' || msg.type === 'DACTI_STOP_HIDE') {
      const r = ensurePanel()!;
      const btn = r.root.querySelector('.btn.stop') as HTMLButtonElement | null;
      if (!btn) return;
      if (msg.type === 'DACTI_STOP_SHOW') {
        btn.style.display = 'inline-flex';
        btn.disabled = false;
      } else {
        btn.disabled = true;
        btn.style.display = 'none';
      }
      return;
    }
    if (msg.type === 'DACTI_PROOFREAD_LOCAL') {
      (async () => {
        try {
          const text = String(msg.text || '');
          const PR = (self as any)?.Proofreader || (typeof ai !== 'undefined' ? (ai as any).proofreader : undefined);
          if (!PR) throw new Error('Local proofreader API unavailable');

          const pr: any = await (PR as any).create();
          const out = await pr.proofread(text);
          sendResponse({ ok: true, text: out });
        } catch (e: any) {
          log('LOCAL proofread error:', e);
          sendResponse({ ok: false, error: e?.message || String(e) });
        }
      })();
      return true;
    }
  });
}

function setContent(title?: string, message?: string) {
  const r = ensurePanel()!;
  if (title) r.titleEl.textContent = title;
  if (typeof message === 'string') {
    secureRender(r.outEl, message);
  }
}
