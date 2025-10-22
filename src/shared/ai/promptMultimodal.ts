export async function captionImage(blob: Blob): Promise<{ alt: string; tags: string[] }> {
  // TODO: remplacer par Chrome Built-in AI Prompt API (multimodal)
  // const prompt = await ai.prompt.create({ multimodal: true, model: 'gemini-nano' })
  // const res = await prompt.generate({ image: blob, instruction: 'Short alt text + 3 tags' })
  // return { alt: res.alt, tags: res.tags }
  return { alt: 'A person holding a mug near a laptop.', tags: ['work', 'coffee', 'indoor'] }
}
