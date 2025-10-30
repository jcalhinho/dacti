import { callGeminiApi } from './gemini-api'

export async function writeFromContext(
  context: string,
  task: { task: string },
  options: { onProgress?: (p: number) => void; localOnly?: boolean; signal?: AbortSignal } = {}
): Promise<string> {
  // On-device d’abord
  // @ts-ignore
  const canLocal = typeof ai !== 'undefined' && ai?.writer?.create
  if (canLocal) {
    try {
      // @ts-ignore
      const wr = await ai.writer.create({ model: 'gemini-nano' })
      const out = await wr.write({ instruction: task.task, context })
    return String(out?.text ?? out ?? '').trim()
    } catch (e) {
      if (options?.localOnly) throw e
    }
  }

  if (options?.localOnly) {
    throw new Error('Local-only mode is enabled; cloud write is disabled.')
  }

  const prompt = `You are a detail-oriented writing assistant.
Rules:
- Follow the instruction precisely.
- Stay faithful to the context; never invent facts.
- Match the requested tone and structure.
- Keep entities and numbers as given.
- Use Markdown formatting when it improves readability (headings, **bold**, _italic_, bullet lists, \`code\`).
- Output only the final text (no preface or explanation).

Instruction:
${task.task}

Context:
${context}`
  const t = await callGeminiApi(prompt, { signal: options?.signal })
return String(t).trim()
}
