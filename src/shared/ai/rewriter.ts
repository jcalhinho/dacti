export async function rewriteText(text: string, { style = 'simplify' }: { style?: 'simplify' | 'formal' } = {}): Promise<string> {
  // const rw = await ai.rewriter.create({ model: 'gemini-nano' })
  // return (await rw.rewrite({ text, mode: style })).text
  return `Simplified: ${text}`
}