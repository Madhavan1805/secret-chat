import React, { useCallback, useEffect, useState } from 'react';
import { Sheet } from './ui';
import api from './api';
import { errMsg, formatListTime } from './config';

export const KINDS = [['idea', '💡 Idea'], ['bug', '🐞 Problem'], ['other', '💬 Other']];
export const STATUS = { new: 'Sent', seen: 'Seen', done: 'Done' };

// Feedback box: tell the Chatzy team about an idea or a problem; their answers show up here.
export default function FeedbackSheet({ T, onClose, ask }) {
  const [kind, setKind] = useState('idea');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [list, setList] = useState([]);

  const load = useCallback(() => api.get('feedback/').then((r) => setList(r.data.feedback || [])).catch(() => {}), []);
  useEffect(() => { load(); }, [load]);

  const send = async () => {
    if (text.trim().length < 3 || busy) return;
    setBusy(true);
    try {
      await api.post('feedback/', { kind, text: text.trim() });
      setText(''); setSent(true); load();
      setTimeout(() => setSent(false), 2500);
    } catch (e) { ask({ type: 'alert', title: errMsg(e, 'Could not send feedback') }); }
    setBusy(false);
  };

  return (
    <Sheet T={T} title="Feedback" onClose={onClose}>
      <p style={{ color: 'var(--sub)', fontSize: 13.5, margin: '0 4px 12px', lineHeight: 1.5 }}>Got an idea or found a problem? Tell us, it goes straight to the Chatzy team.</p>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        {KINDS.map(([k, label]) => (
          <button key={k} type="button" className={`sc-btn ${kind === k ? '' : 'ghost'}`} style={{ flex: 1, padding: '8px 4px', fontSize: 13 }} onClick={() => setKind(k)}>{label}</button>
        ))}
      </div>
      <textarea className="form-control" rows={4} maxLength={1000} placeholder="Write here…" value={text} onChange={(e) => setText(e.target.value)} aria-label="Your feedback" />
      <button type="button" className="sc-btn" style={{ width: '100%', marginTop: 10 }} disabled={busy || text.trim().length < 3} onClick={send}>{sent ? '✓ Sent, thank you!' : busy ? 'Sending…' : 'Send feedback'}</button>

      {list.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <div style={{ fontWeight: 700, margin: '0 4px 8px' }}>Your feedback</div>
          {list.map((f) => (
            <div key={f.id} style={{ padding: '10px 12px', borderRadius: 16, background: 'var(--raised)', border: '1px solid var(--line)', marginBottom: 8 }}>
              <div style={{ fontSize: 12, color: 'var(--sub)', display: 'flex', justifyContent: 'space-between' }}>
                <span>{(KINDS.find((k) => k[0] === f.kind) || KINDS[2])[1]} · {formatListTime(f.created_at)}</span>
                <b style={{ color: f.status === 'done' ? '#3DDC97' : 'var(--accent)' }}>{STATUS[f.status] || 'Sent'}</b>
              </div>
              <div style={{ marginTop: 4, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 14 }}>{f.text}</div>
              {f.reply && <div style={{ marginTop: 8, padding: '8px 10px', borderRadius: 12, background: 'var(--line)', fontSize: 13.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}><b>Chatzy team:</b> {f.reply}</div>}
            </div>
          ))}
        </div>
      )}
    </Sheet>
  );
}
