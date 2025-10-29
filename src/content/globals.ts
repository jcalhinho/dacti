
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

export let refs: PanelRefs = null;
export let buildingPanel = false;
export const DBG = true;
export const log = (...a: any[]) => {
  try {
    console.log('[DACTI]', ...a);
  } catch {}
};
export let panelAPI: { startLoading: () => void; stopLoading: () => void } | null = null;
export let initMessageShown = false;
export let modeChosen = false;
