export async function summarizePage(text: string): Promise<string[]> {
  const summarizer = await ai.summarizer.create({ model: 'gemini-nano' })
  const res = await summarizer.summarize({ text, format: 'bullets', max_points: 6 })
  return res.points
}