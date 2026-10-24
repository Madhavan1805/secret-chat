import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { BiX, BiDownload } from 'react-icons/bi';

// Save a file from the server to the phone. A plain <a download> is ignored for files that live on
// another domain (our API), so fetch the file first and save the blob. If the server does not allow
// that, fall back to opening the file in a new tab.
export async function downloadFile(url, fileName) {
  const name = fileName || (url.split('?')[0].split('/').pop() || 'file');
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('bad response');
    const blob = await res.blob();
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 4000);
    return true;
  } catch (e) {
    window.open(url, '_blank', 'noopener');
    return false;
  }
}

// Full-screen viewer for chat photos / videos. Rendered into <body> so no parent can clip it.
export default function MediaViewer({ src, type, name, onClose }) {
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  const save = async () => {
    if (busy) return;
    setBusy(true);
    await downloadFile(src, name);
    setBusy(false);
  };

  const btn = {
    width: 42, height: 42, borderRadius: '50%', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(255,255,255,0.16)', color: '#fff', cursor: 'pointer',
  };

  return createPortal(
    <div
      style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: 'var(--app-height, 100dvh)', zIndex: 30000, background: 'rgba(0,0,0,0.96)', display: 'flex', flexDirection: 'column' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'calc(var(--safe-top, 0px) + 10px) 12px 10px', flexShrink: 0 }}>
        <button type="button" style={btn} onClick={onClose} title="Close"><BiX size={26} /></button>
        <button type="button" style={{ ...btn, opacity: busy ? 0.5 : 1 }} onClick={save} title="Download"><BiDownload size={22} /></button>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 8 }} onClick={type === 'image' ? onClose : undefined}>
        {type === 'video' ? (
          <video src={src} controls autoPlay playsInline style={{ maxWidth: '100%', maxHeight: '100%' }} onClick={(e) => e.stopPropagation()} />
        ) : (
          <img src={src} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} onClick={(e) => e.stopPropagation()} />
        )}
      </div>
    </div>,
    document.body,
  );
}
