import { callGeminiApi } from './gemini-api';

export async function proofreadText(
  text: string,
  options: { onProgress?: (progress: number) => void; localOnly?: boolean; signal?: AbortSignal  } = {}
): Promise<string> {
  try {
    // @ts-ignore
    if (typeof ai === 'undefined' || (await ai.canCreateTextSession()) === 'no') {
      throw new Error("Local AI not available, falling back to cloud.");
    }

    // @ts-ignore
    const pr = await ai.proofreader.create({
      model: 'gemini-nano',
      monitor: (m: any) => {
        if (options.onProgress) {
         m.addEventListener('downloadprogress', (e: any) => {
  const loaded = Number(e.loaded ?? 0)
  const total = Number(e.total ?? 1)
  const frac = Math.min(1, loaded / Math.max(1, total))
  options.onProgress?.(frac)
})
        }
      },
    });
    return (await pr.correct({ text })).text;
  } catch (e) {
    if (options?.localOnly) {
      throw new Error('Local AI not available or failed, and Local‑only mode is enabled.')
    }
    console.warn("Error with local AI, using Gemini Cloud API:", e);
    const prompt = `Correct the grammar and spelling errors in the following text. Provide only the corrected text, without any explanation or introductory sentence.\n\nText:\n"${text}"`;
    return callGeminiApi(prompt, { signal: options?.signal })
  }
}