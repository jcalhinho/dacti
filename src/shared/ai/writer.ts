import { callGeminiApi } from './gemini-api';

export async function writeFromContext(
  context: string,
  options: { task: string },
  progressOptions: { onProgress?: (progress: number) => void } = {}
): Promise<string> {
  try {
    // @ts-ignore
    if (typeof ai === 'undefined' || (await ai.canCreateTextSession()) === 'no') {
      throw new Error("Local AI not available, falling back to cloud.");
    }

    // @ts-ignore
    const writer = await ai.writer.create({
      model: 'gemini-nano',
      monitor: (m: any) => {
        if (progressOptions.onProgress) {
          m.addEventListener('downloadprogress', (e: any) => {
            progressOptions.onProgress?.(e.loaded);
          });
        }
      },
    });
    return (await writer.generate({ context, ...options })).text;
  } catch (e) {
    console.warn("Error with local AI, using Gemini Cloud API:", e);
    const prompt = `Task: ${options.task}\n\nContext:\n${context}\n\nResponse (only the requested text, without introduction):`;
    return callGeminiApi(prompt);
  }
}
