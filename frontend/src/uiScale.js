// "Display size": makes the whole app bigger or smaller on THIS phone (kept on the phone, applied before the first screen).
// Uses the browser's CSS zoom on <html>. Screens that are sized from the real window height (--app-height) divide by --ui-zoom.
const KEY = 'sc_ui_scale';
export const UI_SCALES = [
  { v: 0.8, label: 'Smallest' },
  { v: 0.9, label: 'Small' },
  { v: 1, label: 'Default' },
  { v: 1.1, label: 'Large' },
  { v: 1.2, label: 'Largest' },
];

export const getUiScale = () => {
  try { const n = Number(localStorage.getItem(KEY)); return n >= 0.7 && n <= 1.3 ? n : 1; } catch (e) { return 1; }
};
export const uiZoom = () => { const z = Number(getComputedStyle(document.documentElement).getPropertyValue('--ui-zoom')); return z > 0 ? z : 1; };

export const applyUiScale = (v = getUiScale()) => {
  const root = document.documentElement;
  root.style.zoom = v === 1 ? '' : String(v);
  root.style.setProperty('--ui-zoom', String(v));
  window.dispatchEvent(new Event('sc:ui-scale'));       // viewport.js re-measures the screen height
};

export const setUiScale = (v) => {
  try { localStorage.setItem(KEY, String(v)); } catch (e) { /* ignore */ }
  applyUiScale(v);
};
