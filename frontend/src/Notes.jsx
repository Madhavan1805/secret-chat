import React, { useEffect, useRef, useState } from 'react';
import { BiMusic, BiX, BiPlus } from 'react-icons/bi';
import api from './api';
import Avatar from './Avatar';
import { Sheet } from './ui';
import { errMsg, getPicUrl } from './config';
import SongPicker from './SongPicker';

const MAX = 60;

function Bars() {
  return <span className="nt-bars" aria-hidden><i /><i /><i /></span>;
}

function Bubble({ note, mine, playing }) {
  return (
    <span className={`nt-bubble${mine ? ' mine' : ''}`}>
      {(note.music_file || note.music_url) && (
        <span className="nt-song">
          <Bars />
          <span className="nt-st"><b>{note.music_title || 'Song'}</b>{note.music_artist && <small>{note.music_artist}</small>}</span>
          {playing && <span className="nt-playing">playing</span>}
        </span>
      )}
      {note.text && <span className="nt-text">{note.text}</span>}
    </span>
  );
}

// the row of notes above the chat list (Instagram style)
export function NotesStrip({ T, me, notes, friends, onEditMine }) {
  const audioRef = useRef(null);
  const [playingId, setPlayingId] = useState(null);

  useEffect(() => () => { if (audioRef.current) audioRef.current.pause(); }, []);

  const stop = () => { if (audioRef.current) audioRef.current.pause(); setPlayingId(null); };
  const toggle = (n) => {
    const src = n.music_file || n.music_url;
    if (!src) return;
    if (playingId === n.user_id) { stop(); return; }
    if (audioRef.current) audioRef.current.pause();
    const a = new Audio(n.music_url || getPicUrl(n.music_file));
    a.onended = () => setPlayingId(null);
    audioRef.current = a;
    setPlayingId(n.user_id);
    const p = a.play(); if (p && p.catch) p.catch(() => setPlayingId(null));
  };

  const list = (notes.friends || [])
    .map((n) => ({ n, f: friends.find((x) => x.id === n.user_id) }))
    .filter((x) => x.f)
    .sort((a, b) => new Date(b.n.created_at) - new Date(a.n.created_at));

  return (
    <div className="nt-strip hide-scroll">
      <button type="button" className="nt-item" onClick={onEditMine} aria-label={notes.mine ? 'Edit your note' : 'Share a note'}>
        <span className="nt-cell">
          {notes.mine
            ? <Bubble note={notes.mine} mine />
            : <span className="nt-bubble ghost"><BiPlus /> Share a note</span>}
          <Avatar src={me?.profile_picture} name={me?.username} size={64} T={T} />
        </span>
        <span className="nt-name">Your note</span>
      </button>
      {list.map(({ n, f }) => (
        <button type="button" key={n.user_id} className="nt-item" onClick={() => toggle(n)} aria-label={`${f.username}'s note`}>
          <span className="nt-cell">
            <Bubble note={n} playing={playingId === n.user_id} />
            <Avatar src={f.profile_picture} name={f.username} size={64} T={T} />
          </span>
          <span className="nt-name">{f.username}</span>
        </button>
      ))}
    </div>
  );
}

// write / edit / delete my note
export function NoteSheet({ T, current, onClose, onSaved }) {
  const [text, setText] = useState(current?.text || '');
  const [song, setSong] = useState(null);                  // newly chosen: { url | file, title, artist, art }
  const [picker, setPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const save = async () => {
    const t = text.trim();
    if (!t && !song) { setErr('Write something or add a song'); return; }
    setBusy(true); setErr('');
    try {
      const fd = new FormData();
      fd.append('text', t);
      if (song) {
        if (song.file) fd.append('music_file', song.file); else fd.append('music_url', song.url);
        fd.append('music_title', song.title || '');
        fd.append('music_artist', song.artist || '');
      }
      await api.post('notes/', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      onSaved(); onClose();
    } catch (e) { setErr(errMsg(e, 'Could not share note')); }
    setBusy(false);
  };

  const remove = async () => {
    setBusy(true);
    try { await api.delete('notes/'); onSaved(); onClose(); } catch (e) { setErr(errMsg(e, 'Could not delete')); }
    setBusy(false);
  };

  const hadSong = !!(current?.music_file || current?.music_url) && !song;

  return (
    <Sheet T={T} title="Your note" onClose={onClose}>
      <p style={{ color: 'var(--sub)', fontSize: 13.5, margin: '0 4px 12px', lineHeight: 1.5 }}>Friends see it above your photo for 24 hours.</p>
      <div className="nt-compose">
        <textarea className="sc-field" style={{ height: 'auto', minHeight: 86, padding: '12px 16px', resize: 'none' }} rows={3} maxLength={MAX}
          placeholder="What is on your mind?" value={text} onChange={(e) => setText(e.target.value.replace(/\n/g, ' '))} aria-label="Note text" />
        <span className="nt-count">{text.length}/{MAX}</span>
      </div>

      {song ? (
        <div className="nt-pick">
          {song.art ? <img src={song.art} alt="" width={44} height={44} style={{ borderRadius: 10 }} /> : <BiMusic aria-hidden />}
          <div className="nt-pick-f" style={{ color: 'var(--text)', fontSize: 14 }}>
            <b style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{song.title}</b>
            <small style={{ color: 'var(--sub)' }}>{song.artist}</small>
          </div>
          <button type="button" className="sc-dots" onClick={() => setSong(null)} aria-label="Remove song"><BiX /></button>
        </div>
      ) : (
        <>
          {hadSong && <p style={{ color: 'var(--sub)', fontSize: 12.5, margin: '4px 4px 0' }}>Current song: {current.music_title || 'Song'}. Saving without picking a song removes it.</p>}
          <button type="button" className="sc-btn ghost" style={{ width: '100%', marginTop: 12 }} onClick={() => setPicker(true)}><BiMusic /> {hadSong ? 'Change song' : 'Add a song'}</button>
        </>
      )}

      {err && <div className="text-danger small" style={{ margin: '10px 4px 0' }}>{err}</div>}

      <button type="button" className="sc-btn" style={{ width: '100%', marginTop: 16 }} disabled={busy} onClick={save}>{busy ? 'Sharing…' : 'Share note'}</button>
      {current && <button type="button" className="sc-btn ghost" style={{ width: '100%', marginTop: 10, color: '#f87171' }} disabled={busy} onClick={remove}>Delete note</button>}

      {picker && <SongPicker T={T} onClose={() => setPicker(false)} onPick={(s) => { setSong(s); setPicker(false); }} />}
    </Sheet>
  );
}
