const DARK_TEXT = { text: '#ffffff', sub: 'rgba(255,255,255,0.6)', line: 'rgba(255,255,255,0.12)', input: 'rgba(255,255,255,0.08)' };

export const CHAT_THEMES = {
  default:  { label: '🎨 Maroon Gold', bg: '#3b0e1b', panel: 'rgba(0,0,0,0.25)', card: 'rgba(255,255,255,0.06)', accent: '#fcd34d', mine: 'linear-gradient(135deg,#d4af37,#fcd34d)', mineText: '#3b0e1b', other: 'rgba(255,255,255,0.12)', ...DARK_TEXT },
  ocean:    { label: '🌊 Ocean',       bg: '#0b2a3d', panel: 'rgba(0,0,0,0.25)', card: 'rgba(255,255,255,0.06)', accent: '#38bdf8', mine: 'linear-gradient(135deg,#0ea5e9,#38bdf8)', mineText: '#04202e', other: 'rgba(255,255,255,0.12)', ...DARK_TEXT },
  forest:   { label: '🌲 Forest',      bg: '#0f2e1d', panel: 'rgba(0,0,0,0.25)', card: 'rgba(255,255,255,0.06)', accent: '#4ade80', mine: 'linear-gradient(135deg,#22c55e,#4ade80)', mineText: '#052e16', other: 'rgba(255,255,255,0.12)', ...DARK_TEXT },
  rose:     { label: '🌹 Rose',        bg: '#3d0f2a', panel: 'rgba(0,0,0,0.25)', card: 'rgba(255,255,255,0.06)', accent: '#f472b6', mine: 'linear-gradient(135deg,#ec4899,#f472b6)', mineText: '#3d0f2a', other: 'rgba(255,255,255,0.12)', ...DARK_TEXT },
  midnight: { label: '🌙 Dark',        bg: '#0f1115', panel: 'rgba(255,255,255,0.05)', card: 'rgba(255,255,255,0.06)', accent: '#a78bfa', mine: 'linear-gradient(135deg,#7c3aed,#a78bfa)', mineText: '#ffffff', other: 'rgba(255,255,255,0.12)', ...DARK_TEXT },
  light:    { label: '☀️ Light',       bg: '#f3f4f6', panel: '#ffffff', card: '#ffffff', accent: '#b45309', mine: 'linear-gradient(135deg,#f59e0b,#fbbf24)', mineText: '#1f2937', other: '#e5e7eb', text: '#1f2937', sub: '#6b7280', line: '#d1d5db', input: '#ffffff', light: true },
};

// whole-app look (Settings in Profile tab)
export const APP_MODES = [
  { key: 'default', label: '🎨 Maroon Gold' },
  { key: 'midnight', label: '🌙 Dark' },
  { key: 'light', label: '☀️ Light' },
];

export const CHAT_THEME_KEYS = Object.keys(CHAT_THEMES);
export const resolveTheme = (name) => CHAT_THEMES[name] || CHAT_THEMES.default;
export const getAppTheme = () => {
  try { return localStorage.getItem('app_theme') || 'default'; } catch (e) { return 'default'; }
};
export const setAppTheme = (k) => {
  try { localStorage.setItem('app_theme', k); } catch (e) { /* ignore */ }
};

// makes the bootstrap "text-white" based markup readable in the light theme
export const THEME_CSS = `
.t-light .text-white, .t-light .text-light { color:#1f2937 !important; }
.t-light .text-white-50, .t-light .text-muted { color:#6b7280 !important; }
.t-light .bg-dark { background:#e5e7eb !important; }
.t-light .form-control { color:#111827 !important; background:#fff !important; border-color:#d1d5db !important; }
.t-light input::placeholder, .t-light textarea::placeholder { color:#9ca3af !important; }
.t-light .btn-outline-light { color:#374151 !important; border-color:#9ca3af !important; }
.t-light .border-secondary { border-color:#d1d5db !important; }
.t-light [style*="color: rgb(255, 255, 255)"] { color:#1f2937 !important; }
`;
