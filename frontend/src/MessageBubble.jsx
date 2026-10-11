import React, { useRef, useState } from 'react';
import { BsCheck, BsCheckAll } from 'react-icons/bs';
import AudioPlayer from './AudioPlayer';
import { getPicUrl, formatSize, formatTime } from './config';

const EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
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
            {isImage && <img src={getPicUrl(msg.file_url)} alt="" style={{ maxWidth: '100%', maxHeight: 280, borderRadius: 10, display: 'block' }} />}
            {isVideo && <video src={getPicUrl(msg.file_url)} controls style={{ maxWidth: '100%', maxHeight: 280, borderRadius: 10 }} />}
            {isAudio && <AudioPlayer src={getPicUrl(msg.voice_note || msg.file_url)} isMe={isMe} T={T} />}
            {isDoc && (
              <a href={getPicUrl(msg.file_url)} target="_blank" rel="noreferrer" download
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
            <div className="d-flex justify-content-between mb-2">
              {EMOJIS.map((e) => (
                <button key={e} className="btn p-1" style={{ fontSize: 20 }} onClick={act(() => onReact(msg, e))}>{e}</button>
              ))}
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
