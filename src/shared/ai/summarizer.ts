export async function summarizePage(text: string): Promise<string[]> {
  // TODO: Remplacer par Chrome Built-in AI Summarizer API
  // const summarizer = await ai.summarizer.create({ model: 'gemini-nano' })
  // const res = await summarizer.summarize({ text, format: 'bullets', max_points: 6 })
  // return res.points
  return [
    '• Point clé 1',
    '• Point clé 2',
    '• Point clé 3'
  ]
}