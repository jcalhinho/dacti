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
    btnRewrite: HTMLButtonElement
    btnAlt: HTMLButtonElement
    btnWrite: HTMLButtonElement
    closeBtn: HTMLButtonElement
  } | null

  let refs: PanelRefs = null
    let __buildingPanel = false
  const DBG = true
  const log = (...a: any[]) => { try { console.log('[DACTI]', ...a) } catch {} }
  let panelAPI: { startLoading: () => void; stopLoading: () => void } | null = null

  const stripFences = (s: string) => { const m = String(s||'').match(/```(?:json)?\s*([\s\S]*?)```/i); return (m?m[1]:String(s||'')).trim() }

  function h<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) {
    const el = document.createElement(tag)
    if (className) el.className = className
    if (text) el.textContent = text
    return el
  }

  function ensurePanel(): PanelRefs {
    if (refs) return refs
    if (__buildingPanel) return refs as any
    const host = h('div') as HTMLDivElement
        __buildingPanel = true
    host.id = 'dacti-floating-panel'
    Object.assign(host.style, {
      position: 'fixed', top: '0px', right: '16px', width: '320px', height: '100vh', zIndex: '2147483647', contain: 'layout'
    })
    host.style.backgroundColor = 'transparent' // host stays transparent, wrap is opaque; change to '#fff' if desired
    document.documentElement.appendChild(host)

    const root = host.attachShadow({ mode: 'open' })
    const style = h('style') as HTMLStyleElement
    style.textContent = `
      :host { all: initial; }
      .wrap { 
        /* Theme variables (LIGHT default) scoped to the panel to avoid Shadow DOM inheritance issues */
        --bg:#ffffff; --text:#111827; --muted:#475569; --border:#e5e7eb; --subtle:#f8fafc; --card:#f9fafb;
        --btn-bg:#ffffff; --btn-border:#e5e7eb; --btn-hover-shadow: 0 6px 18px rgba(26,115,232,.18); --badge-bg: rgba(66,133,244,.10); --badge-border:#d1d5db; --accent:#1a73e8;

        box-sizing: border-box; display: flex; flex-direction: column; border-radius: 20px; border: 2px solid #7c94c5ff; width: 100%; height: 100%;
        background: var(--bg, #ffffff); /* explicit fallback to avoid transparency */
        color: var(--text); box-shadow: 0 12px 40px rgba(0,0,0,.18); font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      }
      .wrap[data-theme="dark"] {
        --bg:#0b1220; --text:#e5e7eb; --muted:#94a3b8; --border:#273043; --subtle:#0f172a; --card:#111b2e; --btn-bg:#111b2e; --btn-border:#273043; --btn-hover-shadow: 0 8px 22px rgba(26,115,232,.25); --badge-bg: rgba(66,133,244,.16); --badge-border: rgba(66,133,244,.45); --accent:#8ab4f8;
      }
      .header { display:flex; align-items:center; justify-content:space-between; border-top-left-radius:20px; border-top-right-radius:20px; gap:8px; padding:10px 12px; cursor: move; background: var(--subtle); border-bottom:1px solid var(--border); }
      .btn.stop{ border-color:#ef4444; color:#ef4444; background:transparent; padding:6px 10px; height:28px; }
      .btn.stop:hover{ background: color-mix(in srgb, #ef4444 12%, var(--btn-bg)); }
      .wrap[data-theme="dark"] .btn.stop{ border-color:#f87171; color:#fca5a5; }
      
      .title { font-weight:600; font-size:13px; color:var(--text); }
      .close { appearance:none; border:1px solid var(--border); background:var(--btn-bg); border-radius:8px; width:28px; height:28px; display:grid; place-items:center; cursor:pointer; }
      .close:hover { background: color-mix(in srgb, var(--btn-bg), #000 5%); }
      .wrap[data-theme="dark"] .close { color:#e5e7eb; }
      .controls { padding:10px 12px; border-bottom:1px solid var(--border); display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap: wrap; }
     .grid { display:grid; grid-template-columns: repeat(2, minmax(0,1fr)); align-items:stretch; gap:12px; padding:10px 12px; }
.btn { appearance:none; border:1px solid var(--btn-border); background:var(--btn-bg); border-radius:8px; padding:12px; font-size:14px; font-weight:600; color:var(--text); cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px; transition: box-shadow .2s ease, border-color .2s ease, transform .06s ease; min-height:44px; width:100%; }
.btn:hover { box-shadow: var(--btn-hover-shadow); border-color: color-mix(in srgb, var(--accent) 40%, var(--btn-border)); }.btn.active{
  background: color-mix(in srgb, var(--accent) 12%, var(--btn-bg));
  border-color: color-mix(in srgb, var(--accent) 55%, var(--btn-border));
}
      .btn:active { transform: translateY(1px); }
      .btn:disabled { opacity:.6; cursor:default; box-shadow:none; }
      .out { flex:1 1 auto; margin:12px; margin-top:0; border:1px solid var(--border); border-radius:12px; background:var(--card); padding:10px; overflow:auto; white-space:pre-wrap; min-height:60px; font-size:12px; }
      .toolbar { display:flex; gap:8px; padding:8px 12px; border-top:1px solid var(--border); background:var(--subtle); border-bottom-left-radius:20px; border-bottom-right-radius:20px; }
      .small { font-size:12px; display:flex; align-items:center; gap:6px; color:var(--muted); }
      .badge { font-size:11px; padding:2px 6px; border:1px solid var(--badge-border); border-radius:999px; color:var(--accent); background: var(--badge-bg); }
      .header .badge{ margin-left:auto; }
      .loaderImg{ width:12px; height:12px; display:inline-block; object-fit:contain; margin-right:6px; border-radius:2px; }
      .themeSelect { appearance: none; border:1px solid var(--border); background: var(--btn-bg); color: var(--text); padding: 6px 8px; border-radius: 8px; font-size: 12px; }
      /* Material-like, compact toggle */
      .toggleRow{ display:flex; align-items:center; gap:8px; }
      .smallLabel{ font-size:11px; color:var(--muted); user-select:none; }
      .wrap[data-theme="dark"] .smallLabel{ color:#94a3b8; }
      .switch{ position:relative; display:inline-block; width:40px; height:22px; }
      .switch input{ opacity:0; width:0; height:0; }
      .slider{ position:absolute; inset:0; cursor:pointer; background:#1a73e8; /* Cloud (off) → blue */ border-radius:999px; box-shadow:inset 0 1px 2px rgba(0,0,0,.15); transition:background .18s ease; }
      .slider:before{ content:""; position:absolute; height:18px; width:18px; left:2px; top:2px; background:#fff; border-radius:50%; box-shadow:0 2px 6px rgba(0,0,0,.2); transition:transform .18s ease; }
      .switch input:checked + .slider{ background:#34a853; /* Local (on) → green */ }
      .switch input:checked + .slider:before{ transform:translateX(18px); }
      /* Disabled/locked: keep color, only change cursor */
      .switch.disabled .slider{ cursor:not-allowed; }
      .switch.disabled .slider:before{ box-shadow:0 1px 3px rgba(0,0,0,.15); }
      /* Dark mode adjustments */
      .wrap[data-theme="dark"] .switch input:not(:checked) + .slider{ background:#4285f4; }
      .wrap[data-theme="dark"] .switch input:checked + .slider{ background:#34a853; }
      .progressWrap{ display:none; height:6px; margin:0 12px 10px 12px; border-radius:6px; background: #eef2f7; overflow:hidden; }
      .wrap[data-theme="dark"] .progressWrap{ background:#1f2937; }
      .progressBar{ height:100%; width:0%; background: linear-gradient(90deg, #1a73e8, #34a853); transition: width .15s ease; }
      .alts{ display:flex; flex-direction:column; gap:10px; padding:10px 12px; }
.altrow{ display:flex; gap:10px; align-items:flex-start; border:1px solid var(--border); border-radius:10px; padding:8px; background:var(--btn-bg); }
.altrow img{ width:64px; height:64px; object-fit:cover; border-radius:8px; border:1px solid var(--border); background:#fff; }
.altmeta{ display:flex; flex-direction:column; gap:6px; }
.alttags{ font-size:11px; opacity:.9; }
      .altmeta .altline{ line-height:1.35; }
      .alttagsScroll{ max-height:64px; overflow-y:auto; padding-right:4px; }
      .spin{ display:inline-block; width:12px; height:12px; border:2px solid currentColor; border-right-color:transparent; border-radius:50%; animation:sp .6s linear infinite; margin-right:6px }
      .loadingAnim{ display:flex; align-items:center; justify-content:center; min-height:44px; }
    .loadingAnim img{ width:40px; height:40px; image-rendering:auto; }
      @keyframes sp{ to{ transform:rotate(360deg) } }
      .fadeIn{ animation: fadeIn .16s ease-out; }
      @keyframes fadeIn{ from{ opacity:0; transform: translateY(2px) } to{ opacity:1; transform:none } }
    `

    const wrap = h('div', 'wrap fadeIn')

    // Theme control (light/dark/auto)
    let mql: MediaQueryList | null = null
    const applyTheme = (mode: 'auto'|'light'|'dark') => {
      // remove old listener
      if (mql) { mql.onchange = null; mql = null }
      const setBg = (isDark: boolean) => {
        wrap.setAttribute('data-theme', isDark ? 'dark' : 'light')
        // Force an opaque background to avoid any transparency glitches
        wrap.style.backgroundColor = isDark ? '#0b1220' : '#ffffff'
      }
      if (mode === 'dark') {
        setBg(true)
      } else if (mode === 'light') {
        setBg(false)
      } else {
        mql = window.matchMedia('(prefers-color-scheme: dark)')
        const sync = () => setBg(!!mql && mql.matches)
        sync()
        mql.onchange = sync
      }
    }
const toolbar = h('div', 'toolbar')
const copyBtn = h('button', 'btn', 'Copy') as HTMLButtonElement
toolbar.appendChild(copyBtn)
    const header = h('div', 'header') as HTMLDivElement
const titleEl = h('div', 'title', 'DACTI') as HTMLDivElement

const closeBtn = h('button', 'close') as HTMLButtonElement
closeBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
closeBtn.addEventListener('click', () => { host.remove(); refs = null })

header.appendChild(titleEl)
// Test probe image to verify chrome-extension:// images load in header
const testImg = new Image()
testImg.src = chrome.runtime.getURL('one.webp')
testImg.alt = 'dacti_loader'
testImg.width = 40
testImg.height = 40


testImg.style.objectFit = 'contain'
header.appendChild(testImg)
let headerLoaderImg: HTMLImageElement | null = testImg
// (badge will be appended here later, before the close button)

    const controls = h('div', 'controls')

    // Local/Cloud toggle with tooltips (Material-like switch)
    const modeWrap = h('div', 'small toggleRow')
    
    const cloudLbl = h('span', 'smallLabel', 'Cloud')
    const switchEl = document.createElement('label') as HTMLLabelElement
    switchEl.className = 'switch'
    const modeInput = document.createElement('input') as HTMLInputElement
    modeInput.type = 'checkbox' // checked = Local, unchecked = Cloud
    const modeSlider = h('span', 'slider') as HTMLSpanElement
    switchEl.appendChild(modeInput); switchEl.appendChild(modeSlider)
    const localLbl = h('span', 'smallLabel', 'Local')

    const renderMode = (local: boolean, locked: boolean) => {
      modeInput.checked = local
      modeInput.disabled = locked
      switchEl.classList.toggle('disabled', locked)
      const tip = [
        local ? 'Local mode (on-device Gemini Nano).' : 'Cloud mode (proxy/API).',
        'On launch: Auto tries Local if available; otherwise Cloud.',
        locked && !local ? 'Local model not installed/compatible → locked to Cloud.' : '',
      ].filter(Boolean).join(' ')
      switchEl.title = tip
      cloudLbl.title = tip
      localLbl.title = tip
    }

  
    modeWrap.appendChild(cloudLbl)
    modeWrap.appendChild(switchEl)
    modeWrap.appendChild(localLbl)

    // Theme select UI
    const themeWrap = h('div', 'small')
    const themeSelect = h('select', 'themeSelect') as HTMLSelectElement
    ;(['auto','light','dark'] as const).forEach(v => {
      const o = document.createElement('option')
      o.value = v
      o.textContent = v[0].toUpperCase() + v.slice(1)
      themeSelect.appendChild(o)
    })
    themeWrap.appendChild(themeSelect)

    // Stop shown only while running (next to Theme)
    const stopBtn = h('button', 'btn stop') as HTMLButtonElement
    // Default spinner; will be replaced by a custom image if configured
    stopBtn.innerHTML = '<span class="spin" aria-hidden="true"></span>Stop'
    chrome.storage.local.get('dactiLoaderImage').then(({ dactiLoaderImage }) => {
      const url = (typeof dactiLoaderImage === 'string' ? dactiLoaderImage.trim() : '')
      if (url) {
        stopBtn.innerHTML = `<img class="loaderImg" src="${url}" alt=""/>Stop`
      }
    })
    stopBtn.style.display = 'none'
    stopBtn.addEventListener('click', async () => {
      stopBtn.disabled = true
      try { await chrome.runtime.sendMessage({ type:'DACTI_CANCEL' }) } catch {}
    })

    const badge = h('span', 'badge', 'Detecting…')
    const setBadge = (isLocal: boolean, tipExtra = '') => {
      const offline = isLocal && !navigator.onLine
      badge.textContent = isLocal ? (offline ? 'Local (offline)' : 'Local') : 'Cloud'
      const baseTip = isLocal
        ? (offline ? 'Local on-device — offline.' : 'Local mode (on-device Gemini Nano).')
        : 'Cloud mode (proxy/API).'
      badge.title = [baseTip, tipExtra].filter(Boolean).join(' ')
      try { console.log('[DACTI]', 'BADGE', { isLocal, offline }) } catch {}
    }
    // Move the blue Cloud/Local badge into the header (to the right of the title)
    header.appendChild(badge)
    header.appendChild(closeBtn)

  controls.appendChild(modeWrap)
controls.appendChild(themeWrap)

const grid = h('div', 'grid')



    // --- Dropdown factory
    function makeDropdown(label: string, items: {label:string, value:'summarize'|'translate'|'write'|'rewrite', payload?:any}[]) {
      const wrap = h('div') as HTMLDivElement
      const btn = h('button', 'btn', label + ' ▾') as HTMLButtonElement
      const menu = h('div') as HTMLDivElement
      Object.assign(menu.style, { position:'absolute', background:'var(--btn-bg)', border:'1px solid var(--btn-border)', borderRadius:'8px', boxShadow:'0 8px 22px rgba(0,0,0,.18)', padding:'6px', display:'none', zIndex:'9999' })
      menu.className = 'dropdownMenu'
      items.forEach(it => {
        const mi = h('div', 'dropdownItem', it.label) as HTMLDivElement
        Object.assign(mi.style, { padding:'8px 10px', borderRadius:'6px', cursor:'pointer', fontSize:'12px' })
        mi.addEventListener('mouseenter', () => mi.style.background = 'color-mix(in srgb, var(--accent), var(--btn-bg) 85%)')
        mi.addEventListener('mouseleave', () => mi.style.background = 'transparent')
       mi.addEventListener('click', () => {
  menu.style.display = 'none'
  setActive(it.value as any)
  const p: any = (it as any).payload || {}
  if (it.value === 'summarize' && p?.summarizeMode) {
    try { chrome.storage.local.set({ dactiSummarizeMode: p.summarizeMode }) } catch {}
  }
  if (it.value === 'translate' && p?.translateTarget) {
    try { chrome.storage.local.set({ dactiTranslateTarget: p.translateTarget }) } catch {}
  }
  if (it.value === 'rewrite' && p?.style) {
    try { chrome.storage.local.set({ dactiRewriteStyle: p.style }) } catch {}
  }
  run(it.value, it.payload)
})
        menu.appendChild(mi)
      })
   wrap.style.position = 'relative'
wrap.style.height = '100%'
btn.style.width = '100%'
wrap.appendChild(btn); wrap.appendChild(menu)
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation()
        const showing = menu.style.display === 'block'
        document.querySelectorAll('.dropdownMenu').forEach(m => (m as HTMLElement).style.display = 'none')
        menu.style.display = showing ? 'none' : 'block'
        const rect = btn.getBoundingClientRect()
        Object.assign(menu.style, { top: (btn.offsetTop + btn.offsetHeight + 4) + 'px', left: '0px', minWidth: rect.width + 'px' })
      })
      document.addEventListener('click', () => { menu.style.display = 'none' })
      wrap.addEventListener('wheel', () => { menu.style.display = 'none' })
      return { wrap, btn }
    }

    const summarizeDD = makeDropdown('Summarize', [
      { label:'TL;DR (1–2 sentences)', value:'summarize', payload:{ summarizeMode:'tldr' } },
      { label:'5 bullet points', value:'summarize', payload:{ summarizeMode:'bullets' } },
      { label:'ELI5 (simplify)', value:'summarize', payload:{ summarizeMode:'eli5' } },
      { label:'By sections (H2/H3)', value:'summarize', payload:{ summarizeMode:'sections' } },
      { label:'Key facts & numbers', value:'summarize', payload:{ summarizeMode:'facts' } },
    ])
    const translateDD = makeDropdown('Translate', [
      { label:'→ English', value:'translate', payload:{ translateTarget:'en' } },
      { label:'→ Français', value:'translate', payload:{ translateTarget:'fr' } },
      { label:'→ Español', value:'translate', payload:{ translateTarget:'es' } },
      { label:'→ Deutsch', value:'translate', payload:{ translateTarget:'de' } },
      { label:'→ Português', value:'translate', payload:{ translateTarget:'pt' } },
      { label:'Auto → English', value:'translate', payload:{ translateTarget:'auto' } },
    ])
    const writeDD = makeDropdown('Write', [
      { label:'Concise email (EN)', value:'write', payload:{ writeType:'email' } },
      { label:'LinkedIn post', value:'write', payload:{ writeType:'linkedin' } },
      { label:'Tweet / short social', value:'write', payload:{ writeType:'tweet' } },
      { label:'Meeting minutes', value:'write', payload:{ writeType:'minutes' } },
      { label:'Conventional commit', value:'write', payload:{ writeType:'commit' } },
    ])
    const rewriteDD = makeDropdown('Rewrite', [
      { label:'Simplify (clear & plain)', value:'rewrite', payload:{ style:'simplify' } },
      { label:'More formal/professional', value:'rewrite', payload:{ style:'formal' } },
      { label:'Friendlier / conversational', value:'rewrite', payload:{ style:'friendly' } },
      { label:'Shorter / concise', value:'rewrite', payload:{ style:'shorten' } },
      { label:'Longer / more details', value:'rewrite', payload:{ style:'expand' } },
    ])

    const btnAlt = h('button', 'btn', 'Alt Images') as HTMLButtonElement

    grid.appendChild(summarizeDD.wrap)
    grid.appendChild(translateDD.wrap)
    grid.appendChild(rewriteDD.wrap)
    grid.appendChild(btnAlt)
    grid.appendChild(writeDD.wrap)

    const progressWrap = h('div','progressWrap') as HTMLDivElement
    const progressBar = h('div','progressBar') as HTMLDivElement
    progressWrap.appendChild(progressBar)

    const outEl = h('div', 'out') as HTMLDivElement

    // --- Loading animation (cycles one,two,three,four.webp from /public, robustly resolving URLs and bypassing CSP)
    const cacheBust = (u: string) => u + (u.includes('?') ? '&' : '?') + 't=' + Date.now()
    let headerTimer: number | null = null
    let panelTimer: number | null = null
    function startLoading() {
      
      try { stopLoading() } catch {}

      // Two distinct sequences: header uses one/two, panel uses three/four
      const headerRaw = ['one.webp','two.webp']
      const panelRaw  = ['three.webp','four.webp']
      const headerUrls = headerRaw.map((p) => chrome.runtime.getURL(p))
      const panelUrls  = panelRaw.map((p) => chrome.runtime.getURL(p))
     

      // Fallback: convert to data: URL only if extension URL fails
      const toDataUrl = async (extUrl: string) => {
        try {
          const resp = await fetch(extUrl)
          const blob = await resp.blob()
          return await new Promise<string>((resolve, reject) => {
            const fr = new FileReader(); fr.onload = () => resolve(String(fr.result)); fr.onerror = reject; fr.readAsDataURL(blob)
          })
        } catch { return extUrl }
      }

      let hi = 0, pi = 0
      const img = new Image()
      img.alt = ''
      img.referrerPolicy = 'no-referrer'

      // if the current source fails (e.g., CSP blocks), try switching that frame to a data: URL once (for PANEL image)
      const triedDataPanel: Record<number, boolean> = {}
      img.onerror = async () => {
        if (!triedDataPanel[pi]) {
          triedDataPanel[pi] = true
          const dataUrl = await toDataUrl(panelUrls[pi])
          
          img.src = dataUrl
        }
      }

      // Initial frames
      img.src = cacheBust(panelUrls[0])
      if (headerLoaderImg) headerLoaderImg.src = cacheBust(headerUrls[0])
      

      const wrap = document.createElement('div'); wrap.className = 'loadingAnim'; wrap.appendChild(img)
      outEl.innerHTML = ''
      outEl.appendChild(wrap)

      // Separate timers for header and panel animations
      const headerDurations = [400, 200, 200, 600, 400]
      let headerStep = 0

      const advanceHeader = () => {
        hi = (hi + 1) % headerUrls.length
        const nextHeader = headerUrls[hi]
        if (headerLoaderImg) headerLoaderImg.src = cacheBust(nextHeader)
        const nextDelay = headerDurations[headerStep % headerDurations.length]
        headerStep++
        headerTimer = window.setTimeout(advanceHeader, nextDelay)
      }

      const advancePanel = () => {
        pi = (pi + 1) % panelUrls.length
        triedDataPanel[pi] = false
        const nextPanel = panelUrls[pi]
        img.src = cacheBust(nextPanel)
        panelTimer = window.setTimeout(advancePanel, 300)
      }

      // Start independent timers
      headerTimer = window.setTimeout(advanceHeader, 200)
      panelTimer = window.setTimeout(advancePanel, 300)
    }
    function stopLoading() {
     
      if (headerTimer) { clearTimeout(headerTimer); headerTimer = null }
      if (panelTimer)  { clearTimeout(panelTimer);  panelTimer = null }
      if (headerLoaderImg) headerLoaderImg.src = chrome.runtime.getURL('one.webp')
    }
      // expose loading controls to outer listeners
      panelAPI = { startLoading, stopLoading }

  

    wrap.appendChild(header)
    wrap.appendChild(controls)
    wrap.appendChild(grid)
    stopBtn.style.width = 'calc(100% - 24px)'
stopBtn.style.margin = '8px 12px'
wrap.appendChild(stopBtn)
    wrap.appendChild(progressWrap)
    // Place Stop button between grid and progress bar

    wrap.appendChild(outEl)
    wrap.appendChild(toolbar)

    root.appendChild(style)
    root.appendChild(wrap)

    // --- Local availability detection and mode logic ---
    let localAvailable = false
    let userMode: 'auto'|'local'|'cloud' = 'auto'
    let userTouchedToggle = false

    const showProgress = (p: number) => {
      const progressWrap = wrap.querySelector('.progressWrap') as HTMLDivElement
      const progressBar = wrap.querySelector('.progressBar') as HTMLDivElement
      progressWrap.style.display = 'block'
      progressBar.style.width = Math.max(0, Math.min(100, Math.round(p*100))) + '%'
      if (p >= 1) setTimeout(() => { progressWrap.style.display = 'none'; progressBar.style.width = '0%' }, 400)
    }

    async function detectLocalAvailability() {
      // Prefer new global APIs (Summarizer/LanguageModel); fallback to legacy ai.* aggregator
      const Summ = (self as any)?.Summarizer || (typeof ai !== 'undefined' ? (ai as any).summarizer : undefined)
      const LM = (self as any)?.LanguageModel || (typeof ai !== 'undefined' ? (ai as any).prompt : undefined)
      const hasSummarizer = !!(Summ && (Summ as any).create)
      const hasPrompt = !!(LM && (LM as any).create)
      log('detectLocalAvailability:', { hasSummarizer, hasPrompt, Summ: !!Summ, LM: !!LM })
      // Helper to show a status message if not already set
      const showStatus = (msg: string) => {
        try {
          const current = (outEl.textContent || '').trim()
          if (!current) {
            titleEl.textContent = 'DACTI'
            outEl.textContent = msg
          }
        } catch {}
      }
      // Availability probe and early messaging
      let availability = 'unknown' as string
      try {
        if (Summ && (Summ as any).availability) availability = await (Summ as any).availability()
        else if (LM && (LM as any).availability) availability = await (LM as any).availability()
      } catch {}
      log('local availability state =', availability)

      if (availability === 'unavailable') {
        try { chrome.storage.local.set({ dactiLocalAvailable: false, dactiAvailability: availability }) } catch {}
        log('local unavailable → falling back to cloud')
        localAvailable = false
        renderMode(false, true)
        setBadge(false, 'Local API unavailable')
        showStatus('🚫 Local mode unavailable: API not available on this device/browser (see hardware requirements).')
        return false
      }

      if ((availability === 'downloadable' || availability === 'downloading') && !navigator.userActivation.isActive) {
        try { chrome.storage.local.set({ dactiLocalAvailable: false, dactiAvailability: availability }) } catch {}
        log('local requires user activation to download, waiting for user action')
        localAvailable = false
        renderMode(false, true)
        setBadge(false, 'Local model needs user activation to download')
        showStatus('⬇️ Local model is ready for download. Click "Summarize", "Translate", or "Alt Images" to authorize the download, then watch the progress bar.')
        return false
      }

      if (!hasSummarizer && !hasPrompt) {
        try { chrome.storage.local.set({ dactiLocalAvailable: false, dactiAvailability: 'no-apis' }) } catch {}
        log('no Summarizer/LanguageModel APIs found → cloud only')
        localAvailable = false
        renderMode(false, true)
        setBadge(false, 'Local API unavailable')
        showStatus('🚫 Local mode unavailable: `ai.summarizer`/`ai.prompt` APIs are missing. Switching to Cloud.\nTip: To test local capabilities, check your Chrome settings and flags (chrome://flags) to enable the Prompt API / on-device models, then reopen the panel.')
        return false
      }
      showProgress(0)
      try {
        if (hasSummarizer) {
        const sm: any = await (Summ as any).create({
  type: 'key-points',
  outputLanguage: 'en',
  monitor(m: any) {
              try {
                m.addEventListener?.('downloadprogress', (e: any) => {
                  const frac = Math.min(1, Number(e?.loaded || 0) / Math.max(1, Number(e?.total || 1)))
                  showProgress(frac)
                })
              } catch {}
            }
          })
          // Quick no-op summarize to finalize init
          await sm.summarize?.('ok')
        } else if (hasPrompt) {
          const pr: any = await (LM as any).create({
            expectedInputs: [{ type: 'text' }],
            expectedOutputs: [{ type: 'text' }],
            monitor(m: any) {
              try {
                m.addEventListener?.('downloadprogress', (e: any) => {
                  const frac = Math.min(1, Number(e?.loaded || 0) / Math.max(1, Number(e?.total || 1)))
                  showProgress(frac)
                })
              } catch {}
            }
          })
          await pr.prompt?.('ok')
        }
        log('local init OK; model available on-device')
        localAvailable = true
        showProgress(1)
        setBadge(true)
        try { chrome.storage.local.set({ dactiLocalAvailable: true, dactiAvailability: 'available' }) } catch {}
        return true
      } catch (e) {
        try { chrome.storage.local.set({ dactiLocalAvailable: false, dactiAvailability: 'init-failed', dactiLocalError: String(e?.message || e) }) } catch {}
        log('local init failed:', e)
        localAvailable = false
        setBadge(false, 'Local init failed')
        renderMode(false, true)
        showStatus('⚠️ Local model initialization failed: ' + (e?.message || String(e)) + '\n→ Automatically switching to Cloud mode.')
        return false
      }
    }

    function effectiveLocal(): boolean {
      if (userMode === 'local') return localAvailable
      if (userMode === 'cloud') return false
      return localAvailable // auto → prefer local if available
    }

    // Keep badge in sync with network changes
    window.addEventListener('online', () => { setBadge(effectiveLocal()) })
    window.addEventListener('offline', () => { setBadge(effectiveLocal(), 'Offline') })

    // Load saved mode (used only if the user touches the toggle this session)
    chrome.storage.local.get(['dactiMode']).then(({ dactiMode }) => {
      const saved = (dactiMode === 'local' || dactiMode === 'cloud') ? dactiMode : 'auto'
      userMode = saved
      // We intentionally do not mark userTouchedToggle here; initial state will auto-follow detection
    })

    // Initialize local availability when panel opens
    detectLocalAvailability().then(() => {
      if (!userTouchedToggle) {
        userMode = localAvailable ? 'local' : 'cloud'
        chrome.storage.local.set({ dactiMode: userMode, dactiLocalOnly: userMode === 'local' && localAvailable })
      } else {
        // Keep dactiLocalOnly in sync with the effective state
        chrome.storage.local.set({ dactiLocalOnly: effectiveLocal() })
      }
      const currentLocal = effectiveLocal()
      const locked = !localAvailable
      renderMode(currentLocal, locked && !currentLocal)
      setBadge(currentLocal)
    })

    modeInput.addEventListener('change', () => {
      userTouchedToggle = true
      if (!localAvailable && modeInput.checked) { // user tried to switch to Local but it's unavailable
        modeInput.checked = false
        return
      }
      userMode = modeInput.checked ? 'local' : 'cloud'
      chrome.storage.local.set({ dactiMode: userMode, dactiLocalOnly: effectiveLocal() })
      const currentLocal = effectiveLocal()
      renderMode(currentLocal, !localAvailable && !currentLocal)
      setBadge(currentLocal)
    })

    // Theme state
    chrome.storage.local.get('dactiTheme').then(({ dactiTheme }) => {
      const mode = (dactiTheme === 'light' || dactiTheme === 'dark') ? dactiTheme : 'auto'
      themeSelect.value = mode
      applyTheme(mode)
    })
    themeSelect.addEventListener('change', () => {
      const mode = themeSelect.value as 'auto'|'light'|'dark'
      chrome.storage.local.set({ dactiTheme: mode })
      applyTheme(mode)
    })
function setActive(kind: 'summarize' | 'translate' | 'altimages' | 'write' | 'rewrite') {
  summarizeDD.btn.classList.toggle('active', kind === 'summarize')
  translateDD.btn.classList.toggle('active', kind === 'translate')
  rewriteDD.btn.classList.toggle('active', kind === 'rewrite')
  btnAlt.classList.toggle('active', kind === 'altimages')
  writeDD.btn.classList.toggle('active', kind === 'write')
}
    const run = async (action: 'summarize' | 'translate' | 'altimages' | 'write' | 'rewrite', params?: any) => {
        setActive(action)
      startLoading()
      await detectLocalAvailability()
      if (!userTouchedToggle) {
        userMode = localAvailable ? 'local' : 'cloud'
        chrome.storage.local.set({ dactiMode: userMode, dactiLocalOnly: userMode === 'local' && localAvailable })
      } else {
        chrome.storage.local.set({ dactiLocalOnly: effectiveLocal() })
      }
      const localOnly = effectiveLocal()
      renderMode(localOnly, !localAvailable && !localOnly)
      setBadge(localOnly)
      log('RUN', action, { localOnly, userMode, localAvailable, online: navigator.onLine })
      stopBtn.style.display = 'inline-flex'; (stopBtn as HTMLButtonElement).disabled = false
      modeInput.disabled = true; switchEl.classList.add('disabled')
      disable(true)
      try {
        await chrome.runtime.sendMessage({ type: 'DACTI_ACTION', action, localOnly, params })
      } finally {
        stopLoading()
        ;(stopBtn as HTMLButtonElement).disabled = true
        stopBtn.style.display = 'none'
        modeInput.disabled = !localAvailable && userMode !== 'cloud'
        switchEl.classList.toggle('disabled', modeInput.disabled)
        disable(false)
      }
    }

    function disable(v: boolean) {
      (summarizeDD.btn.disabled = v), (translateDD.btn.disabled = v), (rewriteDD.btn.disabled = v), (writeDD.btn.disabled = v)
      btnAlt.disabled = v
    }

btnAlt.addEventListener('click', () => { setActive('altimages'); run('altimages') })
    copyBtn.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(outEl.textContent || '') } catch {}
    })

    // Dragging (document listeners + rAF)
    let dragging = false, ox = 0, oy = 0, raf = 0
    header.addEventListener('mousedown', (ev) => {
      dragging = true
      const r = host.getBoundingClientRect(); ox = ev.clientX - r.left; oy = ev.clientY - r.top
      ev.preventDefault()
    })
    const onMove = (ev: MouseEvent) => {
      if (!dragging) return
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const nx = Math.max(0, Math.min(window.innerWidth - host.offsetWidth, ev.clientX - ox))
        const ny = Math.max(0, Math.min(window.innerHeight - host.offsetHeight, ev.clientY - oy))
        host.style.left = nx + 'px'
        host.style.top = ny + 'px'
        host.style.right = 'auto'
      })
    }
    const onUp = () => { dragging = false }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    // Keyboard shortcuts when panel is present: Alt+1..5 map to summarize modes
    document.addEventListener('keydown', (ev) => {
      if (!refs) return
      if (!ev.altKey || ev.repeat) return
      const map: Record<string,string> = { '1':'tldr','2':'bullets','3':'eli5','4':'sections','5':'facts' }
      const m = map[ev.key]
      if (!m) return
      ev.preventDefault()
      try { chrome.storage.local.set({ dactiSummarizeMode: m }) } catch {}
      setActive('summarize')
      run('summarize', { summarizeMode: m })
    })
    __buildingPanel = false
  refs = { root, host, header, titleEl, outEl, localOnlyCheckbox: undefined as any, btnSummarize: summarizeDD.btn, btnTranslate: translateDD.btn, btnRewrite: rewriteDD.btn, btnAlt, btnWrite: writeDD.btn, closeBtn }
    return refs
  }

  function setContent(title?: string, message?: string) {
    const r = ensurePanel()!
    if (title) r.titleEl.textContent = title
    if (typeof message === 'string') r.outEl.textContent = message
  }

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || typeof msg !== 'object') return

  if (msg.type === 'DACTI_LOADING') {
   
    ensurePanel()!
    if (msg.show) panelAPI?.startLoading(); else panelAPI?.stopLoading()
    return
  }
  // --- ASYNC HANDLERS (must return true) ---
  if (msg.type === 'DACTI_CAPTION_LOCAL') {
    (async () => {
      try {
        log('CAPTION_LOCAL request for', msg.src)
        let blob: Blob | null = null
        try {
          const el = Array.from(document.images).find(im => (im.currentSrc || im.src) === msg.src) as HTMLImageElement | undefined
          if (el && el.complete && el.naturalWidth && el.naturalHeight) {
            const c = document.createElement('canvas'); c.width = el.naturalWidth; c.height = el.naturalHeight
            const g = c.getContext('2d')!; g.drawImage(el, 0, 0)
            blob = await new Promise<Blob>((resolve) => c.toBlob(b => resolve(b || new Blob()), 'image/png'))
            log('CAPTION_LOCAL: used image from DOM')
          }
        } catch (e) { log('CAPTION_LOCAL: DOM extraction failed, will fetch:', e) }
        if (!blob) {
          const resp = await fetch(msg.src, { mode: 'cors' })
          blob = await resp.blob()
          log('CAPTION_LOCAL: fetched image over network (may fail offline)')
        }
        // @ts-ignore
        const hasPrompt = typeof ai !== 'undefined' && ai?.prompt?.create
        if (!hasPrompt) throw new Error('Local multimodal API unavailable')
        // @ts-ignore
        const prompt = await ai.prompt.create({ multimodal: true, model: 'gemini-nano' })
        const res = await prompt.generate({
          image: blob,
          instruction: 'Return STRICT JSON {"alt":"...","tags":["a","b","c"]}. Alt <=120 chars, objective. No extra text.'
        })
        const cleaned0 = stripFences(String(res ?? ''))
        let alt = cleaned0.slice(0,120)
        let tags: string[] = []
        let parsedOk = false
        try { const p = JSON.parse(cleaned0); if (p?.alt) { alt = String(p.alt).slice(0,120); tags = Array.isArray(p.tags) ? p.tags.map((t:any)=>String(t)) : []; parsedOk = true } } catch {}
        if (!parsedOk) {
          const res2 = await prompt.generate({ image: blob, instruction: 'Describe the image in <=120 characters. Return ONLY the sentence.' })
          alt = String(res2 ?? '').slice(0,120)
          tags = []
        }
        const preview = await new Promise<string>((resolve) => {
          const img = new Image(); img.crossOrigin = 'anonymous'
          img.onload = () => { const c = document.createElement('canvas'); c.width = 64; c.height = 64; const g = c.getContext('2d')!; g.drawImage(img, 0, 0, 64, 64); resolve(c.toDataURL('image/png')) }
          img.onerror = () => resolve('')
          img.src = msg.src
        })
        sendResponse({ ok: true, alt, tags, preview })
      } catch (e:any) { sendResponse({ ok:false, error: e?.message || String(e) }) }
    })()
    return true
  }

  if (msg.type === 'DACTI_IMAGE_BASE64') {
    (async () => {
      try {
        log('IMAGE_BASE64 for', msg.src)
        let dataUrl: string | null = null
        try {
          const el = Array.from(document.images).find(im => (im.currentSrc || im.src) === msg.src) as HTMLImageElement | undefined
          if (el && el.complete && el.naturalWidth && el.naturalHeight) {
            const c = document.createElement('canvas'); c.width = el.naturalWidth; c.height = el.naturalHeight
            const g = c.getContext('2d')!; g.drawImage(el, 0, 0)
            dataUrl = c.toDataURL('image/png')
            log('IMAGE_BASE64: produced from DOM')
          }
        } catch (e) { log('IMAGE_BASE64: DOM extraction failed, will fetch:', e) }
        if (!dataUrl) {
          const resp = await fetch(msg.src, { mode: 'cors' })
          const blob = await resp.blob()
          const b64tmp = await new Promise<string>((resolve, reject) => {
            const fr = new FileReader(); fr.onload = () => resolve(String(fr.result).split(',')[1] ?? ''); fr.onerror = reject; fr.readAsDataURL(blob)
          })
          dataUrl = 'data:'+(blob.type||'image/png')+';base64,'+b64tmp
          log('IMAGE_BASE64: fetched image over network (may fail offline)')
        }
        const b64 = (dataUrl.split(',')[1] || '')
        sendResponse({ ok:true, base64: b64, preview: dataUrl })
      } catch (e:any) { sendResponse({ ok:false, error: e?.message || String(e) }) }
    })()
    return true
  }

  // Local-only text ops (summarize / translate / rewrite)
  // if (msg.type === 'DACTI_SUMMARIZE_LOCAL') {
  //   (async () => {
  //     try {
  //       const text = String(msg.text || '')
  //       const mode = String(msg.mode || '')
  //       const Summ = (self as any)?.Summarizer || (typeof ai !== 'undefined' ? (ai as any).summarizer : undefined)
  //       const LM   = (self as any)?.LanguageModel || (typeof ai !== 'undefined' ? (ai as any).prompt     : undefined)
  //       log('LOCAL summarize using', { Summ: !!Summ, LM: !!LM, mode })
  //       let out = ''
  //       if (Summ && (Summ as any).create) {
  //       const sm: any = await (Summ as any).create({ type: 'key-points', outputLanguage: 'en' })
  //         out = String(await sm.summarize?.(text) ?? '')
  //       } else if (LM && (LM as any).create) {
  //         const pr: any = await (LM as any).create({ expectedInputs:[{type:'text'}], expectedOutputs:[{type:'text'}] })
  //         const prompt = ['Summarize the following text clearly.', mode ? `Mode: ${mode}` : '', text].filter(Boolean).join('\n\n')
  //         out = String(await pr.prompt?.(prompt) ?? '')
  //       } else {
  //         throw new Error('Local summarize API unavailable')
  //       }
  //       sendResponse({ ok: true, text: out })
  //     } catch (e:any) { log('LOCAL summarize error:', e); sendResponse({ ok:false, error: e?.message || String(e) }) }
  //   })(); return true
  // }


    // Local-only text ops (summarize / translate / rewrite)
  if (msg.type === 'DACTI_SUMMARIZE_LOCAL') {
    (async () => {
      try {
        const text = String(msg.text || '')
        const mode = String(msg.mode || '')
        const Summ = (self as any)?.Summarizer || (typeof ai !== 'undefined' ? (ai as any).summarizer : undefined)
        const LM   = (self as any)?.LanguageModel || (typeof ai !== 'undefined' ? (ai as any).prompt     : undefined)
        log('LOCAL summarize using', { Summ: !!Summ, LM: !!LM, mode })

        let out = ''

        // Découpage en chunks pour éviter QuotaExceededError
        function chunkText(s: string, max = 6000): string[] {
          const clean = String(s || '').replace(/\r/g,'').replace(/\t/g,' ').replace(/ {2,}/g,' ')
          const paras = clean.split(/\n{2,}/)
          const parts: string[] = []
          let buf = ''
          for (const p of paras) {
            const add = buf ? (buf + '\n\n' + p) : p
            if (add.length <= max) {
              buf = add
            } else {
              if (buf) parts.push(buf)
              if (p.length <= max) {
                buf = p
              } else {
                for (let i = 0; i < p.length; i += max) parts.push(p.slice(i, i + max))
                buf = ''
              }
            }
          }
          if (buf) parts.push(buf)
          return parts
        }

        if (Summ && (Summ as any).create) {
          // Summarizer local (gemini-nano) avec repli dynamique en cas de quota
          const summarizeOne = async (s: string): Promise<string> => {
            // Re-crée une session à chaque chunk pour éviter l'accumulation de contexte
            const sm: any = await (Summ as any).create({ type: 'key-points', outputLanguage: 'en' })
            return String(await sm.summarize?.(s) ?? '')
          }

          const trySummarizeDynamic = async (initialMax: number) => {
            let maxChunk = initialMax
            const MIN = 800

            const processChunks = async (src: string, maxLen: number): Promise<string> => {
              const chunks = chunkText(src, maxLen)
              log('LOCAL summarize chunk plan', { chunks: chunks.length, maxLen })
              const parts: string[] = []
              for (let i = 0; i < chunks.length; i++) {
                const piece = chunks[i]
                let attempt = piece
                let localMax = Math.min(maxLen, Math.max(MIN, piece.length))
                // Boucle de réduction si le chunk seul dépasse encore le quota
                while (true) {
                  try {
                    log('LOCAL summarize chunk', { index: i + 1, total: chunks.length, size: attempt.length })
                    const t = await summarizeOne(attempt)
                    if (t && t.trim()) parts.push(t.trim())
                    break
                  } catch (err: any) {
                    const msg = String(err?.message || err || '')
                    if (/quota|too\s+large/i.test(msg) && localMax > MIN) {
                      // Réduire et re-chunker cette portion uniquement
                      localMax = Math.max(MIN, Math.floor(localMax * 0.66))
                      log('LOCAL summarize shrink chunk due to quota', { from: attempt.length, nextMax: localMax })
                      const sub = chunkText(piece, localMax)
                      // Remplace la stratégie: traiter chaque sous-partie séquentiellement
                      for (const subpart of sub) {
                        try {
                          const t2 = await summarizeOne(subpart)
                          if (t2 && t2.trim()) parts.push(t2.trim())
                        } catch (e2: any) {
                          const m2 = String(e2?.message || e2 || '')
                          if (/quota|too\s+large/i.test(m2) && localMax > MIN) {
                            // Descendre encore et re-injecter ces sous-parties
                            const sub2 = chunkText(subpart, Math.max(MIN, Math.floor(localMax * 0.66)))
                            for (const subsub of sub2) {
                              const t3 = await summarizeOne(subsub).catch(() => '')
                              if (t3 && t3.trim()) parts.push(t3.trim())
                            }
                          } else {
                            throw e2
                          }
                        }
                      }
                      break
                    } else {
                      throw err
                    }
                  }
                }
              }
              return parts.join('\n\n')
            }

            // 1ère passe
            let merged = await processChunks(text, maxChunk)
            // Compression finale si trop long
            if (merged.length > maxChunk) {
              const again = await processChunks(merged, Math.max(MIN, Math.floor(maxChunk * 0.8)))
              if (again.trim()) merged = again
            }
            return merged
          }

          try {
            out = await trySummarizeDynamic(5000)
          } catch (e: any) {
            if (/quota|too\s+large/i.test(String(e?.message || e))) {
              log('LOCAL summarize retry with smaller dynamic chunks due to quota', e?.message || String(e))
              out = await trySummarizeDynamic(3000)
            } else {
              throw e
            }
          }
        } else if (LM && (LM as any).create) {
          // Fallback local via ai.prompt
          const pr: any = await (LM as any).create({ expectedInputs:[{type:'text'}], expectedOutputs:[{type:'text'}] })
          const chunks = chunkText(text, 7000)
          const partials: string[] = []
          for (let i = 0; i < chunks.length; i++) {
            const prompt = [
              'Summarize the following text clearly as concise bullet points.',
              (mode ? `Mode: ${mode}` : ''),
              `Chunk ${i + 1}/${chunks.length}:`,
              chunks[i]
            ].filter(Boolean).join('\n\n')
            const t = String(await pr.prompt?.(prompt) ?? '')
            if (t.trim()) partials.push(t.trim())
          }
          out = partials.join('\n\n')
          if (partials.length > 1) {
            const mergePrompt =
              `Merge and deduplicate the bullet points below into a concise summary (max 8 bullets). Return only the bullets.\n\n${out}`
            const merged = String(await pr.prompt?.(mergePrompt) ?? '')
            if (merged.trim()) out = merged.trim()
          }
        } else {
          throw new Error('Local summarize API unavailable')
        }

        if (!out.trim()) { out = '(No summary produced by local model)' }
        sendResponse({ ok: true, text: out })
      } catch (e:any) {
        log('LOCAL summarize error:', e)
        sendResponse({ ok:false, error: e?.message || String(e) })
      }
    })(); return true
  }

  if (msg.type === 'DACTI_TRANSLATE_LOCAL') {
    (async () => {
      try {
        const text = String(msg.text || '')
        const target = String(msg.target || 'en')
        const LM   = (self as any)?.LanguageModel || (typeof ai !== 'undefined' ? (ai as any).prompt     : undefined)
        log('LOCAL translate using', { LM: !!LM, target })
        if (!(LM && (LM as any).create)) throw new Error('Local translate API unavailable')
        const pr: any = await (LM as any).create({ expectedInputs:[{type:'text'}], expectedOutputs:[{type:'text'}] })
        const prompt = `Translate into ${target}. Return only the translation.\n\n${text}`
        const out = String(await pr.prompt?.(prompt) ?? '')
        sendResponse({ ok: true, text: out })
      } catch (e:any) { log('LOCAL translate error:', e); sendResponse({ ok:false, error: e?.message || String(e) }) }
    })(); return true
  }

  if (msg.type === 'DACTI_REWRITE_LOCAL') {
    (async () => {
      try {
        const text = String(msg.text || '')
        const style = String(msg.style || 'simplify')
        const LM   = (self as any)?.LanguageModel || (typeof ai !== 'undefined' ? (ai as any).prompt     : undefined)
        log('LOCAL rewrite using', { LM: !!LM, style })
        if (!(LM && (LM as any).create)) throw new Error('Local rewrite API unavailable')
        const pr: any = await (LM as any).create({ expectedInputs:[{type:'text'}], expectedOutputs:[{type:'text'}] })
        const prompt = `Rewrite the text with style: ${style}. Return only the result.\n\n${text}`
        const out = String(await pr.prompt?.(prompt) ?? '')
        sendResponse({ ok: true, text: out })
      } catch (e:any) { log('LOCAL rewrite error:', e); sendResponse({ ok:false, error: e?.message || String(e) }) }
    })(); return true
  }
// Local text generation (offline) using on-device APIs
if (msg.type === 'DACTI_GENERATE_LOCAL_TEXT') {
  (async () => {
    try {
      const context = String(msg.context || '')
      const task = String(msg.task || 'Write a concise paragraph based on the context.')
      const Summ = (self as any)?.Summarizer || (typeof ai !== 'undefined' ? (ai as any).summarizer : undefined)
      const LM   = (self as any)?.LanguageModel || (typeof ai !== 'undefined' ? (ai as any).prompt     : undefined)
      let out = ''
      if (LM && (LM as any).create) {
        const pr: any = await (LM as any).create({ expectedInputs: [{ type: 'text' }], expectedOutputs: [{ type: 'text' }] })
        const req = [
          'You are a helpful writing assistant.',
          'TASK:', task,
          'CONTEXT:', context,
          'Return only the final text (no explanations).'
        ].join('\\n\\n')
        out = String(await pr.prompt?.(req) ?? '')
      } else if (Summ && (Summ as any).create) {
        const sm: any = await (Summ as any).create({ type: 'key-points', outputLanguage: 'en' })
        out = String(await sm.summarize?.(`${task}\\n\\n${context}`) ?? '')
      } else {
        throw new Error('Local text generation API unavailable')
      }
      sendResponse({ ok: true, text: out })
    } catch (e: any) {
      sendResponse({ ok: false, error: e?.message || String(e) })
    }
  })()
  return true
}
  // --- SYNC HANDLERS ---
  if (msg.type === 'DACTI_PROGRESS') {
    const r = ensurePanel()!
    const progressWrap = r.root.querySelector('.progressWrap') as HTMLDivElement
    const progressBar = r.root.querySelector('.progressBar') as HTMLDivElement
    const v = Math.max(0, Math.min(1, Number(msg.value || 0)))
    progressWrap.style.display = 'block'
    progressBar.style.width = (v * 100).toFixed(0) + '%'
    if (v >= 1) setTimeout(() => { progressWrap.style.display = 'none'; progressBar.style.width = '0%' }, 400)
    return
  }

  if (msg.type === 'DACTI_PANEL_OPEN') { setContent(msg.title, msg.message); return }
  if (msg.type === 'DACTI_PANEL_UPDATE') { setContent(msg.title, msg.message); return }

  if (msg.type === 'DACTI_PANEL_ALTTABLE' && Array.isArray(msg.items)) {
    const r = ensurePanel()!
    const list = msg.items as Array<{ src:string; alt:string; tags:string[]; preview?:string }>
    const html = ['<div class="alts">', ...list.map(raw => {
      let alt = raw.alt || ''
      let tags = Array.isArray(raw.tags) ? raw.tags : []
      const fence = /```(?:json)?\s*[\s\S]*```/i
      if (fence.test(alt)) {
        try { const p = JSON.parse(alt.replace(/```(?:json)?\s*([\s\S]*?)```/i,'$1')); if (p?.alt) { alt = String(p.alt); if (Array.isArray(p.tags)) tags = p.tags } } catch {}
      }
      const safeSrc = (raw.preview||raw.src||'').replace(/\"/g,'&quot;')
      let host = ''; try { host = new URL(raw.src).hostname } catch {}
           const altText = (alt ? `<div class="altline"><strong>alt:</strong> ${alt.replace(/[<>]/g,'')}</div>` : '')
      const tagsHtml = tags.length ? `<div class="alttagsScroll"><div class="alttags"><strong>tags:</strong> ${tags.join(', ')}</div></div>` : ''
      const catHtml = (raw as any).category ? `<div class="alttags"><strong>cat:</strong> ${String((raw as any).category)}</div>` : ''
      const toneHtml = (raw as any).tone ? `<div class="alttags"><strong>tone:</strong> ${String((raw as any).tone)}</div>` : ''
      const srcLine = host ? `<div class="alttags" style="opacity:.7">${host}</div>` : ''
      return `
        <div class="altrow">
          <img src="${safeSrc}" alt=""/>
          <div class="altmeta">
            ${altText}
            ${tagsHtml}
            ${catHtml}
            ${toneHtml}
          
          </div>
        </div>`
    }), '</div>'].join('')
    r.outEl.innerHTML = html
    return
  }

  if (msg.type === 'DACTI_STOP_SHOW' || msg.type === 'DACTI_STOP_HIDE') {
    const r = ensurePanel()!
    const btn = r.root.querySelector('.btn.stop') as HTMLButtonElement | null
    if (!btn) return
    if (msg.type === 'DACTI_STOP_SHOW') { btn.style.display = 'inline-flex'; btn.disabled = false }
    else { btn.disabled = true; btn.style.display = 'none' }
    return
  }
})


})()