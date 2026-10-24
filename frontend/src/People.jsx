import React, { useEffect, useRef, useState } from 'react';
import { BiSearch, BiQrScan, BiUserPlus } from 'react-icons/bi';
import api from './api';
import Avatar from './Avatar';
import { Sheet } from './ui';
import { asList } from './config';

// ------------------------------------------------------------------ requests (kept out of the chat list)
export function RequestsSheet({ T, pending, sent, onAccept, onDecline, onCancel, onClose }) {
  return (
    <Sheet T={T} title="Requests" onClose={onClose}>
      {pending.length === 0 && sent.length === 0 && (
        <div className="sc-empty"><BiUserPlus style={{ fontSize: 38, color: 'var(--accent)' }} /><b>No requests</b>When someone adds you, it shows up here.</div>
      )}

      {pending.length > 0 && (
        <>
          <div className="sc-section">Wants to connect with you</div>
          {pending.map((r) => (
            <div key={r.id} className="sc-row" style={{ cursor: 'default' }}>
              <Avatar src={r.sender_profile_picture} name={r.sender_name} size={52} T={T} />
              <div className="sc-row-main">
                <h3 className="sc-row-name"><span className="t">{r.sender_name}</span></h3>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button type="button" className="sc-btn" style={{ height: 34, fontSize: 13, padding: '0 18px' }} onClick={() => onAccept(r)}>Confirm</button>
                  <button type="button" className="sc-btn ghost" style={{ height: 34, fontSize: 13, padding: '0 18px' }} onClick={() => onDecline(r)}>Delete</button>
                </div>
              </div>
            </div>
          ))}
        </>
      )}

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
        <input autoFocus placeholder="Search by Secret ID" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search people" autoCapitalize="none" />
      </label>

      {!q.trim() && <div className="sc-empty"><BiSearch style={{ fontSize: 34 }} /><b>Find your people</b>Type a Secret ID, or scan a friend's QR code.</div>}
      {q.trim() && !busy && results.length === 0 && <div className="sc-empty"><b>No one found</b>Check the Secret ID and try again.</div>}

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
