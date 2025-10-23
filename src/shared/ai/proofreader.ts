export async function proofreadText(
  text: string,
  options: { onProgress?: (progress: number) => void } = {}
): Promise<string> {
  // @ts-ignore
  if (typeof ai === 'undefined' || (await ai.canCreateTextSession()) === 'no') {
    throw new Error("L'IA de Chrome n'est pas disponible ou prête.");
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
}
