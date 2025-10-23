import { callGeminiApi } from './gemini-api';

export async function summarizePage(
  text: string,
  options: { onProgress?: (progress: number) => void } = {}
): Promise<string[]> {
  try {
    // @ts-ignore
    if (typeof ai === 'undefined' || (await ai.canCreateTextSession()) === 'no') {
      throw new Error("Local AI not available, falling back to cloud.");
    }

    // @ts-ignore
    const summarizer = await ai.summarizer.create({
      model: 'gemini-nano',
      monitor: (m: any) => {
        if (options.onProgress) {
          m.addEventListener('downloadprogress', (e: any) => {
            options.onProgress?.(e.loaded);
          });
        }
      },
    });
    const res = await summarizer.summarize({ text, format: 'bullets', max_points: 6 });
    return res.points;
  } catch (e) {
    console.warn("Error with local AI, using Gemini Cloud API:", e);
    const prompt = `Summarize the following text into a bulleted list (maximum 6 points). Provide only the list, without any introduction or conclusion.\n\nText:\n${text}`;
    const result = await callGeminiApi(prompt);
    // Transform the output into an array of strings, as the local API would.
    return result.split('\n').filter(line => line.trim().startsWith('•') || line.trim().startsWith('*'));
  }
}
