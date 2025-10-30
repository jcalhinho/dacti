import { describe, it, expect, beforeEach } from 'vitest'
import { secureRender } from '../utils'

describe('secureRender', () => {
  let el: HTMLDivElement

  beforeEach(() => {
    el = document.createElement('div')
  })

  it('applies markdown-output class and clears previous content', () => {
    el.innerHTML = '<p>old</p>'
    secureRender(el, '')
    expect(el.classList.contains('markdown-output')).toBe(true)
    expect(el.innerHTML).toBe('')
  })

  it('renders bullet lists from dash-prefixed lines', () => {
    secureRender(el, '- First item\n- Second item\n\nParagraph')
    const list = el.querySelector('ul')
    expect(list).not.toBeNull()
    expect(list?.querySelectorAll('li').length).toBe(2)
    expect(el.innerHTML).toContain('<li>First item</li>')
    expect(el.innerHTML).toContain('<li>Second item</li>')
    expect(el.innerHTML).toContain('<p>Paragraph</p>')
  })

  it('converts headings, blockquotes and inline markdown', () => {
    const input = [
      '# Title',
      '> quote',
      '**bold** and _italic_ with `code` and [link](https://example.com)'
    ].join('\n')
    secureRender(el, input)
    expect(el.querySelector('h2')?.textContent).toBe('Title')
    expect(el.querySelector('blockquote')?.textContent).toBe('quote')
    const html = el.innerHTML
    expect(html).toContain('<strong>bold</strong>')
    expect(html).toContain('<em>italic</em>')
    expect(html).toContain('<code>code</code>')
    expect(html).toContain('<a href="https://example.com"')
  })

  it('escapes dangerous html', () => {
    const payload = '<img src=x onerror="alert(1)">'
    secureRender(el, payload)
    expect(el.innerHTML).not.toContain('<img')
    expect(el.innerHTML).toContain('&lt;img')
  })
})
