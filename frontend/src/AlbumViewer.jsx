import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BiX, BiDownload, BiChevronLeft, BiChevronRight, BiCheck } from 'react-icons/bi';
import { useBackClose } from './backClose';
import { downloadFile } from './MediaViewer';

// Album gallery: grid of every photo, "Select" to pick the ones you want and download them,
// tap a photo to open it full screen and swipe left / right through the album.
const ext = (u) => { const m = /\.([a-z0-9]{3,4})(\?|$)/i.exec(u || ''); return m ? m[1] : 'jpg'; };

function Pager({ photos, start, title, onClose }) {
  const [i, setI] = useState(start);
  const [dx, setDx] = useState(0);
  const [busy, setBusy] = useState(false);
  const t0 = useRef(null);
  const go = (n) => setI((c) => Math.min(photos.length - 1, Math.max(0, c + n)));
  useEffect(() => {
    const key = (e) => { if (e.key === 'ArrowRight') go(1); else if (e.key === 'ArrowLeft') go(-1); else if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);              // eslint-disable-line react-hooks/exhaustive-deps
  const p = photos[i];
  const save = async () => { setBusy(true); await downloadFile(p.url, `${title || 'album'}-${i + 1}.${ext(p.url)}`); setBusy(false); };
  return (
    <div className="av-pager" onClick={(e) => e.stopPropagation()}
      onTouchStart={(e) => { t0.current = e.touches[0].clientX; setDx(0); }}
      onTouchMove={(e) => { if (t0.current != null) setDx(e.touches[0].clientX - t0.current); }}
      onTouchEnd={() => { if (dx < -60) go(1); else if (dx > 60) go(-1); t0.current = null; setDx(0); }}>
      <div className="av-bar">
        <button type="button" className="av-ic" onClick={onClose} aria-label="Back"><BiX /></button>
        <span className="av-count">{i + 1} / {photos.length}</span>
        <button type="button" className="av-ic" onClick={save} disabled={busy} aria-label="Download this photo"><BiDownload /></button>
      </div>
      <div className="av-slide" style={{ transform: `translateX(${dx}px)` }}>
        <img key={p.id} src={p.url} alt="" draggable={false} />
      </div>
      {i > 0 && <button type="button" className="av-nav l" onClick={() => go(-1)} aria-label="Previous"><BiChevronLeft /></button>}
      {i < photos.length - 1 && <button type="button" className="av-nav r" onClick={() => go(1)} aria-label="Next"><BiChevronRight /></button>}
      <div className="av-by">by {p.by}</div>
    </div>
  );
}

export default function AlbumGallery({ album, startIndex = null, onClose }) {
  useBackClose(true, onClose);
  const photos = album.photos || [];
  const [open, setOpen] = useState(startIndex);
  const [select, setSelect] = useState(false);
  const [picked, setPicked] = useState([]);
  const [prog, setProg] = useState('');
  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const downloadPicked = async () => {
    const list = photos.filter((p) => picked.includes(p.id));
    for (let k = 0; k < list.length; k += 1) {
      setProg(`${k + 1}/${list.length}`);
      // eslint-disable-next-line no-await-in-loop
      await downloadFile(list[k].url, `${album.title || 'album'}-${photos.indexOf(list[k]) + 1}.${ext(list[k].url)}`);
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 350));
    }
    setProg(''); setSelect(false); setPicked([]);
  };
  return createPortal(
    <div className="av-root" role="dialog" aria-label={`Album ${album.title}`} onClick={(e) => e.stopPropagation()}>
      <div className="av-head">
        <button type="button" className="av-ic" onClick={onClose} aria-label="Close"><BiX /></button>
        <div className="av-title"><b>{album.title}</b><small>{photos.length} photo{photos.length === 1 ? '' : 's'}</small></div>
        <button type="button" className="av-sel" onClick={() => { setSelect(!select); setPicked([]); }}>{select ? 'Cancel' : 'Select'}</button>
      </div>
      <div className="av-grid">
        {photos.map((p, i) => {
          const on = picked.includes(p.id);
          return (
            <button type="button" key={p.id} className={`av-cell${on ? ' on' : ''}`} onClick={() => (select ? toggle(p.id) : setOpen(i))}>
              <img src={p.url} alt="" loading="lazy" />
              {select && <span className="av-tick">{on ? <BiCheck /> : null}</span>}
            </button>
          );
        })}
      </div>
      {select && (
        <div className="av-foot">
          <button type="button" className="av-link" onClick={() => setPicked(picked.length === photos.length ? [] : photos.map((p) => p.id))}>{picked.length === photos.length ? 'Clear' : 'Select all'}</button>
          <button type="button" className="av-dl" disabled={!picked.length || !!prog} onClick={downloadPicked}>
            <BiDownload /> {prog ? `Saving ${prog}…` : picked.length ? `Download ${picked.length}` : 'Pick photos'}
          </button>
        </div>
      )}
      {open !== null && <Pager photos={photos} start={open} title={album.title} onClose={() => setOpen(null)} />}
    </div>,
    document.body,
  );
}
