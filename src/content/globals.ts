
export type PanelRefs = {
  root: ShadowRoot;
  host: HTMLDivElement;
  header: HTMLDivElement;
  titleEl: HTMLDivElement;
  outEl: HTMLDivElement;
  localOnlyCheckbox: HTMLInputElement;
  btnSummarize: HTMLButtonElement;
  btnTranslate: HTMLButtonElement;
  btnRewrite: HTMLButtonElement;
  btnWrite: HTMLButtonElement;
  btnProofread: HTMLButtonElement;
  closeBtn: HTMLButtonElement;
} | null;

export const state = {
  refs: null as PanelRefs,
  buildingPanel: false,
  panelAPI: null as {
    startLoading: () => void;
    stopLoading: () => void;
    setActive: (kind: 'summarize' | 'translate' | 'write' | 'rewrite' | 'proofread') => void;
  } | null,
  panelDismissed: false,
  initMessageShown: false,
  modeChosen: false,
  activeKind: null as ('summarize' | 'translate' | 'write' | 'rewrite' | 'proofread') | null,
};

export const DBG = true;
export const log = (...a: any[]) => {
  try {
    console.log('[DACTI]', ...a);
  } catch (err) {
    if (!DBG) return;
    try { console.warn('[DACTI][DBG] console.log failed', err); } catch {}
  }
};
