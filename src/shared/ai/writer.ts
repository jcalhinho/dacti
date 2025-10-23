import { callGeminiApi } from './gemini-api';

export async function writeFromContext(
  context: string,
  options: { task: string },
  progressOptions: { onProgress?: (progress: number) => void } = {}
): Promise<string> {
  try {
    // @ts-ignore
    if (typeof ai === 'undefined' || (await ai.canCreateTextSession()) === 'no') {
      throw new Error("IA locale non disponible, passage au cloud.");
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
    console.warn("Erreur avec l'IA locale, utilisation de l'API Gemini Cloud:", e);
    const prompt = `Tâche: ${options.task}\n\nContexte:\n${context}\n\nRéponse (uniquement le texte demandé, sans introduction):`;
    return callGeminiApi(prompt);
  }
}
