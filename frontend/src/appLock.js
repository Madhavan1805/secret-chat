// App lock: a 4-digit PIN kept (salted + hashed) on this device only.
// "Privacy shield" hides the screen contents while the app is in the background / app switcher.
const K_PIN = 'lock_pin';
const K_SHIELD = 'lock_shield';
const K_DELAY = 'lock_delay';
export const LOCK_EVENT = 'applock-change';

const read = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const write = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* ignore */ } };
const notify = () => window.dispatchEvent(new Event(LOCK_EVENT));

const hex = (buf) => Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
const digest = async (text) => {
  try {
    if (window.crypto && window.crypto.subtle) return hex(await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  } catch (e) { /* fall through */ }
  let h = 5381; for (let i = 0; i < text.length; i += 1) h = ((h << 5) + h + text.charCodeAt(i)) | 0;   // very old browsers
  return `x${h}`;
};

export const lockEnabled = () => !!read(K_PIN);
export const shieldEnabled = () => read(K_SHIELD) !== '0';
export const setShieldEnabled = (on) => { write(K_SHIELD, on ? '1' : '0'); notify(); };
export const lockDelaySeconds = () => { const n = parseInt(read(K_DELAY) || '30', 10); return Number.isFinite(n) ? n : 30; };
export const setLockDelaySeconds = (s) => { write(K_DELAY, String(s)); notify(); };

export async function setPin(pin) {
  const salt = Math.random().toString(36).slice(2, 10);
  write(K_PIN, `${salt}:${await digest(`${salt}:${pin}`)}`);
  notify();
}
export async function checkPin(pin) {
  const saved = read(K_PIN);
  if (!saved) return true;
  const [salt, h] = saved.split(':');
  return (await digest(`${salt}:${pin}`)) === h;
}
export const removePin = () => { write(K_PIN, null); notify(); };
