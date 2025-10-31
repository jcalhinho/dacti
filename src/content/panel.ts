
import {
  state,
  log,
  DBG,
} from './globals';
import { h } from './utils';

const debugError = (label: string, err: unknown) => {
  if (!DBG) return;
  log(label, err);
};

function createPanelElements() {
  const host = h('div') as HTMLDivElement;
  host.id = 'dacti-floating-panel';
  Object.assign(host.style, {
    position: 'fixed',
    top: '0px',
    right: '16px',
    width: '320px',
    height: '100vh',
    zIndex: '2147483647',
    contain: 'layout',
  });
  host.style.backgroundColor = 'transparent';

  const root = host.attachShadow({ mode: 'open' });
  const style = h('style') as HTMLStyleElement;
  style.textContent = `
    :host { all: initial; }
    .wrap {
      --bg:#ffffff; --text:#111827; --muted:#475569; --border:#e5e7eb; --subtle:#f8fafc; --card:#f9fafb;
      --btn-bg:#ffffff; --btn-border:#e5e7eb; --btn-hover-shadow: 0 6px 18px rgba(26,115,232,.18); --badge-bg: rgba(66,133,244,.10); --badge-border:#d1d5db; --accent:#1a73e8;

      box-sizing: border-box; display: flex; flex-direction: column; border-radius: 20px; border: 2px solid #7c94c5ff; width: 100%; height: 100%;
      background: var(--bg, #ffffff);
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
    .btn { appearance:none; border:1px solid var(--btn-border); background:var(--btn-bg); border-radius:8px; padding:10px; font-size:11px; font-weight:500; color:var(--text); cursor:pointer; display:flex; align-items:center; justify-content:space-between; gap:6px; transition: box-shadow .2s ease, border-color .2s ease, transform .06s ease; min-height:40px; width:100%; position:relative; }
    .btn:hover { box-shadow: var(--btn-hover-shadow); border-color: color-mix(in srgb, var(--accent) 40%, var(--btn-border)); }
    .btn.active{
      background: color-mix(in srgb, var(--accent) 12%, var(--btn-bg));
      border-color: color-mix(in srgb, var(--accent) 55%, var(--btn-border));
    }
    .btn .btnLabel{ flex:1; text-align:left; text-transform: uppercase; }
    .btn .right{ display:flex; align-items:center; gap:8px; }
    .btn .caret{ line-height:1; }
    .grid .btn.proofread{ grid-column: 1 / -1; }
    .grid .btn.proofread{ justify-content:center; }
    .grid .btn.proofread .right{ position:absolute; right:12px; }
    .btn .left{ display:flex; align-items:center; gap:8px; min-width:0; }
    .btn .btnLabel{ flex:0 1 auto; overflow:hidden; text-overflow:ellipsis; }
    .btn .info{ position:relative; width:13px; height:13px; display:inline-flex; align-items:center; justify-content:center; border:1px solid var(--text); border-radius:50%; font-size:10px; line-height:1; opacity:.75; cursor:help; user-select:none; font-weight:400; }
    .btn .info:hover{ opacity:1; }
    .btn .info::after{ content: attr(data-tip); position:absolute; bottom: calc(100% + 8px); left:50%; transform: translateX(-50%); width:160px; max-width:180px; white-space:normal; word-break: break-word; background: var(--card); color: var(--text); border:1px solid var(--border); border-radius:8px; padding:8px 10px; box-shadow: 0 8px 22px rgba(0,0,0,.18); opacity:0; pointer-events:none; transition:opacity .12s ease; z-index:10000; }
    .btn .info.align-left::after{ left:auto; right:0; transform: translateX(0); }
    .btn .info::before{ content:""; position:absolute; bottom: calc(100% + 4px); left:50%; transform: translateX(-50%) rotate(45deg); width:8px; height:8px; background: var(--card); border-left:1px solid var(--border); border-top:1px solid var(--border); opacity:0; transition:opacity .12s ease; }
    .btn .info.align-left::before{ left:auto; right:8px; transform: rotate(45deg); }
    .btn .info:hover::after, .btn .info:hover::before{ opacity:1; }
    .dropdownItem{ display:flex; align-items:center; justify-content:space-between; gap:8px; }
    .dropdownItem .info{ position:relative; width:13px; height:13px; display:inline-flex; align-items:center; justify-content:center; border:1px solid var(--text); border-radius:50%; font-size:10px; line-height:1; opacity:.75; cursor:help; user-select:none; font-weight:400; }
    .dropdownItem .info:hover{ opacity:1; }
    .dropdownItem .info::after{ content: attr(data-tip); position:absolute; bottom: calc(100% + 6px); left:50%; transform: translateX(-50%); width:180px; max-width:200px; padding:6px 8px; border-radius:6px; border:1px solid var(--border); background:var(--card); color:var(--text); box-shadow:0 6px 18px rgba(0,0,0,.18); white-space:normal; word-break:break-word; opacity:0; pointer-events:none; transition:opacity .12s ease; z-index:10000; }
    .dropdownItem .info.align-left::after{ left:auto; right:0; transform: translateX(0); }
    .dropdownItem .info::before{ content:""; position:absolute; bottom: calc(100% + 2px); left:50%; transform: translateX(-50%) rotate(45deg); width:6px; height:6px; background: var(--card); border-left:1px solid var(--border); border-top:1px solid var(--border); opacity:0; transition:opacity .12s ease; }
    .dropdownItem .info.align-left::before{ left:auto; right:6px; transform: rotate(45deg); }
    .dropdownItem .info:hover::after, .dropdownItem .info:hover::before{ opacity:1; }
    .btn:active { transform: translateY(1px); }
    .btn:disabled { opacity:.6; cursor:default; box-shadow:none; }
    .markdown-output{ font-size:12px; line-height:1.45; color:var(--text); }
    .markdown-output h2{ font-size:15px; font-weight:600; margin:12px 0 6px; color: color-mix(in srgb, var(--accent), var(--text) 40%); }
    .markdown-output h3{ font-size:13px; font-weight:600; margin:10px 0 4px; color: color-mix(in srgb, var(--accent) 60%, var(--text)); }
    .markdown-output p{ margin:0 0 10px; }
    .markdown-output ul{ margin:0 0 10px 16px; padding:0 0 0 8px; }
    .markdown-output li{ margin:0 0 6px; }
    .markdown-output blockquote{ margin:10px 0; padding:6px 10px; border-left:3px solid var(--accent); background: color-mix(in srgb, var(--accent) 8%, var(--card)); color: var(--muted); border-radius:8px; }
    .markdown-output code{ background: color-mix(in srgb, var(--accent) 12%, var(--card)); border-radius:4px; padding:0 4px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; font-size:11px; }
    .markdown-output hr{ border:none; border-top:1px solid color-mix(in srgb, var(--accent) 35%, var(--border)); margin:12px 0; }
    .markdown-output a{ color: var(--accent); text-decoration:none; font-weight:500; }
    .markdown-output a:hover{ text-decoration:underline; }
    .out {
      flex:1 1 auto;
      margin:12px;
      margin-top:0;
      border:1px solid var(--border);
      border-radius:12px;
      background: color-mix(in srgb, var(--accent) 4%, var(--card));
      padding:10px;
      overflow:auto;
      white-space:pre-wrap;
      min-height:60px;
      font-size:12px;
      -webkit-user-modify: read-write-plaintext-only;
      transition: box-shadow .2s ease, border-color .2s ease;
    }
    .out:hover {
      box-shadow: var(--btn-hover-shadow);
      border-color: color-mix(in srgb, var(--accent) 40%, var(--border));
    }
    .out:focus {
      outline:none;
      box-shadow: var(--btn-hover-shadow);
      border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
    }
    .out h1, .out h2, .out h3, .out p, .out strong, .out b, .out em, .out i, .out ul, .out ol, .out li, .out code, .out pre, .out blockquote, .out hr {
      font-size: 12px;
    }
    .toolbar { display:flex; gap:8px; padding:8px 12px; border-top:1px solid var(--border); background:var(--subtle); border-bottom-left-radius:20px; border-bottom-right-radius:20px; }
    .toolbar .btn{ justify-content:center; } 
    .small { font-size:12px; display:flex; align-items:center; gap:6px; color:var(--muted); }
    .sr-only{ position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0; }
    .badge { font-size:11px; padding:2px 6px; border:1px solid var(--badge-border); border-radius:999px; color:var(--accent); background: var(--badge-bg); }
    .header .badge{ margin-left:auto; }
    .loaderImg{ width:12px; height:12px; display:inline-block; object-fit:contain; margin-right:6px; border-radius:2px; }
    .toggleRow{ display:flex; align-items:center; gap:8px; flex:0 0 auto; }
    .smallLabel{ font-size:11px; color:var(--muted); user-select:none; }
    .wrap[data-theme="dark"] .smallLabel{ color:#94a3b8; }
    .themeBtnWrap{ position:relative; flex:0 0 auto; display:flex; align-items:center; }
    .btn.theme{ justify-content:space-between; padding:6px 8px; width:auto; min-width:0; }
    .btn.theme .left{ gap:4px; align-items:center; }
    .btn.theme .themeIcon{ display:inline-flex; align-items:center; justify-content:center; width:16px; height:16px; }
    .btn.theme .themeIcon svg{ width:14px; height:14px; display:block; }
    .themeMenu{ position:absolute; background:var(--btn-bg); border:1px solid var(--btn-border); border-radius:8px; box-shadow:0 8px 22px rgba(0,0,0,.18); padding:6px; display:none; z-index:9999; min-width:140px; }
    .themeMenu .dropdownItem{ padding:8px 10px; border-radius:6px; cursor:pointer; font-size:12px; display:flex; align-items:center; gap:8px; }
    .themeMenu .dropdownItem.selected{ background: color-mix(in srgb, var(--accent) 18%, var(--btn-bg)); }
    .themeMenu .dropdownItem .itemLabel{ flex:1; }
    .switch{ position:relative; display:inline-block; width:40px; height:22px; }
    .switch input{ opacity:0; width:0; height:0; }
    .slider{ position:absolute; inset:0; cursor:pointer; background:#1a73e8; border-radius:999px; box-shadow:inset 0 1px 2px rgba(0,0,0,.15); transition:background .18s ease; }
    .slider:before{ content:""; position:absolute; height:18px; width:18px; left:2px; top:2px; background:#fff; border-radius:50%; box-shadow:0 2px 6px rgba(0,0,0,.2); transition:transform .18s ease; }
    .switch input:checked + .slider{ background:#34a853; }
    .switch input:checked + .slider:before{ transform:translateX(18px); }
    .switch.disabled .slider{ cursor:not-allowed; }
    .switch.disabled .slider:before{ box-shadow:0 1px 3px rgba(0,0,0,.15); }
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
  `;

  const wrap = h('div', 'wrap fadeIn');
  const header = h('div', 'header') as HTMLDivElement;
  const titleEl = h('div', 'title', 'DACTI') as HTMLDivElement;
  const closeBtn = h('button', 'close') as HTMLButtonElement;
  closeBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

  const controls = h('div', 'controls');
  const grid = h('div', 'grid');
  const btnProofread = h('button', 'btn proofread') as HTMLButtonElement;
  btnProofread.innerHTML = `<span class="left"><span class="btnLabel">Proofread</span></span><span class="right"><span class="info" data-tip="Corrects grammar, spelling, and style of the current text.">i</span></span>`;
  const proofInfo = btnProofread.querySelector('.info') as HTMLSpanElement | null;
  proofInfo?.classList.add('align-left');
  const outEl = h('div', 'out') as HTMLDivElement;
  outEl.contentEditable = 'true';
  outEl.classList.add('markdown-output');
  const toolbar = h('div', 'toolbar');
  const copyBtn = h('button', 'btn', 'Copy') as HTMLButtonElement;

  toolbar.appendChild(copyBtn);
  wrap.appendChild(header);
  wrap.appendChild(controls);
  wrap.appendChild(grid);
  wrap.appendChild(outEl);
  wrap.appendChild(toolbar);
  root.appendChild(style);
  root.appendChild(wrap);

  return { root, host, header, titleEl, outEl, btnProofread, closeBtn, controls, grid, copyBtn };
}

export function ensurePanel() {
  if (state.refs) return state.refs;
  if (state.buildingPanel) return state.refs as any;
  state.buildingPanel = true;

  const { root, host, header, titleEl, outEl, btnProofread, closeBtn, controls, grid, copyBtn } = createPanelElements();

  type ThemeMode = 'auto'|'light'|'dark';
  type ResolvedTheme = 'light'|'dark';
  const SUN_ICON =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>';
  const MOON_ICON =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 0 1 11.21 3 7 7 0 1 0 21 12.79z"/></svg>';
  let themeBtn: HTMLButtonElement | null = null;
  let themeMenu: HTMLDivElement | null = null;
  let themeIconSpan: HTMLSpanElement | null = null;
  const themeOptionEls: Record<ThemeMode, HTMLDivElement | null> = { auto: null, light: null, dark: null };
  const themeOptionLabels: Record<ThemeMode, string> = {
    auto: 'Auto',
    light: 'Light',
    dark: 'Dark',
  };
  let currentThemeMode: ThemeMode = 'auto';
  let resolvedTheme: ResolvedTheme = 'light';


  const INIT_STATUS_MSG = 'Initializing the AI engine… preparing Local/Cloud mode. Please wait.';
  const DOWNLOAD_STATUS_MSG = 'Downloading the on-device AI model… Hang tight while we finish the first-time setup.';
  const canReplaceStatus = () => {
    const current = (outEl.textContent || '').trim();
    return !current || current === INIT_STATUS_MSG || current === DOWNLOAD_STATUS_MSG;
  };
  const setStatusMessage = (msg: string, force = false) => {
    try {
      if (force || canReplaceStatus()) {
        titleEl.textContent = 'DACTI';
        outEl.textContent = msg;
      }
    } catch (err) { debugError('Failed to update status text', err); }
  };

  let mql: MediaQueryList | null = null;
  const updateThemeDisplay = () => {
    if (themeIconSpan) {
      themeIconSpan.innerHTML = resolvedTheme === 'dark' ? MOON_ICON : SUN_ICON;
    }
    if (themeBtn) {
      const title = currentThemeMode === 'auto'
        ? 'Theme: Auto'
        : `Theme: ${currentThemeMode === 'dark' ? 'Dark' : 'Light'}`;
      themeBtn.title = title;
      themeBtn.dataset.mode = currentThemeMode;
    }
    (['auto','light','dark'] as const).forEach((mode) => {
      const el = themeOptionEls[mode];
      if (!el) return;
      const selected = currentThemeMode === mode;
      el.classList.toggle('selected', selected);
      el.setAttribute('aria-selected', selected ? 'true' : 'false');
      if (selected) {
        el.style.background = '';
      }
      if (!selected && !el.matches(':hover')) {
        el.style.background = '';
      }
      if (mode === 'auto') {
        const label = el.querySelector('.itemLabel');
        if (label) {
          label.textContent = themeOptionLabels.auto;
        }
      } else {
        const label = el.querySelector('.itemLabel');
        if (label) label.textContent = themeOptionLabels[mode];
      }
    });
  };

  const setBg = (isDark: boolean) => {
    const wrapEl = root.querySelector('.wrap') as HTMLDivElement;
    if (!wrapEl) return;
    wrapEl.setAttribute('data-theme', isDark ? 'dark' : 'light');
    wrapEl.style.backgroundColor = isDark ? '#0b1220' : '#ffffff';
    resolvedTheme = isDark ? 'dark' : 'light';
    updateThemeDisplay();
  };

  const applyTheme = (mode: ThemeMode) => {
    currentThemeMode = mode;
    if (mql) { mql.onchange = null; mql = null; }
    if (mode === 'dark') {
      setBg(true);
    } else if (mode === 'light') {
      setBg(false);
    } else {
      mql = window.matchMedia('(prefers-color-scheme: dark)');
      const sync = () => setBg(!!mql && mql.matches);
      sync();
      if (mql) mql.onchange = sync;
    }
    updateThemeDisplay();
  };

  function setThemeMode(mode: ThemeMode, persist = true) {
    const next: ThemeMode = mode === 'light' || mode === 'dark' ? mode : 'auto';
    applyTheme(next);
    if (persist) {
      try { chrome.storage.local.set({ dactiTheme: next }); } catch (err) { debugError('Failed to persist theme mode', err); }
    }
  }

  function onDrag(onMove: (ev: MouseEvent) => void, onUp: () => void) {
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }
  }
  let cleanupDrag: (() => void) | null = null;

  closeBtn.addEventListener('click', () => {
    try { chrome.runtime.sendMessage({ type: 'DACTI_CANCEL', silent: true }) } catch (err) { debugError('Close button cancel failed', err) }
    state.panelDismissed = true;
    if (state.panelAPI) state.panelAPI.stopLoading();
    state.panelAPI = null;
    state.activeKind = null;
    if (cleanupDrag) cleanupDrag();
    host.remove();
    state.refs = null;
  });

  header.appendChild(titleEl);
  const testImg = new Image();
  testImg.src = chrome.runtime.getURL('two.webp');
  testImg.alt = 'dacti_loader';
  testImg.width = 40;
  testImg.height = 40;
  testImg.style.objectFit = 'contain';
  header.appendChild(testImg);
  let headerLoaderImg: HTMLImageElement | null = testImg;

  const modeWrap = h('div', 'small toggleRow');
  const cloudLbl = h('span', 'smallLabel', 'Cloud');
  const switchEl = document.createElement('label') as HTMLLabelElement;
  switchEl.className = 'switch';
  const modeInput = document.createElement('input') as HTMLInputElement;
  modeInput.type = 'checkbox';
  const modeSlider = h('span', 'slider') as HTMLSpanElement;
  switchEl.appendChild(modeInput);
  switchEl.appendChild(modeSlider);
  const localLbl = h('span', 'smallLabel', 'Local');

  const renderMode = (local: boolean, locked: boolean) => {
    modeInput.checked = local;
    modeInput.disabled = locked;
    switchEl.classList.toggle('disabled', locked);
    const tip = [
      local ? 'Local mode (on-device Gemini Nano).' : 'Cloud mode (proxy/API).',
      'On launch: Auto tries Local if available; otherwise Cloud.',
      locked && !local ? 'Local model not installed/compatible → locked to Cloud.' : '',
      cloudAvailable === false ? 'Cloud fallback not configured yet — add a proxy or API key in Settings.' : '',
    ].filter(Boolean).join(' ');
    switchEl.title = tip;
    cloudLbl.title = tip;
    localLbl.title = tip;
  }

  modeWrap.appendChild(cloudLbl);
  modeWrap.appendChild(switchEl);
  modeWrap.appendChild(localLbl);

  const themeWrap = h('div', 'small themeBtnWrap');
  themeBtn = h('button', 'btn theme has-caret') as HTMLButtonElement;
  themeBtn.type = 'button';
  themeBtn.setAttribute('aria-haspopup', 'listbox');
  themeBtn.setAttribute('aria-expanded', 'false');
  themeBtn.setAttribute('aria-label', 'Change theme');
  const themeLeft = h('span', 'left');
  themeIconSpan = h('span', 'themeIcon') as HTMLSpanElement;
  const themeIconLabel = h('span', 'sr-only', 'Theme');
  themeLeft.appendChild(themeIconSpan);
  themeLeft.appendChild(themeIconLabel);
  const themeRight = h('span', 'right');
  const themeCaret = h('span', 'caret', '▾');
  themeRight.appendChild(themeCaret);
  themeBtn.appendChild(themeLeft);
  themeBtn.appendChild(themeRight);
  themeMenu = h('div', 'themeMenu') as HTMLDivElement;
  themeMenu.classList.add('dropdownMenu');
  themeMenu.setAttribute('role', 'listbox');
  (['auto','light','dark'] as const).forEach((mode) => {
    const item = h('div', 'dropdownItem') as HTMLDivElement;
    item.dataset.mode = mode;
    item.setAttribute('role', 'option');
    const label = h('span', 'itemLabel', themeOptionLabels[mode]);
    item.appendChild(label);
    item.addEventListener('mouseenter', () => { item.style.background = 'color-mix(in srgb, var(--accent), var(--btn-bg) 85%)'; });
    item.addEventListener('mouseleave', () => {
      if (!item.classList.contains('selected')) item.style.background = '';
    });
    item.addEventListener('click', () => {
      themeMenu!.style.display = 'none';
      if (openDropdownMenu === themeMenu) openDropdownMenu = null;
      item.style.background = '';
      if (themeBtn) themeBtn.setAttribute('aria-expanded', 'false');
      setThemeMode(mode, true);
    });
    themeMenu.appendChild(item);
    themeOptionEls[mode] = item;
  });
  themeWrap.appendChild(themeBtn);
  themeWrap.appendChild(themeMenu);
  themeBtn.addEventListener('click', (ev) => {
    ev.stopPropagation();
    if (!themeMenu) return;
    const showing = themeMenu.style.display === 'block';
    if (openDropdownMenu && openDropdownMenu !== themeMenu) {
      openDropdownMenu.style.display = 'none';
    }
    if (showing) {
      themeMenu.style.display = 'none';
      if (themeBtn) themeBtn.setAttribute('aria-expanded', 'false');
      openDropdownMenu = null;
    } else {
      themeMenu.style.display = 'block';
      openDropdownMenu = themeMenu;
      const rect = themeBtn!.getBoundingClientRect();
      Object.assign(themeMenu.style, {
        top: themeBtn.offsetTop + themeBtn.offsetHeight + 4 + 'px',
        left: '0px',
        minWidth: rect.width + 'px',
      });
      themeBtn.setAttribute('aria-expanded', 'true');
    }
  });
  themeWrap.addEventListener('wheel', () => {
    if (openDropdownMenu === themeMenu && themeMenu) {
      themeMenu.style.display = 'none';
      if (themeBtn) themeBtn.setAttribute('aria-expanded', 'false');
      openDropdownMenu = null;
    }
  });
  const prefersDark = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)').matches
    : false;
  resolvedTheme = prefersDark ? 'dark' : 'light';
  updateThemeDisplay();

  const stopBtn = h('button', 'btn stop') as HTMLButtonElement;
  stopBtn.innerHTML = '<span class="spin" aria-hidden="true"></span>Stop';
  chrome.storage.local.get('dactiLoaderImage').then(({ dactiLoaderImage }) => {
    const url = (typeof dactiLoaderImage === 'string' ? dactiLoaderImage.trim() : '');
    if (url) {
      stopBtn.innerHTML = `<img class="loaderImg" src="${url}" alt=""/>Stop`;
    }
  });
  stopBtn.style.display = 'none';
  stopBtn.addEventListener('click', async () => {
    stopBtn.disabled = true;
    try { await chrome.runtime.sendMessage({ type:'DACTI_CANCEL' }) } catch (err) { debugError('Stop button cancel failed', err) }
  });

  const badge = h('span', 'badge', 'Detecting…');
  const setBadge = (isLocal: boolean, tipExtra = '') => {
    const offline = isLocal && !navigator.onLine;
    badge.textContent = isLocal ? (offline ? 'Local (offline)' : 'Local') : 'Cloud';
    const baseTip = isLocal
      ? (offline ? 'Local on-device — offline.' : 'Local mode (on-device Gemini Nano).')
      : 'Cloud mode (proxy/API).';
    const extraBits = [
      tipExtra,
      cloudAvailable === false ? 'Cloud fallback not configured.' : ''
    ].filter(Boolean).join(' ');
    badge.title = [baseTip, extraBits].filter(Boolean).join(' ');
  }
  header.appendChild(badge);
  header.appendChild(closeBtn);

  controls.appendChild(modeWrap);
  controls.appendChild(themeWrap);

  let openDropdownMenu: HTMLDivElement | null = null;
  if (!(root as any).__dropdownGlobalCloser) {
    (root as any).__dropdownGlobalCloser = true;
    root.addEventListener('click', () => {
      if (openDropdownMenu) {
        if (openDropdownMenu === themeMenu && themeBtn) {
          themeBtn.setAttribute('aria-expanded', 'false');
        }
        openDropdownMenu.style.display = 'none';
        openDropdownMenu = null;
      }
    });
  }

  type DropdownValue = 'summarize' | 'translate' | 'write' | 'rewrite';
  type InfoAlign = 'center' | 'left';
  function makeDropdown(
    label: string,
    items: { label: string; value: DropdownValue; payload?: any; tip?: string; tipAlign?: InfoAlign }[],
    tip: string,
    infoAlign: InfoAlign = 'center'
  ) {
    const wrap = h('div') as HTMLDivElement;
    const btn = h('button', 'btn has-caret') as HTMLButtonElement;
    btn.addEventListener('mousedown', (ev) => { ev.preventDefault(); outEl.blur() });
    btn.innerHTML = `<span class="left"><span class="btnLabel">${label}</span></span><span class="right"><span class="info" data-tip="${tip.replace(/"/g,'&quot;')}">i</span><span class="caret" aria-hidden="true">▾</span></span>`;
    if (infoAlign === 'left') {
      const infoEl = btn.querySelector('.info') as HTMLSpanElement | null;
      infoEl?.classList.add('align-left');
    }
    const menu = h('div') as HTMLDivElement;
    Object.assign(menu.style, { position:'absolute', background:'var(--btn-bg)', border:'1px solid var(--btn-border)', borderRadius:'8px', boxShadow:'0 8px 22px rgba(0,0,0,.18)', padding:'6px', display:'none', zIndex:'9999' });
    menu.className = 'dropdownMenu';
    items.forEach(it => {
      const mi = h('div', 'dropdownItem') as HTMLDivElement;
      Object.assign(mi.style, { padding:'8px 10px', borderRadius:'6px', cursor:'pointer', fontSize:'12px' });
      mi.addEventListener('mouseenter', () => mi.style.background = 'color-mix(in srgb, var(--accent), var(--btn-bg) 85%)');
      mi.addEventListener('mouseleave', () => mi.style.background = 'transparent');
      mi.addEventListener('click', () => {
        menu.style.display = 'none';
        if (openDropdownMenu === menu) openDropdownMenu = null;
        setActive(it.value as any);
        const p: any = (it as any).payload || {};
        if (it.value === 'summarize' && p?.summarizeMode) {
          try { chrome.storage.local.set({ dactiSummarizeMode: p.summarizeMode }) } catch (err) { debugError('Failed to persist summarize mode (dropdown)', err) }
        }
        if (it.value === 'translate' && p?.translateTarget) {
          try { chrome.storage.local.set({ dactiTranslateTarget: p.translateTarget }) } catch (err) { debugError('Failed to persist translate target (dropdown)', err) }
        }
        if (it.value === 'rewrite' && p?.style) {
          try { chrome.storage.local.set({ dactiRewriteStyle: p.style }) } catch (err) { debugError('Failed to persist rewrite style (dropdown)', err) }
        }
        run(it.value, it.payload);
      });
      const labelEl = h('span', 'itemLabel', it.label);
      labelEl.style.flex = '1';
      mi.appendChild(labelEl);
      if (it.tip) {
        const info = h('span', 'info', 'i') as HTMLSpanElement;
        info.dataset.tip = it.tip;
        if ((it.tipAlign || infoAlign) === 'left') info.classList.add('align-left');
        info.addEventListener('click', (ev) => { ev.stopPropagation(); });
        mi.appendChild(info);
      }
      menu.appendChild(mi);
    });
    wrap.style.position = 'relative';
    wrap.style.height = '100%';
    btn.style.width = '100%';
    wrap.appendChild(btn);
    wrap.appendChild(menu);
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const showing = menu.style.display === 'block';
      if (openDropdownMenu && openDropdownMenu !== menu) {
        openDropdownMenu.style.display = 'none';
      }
      menu.style.display = showing ? 'none' : 'block';
      openDropdownMenu = showing ? null : menu;
      const rect = btn.getBoundingClientRect();
      Object.assign(menu.style, { top: (btn.offsetTop + btn.offsetHeight + 4) + 'px', left: '0px', minWidth: rect.width + 'px' });
    });
    wrap.addEventListener('wheel', () => {
      if (openDropdownMenu) { openDropdownMenu.style.display = 'none'; openDropdownMenu = null }
    });
    return { wrap, btn };
  }

  const summarizeDD = makeDropdown('Summarize', [
    { label:'TL;DR (1–2 sentences)', value:'summarize', payload:{ summarizeMode:'tldr' }, tip:'Condenses the selection into 1–2 plain sentences without bullets.' },
    { label:'5 bullet points', value:'summarize', payload:{ summarizeMode:'bullets' }, tip:'Five concise bullets capturing the key themes of the selection.' },
    { label:'ELI5 (simplify)', value:'summarize', payload:{ summarizeMode:'eli5' }, tip:'Explains the content in kid-friendly language with short, simple bullets.' },
    { label:'By sections (H2/H3)', value:'summarize', payload:{ summarizeMode:'sections' }, tip:'Produces an outline grouped by logical sections with headings.' },
    { label:'Key facts & numbers', value:'summarize', payload:{ summarizeMode:'facts' }, tip:'Lists important figures, dates, metrics, and named entities as bullets.' },
  ], 'Summarizes the selection. If nothing is selected, the page title and main body text are sent instead.');
  const translateDD = makeDropdown('Translate', [
    { label:'→ English', value:'translate', payload:{ translateTarget:'en' }, tip:'Translates the text into English while keeping tone and formatting.', tipAlign:'left' },
    { label:'→ French', value:'translate', payload:{ translateTarget:'fr' }, tip:'Translates into French with native phrasing and preserved entities.', tipAlign:'left' },
    { label:'→ Spanish', value:'translate', payload:{ translateTarget:'es' }, tip:'Translates into Spanish, maintaining key terms and numbers.', tipAlign:'left' },
    { label:'→ German', value:'translate', payload:{ translateTarget:'de' }, tip:'Translates into German with neutral professional tone.', tipAlign:'left' },
    { label:'→ Portuguese', value:'translate', payload:{ translateTarget:'pt' }, tip:'Translates into Portuguese, matching context and register.', tipAlign:'left' },
    { label:'Auto → English', value:'translate', payload:{ translateTarget:'auto' }, tip:'Detects the source language automatically and outputs English.', tipAlign:'left' },
  ], 'Translates the selection. Without a selection, we send the page title followed by the visible body text snippet.', 'left');
  const writeDD = makeDropdown('Write', [
    { label:'Concise email (EN)', value:'write', payload:{ writeType:'email' }, tip:'Drafts a friendly-but-professional English email with greeting, key points, and closing.', tipAlign:'left' },
    { label:'LinkedIn post', value:'write', payload:{ writeType:'linkedin' }, tip:'Creates a 250–350 word LinkedIn update with hook, insights, and light call-to-action.', tipAlign:'left' },
    { label:'Tweet / short social', value:'write', payload:{ writeType:'tweet' }, tip:'Generates a <280 character social post with one key message and ≤2 hashtags.', tipAlign:'left' },
    { label:'Meeting minutes', value:'write', payload:{ writeType:'minutes' }, tip:'Outputs structured minutes with Agenda, Key Decisions, and Action Items sections.', tipAlign:'left' },
    { label:'Conventional commit', value:'write', payload:{ writeType:'commit' }, tip:'Produces a Conventional Commit (type(scope): subject) plus optional bullet body.', tipAlign:'left' },
  ], 'Generates new text. If nothing is selected, we use the page title plus a short body excerpt as context.', 'left');
  const rewriteDD = makeDropdown('Rewrite', [
    { label:'Simplify (clear & plain)', value:'rewrite', payload:{ style:'simplify' }, tip:'Rewrites in plain language, shorter sentences, and removes jargon.', tipAlign:'left' },
    { label:'More formal/professional', value:'rewrite', payload:{ style:'formal' }, tip:'Polishes the tone to be formal and business-ready.', tipAlign:'left' },
    { label:'Friendlier / conversational', value:'rewrite', payload:{ style:'friendly' }, tip:'Lightens the tone for a warm, conversational style.', tipAlign:'left' },
    { label:'Shorter / concise', value:'rewrite', payload:{ style:'shorten' }, tip:'Compresses the text while keeping core information intact.', tipAlign:'left' },
    { label:'Longer / more details', value:'rewrite', payload:{ style:'expand' }, tip:'Expands with extra context, examples, or clarifications.', tipAlign:'left' },
  ], 'Rewrites the selection. If no selection exists, the page title and body snippet are used instead.');

  grid.appendChild(summarizeDD.wrap);
  grid.appendChild(translateDD.wrap);
  grid.appendChild(rewriteDD.wrap);
  grid.appendChild(writeDD.wrap);
  grid.appendChild(btnProofread);

  const progressWrap = h('div','progressWrap') as HTMLDivElement;
  const progressBar = h('div','progressBar') as HTMLDivElement;
  progressWrap.appendChild(progressBar);

  if (!state.initMessageShown) {
    setStatusMessage(INIT_STATUS_MSG, true);
    state.initMessageShown = true;
    console.log('[DEBUG] Message shown');
  }

  const cacheBust = (u: string) => u + (u.includes('?') ? '&' : '?') + 't=' + Date.now();
  let headerTimer: number | null = null;
  let panelTimer: number | null = null;
  function startLoading() {
    try { stopLoading() } catch (err) { debugError('stopLoading before startLoading failed', err) }
    const headerRaw = ['one.webp','two.webp'];
    const panelRaw  = ['three.webp','four.webp'];
    const headerUrls = headerRaw.map((p) => chrome.runtime.getURL(p));
    const panelUrls  = panelRaw.map((p) => chrome.runtime.getURL(p));
    const toDataUrl = async (extUrl: string) => {
      try {
        const resp = await fetch(extUrl);
        const blob = await resp.blob();
        return await new Promise<string>((resolve, reject) => {
          const fr = new FileReader(); fr.onload = () => resolve(String(fr.result)); fr.onerror = reject; fr.readAsDataURL(blob);
        });
      } catch (err) { debugError('Failed to convert loader image to data URL', err); return extUrl }
    }
    let hi = 0, pi = 0;
    const img = new Image();
    img.alt = '';
    img.referrerPolicy = 'no-referrer';
    const triedDataPanel: Record<number, boolean> = {};
    img.onerror = async () => {
      if (!triedDataPanel[pi]) {
        triedDataPanel[pi] = true;
        const dataUrl = await toDataUrl(panelUrls[pi]);
        img.src = dataUrl;
      }
    }
    img.src = cacheBust(panelUrls[0]);
    if (headerLoaderImg) headerLoaderImg.src = cacheBust(headerUrls[0]);
    const wrap = document.createElement('div');
    wrap.className = 'loadingAnim';
    wrap.appendChild(img);
    outEl.innerHTML = '';
    outEl.appendChild(wrap);
    const headerDurations = [400, 200, 200, 600, 400];
    let headerStep = 0;
    const advanceHeader = () => {
      hi = (hi + 1) % headerUrls.length;
      const nextHeader = headerUrls[hi];
      if (headerLoaderImg) headerLoaderImg.src = cacheBust(nextHeader);
      const nextDelay = headerDurations[headerStep % headerDurations.length];
      headerStep++;
      headerTimer = window.setTimeout(advanceHeader, nextDelay);
    }
    const advancePanel = () => {
      pi = (pi + 1) % panelUrls.length;
      triedDataPanel[pi] = false;
      const nextPanel = panelUrls[pi];
      img.src = cacheBust(nextPanel);
      panelTimer = window.setTimeout(advancePanel, 300);
    }
    headerTimer = window.setTimeout(advanceHeader, 200);
    panelTimer = window.setTimeout(advancePanel, 300);
  }
  function stopLoading() {
    if (headerTimer) { clearTimeout(headerTimer); headerTimer = null }
    if (panelTimer)  { clearTimeout(panelTimer);  panelTimer = null }
    if (headerLoaderImg) headerLoaderImg.src = chrome.runtime.getURL('two.webp');
  }
  const wrap = root.querySelector('.wrap') as HTMLDivElement;
  stopBtn.style.width = 'calc(100% - 24px)';
  stopBtn.style.margin = '8px 12px';
  wrap.insertBefore(stopBtn, outEl);
  wrap.insertBefore(progressWrap, outEl);

  let localAvailable = false;
  let userMode: 'auto'|'local'|'cloud' = 'auto';
  let userTouchedToggle = false;
  let cloudAvailable: boolean | null = null;

  let __initEverCompleted = false;
  let __initInProgress = false;

  const refreshCloudAvailability = async (): Promise<boolean> => {
    try {
      const {
        dactiProxyUrl,
        dactiProxyURL,
        proxyUrl,
        PROXY_URL,
        dactiUserApiKey
      } = await chrome.storage.local.get([
        'dactiProxyUrl',
        'dactiProxyURL',
        'proxyUrl',
        'PROXY_URL',
        'dactiUserApiKey'
      ]);
      const hasProxy = [dactiProxyUrl, dactiProxyURL, proxyUrl, PROXY_URL].some((v) => typeof v === 'string' && v.trim().length);
      const hasUserKey = typeof dactiUserApiKey === 'string' && dactiUserApiKey.trim().length > 0;
      cloudAvailable = hasProxy || hasUserKey;
    } catch (err) {
      cloudAvailable = false;
      debugError('Cloud availability check failed', err);
    }
    return !!cloudAvailable;
  };

  const showProgress = (p: number) => {
    if (!__initInProgress) return;
    progressWrap.style.display = 'block';
    progressBar.style.width = Math.max(0, Math.min(100, Math.round(p*100))) + '%';
    if (p >= 1) {
      __initInProgress = false;
      __initEverCompleted = true;
      setTimeout(() => { progressWrap.style.display = 'none'; progressBar.style.width = '0%' }, 400);
    }
  }

  async function detectLocalAvailability() {
    const Summ = (self as any)?.Summarizer || (typeof ai !== 'undefined' ? (ai as any).summarizer : undefined);
    const LM = (self as any)?.LanguageModel || (typeof ai !== 'undefined' ? (ai as any).prompt : undefined);
    const hasSummarizer = !!(Summ && (Summ as any).create);
    const hasPrompt = !!(LM && (LM as any).create);
    log('detectLocalAvailability:', { hasSummarizer, hasPrompt, Summ: !!Summ, LM: !!LM });
    const showStatus = (msg: string, force = false) => setStatusMessage(msg, force);
    let availability = 'unknown' as string;
    try {
      if (Summ && (Summ as any).availability) availability = await (Summ as any).availability();
      else if (LM && (LM as any).availability) availability = await (LM as any).availability();
    } catch (err) { debugError('Local availability probe failed', err) }
    log('local availability state =', availability);
    const needsDownload = availability === 'downloadable' || availability === 'downloading';
    const wasDownloading = needsDownload && !__initEverCompleted;

    if (availability === 'unavailable') {
      try { chrome.storage.local.set({ dactiLocalAvailable: false, dactiAvailability: availability }) } catch (err) { debugError('Failed to persist "unavailable" local status', err) }
      log('local unavailable → falling back to cloud');
      localAvailable = false;
      renderMode(false, true);
      setBadge(false, 'Local API unavailable');
      showStatus('🚫 Local mode unavailable: API not available on this device/browser (see hardware requirements).');
      return false;
    }

    if ((availability === 'downloadable' || availability === 'downloading') && !navigator.userActivation.isActive) {
      try { chrome.storage.local.set({ dactiLocalAvailable: false, dactiAvailability: availability }) } catch (err) { debugError('Failed to persist downloadable status (user activation)', err) }
      log('local requires user activation to download, waiting for user action');
      localAvailable = false;
      renderMode(false, true);
      setBadge(false, 'Local model needs user activation to download');
      showStatus('⬇️ Local model is ready for download. Click "Summarize", "Translate", or "Alt Images" to authorize the download, then watch the progress bar.');
      return false;
    }

    if (!hasSummarizer && !hasPrompt) {
      try { chrome.storage.local.set({ dactiLocalAvailable: false, dactiAvailability: 'no-apis' }) } catch (err) { debugError('Failed to persist no-API availability', err) }
      log('no Summarizer/LanguageModel APIs found → cloud only');
      localAvailable = false;
      renderMode(false, true);
      setBadge(false, 'Local API unavailable');
      showStatus('🚫 Local mode unavailable: `ai.summarizer`/`ai.prompt` APIs are missing. Switching to Cloud.\nTip: To test local capabilities, check your Chrome settings and flags (chrome://flags) to enable the Prompt API / on-device models, then reopen the panel.');
      return false;
    }
    if (needsDownload) {
      if (!__initEverCompleted) {
        __initInProgress = true;
        showStatus(DOWNLOAD_STATUS_MSG, true);
      }
    }
    try {
      if (hasSummarizer) {
        const sm: any = await (Summ as any).create({
          type: 'key-points',
          outputLanguage: 'en',
          monitor(m: any) {
            __initInProgress = true;
            if (wasDownloading) {
              setStatusMessage(DOWNLOAD_STATUS_MSG);
            }
            try {
              m.addEventListener?.('downloadprogress', (e: any) => {
                const frac = Math.min(1, Number(e?.loaded || 0) / Math.max(1, Number(e?.total || 1)));
                showProgress(frac);
              });
            } catch (err) { debugError('Summarizer monitor registration failed', err) }
          }
        });
        await sm.summarize?.('ok');
      } else if (hasPrompt) {
        const pr: any = await (LM as any).create({
          expectedInputs: [{ type: 'text' }],
          expectedOutputs: [{ type: 'text' }],
          monitor(m: any) {
            __initInProgress = true;
            if (wasDownloading) {
              setStatusMessage(DOWNLOAD_STATUS_MSG);
            }
            try {
              m.addEventListener?.('downloadprogress', (e: any) => {
                const frac = Math.min(1, Number(e?.loaded || 0) / Math.max(1, Number(e?.total || 1)));
                showProgress(frac);
              });
            } catch (err) { debugError('Prompt monitor registration failed', err) }
          }
        });
        await pr.prompt?.('ok');
      }
      log('local init OK; model available on-device');
      localAvailable = true;
      showProgress(1);
      if (wasDownloading) {
        try {
          const cloudReady = cloudAvailable === null ? await refreshCloudAvailability() : cloudAvailable;
          const readyMsg = cloudReady
            ? '✅ Local model download complete. Cloud fallback is configured; use the toggle above to switch modes anytime.'
            : '✅ Local model download complete. No cloud proxy detected, so DACTI stays on-device unless you add one.';
          setStatusMessage(readyMsg, true);
        } catch (err) {
          debugError('Failed to show local-ready message', err);
          setStatusMessage('✅ Local model download complete. Ready to run on-device.', true);
        }
      }
      setBadge(true);
      try { chrome.storage.local.set({ dactiLocalAvailable: true, dactiAvailability: 'available' }) } catch (err) { debugError('Failed to persist available local status', err) }
      return true;
    } catch (e) {
      try { chrome.storage.local.set({ dactiLocalAvailable: false, dactiAvailability: 'init-failed', dactiLocalError: String(e?.message || e) }) } catch (err2) { debugError('Failed to persist init-failed status', err2) }
      log('local init failed:', e);
      localAvailable = false;
      setBadge(false, 'Local init failed');
      renderMode(false, true);
      showStatus('⚠️ Local model initialization failed: ' + (e?.message || String(e)) + '\n→ Automatically switching to Cloud mode.');
      return false;
    }
  }

  function effectiveLocal(): boolean {
    if (userMode === 'local') return localAvailable;
    if (userMode === 'cloud') {
      if (cloudAvailable === false) return localAvailable;
      return false;
    }
    return localAvailable;
  }

  window.addEventListener('online', () => { setBadge(effectiveLocal()) });
  window.addEventListener('offline', () => { setBadge(effectiveLocal(), 'Offline') });

  chrome.storage.local.get(['dactiMode']).then(async ({ dactiMode }) => {
    await refreshCloudAvailability();
    const saved = (dactiMode === 'local' || dactiMode === 'cloud') ? dactiMode : 'auto';
    userMode = saved === 'cloud' && cloudAvailable === false ? 'auto' : saved;
  });

  Promise.all([detectLocalAvailability(), refreshCloudAvailability()]).then(() => {
    if (!userTouchedToggle) {
      if (localAvailable) userMode = 'local';
      else if (cloudAvailable) userMode = 'cloud';
      else userMode = 'local';
      chrome.storage.local.set({ dactiMode: userMode, dactiLocalOnly: effectiveLocal() });
    } else {
      chrome.storage.local.set({ dactiLocalOnly: effectiveLocal() });
    }
    const currentLocal = effectiveLocal();
    const locked = !localAvailable;
    renderMode(currentLocal, locked && !currentLocal);
    setBadge(currentLocal);
    state.modeChosen = true;
    const statusText = (outEl.textContent || '').trim();
    if (statusText === INIT_STATUS_MSG || statusText === DOWNLOAD_STATUS_MSG) {
      outEl.textContent = '';
    }
  }).catch((err) => { debugError('Initial availability check failed', err); });

  modeInput.addEventListener('change', async () => {
    userTouchedToggle = true;
    if (!localAvailable && modeInput.checked) {
      modeInput.checked = false;
      return;
    }
    if (!modeInput.checked) {
      const cloudOk = await refreshCloudAvailability();
      if (!cloudOk) {
        modeInput.checked = true;
        userMode = 'local';
        const localOnly = localAvailable;
        chrome.storage.local.set({ dactiMode: userMode, dactiLocalOnly: localOnly });
        setStatusMessage('Cloud mode unavailable: add a proxy URL or API key in settings to enable remote fallback.', false);
        const locked = !localAvailable;
        renderMode(true, locked);
        setBadge(true, localAvailable ? '' : 'Local model unavailable and no cloud fallback configured.');
        return;
      }
    }
    userMode = modeInput.checked ? 'local' : 'cloud';
    chrome.storage.local.set({ dactiMode: userMode, dactiLocalOnly: effectiveLocal() });
    const currentLocal = effectiveLocal();
    renderMode(currentLocal, !localAvailable && !currentLocal);
    setBadge(currentLocal);
  });

  chrome.storage.local.get('dactiTheme').then(({ dactiTheme }) => {
    const mode = (dactiTheme === 'light' || dactiTheme === 'dark') ? dactiTheme : 'auto';
    setThemeMode(mode, false);
  });
  function setActive(kind: 'summarize' | 'translate' | 'write' | 'rewrite' | 'proofread') {
    summarizeDD.btn.classList.toggle('active', kind === 'summarize');
    translateDD.btn.classList.toggle('active', kind === 'translate');
    rewriteDD.btn.classList.toggle('active', kind === 'rewrite');
    writeDD.btn.classList.toggle('active', kind === 'write');
    btnProofread.classList.toggle('active', kind === 'proofread');
    state.activeKind = kind;
  }
  state.panelAPI = { startLoading, stopLoading, setActive };
  if (state.activeKind) {
    setActive(state.activeKind);
  }
  const run = async (action: 'summarize' | 'translate' | 'write' | 'rewrite' | 'proofread', params?: any) => {
    setActive(action);
    outEl.blur();
    startLoading();
    await Promise.all([detectLocalAvailability(), refreshCloudAvailability()]);
    if (!userTouchedToggle) {
      if (localAvailable) userMode = 'local';
      else if (cloudAvailable) userMode = 'cloud';
      else userMode = 'local';
      chrome.storage.local.set({ dactiMode: userMode, dactiLocalOnly: effectiveLocal() });
    } else {
      chrome.storage.local.set({ dactiLocalOnly: effectiveLocal() });
    }
    const localOnly = effectiveLocal();
    renderMode(localOnly, !localAvailable && !localOnly);
    setBadge(localOnly);
    log('RUN', action, { localOnly, userMode, localAvailable, cloudAvailable, online: navigator.onLine });
    stopBtn.style.display = 'inline-flex'; (stopBtn as HTMLButtonElement).disabled = false;
    modeInput.disabled = true;
    switchEl.classList.add('disabled');
    disable(true);
    try {
      await chrome.runtime.sendMessage({ type: 'DACTI_ACTION', action, localOnly, params });
    } finally {
      // stopLoading(); // Let the background script control this
      ;(stopBtn as HTMLButtonElement).disabled = true;
      stopBtn.style.display = 'none';
      modeInput.disabled = !localAvailable && userMode !== 'cloud';
      switchEl.classList.toggle('disabled', modeInput.disabled);
      disable(false);
    }
  }

  function disable(v: boolean) {
    (summarizeDD.btn.disabled = v), (translateDD.btn.disabled = v), (rewriteDD.btn.disabled = v), (writeDD.btn.disabled = v);
    btnProofread.disabled = v;
  }

  btnProofread.addEventListener('click', () => {
    const text = outEl.innerText;
    if (!text.trim()) return;
    run('proofread', { text });
  });

  copyBtn.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(outEl.textContent || '') } catch (err) { debugError('Copy to clipboard failed', err) }
  });

  let dragging = false, ox = 0, oy = 0, raf = 0;
  header.addEventListener('mousedown', (ev) => {
    dragging = true;
    const r = host.getBoundingClientRect();
    ox = ev.clientX - r.left;
    oy = ev.clientY - r.top;
    ev.preventDefault();
  });
  const onMove = (ev: MouseEvent) => {
    if (!dragging) return;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const nx = Math.max(0, Math.min(window.innerWidth - host.offsetWidth, ev.clientX - ox));
      const ny = Math.max(0, Math.min(window.innerHeight - host.offsetHeight, ev.clientY - oy));
      host.style.left = nx + 'px';
      host.style.top = ny + 'px';
      host.style.right = 'auto';
    });
  }
  const onUp = () => { dragging = false };
  cleanupDrag = onDrag(onMove, onUp);
  document.addEventListener('keydown', (ev) => {
    if (!state.refs) return;
    if (!ev.altKey || ev.repeat) return;
    const map: Record<string,string> = { '1':'tldr','2':'bullets','3':'eli5','4':'sections','5':'facts' };
    const m = map[ev.key];
    if (!m) return;
    ev.preventDefault();
    try { chrome.storage.local.set({ dactiSummarizeMode: m }) } catch (err) { debugError('Failed to persist summarize mode (hotkey)', err) }
    setActive('summarize');
    run('summarize', { summarizeMode: m });
  });
  state.buildingPanel = false;
  state.panelDismissed = false;
  state.refs = { root, host, header, titleEl, outEl, localOnlyCheckbox: undefined as any, btnSummarize: summarizeDD.btn, btnTranslate: translateDD.btn, btnRewrite: rewriteDD.btn, btnWrite: writeDD.btn, btnProofread, closeBtn };
  document.documentElement.appendChild(host);
  return state.refs;
}
