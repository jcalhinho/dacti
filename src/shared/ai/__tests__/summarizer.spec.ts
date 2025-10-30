import { describe, it, expect } from 'vitest'
import { chunkTextParagraphAware, buildPrompt } from '../summarizer'

describe('chunkTextParagraphAware', () => {
  it('keeps paragraphs together until threshold', () => {
    const text = ['Para1', 'Para2', 'Para3'].join('\n\n')
    const chunks = chunkTextParagraphAware(text, 6)
    expect(chunks.length).toBe(3)
    expect(chunks[0]).toBe('Para1')
    expect(chunks[1]).toBe('Para2')
    expect(chunks[2]).toBe('Para3')
  })

  it('splits very long paragraphs into slices', () => {
    const long = 'a'.repeat(50)
    const chunks = chunkTextParagraphAware(long, 10)
    expect(chunks.length).toBe(5)
    expect(chunks.every((chunk) => chunk.length === 10)).toBe(true)
  })
})

describe('buildPrompt', () => {
  it('mentions markdown rules and mode-specific instructions', () => {
    const text = 'Sample content'
    const prompt = buildPrompt(text, 'facts')
    expect(prompt).toContain('Format the response in Markdown')
    expect(prompt).toContain('Extract key facts')
    expect(prompt).toContain(text)
  })
})
