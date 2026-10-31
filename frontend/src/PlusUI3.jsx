import React, { useCallback, useEffect, useState } from 'react';
import { Sheet } from './ui';
import api from './api';
import { errMsg } from './config';
import { sharingId, stopSharing } from './liveShare';

const ago = (iso) => {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  return s < 60 ? 'just now' : s < 3600 ? `${Math.floor(s / 60)} min ago` : `${Math.floor(s / 3600)} h ago`;
};

// ---------------------------------------------------------------- live location card
export function LiveCard({ msg, meId, onChanged }) {
  const live = msg.live;
  const mine = msg.sender === meId;
  const d = 0.004;
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${live.lng - d},${live.lat - d * 0.75},${live.lng + d},${live.lat + d * 0.75}&layer=mapnik&marker=${live.lat},${live.lng}`;
  const stop = async () => {
    stopSharing(false);
    try { const r = await api.post('live/update/', { message_id: msg.id, stop: true }); if (r && onChanged) onChanged({ ...msg, live: { ...live, active: false } }); } catch (e) { /* ignore */ }
  };
  return (
    <div style={{ minWidth: 230 }} onClick={(e) => e.stopPropagation()}>
      <div style={{ fontWeight: 700, marginBottom: 2 }}>📍 Live location</div>
      <div style={{ fontSize: 11.5, opacity: 0.75, marginBottom: 6 }}>
        {live.active ? `Updated ${ago(live.updated_at)}` : 'Sharing ended'}
      </div>
      <iframe title="Live location" src={src} style={{ width: '100%', height: 140, border: 0, borderRadius: 10 }} loading="lazy" />
      <div style={{ display: 'flex', gap: 8, marginTop: 6, alignItems: 'center' }}>
        <a href={`https://www.google.com/maps?q=${live.lat},${live.lng}`} target="_blank" rel="noreferrer" style={{ color: 'inherit', fontSize: 13 }}>Open in Maps</a>
        {mine && live.active && <button type="button" className="sc-btn ghost" style={{ height: 30, marginLeft: 'auto', fontSize: 12.5 }} onClick={stop}>Stop sharing</button>}
      </div>
      {mine && live.active && sharingId() !== msg.id && <div style={{ fontSize: 11, opacity: 0.7, marginTop: 4 }}>Open the app to keep sharing.</div>}
    </div>
  );
}

// ---------------------------------------------------------------- games
const ICON = { rock: '🪨', paper: '📄', scissors: '✂️' };
export function GameCard({ msg, meId, onChanged, ask }) {
  const g = msg.game;
  const [busy, setBusy] = useState(false);
  const move = async (m) => {
    if (busy) return;
    setBusy(true);
    try { const r = await api.post('games/move/', { game_id: g.id, move: m }); onChanged && onChanged(r.data); } catch (e) { ask && ask({ type: 'alert', title: errMsg(e, 'Could not play') }); }
    setBusy(false);
  };
  const other = meId === g.starter_id ? g.opponent : g.starter;
  const result = g.finished ? (g.draw ? "It's a draw 🤝" : (g.winner_id === meId ? 'You won! 🎉' : `${g.winner} won`)) : null;

  if (g.kind === 'ttt') {
    const myTurn = !g.finished && g.turn_id === meId;
    return (
      <div style={{ minWidth: 200 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontWeight: 700 }}>❌⭕ Tic-tac-toe</div>
        <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>{result || (myTurn ? 'Your turn' : `Waiting for ${other}`)} · {g.starter} is ❌</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4, width: 168 }}>
          {g.board.split('').map((c, i) => (
            <button type="button" key={i} disabled={!myTurn || c !== '.' || busy} onClick={() => move(i)}
              style={{ height: 52, fontSize: 26, border: 0, borderRadius: 10, background: 'rgba(0,0,0,.22)', color: 'inherit' }}>
              {c === 'x' ? '❌' : c === 'o' ? '⭕' : ''}
            </button>
          ))}
        </div>
      </div>
    );
  }
  const picked = (g.picked || []).includes(meId);
  const theirs = g.picks ? g.picks[String(meId === g.starter_id ? g.opponent_id : g.starter_id)] : null;
  return (
    <div style={{ minWidth: 210 }} onClick={(e) => e.stopPropagation()}>
      <div style={{ fontWeight: 700 }}>🪨📄✂️ Rock paper scissors</div>
      <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>
        {result || (picked ? `Waiting for ${other} to pick…` : 'Pick one')}
      </div>
      {g.finished ? (
        <div style={{ fontSize: 28 }}>{ICON[g.my_pick]} vs {ICON[theirs]}</div>
      ) : (
        <div style={{ display: 'flex', gap: 8 }}>
          {Object.keys(ICON).map((k) => (
            <button type="button" key={k} disabled={picked || busy} onClick={() => move(k)}
              style={{ width: 60, height: 52, fontSize: 26, border: g.my_pick === k ? '2px solid currentColor' : 0, borderRadius: 12, background: 'rgba(0,0,0,.22)', color: 'inherit' }}>{ICON[k]}</button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Ask me anything: my inbox
export function AskInbox({ T, onClose, ask }) {
  const [rows, setRows] = useState(null);
  const [drafts, setDrafts] = useState({});
  const load = useCallback(() => api.get('ask/inbox/').then((r) => setRows(r.data)).catch(() => setRows([])), []);
  useEffect(() => { load(); }, [load]);
  const answer = async (id) => {
    try { await api.post('ask/answer/', { id, answer: drafts[id] || '' }); setDrafts((d) => ({ ...d, [id]: '' })); load(); } catch (e) { ask({ type: 'alert', title: errMsg(e, 'Could not save') }); }
  };
  const del = async (id) => { try { await api.post('ask/answer/', { id, delete: true }); load(); } catch (e) { /* ignore */ } };
  return (
    <Sheet T={T} title="Ask me anything" onClose={onClose}>
      <p style={{ color: 'var(--sub)', fontSize: 13 }}>Friends can ask you questions without their name. Answered ones show on your profile card.</p>
      {rows && !rows.length && <p style={{ textAlign: 'center', color: 'var(--sub)', marginTop: 20 }}>No questions yet.</p>}
      {(rows || []).map((q) => (
        <div key={q.id} style={{ padding: '10px 0', borderBottom: '1px solid rgba(127,127,127,.18)' }}>
          <div style={{ fontWeight: 600 }}>🙈 {q.text}</div>
          {q.answer
            ? <div style={{ margin: '4px 0', color: 'var(--accent)' }}>↳ {q.answer}</div>
            : (
              <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                <input className="sc-field" placeholder="Your answer" maxLength={500} value={drafts[q.id] || ''} onChange={(e) => setDrafts((d) => ({ ...d, [q.id]: e.target.value }))} />
                <button type="button" className="sc-btn" style={{ height: 44 }} disabled={!(drafts[q.id] || '').trim()} onClick={() => answer(q.id)}>Reply</button>
              </div>
            )}
          <button type="button" onClick={() => del(q.id)} style={{ border: 0, background: 'transparent', color: 'var(--sub)', fontSize: 12, padding: 0, marginTop: 4 }}>Delete</button>
        </div>
      ))}
    </Sheet>
  );
}

// ---------------------------------------------------------------- Ask a friend (inside their profile card)
export function AskFriend({ userId, name, T }) {
  const [qs, setQs] = useState([]);
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState('');
  useEffect(() => { if (userId) api.get('ask/public/', { params: { user_id: userId } }).then((r) => setQs(r.data)).catch(() => {}); }, [userId]);
  const send = async () => {
    try { await api.post('ask/send/', { user_id: userId, text }); setText(''); setOpen(false); setMsg('Sent anonymously ✓'); } catch (e) { setMsg(errMsg(e, 'Could not send')); }
  };
  if (!userId) return null;
  return (
    <div className="text-start" style={{ marginBottom: 12 }}>
      {qs.length > 0 && (
        <div style={{ background: 'rgba(128,128,128,0.15)', borderRadius: 12, padding: '8px 12px', marginBottom: 8, maxHeight: 150, overflowY: 'auto' }}>
          <div className="small" style={{ color: T.accent, fontWeight: 600 }}>Ask me anything</div>
          {qs.map((q) => <div key={q.id} style={{ fontSize: 13.5, marginTop: 6 }}><b>🙈 {q.text}</b><div>↳ {q.answer}</div></div>)}
        </div>
      )}
      {open ? (
        <div style={{ display: 'flex', gap: 6 }}>
          <input className="form-control" placeholder={`Ask ${name} anything (anonymous)`} maxLength={300} value={text} onChange={(e) => setText(e.target.value)} />
          <button type="button" className="btn btn-sm rounded-pill px-3" style={{ border: `1px solid ${T.accent}`, color: 'inherit' }} disabled={!text.trim()} onClick={send}>Send</button>
        </div>
      ) : (
        <button type="button" className="btn btn-sm rounded-pill w-100" style={{ border: `1px solid ${T.accent}`, color: 'inherit' }} onClick={() => { setMsg(''); setOpen(true); }}>🙈 Ask anonymously</button>
      )}
      {msg && <div className="small mt-1 text-center" style={{ opacity: 0.8 }}>{msg}</div>}
    </div>
  );
}
