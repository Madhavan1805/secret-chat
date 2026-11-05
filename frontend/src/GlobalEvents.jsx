import React, { useState, useRef } from 'react';
import { useRealtime } from './socket';
import { playSound } from './sounds';
import { showNotification, getActiveChat } from './notify';
import api from './api';
import { onlineAlertsEnabled, shouldAnnounce } from './onlineAlerts';

// Always mounted (see App.jsx). Handles things that must work on every screen:
//   * message sounds (receive / delete)
//   * "X liked your status" pop-up (notification only - it is NOT added to the chat)
export default function GlobalEvents() {
  const [toast, setToast] = useState(null);
  const timer = useRef(null);
  const [online, setOnline] = useState(null);
  const onlineTimer = useRef(null);
  const [msgPop, setMsgPop] = useState(null);                 // { chat_id, sender_id, is_group, title, body }
  const [reply, setReply] = useState('');
  const [sentOk, setSentOk] = useState(false);
  const msgTimer = useRef(null);
  const closeMsgPop = () => { clearTimeout(msgTimer.current); setMsgPop(null); setReply(''); setSentOk(false); };
  const holdMsgPop = () => clearTimeout(msgTimer.current);                       // typing a reply keeps it open
  const sendReply = async (e) => {
    e.preventDefault();
    const t = reply.trim();
    if (!t || !msgPop) return;
    try {
      const fd = new FormData();
      if (msgPop.is_group) fd.append('chat', msgPop.chat_id); else fd.append('receiver', msgPop.sender_id);
      fd.append('content', t);
      await api.post('messages/', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setSentOk(true); setReply('');
      clearTimeout(msgTimer.current);
      msgTimer.current = setTimeout(closeMsgPop, 900);
    } catch (err) { /* leave it open so they can try again */ }
  };
  const markRead = async () => {
    if (msgPop && !msgPop.is_group) { try { await api.post('messages/mark_as_read/', { sender_id: msgPop.sender_id }); } catch (e) { /* ignore */ } }
    closeMsgPop();
  };

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
        if (evt.action === 'new' && !evt.muted) {
          playSound('receive');
          const inThatChat = Number(evt.chat_id) === Number(getActiveChat()) && !document.hidden;
          if (!inThatChat && !document.hidden) {
            setMsgPop({ chat_id: evt.chat_id, sender_id: evt.sender_id, is_group: !!evt.is_group, title: evt.title || 'New message', body: evt.body || '' });
            setReply(''); setSentOk(false);
            clearTimeout(msgTimer.current);
            msgTimer.current = setTimeout(closeMsgPop, 8000);
          }
        }
        else if (evt.action === 'delete') playSound('delete');
        break;

      case 'status_like':
        playSound('like');
        popup({ title: evt.title || 'Status liked', body: evt.body || '❤️ Liked your status' });
        if (document.hidden) showNotification(evt.title || 'Status liked', evt.body || '❤️ Liked your status', 'status_like');
        break;

      case 'presence':       // a friend just came online -> small cute pop-up (can be switched off in Profile)
        if (evt.is_online && evt.username && onlineAlertsEnabled() && shouldAnnounce(evt.user_id)) {
          setOnline({ id: evt.user_id, name: evt.username });
          clearTimeout(onlineTimer.current);
          onlineTimer.current = setTimeout(() => setOnline(null), 2800);
        }
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

  const msgCard = msgPop && (
    <div className="gm-pop" role="alert" onClick={(e) => e.stopPropagation()}>
      <div className="gm-head"><b>{msgPop.title}</b><button type="button" className="gm-x" onClick={closeMsgPop} aria-label="Dismiss">✕</button></div>
      <div className="gm-body">{msgPop.body}</div>
      {sentOk ? <div className="gm-sent">✓ Sent</div> : (
        <form className="gm-reply" onSubmit={sendReply}>
          <input value={reply} onChange={(e) => setReply(e.target.value)} onFocus={holdMsgPop} placeholder="Reply…" aria-label="Reply" maxLength={1000} />
          <button type="submit" disabled={!reply.trim()}>Send</button>
        </form>
      )}
      {!sentOk && <button type="button" className="gm-read" onClick={markRead}>{msgPop.is_group ? 'Dismiss' : 'Mark as read'}</button>}
    </div>
  );
  const onlinePop = online && (
    <div key={`${online.id}-${online.name}`} className="sc-online-pop" role="status" aria-live="polite"
         style={{ top: toast ? 'calc(var(--safe-top, 0px) + 74px)' : 'calc(var(--safe-top, 0px) + 12px)' }}>
      <span className="dot" aria-hidden="true" />
      <span><b>{online.name}</b> is online</span>
      <span aria-hidden="true">✨</span>
    </div>
  );
  if (!toast) return (<>{onlinePop}{msgCard}</>);
  return (
    <>
    {onlinePop}
    {msgCard}
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
    </>
  );
}
