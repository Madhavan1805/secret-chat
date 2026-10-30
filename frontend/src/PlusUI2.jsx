import React, { useRef, useState } from 'react';
import { BiPlus, BiX } from 'react-icons/bi';
import { Sheet } from './ui';
import api from './api';
import { errMsg } from './config';

const pad = (n) => String(n).padStart(2, '0');
const localInput = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

// ---------------------------------------------------------------- event with Going / Maybe / Can't
export function EventSheet({ T, onClose, onCreate }) {
  const [title, setTitle] = useState('');
  const [place, setPlace] = useState('');
  const [when, setWhen] = useState(() => { const d = new Date(Date.now() + 3600e3 * 3); d.setMinutes(0); return localInput(d); });
  const [busy, setBusy] = useState(false);
  const ok = title.trim() && when && new Date(when).getTime() > Date.now();
  const submit = async () => {
    setBusy(true);
    const done = await onCreate({
      question: title.trim(), options: ['✅ Going', '🤔 Maybe', "❌ Can't come"], multiple: false,
      event_at: new Date(when).toISOString(), event_place: place.trim(),
    });
    setBusy(false);
    if (done) onClose();
  };
  return (
    <Sheet T={T} title="New event" onClose={onClose}>
      <label className="sc-label">What is the plan?</label>
      <input className="sc-field" placeholder="Movie night" value={title} maxLength={300} autoFocus onChange={(e) => setTitle(e.target.value)} />
      <label className="sc-label">When</label>
      <input className="sc-field" type="datetime-local" value={when} min={localInput(new Date())} onChange={(e) => setWhen(e.target.value)} />
      <label className="sc-label">Where (optional)</label>
      <input className="sc-field" placeholder="Beach, my house…" value={place} maxLength={100} onChange={(e) => setPlace(e.target.value)} />
      <p style={{ color: 'var(--sub)', fontSize: 12.5 }}>Everybody taps Going / Maybe / Can't come. They also get a reminder 30 minutes before.</p>
      <button type="button" className="sc-btn" style={{ width: '100%' }} disabled={!ok || busy} onClick={submit}>Send event</button>
    </Sheet>
  );
}

export const eventWhen = (iso) => new Date(iso).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

// ---------------------------------------------------------------- shared album (vanishes after 24 h)
const left = (iso) => {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'expired';
  const h = Math.floor(ms / 3600e3), m = Math.floor((ms % 3600e3) / 60e3);
  return h ? `${h}h ${m}m left` : `${m}m left`;
};

export function AlbumCard({ album, onChanged, ask }) {
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState(null);
  const add = async (e) => {
    const files = [...(e.target.files || [])];
    e.target.value = '';
    if (!files.length) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('album_id', album.id);
      files.forEach((f) => fd.append('files', f));
      const r = await api.post('albums/add/', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      if (onChanged) onChanged(r.data);
    } catch (err) { if (ask) ask({ type: 'alert', title: errMsg(err, 'Could not add photos') }); }
    setBusy(false);
  };
  const shots = album.photos.slice(-6);
  return (
    <div style={{ minWidth: 220 }} onClick={(e) => e.stopPropagation()}>
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16 }}>🖼️ {album.title}</div>
      <div style={{ fontSize: 11.5, opacity: 0.75, marginBottom: 8 }}>
        {album.expired ? 'This album has expired' : `${album.photos.length} photo${album.photos.length === 1 ? '' : 's'} · ${left(album.expires_at)}`}
      </div>
      {!album.expired && shots.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 3, marginBottom: 8 }}>
          {shots.map((p) => (
            <button type="button" key={p.id} onClick={() => setView(p)} style={{ padding: 0, border: 0, aspectRatio: '1', borderRadius: 8, overflow: 'hidden', background: 'rgba(0,0,0,.2)' }}>
              <img src={p.url} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </button>
          ))}
        </div>
      )}
      {!album.expired && (
        <>
          <button type="button" className="sc-btn ghost" style={{ height: 36, width: '100%' }} disabled={busy} onClick={() => input.current && input.current.click()}>
            <BiPlus /> {busy ? 'Adding…' : 'Add photos'}
          </button>
          <input ref={input} type="file" accept="image/*" multiple hidden onChange={add} />
        </>
      )}
      {view && (
        <div onClick={() => setView(null)} style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,.92)', display: 'grid', placeItems: 'center' }}>
          <img src={view.url} alt="" style={{ maxWidth: '100%', maxHeight: '88%', objectFit: 'contain' }} />
          <span style={{ color: '#fff', position: 'absolute', bottom: 24 }}>by {view.by}</span>
          <button type="button" aria-label="Close" style={{ position: 'absolute', top: 16, right: 16, border: 0, background: 'rgba(255,255,255,.18)', color: '#fff', borderRadius: '50%', width: 40, height: 40 }}><BiX size={24} /></button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- mood (24 hours)
const MOODS = ['😊', '😎', '🥰', '😴', '🤒', '😤', '😢', '🤩', '🎧', '📚', '🍕', '✈️'];
export function MoodSheet({ T, me, onClose, onDone, ask }) {
  const [emoji, setEmoji] = useState(me?.mood?.emoji || '');
  const [text, setText] = useState(me?.mood?.text || '');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { await api.post('users/mood/', { emoji, text }); onDone(); onClose(); } catch (e) { ask({ type: 'alert', title: errMsg(e, 'Could not save') }); }
    setBusy(false);
  };
  const clear = async () => {
    setBusy(true);
    try { await api.delete('users/mood/'); onDone(); onClose(); } catch (e) { ask({ type: 'alert', title: errMsg(e, 'Could not clear') }); }
    setBusy(false);
  };
  return (
    <Sheet T={T} title="My mood" onClose={onClose}>
      <p style={{ color: 'var(--sub)', fontSize: 13 }}>Friends see it next to your name for 24 hours.</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        {MOODS.map((m) => (
          <button type="button" key={m} onClick={() => setEmoji(m)} style={{ width: 46, height: 46, fontSize: 24, borderRadius: 14, border: emoji === m ? '2px solid var(--accent)' : '2px solid transparent', background: 'rgba(127,127,127,.15)' }}>{m}</button>
        ))}
      </div>
      <input className="sc-field" placeholder="Feeling… (optional)" value={text} maxLength={40} onChange={(e) => setText(e.target.value)} />
      <button type="button" className="sc-btn" style={{ width: '100%', marginTop: 12 }} disabled={busy || (!emoji && !text.trim())} onClick={save}>Set mood</button>
      {me?.mood && <button type="button" className="sc-btn ghost" style={{ width: '100%', marginTop: 8 }} disabled={busy} onClick={clear}>Clear mood</button>}
    </Sheet>
  );
}
