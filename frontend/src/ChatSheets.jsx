import React, { useEffect, useRef, useState, useCallback } from 'react';
import { BiImage, BiFile, BiLink, BiPlus, BiX, BiCamera } from 'react-icons/bi';
import api from './api';
import Avatar from './Avatar';
import { Sheet, Choice, SettingRow, Seal } from './ui';
import MediaViewer from './MediaViewer';
import { getPicUrl, errMsg, formatSize, formatListTime, formatTime, asList, shortFile } from './config';

// ------------------------------------------------------------------ media gallery
export function GallerySheet({ T, chatId, onClose }) {
  const [tab, setTab] = useState('media');
  const [data, setData] = useState(null);
  const [viewer, setViewer] = useState(null);
  useEffect(() => { api.get(`messages/gallery/?chat_id=${chatId}`).then((r) => setData(r.data)).catch(() => setData({ media: [], docs: [], links: [] })); }, [chatId]);
  const list = data ? data[tab] : [];
  return (
    <Sheet T={T} title="Media, docs and links" onClose={onClose}>
      <Choice value={tab} options={[['media', 'Media'], ['docs', 'Docs'], ['links', 'Links']]} onChange={setTab} />
      {!data ? <p style={{ color: 'var(--sub)', marginTop: 20 }}>Loading…</p> : list.length === 0 ? (
        <div className="sc-empty">{tab === 'media' ? <BiImage style={{ fontSize: 36 }} /> : tab === 'docs' ? <BiFile style={{ fontSize: 36 }} /> : <BiLink style={{ fontSize: 36 }} />}<b>Nothing here yet</b>Shared {tab} will show up in this list.</div>
      ) : tab === 'media' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4, marginTop: 14 }}>
          {list.map((m) => (
            <button key={m.id} type="button" onClick={() => setViewer(m)} aria-label="Open media" style={{ position: 'relative', aspectRatio: '1', border: 0, padding: 0, borderRadius: 10, overflow: 'hidden', background: 'var(--raised)' }}>
              {m.message_type === 'video'
                ? <video src={getPicUrl(m.file_url)} muted preload="metadata" style={{ width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }} />
                : <img src={getPicUrl(m.file_url)} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
              {m.message_type === 'video' && <span style={{ position: 'absolute', right: 6, bottom: 4, color: '#fff', fontSize: 14 }}>▶</span>}
            </button>
          ))}
        </div>
      ) : tab === 'docs' ? (
        <div className="sc-set-group" style={{ marginTop: 14 }}>
          {list.map((m) => (
            <a key={m.id} className="sc-set" href={getPicUrl(m.file_url)} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
              <span className="ico"><BiFile /></span>
              <span className="txt"><b>{m.file_name || 'Document'}</b><small>{formatSize(m.file_size)} · {formatListTime(m.created_at)}</small></span>
            </a>
          ))}
        </div>
      ) : (
        <div className="sc-set-group" style={{ marginTop: 14 }}>
          {list.map((l, i) => (
            <a key={`${l.id}-${i}`} className="sc-set" href={l.url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
              <span className="ico"><BiLink /></span>
              <span className="txt"><b style={{ wordBreak: 'break-all', fontFamily: 'var(--font-body)', fontWeight: 500 }}>{l.url}</b><small>{l.sender_name} · {formatListTime(l.created_at)}</small></span>
            </a>
          ))}
        </div>
      )}
      {viewer && <MediaViewer src={getPicUrl(viewer.file_url)} type={viewer.message_type === 'video' ? 'video' : 'image'} name={viewer.file_name} onClose={() => setViewer(null)} />}
    </Sheet>
  );
}

// ------------------------------------------------------------------ message info
export function InfoSheet({ T, msg, isGroup, participants, onClose }) {
  const seenIds = msg.read_by || [];
  const seen = msg.read_by_names || [];
  const waiting = (participants || []).filter((p) => p.id !== msg.sender && !seenIds.includes(p.id));
  const statusText = msg.status === 'read' ? 'Read' : msg.status === 'delivered' ? 'Delivered' : 'Sent';
  const preview = msg.content ? msg.content.replace('[VIEW_ONCE]', '') : (msg.file_name || 'Attachment');
  return (
    <Sheet T={T} title="Message info" onClose={onClose}>
      <div className="sc-bubble mine" style={{ maxWidth: '100%', marginBottom: 18, borderRadius: 20 }}>{preview.length > 300 ? `${preview.slice(0, 300)}…` : preview}</div>
      <div className="sc-set-group">
        <SettingRow title="Sent" sub={new Date(msg.created_at).toLocaleString()} />
        {!isGroup && <SettingRow title="Status" sub={statusText} />}
        {msg.edited_at && <SettingRow title="Edited" sub={new Date(msg.edited_at).toLocaleString()} />}
      </div>
      {isGroup && (
        <>
          <label className="sc-label">Seen by ({seen.length})</label>
          <div className="sc-set-group">
            {seen.length === 0 && <p style={{ margin: 0, padding: 16, color: 'var(--sub)' }}>Nobody yet</p>}
            {seen.map((u) => <SettingRow key={u.id} title={u.username} />)}
          </div>
          {waiting.length > 0 && (
            <>
              <label className="sc-label">Not seen yet ({waiting.length})</label>
              <div className="sc-set-group">{waiting.map((u) => <SettingRow key={u.id} title={u.username} />)}</div>
            </>
          )}
        </>
      )}
    </Sheet>
  );
}

// ------------------------------------------------------------------ create a poll
export function PollSheet({ T, onClose, onCreate }) {
  const [q, setQ] = useState('');
  const [opts, setOpts] = useState(['', '']);
  const [multiple, setMultiple] = useState(false);
  const [busy, setBusy] = useState(false);
  const clean = opts.map((o) => o.trim()).filter(Boolean);
  const ok = q.trim() && clean.length >= 2;
  const submit = async () => {
    setBusy(true);
    const done = await onCreate({ question: q.trim(), options: clean, multiple });
    setBusy(false);
    if (done) onClose();
  };
  return (
    <Sheet T={T} title="New poll" onClose={onClose}>
      <label className="sc-label">Question</label>
      <input className="sc-field" placeholder="Where do we eat tonight?" value={q} onChange={(e) => setQ(e.target.value)} maxLength={300} autoFocus />
      <label className="sc-label">Options</label>
      {opts.map((o, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <input className="sc-field" placeholder={`Option ${i + 1}`} value={o} maxLength={100} onChange={(e) => setOpts((p) => p.map((x, k) => (k === i ? e.target.value : x)))} />
          {opts.length > 2 && <button type="button" className="sc-iconbtn" aria-label="Remove option" onClick={() => setOpts((p) => p.filter((_, k) => k !== i))}><BiX /></button>}
        </div>
      ))}
      {opts.length < 10 && <button type="button" className="sc-btn ghost" onClick={() => setOpts((p) => [...p, ''])}><BiPlus /> Add option</button>}
      <div className="sc-set-group" style={{ marginTop: 18 }}>
        <SettingRow title="Allow multiple answers" right={<button type="button" role="switch" aria-checked={multiple} className="sc-switch" onClick={() => setMultiple((v) => !v)} />} />
      </div>
      <button type="button" className="sc-btn" style={{ width: '100%' }} disabled={!ok || busy} onClick={submit}>Send poll</button>
    </Sheet>
  );
}

// ------------------------------------------------------------------ group info + admin tools
export function GroupSheet({ T, meta, me, onClose, onChanged, ask }) {
  const [friends, setFriends] = useState([]);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState(meta.group_name || '');
  const [desc, setDesc] = useState(meta.group_description || '');
  const [dirty, setDirty] = useState(false);
  const photoRef = useRef(null);
  const isAdmin = !!meta.is_admin;
  const admins = new Set(meta.admin_ids || []);
  const members = meta.participants || [];
  const call = async (fn, fail) => { try { await fn(); await onChanged(); } catch (e) { ask({ type: 'alert', title: errMsg(e, fail) }); } };

  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      try {
        const [u, r] = await Promise.all([api.get('users/'), api.get('requests/')]);
        const ids = new Set(asList(r.data).filter((x) => x.status === 'accepted').map((x) => (x.sender === me.id ? x.receiver : x.sender)));
        setFriends(asList(u.data).filter((x) => ids.has(x.id)));
      } catch (e) { /* ignore */ }
    })();
  }, [isAdmin, me.id]);

  const save = () => call(async () => {
    const fd = new FormData();
    fd.append('chat_id', meta.chat_id); fd.append('group_name', name); fd.append('group_description', desc);
    await api.post('groups/update/', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    setDirty(false);
  }, 'Could not save');
  const upload = (e) => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    call(async () => {
      const fd = new FormData(); fd.append('chat_id', meta.chat_id); fd.append('photo', shortFile(f));
      await api.post('groups/update/', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    }, 'Could not upload');
  };
  const removePhoto = () => call(() => api.post('groups/update/', { chat_id: meta.chat_id, remove_photo: 'true' }), 'Failed');
  const removeMember = async (u) => {
    if (!(await ask({ type: 'confirm', title: `Remove ${u.username}?`, danger: true, okText: 'Remove' }))) return;
    call(() => api.post('groups/members/', { chat_id: meta.chat_id, remove: [u.id] }), 'Failed');
  };
  const setAdmin = (u, make) => call(() => api.post('groups/admins/', { chat_id: meta.chat_id, user_id: u.id, make }), 'Failed');
  const addMember = (u) => call(() => api.post('groups/members/', { chat_id: meta.chat_id, add: [u.id] }), 'Could not add');
  const addable = friends.filter((f) => !members.some((m) => m.id === f.id));

  return (
    <Sheet T={T} title="Group info" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        {meta.group_photo
          ? <Avatar src={meta.group_photo} name={meta.group_name} size={96} T={T} />
          : <Seal size={96} keyhole />}
        {isAdmin && (
          <div style={{ display: 'flex', gap: 8 }}>
            <input ref={photoRef} type="file" accept="image/*" className="d-none" onChange={upload} />
            <button type="button" className="sc-btn ghost" style={{ height: 36, fontSize: 13 }} onClick={() => photoRef.current && photoRef.current.click()}><BiCamera /> Group photo</button>
            {meta.group_photo && <button type="button" className="sc-btn ghost" style={{ height: 36, fontSize: 13 }} onClick={removePhoto}>Remove</button>}
          </div>
        )}
      </div>

      {isAdmin ? (
        <>
          <label className="sc-label">Group name</label>
          <input className="sc-field" value={name} maxLength={60} onChange={(e) => { setName(e.target.value); setDirty(true); }} />
          <label className="sc-label">Description</label>
          <textarea className="sc-field" rows="3" maxLength={500} placeholder="What is this group about?" value={desc} onChange={(e) => { setDesc(e.target.value); setDirty(true); }} />
          {dirty && <button type="button" className="sc-btn" style={{ marginTop: 12, width: '100%' }} disabled={!name.trim()} onClick={save}>Save changes</button>}
          <div className="sc-set-group" style={{ marginTop: 14 }}>
            <SettingRow title="Announcement mode" sub="Only admins can send messages"
              right={<button type="button" role="switch" aria-checked={!!meta.announce_only} className="sc-switch"
                onClick={() => call(() => api.post('groups/update/', { chat_id: meta.chat_id, announce_only: !meta.announce_only }), 'Could not change')} />} />
          </div>
        </>
      ) : (
        <>
          <h2 style={{ textAlign: 'center', fontFamily: 'var(--font-display)', fontSize: 24, margin: '0 0 4px' }}>{meta.group_name}</h2>
          <p style={{ textAlign: 'center', color: 'var(--sub)', margin: '0 12px 8px' }}>{meta.group_description || 'No description'}</p>
        </>
      )}

      <label className="sc-label">{members.length} members</label>
      <div className="sc-set-group">
        {members.map((u) => (
          <div key={u.id} className="sc-set" style={{ cursor: 'default' }}>
            <Avatar name={u.username} size={38} T={T} />
            <span className="txt"><b>{u.username}{u.id === me.id ? ' (you)' : ''}</b>{admins.has(u.id) && <small style={{ color: 'var(--accent)' }}>{u.id === meta.created_by ? 'Creator · admin' : 'Admin'}</small>}</span>
            {isAdmin && u.id !== me.id && u.id !== meta.created_by && (
              <>
                <button type="button" className="sc-btn ghost" style={{ height: 32, fontSize: 12, padding: '0 12px' }} onClick={() => setAdmin(u, !admins.has(u.id))}>{admins.has(u.id) ? 'Remove admin' : 'Make admin'}</button>
                <button type="button" className="sc-iconbtn" style={{ width: 32, height: 32, fontSize: 16 }} aria-label={`Remove ${u.username}`} onClick={() => removeMember(u)}><BiX /></button>
              </>
            )}
          </div>
        ))}
      </div>

      {isAdmin && (
        <>
          <button type="button" className="sc-btn ghost" onClick={() => setAdding((v) => !v)}><BiPlus /> {adding ? 'Hide friends' : 'Add members'}</button>
          {adding && (
            <div className="sc-set-group" style={{ marginTop: 12 }}>
              {addable.length === 0 && <p style={{ margin: 0, padding: 16, color: 'var(--sub)' }}>All your friends are already in this group.</p>}
              {addable.map((u) => (
                <button key={u.id} type="button" className="sc-set" onClick={() => addMember(u)}>
                  <Avatar src={u.profile_picture} name={u.username} size={38} T={T} />
                  <span className="txt"><b>{u.username}</b></span><BiPlus style={{ color: 'var(--accent)', fontSize: 22 }} />
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </Sheet>
  );
}

// ------------------------------------------------------------------ stickers + GIFs
const STICKER_PACKS = {
  Faces: ['😀', '😂', '🥹', '😍', '🥰', '😎', '🤩', '😭', '😡', '🥱', '🤯', '😴', '🤔', '🙄', '😇', '🥳'],
  Hands: ['👍', '👎', '👏', '🙌', '🙏', '💪', '🤝', '✌️', '🤞', '👌', '🫶', '🤙', '👋', '🫡', '🤌', '✋'],
  Love: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '💔', '💘', '💞', '😘', '💋', '🌹', '💐', '🫂', '💍'],
  Fun: ['🔥', '🎉', '🎂', '🍕', '🍔', '☕', '🍿', '🎮', '⚽', '🏏', '🎵', '🚀', '🌈', '⭐', '🐶', '🐱'],
};
const GIPHY_KEY = import.meta.env.VITE_GIPHY_KEY || '';
export const gifsAvailable = !!GIPHY_KEY;

export function StickerPanel({ onSticker, onGif }) {
  const tabs = [...Object.keys(STICKER_PACKS), ...(gifsAvailable ? ['GIF'] : [])];
  const [tab, setTab] = useState(tabs[0]);
  const [q, setQ] = useState('');
  const [gifs, setGifs] = useState([]);
  const [busy, setBusy] = useState(false);
  const timer = useRef(null);

  const loadGifs = useCallback((query) => {
    setBusy(true);
    const url = query
      ? `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_KEY}&q=${encodeURIComponent(query)}&limit=24&rating=pg-13`
      : `https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_KEY}&limit=24&rating=pg-13`;
    fetch(url).then((r) => r.json())
      .then((j) => setGifs((j.data || []).map((g) => ({ id: g.id, thumb: g.images.fixed_width_small?.url || g.images.fixed_width.url, url: g.images.fixed_width.url }))))
      .catch(() => setGifs([])).finally(() => setBusy(false));
  }, []);
  useEffect(() => { if (tab === 'GIF') loadGifs(''); }, [tab, loadGifs]);
  const onQ = (v) => { setQ(v); clearTimeout(timer.current); timer.current = setTimeout(() => loadGifs(v.trim()), 400); };

  return (
    <div style={{ background: 'var(--raised)', borderRadius: 22, padding: 10, border: '1px solid var(--line)' }}>
      <div className="hide-scroll" style={{ display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 8 }}>
        {tabs.map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)} aria-pressed={tab === t}
            style={{ flexShrink: 0, border: 0, borderRadius: 14, padding: '6px 14px', fontWeight: 600, fontSize: 13, background: tab === t ? 'var(--mine)' : 'transparent', color: tab === t ? 'var(--mine-text)' : 'var(--sub)' }}>{t}</button>
        ))}
      </div>
      {tab === 'GIF' ? (
        <>
          <input className="sc-field" style={{ height: 38, marginBottom: 8 }} placeholder="Search GIFs" value={q} onChange={(e) => onQ(e.target.value)} />
          <div className="hide-scroll" style={{ maxHeight: 220, overflowY: 'auto', columns: 3, columnGap: 6 }}>
            {busy && <p style={{ color: 'var(--sub)' }}>Loading…</p>}
            {gifs.map((g) => (
              <button key={g.id} type="button" onClick={() => onGif(g.url)} style={{ display: 'block', width: '100%', border: 0, padding: 0, marginBottom: 6, borderRadius: 10, overflow: 'hidden', background: 'var(--surface)' }}>
                <img src={g.thumb} alt="GIF" loading="lazy" style={{ width: '100%', display: 'block' }} />
              </button>
            ))}
          </div>
          <div style={{ textAlign: 'right', fontSize: 10, color: 'var(--sub)', marginTop: 4 }}>Powered by GIPHY</div>
        </>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
          {STICKER_PACKS[tab].map((s) => (
            <button key={s} type="button" onClick={() => onSticker(s)} style={{ border: 0, background: 'transparent', fontSize: 38, lineHeight: 1.3, borderRadius: 14 }} aria-label={`Send sticker ${s}`}>{s}</button>
          ))}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ @mention suggestions
export function MentionList({ names, query, onPick }) {
  const q = query.toLowerCase();
  const list = names.filter((n) => n.toLowerCase().startsWith(q)).slice(0, 5);
  if (!list.length) return null;
  return (
    <div className="sc-menu" style={{ position: 'absolute', left: 10, right: 10, bottom: '100%', top: 'auto', marginBottom: 6, zIndex: 50 }}>
      {list.map((n) => <button key={n} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => onPick(n)}>@{n}</button>)}
    </div>
  );
}

// ------------------------------------------------------------------ export chat as a .txt file
const describe = (m) => {
  const c = (m.content || '').replace('[VIEW_ONCE]', '');
  if (m.message_type === 'poll') return `[Poll] ${m.poll?.question || ''}`;
  if (c.startsWith('[STICKER]')) return `[Sticker] ${c.slice(9)}`;
  if (c.startsWith('[GIF]')) return '[GIF]';
  if (m.message_type === 'image') return `[Photo]${c ? ` ${c}` : ''}`;
  if (m.message_type === 'video') return `[Video]${c ? ` ${c}` : ''}`;
  if (m.message_type === 'audio' || m.voice_note) return '[Voice message]';
  if (m.message_type === 'document') return `[Document] ${m.file_name || ''}`;
  if (m.message_type === 'location') return `[Location] ${c}`;
  return c;
};

export function exportChatText(title, messages) {
  const lines = [`Chatzy export: ${title}`, `Exported ${new Date().toLocaleString()}`, ''];
  messages.filter((m) => m.message_type !== 'system' || m.content).forEach((m) => {
    const d = new Date(m.created_at);
    const stamp = `${d.toLocaleDateString('en-GB')} ${formatTime(m.created_at)}`;
    lines.push(m.message_type === 'system' ? `[${stamp}] ${m.content}` : `[${stamp}] ${m.sender_name}: ${describe(m)}`);
  });
  const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${title.replace(/[^\w.-]+/g, '_')}_chat.txt`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
