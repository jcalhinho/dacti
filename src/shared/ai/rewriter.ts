import { callGeminiApi } from './gemini-api'

export async function rewriteText(
  text: string,
  cfg: { style: string },
  options: { onProgress?: (p: number) => void; localOnly?: boolean; signal?: AbortSignal } = {}
): Promise<string> {
  // First, try to use the on-device AI if available.
  // @ts-ignore - `ai` is a global provided by Chrome's built-in AI.
  const canLocal = typeof ai !== 'undefined' && ai?.rewriter?.create;
  if (canLocal) {
    try {
      // @ts-ignore
      const rewriter = await ai.rewriter.create({ model: 'gemini-nano' });
      const result = await rewriter.rewrite({ text, tone: cfg.style });
      return String(result?.text ?? result ?? '');
    } catch (e) {
      if (options?.localOnly) throw e;
    }
  }

  if (options?.localOnly) {
    throw new Error('On-device AI is not available and local-only mode is enabled.');
  }

  const styleInstructions: Record<string, string> = {
    shorter: 'Make the text more concise and to the point. Remove any unnecessary words or phrases.',
    professional: 'Rewrite the text in a formal and professional tone. Use clear, direct language suitable for a business context.',
    casual: 'Rewrite the text in a more relaxed and conversational tone. Use contractions and simpler language.',
    detailed: 'Expand on the original text, adding more detail and explanation where appropriate. Elaborate on the key points.',
  };

  const instruction = styleInstructions[cfg.style] || 'Rewrite the text, improving its clarity and flow.';

  const prompt = `You are a precise rewriter. Your task is to rewrite the given text based on the specified style, while preserving the original meaning and factual content.

Follow these rules strictly:
- Do not introduce new facts or information.
- Avoid meta-commentary (e.g., "Here is the rewritten text:").
- Preserve essential entities like URLs, numbers, and names.
- Your output must be only the rewritten text.

Style Instruction: ${instruction}

Original Text:
${text}`;

  return callGeminiApi(prompt, { signal: options?.signal });
}
