import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BiRotateRight } from 'react-icons/bi';
import { Sheet } from './ui';

// Profile photo: drag to move, pinch / slider / mouse wheel to zoom, rotate, and the circle is exactly what gets saved.
const OUT = 512;                      // saved size in pixels
const MAX_SRC = 2048;                 // the working copy is never bigger than this

function loadImage(file) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); res(img); };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('bad image')); };
    img.src = url;
  });
}

function toCanvas(img, quarter) {
  const k = Math.min(1, MAX_SRC / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * k), h = Math.round(img.naturalHeight * k);
  const turned = quarter % 2 === 1;
  const c = document.createElement('canvas');
  c.width = turned ? h : w; c.height = turned ? w : h;
  const ctx = c.getContext('2d');
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate((quarter * Math.PI) / 2);
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  return c;
}

export default function PhotoCropper({ T, file, onCancel, onDone, title = 'Adjust photo' }) {
  const [img, setImg] = useState(null);
  const [quarter, setQuarter] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [off, setOff] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const [bad, setBad] = useState(false);
  const [side, setSide] = useState(300);
  const stageRef = useRef(null);
  const shown = useRef(null);
  const pointers = useRef(new Map());
  const last = useRef(null);

  useEffect(() => { loadImage(file).then(setImg).catch(() => setBad(true)); }, [file]);
  const src = useMemo(() => (img ? toCanvas(img, quarter) : null), [img, quarter]);
  const D = side * 0.82;                                  // the circle
  const base = src ? D / Math.min(src.width, src.height) : 1;
  const s = base * zoom;

  useEffect(() => {
    const fit = () => setSide(Math.min(window.innerWidth - 32, 380));
    fit(); window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  // keep the picture covering the circle
  const clamp = (o, z = zoom) => {
    if (!src) return o;
    const sc = base * z;
    const mx = Math.max(0, (src.width * sc - D) / 2), my = Math.max(0, (src.height * sc - D) / 2);
    return { x: Math.min(mx, Math.max(-mx, o.x)), y: Math.min(my, Math.max(-my, o.y)) };
  };
  useEffect(() => { setOff((o) => clamp(o)); }, [zoom, quarter, side, !!src]);

  // paint the working copy into the visible canvas
  useEffect(() => {
    const c = shown.current;
    if (!c || !src) return;
    c.width = src.width; c.height = src.height;
    c.getContext('2d').drawImage(src, 0, 0);
  }, [src]);

  const down = (e) => { e.currentTarget.setPointerCapture(e.pointerId); pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY }); last.current = null; };
  const move = (e) => {
    const p = pointers.current;
    if (!p.has(e.pointerId)) return;
    const prev = p.get(e.pointerId);
    p.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (p.size === 2) {                                   // pinch
      const [a, b] = [...p.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (last.current) setZoom((z) => Math.min(4, Math.max(1, z * (d / last.current))));
      last.current = d;
    } else if (p.size === 1) {
      setOff((o) => clamp({ x: o.x + e.clientX - prev.x, y: o.y + e.clientY - prev.y }));
    }
  };
  const up = (e) => { pointers.current.delete(e.pointerId); last.current = null; };
  const wheel = (e) => setZoom((z) => Math.min(4, Math.max(1, z * (e.deltaY < 0 ? 1.08 : 0.93))));

  const save = () => {
    if (!src) return;
    setBusy(true);
    const out = document.createElement('canvas');
    out.width = OUT; out.height = OUT;
    const side_ = D / s;                                  // the circle, in source pixels
    const sx = src.width / 2 - off.x / s - side_ / 2;
    const sy = src.height / 2 - off.y / s - side_ / 2;
    out.getContext('2d').drawImage(src, sx, sy, side_, side_, 0, 0, OUT, OUT);
    out.toBlob((blob) => {
      setBusy(false);
      if (blob) onDone(new File([blob], 'profile.jpg', { type: 'image/jpeg' }));
    }, 'image/jpeg', 0.92);
  };

  return (
    <Sheet T={T} title={title} onClose={onCancel}
      right={<button type="button" className="sc-btn" style={{ height: 36, padding: '0 18px' }} disabled={!src || busy} onClick={save}>{busy ? 'Saving…' : 'Done'}</button>}>
      {bad && <p className="text-danger" style={{ textAlign: 'center' }}>Could not open that picture. Try another one.</p>}
      <div className="pc-stage" ref={stageRef} style={{ width: side, height: side }} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onWheel={wheel}>
        {src && (
          <canvas ref={shown} className="pc-img" style={{ width: src.width * s, height: src.height * s, transform: `translate(calc(-50% + ${off.x}px), calc(-50% + ${off.y}px))` }} />
        )}
        <div className="pc-hole" style={{ width: D, height: D }} />
      </div>
      <div className="pc-tools">
        <input type="range" min="1" max="4" step="0.01" value={zoom} onChange={(e) => setZoom(Number(e.target.value))} aria-label="Zoom" />
        <button type="button" className="sc-iconbtn" onClick={() => { setQuarter((q) => (q + 1) % 4); setOff({ x: 0, y: 0 }); }} aria-label="Rotate"><BiRotateRight /></button>
      </div>
      <p className="px-note" style={{ textAlign: 'center' }}>Drag to move, pinch or use the slider to zoom. The circle is what friends will see.</p>
    </Sheet>
  );
}
