import { useEffect, useRef } from 'react';
import { WS_ORIGIN, getToken } from './config';

let ws = null;
let wantOpen = false;
let retry = 0;
let retryTimer = null;
let pingTimer = null;
const listeners = new Set();

const emit = (evt) => listeners.forEach((fn) => { try { fn(evt); } catch (e) { console.error(e); } });

function open() {
  const token = getToken();
  if (!token || (ws && (ws.readyState === 0 || ws.readyState === 1))) return;
  let socket;
  try {
    socket = new WebSocket(`${WS_ORIGIN}/ws/chat/?token=${encodeURIComponent(token)}`);
  } catch (e) { return; }
  ws = socket;
  socket.onopen = () => {
    retry = 0;
    clearInterval(pingTimer);
    pingTimer = setInterval(() => { if (socket.readyState === 1) socket.send(JSON.stringify({ type: 'ping' })); }, 25000);
    emit({ event: '_open' });
  };
  socket.onmessage = (e) => { try { emit(JSON.parse(e.data)); } catch (err) { /* ignore */ } };
  socket.onclose = () => {
    clearInterval(pingTimer);
    if (ws === socket) ws = null;
    emit({ event: '_close' });
    if (wantOpen) {
      retry = Math.min(retry + 1, 6);
      clearTimeout(retryTimer);
      retryTimer = setTimeout(open, 500 * 2 ** retry);
    }
  };
  socket.onerror = () => { try { socket.close(); } catch (e) { /* ignore */ } };
}

export function connectSocket() { wantOpen = true; open(); }
export function disconnectSocket() {
  wantOpen = false;
  clearTimeout(retryTimer);
  clearInterval(pingTimer);
  if (ws) { try { ws.close(); } catch (e) { /* ignore */ } }
  ws = null;
}
export const isSocketOpen = () => !!ws && ws.readyState === 1;
export const sendSocket = (obj) => {
  if (isSocketOpen()) { ws.send(JSON.stringify(obj)); return true; }
  return false;
};
export const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

// React hook: makes sure the socket is connected and calls handler(evt) for every server event.
// Pseudo events: {event:'_open'} / {event:'_close'} when the connection state changes.
export function useRealtime(handler) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    connectSocket();
    return subscribe((evt) => { if (ref.current) ref.current(evt); });
  }, []);
}
