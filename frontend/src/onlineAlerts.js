// "X is online" pop-ups: on/off switch (kept on this phone) + a cool-down so a flaky connection cannot spam you.
const KEY = 'sc_online_alerts';
export const onlineAlertsEnabled = () => { try { return localStorage.getItem(KEY) !== '0'; } catch (e) { return true; } };
export const setOnlineAlertsEnabled = (on) => { try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) { /* ignore */ } };

const last = new Map();
const COOLDOWN_MS = 3 * 60 * 1000;
export const shouldAnnounce = (userId) => {
  const now = Date.now();
  if (now - (last.get(userId) || 0) < COOLDOWN_MS) return false;
  last.set(userId, now);
  return true;
};
