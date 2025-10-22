export async function proofreadText(text: string): Promise<string> {
  // const pr = await ai.proofreader.create({ model: 'gemini-nano' })
  // return (await pr.correct({ text })).text
  return text.replace(/\s{2,}/g, ' ').replace(/ ,/g, ',')
}