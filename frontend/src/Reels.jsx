import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { BiArrowBack, BiPlus, BiLinkExternal, BiCommentDetail, BiVolumeFull, BiVolumeMute, BiDotsVerticalRounded, BiVideoPlus, BiPlay, BiSend, BiSearch, BiCheck } from 'react-icons/bi';
import { BsHeart, BsHeartFill } from 'react-icons/bs';
import api from './api';
import { Sheet } from './ui';
import Avatar from './Avatar';
import { resolveTheme, getAppTheme, themeVars } from './theme';
import { getPicUrl, errMsg, formatListTime } from './config';
import { burstAt } from './fx';

const MAX_SECONDS = 60;
const keyOf = (r) => (r.yt ? `yt:${r.yt}` : String(r.id));
const SEEN_KEY = 'yt_seen';
const getSeen = () => { try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'); } catch (e) { return []; } };
const markSeen = (id) => { try { const l = getSeen().filter((x) => x !== id); l.push(id); localStorage.setItem(SEEN_KEY, JSON.stringify(l.slice(-400))); } catch (e) { /* ignore */ } };

const LIKED_KEY = 'yt_liked';
const getLiked = () => { try { return JSON.parse(localStorage.getItem(LIKED_KEY) || '[]'); } catch (e) { return []; } };
const setLiked = (id, on) => { try { const l = getLiked().filter((x) => x !== id); if (on) l.push(id); localStorage.setItem(LIKED_KEY, JSON.stringify(l.slice(-500))); } catch (e) { /* ignore */ } };

// a YouTube Short, shown with YouTube's own embedded player (only the one on screen is loaded)
function YtSlide({ item, active, muted, setMuted, onShare }) {
  const frame = useRef(null);
  const tapTimer = useRef(null);
  const [liked, setLikedState] = useState(() => getLiked().includes(item.yt));
  const [pop, setPop] = useState(null);
  const [more, setMore] = useState(false);
  const send = (func) => { try { frame.current && frame.current.contentWindow.postMessage(JSON.stringify({ event: 'command', func, args: [] }), '*'); } catch (e) { /* ignore */ } };
  useEffect(() => { send(muted ? 'mute' : 'unMute'); }, [muted]);                    // eslint-disable-line react-hooks/exhaustive-deps
  const like = (on) => { setLikedState(on); setLiked(item.yt, on); };
  const tap = (e) => {
    const x = e.clientX; const y = e.clientY;
    if (tapTimer.current) {                                // second tap = like
      clearTimeout(tapTimer.current); tapTimer.current = null;
      if (!liked) like(true);
      burstAt('❤️', x, y, 8);
      setPop(Date.now()); setTimeout(() => setPop(null), 800);
      return;
    }
    tapTimer.current = setTimeout(() => { tapTimer.current = null; setMuted(!muted); }, 240);
  };
  return (
    <section className="rl-slide" data-id={keyOf(item)}>
      <div className="rl-yt" style={{ backgroundImage: `url(https://i.ytimg.com/vi/${item.yt}/hqdefault.jpg)` }}>
        {active && (
          <iframe ref={frame} title={item.title || 'Short'} className="rl-ytframe" onLoad={() => { if (!muted) send('unMute'); }}
            src={`https://www.youtube.com/embed/${item.yt}?autoplay=1&mute=1&loop=1&playlist=${item.yt}&controls=0&playsinline=1&modestbranding=1&rel=0&enablejsapi=1&fs=0&iv_load_policy=3`}
            allow="autoplay; encrypted-media" referrerPolicy="strict-origin-when-cross-origin" />
        )}
        <div className="rl-yt-shield" onClick={tap} />
      </div>
      <div className="rl-shade" />
      {pop && <div className="rl-pop"><BsHeartFill /></div>}
      {muted && active && <div className="rl-unmute">Tap to turn sound on</div>}
      <div className="rl-rail">
        <button type="button" className={`rl-act ${liked ? 'on' : ''}`} onClick={() => like(!liked)} aria-label={liked ? 'Unlike' : 'Like'}><i>{liked ? <BsHeartFill /> : <BsHeart />}</i><span>{liked ? 'Liked' : 'Like'}</span></button>
        <button type="button" className="rl-act" onClick={() => onShare(item)} aria-label="Send to friends"><i><BiSend /></i><span>Share</span></button>
        <button type="button" className="rl-act" onClick={() => setMuted(!muted)} aria-label={muted ? 'Sound on' : 'Sound off'}><i>{muted ? <BiVolumeMute /> : <BiVolumeFull />}</i></button>
        <a className="rl-act" href={`https://www.youtube.com/watch?v=${item.yt}`} target="_blank" rel="noopener noreferrer" aria-label="Open in YouTube"><i><BiLinkExternal /></i></a>
      </div>
      <div className="rl-info">
        <div className="rl-user"><b>@{item.channel || 'YouTube'}</b><span className="rl-tag">Suggested</span></div>
        {item.title && <p className={`rl-cap${more ? ' open' : ''}`} onClick={() => setMore(!more)}>{item.title}</p>}
        <small className="rl-meta">♪ Original audio · YouTube Shorts</small>
      </div>
    </section>
  );
}

// one reel: plays while it is the one on screen
function Slide({ T, reel, active, near, muted, setMuted, onLike, onComments, onMore, onShare }) {
  const vid = useRef(null);
  const bar = useRef(null);
  const tapTimer = useRef(null);
  const viewed = useRef(false);
  const [paused, setPaused] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [more, setMore] = useState(false);
  const [pop, setPop] = useState(null);          // the phone refused to play with sound until a tap

  useEffect(() => {
    const v = vid.current;
    if (!v) return;
    if (active && !paused) {
      const p = v.play();
      if (p && p.catch) p.catch(() => { v.muted = true; setMuted(true); setBlocked(true); v.play().catch(() => {}); });
      if (!viewed.current) { viewed.current = true; api.post(`reels/${reel.id}/view/`).catch(() => {}); }
    } else { v.pause(); }
  }, [active, paused]);                                   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!active) { setPaused(false); if (vid.current) vid.current.currentTime = 0; } }, [active]);
  useEffect(() => { if (vid.current) vid.current.muted = muted; }, [muted]);

  const tap = (e) => {
    const x = e.clientX; const y = e.clientY;
    if (tapTimer.current) {                                // second tap = like
      clearTimeout(tapTimer.current); tapTimer.current = null;
      if (!reel.liked) onLike(reel);
      burstAt('❤️', x, y, 8);
      setPop(Date.now()); setTimeout(() => setPop(null), 800);
      return;
    }
    tapTimer.current = setTimeout(() => {
      tapTimer.current = null;
      if (blocked) { setBlocked(false); setMuted(false); return; }
      setPaused((p) => !p);
    }, 240);
  };

  return (
    <section className="rl-slide" data-id={keyOf(reel)}>
      <video ref={vid} src={near ? reel.video_url : undefined} className="rl-video" playsInline loop muted={muted} preload={near ? 'auto' : 'none'} onClick={tap}
        onTimeUpdate={(e) => { const v = e.currentTarget; if (bar.current && v.duration) bar.current.style.width = `${(v.currentTime / v.duration) * 100}%`; }} />
      <div className="rl-shade" />
      {pop && <div className="rl-pop"><BsHeartFill /></div>}
      {paused && <div className="rl-pause"><BiPlay /></div>}
      {blocked && <div className="rl-unmute">Tap to turn sound on</div>}

      <div className="rl-rail">
        <div className="rl-av"><Avatar src={reel.user.profile_picture} name={reel.user.username} size={44} T={T} /></div>
        <button type="button" className={`rl-act ${reel.liked ? 'on' : ''}`} onClick={() => onLike(reel)} aria-label={reel.liked ? 'Unlike' : 'Like'}>
          <i>{reel.liked ? <BsHeartFill /> : <BsHeart />}</i><span>{reel.likes}</span>
        </button>
        <button type="button" className="rl-act" onClick={() => onComments(reel)} aria-label="Comments"><i><BiCommentDetail /></i><span>{reel.comments}</span></button>
        <button type="button" className="rl-act" onClick={() => onShare(reel)} aria-label="Send to friends"><i><BiSend /></i><span>Share</span></button>
        <button type="button" className="rl-act" onClick={() => setMuted(!muted)} aria-label={muted ? 'Sound on' : 'Sound off'}><i>{muted ? <BiVolumeMute /> : <BiVolumeFull />}</i></button>
        <button type="button" className="rl-act" onClick={() => onMore(reel)} aria-label="More"><i><BiDotsVerticalRounded /></i></button>
      </div>

      <div className="rl-info">
        <div className="rl-user"><b>@{reel.user.username}</b>
          <span className="rl-tag">{reel.audience === 'all' ? 'Everyone' : 'Friends'}</span></div>
        {reel.caption && <p className={`rl-cap${more ? ' open' : ''}`} onClick={() => setMore(!more)}>{reel.caption}</p>}
        <small className="rl-meta">{reel.views} views · {formatListTime(reel.created_at)}</small>
      </div>
      <div className="rl-prog"><div ref={bar} /></div>
    </section>
  );
}

function Comments({ T, reel, onClose, onCount }) {
  const [list, setList] = useState([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api.get(`reels/${reel.id}/comments/`).then((r) => { setList(r.data.comments || []); onCount(r.data.comments.length); }).catch(() => {}), [reel.id]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);
  const send = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    try { const r = await api.post(`reels/${reel.id}/comments/`, { text: text.trim() }); setText(''); setList(r.data.comments); onCount(r.data.comments.length); } catch (e) { /* keep text */ }
    setBusy(false);
  };
  return (
    <Sheet T={T} title="Comments" onClose={onClose}>
      {list.length === 0 && <p style={{ color: 'var(--sub)', textAlign: 'center', margin: '18px 0' }}>No comments yet. Say something nice.</p>}
      {list.map((c) => (
        <div key={c.id} style={{ display: 'flex', gap: 10, padding: '8px 2px' }}>
          <Avatar src={c.user.profile_picture} name={c.user.username} size={34} T={T} />
          <div style={{ minWidth: 0 }}><b style={{ fontSize: 13.5 }}>{c.user.username}</b> <small style={{ color: 'var(--sub)' }}>{formatListTime(c.created_at)}</small>
            <div style={{ wordBreak: 'break-word', fontSize: 14.5 }}>{c.text}</div></div>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <input className="form-control" maxLength={300} placeholder="Add a comment…" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') send(); }} aria-label="Comment" />
        <button type="button" className="sc-btn" disabled={busy || !text.trim()} onClick={send}>Post</button>
      </div>
    </Sheet>
  );
}

function ShareSheet({ T, reel, onClose }) {
  const [friends, setFriends] = useState(null);
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  useEffect(() => { api.get('users/').then((r) => setFriends(Array.isArray(r.data) ? r.data : [])).catch(() => setFriends([])); }, []);
  const list = (friends || []).filter((f) => !q.trim() || f.username.toLowerCase().includes(q.trim().toLowerCase()));
  const toggle = (id) => setPicked((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  const send = async () => {
    if (!picked.length || busy) return;
    setBusy(true); setMsg('');
    try {
      const r = reel.yt ? await api.post('reels/yt/share/', { yt: reel.yt, title: reel.title || '', friend_ids: picked }) : await api.post(`reels/${reel.id}/share/`, { friend_ids: picked });
      setMsg(`Sent to ${r.data.sent} friend${r.data.sent === 1 ? '' : 's'}`);
      setTimeout(onClose, 900);
    } catch (e) { setMsg(errMsg(e, 'Could not send')); setBusy(false); }
  };
  return (
    <Sheet T={T} title="Send to friends" onClose={onClose}>
      <label className="sc-search" style={{ margin: '0 0 10px' }}>
        <BiSearch style={{ fontSize: 20 }} />
        <input type="text" placeholder="Search friends" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search friends" />
      </label>
      {friends === null && <p style={{ color: 'var(--sub)', textAlign: 'center' }}>Loading…</p>}
      {friends && friends.length === 0 && <p style={{ color: 'var(--sub)', textAlign: 'center' }}>Add a friend first.</p>}
      {friends && friends.length > 0 && list.length === 0 && <p style={{ color: 'var(--sub)', textAlign: 'center' }}>No friend found</p>}
      <div className="rl-share-list">
        {list.map((f) => (
          <button key={f.id} type="button" className="rl-share-row" onClick={() => toggle(f.id)} aria-pressed={picked.includes(f.id)}>
            <Avatar src={f.profile_picture} name={f.username} size={42} T={T} />
            <b>{f.username}</b>
            <span className={`sel-box${picked.includes(f.id) ? ' on' : ''}`}>{picked.includes(f.id) && <BiCheck />}</span>
          </button>
        ))}
      </div>
      {msg && <p style={{ textAlign: 'center', margin: '8px 0', fontSize: 14 }}>{msg}</p>}
      <button type="button" className="sc-btn" style={{ width: '100%', marginTop: 10 }} disabled={!picked.length || busy} onClick={send}><BiSend /> {busy ? 'Sending…' : `Send${picked.length ? ` (${picked.length})` : ''}`}</button>
    </Sheet>
  );
}

function Create({ T, onClose, onDone }) {
  const [file, setFile] = useState(null);
  const [url, setUrl] = useState('');
  const [dur, setDur] = useState(0);
  const [caption, setCaption] = useState('');
  const [audience, setAudience] = useState('friends');
  const [pct, setPct] = useState(-1);
  const [err, setErr] = useState('');

  const pick = (e) => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    if (url) URL.revokeObjectURL(url);
    setErr(''); setDur(0); setFile(f); setUrl(URL.createObjectURL(f));
  };
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  const tooLong = dur > MAX_SECONDS + 1;

  const post = async () => {
    if (!file || tooLong || pct >= 0) return;
    setPct(0); setErr('');
    const fd = new FormData();
    fd.append('video', file, `reel.${(file.name.split('.').pop() || 'mp4').slice(0, 4)}`);   // short file name
    fd.append('caption', caption.trim());
    fd.append('audience', audience);
    fd.append('duration', String(Math.round(dur * 10) / 10));
    try {
      const r = await api.post('reels/', fd, { headers: { 'Content-Type': 'multipart/form-data' }, onUploadProgress: (p) => p.total && setPct(Math.min(99, Math.round((p.loaded / p.total) * 100))) });
      onDone(r.data);
    } catch (e) { setErr(errMsg(e, 'Could not post the reel')); setPct(-1); }
  };

  return (
    <Sheet T={T} title="New reel" onClose={() => pct < 0 && onClose()}>
      {!file ? (
        <label htmlFor="reel-file" className="rl-pick"><BiVideoPlus /><b>Choose a video</b><small>Up to {MAX_SECONDS} seconds, vertical looks best</small></label>
      ) : (
        <video src={url} className="rl-prev" controls playsInline muted onLoadedMetadata={(e) => setDur(e.currentTarget.duration || 0)} />
      )}
      <input id="reel-file" type="file" accept="video/*" className="d-none" onChange={pick} />
      {file && <label htmlFor="reel-file" style={{ display: 'block', textAlign: 'center', color: 'var(--accent)', fontSize: 13.5, margin: '8px 0', cursor: 'pointer' }}>Choose another video</label>}
      {tooLong && <div className="text-danger small" style={{ textAlign: 'center' }}>This video is {Math.round(dur)} seconds. Reels can be {MAX_SECONDS} seconds at most, please pick a shorter one.</div>}
      <textarea className="form-control" rows={2} maxLength={200} placeholder="Write a caption…" value={caption} onChange={(e) => setCaption(e.target.value)} aria-label="Caption" style={{ marginTop: 10 }} />
      <div style={{ display: 'flex', gap: 8, margin: '12px 0' }}>
        {[['friends', 'Friends only'], ['all', 'Everyone']].map(([k, label]) => (
          <button key={k} type="button" className={`sc-btn ${audience === k ? '' : 'ghost'}`} style={{ flex: 1, fontSize: 13.5 }} onClick={() => setAudience(k)}>{label}</button>
        ))}
      </div>
      <p style={{ color: 'var(--sub)', fontSize: 12.5, margin: '0 2px 10px' }}>{audience === 'all' ? 'Everyone on Chatzy can see this in Discover.' : 'Only your friends can see this.'} Reels are removed after 30 days.</p>
      {err && <div className="text-danger small" style={{ textAlign: 'center', marginBottom: 8 }}>{err}</div>}
      <button type="button" className="sc-btn" style={{ width: '100%' }} disabled={!file || tooLong || pct >= 0} onClick={post}>{pct >= 0 ? `Posting… ${pct}%` : 'Post reel'}</button>
    </Sheet>
  );
}

export default function Reels() {
  const navigate = useNavigate();
  const location = useLocation();
  const T = resolveTheme(getAppTheme());
  const [tab, setTab] = useState('discover');
  const [items, setItems] = useState([]);
  const [next, setNext] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [activeId, setActiveId] = useState(null);          // key of the reel on screen
  const [ext, setExt] = useState([]);                        // YouTube Shorts for Discover
  const extBusy = useRef(false);
  const [muted, setMuted] = useState(false);
  const [commentsFor, setCommentsFor] = useState(null);
  const [menuFor, setMenuFor] = useState(null);
  const [creating, setCreating] = useState(false);
  const [shareFor, setShareFor] = useState(null);
  const [linked, setLinked] = useState(null);                // a reel opened from a shared link
  const feed = useRef(null);
  const loadingMore = useRef(false);

  const load = useCallback(async (which, before) => {
    try {
      const r = await api.get('reels/', { params: { tab: which, ...(before ? { before } : {}) } });
      setItems((cur) => (before ? [...cur, ...r.data.reels.filter((n) => !cur.some((c) => c.id === n.id))] : r.data.reels));
      setNext(r.data.next);
      setErr('');
    } catch (e) { setErr(errMsg(e, 'Could not load reels')); }
    setLoading(false); loadingMore.current = false;
  }, []);
  const loadExt = useCallback(async (replace) => {
    if (extBusy.current) return;
    extBusy.current = true;
    try {
      const seen = new Set(getSeen());
      const r = await api.get('reels/explore/');
      const fresh = (r.data.items || []).filter((x) => !seen.has(`yt:${x.yt}`));
      setExt((cur) => (replace ? fresh : [...cur, ...fresh.filter((x) => !cur.some((c) => c.yt === x.yt))]));
    } catch (e) { /* Discover just shows people's reels */ }
    extBusy.current = false;
  }, []);
  useEffect(() => {
    setLoading(true); setItems([]); setNext(null); setActiveId(null); setExt([]);
    if (feed.current) feed.current.scrollTop = 0;
    load(tab);
    if (tab === 'discover') loadExt(true);
  }, [tab, load, loadExt]);

  // opened from a shared link: /reels?r=<id> shows that reel first
  useEffect(() => {
    const id = new URLSearchParams(location.search).get('r');
    if (!id) return;
    api.get(`reels/${id}/`).then((r) => { setLinked(r.data); setActiveId(String(r.data.id)); }).catch(() => {});
  }, [location.search]);

  // people's reels, with a Short after every two of them (all Shorts when there are few reels)
  const display = useMemo(() => {
    const base = linked ? [linked, ...items.filter((x) => x.id !== linked.id)] : items;
    if (tab !== 'discover') return base;
    const out = []; let e = 0;
    base.forEach((u) => { out.push(u); if (e < ext.length) out.push(ext[e++]); });
    return out.concat(ext.slice(e));
  }, [tab, items, ext, linked]);

  // whichever reel fills the screen is the active one
  useEffect(() => {
    const root = feed.current;
    if (!root) return undefined;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting && en.intersectionRatio >= 0.7) setActiveId(en.target.dataset.id); });
    }, { root, threshold: [0.7] });
    root.querySelectorAll('.rl-slide').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [display]);

  const idx = display.findIndex((r) => keyOf(r) === activeId);
  useEffect(() => { if (activeId && activeId.startsWith('yt:')) markSeen(activeId); }, [activeId]);
  useEffect(() => { if (!activeId && display[0]) setActiveId(keyOf(display[0])); }, [display, activeId]);
  useEffect(() => {
    if (idx < display.length - 3) return;
    if (next && !loadingMore.current) { loadingMore.current = true; load(tab, next); }
    else if (tab === 'discover' && !next && display.length) loadExt(false);
  }, [idx, display.length, next, tab, load, loadExt]);

  const patch = (id, fn) => { setItems((cur) => cur.map((r) => (r.id === id ? fn(r) : r))); setLinked((cur) => (cur && cur.id === id ? fn(cur) : cur)); };
  const like = async (reel) => {
    patch(reel.id, (r) => ({ ...r, liked: !r.liked, likes: r.likes + (r.liked ? -1 : 1) }));           // instant, then the server's answer
    try { const res = await api.post(`reels/${reel.id}/like/`); patch(reel.id, (r) => ({ ...r, liked: res.data.liked, likes: res.data.likes })); } catch (e) { patch(reel.id, () => reel); }
  };
  const remove = async (reel) => {
    try { await api.delete(`reels/${reel.id}/`); setItems((cur) => cur.filter((r) => r.id !== reel.id)); setLinked((c) => (c && c.id === reel.id ? null : c)); setMenuFor(null); } catch (e) { setErr(errMsg(e, 'Could not delete')); }
  };
  const report = async (reel) => {
    try { await api.post(`reels/${reel.id}/report/`); setItems((cur) => cur.filter((r) => r.id !== reel.id)); setLinked((c) => (c && c.id === reel.id ? null : c)); } catch (e) { /* ignore */ }
    setMenuFor(null);
  };

  return (
    <div className="rl-page" style={themeVars(T)}>
      <div className="rl-top">
        <button type="button" className="rl-round" onClick={() => navigate('/home')} aria-label="Back"><BiArrowBack /></button>
        <div className="rl-tabs" role="tablist">
          {[['discover', 'For you'], ['friends', 'Friends']].map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{label}</button>
          ))}
        </div>
        <button type="button" className="rl-round" onClick={() => setCreating(true)} aria-label="New reel"><BiPlus /></button>
      </div>

      <div className="rl-feed" ref={feed}>
        {display.map((r, i) => (r.yt
          ? <YtSlide key={keyOf(r)} item={r} active={keyOf(r) === activeId} muted={muted} setMuted={setMuted} onShare={setShareFor} />
          : <Slide key={keyOf(r)} T={T} reel={r} active={keyOf(r) === activeId} near={Math.abs(i - (idx < 0 ? 0 : idx)) <= 1}
            muted={muted} setMuted={setMuted} onLike={like} onComments={setCommentsFor} onMore={setMenuFor} onShare={setShareFor} />
        ))}
        {!display.length && (
          <div className="rl-empty">
            {loading ? <p>Loading reels…</p> : err ? <><p>{err}</p><button type="button" className="sc-btn" onClick={() => { setLoading(true); load(tab); }}>Try again</button></> : (
              <><BiVideoPlus style={{ fontSize: 46 }} />
                <p>{tab === 'friends' ? 'No reels from your friends yet.' : 'Nothing in Discover yet.'}</p>
                <button type="button" className="sc-btn" onClick={() => setCreating(true)}>Post the first reel</button></>
            )}
          </div>
        )}
      </div>

      {shareFor && <ShareSheet T={T} reel={shareFor} onClose={() => setShareFor(null)} />}
      {commentsFor && <Comments T={T} reel={commentsFor} onClose={() => setCommentsFor(null)} onCount={(n) => patch(commentsFor.id, (r) => ({ ...r, comments: n }))} />}
      {creating && <Create T={T} onClose={() => setCreating(false)} onDone={(r) => { setCreating(false); if (tab === 'friends' || r.audience === 'all') setItems((cur) => [r, ...cur]); setActiveId(String(r.id)); if (feed.current) feed.current.scrollTop = 0; }} />}
      {menuFor && (
        <Sheet T={T} title="Reel" onClose={() => setMenuFor(null)}>
          {menuFor.mine
            ? <button type="button" className="sc-btn ghost" style={{ width: '100%', color: '#ff7d8c' }} onClick={() => remove(menuFor)}>Delete this reel</button>
            : <button type="button" className="sc-btn ghost" style={{ width: '100%', color: '#ff7d8c' }} onClick={() => report(menuFor)}>Report this reel</button>}
          {!menuFor.mine && <p style={{ color: 'var(--sub)', fontSize: 12.5, textAlign: 'center', margin: '10px 0 0' }}>Reels reported by 3 different people are hidden.</p>}
        </Sheet>
      )}
    </div>
  );
}
