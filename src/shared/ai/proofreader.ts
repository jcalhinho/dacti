import { callGeminiApi } from './gemini-api';
declare const LanguageModel: any;
/**
 * Attempts to proofread text locally, using available local APIs.
 * Falls back to cloud if not available or on error (unless localOnly).
 */
export async function proofreadText(
  text: string,
  options: { onProgress?: (progress: number) => void; localOnly?: boolean; signal?: AbortSignal } = {}
): Promise<string> {
  // Helper to try local APIs in order: proofreader, then prompt/language model.
  async function tryLocal(): Promise<string> {
    // @ts-ignore
    const aiObj = typeof ai !== 'undefined' ? ai : (typeof self !== 'undefined' ? (self as any) : {});
    // Try ai.proofreader.create first
    if (aiObj?.proofreader?.create) {
      const pr = await aiObj.proofreader.create({
        model: 'gemini-nano',
        monitor: (m: any) => {
          if (options.onProgress) {
            m.addEventListener?.('downloadprogress', (e: any) => {
              const loaded = Number(e.loaded ?? 0);
              const total = Number(e.total ?? 1);
              const frac = Math.min(1, loaded / Math.max(1, total));
              options.onProgress?.(frac);
            });
          }
        },
      });
      const res = await pr.correct({ text });
      return res?.text || '';
    }
    // Try ai.prompt.create or LanguageModel.create
    const promptApi =
      aiObj?.prompt?.create ||
      aiObj?.LanguageModel?.create ||
      (typeof LanguageModel !== 'undefined' ? (LanguageModel as any).create : undefined);
    if (promptApi) {
      // Try to create a local text model (gemini-nano), then prompt it
      const pr = await promptApi({
        model: 'gemini-nano',
        expectedInputs: [{ type: 'text' }],
        expectedOutputs: [{ type: 'text' }],
        monitor: (m: any) => {
          if (options.onProgress) {
            m.addEventListener?.('downloadprogress', (e: any) => {
              const loaded = Number(e.loaded ?? 0);
              const total = Number(e.total ?? 1);
              const frac = Math.min(1, loaded / Math.max(1, total));
              options.onProgress?.(frac);
            });
          }
        },
      });
      // Prompt instruction: only return the corrected text
      const prompt = `Correct the grammar and spelling errors in the following text. Provide only the corrected text, without any explanation or introductory sentence.\n\nText:\n"${text}"`;
      const resp = await pr.prompt(prompt);
      // Try various property access for result
      if (typeof resp === 'string') return resp;
      if (resp?.text) return resp.text;
      if (Array.isArray(resp) && resp[0]?.text) return resp[0].text;
      return '';
    }
    throw new Error('No local proofreader or prompt API available.');
  }

  // Control flow: try local, fallback to cloud if allowed
  if (options.localOnly === true) {
    // Only try local; throw on error
    try {
      return await tryLocal();
    } catch (e) {
      throw new Error('Local AI not available or failed, and Local‑only mode is enabled.');
    }
  } else {
    // Try local, fallback to cloud if fails
    try {
      return await tryLocal();
    } catch (e) {
      // Fallback to cloud
      // Provide progress callback with 0 and 1 (downloadprogress not available)
      if (options.onProgress) {
        options.onProgress(0);
      }
      const prompt = `Correct the grammar and spelling errors in the following text. Provide only the corrected text, without any explanation or introductory sentence.\n\nText:\n"${text}"`;
      const result = await callGeminiApi(prompt, { signal: options?.signal });
      if (options.onProgress) {
        options.onProgress(1);
      }
      return result;
    }
  }
}