import { callGeminiApi } from './gemini-api';

export async function translateText(
  text: string,
  to: string = 'en',
  options: { onProgress?: (progress: number) => void } = {}
): Promise<string> {
  try {
    // @ts-ignore
    if (typeof ai === 'undefined' || (await ai.canCreateTextSession()) === 'no') {
      throw new Error("IA locale non disponible, passage au cloud.");
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
    console.warn("Erreur avec l'IA locale, utilisation de l'API Gemini Cloud:", e);
    const prompt = `Traduis le texte suivant en ${to}. Ne fournis que la traduction, sans aucune explication ou phrase d'introduction.\n\nTexte:\n"${text}"`;
    return callGeminiApi(prompt);
  }
}
