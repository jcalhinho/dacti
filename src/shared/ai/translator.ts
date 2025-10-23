import { callGeminiApi } from './gemini-api';

export async function translateText(
  text: string,
  to: string = 'en',
  options: { onProgress?: (progress: number) => void } = {}
): Promise<string> {
  try {
    // @ts-ignore
    if (typeof ai === 'undefined' || (await ai.canCreateTextSession()) === 'no') {
      throw new Error("Local AI not available, falling back to cloud.");
    }

    // @ts-ignore
    const translator = await ai.translator.create({
      model: 'gemini-nano',
      monitor: (m: any) => {
        if (options.onProgress) {
          m.addEventListener('downloadprogress', (e: any) => {
            options.onProgress?.(e.loaded);
          });
        }
      },
    });
    return (await translator.translate({ text, to })).text;
  } catch (e) {
    console.warn("Error with local AI, using Gemini Cloud API:", e);
    const prompt = `Translate the following text to ${to}. Provide only the translation, without any explanation or introductory sentence.\n\nText:\n"${text}"`;
    return callGeminiApi(prompt);
  }
}
