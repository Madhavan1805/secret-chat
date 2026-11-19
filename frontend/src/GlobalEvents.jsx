import React, { useState, useRef, useEffect } from 'react';
import { useRealtime } from './socket';
import { playSound } from './sounds';
import { showNotification, getActiveChat } from './notify';
import api from './api';
import { onlineAlertsEnabled, shouldAnnounce } from './onlineAlerts';
import { hasToken } from './auth';
import { loadTones, playMessageTone } from './tones';

// Always mounted (see App.jsx). Handles things that must work on every screen:
//   * message sounds (receive / delete)
//   * "X liked your status" pop-up (notification only - it is NOT added to the chat)
export default function GlobalEvents() {
  const [toast, setToast] = useState(null);
  const [announce, setAnnounce] = useState(null);             // { id, title, text } from the admin
  const seenAnnounce = () => { try { return Number(localStorage.getItem('seen_announcement') || 0); } catch (e) { return 0; } };
  const closeAnnounce = () => {
    if (announce) { try { localStorage.setItem('seen_announcement', String(announce.id)); } catch (e) { /* ignore */ } }
    setAnnounce(null);
  };
  useEffect(() => {                                           // tones + the newest announcement, once per app start
    if (!hasToken()) return;
    loadTones();
    api.get('announcements/latest/').then((r) => {
      const a = r.data && r.data.announcement;
      if (a && a.id > seenAnnounce()) setAnnounce(a);
    }).catch(() => {});
  }, []);                                                     // eslint-disable-line react-hooks/exhaustive-deps
  // Birthdays: a small pop-up at the top (not a line in the chat). Shown once per person per day.
  const [bdays, setBdays] = useState([]);                      // [{ key, id, name, mine }]
  const [bdSent, setBdSent] = useState(false);
  const bdKey = (date, id) => `bday_seen_${date}_${id}`;
  const addBday = (date, id, name, mine) => {
    const key = bdKey(date, id);
    try { if (localStorage.getItem(key)) return; } catch (e) { /* ignore */ }
    setBdays((q) => (q.some((b) => b.key === key) ? q : [...q, { key, id, name, mine }]));
  };
  const closeBday = () => {
    const b = bdays[0];
    if (b) { try { localStorage.setItem(b.key, '1'); } catch (e) { /* ignore */ } }
    setBdSent(false);
    setBdays((q) => q.slice(1));
  };
  const wishBday = async () => {
    const b = bdays[0];
    if (!b || b.mine) return;
    try {
      const fd = new FormData();
      fd.append('receiver', b.id);
      fd.append('content', '🎂 Happy birthday! 🎉');
      await api.post('messages/', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setBdSent(true);
      setTimeout(closeBday, 1100);
    } catch (e) { /* leave it open so they can try again */ }
  };
  useEffect(() => {
    if (!hasToken()) return;
    api.get('birthdays/today/').then((r) => {
      const d = r.data || {};
      if (d.mine) addBday(d.date, 'me', d.me, true);
      (d.friends || []).forEach((f) => addBday(d.date, f.id, f.username, false));
    }).catch(() => {});
  }, []);                                                     // eslint-disable-line react-hooks/exhaustive-deps
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
          playMessageTone(evt.chat_id);
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

      case 'birthday':
        if (evt.user_id && evt.username) addBday(new Date(Date.now() + 19800000).toISOString().slice(0, 10), evt.user_id, evt.username, false);
        break;

      case 'feedback_reply':
        playSound('receive');
        popup({ title: 'Reply to your feedback', body: 'The Chatzy team answered. Open Feedback to read it.' });
        break;

      case 'announcement':
        if (evt.id > seenAnnounce()) setAnnounce({ id: evt.id, title: evt.title, text: evt.text });
        playSound('receive');
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
  const bd = bdays[0];
  const bdayCard = bd && (
    <div className="gm-pop bd-pop" role="alert" style={{ top: 'calc(var(--safe-top, 0px) + 10px)' }}>
      <div className="bd-row">
        <span className="bd-cake" aria-hidden="true">🎂</span>
        <div className="bd-text">
          {bd.mine ? <><b>Happy birthday, {bd.name}!</b><span>Hope your day is full of joy 🎉</span></>
            : <><b>{bd.name}</b><span>has a birthday today 🎉</span></>}
        </div>
        <button type="button" className="gm-x" onClick={closeBday} aria-label="Dismiss">✕</button>
      </div>
      {!bd.mine && (bdSent ? <div className="gm-sent">✓ Wish sent</div> : <button type="button" className="bd-wish" onClick={wishBday}>Wish {bd.name} 🎉</button>)}
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
  const announceCard = announce && (
    <div role="dialog" aria-label="Announcement" onClick={closeAnnounce}
         style={{ position: 'fixed', inset: 0, zIndex: 30000, background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--panel, #1c1c22)', color: 'var(--text, #fff)', borderRadius: 22, padding: '22px 20px', maxWidth: 360, width: '100%', boxShadow: '0 14px 50px rgba(0,0,0,.5)' }}>
        <div style={{ fontSize: 30, textAlign: 'center' }}>📢</div>
        <h3 style={{ margin: '6px 0 8px', textAlign: 'center', fontSize: 19 }}>{announce.title || 'Chatzy'}</h3>
        <p style={{ margin: '0 0 16px', lineHeight: 1.5, textAlign: 'center', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{announce.text}</p>
        <button type="button" className="sc-btn" style={{ width: '100%' }} onClick={closeAnnounce}>Got it</button>
      </div>
    </div>
  );
  if (!toast) return (<>{onlinePop}{bdayCard}{msgCard}{announceCard}</>);
  return (
    <>
    {onlinePop}
    {bdayCard}
    {msgCard}
    {announceCard}
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
