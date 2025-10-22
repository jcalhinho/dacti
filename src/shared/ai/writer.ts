export async function writeFromContext(context: string, options: { task: string }): Promise<string> {
  // const writer = await ai.writer.create({ model: 'gemini-nano' })
  // return (await writer.generate({ context, ...options })).text
  return `Draft based on context: ${context.slice(0, 120)}…`
}