import React, { useEffect, useRef, useState } from 'react';
import { BiSearch, BiQrScan, BiUserPlus } from 'react-icons/bi';
import api from './api';
import Avatar from './Avatar';
import { Sheet } from './ui';
import { asList } from './config';

const ACT_TEXT = { follow_accept: 'accepted your follow request.', unfollow: 'unfollowed you.', note_like: 'liked your note.', status_like: 'liked your status.' };
const ACT_ICON = { follow_accept: '✅', unfollow: '👋', note_like: '❤️', status_like: '❤️' };
const shortAgo = (iso) => {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  if (m < 1440) return `${Math.floor(m / 60)}h`;
  return `${Math.floor(m / 1440)}d`;
};
const bucket = (iso) => {
  const d = (Date.now() - new Date(iso).getTime()) / 86400000;
  return d < 1 ? 'Today' : d < 7 ? 'This week' : 'Earlier';
};

// ------------------------------------------------------------------ requests (kept out of the chat list)
export function RequestsSheet({ T, pending, sent, onAccept, onDecline, onCancel, onClose, asks = [], activity = [], onOpenAsks, onMessage }) {
  const [accepted, setAccepted] = useState([]);          // accepted just now: the button turns into "Message"
  const [busyId, setBusyId] = useState(null);
  const confirm = async (r) => {
    setBusyId(r.id);
    const ok = await onAccept(r);
    setBusyId(null);
    if (ok !== false) setAccepted((a) => [...a, r]);
  };
  const open = pending.filter((r) => !accepted.some((a) => a.id === r.id));
  const empty = open.length === 0 && accepted.length === 0 && sent.length === 0 && asks.length === 0 && activity.length === 0;
  return (
    <Sheet T={T} title="Activity" onClose={onClose}>
      {empty && (
        <div className="sc-empty"><BiUserPlus style={{ fontSize: 38, color: 'var(--accent)' }} /><b>Nothing new</b>Friend requests, anonymous questions and note likes show up here.</div>
      )}

      {asks.length > 0 && (
        <>
          <div className="sc-section">Anonymous messages</div>
          <button type="button" className="sc-row" onClick={onOpenAsks} style={{ width: '100%', textAlign: 'left' }}>
            <span style={{ fontSize: 30, width: 46, textAlign: 'center' }}>🙈</span>
            <div className="sc-row-main">
              <h3 className="sc-row-name"><span className="t">{asks.length === 1 ? 'Someone asked you something' : `${asks.length} anonymous questions`}</span></h3>
              <span className="sc-row-sub">{asks[0].text}</span>
            </div>
            <span className="sc-btn" style={{ height: 34, fontSize: 13, padding: '0 16px', display: 'inline-grid', placeItems: 'center' }}>Reply</span>
          </button>
        </>
      )}

      {(open.length > 0 || accepted.length > 0) && (
        <>
          <div className="sc-section">Wants to connect with you</div>
          {open.map((r) => (
            <div key={r.id} className="sc-row" style={{ cursor: 'default' }}>
              <Avatar src={r.sender_profile_picture} name={r.sender_name} size={52} T={T} />
              <div className="sc-row-main">
                <h3 className="sc-row-name"><span className="t">{r.sender_name}</span></h3>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button type="button" className="sc-btn" disabled={busyId === r.id} style={{ height: 34, fontSize: 13, padding: '0 18px' }} onClick={() => confirm(r)}>Confirm</button>
                  <button type="button" className="sc-btn ghost" style={{ height: 34, fontSize: 13, padding: '0 18px' }} onClick={() => onDecline(r)}>Delete</button>
                </div>
              </div>
            </div>
          ))}
          {accepted.map((r) => (
            <div key={r.id} className="sc-row" style={{ cursor: 'default' }}>
              <Avatar src={r.sender_profile_picture} name={r.sender_name} size={52} T={T} />
              <div className="sc-row-main">
                <h3 className="sc-row-name"><span className="t">{r.sender_name}</span></h3>
                <span className="sc-row-sub">You are now connected</span>
              </div>
              <button type="button" className="sc-btn" style={{ height: 34, fontSize: 13, padding: '0 18px' }} onClick={() => onMessage && onMessage(r)}>Message</button>
            </div>
          ))}
        </>
      )}

      {activity.length > 0 && ['Today', 'This week', 'Earlier'].map((label) => {
        const rows = activity.filter((a) => bucket(a.created_at) === label);
        if (!rows.length) return null;
        return (
          <React.Fragment key={label}>
            <div className="sc-section">{label}</div>
            {rows.map((a) => (
              <div key={a.id} className="sc-row" style={{ cursor: 'default', background: a.is_read ? undefined : 'color-mix(in srgb, var(--accent) 10%, transparent)', borderRadius: 14 }}>
                <span style={{ position: 'relative', flex: 'none' }}>
                  <Avatar src={a.profile_picture} name={a.username} size={48} T={T} />
                  <span style={{ position: 'absolute', right: -4, bottom: -4, width: 22, height: 22, borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: 12, background: 'var(--panel)', boxShadow: '0 0 0 2px var(--panel)' }}>{ACT_ICON[a.kind] || '🔔'}</span>
                </span>
                <div className="sc-row-main" style={{ whiteSpace: 'normal' }}>
                  <div style={{ fontSize: 14.5, lineHeight: 1.35, color: 'var(--text)' }}><b>{a.username}</b> {ACT_TEXT[a.kind] || 'did something'} <span style={{ color: 'var(--sub)' }}>{shortAgo(a.created_at)}</span></div>
                </div>
              </div>
            ))}
          </React.Fragment>
        );
      })}

      {sent.length > 0 && (
        <>
          <div className="sc-section">Requests you sent</div>
          {sent.map((r) => (
            <div key={r.id} className="sc-row" style={{ cursor: 'default' }}>
              <Avatar name={r.receiver_name} size={46} T={T} />
              <div className="sc-row-main"><h3 className="sc-row-name"><span className="t">{r.receiver_name}</span></h3><span className="sc-row-sub">Waiting for them to accept</span></div>
              <button type="button" className="sc-btn ghost" style={{ height: 34, fontSize: 13, padding: '0 16px' }} onClick={() => onCancel(r)}>Cancel</button>
            </div>
          ))}
        </>
      )}
    </Sheet>
  );
}

// ------------------------------------------------------------------ find people (Add friend -> Requested -> Friends)
export function FindPeopleSheet({ T, me, friends, pending, sent, initialQuery = '', onAdd, onCancel, onAccept, onUnfriend, onOpenQr, onClose }) {
  const [q, setQ] = useState(initialQuery);
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    clearTimeout(timer.current);
    const term = q.trim();
    if (!term) { setResults([]); return undefined; }
    setBusy(true);
    timer.current = setTimeout(async () => {
      try {
        const r = await api.get(`users/?search=${encodeURIComponent(term)}`);
        setResults(asList(r.data).filter((u) => u.id !== me?.id));
      } catch (e) { setResults([]); }
      setBusy(false);
    }, 300);
    return () => clearTimeout(timer.current);
  }, [q, me?.id]);

  const isFriend = (id) => friends.some((f) => f.id === id);
  const sentTo = (id) => sent.find((r) => r.receiver === id);
  const incomingFrom = (id) => pending.find((r) => r.sender === id);

  const action = (u) => {
    if (isFriend(u.id)) return <button type="button" className="sc-btn ghost" style={{ height: 34, fontSize: 13, padding: '0 16px' }} onClick={() => onUnfriend(u)}>Friends</button>;
    const inc = incomingFrom(u.id);
    if (inc) return <button type="button" className="sc-btn" style={{ height: 34, fontSize: 13, padding: '0 16px' }} onClick={() => onAccept(inc)}>Confirm</button>;
    const s = sentTo(u.id);
    if (s) return <button type="button" className="sc-btn ghost" style={{ height: 34, fontSize: 13, padding: '0 16px' }} onClick={() => onCancel(s)}>Requested</button>;
    return <button type="button" className="sc-btn" style={{ height: 34, fontSize: 13, padding: '0 16px' }} onClick={() => onAdd(u)}>Add friend</button>;
  };

  return (
    <Sheet T={T} title="Find people" onClose={onClose}
      right={<button type="button" className="sc-iconbtn" aria-label="Scan or show QR code" onClick={onOpenQr}><BiQrScan /></button>}>
      <label className="sc-search" style={{ margin: '0 0 8px' }}>
        <BiSearch style={{ fontSize: 20 }} />
        <input autoFocus placeholder="Search by Chatzy ID" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search people" autoCapitalize="none" />
      </label>

      {!q.trim() && <div className="sc-empty"><BiSearch style={{ fontSize: 34 }} /><b>Find your people</b>Type a Chatzy ID, or scan a friend's QR code.</div>}
      {q.trim() && !busy && results.length === 0 && <div className="sc-empty"><b>No one found</b>Check the Chatzy ID and try again.</div>}

      {results.map((u) => (
        <div key={u.id} className="sc-row" style={{ cursor: 'default' }}>
          <Avatar src={u.profile_picture} name={u.username} size={50} T={T} />
          <div className="sc-row-main">
            <h3 className="sc-row-name"><span className="t">{u.username}</span></h3>
            {u.bio && <span className="sc-row-sub">{u.bio}</span>}
          </div>
          {action(u)}
        </div>
      ))}
    </Sheet>
  );
}
