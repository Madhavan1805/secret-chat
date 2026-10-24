import React, { useState, useEffect, useRef } from 'react';
import { BiImageAdd, BiX, BiTrash, BiBellOff, BiBell, BiChevronRight, BiShow, BiSend } from 'react-icons/bi';
import api from './api';
import Avatar from './Avatar';
import { getPicUrl, errMsg, formatListTime, shortFile } from './config';

const IMAGE_MS = 5000;           // how long a photo stays on screen
const TICK_MS = 50;
const QUICK = ['❤️', '😂', '😮', '😢', '🙏', '🔥'];
const CLOSE_GREEN = '#22c55e';
const readIds = (k) => { try { const v = JSON.parse(localStorage.getItem(k) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } };
const saveIds = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } };
const AUDIENCES = [
  { key: 'all', label: 'My friends', icon: '👥', color: null },
  { key: 'except', label: 'My friends except…', icon: '🚫', color: '#f59e0b' },
  { key: 'only', label: 'Only share with…', icon: '🎯', color: '#38bdf8' },
  { key: 'close', label: 'Close friends', icon: '💚', color: CLOSE_GREEN },
];

// group the flat status list -> one entry per person, oldest status first
const groupByUser = (list) => {
  const map = new Map();
  list.forEach((s) => {
    if (!map.has(s.user)) map.set(s.user, { user: s.user, username: s.username, profile_picture: s.profile_picture, items: [] });
    map.get(s.user).items.push(s);
  });
  const groups = [...map.values()];
  groups.forEach((g) => {
    g.items.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    g.latest = g.items[g.items.length - 1];
    g.allViewed = g.items.every((i) => i.viewed_by_me);
    g.hasClose = g.items.some((i) => i.privacy === 'close');
  });
  return groups;
};

function Ring({ color, children }) {
  return (
    <div style={{ padding: 3, borderRadius: '50%', background: color, lineHeight: 0 }}>
      <div style={{ padding: 2, borderRadius: '50%', background: 'var(--panel)' }}>{children}</div>
    </div>
  );
}

function StatusTab({ T, rowBg, me, currentUsername, friends, statuses, refreshStatuses }) {
  const meId = me?.id;

  // upload
  const [uploadFile, setUploadFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [caption, setCaption] = useState('');
  const [privacy, setPrivacy] = useState('all');
  const [posting, setPosting] = useState(false);
  const [uploadError, setUploadError] = useState('');

  // close friends
  const [mutedIds, setMutedIds] = useState([]);
  const [showMuted, setShowMuted] = useState(false);
  const [closeIds, setCloseIds] = useState([]);
  const [closeOpen, setCloseOpen] = useState(false);   // holds the picker mode: 'close' | 'except' | 'only' | false
  const [exceptIds, setExceptIds] = useState(() => readIds('sc_status_except'));
  const [onlyIds, setOnlyIds] = useState(() => readIds('sc_status_only'));
  const [closeDraft, setCloseDraft] = useState([]);
  const [closeError, setCloseError] = useState('');

  // viewer
  const [viewer, setViewer] = useState(null);      // { userId, index, seq }
  const [progress, setProgress] = useState(0);
  const [replyText, setReplyText] = useState('');
  const [replyFocus, setReplyFocus] = useState(false);
  const [showViewers, setShowViewers] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const [hearts, setHearts] = useState([]);

  const videoRef = useRef(null);
  const viewedSent = useRef(new Set());
  const nextRef = useRef(() => {});

  const flash = (m) => { setToast(m); setTimeout(() => setToast(''), 1600); };

  // ---------------------------------------------------------- derived data
  const groups = groupByUser(statuses);
  const myGroup = groups.find((g) => g.user === meId) || null;
  const allOthers = groups
    .filter((g) => g.user !== meId)
    .sort((a, b) => (Number(a.allViewed) - Number(b.allViewed)) || (new Date(b.latest.created_at) - new Date(a.latest.created_at)));
  const others = allOthers.filter((g) => !mutedIds.includes(g.user));
  const mutedGroups = allOthers.filter((g) => mutedIds.includes(g.user));
  const myTotalViews = myGroup ? myGroup.items.reduce((a, i) => a + (i.view_count || 0), 0) : 0;

  const vGroup = viewer ? groups.find((g) => g.user === viewer.userId) : null;
  const items = vGroup ? vGroup.items : [];
  const idx = Math.min(viewer?.index || 0, Math.max(items.length - 1, 0));
  const st = vGroup ? items[idx] : null;
  const isMine = !!st && st.user === meId;
  const paused = replyFocus || showViewers;

  // ---------------------------------------------------------- close friends
  const loadClose = async () => {
    try {
      const r = await api.get('statuses/close_friends/');
      setCloseIds(Array.isArray(r.data?.ids) ? r.data.ids : []);
    } catch (e) { /* ignore */ }
  };
  useEffect(() => { loadClose(); }, []);

  const loadMuted = async () => {
    try { const r = await api.get('status-mutes/'); setMutedIds(Array.isArray(r.data?.ids) ? r.data.ids : []); } catch (e) { /* ignore */ }
  };
  useEffect(() => { loadMuted(); }, []);
  const toggleMute = async (g) => {
    try {
      const r = await api.post('status-mutes/', { user_id: g.user });
      setMutedIds(Array.isArray(r.data?.ids) ? r.data.ids : []);
      flash(mutedIds.includes(g.user) ? `Showing ${g.username}'s updates again` : `Muted ${g.username}'s updates`);
    } catch (e) { flash(errMsg(e, 'Failed')); }
  };

  const listFor = (mode) => (mode === 'except' ? exceptIds : mode === 'only' ? onlyIds : closeIds);
  const openClose = (mode = 'close') => { setCloseDraft(listFor(mode)); setCloseError(''); setCloseOpen(mode); };
  const toggleDraft = (id) => setCloseDraft((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const saveClose = async () => {
    if (closeOpen === 'except') { setExceptIds(closeDraft); saveIds('sc_status_except', closeDraft); setCloseOpen(false); return; }
    if (closeOpen === 'only') { setOnlyIds(closeDraft); saveIds('sc_status_only', closeDraft); setCloseOpen(false); return; }
    try {
      const r = await api.post('statuses/close_friends/', { ids: closeDraft });
      setCloseIds(Array.isArray(r.data?.ids) ? r.data.ids : []);
      setCloseOpen(false);
    } catch (e) { setCloseError(errMsg(e, 'Could not save list')); }
  };

  // ---------------------------------------------------------- upload
  const pickFile = (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setUploadFile(f);
    setPreviewUrl(URL.createObjectURL(f));
    setCaption('');
    setPrivacy('all');
    setUploadError('');
    loadClose();
  };

  const cancelUpload = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setUploadFile(null);
    setPreviewUrl('');
    setCaption('');
    setUploadError('');
  };

  const postStatus = async () => {
    if (!uploadFile || posting) return;
    if (privacy === 'close' && closeIds.length === 0) { openClose('close'); return; }
    if (privacy === 'only' && onlyIds.length === 0) { openClose('only'); return; }
    setPosting(true);
    setUploadError('');
    const fd = new FormData();
    fd.append('media_file', shortFile(uploadFile));
    fd.append('caption', caption.trim());
    fd.append('privacy', privacy);
    if (privacy === 'except' || privacy === 'only') (privacy === 'except' ? exceptIds : onlyIds).forEach((id) => fd.append('privacy_ids', id));
    try {
      await api.post('statuses/', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      cancelUpload();
      await refreshStatuses();
    } catch (e) { setUploadError(errMsg(e, 'Failed to upload status')); }
    setPosting(false);
  };

  // ---------------------------------------------------------- viewer navigation
  const closeViewer = () => { setViewer(null); setShowViewers(false); setReplyText(''); setReplyFocus(false); setProgress(0); };

  const openGroup = (g, seq) => {
    const firstUnseen = g.user === meId ? 0 : g.items.findIndex((i) => !i.viewed_by_me);
    setProgress(0);
    setViewer({ userId: g.user, index: firstUnseen < 0 ? 0 : firstUnseen, seq: seq || [] });
  };

  const next = () => {
    if (!viewer || !st) return;
    setProgress(0);
    if (idx < items.length - 1) { setViewer({ ...viewer, index: idx + 1 }); return; }
    const seq = viewer.seq || [];
    const pos = seq.indexOf(viewer.userId);
    const nid = pos >= 0 ? seq[pos + 1] : undefined;
    const ng = nid !== undefined ? groups.find((g) => g.user === nid) : null;
    if (ng) {
      const fu = ng.items.findIndex((i) => !i.viewed_by_me);
      setViewer({ userId: ng.user, index: fu < 0 ? 0 : fu, seq });
    } else closeViewer();
  };
  nextRef.current = next;

  const prev = () => {
    setProgress(0);
    if (viewer && idx > 0) setViewer({ ...viewer, index: idx - 1 });
  };

  // viewer closes by itself if the status disappears (deleted / expired)
  useEffect(() => { if (viewer && !vGroup) closeViewer(); }, [viewer?.userId, !!vGroup]);

  // reset when the story changes
  useEffect(() => { setProgress(0); setReplyText(''); setShowViewers(false); }, [st?.id]);

  // photo timer
  useEffect(() => {
    if (!st || paused || st.media_type === 'video') return undefined;
    const t = setInterval(() => setProgress((p) => p + (100 * TICK_MS) / IMAGE_MS), TICK_MS);
    return () => clearInterval(t);
  }, [st?.id, st?.media_type, paused]);

  useEffect(() => {
    if (progress >= 100 && st && st.media_type !== 'video') nextRef.current();
  }, [progress]);

  // pause / play video together with the reply box
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (paused) v.pause(); else { const p = v.play(); if (p && p.catch) p.catch(() => {}); }
  }, [paused, st?.id]);

  // tell the server I saw it
  useEffect(() => {
    if (!st || st.user === meId || st.viewed_by_me || viewedSent.current.has(st.id)) return;
    viewedSent.current.add(st.id);
    api.post(`statuses/${st.id}/view/`).then(() => refreshStatuses()).catch(() => {});
  }, [st?.id]);

  // ---------------------------------------------------------- viewer actions
  const burst = () => {
    const id = `${Date.now()}-${Math.random()}`;
    const batch = Array.from({ length: 18 }, (_, i) => ({
      k: `${id}-${i}`,
      dx: -150 + Math.random() * 180,            // drift left / right of the like button
      rise: -(260 + Math.random() * 300),        // how far it floats up
      s: 0.8 + Math.random() * 1.1,
      r: `${Math.round(Math.random() * 60 - 30)}deg`,
      d: Math.random() * 0.35,
      t: 1.3 + Math.random() * 0.9,
      size: 20 + Math.round(Math.random() * 18),
    }));
    setHearts((h) => [...h, ...batch]);
    setTimeout(() => setHearts((h) => h.filter((x) => !batch.includes(x))), 2800);
  };

  const doLike = async () => {
    if (!st || busy) return;
    if (!st.liked_by_me) burst();                // hearts pour out the moment you like, not after the server answers
    setBusy(true);
    try { await api.post(`statuses/${st.id}/like/`); await refreshStatuses(); } catch (e) { flash(errMsg(e, 'Failed')); }
    setBusy(false);
  };

  const doReact = async (emoji) => {
    if (!st || busy) return;
    if (emoji === '❤️' && st.my_reaction !== '❤️') burst();
    setBusy(true);
    try { await api.post(`statuses/${st.id}/react/`, { emoji }); await refreshStatuses(); } catch (e) { flash(errMsg(e, 'Failed')); }
    setBusy(false);
  };

  const doReply = async () => {
    const text = replyText.trim();
    if (!st || !text || busy) return;
    setBusy(true);
    try {
      await api.post(`statuses/${st.id}/reply/`, { content: text });
      setReplyText('');
      flash('Reply sent ✅');
    } catch (e) { flash(errMsg(e, 'Reply failed')); }
    setBusy(false);
  };

  const doDelete = async () => {
    if (!st) return;
    // eslint-disable-next-line no-alert
    if (!window.confirm('Delete this status?')) return;
    try {
      await api.delete(`statuses/${st.id}/`);
      await refreshStatuses();
      if (items.length <= 1) closeViewer();
    } catch (e) { flash(errMsg(e, 'Failed')); }
  };

  // ---------------------------------------------------------- UI helpers
  const ringColor = (g) => {
    if (g.allViewed) return 'var(--line)';
    return g.hasClose ? CLOSE_GREEN : 'var(--seal)';
  };

  const overlay = { position: 'fixed', top: 0, left: 0, width: '100%', height: 'var(--app-height, 100dvh)', zIndex: 9500 };

  // ======================================================================= UI
  return (
    <div>
      {toast && !viewer && <div className="sc-chip-row accent" role="status">{toast}</div>}

      {/* ---------------- my status row ---------------- */}
      <div className="sc-row" role="button" tabIndex={0} onClick={() => myGroup && openGroup(myGroup, [])} style={{ cursor: myGroup ? 'pointer' : 'default' }}>
        {myGroup ? (
          <Ring color={myGroup.hasClose ? CLOSE_GREEN : 'var(--seal)'}><Avatar src={me?.profile_picture} name={currentUsername} size={46} T={T} /></Ring>
        ) : (
          <Avatar src={me?.profile_picture} name={currentUsername} size={58} T={T} />
        )}
        <div className="sc-row-main">
          <h3 className="sc-row-name"><span className="t">My status</span></h3>
          <span className="sc-row-sub">
            {myGroup
              ? `${myGroup.items.length} update${myGroup.items.length > 1 ? 's' : ''} · ${formatListTime(myGroup.latest.created_at)} · ${myTotalViews} view${myTotalViews === 1 ? '' : 's'}`
              : 'Share a photo or video for 24 hours'}
          </span>
        </div>
        <label htmlFor="status-upload" className="sc-iconbtn on" style={{ margin: 0, cursor: 'pointer' }} title="Add status" onClick={(e) => e.stopPropagation()} aria-label="Add status"><BiImageAdd /></label>
        <input type="file" id="status-upload" className="d-none" accept="image/*,video/*" onChange={pickFile} />
      </div>

      <button type="button" className="sc-btn ghost" style={{ width: '100%', margin: '4px 0 6px', color: CLOSE_GREEN }} onClick={openClose}>
        Close friends ({closeIds.length})
      </button>

      {/* ---------------- friends' statuses (one row per person) ---------------- */}
      <div className="sc-section">Recent updates</div>
      {others.length > 0 ? (
        others.map((g) => (
          <div key={g.user} className="sc-row" role="button" tabIndex={0} onClick={() => openGroup(g, others.map((o) => o.user))}>
            <Ring color={ringColor(g)}><Avatar src={g.profile_picture} name={g.username} size={46} T={T} /></Ring>
            <div className="sc-row-main">
              <h3 className="sc-row-name" style={{ opacity: g.allViewed ? 0.7 : 1 }}><span className="t">{g.username}</span>{g.hasClose && <span title="Close friends" style={{ color: CLOSE_GREEN, fontSize: 12 }}>close</span>}</h3>
              <span className="sc-row-sub" style={!g.allViewed ? { color: 'var(--accent)' } : undefined}>
                {g.items.length} update{g.items.length > 1 ? 's' : ''} · {formatListTime(g.latest.created_at)}
              </span>
            </div>
            <button type="button" className="sc-dots" aria-label={`Mute ${g.username}'s status`} title="Mute updates" onClick={(e) => { e.stopPropagation(); toggleMute(g); }}><BiBellOff /></button>
          </div>
        ))
      ) : (
        <div className="sc-empty"><b>No new updates</b>When friends post a status, it shows up here.</div>
      )}

      {mutedGroups.length > 0 && (
        <>
          <button type="button" className="sc-section" style={{ border: 0, background: 'transparent', display: 'flex', alignItems: 'center', gap: 4, width: '100%', textAlign: 'left' }} onClick={() => setShowMuted((v) => !v)}>
            Muted updates ({mutedGroups.length}) <BiChevronRight style={{ transform: showMuted ? 'rotate(90deg)' : 'none', transition: 'transform .2s' }} />
          </button>
          {showMuted && mutedGroups.map((g) => (
            <div key={g.user} className="sc-row" role="button" tabIndex={0} style={{ opacity: 0.75 }} onClick={() => openGroup(g, mutedGroups.map((o) => o.user))}>
              <Ring color="var(--line)"><Avatar src={g.profile_picture} name={g.username} size={46} T={T} /></Ring>
              <div className="sc-row-main"><h3 className="sc-row-name"><span className="t">{g.username}</span></h3><span className="sc-row-sub">{g.items.length} update{g.items.length > 1 ? 's' : ''}</span></div>
              <button type="button" className="sc-dots" aria-label={`Unmute ${g.username}'s status`} title="Unmute" onClick={(e) => { e.stopPropagation(); toggleMute(g); }}><BiBell /></button>
            </div>
          ))}
        </>
      )}

      {/* ---------------- UPLOAD PREVIEW ---------------- */}
      {uploadFile && (
        <div className="d-flex justify-content-center" style={{ ...overlay, background: 'rgba(0,0,0,0.95)' }}>
          <div className="d-flex flex-column w-100" style={{ maxWidth: 440, height: '100%' }}>
            <div className="d-flex align-items-center justify-content-between p-3 flex-shrink-0">
              <span className="text-white fw-bold">New status</span>
              <button className="btn btn-sm btn-dark rounded-circle" onClick={cancelUpload}><BiX className="fs-4" /></button>
            </div>

            <div className="flex-grow-1 d-flex align-items-center justify-content-center" style={{ minHeight: 0, padding: 8 }}>
              {uploadFile.type.startsWith('video') ? (
                <video src={previewUrl} controls playsInline style={{ maxWidth: '100%', maxHeight: '100%' }} />
              ) : (
                <img src={previewUrl} alt="preview" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
              )}
            </div>

            <div className="flex-shrink-0" style={{ padding: '8px 14px 16px' }}>
              <input
                className="form-control text-white mb-2"
                style={{ background: 'rgba(255,255,255,0.1)', border: `1px solid ${T.accent}66` }}
                placeholder="Add a caption…"
                maxLength={300}
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
              />

              <div className="text-light opacity-75 mb-1" style={{ fontSize: 11 }}>Who can see this?</div>
              <div className="d-flex flex-column gap-1 mb-2">
                {AUDIENCES.map((a) => {
                  const on = privacy === a.key;
                  const col = a.color || T.accent;
                  const n = a.key === 'except' ? exceptIds.length : a.key === 'only' ? onlyIds.length : a.key === 'close' ? closeIds.length : null;
                  return (
                    <div key={a.key} className="d-flex align-items-center rounded-pill" style={{ border: `1px solid ${col}`, background: on ? col : 'transparent', color: on ? '#101010' : '#fff', padding: '0 4px 0 14px' }}>
                      <button type="button" className="btn btn-sm text-start flex-grow-1 p-0" style={{ color: 'inherit', fontSize: 13, height: 34 }} onClick={() => setPrivacy(a.key)} aria-pressed={on}>
                        {a.icon} {a.label}{n !== null ? ` (${n})` : ''}
                      </button>
                      {a.key !== 'all' && (
                        <button type="button" className="btn btn-sm" style={{ color: 'inherit', fontSize: 12, textDecoration: 'underline' }} onClick={() => { setPrivacy(a.key); openClose(a.key); }}>Edit</button>
                      )}
                    </div>
                  );
                })}
              </div>

              {uploadError && <div className="text-danger small mb-2">{uploadError}</div>}

              <button className="btn w-100 fw-bold rounded-pill" disabled={posting} style={{ background: T.accent, color: '#1f2937' }} onClick={postStatus}>
                {posting ? 'Posting…' : 'Post status'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- CLOSE FRIENDS MANAGER ---------------- */}
      {closeOpen && (
        <div className="d-flex justify-content-center align-items-center px-3" style={{ ...overlay, zIndex: 9700, background: 'rgba(0,0,0,0.85)' }}>
          <div className="p-3 rounded-4 w-100" style={{ maxWidth: 380, background: '#16101a', border: `1px solid ${CLOSE_GREEN}` }}>
            <h6 className="fw-bold mb-1" style={{ color: CLOSE_GREEN }}>{closeOpen === 'except' ? '🚫 Hide from…' : closeOpen === 'only' ? '🎯 Only share with…' : '💚 Close Friends'}</h6>
            <p className="text-light opacity-75 mb-2" style={{ fontSize: 11 }}>{closeOpen === 'except' ? 'Everyone can see it except the people you tick.' : closeOpen === 'only' ? 'Only the people you tick can see this status.' : 'Only the people you tick can see your “Close friends” statuses.'}</p>
            <div className="hide-scroll" style={{ maxHeight: '45vh', overflowY: 'auto' }}>
              {friends.length === 0 && <p className="text-white-50 small">No friends yet.</p>}
              {friends.map((f) => (
                <label key={f.id} className="d-flex align-items-center justify-content-between p-2 rounded mb-1" style={{ background: 'rgba(255,255,255,0.06)', cursor: 'pointer' }}>
                  <span className="d-flex align-items-center gap-2 text-white" style={{ fontSize: 13 }}>
                    <Avatar src={f.profile_picture} name={f.username} size={30} T={T} /> {f.username}
                  </span>
                  <input type="checkbox" className="form-check-input" style={{ width: 18, height: 18, accentColor: CLOSE_GREEN }}
                         checked={closeDraft.includes(f.id)} onChange={() => toggleDraft(f.id)} />
                </label>
              ))}
            </div>
            {closeError && <div className="text-danger small mt-2">{closeError}</div>}
            <div className="d-flex gap-2 mt-3">
              <button className="btn btn-outline-light btn-sm flex-grow-1 rounded-pill" onClick={() => setCloseOpen(false)}>Cancel</button>
              <button className="btn btn-sm flex-grow-1 rounded-pill fw-bold" style={{ background: CLOSE_GREEN, color: '#052e16' }} onClick={saveClose}>Save ({closeDraft.length})</button>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- STORY VIEWER ---------------- */}
      {viewer && st && (
        <div className="d-flex justify-content-center" style={{ ...overlay, background: '#000' }}>
          <div className="d-flex flex-column w-100 position-relative" style={{ maxWidth: 440, height: '100%' }}>

            {/* progress bars + header */}
            <div className="flex-shrink-0" style={{ padding: '10px 10px 6px', zIndex: 3 }}>
              <div className="d-flex gap-1 mb-2">
                {items.map((it, i) => (
                  <div key={it.id} style={{ flex: 1, height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.3)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', background: '#fff', width: i < idx ? '100%' : (i === idx ? `${Math.min(progress, 100)}%` : '0%') }} />
                  </div>
                ))}
              </div>
              <div className="d-flex align-items-center">
                <Avatar src={isMine ? me?.profile_picture : vGroup.profile_picture} name={isMine ? currentUsername : vGroup.username} size={34} T={T} />
                <div className="ms-2 flex-grow-1" style={{ minWidth: 0 }}>
                  <div className="text-white fw-bold text-truncate" style={{ fontSize: 13 }}>{isMine ? 'My Status' : vGroup.username}</div>
                  <div className="text-white-50" style={{ fontSize: 10 }}>
                    {formatListTime(st.created_at)} {st.privacy === 'close' && <span style={{ color: CLOSE_GREEN }}>• 💚 Close friends</span>}{st.privacy === 'except' && <span>• 🚫 Friends except…</span>}{st.privacy === 'only' && <span>• 🎯 Selected people</span>}
                  </div>
                </div>
                <button className="btn btn-sm text-white fs-4 p-0" onClick={closeViewer}><BiX /></button>
              </div>
            </div>

            {/* media */}
            <div className="flex-grow-1 position-relative d-flex align-items-center justify-content-center" style={{ minHeight: 0 }}>
              {st.media_type === 'video' ? (
                <video
                  key={st.id}
                  ref={videoRef}
                  src={getPicUrl(st.media_file)}
                  autoPlay
                  playsInline
                  onTimeUpdate={(e) => { const d = e.target.duration; if (d) setProgress((e.target.currentTime / d) * 100); }}
                  onEnded={() => nextRef.current()}
                  style={{ maxWidth: '100%', maxHeight: '100%' }}
                />
              ) : (
                <img key={st.id} src={getPicUrl(st.media_file)} alt="Status" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
              )}

              {/* tap left = previous, tap right = next */}
              <div style={{ position: 'absolute', inset: 0, display: 'flex', zIndex: 1 }}>
                <div style={{ flex: '0 0 30%' }} onClick={prev} />
                <div style={{ flex: 1 }} onClick={() => nextRef.current()} />
              </div>

              {st.caption && (
                <div className="text-white text-center" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 2, pointerEvents: 'none', padding: '28px 16px 14px', background: 'linear-gradient(transparent, rgba(0,0,0,0.75))', fontSize: 15, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {st.caption}
                </div>
              )}

              {toast && (
                <div className="position-absolute px-3 py-1 rounded-pill text-white" style={{ top: 10, left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.75)', fontSize: 12, zIndex: 5 }}>{toast}</div>
              )}
            </div>

            {/* viewers sheet (owner) */}
            {isMine && showViewers && (
              <div className="position-absolute w-100 p-2" style={{ left: 0, bottom: 'calc(env(safe-area-inset-bottom) + 72px)', zIndex: 6, background: 'rgba(20,20,24,0.97)', borderTop: `1px solid ${T.accent}55`, maxHeight: '45%', overflowY: 'auto' }}>
                <div className="text-white fw-bold mb-2" style={{ fontSize: 13 }}>Viewed by {st.view_count || 0} • ❤️ {st.like_count || 0}</div>
                {(st.viewers || []).length === 0 && <small className="text-white-50">Nobody has viewed yet.</small>}
                {(st.viewers || []).map((v) => (
                  <div key={v.id} className="d-flex justify-content-between align-items-center text-white py-1" style={{ fontSize: 12 }}>
                    <span>{v.username}</span>
                    <span className="d-flex align-items-center gap-2">
                      {v.liked && <span>❤️</span>}
                      {v.reaction && <span style={{ fontSize: 16 }}>{v.reaction}</span>}
                      <span className="opacity-50">{formatListTime(v.viewed_at)}</span>
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* footer */}
            {isMine ? (
              <div className="st-foot">
                <button type="button" className="st-stat" onClick={() => setShowViewers(!showViewers)} aria-expanded={showViewers} aria-label="Who viewed this status">
                  <BiShow /> {st.view_count || 0}
                </button>
                <button type="button" className="st-stat" onClick={() => setShowViewers(!showViewers)} aria-label="Who liked this status">
                  <span aria-hidden>❤️</span> {st.like_count || 0}
                </button>
                <span style={{ flex: 1 }} />
                <button type="button" className="st-round danger" onClick={doDelete} aria-label="Delete status"><BiTrash /></button>
              </div>
            ) : (
              <div className="st-foot col">
                <div className="st-tray" role="group" aria-label="React to this status">
                  {QUICK.map((e) => (
                    <button key={e} type="button" className={st.my_reaction === e ? 'on' : ''} aria-pressed={st.my_reaction === e}
                            style={{ opacity: st.my_reaction && st.my_reaction !== e ? 0.5 : 1 }}
                            onClick={() => doReact(e)}>{e}</button>
                  ))}
                </div>
                <div className="st-reply">
                  <input
                    placeholder={`Reply to ${vGroup.username}…`}
                    aria-label={`Reply to ${vGroup.username}`}
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    onFocus={() => setReplyFocus(true)}
                    onBlur={() => setReplyFocus(false)}
                    onKeyDown={(e) => { if (e.key === 'Enter') doReply(); }}
                  />
                  {replyText.trim() ? (
                    <button type="button" className="st-like send" onMouseDown={(e) => e.preventDefault()} onClick={doReply} aria-label="Send reply"><BiSend /></button>
                  ) : (
                    <button type="button" className={`st-like${st.liked_by_me ? ' on' : ''}`} onClick={doLike} aria-label={st.liked_by_me ? 'Unlike' : 'Like'} aria-pressed={!!st.liked_by_me}>
                      {st.liked_by_me ? '❤️' : '🤍'}
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* hearts shower when you like */}
            {hearts.length > 0 && (
              <div className="st-hearts" aria-hidden="true">
                {hearts.map((h) => (
                  <span key={h.k} className="st-heart"
                        style={{ '--dx': `${h.dx}px`, '--rise': `${h.rise}px`, '--s': h.s, '--r': h.r, '--d': `${h.d}s`, '--t': `${h.t}s`, fontSize: h.size }}>❤️</span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default StatusTab;
