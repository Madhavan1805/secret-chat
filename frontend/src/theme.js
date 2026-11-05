// ---------------------------------------------------------------------------------------------
//  Colour themes.  Default look = "Wax & Ink": deep ink-violet surfaces, one wax-seal red accent.
//  Every theme provides the same tokens; screens read them through CSS variables (see themeVars).
// ---------------------------------------------------------------------------------------------
const DARK_TEXT = { text: '#ffffff', sub: 'rgba(255,255,255,0.6)', line: 'rgba(255,255,255,0.12)', input: 'rgba(255,255,255,0.08)' };
const INK_TEXT = { text: '#F6F0FB', sub: 'rgba(246,240,251,0.62)', line: 'rgba(246,240,251,0.10)', input: 'rgba(246,240,251,0.07)' };

export const SEAL = 'radial-gradient(circle at 32% 26%, #FF8795 0%, #E03A50 52%, #8E1230 100%)';

export const CHAT_THEMES = {
  default:  { label: '🕯️ Wax & Ink', bg: '#0F0B14', panel: '#130E19', card: '#1B1424', raised: '#261C33', accent: '#FF6477', mine: 'linear-gradient(150deg,#E8405A,#A3153A)', mineText: '#ffffff', other: '#241B30', seal: SEAL, ...INK_TEXT },
  classic:  { label: '🎨 Classic maroon', bg: '#3b0e1b', panel: 'rgba(0,0,0,0.25)', card: 'rgba(255,255,255,0.06)', accent: '#fcd34d', mine: 'linear-gradient(135deg,#d4af37,#fcd34d)', mineText: '#3b0e1b', other: 'rgba(255,255,255,0.12)', ...DARK_TEXT },
  ocean:    { label: '🌊 Ocean',       bg: '#0b2a3d', panel: 'rgba(0,0,0,0.25)', card: 'rgba(255,255,255,0.06)', accent: '#38bdf8', mine: 'linear-gradient(135deg,#0ea5e9,#38bdf8)', mineText: '#04202e', other: 'rgba(255,255,255,0.12)', ...DARK_TEXT },
  forest:   { label: '🌲 Forest',      bg: '#0f2e1d', panel: 'rgba(0,0,0,0.25)', card: 'rgba(255,255,255,0.06)', accent: '#4ade80', mine: 'linear-gradient(135deg,#22c55e,#4ade80)', mineText: '#052e16', other: 'rgba(255,255,255,0.12)', ...DARK_TEXT },
  rose:     { label: '🌹 Rose',        bg: '#3d0f2a', panel: 'rgba(0,0,0,0.25)', card: 'rgba(255,255,255,0.06)', accent: '#f472b6', mine: 'linear-gradient(135deg,#ec4899,#f472b6)', mineText: '#3d0f2a', other: 'rgba(255,255,255,0.12)', ...DARK_TEXT },
  midnight: { label: '🌙 Midnight',    bg: '#0f1115', panel: 'rgba(255,255,255,0.05)', card: 'rgba(255,255,255,0.06)', accent: '#a78bfa', mine: 'linear-gradient(135deg,#7c3aed,#a78bfa)', mineText: '#ffffff', other: 'rgba(255,255,255,0.12)', ...DARK_TEXT },
  light:    { label: '☀️ Paper',       bg: '#F5F1F7', panel: '#ffffff', card: '#ffffff', raised: '#EDE6F1', accent: '#C21F3E', mine: 'linear-gradient(150deg,#D93352,#A3153A)', mineText: '#ffffff', other: '#EDE6F1', seal: SEAL, text: '#1B1322', sub: '#6B6074', line: 'rgba(27,19,34,0.12)', input: '#ffffff', light: true },
};

// whole-app look (Settings in Profile tab)
export const APP_MODES = [
  { key: 'default', label: '🕯️ Wax & Ink' },
  { key: 'midnight', label: '🌙 Midnight' },
  { key: 'light', label: '☀️ Paper' },
  { key: 'classic', label: '🎨 Classic' },
];

export const CHAT_THEME_KEYS = Object.keys(CHAT_THEMES);
export const resolveTheme = (name) => CHAT_THEMES[name] || CHAT_THEMES.default;
export const getAppTheme = () => {
  try { return localStorage.getItem('app_theme') || 'default'; } catch (e) { return 'default'; }
};
export const setAppTheme = (k) => {
  try { localStorage.setItem('app_theme', k); } catch (e) { /* ignore */ }
};


// ---- solid colours: panels, menus and sheets must never be see-through (the chat shows through otherwise)
const parseColor = (c) => {
  if (!c) return null;
  let m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c.trim());
  if (m) { let h = m[1]; if (h.length === 3) h = h.split('').map((x) => x + x).join(''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 1]; }
  m = /^rgba?\(([^)]+)\)$/i.exec(c.trim());
  if (m) { const p = m[1].split(',').map((x) => parseFloat(x)); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; }
  return null;
};
export const solid = (color, over) => {
  const f = parseColor(color); const b = parseColor(over);
  if (!f || !b || f[3] >= 1) return color;
  const mix = (i) => Math.round(f[i] * f[3] + b[i] * (1 - f[3]));
  return `rgb(${mix(0)},${mix(1)},${mix(2)})`;
};
// 0 (black) .. 1 (white)
export const luminance = (color) => {
  const c = parseColor(color); if (!c) return 0;
  const ch = (v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * ch(c[0]) + 0.7152 * ch(c[1]) + 0.0722 * ch(c[2]);
};

// ---- text size and font style (Appearance)
export const TEXT_SIZES = [['0.88', 'Small'], ['1', 'Normal'], ['1.15', 'Large'], ['1.32', 'Huge']];
export const FONT_STYLES = [
  ['default', 'Default', "'Instrument Sans', 'Noto Sans Tamil', system-ui, sans-serif"],
  ['rounded', 'Rounded', "'Fredoka', 'Noto Sans Tamil', system-ui, sans-serif"],
  ['serif', 'Classic', "'Playfair Display', 'Noto Sans Tamil', Georgia, serif"],
  ['clean', 'Clean', "system-ui, -apple-system, 'Segoe UI', Roboto, 'Noto Sans Tamil', sans-serif"],
];
export const getTextScale = () => { try { return localStorage.getItem('text_scale') || '1'; } catch (e) { return '1'; } };
export const getFontStyle = () => { try { return localStorage.getItem('font_style') || 'default'; } catch (e) { return 'default'; } };
export const applyTypography = () => {
  try {
    const root = document.documentElement;
    root.style.setProperty('--ts', getTextScale());
    const f = FONT_STYLES.find((x) => x[0] === getFontStyle()) || FONT_STYLES[0];
    root.style.setProperty('--font-body', f[2]);
  } catch (e) { /* ignore */ }
};
export const setTextScale = (v) => { try { localStorage.setItem('text_scale', v); } catch (e) { /* ignore */ } applyTypography(); };
export const setFontStyle = (v) => { try { localStorage.setItem('font_style', v); } catch (e) { /* ignore */ } applyTypography(); };

// CSS variables for the design system (put them on the screen's root element)
export const themeVars = (T) => ({
  '--bg': T.bg,
  '--panel': solid(T.light ? T.panel : (T.panel || T.bg), T.bg),
  '--surface': T.card,
  '--raised': solid(T.raised || 'rgba(255,255,255,0.12)', solid(T.panel || T.bg, T.bg)),
  '--accent': T.accent,
  '--mine': T.mine,
  '--mine-text': T.mineText,
  '--other': T.other,
  '--text': T.text,
  '--sub': T.sub,
  '--line': T.line,
  '--input': T.input,
  '--seal': T.seal || SEAL,
  '--online': '#3DDC97',
});

// makes the bootstrap "text-white" based markup readable in the light theme
export const THEME_CSS = `
.t-light .text-white, .t-light .text-light { color:#1B1322 !important; }
.t-light .text-white-50, .t-light .text-muted { color:#6B6074 !important; }
.t-light .bg-dark { background:#EDE6F1 !important; }
.t-light .form-control { color:#1B1322 !important; background:#fff !important; border-color:rgba(27,19,34,0.18) !important; }
.t-light input::placeholder, .t-light textarea::placeholder { color:#9a90a3 !important; }
.t-light .btn-outline-light { color:#3b3144 !important; border-color:#a79fb0 !important; }
.t-light .border-secondary { border-color:rgba(27,19,34,0.14) !important; }
`;

// Colours the page behind the app and the browser / status-bar colour, so nothing white shows when the keyboard resizes the screen.
export const paintPage = (T) => {
  try {
    const root = document.documentElement;
    root.style.setProperty('--page-bg', T.bg);
    root.style.backgroundColor = T.bg;
    document.body.style.backgroundColor = T.bg;
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) { meta = document.createElement('meta'); meta.name = 'theme-color'; document.head.appendChild(meta); }
    meta.content = T.bg;
  } catch (e) { /* ignore */ }
};
