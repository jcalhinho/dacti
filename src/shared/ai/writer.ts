export async function writeFromContext(context: string, options: { task: string }): Promise<string> {
  // @ts-ignore
  if (typeof ai === 'undefined' || (await ai.canCreateTextSession()) === 'no') {
    throw new Error("L'IA de Chrome n'est pas disponible ou prête.");
  }

  // @ts-ignore
  const writer = await ai.writer.create({ model: 'gemini-nano' });
  return (await writer.generate({ context, ...options })).text;
}