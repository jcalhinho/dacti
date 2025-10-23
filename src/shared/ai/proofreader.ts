import { callGeminiApi } from './gemini-api';

export async function proofreadText(
  text: string,
  options: { onProgress?: (progress: number) => void } = {}
): Promise<string> {
  try {
    // @ts-ignore
    if (typeof ai === 'undefined' || (await ai.canCreateTextSession()) === 'no') {
      throw new Error("IA locale non disponible, passage au cloud.");
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
    console.warn("Erreur avec l'IA locale, utilisation de l'API Gemini Cloud:", e);
    const prompt = `Corrige les erreurs de grammaire et d'orthographe dans le texte suivant. Ne fournis que le texte corrigé, sans aucune explication ou phrase d'introduction.\n\nTexte:\n"${text}"`;
    return callGeminiApi(prompt);
  }
}
