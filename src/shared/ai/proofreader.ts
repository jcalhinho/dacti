import { callGeminiApi } from './gemini-api';

export async function proofreadText(
  text: string,
  options: { onProgress?: (progress: number) => void } = {}
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
            options.onProgress?.(e.loaded);
          });
        }
      },
    });
    return (await pr.correct({ text })).text;
  } catch (e) {
    console.warn("Error with local AI, using Gemini Cloud API:", e);
    const prompt = `Correct the grammar and spelling errors in the following text. Provide only the corrected text, without any explanation or introductory sentence.\n\nText:\n"${text}"`;
    return callGeminiApi(prompt);
  }
}
