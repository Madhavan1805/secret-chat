import React, { useState, useEffect, useRef } from 'react';
import { BiImageAdd, BiX, BiTrash } from 'react-icons/bi';
import api from './api';
import Avatar from './Avatar';
import { getPicUrl, errMsg, formatListTime } from './config';

const IMAGE_MS = 5000;           // how long a photo stays on screen
const TICK_MS = 50;
const QUICK = ['❤️', '😂', '😮', '😢', '🙏', '🔥'];
const CLOSE_GREEN = '#22c55e';

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
    <div style={{ padding: 2, borderRadius: '50%', border: `2px solid ${color}`, lineHeight: 0 }}>
      {children}
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
  const [closeIds, setCloseIds] = useState([]);
  const [closeOpen, setCloseOpen] = useState(false);
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

  const videoRef = useRef(null);
  const viewedSent = useRef(new Set());
  const nextRef = useRef(() => {});

  const flash = (m) => { setToast(m); setTimeout(() => setToast(''), 1600); };

  // ---------------------------------------------------------- derived data
  const groups = groupByUser(statuses);
  const myGroup = groups.find((g) => g.user === meId) || null;
  const others = groups
    .filter((g) => g.user !== meId)
    .sort((a, b) => (Number(a.allViewed) - Number(b.allViewed)) || (new Date(b.latest.created_at) - new Date(a.latest.created_at)));
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

  const openClose = () => { setCloseDraft(closeIds); setCloseError(''); setCloseOpen(true); };
  const toggleDraft = (id) => setCloseDraft((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const saveClose = async () => {
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
    if (privacy === 'close' && closeIds.length === 0) { openClose(); return; }
    setPosting(true);
    setUploadError('');
    const fd = new FormData();
    fd.append('media_file', uploadFile);
    fd.append('caption', caption.trim());
    fd.append('privacy', privacy);
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
  const doLike = async () => {
    if (!st || busy) return;
    setBusy(true);
    try { await api.post(`statuses/${st.id}/like/`); await refreshStatuses(); } catch (e) { flash(errMsg(e, 'Failed')); }
    setBusy(false);
  };

  const doReact = async (emoji) => {
    if (!st || busy) return;
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
    if (g.allViewed) return 'rgba(255,255,255,0.25)';
    return g.hasClose ? CLOSE_GREEN : T.accent;
  };

  const overlay = { position: 'fixed', top: 0, left: 0, width: '100%', height: 'var(--app-height, 100dvh)', zIndex: 9500 };

  // ======================================================================= UI
  return (
    <div>
      {/* ---------------- my status row ---------------- */}
      <div className="d-flex align-items-center p-2 rounded mb-2" style={{ background: 'rgba(255,255,255,0.08)' }}>
        <div className="me-3" style={{ cursor: myGroup ? 'pointer' : 'default' }} onClick={() => myGroup && openGroup(myGroup, [])}>
          {myGroup ? (
            <Ring color={myGroup.hasClose ? CLOSE_GREEN : T.accent}>
              <Avatar src={me?.profile_picture} name={currentUsername} size={38} T={T} />
            </Ring>
          ) : (
            <Avatar src={me?.profile_picture} name={currentUsername} size={44} T={T} />
          )}
        </div>
        <div className="flex-grow-1" style={{ minWidth: 0, cursor: myGroup ? 'pointer' : 'default' }} onClick={() => myGroup && openGroup(myGroup, [])}>
          <h6 className="mb-0 fw-bold text-white" style={{ fontSize: '13px' }}>My Status</h6>
          <small className="text-light opacity-75" style={{ fontSize: '10px' }}>
            {myGroup
              ? `${myGroup.items.length} update${myGroup.items.length > 1 ? 's' : ''} • ${formatListTime(myGroup.latest.created_at)} • 👁 ${myTotalViews}`
              : 'Tap + to add a photo / video status'}
          </small>
        </div>
        <label htmlFor="status-upload" className="btn btn-sm rounded-circle d-flex align-items-center justify-content-center m-0" style={{ width: 34, height: 34, background: T.accent, color: '#1f2937', cursor: 'pointer' }} title="Add status">
          <BiImageAdd className="fs-5" />
        </label>
        <input type="file" id="status-upload" className="d-none" accept="image/*,video/*" onChange={pickFile} />
      </div>

      <button className="btn btn-sm w-100 rounded-pill mb-3 fw-bold" style={{ fontSize: 12, border: `1px solid ${CLOSE_GREEN}`, color: CLOSE_GREEN, background: 'transparent' }} onClick={openClose}>
        💚 Close Friends ({closeIds.length})
      </button>

      {/* ---------------- friends' statuses (one row per person) ---------------- */}
      <h6 className="text-light mb-2 opacity-75" style={{ fontSize: '12px' }}>Recent Updates</h6>
      {others.length > 0 ? (
        others.map((g) => (
          <div key={g.user} className="d-flex align-items-center p-2 rounded mb-2" style={{ background: rowBg, cursor: 'pointer' }}
               onClick={() => openGroup(g, others.map((o) => o.user))}>
            <div className="me-3">
              <Ring color={ringColor(g)}>
                <Avatar src={g.profile_picture} name={g.username} size={38} T={T} />
              </Ring>
            </div>
            <div className="flex-grow-1" style={{ minWidth: 0 }}>
              <h6 className="mb-0 fw-bold text-white text-truncate" style={{ fontSize: '13px', opacity: g.allViewed ? 0.65 : 1 }}>
                {g.username} {g.hasClose && <span title="Close friends">💚</span>}
              </h6>
              <small style={{ fontSize: '10px', color: g.allViewed ? 'rgba(255,255,255,0.5)' : T.accent }}>
                {g.items.length} update{g.items.length > 1 ? 's' : ''} • {formatListTime(g.latest.created_at)}
              </small>
            </div>
          </div>
        ))
      ) : (
        <p className="text-center text-light opacity-50 mt-4" style={{ fontSize: '11px' }}>No recent status updates.</p>
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
              <div className="d-flex gap-2 mb-2">
                <button type="button" className="btn btn-sm flex-grow-1 rounded-pill"
                        style={{ fontSize: 12, border: `1px solid ${T.accent}`, background: privacy === 'all' ? T.accent : 'transparent', color: privacy === 'all' ? '#1f2937' : '#fff' }}
                        onClick={() => setPrivacy('all')}>👥 All friends</button>
                <button type="button" className="btn btn-sm flex-grow-1 rounded-pill"
                        style={{ fontSize: 12, border: `1px solid ${CLOSE_GREEN}`, background: privacy === 'close' ? CLOSE_GREEN : 'transparent', color: privacy === 'close' ? '#052e16' : '#fff' }}
                        onClick={() => setPrivacy('close')}>💚 Close friends ({closeIds.length})</button>
              </div>
              {privacy === 'close' && (
                <button type="button" className="btn btn-sm btn-link p-0 mb-2" style={{ fontSize: 11, color: CLOSE_GREEN }} onClick={openClose}>
                  {closeIds.length === 0 ? 'Your list is empty. Add close friends' : 'Edit close friends list'}
                </button>
              )}

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
            <h6 className="fw-bold mb-1" style={{ color: CLOSE_GREEN }}>💚 Close Friends</h6>
            <p className="text-light opacity-75 mb-2" style={{ fontSize: 11 }}>Only the people you tick can see your “Close friends” statuses.</p>
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
                    {formatListTime(st.created_at)} {st.privacy === 'close' && <span style={{ color: CLOSE_GREEN }}>• 💚 Close friends</span>}
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
              <div className="position-absolute w-100 p-2" style={{ left: 0, bottom: 64, zIndex: 6, background: 'rgba(20,20,24,0.97)', borderTop: `1px solid ${T.accent}55`, maxHeight: '45%', overflowY: 'auto' }}>
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
              <div className="d-flex align-items-center justify-content-between flex-shrink-0" style={{ padding: '10px 12px 14px', zIndex: 3, background: 'rgba(0,0,0,0.6)' }}>
                <button className="btn btn-sm btn-outline-light rounded-pill px-3" onClick={() => setShowViewers(!showViewers)}>
                  👁 {st.view_count || 0} &nbsp; ❤️ {st.like_count || 0}
                </button>
                <button className="btn btn-sm btn-outline-danger rounded-pill px-3" onClick={doDelete}><BiTrash /> Delete</button>
              </div>
            ) : (
              <div className="flex-shrink-0" style={{ padding: '8px 10px 12px', zIndex: 3, background: 'rgba(0,0,0,0.6)' }}>
                <div className="d-flex justify-content-center gap-3 mb-2">
                  {QUICK.map((e) => (
                    <button key={e} type="button" className="btn btn-sm p-0 border-0"
                            style={{ fontSize: 24, lineHeight: 1.2, opacity: st.my_reaction && st.my_reaction !== e ? 0.4 : 1, transform: st.my_reaction === e ? 'scale(1.3)' : 'none', transition: '0.15s' }}
                            onClick={() => doReact(e)}>{e}</button>
                  ))}
                </div>
                <div className="d-flex gap-2 align-items-center">
                  <input
                    className="form-control form-control-sm text-white"
                    style={{ background: 'rgba(255,255,255,0.12)', border: `1px solid ${T.accent}66`, borderRadius: 20 }}
                    placeholder={`Reply to ${vGroup.username}…`}
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    onFocus={() => setReplyFocus(true)}
                    onBlur={() => setReplyFocus(false)}
                    onKeyDown={(e) => { if (e.key === 'Enter') doReply(); }}
                  />
                  {replyText.trim() ? (
                    <button className="btn btn-sm fw-bold px-3 rounded-pill" style={{ background: T.accent, color: '#1f2937' }} onMouseDown={(e) => e.preventDefault()} onClick={doReply}>Send</button>
                  ) : (
                    <button className="btn btn-sm p-0 border-0" style={{ fontSize: 26, lineHeight: 1 }} onClick={doLike} title="Like">
                      {st.liked_by_me ? '❤️' : '🤍'}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default StatusTab;
