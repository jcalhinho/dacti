import { callGeminiApi } from './gemini-api';

export async function proofreadText(
  text: string,
  options: { onProgress?: (progress: number) => void; localOnly?: boolean } = {}
): Promise<string> {
  try {
    // First, check if the on-device AI is available.
    // @ts-ignore - `ai` is a global provided by Chrome's built-in AI.
    if (typeof ai === 'undefined' || (await ai.canCreateTextSession()) === 'no') {
      throw new Error("On-device AI is not available.");
    }

    // Create a proofreader instance and monitor download progress.
    // @ts-ignore
    const proofreader = await ai.proofreader.create({
      model: 'gemini-nano',
      monitor: (monitor: any) => {
        if (options.onProgress) {
          monitor.addEventListener('downloadprogress', (e: any) => {
            const loaded = Number(e.loaded ?? 0);
            const total = Number(e.total ?? 1);
            const progress = Math.min(1, loaded / Math.max(1, total));
            options.onProgress?.(progress);
          });
        }
      },
    });

    // Correct the text using the on-device proofreader.
    const result = await proofreader.correct({ text });
    return result.text;
  } catch (error) {
    // If on-device AI fails, fall back to the cloud API, unless local-only mode is enabled.
    if (options?.localOnly) {
      throw new Error('On-device AI failed and local-only mode is enabled.');
    }

    console.warn("On-device AI error, falling back to Gemini Cloud API:", error);

    const prompt = `Please correct the grammar and spelling errors in the following text. Return only the corrected text, without any introductory phrases or explanations.\n\nOriginal Text:\n"${text}"`;
    return callGeminiApi(prompt);
  }
}
