
import { ensurePanel } from './panel';
import { log, state } from './globals';
import { secureRender } from './utils';
import { maskPII } from '@/shared/utils/mask';

declare const ai: any;

function chunkTextParagraphAware(source: string, max = 6000): string[] {
  const clean = String(source || '')
    .replace(/\r/g, '')
    .replace(/\t/g, ' ')
    .replace(/ {2,}/g, ' ');
  const paragraphs = clean.split(/\n{2,}/);
  const chunks: string[] = [];
  let buffer = '';

  for (const para of paragraphs) {
    const candidate = buffer ? `${buffer}\n\n${para}` : para;
    if (candidate.length <= max) {
      buffer = candidate;
    } else {
      if (buffer) chunks.push(buffer);
      if (para.length <= max) {
        buffer = para;
      } else {
        for (let i = 0; i < para.length; i += max) {
          chunks.push(para.slice(i, i + max));
        }
        buffer = '';
      }
    }
  }
  if (buffer) chunks.push(buffer);
  return chunks;
}

type SummMode = 'tldr' | 'bullets' | 'eli5' | 'sections' | 'facts';
const SUM_MODES: ReadonlyArray<SummMode> = ['tldr', 'bullets', 'eli5', 'sections', 'facts'];

function normalizeMode(mode: string): SummMode {
  return (SUM_MODES as readonly string[]).includes(mode) ? (mode as SummMode) : 'bullets';
}

function buildPromptForMode(mode: SummMode, text: string): string {
  const base = `Rules:
- Be faithful to the input.
- No hallucinations. If unsure, say you are unsure.
- Do not add prefaces like "In summary".
- Format the response in Markdown (use headings, bullet lists, **bold**, _italic_, \`code\` when helpful).
- Do not wrap the entire answer in code fences.
- When using bullets, always prefix items with "- " (dash + space).`;
  switch (mode) {
    case 'tldr':
      return `${base}
Task: Summarize in 1–2 crisp sentences (TL;DR). No bullets.
CONTENT:
${text}`;
    case 'eli5':
      return `${base}
Task: Explain like I'm five (simple, concrete, friendly). Output 3–6 bullets. Avoid jargon; give tiny examples. Use "- " as bullet prefix.
CONTENT:
${text}`;
    case 'sections':
      return `${base}
Task: Create a sectioned outline with short bullets. Headings should be concise and followed by 2–5 bullets each. Use "- " as bullet prefix.
CONTENT:
${text}`;
    case 'facts':
      return `${base}
Task: Extract key facts (figures, dates, names, outcomes). Return 5–10 bullets, one fact per bullet. Use "- " as bullet prefix. Repeat numbers exactly; no formatting.
CONTENT:
${text}`;
    case 'bullets':
    default:
      return `${base}
Task: Summarize in 5 concise bullets. Use "- " as bullet prefix. No duplication; neutral tone.
CONTENT:
${text}`;
  }
}

function postProcessByMode(mode: SummMode, raw: string): string {
  const text = String(raw || '').trim();
  if (!text) return text;
  if (mode === 'tldr') {
    const sentences = text
      .replace(/\s+/g, ' ')
      .split(/(?<=[.!?])\s+/)
      .filter(Boolean);
    return sentences.slice(0, 2).join(' ').trim();
  }
  if (mode === 'sections') {
    return text;
  }
  const lines = text
    .split(/\n+/)
    .map((line) => line.replace(/^[-*•–]\s*/, '').trim())
    .filter(Boolean);
  const cap =
    mode === 'facts'
      ? Math.min(10, lines.length)
      : mode === 'eli5'
      ? Math.min(7, lines.length)
      : Math.min(5, lines.length);
  return lines.slice(0, cap).map((line) => '- ' + line).join('\n');
}

export function setupListeners() {
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || typeof msg !== 'object') return;

    if (msg.type === 'DACTI_LOADING') {
      if (state.panelDismissed) return;
      ensurePanel();
      if (msg.show) state.panelAPI?.startLoading();
      else state.panelAPI?.stopLoading();
      return;
    }

    if (msg.type === 'DACTI_SUMMARIZE_LOCAL') {
      (async () => {
        try {
          const text = String(msg.text || '');
          const mode = normalizeMode(String(msg.mode || ''));
          const Summ = (self as any)?.Summarizer || (typeof ai !== 'undefined' ? (ai as any).summarizer : undefined);
          const LM = (self as any)?.LanguageModel || (typeof ai !== 'undefined' ? (ai as any).prompt : undefined);
          log('LOCAL summarize using', { Summ: !!Summ, LM: !!LM, mode });

          let out = '';

          if (LM && (LM as any).create) {
            const pr: any = await (LM as any).create({
              expectedInputs: [{ type: 'text' }],
              expectedOutputs: [{ type: 'text' }],
            });
            const chunks = chunkTextParagraphAware(text, 6000);
            const partials: string[] = [];
            for (let i = 0; i < chunks.length; i++) {
              const prompt = buildPromptForMode(mode, chunks[i]);
              const resp = await pr.prompt?.(prompt);
              const str =
                typeof resp === 'string'
                  ? resp
                  : resp?.text
                  ? String(resp.text)
                  : Array.isArray(resp) && resp[0]?.text
                  ? String(resp[0].text)
                  : String(resp ?? '');
              const trimmed = str.trim();
              if (trimmed) partials.push(trimmed);
            }
            out = partials.length ? partials.join('\n\n') : text;
          } else if (Summ && (Summ as any).create) {
            const summarizeOne = async (s: string): Promise<string> => {
              const sm: any = await (Summ as any).create({ type: 'key-points', outputLanguage: 'en' });
              return String(await sm.summarize?.(s) ?? '');
            };

            const trySummarizeDynamic = async (initialMax: number) => {
              let maxChunk = initialMax;
              const MIN = 800;

              const processChunks = async (src: string, maxLen: number): Promise<string> => {
                const chunks = chunkTextParagraphAware(src, maxLen);
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
                        const sub = chunkTextParagraphAware(piece, localMax);
                        for (const subpart of sub) {
                          try {
                            const t2 = await summarizeOne(subpart);
                            if (t2 && t2.trim()) parts.push(t2.trim());
                          } catch (e2: any) {
                            const m2 = String(e2?.message || e2 || '');
                            if (/quota|too\s+large/i.test(m2) && localMax > MIN) {
                              const sub2 = chunkTextParagraphAware(subpart, Math.max(MIN, Math.floor(localMax * 0.66)));
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
          } else {
            throw new Error('Local summarize API unavailable');
          }

          out = postProcessByMode(mode, out);

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
          const prompt = `Translate into ${target}. Return only the translation formatted as Markdown (plain text is acceptable). Do not add commentary.\n\n${text}`;
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
          const prompt = `Rewrite the text with style: ${style}. Return only the result and format it as Markdown (headings, **bold**, _italic_, bullet lists where helpful). Do not add extra commentary.\n\n${text}`;
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
              'Rules:',
              '- Stay faithful to the context; never invent facts.',
              '- Use Markdown formatting when it improves clarity (headings, **bold**, _italic_, bullet lists, `code`).',
              '- Return only the final text (no explanations).',
              'TASK:',
              task,
              'CONTEXT:',
              context,
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
      if (state.panelDismissed) return;
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
      state.panelDismissed = false;
      setContent(msg.title, msg.message);
      return;
    }
    if (msg.type === 'DACTI_PANEL_UPDATE') {
      if (state.panelDismissed) return;
      setContent(msg.title, msg.message);
      return;
    }

    if (msg.type === 'DACTI_PANEL_ACTIVE') {
      if (state.panelDismissed) return;
      const kind = String((msg as any).kind || '');
      if (['summarize','translate','write','rewrite','proofread'].includes(kind)) {
        state.activeKind = kind as any;
        ensurePanel();
        state.panelAPI?.setActive(kind as any);
      }
      return;
    }

    if (msg.type === 'DACTI_STOP_SHOW' || msg.type === 'DACTI_STOP_HIDE') {
      if (state.panelDismissed) return;
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
  });
}

function setContent(title?: string, message?: string) {
  if (state.panelDismissed) return;
  const r = ensurePanel()!;
  if (title) r.titleEl.textContent = title;
  if (typeof message === 'string') {
    secureRender(r.outEl, message);
  }
}
