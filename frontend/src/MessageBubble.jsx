import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BsCheck, BsCheckAll } from 'react-icons/bs';
import { BiStar } from 'react-icons/bi';
import { Seal } from './ui';
import AudioPlayer from './AudioPlayer';
import MediaViewer, { downloadFile } from './MediaViewer';
import EmojiPicker from './EmojiPicker';
import { DEFAULT_REACTIONS, getCustomReactions, addCustomReaction, removeCustomReaction } from './reactions';
import { getPicUrl, formatSize, formatTime } from './config';
import { useBackClose } from './backClose';

const URL_RE = /(https?:\/\/[^\s]+)/g;
const MENTION_RE = /(@[\w.\-]+)/g;
const EDIT_MS = 5 * 60 * 1000;
const LONG_CHARS = 450;          // longer texts are cut short with "Read more"
const LONG_LINES = 10;

export const STICKER_PREFIX = '[STICKER]';
export const GIF_PREFIX = '[GIF]';

const renderText = (text, mentionNames) =>
  (text || '').split(URL_RE).map((part, i) => {
    if (/^https?:\/\//.test(part)) {
      return <a key={i} href={part} target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'underline', wordBreak: 'break-all' }}>{part}</a>;
    }
    return (
      <span key={i}>
        {part.split(MENTION_RE).map((seg, j) => (
          /^@[\w.\-]+$/.test(seg) && mentionNames && mentionNames.has(seg.slice(1).toLowerCase())
            ? <b key={j} style={{ background: 'rgba(255,255,255,0.18)', borderRadius: 6, padding: '0 4px' }}>{seg}</b>
            : <span key={j}>{seg}</span>
        ))}
      </span>
    );
  });

function PollCard({ poll, onVote }) {
  const total = poll.options.reduce((a, o) => a + o.votes, 0) || 0;
  return (
    <div style={{ minWidth: 220 }}>
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16, marginBottom: 2 }}>{poll.question}</div>
      <div style={{ fontSize: 11.5, opacity: 0.75, marginBottom: 8 }}>
        {poll.closed ? 'Poll closed' : (poll.multiple ? 'Choose one or more' : 'Choose one')} · {poll.total_voters} {poll.total_voters === 1 ? 'vote' : 'votes'}
      </div>
      {poll.options.map((o) => {
        const pct = total ? Math.round((o.votes / total) * 100) : 0;
        return (
          <button
            key={o.id} type="button" disabled={poll.closed}
            onClick={(e) => { e.stopPropagation(); if (onVote) onVote(o.id); }}
            style={{
              position: 'relative', overflow: 'hidden', display: 'block', width: '100%', textAlign: 'left', marginBottom: 6, padding: '9px 12px',
              border: o.voted_by_me ? '1.5px solid currentColor' : '1.5px solid rgba(255,255,255,0.22)', borderRadius: 12, background: 'rgba(0,0,0,0.16)', color: 'inherit', fontSize: 14,
            }}
          >
            <span style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: `${pct}%`, background: 'rgba(255,255,255,0.18)', transition: 'width .35s' }} />
            <span style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <span>{o.voted_by_me ? '✓ ' : ''}{o.text}</span>
              <b>{o.votes}</b>
            </span>
          </button>
        );
      })}
    </div>
  );
}

// the status a reply was sent about: tap it to see that status full screen
function StatusCard({ st, onOpen }) {
  const src = getPicUrl(st.media_file);
  return (
    <button
      type="button"
      aria-label={`Open ${st.owner}'s status`}
      onClick={(e) => { e.stopPropagation(); onOpen(); }}
      className="d-flex gap-2 mb-1 p-1 pe-2 align-items-center text-start w-100"
      style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 12, border: 0, borderLeft: '3px solid currentColor', color: 'inherit', cursor: 'pointer' }}
    >
      {src && st.media_type === 'image' && <img src={src} alt="" style={{ width: 46, height: 46, objectFit: 'cover', borderRadius: 8 }} />}
      {src && st.media_type === 'video' && <video src={src} muted playsInline preload="metadata" style={{ width: 46, height: 46, objectFit: 'cover', borderRadius: 8, pointerEvents: 'none' }} />}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 11.5, fontWeight: 700 }}>Status · {st.owner}</div>
        <div className="text-truncate" style={{ fontSize: 12, opacity: 0.8, maxWidth: 170 }}>{st.caption || (st.media_type === 'text' ? 'Text status' : 'Photo / video')}</div>
      </div>
    </button>
  );
}

function StatusPeek({ st, onClose }) {
  useBackClose(true, onClose);
  const src = getPicUrl(st.media_file);
  const [gone, setGone] = useState(!src);          // file missing or expired
  return createPortal(
    <div
      role="dialog"
      aria-label={`${st.owner}'s status`}
      onClick={onClose}
      style={{ position: 'fixed', top: 'var(--app-top, 0px)', left: 0, width: '100%', height: 'var(--app-height, 100dvh)', zIndex: 30000, background: '#000', display: 'flex', flexDirection: 'column' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 'calc(var(--safe-top, 0px) + 12px) 14px 10px', color: '#fff', flexShrink: 0 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="text-truncate" style={{ fontWeight: 700, fontSize: 15 }}>{st.owner}'s status</div>
          {st.created_at && <div style={{ fontSize: 12, opacity: 0.65 }}>{formatTime(st.created_at)}</div>}
        </div>
        <button type="button" aria-label="Close status" onClick={onClose} style={{ border: 0, background: 'rgba(255,255,255,0.16)', color: '#fff', width: 38, height: 38, borderRadius: '50%', fontSize: 20, lineHeight: 1 }}>✕</button>
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
        {gone ? (
          <div style={{ color: 'rgba(255,255,255,0.7)', textAlign: 'center', padding: 24 }}>This status is no longer available.</div>
        ) : st.media_type === 'video' ? (
          <video src={src} autoPlay playsInline controls loop onClick={(e) => e.stopPropagation()} onError={() => setGone(true)} style={{ maxWidth: '100%', maxHeight: '100%' }} />
        ) : (
          <img src={src} alt="Status" onError={() => setGone(true)} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
        )}
        {!gone && st.caption && (
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '28px 16px calc(env(safe-area-inset-bottom) + 16px)', background: 'linear-gradient(transparent, rgba(0,0,0,0.75))', color: '#fff', textAlign: 'center', fontSize: 15, whiteSpace: 'pre-wrap', wordBreak: 'break-word', pointerEvents: 'none' }}>{st.caption}</div>
        )}
      </div>
    </div>,
    document.body,
  );
}

export default function MessageBubble({
  msg, isMe, isGroup, T, replyMsg, highlighted, pinned,
  onReply, onDelete, onReact, onPin, onForward, onEdit, onCopy, onSeenBy, onOpenViewOnce,
  onStar, onInfo, onVote, mentionNames,
}) {
  const [menu, setMenu] = useState(false);
  const [up, setUp] = useState(false);                        // open the menu above the bubble when there is no room below
  const rowRef = useRef(null);
  const [viewer, setViewer] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);       // tapped the status a reply was about
  const [picker, setPicker] = useState(false);               // "+" -> pick any emoji as a reaction
  const [expanded, setExpanded] = useState(false);         // long text: "Read more"
  useBackClose(menu, () => setMenu(false));
  useBackClose(picker, () => setPicker(false));
  const [custom, setCustom] = useState(getCustomReactions);   // my own saved reactions
  const touch = useRef({ x: 0, y: 0, timer: null });

  // ---------------------------------------------------------------- system line
  if (msg.message_type === 'system') {
    return (
      <div id={`msg-${msg.id}`} className="sc-note">{msg.content}</div>
    );
  }

  const content = msg.content || '';
  const isViewOnce = content.startsWith('[VIEW_ONCE]');
  const isLong = content.length > LONG_CHARS || content.split('\n').length > LONG_LINES;
  const isAudio = !!msg.voice_note || msg.message_type === 'audio';
  const isVideo = !!msg.file_url && msg.message_type === 'video';
  const isImage = !!msg.file_url && msg.message_type === 'image';
  const isDoc = !!msg.file_url && msg.message_type === 'document';
  const isLocation = msg.message_type === 'location';
  const isPoll = msg.message_type === 'poll' && !!msg.poll;
  const isSticker = content.startsWith(STICKER_PREFIX);
  const isGif = content.startsWith(GIF_PREFIX);
  const canEdit = isMe && msg.message_type === 'text' && !isViewOnce && !isSticker && !isGif && !msg.is_screenshot
    && Date.now() - new Date(msg.created_at).getTime() < EDIT_MS;

  const openMenu = () => {
    const r = rowRef.current && rowRef.current.getBoundingClientRect();
    const h = (window.visualViewport && window.visualViewport.height) || window.innerHeight;
    setUp(!!r && r.bottom + 330 > h - 80 && r.top > 330);
    setMenu(true);
  };

  // ------------------------------------------------ gestures (own refs => no stale state)
  const start = (e) => {
    const t = e.touches[0];
    clearTimeout(touch.current.timer);
    touch.current.x = t.clientX;
    touch.current.y = t.clientY;
    touch.current.timer = setTimeout(openMenu, 550);       // long press
  };
  const move = (e) => {
    const t = e.touches[0];
    if (Math.abs(t.clientX - touch.current.x) > 10 || Math.abs(t.clientY - touch.current.y) > 10) {
      clearTimeout(touch.current.timer);
    }
  };
  const end = (e) => {
    clearTimeout(touch.current.timer);
    const t = e.changedTouches[0];
    if (t.clientX - touch.current.x > 60 && Math.abs(t.clientY - touch.current.y) < 30) onReply(msg);
  };

  // ---------------------------------------------------------------- ticks / seen
  const renderMeta = () => {
    if (!isMe || msg.is_screenshot) return null;
    if (isGroup) {
      const n = (msg.read_by || []).length;
      return n > 0
        ? <span onClick={() => onSeenBy(msg)} style={{ cursor: 'pointer', fontSize: 11 }}> 👁 {n}</span>
        : <BsCheck size={14} />;
    }
    if (msg.status === 'read') return <BsCheckAll size={15} color="#38bdf8" />;
    if (msg.status === 'delivered') return <BsCheckAll size={15} />;
    return <BsCheck size={14} />;
  };

  const act = (fn) => () => { setMenu(false); fn(); };

  return (
    <div
      id={`msg-${msg.id}`}
      ref={rowRef}
      className={`d-flex flex-column ${isMe ? 'align-items-end' : 'align-items-start'} mb-2 position-relative`}
      style={{ transition: 'background .4s', background: highlighted ? 'rgba(250,204,21,0.25)' : 'transparent', borderRadius: 8 }}
    >
      {isGroup && !isMe && <small style={{ color: T.accent, fontSize: 11, marginLeft: 6 }}>{msg.sender_name}</small>}

      <div
        className={`sc-bubble ${isMe ? 'mine' : 'theirs'}${isSticker ? ' sticker' : ''} position-relative`}
        onContextMenu={(e) => { e.preventDefault(); openMenu(); }}
        onTouchStart={start}
        onTouchMove={move}
        onTouchEnd={end}
      >
        {pinned && <div style={{ fontSize: 10, opacity: 0.8 }}>📌 Pinned</div>}
        {msg.forwarded && <div style={{ fontSize: 11, opacity: 0.75, fontStyle: 'italic' }}>↪ Forwarded</div>}

        {replyMsg && (
          <div className="mb-1 px-2 py-1 rounded" style={{ background: 'rgba(0,0,0,0.18)', borderLeft: `3px solid ${T.accent}`, fontSize: 12 }}>
            <b>{replyMsg.sender_name}</b>
            <div className="text-truncate" style={{ maxWidth: 200 }}>{replyMsg.content || replyMsg.file_name || '📎 Attachment'}</div>
          </div>
        )}

        {isViewOnce ? (
          <button
            type="button"
            disabled={isMe}
            onClick={() => !isMe && onOpenViewOnce(msg)}
            className="sc-sealed"
          >
            <Seal size={34} seed={5} />
            {isMe ? 'Sealed photo sent' : 'Tap to break the seal'}
          </button>
        ) : (
          <>
            {isImage && (
              <img
                src={getPicUrl(msg.file_url)} alt="" onClick={() => setViewer(true)}
                style={{ maxWidth: '100%', maxHeight: 280, borderRadius: 10, display: 'block', cursor: 'zoom-in' }}
              />
            )}
            {isVideo && (
              <div className="position-relative" style={{ cursor: 'pointer' }} onClick={() => setViewer(true)}>
                <video src={getPicUrl(msg.file_url)} preload="metadata" playsInline muted style={{ maxWidth: '100%', maxHeight: 280, borderRadius: 10, display: 'block', pointerEvents: 'none' }} />
                <span
                  className="position-absolute top-50 start-50 translate-middle d-flex align-items-center justify-content-center"
                  style={{ width: 46, height: 46, borderRadius: '50%', background: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: 20 }}
                >▶</span>
              </div>
            )}
            {isAudio && <AudioPlayer src={getPicUrl(msg.voice_note || msg.file_url)} isMe={isMe} T={T} />}
            {isDoc && (
              <a href={getPicUrl(msg.file_url)} target="_blank" rel="noreferrer"
                 onClick={(e) => { e.preventDefault(); downloadFile(getPicUrl(msg.file_url), msg.file_name); }}
                 className="d-flex align-items-center gap-2 text-decoration-none" style={{ color: 'inherit', minWidth: 180 }}>
                <span style={{ fontSize: 28 }}>📄</span>
                <span className="flex-grow-1" style={{ minWidth: 0 }}>
                  <div className="fw-bold text-truncate" style={{ maxWidth: 170 }}>{msg.file_name || 'Document'}</div>
                  <small style={{ opacity: 0.75 }}>{formatSize(msg.file_size)}</small>
                </span>
                <span>⬇</span>
              </a>
            )}
            {isPoll && <PollCard poll={msg.poll} onVote={onVote} />}
            {msg.status_preview && <StatusCard st={msg.status_preview} onOpen={() => setStatusOpen(true)} />}
            {isSticker && <div style={{ fontSize: 76, lineHeight: 1.1 }}>{content.slice(STICKER_PREFIX.length)}</div>}
            {isGif && <img src={content.slice(GIF_PREFIX.length)} alt="GIF" style={{ maxWidth: '100%', maxHeight: 240, borderRadius: 12, display: 'block' }} />}
            {content && !isAudio && !isPoll && !isSticker && !isGif && (() => {
              const clamp = isLong && !isLocation && !expanded;
              return (
                <>
                  <div style={{ whiteSpace: 'pre-wrap', marginTop: isImage || isVideo || isDoc ? 6 : 0, ...(clamp ? { display: '-webkit-box', WebkitLineClamp: LONG_LINES, WebkitBoxOrient: 'vertical', overflow: 'hidden' } : null) }}>
                    {isLocation ? <a href={content} target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>📍 Shared location</a> : renderText(content, mentionNames)}
                  </div>
                  {isLong && !isLocation && (
                    <button type="button" onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
                            style={{ display: 'block', marginTop: 4, padding: 0, border: 0, background: 'transparent', color: 'inherit', fontWeight: 700, fontSize: 13.5, textDecoration: 'underline', opacity: 0.9 }}>
                      {expanded ? 'Show less' : 'Read more'}
                    </button>
                  )}
                </>
              );
            })()}
          </>
        )}

        <div className="d-flex justify-content-end align-items-center gap-1" style={{ fontSize: 10, opacity: 0.8, marginTop: 2 }}>
          {msg.is_starred && <BiStar size={12} />}
          {msg.edited_at && <span>edited</span>}
          <span>{formatTime(msg.created_at)}</span>
          {renderMeta()}
          <button type="button" aria-label="Message options" onClick={openMenu} className="btn p-0 border-0" style={{ fontSize: 12, color: 'inherit', lineHeight: 1 }}>⌄</button>
        </div>
      </div>

      {viewer && (isImage || isVideo) && (
        <MediaViewer src={getPicUrl(msg.file_url)} type={isVideo ? 'video' : 'image'} name={msg.file_name} onClose={() => setViewer(false)} />
      )}

      {statusOpen && msg.status_preview && <StatusPeek st={msg.status_preview} onClose={() => setStatusOpen(false)} />}

      {picker && createPortal(
        <div
          onClick={() => setPicker(false)}
          style={{ position: 'fixed', top: 'var(--app-top, 0px)', left: 0, width: '100%', height: 'var(--app-height, 100dvh)', zIndex: 30000, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 380 }}>
            {custom.length > 0 && (
              <div className="mb-2 p-2" style={{ background: T.light ? '#fff' : (T.raised || '#261C33'), border: `1px solid ${T.accent}`, borderRadius: 14, color: T.light ? '#1f2937' : '#fff' }}>
                <div className="small mb-1" style={{ opacity: 0.7 }}>My reactions (tap ✕ to remove)</div>
                <div className="d-flex flex-wrap gap-2">
                  {custom.map((e) => (
                    <span key={e} className="d-inline-flex align-items-center gap-1 px-2 rounded-pill" style={{ background: 'rgba(128,128,128,0.2)', fontSize: 18 }}>
                      {e}
                      <button type="button" className="btn p-0 border-0" style={{ fontSize: 12, color: 'inherit', lineHeight: 1 }} onClick={() => setCustom(removeCustomReaction(e))}>✕</button>
                    </span>
                  ))}
                </div>
              </div>
            )}
            <div className="text-center small mb-1" style={{ color: '#fff' }}>Pick an emoji. It is saved in your reactions and sent now.</div>
            <EmojiPicker
              T={T}
              onPick={(e) => { setCustom(addCustomReaction(e)); setPicker(false); onReact(msg, e); }}
            />
          </div>
        </div>,
        document.body,
      )}

      {msg.reactions && Object.keys(msg.reactions).length > 0 && (
        <div className="d-flex gap-1 px-2 rounded-pill shadow-sm" style={{ marginTop: -8, fontSize: 13, background: 'var(--raised)', border: '1px solid var(--line)', zIndex: 1, padding: '1px 6px' }}>
          {Object.values(msg.reactions).map((e, i) => <span key={i}>{e}</span>)}
        </div>
      )}

      {menu && (
        <>
          <div onClick={() => setMenu(false)} style={{ position: 'fixed', inset: 0, zIndex: 1900 }} />
          <div
            className="shadow-lg"
            style={{ position: 'absolute', zIndex: 2000, [up ? 'bottom' : 'top']: '100%', [isMe ? 'right' : 'left']: 0, background: 'var(--raised)', color: 'var(--text)', border: '1px solid var(--line)', borderRadius: 18, padding: 8, minWidth: 220, boxShadow: '0 18px 40px rgba(0,0,0,.45)' }}
          >
            {!isViewOnce && !msg.is_screenshot && (
              <div className="d-flex flex-wrap align-items-center gap-1 pb-2 mb-2" style={{ maxWidth: 260, borderBottom: '1px solid var(--line)' }}>
                {[...DEFAULT_REACTIONS, ...custom].map((e) => (
                  <button key={e} type="button" className="btn p-0 border-0" style={{ fontSize: 22, lineHeight: 1.15, width: 33, height: 36 }} onClick={act(() => onReact(msg, e))}>{e}</button>
                ))}
                <button type="button" aria-label="More reactions" className="sc-iconbtn" style={{ width: 32, height: 32, fontSize: 18 }} onClick={act(() => setPicker(true))}>+</button>
              </div>
            )}
            <div className="d-flex flex-wrap justify-content-between align-items-center mb-2" style={{ maxWidth: 260 }}>
              {[
                ['Reply', () => onReply(msg), true],
                ['Forward', () => onForward(msg), !isViewOnce && !msg.is_screenshot && !isPoll],
                ['Copy', () => onCopy(msg), !!content && !isViewOnce && !isPoll],
                [msg.is_starred ? 'Remove star' : 'Star', () => onStar && onStar(msg), !!onStar && !isViewOnce],
                ['Edit', () => onEdit(msg), canEdit],
                [pinned ? 'Unpin' : 'Pin', () => onPin(msg), !isViewOnce],
                ['Seen by', () => onSeenBy(msg), isMe && isGroup],
                ['Message info', () => onInfo && onInfo(msg), !!onInfo && isMe && !isGroup && !msg.is_screenshot],
                ['Delete', () => onDelete(msg), true],
              ].filter((x) => x[2]).map(([label, fn]) => (
                <button key={label} className="btn btn-sm text-start" style={{ color: label === 'Delete' ? '#ff7d8c' : 'var(--text)' }} onClick={act(fn)}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
