export async function proofreadText(text: string): Promise<string> {
  const pr = await ai.proofreader.create({ model: 'gemini-nano' })
  return (await pr.correct({ text })).text
}