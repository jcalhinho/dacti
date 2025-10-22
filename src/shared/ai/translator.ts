export async function translateText(text: string, to: string = 'en'): Promise<string> {
  // const translator = await ai.translator.create({ model: 'gemini-nano' })
  // return (await translator.translate({ text, to })).text
  return `[${to}] ${text}`
}