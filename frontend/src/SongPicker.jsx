import React, { useEffect, useRef, useState } from 'react';
import { BiSearch, BiPlay, BiPause, BiMusic, BiUpload } from 'react-icons/bi';
import api from './api';
import { Sheet } from './ui';
import { errMsg } from './config';
import ClipStep from './ClipStep';

// "Artist - Song.mp3" -> { artist, title }
export function parseSongFile(file) {
  const base = (file.name || '').replace(/\.[^.]+$/, '').replace(/_/g, ' ').trim();
  const i = base.indexOf(' - ');
  if (i > 0) return { artist: base.slice(0, i).trim().slice(0, 60), title: base.slice(i + 3).trim().slice(0, 80) };
  return { artist: '', title: base.slice(0, 80) || 'Song' };
}

// Search a song (30 second previews) or upload an audio file from the phone.
// onPick({ url, title, artist, art })  or  onPick({ file, title, artist })
export default function SongPicker({ T, onPick, onClose, defaultLen = 30 }) {
  const [picked, setPicked] = useState(null);          // chosen song, now picking the part of it
  const [q, setQ] = useState('');
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [playing, setPlaying] = useState(null);
  const audioRef = useRef(null);
  const seq = useRef(0);

  const stop = () => { if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; } setPlaying(null); };
  useEffect(() => stop, []);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setRows([]); setErr(''); return undefined; }
    const my = ++seq.current;
    const t = setTimeout(async () => {
      setBusy(true); setErr('');
      try {
        const r = await api.get('music/search/', { params: { q: term } });
        if (my === seq.current) setRows(Array.isArray(r.data) ? r.data : []);
      } catch (e) { if (my === seq.current) { setRows([]); setErr(errMsg(e, 'Song search failed')); } }
      if (my === seq.current) setBusy(false);
    }, 400);
    return () => clearTimeout(t);
  }, [q]);

  const preview = (row) => {
    if (playing === row.id) { stop(); return; }
    stop();
    const a = new Audio(row.url);
    a.onended = () => setPlaying(null);
    audioRef.current = a;
    setPlaying(row.id);
    const p = a.play(); if (p && p.catch) p.catch(() => setPlaying(null));
  };

  const choose = (row) => { stop(); setPicked({ url: row.url, title: row.title, artist: row.artist, art: row.art }); };

  const pickFile = (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    if (f.size > 12 * 1024 * 1024) { setErr('Song is too big (max 12 MB)'); return; }
    stop();
    setPicked({ file: f, ...parseSongFile(f) });
  };

  if (picked) return <ClipStep T={T} pick={picked} defaultLen={defaultLen} onBack={() => setPicked(null)} onDone={onPick} />;

  return (
    <Sheet T={T} title="Add song" onClose={() => { stop(); onClose(); }}>
      <label className="sc-search" style={{ margin: '0 0 12px' }}>
        <BiSearch style={{ fontSize: 20 }} />
        <input type="text" autoFocus placeholder="Search songs or artists" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search songs" />
      </label>

      {busy && <p style={{ color: 'var(--sub)', textAlign: 'center', fontSize: 13.5 }}>Searching…</p>}
      {err && <p className="text-danger small" style={{ textAlign: 'center' }}>{err}</p>}
      {!busy && !err && q.trim().length >= 2 && rows.length === 0 && <p style={{ color: 'var(--sub)', textAlign: 'center', fontSize: 13.5 }}>No songs found</p>}
      {!q.trim() && <p style={{ color: 'var(--sub)', textAlign: 'center', fontSize: 13.5, margin: '24px 0' }}><BiMusic style={{ fontSize: 28, display: 'block', margin: '0 auto 6px' }} />Search any song. Friends hear a 30 second clip.</p>}

      <div className="sp-list">
        {rows.map((row) => (
          <div key={row.id} className="sp-row">
            <button type="button" className="sp-main" onClick={() => choose(row)} aria-label={`Use ${row.title} by ${row.artist}`}>
              {row.art ? <img src={row.art} alt="" width={46} height={46} /> : <span className="sp-art"><BiMusic /></span>}
              <span className="sp-txt"><b>{row.title}</b><small>{row.artist}</small></span>
            </button>
            <button type="button" className="sc-iconbtn" onClick={() => preview(row)} aria-label={playing === row.id ? 'Pause preview' : 'Play preview'}>{playing === row.id ? <BiPause /> : <BiPlay />}</button>
          </div>
        ))}
      </div>

      <label htmlFor="song-file" className="sc-btn ghost" style={{ width: '100%', marginTop: 16 }}><BiUpload /> Upload from phone instead</label>
      <input id="song-file" type="file" accept="audio/*" className="d-none" onChange={pickFile} />
    </Sheet>
  );
}
