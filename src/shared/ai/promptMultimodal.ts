export async function captionImage(blob: Blob): Promise<{ alt: string; tags: string[] }> {
  // TODO: remplacer par Chrome Built-in AI Prompt API (multimodal)
  // const prompt = await (window as any).ai?.prompt?.create({ multimodal: true });
  // const res = await prompt.generate({ image: blob, instruction: 'Short alt text + 3 tags (JSON: {"alt": "...", "tags": ["a","b","c"]})' });
  // try { return JSON.parse(String(res)); } catch { return { alt: String(res ?? ''), tags: [] }; }
  return { alt: 'A person holding a mug near a laptop.', tags: ['work', 'coffee', 'indoor'] }
}
