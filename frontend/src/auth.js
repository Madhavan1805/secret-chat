import api from './api';
import { getToken, clearMe } from './config';
import { rememberAccount } from './accounts';

// If your api.js reads the login token from a different localStorage key, change this one line.
export const TOKEN_KEY = 'token';

export function saveSession({ token, username, id }) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem('username', username);
    if (id != null) localStorage.setItem('user_id', String(id));
  } catch (e) { /* storage blocked */ }
  rememberAccount({ token, username, id });      // so this phone can switch between accounts
  clearMe();
}

export function dropSession() {
  try { localStorage.removeItem(TOKEN_KEY); } catch (e) { /* ignore */ }
  clearMe();
}

export const hasToken = () => !!getToken();

// Does the server still accept the saved token?  true | false | null (can't tell, e.g. offline)
// Uses a plain fetch on purpose: an axios interceptor that redirects on 401 could otherwise
// reload this page in a loop.
export async function sessionIsValid() {
  const token = getToken();
  if (!token) return false;
  try {
    const base = ((api.defaults && api.defaults.baseURL) || '').replace(/\/?$/, '/');
    const res = await fetch(`${base}users/me/`, { headers: { Authorization: `Token ${token}` } });
    if (res.status === 401 || res.status === 403) return false;
    return res.ok ? true : null;
  } catch (e) {
    return null;
  }
}

// ------------------------------------------------------------ validation
const USERNAME_RE = /^[A-Za-z0-9_.]{3,30}$/;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;
const PHONE_RE = /^\+?\d{10,15}$/;

export const normalizePhone = (v) => (v || '').replace(/[\s\-()]/g, '');

export function validateUsername(v) {
  const s = (v || '').trim();
  if (!s) return 'Enter a user ID.';
  if (s.length < 3) return 'Use at least 3 characters.';
  if (s.length > 30) return 'Use 30 characters or fewer.';
  if (!USERNAME_RE.test(s)) return 'Use only letters, numbers, dots and underscores.';
  if (PHONE_RE.test(s)) return "A user ID can't look like a mobile number. Add a letter.";
  return '';
}

export function validateEmail(v) {
  const s = (v || '').trim();
  if (!s) return 'Enter your email address.';
  if (!EMAIL_RE.test(s)) return 'Enter a valid email address.';
  return '';
}

export function validatePhone(v) {
  const s = normalizePhone(v);
  if (!s) return 'Enter your mobile number.';
  if (!PHONE_RE.test(s)) return 'Enter 10 to 15 digits. You can start with +.';
  return '';
}

export function validatePassword(v) {
  if (!v) return 'Enter a password.';
  if (v.length < 8) return 'Use at least 8 characters.';
  if (/^\d+$/.test(v)) return "Add some letters. A password can't be only numbers.";
  return '';
}

// score 0-4 for the strength bar
export function passwordStrength(pw) {
  if (!pw) return { score: 0, label: '' };
  if (pw.length < 8) return { score: 1, label: 'Too short' };
  let score = 1;
  if (pw.length >= 12) score += 1;
  if (/[A-Za-z]/.test(pw) && /\d/.test(pw)) score += 1;
  if (/[^A-Za-z0-9]/.test(pw) || (/[a-z]/.test(pw) && /[A-Z]/.test(pw))) score += 1;
  score = Math.min(score, 4);
  return { score, label: ['', 'Weak', 'Okay', 'Good', 'Strong'][score] };
}

// ------------------------------------------------------- server errors
const FIELD_KEYS = ['username', 'email', 'phone_number', 'password', 'confirm_password',
  'new_password', 'otp', 'contact', 'identifier'];

const asText = (v) => (Array.isArray(v) ? v.join(' ') : (typeof v === 'string' ? v : ''));

// -> { fields: { username: '...' }, general: '...' }
export function apiErrors(e, fallback = 'Something went wrong. Try again.') {
  const res = e && e.response;
  if (!res) return { fields: {}, general: "Can't reach the server. Check your connection and try again." };
  if (res.status === 429) return { fields: {}, general: 'Too many attempts. Wait a few minutes and try again.' };
  const d = res.data;
  const fields = {};
  let general = '';
  if (d && typeof d === 'object') {
    Object.entries(d).forEach(([k, v]) => {
      const t = asText(v);
      if (!t) return;
      if (FIELD_KEYS.includes(k)) fields[k] = t;
      else if (!general) general = t;
    });
  } else if (typeof d === 'string' && d.length < 200) {
    general = d;
  }
  if (!general && !Object.keys(fields).length) general = fallback;
  return { fields, general };
}
