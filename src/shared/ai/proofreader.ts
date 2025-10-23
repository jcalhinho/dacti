export async function proofreadText(text: string): Promise<string> {
  // @ts-ignore
  if (typeof ai === 'undefined' || (await ai.canCreateTextSession()) === 'no') {
    throw new Error("L'IA de Chrome n'est pas disponible ou prête.");
  }

  // @ts-ignore
  const pr = await ai.proofreader.create({ model: 'gemini-nano' });
  return (await pr.correct({ text })).text;
}