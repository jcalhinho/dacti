export async function summarizePage(
  text: string,
  options: { onProgress?: (progress: number) => void } = {}
): Promise<string[]> {
  // @ts-ignore
  if (typeof ai === 'undefined' || (await ai.canCreateTextSession()) === 'no') {
    throw new Error("L'IA de Chrome n'est pas disponible ou prête.");
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
}
