import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { BiX, BiPlus, BiTrash, BiSend } from 'react-icons/bi';

// WhatsApp-style review screen for photos / videos picked to send: big preview, thumbnails, caption, send.
const isImg = (f) => (f.type || '').startsWith('image');
const isVid = (f) => (f.type || '').startsWith('video');

export default function MediaPreview({ files, caption, setCaption, sending, progress, onRemove, onAdd, onClose, onSend, viewOnce, onToggleViewOnce, name }) {
  const [cur, setCur] = useState(0);
  const urls = useMemo(() => files.map((f) => ((isImg(f) || isVid(f)) ? URL.createObjectURL(f) : null)), [files]);
  useEffect(() => () => urls.forEach((u) => u && URL.revokeObjectURL(u)), [urls]);
  useEffect(() => { if (cur >= files.length) setCur(Math.max(0, files.length - 1)); }, [files.length, cur]);
  const f = files[cur];
  if (!f) return null;
  return createPortal(
    <div className="mp-root" role="dialog" aria-label="Review before sending">
      <div className="mp-top">
        <button type="button" className="mp-ic" onClick={onClose} disabled={sending} aria-label="Cancel"><BiX /></button>
        <span style={{ flex: 1 }} />
        <button type="button" className="mp-ic" onClick={() => onRemove(cur)} disabled={sending} aria-label="Remove this one"><BiTrash /></button>
      </div>
      <div className="mp-stage">
        {isImg(f) && <img src={urls[cur]} alt="" />}
        {isVid(f) && <video src={urls[cur]} controls playsInline />}
        {!isImg(f) && !isVid(f) && <div className="mp-doc">📄<span>{f.name}</span></div>}
      </div>
      <div className="mp-bottom">
        {files.length > 0 && (
          <div className="mp-thumbs hide-scroll">
            {files.map((x, i) => (
              <button type="button" key={`${x.name}-${i}`} className={`mp-th${i === cur ? ' on' : ''}`} onClick={() => setCur(i)} aria-label={`File ${i + 1}`}>
                {isImg(x) ? <img src={urls[i]} alt="" /> : isVid(x) ? <video src={urls[i]} muted /> : <span>📄</span>}
                {isVid(x) && <i className="mp-play">▶</i>}
              </button>
            ))}
            <button type="button" className="mp-th add" onClick={onAdd} disabled={sending} aria-label="Add more"><BiPlus /></button>
          </div>
        )}
        <div className="mp-bar">
          <div className="mp-cap">
            <input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Add a caption…" maxLength={1000} aria-label="Caption" disabled={sending}
              onKeyDown={(e) => { if (e.key === 'Enter' && !sending) onSend(); }} />
            <button type="button" className={`mp-once${viewOnce ? ' on' : ''}`} onClick={onToggleViewOnce} aria-pressed={viewOnce} aria-label="View once" title="View once">1</button>
          </div>
          <button type="button" className="mp-send" onClick={onSend} disabled={sending} aria-label="Send">{sending ? (progress || '…') : <BiSend />}</button>
        </div>
        {name && <div className="mp-to">To {name}</div>}
      </div>
    </div>,
    document.body,
  );
}
