import api from './api';

export const API_ORIGIN = import.meta.env.VITE_API_ORIGIN || 'http://127.0.0.1:8000';
export const WS_ORIGIN = API_ORIGIN.replace(/^http/, 'ws');


// Where your Login page saves the token. If yours is different, add the key here.
const TOKEN_KEYS = ['token', 'authToken', 'access_token', 'access'];

export const getToken = () => {
  try {
    for (const k of TOKEN_KEYS) {
      const v = localStorage.getItem(k);
      if (v) return v.replace(/^"|"$/g, '');
    }
    // fallback: DRF tokens are 40 hex characters - find it whatever key it was saved under
    for (let i = 0; i < localStorage.length; i += 1) {
      const v = localStorage.getItem(localStorage.key(i));
      if (v && /^[0-9a-f]{40}$/i.test(v)) return v;
    }
  } catch (e) { /* storage blocked */ }
  return null;
};

export const asList = (data) => (Array.isArray(data) ? data : (data && Array.isArray(data.results) ? data.results : []));

export const errText = (e, fallback = 'Something went wrong') => {
  const d = e && e.response && e.response.data;
  if (!d) return fallback;
  if (typeof d === 'string') return d.length < 200 ? d : fallback;
  const v = d.error || d.detail || d.non_field_errors;
  if (Array.isArray(v)) return v.join(' ');
  if (typeof v === 'string') return v;
  const first = Object.values(d)[0];
  return Array.isArray(first) ? first.join(' ') : (typeof first === 'string' ? first : fallback);
};

export const getPicUrl = (url) => {
  if (!url || typeof url !== 'string') return null;
  if (/^(https?:|blob:|data:)/.test(url)) return url;
  let clean = url.startsWith('/') ? url : `/${url}`;
  if (!clean.startsWith('/media/')) clean = `/media${clean}`;
  return `${API_ORIGIN}${clean}`;
};

// ---- the logged-in user's own profile (cached) ----
let meCache = null;
export const clearMe = () => { meCache = null; };
export async function getMe(force = false) {
  const name = localStorage.getItem('username');
  if (!force && meCache && meCache.username === name) return meCache;
  try {
    const res = await api.get('users/', { params: { search: name } });
    meCache = asList(res.data).find((u) => u.username === name) || null;
  } catch (e) { meCache = null; }
  return meCache;
}

export const formatSize = (bytes) => {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

export const formatTime = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

export const formatDay = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const today = new Date();
  const yest = new Date();
  yest.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yest.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

// chat list time: hh:mm today, "Yesterday", else dd/mm/yy
export const formatListTime = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const label = formatDay(iso);
  if (label === 'Today') return formatTime(iso);
  if (label === 'Yesterday') return label;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' });
};

export const humanDuration = (s) => {
  if (!s) return 'Off';
  if (s % 86400 === 0) return `${s / 86400}d`;
  if (s % 3600 === 0) return `${s / 3600}h`;
  if (s % 60 === 0) return `${s / 60}m`;
  return `${s}s`;
};

export const formatCallDuration = (s) => {
  if (!s) return '';
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m ? `${m}m ${sec}s` : `${sec}s`;
};

export const lastSeenText = (iso) => {
  if (!iso) return 'Offline';
  const label = formatDay(iso);
  if (label === 'Today') return `last seen today at ${formatTime(iso)}`;
  if (label === 'Yesterday') return `last seen yesterday at ${formatTime(iso)}`;
  return `last seen ${label}`;
};

// aliases used by Home / ChatView / CallManager
export const errMsg = errText;
export const formatDuration = formatCallDuration;

// start a call from any screen:
//   startCall({ friendId, name, callType: 'audio' | 'video' })
//   startCall({ group: true, chatId, name, callType })
export const startCall = (detail) => window.dispatchEvent(new CustomEvent('chat:start-call', { detail }));

// Phones name videos like "VID_20261024_134512_very_long_name_(1).mp4". The server stores at most 255 characters,
// so every upload is renamed to a short safe name (keeps the extension and the file type).
export const shortFile = (file) => {
  if (!file || !file.name) return file;
  const dot = file.name.lastIndexOf('.');
  const ext = dot > 0 ? file.name.slice(dot).toLowerCase().replace(/[^a-z0-9.]/g, '').slice(0, 8) : '';
  if (file.name.length <= 60 && /^[\w .()-]+$/.test(file.name)) return file;
  try { return new File([file], `file_${Date.now().toString(36)}${ext}`, { type: file.type, lastModified: file.lastModified }); } catch (e) { return file; }
};
