import React, { useState, useEffect, useRef } from 'react';
import api from './api';
import { errMsg } from './config';

const MAX_WALLPAPER = 5 * 1024 * 1024;

export const WALLPAPERS = {
  midnight: { label: '🌌 Midnight', css: 'linear-gradient(160deg, #0f0c29, #302b63, #24243e)' },
  ocean: { label: '🌊 Ocean', css: 'linear-gradient(160deg, #0f2027, #203a43, #2c5364)' },
  forest: { label: '🌲 Forest', css: 'linear-gradient(160deg, #0b2e21, #14532d, #052e16)' },
  sunset: { label: '🌇 Sunset', css: 'linear-gradient(160deg, #42275a, #734b6d, #b24592)' },
  rose: { label: '🌹 Rose', css: 'linear-gradient(160deg, #3b0e1b, #7f1d3a, #4c0519)' },
  graphite: { label: '🩶 Graphite', css: 'linear-gradient(160deg, #141e30, #243b55)' },
};

const pad = (n) => String(n).padStart(2, '0');
const toLocalInput = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

const overlay = { position: 'fixed', top: 0, left: 0, width: '100%', height: 'var(--app-height, 100dvh)', zIndex: 9600, background: 'rgba(0,0,0,0.8)' };
const panel = (T) => ({ maxWidth: 380, background: '#1b1016', border: `1px solid ${T.accent}`, color: '#fff' });

// ------------------------------------------------------------ schedule modal
function ScheduleModal({ open, T, initialText, chatId, onClose, onScheduled }) {
  const [text, setText] = useState('');
  const [when, setWhen] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setText(initialText || '');
      setWhen(toLocalInput(new Date(Date.now() + 60 * 60 * 1000)));
      setError('');
      setBusy(false);
    }
  }, [open]);

  if (!open) return null;

  const quick = (kind) => {
    const d = new Date();
    if (kind === 'hour') d.setHours(d.getHours() + 1);
    if (kind === 'tonight') { d.setHours(21, 0, 0, 0); if (d.getTime() < Date.now() + 60000) d.setDate(d.getDate() + 1); }
    if (kind === 'morning') { d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); }
    setWhen(toLocalInput(d));
  };

  const submit = async () => {
    const msg = text.trim();
    if (!msg) { setError('Type a message first'); return; }
    const d = new Date(when);
    if (!when || Number.isNaN(d.getTime())) { setError('Pick a date and time'); return; }
    if (d.getTime() < Date.now() + 20000) { setError('Pick a time in the future'); return; }
    setBusy(true);
    setError('');
    try {
      await api.post('messages/schedule/', { chat_id: chatId, content: msg, send_at: d.toISOString() });
      onScheduled(msg);
    } catch (e) { setError(errMsg(e, 'Could not schedule')); }
    setBusy(false);
  };

  return (
    <div className="d-flex justify-content-center align-items-center px-3" style={overlay} onClick={onClose}>
      <div className="p-3 rounded-4 w-100" style={panel(T)} onClick={(e) => e.stopPropagation()}>
        <h6 className="fw-bold mb-2" style={{ color: T.accent }}>⏰ Schedule message</h6>
        <textarea className="form-control text-white mb-2" rows={3} placeholder="Type the message…" value={text} onChange={(e) => setText(e.target.value)}
                  style={{ background: 'rgba(255,255,255,0.08)', border: `1px solid ${T.accent}66`, resize: 'none' }} />
        <label className="small opacity-75 mb-1">Send at</label>
        <input type="datetime-local" className="form-control text-white mb-2" value={when} min={toLocalInput(new Date())}
               onChange={(e) => setWhen(e.target.value)} style={{ background: 'rgba(255,255,255,0.08)', border: `1px solid ${T.accent}66`, colorScheme: 'dark' }} />
        <div className="d-flex gap-2 flex-wrap mb-2">
          <button type="button" className="btn btn-sm btn-outline-light rounded-pill" style={{ fontSize: 11 }} onClick={() => quick('hour')}>In 1 hour</button>
          <button type="button" className="btn btn-sm btn-outline-light rounded-pill" style={{ fontSize: 11 }} onClick={() => quick('tonight')}>Tonight 9 PM</button>
          <button type="button" className="btn btn-sm btn-outline-light rounded-pill" style={{ fontSize: 11 }} onClick={() => quick('morning')}>Tomorrow 9 AM</button>
        </div>
        {error && <div className="text-danger small mb-2">{error}</div>}
        <div className="d-flex gap-2">
          <button className="btn btn-outline-light btn-sm flex-grow-1 rounded-pill" onClick={onClose}>Cancel</button>
          <button className="btn btn-sm flex-grow-1 rounded-pill fw-bold" disabled={busy} style={{ background: T.accent, color: '#1f2937' }} onClick={submit}>
            {busy ? 'Saving…' : 'Schedule'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------ scheduled list
function ScheduledListModal({ open, T, items, onClose, onCancel }) {
  if (!open) return null;
  return (
    <div className="d-flex justify-content-center align-items-center px-3" style={overlay} onClick={onClose}>
      <div className="p-3 rounded-4 w-100" style={panel(T)} onClick={(e) => e.stopPropagation()}>
        <h6 className="fw-bold mb-2" style={{ color: T.accent }}>⏰ Scheduled messages</h6>
        <div style={{ maxHeight: '50vh', overflowY: 'auto' }}>
          {items.length === 0 && <p className="text-white-50 small mb-2">Nothing scheduled in this chat.</p>}
          {items.map((it) => (
            <div key={it.id} className="d-flex align-items-start justify-content-between p-2 rounded mb-2" style={{ background: 'rgba(255,255,255,0.07)' }}>
              <div style={{ minWidth: 0 }}>
                <div className="text-break" style={{ fontSize: 13 }}>{it.content}</div>
                <div className="opacity-50" style={{ fontSize: 10 }}>{new Date(it.send_at).toLocaleString()}</div>
              </div>
              <button className="btn btn-sm btn-outline-danger ms-2" style={{ fontSize: 11 }} onClick={() => onCancel(it.id)}>Cancel</button>
            </div>
          ))}
        </div>
        <button className="btn btn-outline-light btn-sm w-100 rounded-pill mt-2" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------ the hook
export function useChatExtras({ chatId, ask, messagesLen, T }) {
  const [wp, setWp] = useState({ preset: '', url: '' });
  const [items, setItems] = useState([]);
  const [schedOpen, setSchedOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const doneRef = useRef(null);
  const fileRef = useRef(null);

  // wallpaper for this chat
  useEffect(() => {
    if (!chatId) { setWp({ preset: '', url: '' }); return undefined; }
    let alive = true;
    api.get(`chats/wallpaper/?chat_id=${chatId}`)
      .then((r) => { if (alive) setWp({ preset: r.data.wallpaper_preset || '', url: r.data.wallpaper_url || '' }); })
      .catch(() => {});
    return () => { alive = false; };
  }, [chatId]);

  const loadScheduled = async () => {
    if (!chatId) return;
    try {
      const r = await api.get(`messages/scheduled/?chat_id=${chatId}`);
      setItems(Array.isArray(r.data) ? r.data : []);
    } catch (e) { /* locked chat etc. */ }
  };
  useEffect(() => { loadScheduled(); }, [chatId, messagesLen]);

  const saveWallpaper = async (payload, isForm) => {
    try {
      const r = await api.post('chats/wallpaper/', payload, isForm ? { headers: { 'Content-Type': 'multipart/form-data' } } : undefined);
      setWp({ preset: r.data.wallpaper_preset || '', url: r.data.wallpaper_url || '' });
    } catch (e) { ask({ type: 'alert', title: errMsg(e, 'Wallpaper failed') }); }
  };

  const chooseWallpaper = async () => {
    if (!chatId) return;
    const choices = [
      ...Object.entries(WALLPAPERS).map(([k, v]) => ({ label: v.label, value: k })),
      { label: '🧹 Remove wallpaper', value: '__clear' },
    ];
    const v = await ask({ type: 'choice', title: 'Chat wallpaper', current: wp.preset, choices });
    if (!v) return;
    if (v === '__clear') saveWallpaper({ chat_id: chatId, clear: true });
    else saveWallpaper({ chat_id: chatId, preset: v });
  };

  const pickWallpaperPhoto = () => { if (fileRef.current) fileRef.current.click(); };

  const onWallpaperFile = (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f || !chatId) return;
    if (f.size > MAX_WALLPAPER) { ask({ type: 'alert', title: 'Image too large (max 5 MB)' }); return; }
    const fd = new FormData();
    fd.append('chat_id', chatId);
    fd.append('image', f);
    saveWallpaper(fd, true);
  };

  const cancelItem = async (id) => {
    try { await api.post('messages/cancel_scheduled/', { id }); await loadScheduled(); } catch (e) { ask({ type: 'alert', title: errMsg(e, 'Failed') }); }
  };

  const wallpaperStyle = wp.url
    ? { backgroundImage: `linear-gradient(rgba(0,0,0,0.30), rgba(0,0,0,0.30)), url("${wp.url}")`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : (WALLPAPERS[wp.preset] ? { backgroundImage: WALLPAPERS[wp.preset].css } : {});

  return {
    wallpaperStyle,
    chooseWallpaper,
    pickWallpaperPhoto,
    wallpaperInput: <input ref={fileRef} type="file" accept="image/*" className="d-none" onChange={onWallpaperFile} />,
    scheduledCount: items.length,
    openSchedule: (text, onDone) => { setDraft(text || ''); doneRef.current = onDone || null; setSchedOpen(true); },
    openScheduledList: () => setListOpen(true),
    modals: (
      <>
        <ScheduleModal
          open={schedOpen} T={T} initialText={draft} chatId={chatId}
          onClose={() => setSchedOpen(false)}
          onScheduled={(text) => { setSchedOpen(false); if (doneRef.current) doneRef.current(text); loadScheduled(); }}
        />
        <ScheduledListModal open={listOpen} T={T} items={items} onClose={() => setListOpen(false)} onCancel={cancelItem} />
      </>
    ),
  };
}