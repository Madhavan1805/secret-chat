import React, { useEffect, useState } from 'react';
import api from './api';
import { errText, asList } from './config';

export default function ForwardModal({ msg, T, onClose }) {
  const [targets, setTargets] = useState([]);
  const [picked, setPicked] = useState({});
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('chats/targets/').then((r) => setTargets(asList(r.data))).catch(() => setError('Could not load chats'));
  }, []);

  const keyOf = (t) => (t.type === 'group' ? `g${t.chat_id}` : `f${t.friend_id}`);
  const toggle = (t) => setPicked((p) => ({ ...p, [keyOf(t)]: !p[keyOf(t)] }));
  const selected = targets.filter((t) => picked[keyOf(t)]);

  const send = async () => {
    if (!selected.length) return;
    setSending(true);
    try {
      const payload = selected.map((t) => (t.type === 'group' ? { chat_id: t.chat_id } : { friend_id: t.friend_id }));
      const res = await api.post(`messages/${msg.id}/forward/`, { targets: payload });
      if (res.data && res.data.forwarded_to === 0) {
        setError('Could not forward (chat locked or blocked)');
        setSending(false);
        return;
      }
      onClose(res.data ? res.data.forwarded_to : true);
    } catch (e) {
      setError(errText(e, 'Forward failed'));
      setSending(false);
    }
  };

  return (
    <div onClick={() => onClose(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 6000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: T.bg, color: T.text, border: `1px solid ${T.accent}`, borderRadius: 16, width: '100%', maxWidth: 360, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
        <div className="p-3 fw-bold" style={{ color: T.accent }}>↪ Forward to…</div>
        <div className="px-3 pb-2 small text-truncate" style={{ color: T.sub }}>{msg.content || msg.file_name || 'Attachment'}</div>
        <div style={{ overflowY: 'auto', flex: 1 }} className="px-2">
          {targets.length === 0 && !error && <p className="text-center small p-3" style={{ color: T.sub }}>No chats available</p>}
          {targets.map((t) => (
            <label key={keyOf(t)} className="d-flex align-items-center gap-3 p-2 rounded" style={{ cursor: 'pointer', color: T.text }}>
              <input type="checkbox" checked={!!picked[keyOf(t)]} onChange={() => toggle(t)} />
              <span>{t.type === 'group' ? '👥' : '👤'} {t.name}</span>
            </label>
          ))}
        </div>
        {error && <div className="text-danger small px-3">{error}</div>}
        <div className="d-flex gap-2 p-3 justify-content-end">
          <button className="btn btn-sm" style={{ color: T.text, border: `1px solid ${T.line}` }} onClick={() => onClose(false)}>Cancel</button>
          <button className="btn btn-sm fw-bold" disabled={!selected.length || sending} style={{ background: T.accent, color: '#1f2937' }} onClick={send}>
            {sending ? 'Sending…' : `Send${selected.length ? ` (${selected.length})` : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}
