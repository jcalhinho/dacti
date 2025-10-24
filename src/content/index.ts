(() => {
  type PanelRefs = {
    root: ShadowRoot
    host: HTMLDivElement
    header: HTMLDivElement
    titleEl: HTMLDivElement
    outEl: HTMLDivElement
    localOnlyCheckbox: HTMLInputElement
    btnSummarize: HTMLButtonElement
    btnTranslate: HTMLButtonElement
    btnProofread: HTMLButtonElement
    btnWrite: HTMLButtonElement
    closeBtn: HTMLButtonElement
  } | null

  let refs: PanelRefs = null

  function h<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) {
    const el = document.createElement(tag)
    if (className) el.className = className
    if (text) el.textContent = text
    return el
  }

  function ensurePanel(): PanelRefs {
    if (refs) return refs

    const host = h('div') as HTMLDivElement
    host.id = 'dacti-floating-panel'
    Object.assign(host.style, {
      position: 'fixed', top: '0px', right: '16px', width: '320px', height: '100vh', zIndex: '2147483647', contain: 'layout'
    })
    document.documentElement.appendChild(host)

    const root = host.attachShadow({ mode: 'open' })
    const style = h('style') as HTMLStyleElement
    style.textContent = `
      :host { all: initial; }
      .wrap { box-sizing: border-box; display: flex; flex-direction: column;border-radius: 20px;border: 2px solid #7c94c5ff; width: 100%; height: 100%; background: #fff; color: #111827;  box-shadow: 0 12px 40px rgba(0,0,0,.18); font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; }
      .header { display:flex; align-items:center; justify-content:space-between; border-top-left-radius:20px; border-top-right-radius:20px; gap:8px; padding:10px 12px; cursor: move; user-select:none; background:#f8fafc; border-bottom:1px solid #e5e7eb; }
      .title { font-weight:600; font-size:13px; color:#0f172a; }
      .close { appearance:none; border:1px solid #e5e7eb; background:#fff; border-radius:8px; width:28px; height:28px; display:grid; place-items:center; cursor:pointer; }
      .close:hover { background:#f3f4f6; }
      .controls { padding:10px 12px; border-bottom:1px solid #eef2f7; display:flex; align-items:center; justify-content:space-between; }
      .grid { display:grid; grid-template-columns:1fr 1fr; gap:8px; padding:10px 12px; }
      .btn { appearance:none; border:1px solid #e5e7eb; background:#fff; border-radius:8px; padding:12px; font-size:12px; color:#374151; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px; }
      .btn:disabled { opacity:.6; cursor:default; }
      .out { flex:1 1 auto; margin:12px; margin-top:0; border:1px solid #e5e7eb; border-radius:8px; background:#f9fafb; padding:10px; overflow:auto; white-space:pre-wrap; min-height:60px; font-size:12px; }
      .toolbar { display:flex; gap:8px; padding:8px 12px; border-top:1px solid #e5e7eb; background:#fafafa; }
      .small { font-size:12px; display:flex; align-items:center; gap:6px; }
      .badge { font-size:11px; padding:2px 6px; border:1px solid #d1d5db; border-radius:999px; }
    `

    const wrap = h('div', 'wrap')

    const header = h('div', 'header') as HTMLDivElement
    const titleEl = h('div', 'title', 'DACTI') as HTMLDivElement
    const closeBtn = h('button', 'close') as HTMLButtonElement
    closeBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
    closeBtn.addEventListener('click', () => { host.remove(); refs = null })
    header.appendChild(titleEl); header.appendChild(closeBtn)

    const controls = h('div', 'controls')
    const label = h('label', 'small')
    const localOnlyCheckbox = h('input') as HTMLInputElement
    localOnlyCheckbox.type = 'checkbox'
    label.appendChild(localOnlyCheckbox)
    label.appendChild(h('span', '', 'Local only (on‑device)'))
    const badge = h('span', 'badge', 'Runs on‑device')
    badge.style.display = 'none'
    controls.appendChild(label)
    controls.appendChild(badge)

    const grid = h('div', 'grid')
    const btnSummarize = h('button', 'btn', 'Summarize') as HTMLButtonElement
    const btnTranslate = h('button', 'btn', 'Translate') as HTMLButtonElement
    const btnProofread = h('button', 'btn', 'Proofread') as HTMLButtonElement
    const btnWrite = h('button', 'btn', 'Write') as HTMLButtonElement
    grid.appendChild(btnSummarize); grid.appendChild(btnTranslate); grid.appendChild(btnProofread); grid.appendChild(btnWrite)

    const outEl = h('div', 'out') as HTMLDivElement

    const toolbar = h('div', 'toolbar')
    const copyBtn = h('button', 'btn', 'Copy') as HTMLButtonElement
    toolbar.appendChild(copyBtn)

    wrap.appendChild(header)
    wrap.appendChild(controls)
    wrap.appendChild(grid)
    wrap.appendChild(outEl)
    wrap.appendChild(toolbar)

    root.appendChild(style)
    root.appendChild(wrap)

    // State wiring
    chrome.storage.local.get('dactiLocalOnly').then(({ dactiLocalOnly }) => {
      localOnlyCheckbox.checked = Boolean(dactiLocalOnly)
      badge.style.display = localOnlyCheckbox.checked ? 'inline-block' : 'none'
    })
    localOnlyCheckbox.addEventListener('change', () => {
      chrome.storage.local.set({ dactiLocalOnly: localOnlyCheckbox.checked })
      badge.style.display = localOnlyCheckbox.checked ? 'inline-block' : 'none'
    })

    const run = async (action: 'summarize' | 'translate' | 'proofread' | 'write') => {
      disable(true)
      outEl.textContent = action === 'summarize' ? '⏳ Summarizing…' : action === 'translate' ? '⏳ Translating…' : action === 'proofread' ? '⏳ Proofreading…' : '⏳ Writing…'
      try {
        await chrome.runtime.sendMessage({ type: 'DACTI_ACTION', action })
      } finally {
        disable(false)
      }
    }

    function disable(v: boolean) {
      btnSummarize.disabled = v; btnTranslate.disabled = v; btnProofread.disabled = v; btnWrite.disabled = v
    }

    btnSummarize.addEventListener('click', () => run('summarize'))
    btnTranslate.addEventListener('click', () => run('translate'))
    btnProofread.addEventListener('click', () => run('proofread'))
    btnWrite.addEventListener('click', () => run('write'))
    copyBtn.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(outEl.textContent || '') } catch {}
    })

    // Dragging
    let dragging = false, ox = 0, oy = 0
    header.addEventListener('mousedown', (ev) => {
      dragging = true
      const r = host.getBoundingClientRect(); ox = ev.clientX - r.left; oy = ev.clientY - r.top
      ev.preventDefault()
    })
    window.addEventListener('mousemove', (ev) => {
      if (!dragging) return
      const nx = Math.max(0, Math.min(window.innerWidth - host.offsetWidth, ev.clientX - ox))
      const ny = Math.max(0, Math.min(window.innerHeight - host.offsetHeight, ev.clientY - oy))
      host.style.left = nx + 'px'; host.style.top = ny + 'px'; host.style.right = 'auto'
    })
    window.addEventListener('mouseup', () => { dragging = false })

    refs = { root, host, header, titleEl, outEl, localOnlyCheckbox, btnSummarize, btnTranslate, btnProofread, btnWrite, closeBtn }
    return refs
  }

  function setContent(title?: string, message?: string) {
    const r = ensurePanel()!
    if (title) r.titleEl.textContent = title
    if (typeof message === 'string') r.outEl.textContent = message
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg || typeof msg !== 'object') return
    if (msg.type === 'DACTI_PANEL_OPEN') setContent(msg.title, msg.message)
    if (msg.type === 'DACTI_PANEL_UPDATE') setContent(msg.title, msg.message)
  })
})()