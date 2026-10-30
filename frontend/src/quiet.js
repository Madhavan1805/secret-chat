// Quiet hours: between two times this phone makes no sound and shows no pop-ups.
const KEY = 'quiet_hours';                       // JSON { on, from: 'HH:MM', to: 'HH:MM' }
export const getQuiet = () => {
  try { return { on: false, from: '22:00', to: '07:00', ...(JSON.parse(localStorage.getItem(KEY) || '{}')) }; } catch (e) { return { on: false, from: '22:00', to: '07:00' }; }
};
export const setQuiet = (q) => { try { localStorage.setItem(KEY, JSON.stringify(q)); } catch (e) { /* ignore */ } };
const mins = (t) => { const [h, m] = String(t).split(':').map(Number); return (h || 0) * 60 + (m || 0); };
export const inQuietHours = (now = new Date()) => {
  const q = getQuiet();
  if (!q.on) return false;
  const n = now.getHours() * 60 + now.getMinutes(), a = mins(q.from), b = mins(q.to);
  if (a === b) return false;
  return a < b ? (n >= a && n < b) : (n >= a || n < b);      // 22:00 -> 07:00 crosses midnight
};
