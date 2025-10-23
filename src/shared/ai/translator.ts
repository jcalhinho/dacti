export async function translateText(text: string, to: string = 'en'): Promise<string> {
  // @ts-ignore
  if (typeof ai === 'undefined' || (await ai.canCreateTextSession()) === 'no') {
    throw new Error("L'IA de Chrome n'est pas disponible ou prête.");
  }

  // @ts-ignore
  const translator = await ai.translator.create({ model: 'gemini-nano' });
  return (await translator.translate({ text, to })).text;
}