import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ensurePanel } from '../panel'
import { state } from '../globals'

declare global {
  // eslint-disable-next-line no-var
  var chrome: any
}

describe('panel state management', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    state.refs = null
    state.buildingPanel = false
    state.panelAPI = null
    state.activeKind = null
    const matchMediaMock = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn()
    })
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: matchMediaMock
    })
    global.chrome = {
      runtime: {
        getURL: vi.fn(() => 'data:image/gif;base64,AAAA'),
        sendMessage: vi.fn()
      },
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({}),
          set: vi.fn().mockResolvedValue(undefined)
        }
      }
    }
  })

  it('setActive toggles the appropriate button', async () => {
    const refs = ensurePanel()
    expect(refs).toBeTruthy()
    state.panelAPI?.setActive('translate')
    await Promise.resolve()
    expect(refs?.btnTranslate.classList.contains('active')).toBe(true)
    expect(refs?.btnSummarize.classList.contains('active')).toBe(false)
    expect(state.activeKind).toBe('translate')
  })
})
