import { callGeminiApi } from './gemini-api';

export async function proofreadText(
  text: string,
  options: { onProgress?: (progress: number) => void; localOnly?: boolean, signal?: AbortSignal } = {}
): Promise<string> {
  // @ts-ignore
  const canCreate = typeof ai !== 'undefined' && ai.canCreateProofreader;
  if (options.localOnly || canCreate) {
    try {
      // @ts-ignore
      const proofreader = await ai.createProofreader();
      const result = await proofreader.proofread(text);
      return result.text || text;
    } catch (e) {
      if (options.localOnly) {
        throw new Error('Local AI not available or failed, and Local‑only mode is enabled.');
      }
      console.warn("Error with local AI, using Gemini Cloud API:", e);
    }
  }

  const prompt = `Correct the grammar and spelling errors in the following text. Provide only the corrected text, without any explanation or introductory sentence.\n\nText:\n"${text}"`;
  return callGeminiApi(prompt, { signal: options.signal });
}
