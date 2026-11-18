// Per-chat message tones + per-friend call ringtones (the server stores them, this keeps a copy for instant use).
import api from './api';
import { playSound } from './sounds';

export const TONE_LIST = [['', 'Default'], ['pop', 'Pop'], ['chime', 'Chime'], ['bell', 'Bell'], ['drop', 'Drop'], ['bubble', 'Bubble'], ['silent', 'Silent']];
const KEY = 'chat_tones';
let cache = null;

const read = () => {
  if (cache) return cache;
  try { cache = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { cache = []; }
  return cache;
};
const write = (rows) => { cache = rows; try { localStorage.setItem(KEY, JSON.stringify(rows)); } catch (e) { /* ignore */ } };

export const loadTones = () => api.get('tones/').then((r) => write(r.data.tones || [])).catch(() => {});

export const setLocalTone = (chatId, friendId, patch) => {
  const rows = read().filter((x) => x.chat_id !== chatId);
  const old = read().find((x) => x.chat_id === chatId) || { chat_id: chatId, friend_id: friendId || null, tone: '', call_tone: '' };
  write([...rows, { ...old, ...patch }]);
};
export const getTone = (chatId) => (read().find((x) => Number(x.chat_id) === Number(chatId)) || {}).tone || '';
export const getCallTone = (friendId) => (read().find((x) => x.friend_id && Number(x.friend_id) === Number(friendId)) || {}).call_tone || '';

// the sound for a new message in this chat
export const playMessageTone = (chatId) => {
  const tone = getTone(chatId);
  if (tone === 'silent') return;
  playSound(tone ? `tone_${tone}` : 'receive');
};
export const previewTone = (tone) => { if (tone && tone !== 'silent') playSound(`tone_${tone}`); else if (!tone) playSound('receive'); };
