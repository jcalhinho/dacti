import { callGeminiApi } from './gemini-api'

export type SummarizeMode = 'tldr' | 'bullets' | 'eli5' | 'sections' | 'facts'

function buildPrompt(text: string, mode: SummarizeMode = 'bullets') {
  const baseRules = `You are a summarization expert. Follow these rules strictly:
- Be faithful to the input text. Do not add outside information or opinions.
- If you are unsure about a fact, state it clearly.
- Do not use prefatory phrases like "In summary," or "The text is about...".
- Adhere to the requested formatting exactly.
- Your output must be only the summary itself.`;

  switch (mode) {
    case 'tldr':
      return `${baseRules}

Task: Summarize the following content in one or two concise, crisp sentences (a "TL;DR"). Do not use bullet points.

CONTENT:
${text}`;
    case 'eli5':
      return `${baseRules}

Task: Explain the content like I'm five years old. Use simple, concrete, and friendly language. Output 3 to 6 short bullet points. Avoid jargon and provide small, easy-to-understand examples if possible.

CONTENT:
${text}`;
    case 'sections':
      return `${baseRules}

Task: Create a structured outline of the content, divided by sections. Use Markdown formatting exactly as shown below, with no extra text before or after the outline.

## Section Title
- Key point
- Key point

## Another Section Title
- Key point
- Key point

CONTENT:
${text}`;
    case 'facts':
      return `${baseRules}

Task: Extract the key facts from the text. This includes figures, dates, names, and important outcomes. Return 5 to 10 bullet points, with each bullet containing a single fact. Highlight numbers, figures, and dates in **bold**.

CONTENT:
${text}`;
    case 'bullets':
    default:
      return `${baseRules}

Task: Summarize the content into 5 to 7 concise bullet points. Ensure the points are distinct and maintain a neutral tone.

CONTENT:
${text}`;
  }
}

export async function summarizePage(
  text: string,
  options: { onProgress?: (p: number) => void; localOnly?: boolean; mode?: SummarizeMode; signal?: AbortSignal } = {}
): Promise<string> {
  const mode = options.mode || 'bullets';

  // First, attempt to use the on-device Prompt API for more control over the output style.
  // @ts-ignore - `ai` is a global provided by Chrome's built-in AI.
  const canPromptLocal = typeof ai !== 'undefined' && ai?.prompt?.create;
  if (canPromptLocal) {
    try {
      // @ts-ignore
      const prompter = await ai.prompt.create({ multimodal: false, model: 'gemini-nano' });
      const instruction = buildPrompt(text, mode);
      const result = await prompter.generate({ instruction });
      return String(result ?? '');
    } catch (e) {
      // Fallback to the local summarizer if available.
    }
  }

  // If the Prompt API is unavailable, fall back to the built-in summarizer.
  // This offers less control over the output style, so we'll do some light post-formatting.
  // @ts-ignore
  const canSummarizerLocal = typeof ai !== 'undefined' && ai?.summarizer?.create;
  if (canSummarizerLocal) {
    try {
      // @ts-ignore
      const summarizer = await ai.summarizer.create({ model: 'gemini-nano' });
      const result = await summarizer.summarize({ text });
      const rawText = String(result?.text ?? result ?? '');

      // Apply light post-formatting to align with the selected mode.
      if (mode === 'tldr') {
        return rawText.split(/\n+/).slice(0, 2).join(' ');
      } else if (['bullets', 'facts', 'eli5'].includes(mode)) {
        const lines = rawText.split(/\n+/).map(l => l.replace(/^[-•*]\s*/, '').trim()).filter(Boolean);
        return lines.slice(0, 7).map(l => `• ${l}`).join('\n');
      }
      // For 'sections', the default output might already be structured, so we return it as is.
      return rawText;
    } catch (e) {
      if (options?.localOnly) throw e;
    }
  }

  if (options?.localOnly) {
    throw new Error('On-device AI is not available and local-only mode is enabled.');
  }

  // If on-device options fail, use the cloud path with the explicit, mode-aware prompt.
  const prompt = buildPrompt(text, mode);
  return callGeminiApi(prompt, { signal: options?.signal });
}
