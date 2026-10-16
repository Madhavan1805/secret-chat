import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BsCheck, BsCheckAll } from 'react-icons/bs';
import AudioPlayer from './AudioPlayer';
import MediaViewer, { downloadFile } from './MediaViewer';
import EmojiPicker from './EmojiPicker';
import { DEFAULT_REACTIONS, getCustomReactions, addCustomReaction, removeCustomReaction } from './reactions';
import { getPicUrl, formatSize, formatTime } from './config';

const URL_RE = /(https?:\/\/[^\s]+)/g;
const EDIT_MS = 5 * 60 * 1000;

const renderText = (text) =>
  (text || '').split(URL_RE).map((part, i) =>
    /^https?:\/\//.test(part)
      ? <a key={i} href={part} target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'underline', wordBreak: 'break-all' }}>{part}</a>
      : <span key={i}>{part}</span>);

export default function MessageBubble({
  msg, isMe, isGroup, T, replyMsg, highlighted, pinned,
  onReply, onDelete, onReact, onPin, onForward, onEdit, onCopy, onSeenBy, onOpenViewOnce,
}) {
  const [menu, setMenu] = useState(false);
  const [viewer, setViewer] = useState(false);
  const [picker, setPicker] = useState(false);               // "+" -> pick any emoji as a reaction
  const [custom, setCustom] = useState(getCustomReactions);   // my own saved reactions
  const touch = useRef({ x: 0, y: 0, timer: null });

  // ---------------------------------------------------------------- system line
  if (msg.message_type === 'system') {
    return (
      <div id={`msg-${msg.id}`} className="text-center my-2">
        <span className="px-3 py-1 rounded-pill small" style={{ background: T.panel, color: T.sub, fontSize: 12 }}>{msg.content}</span>
      </div>
    );
  }

  const content = msg.content || '';
  const isViewOnce = content.startsWith('[VIEW_ONCE]');
  const isAudio = !!msg.voice_note || msg.message_type === 'audio';
  const isVideo = !!msg.file_url && msg.message_type === 'video';
  const isImage = !!msg.file_url && msg.message_type === 'image';
  const isDoc = !!msg.file_url && msg.message_type === 'document';
  const isLocation = msg.message_type === 'location';
  const canEdit = isMe && msg.message_type === 'text' && !isViewOnce && !msg.is_screenshot
    && Date.now() - new Date(msg.created_at).getTime() < EDIT_MS;

  // ------------------------------------------------ gestures (own refs => no stale state)
  const start = (e) => {
    const t = e.touches[0];
    clearTimeout(touch.current.timer);
    touch.current.x = t.clientX;
    touch.current.y = t.clientY;
    touch.current.timer = setTimeout(() => setMenu(true), 550);       // long press
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

  const bubbleStyle = isMe
    ? { background: T.mine, color: T.mineText, borderBottomRightRadius: 4 }
    : { background: T.other, color: T.text, borderBottomLeftRadius: 4 };

  const act = (fn) => () => { setMenu(false); fn(); };

  return (
    <div
      id={`msg-${msg.id}`}
      className={`d-flex flex-column ${isMe ? 'align-items-end' : 'align-items-start'} mb-2 position-relative`}
      style={{ transition: 'background .4s', background: highlighted ? 'rgba(250,204,21,0.25)' : 'transparent', borderRadius: 8 }}
    >
      {isGroup && !isMe && <small style={{ color: T.accent, fontSize: 11, marginLeft: 6 }}>{msg.sender_name}</small>}

      <div
        className="px-3 py-2 shadow-sm position-relative"
        style={{ ...bubbleStyle, maxWidth: '78%', borderRadius: 16, userSelect: 'none', wordBreak: 'break-word' }}
        onContextMenu={(e) => { e.preventDefault(); setMenu(true); }}
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
            disabled={isMe}
            onClick={() => !isMe && onOpenViewOnce(msg)}
            className="btn btn-sm rounded-pill px-3 py-1 fw-bold"
            style={{ border: `1px solid ${isMe ? T.mineText : T.accent}`, color: isMe ? T.mineText : T.accent }}
          >
            {isMe ? '💣 View Once sent' : '💣 Tap to View Once'}
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
            {content && !isAudio && (
              <div style={{ whiteSpace: 'pre-wrap', marginTop: isImage || isVideo || isDoc ? 6 : 0 }}>
                {isLocation ? <a href={content} target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>📍 Shared location</a> : renderText(content)}
              </div>
            )}
          </>
        )}

        <div className="d-flex justify-content-end align-items-center gap-1" style={{ fontSize: 10, opacity: 0.8, marginTop: 2 }}>
          {msg.edited_at && <span>edited</span>}
          <span>{formatTime(msg.created_at)}</span>
          {renderMeta()}
          <button onClick={() => setMenu(true)} className="btn p-0 border-0" style={{ fontSize: 12, color: 'inherit', lineHeight: 1 }}>⌄</button>
        </div>
      </div>

      {viewer && (isImage || isVideo) && (
        <MediaViewer src={getPicUrl(msg.file_url)} type={isVideo ? 'video' : 'image'} name={msg.file_name} onClose={() => setViewer(false)} />
      )}

      {picker && createPortal(
        <div
          onClick={() => setPicker(false)}
          style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: 'var(--app-height, 100dvh)', zIndex: 30000, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 380 }}>
            {custom.length > 0 && (
              <div className="mb-2 p-2" style={{ background: T.light ? '#fff' : '#26121a', border: `1px solid ${T.accent}`, borderRadius: 14, color: T.light ? '#1f2937' : '#fff' }}>
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
        <div className="d-flex gap-1 px-2 rounded-pill shadow-sm" style={{ marginTop: -6, fontSize: 12, background: T.light ? '#fff' : '#1f1f1f', border: `1px solid ${T.accent}66`, zIndex: 1 }}>
          {Object.values(msg.reactions).map((e, i) => <span key={i}>{e}</span>)}
        </div>
      )}

      {menu && (
        <>
          <div onClick={() => setMenu(false)} style={{ position: 'fixed', inset: 0, zIndex: 1900 }} />
          <div
            className="shadow-lg"
            style={{ position: 'absolute', zIndex: 2000, top: '100%', [isMe ? 'right' : 'left']: 0, background: T.light ? '#fff' : '#26121a', color: T.text, border: `1px solid ${T.accent}`, borderRadius: 14, padding: 8, minWidth: 220 }}
          >
            <div className="d-flex flex-wrap justify-content-between align-items-center mb-2" style={{ maxWidth: 260 }}>
              {[...DEFAULT_REACTIONS, ...custom].map((e) => (
                <button key={e} className="btn p-1" style={{ fontSize: 20 }} onClick={act(() => onReact(msg, e))}>{e}</button>
              ))}
              <button
                className="btn p-0 d-flex align-items-center justify-content-center" title="Add a reaction"
                style={{ width: 28, height: 28, borderRadius: '50%', fontSize: 18, lineHeight: 1, background: 'rgba(128,128,128,0.25)', color: T.text }}
                onClick={() => { setMenu(false); setPicker(true); }}
              >+</button>
            </div>
            <div className="d-flex flex-column">
              {[
                ['↩ Reply', () => onReply(msg), true],
                ['↪ Forward', () => onForward(msg), !isViewOnce && !msg.is_screenshot],
                ['📋 Copy', () => onCopy(msg), !!content && !isViewOnce],
                ['✏️ Edit', () => onEdit(msg), canEdit],
                [pinned ? '📌 Unpin' : '📌 Pin', () => onPin(msg), !isViewOnce],
                ['👁 Seen by', () => onSeenBy(msg), isMe && isGroup],
                ['🗑 Delete', () => onDelete(msg), true],
              ].filter((x) => x[2]).map(([label, fn]) => (
                <button key={label} className="btn btn-sm text-start" style={{ color: label.startsWith('🗑') ? '#f87171' : T.text }} onClick={act(fn)}>
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
