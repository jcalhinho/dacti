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
      return String(out?.text ?? out ?? '')
    } catch (e) {
      if (options?.localOnly) throw e
    }
  }

  if (options?.localOnly) {
    throw new Error('Local-only mode is enabled; cloud write is disabled.')
  }

  const prompt = `Write according to the instruction.
Rules:
- Be concise and concrete.
- No boilerplate like "Here is".
- Keep entities and numbers from the context.
- Output only the final text.

Instruction:
${task.task}

Context:
${context}`
  return callGeminiApi(prompt, { signal: options?.signal })
}