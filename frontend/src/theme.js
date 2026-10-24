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

// CSS variables for the design system (put them on the screen's root element)
export const themeVars = (T) => ({
  '--bg': T.bg,
  '--panel': T.light ? T.panel : (T.panel || T.bg),
  '--surface': T.card,
  '--raised': T.raised || 'rgba(255,255,255,0.09)',
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
