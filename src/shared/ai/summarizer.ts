import { callGeminiApi } from './gemini-api';

export async function summarizePage(
  text: string,
  options: { onProgress?: (progress: number) => void } = {}
): Promise<string[]> {
  try {
    // @ts-ignore
    if (typeof ai === 'undefined' || (await ai.canCreateTextSession()) === 'no') {
      throw new Error("IA locale non disponible, passage au cloud.");
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
    console.warn("Erreur avec l'IA locale, utilisation de l'API Gemini Cloud:", e);
    const prompt = `Résume le texte suivant en une liste à puces (maximum 6 points). Ne fournis que la liste, sans introduction ni conclusion.\n\nTexte:\n${text}`;
    const result = await callGeminiApi(prompt);
    // Transforme la sortie en tableau de chaînes, comme le ferait l'API locale.
    return result.split('\n').filter(line => line.trim().startsWith('•') || line.trim().startsWith('*'));
  }
}
