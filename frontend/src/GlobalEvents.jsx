import React, { useState, useRef } from 'react';
import { useRealtime } from './socket';
import { playSound } from './sounds';
import { showNotification } from './notify';

// Always mounted (see App.jsx). Handles things that must work on every screen:
//   * message sounds (receive / delete)
//   * "X liked your status" pop-up (notification only - it is NOT added to the chat)
export default function GlobalEvents() {
  const [toast, setToast] = useState(null);
  const timer = useRef(null);

  const popup = (t) => {
    setToast(t);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 3500);
  };

  useRealtime((evt) => {
    if (!evt) return;
    switch (evt.event) {
      case 'message':
        if (evt.mine) break;
        if (evt.action === 'new' && !evt.muted) playSound('receive');
        else if (evt.action === 'delete') playSound('delete');
        break;

      case 'status_like':
        playSound('like');
        popup({ title: evt.title || 'Status liked', body: evt.body || '❤️ Liked your status' });
        if (document.hidden) showNotification(evt.title || 'Status liked', evt.body || '❤️ Liked your status', 'status_like');
        break;

      case 'request':
        if (evt.action !== 'new') break;
        playSound('receive');
        popup({ title: 'New friend request', body: `${evt.from_name || 'Someone'} wants to connect` });
        if (document.hidden) showNotification('New friend request', `${evt.from_name || 'Someone'} wants to connect`, 'request');
        break;

      default:
        break;
    }
  });

  if (!toast) return null;
  return (
    <div
      onClick={() => setToast(null)}
      style={{
        position: 'fixed', top: 'calc(var(--safe-top, 0px) + 10px)', left: '50%', transform: 'translateX(-50%)',
        zIndex: 20000, maxWidth: '92%', background: 'rgba(30,12,20,0.96)', color: '#fff', border: '1px solid rgba(252,211,77,0.6)',
        borderRadius: 16, padding: '10px 16px', boxShadow: '0 6px 24px rgba(0,0,0,0.5)', fontSize: 13, textAlign: 'center',
      }}
    >
      <div style={{ fontWeight: 700 }}>{toast.title}</div>
      <div style={{ opacity: 0.85 }}>{toast.body}</div>
    </div>
  );
}
