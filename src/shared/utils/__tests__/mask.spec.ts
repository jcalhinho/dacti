import { describe, it, expect } from 'vitest'
import { maskPII } from '../mask'

describe('maskPII', () => {
  it('masks email addresses', () => {
    const input = 'Contact me at test@example.com for details.'
    expect(maskPII(input)).toBe('Contact me at [EMAIL] for details.')
  })

  it('masks phone numbers', () => {
    const input = 'Call +1 (415) 555-1234 tomorrow.'
    expect(maskPII(input)).toBe('Call [PHONE] tomorrow.')
  })

  it('masks credit card numbers with valid luhn', () => {
    const input = 'Card 4242 4242 4242 4242 is test.'
    expect(maskPII(input)).toBe('Card [CARD] is test.')
  })

  it('leaves non-luhn numbers untouched', () => {
    const input = 'Sequence 1234 5678 9012 3456 fails.'
    expect(maskPII(input)).toContain('1234 5678 9012 3456')
  })

  it('handles empty or null gracefully', () => {
    expect(maskPII('')).toBe('')
    expect(maskPII(undefined as unknown as string)).toBe('')
  })
})
