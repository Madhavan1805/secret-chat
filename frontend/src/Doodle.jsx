import React, { useEffect, useRef, useState } from 'react';
import { BiUndo, BiTrash } from 'react-icons/bi';
import { Sheet } from './ui';

const COLORS = ['#111111', '#ffffff', '#ff3b30', '#ff9500', '#ffd60a', '#34c759', '#0a84ff', '#bf5af2'];
const BGS = ['#ffffff', '#111111', '#fff3b0', '#cdeffd'];
const SIZE = 900;

// Quick sketch pad: draw with a finger, send it as a picture.
export default function Doodle({ T, onClose, onDone }) {
  const cv = useRef(null);
  const [color, setColor] = useState('#111111');
  const [bg, setBg] = useState('#ffffff');
  const [width, setWidth] = useState(8);
  const [strokes, setStrokes] = useState([]);
  const cur = useRef(null);

  useEffect(() => {
    const c = cv.current;
    c.width = SIZE; c.height = SIZE;
    const ctx = c.getContext('2d');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    strokes.forEach((s) => {
      ctx.strokeStyle = s.color; ctx.lineWidth = s.w;
      ctx.beginPath();
      s.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      if (s.pts.length === 1) ctx.lineTo(s.pts[0][0] + 0.01, s.pts[0][1]);
      ctx.stroke();
    });
  }, [strokes, bg]);

  const pt = (e) => { const r = cv.current.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * SIZE, ((e.clientY - r.top) / r.height) * SIZE]; };
  const down = (e) => { e.currentTarget.setPointerCapture(e.pointerId); cur.current = true; setStrokes((p) => [...p, { color, w: width, pts: [pt(e)] }]); };
  const move = (e) => { if (!cur.current) return; const q = pt(e); setStrokes((p) => p.map((s, i) => (i === p.length - 1 ? { ...s, pts: [...s.pts, q] } : s))); };
  const up = () => { cur.current = false; };

  const send = () => cv.current.toBlob((b) => { if (b) { onDone(new File([b], 'doodle.png', { type: 'image/png' })); onClose(); } }, 'image/png');

  return (
    <Sheet T={T} title="Doodle" onClose={onClose}>
      <canvas ref={cv} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
        style={{ width: '100%', aspectRatio: '1', borderRadius: 16, touchAction: 'none', border: '1px solid var(--line)', background: bg }} />
      <div style={{ display: 'flex', gap: 8, margin: '12px 0 8px', flexWrap: 'wrap', alignItems: 'center' }}>
        {COLORS.map((c) => <button type="button" key={c} aria-label={`Colour ${c}`} onClick={() => setColor(c)} style={{ width: 28, height: 28, borderRadius: '50%', background: c, border: color === c ? '3px solid var(--accent)' : '2px solid rgba(127,127,127,.5)' }} />)}
        <input type="range" min="3" max="30" value={width} onChange={(e) => setWidth(+e.target.value)} aria-label="Brush size" style={{ flex: 1, minWidth: 90 }} />
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        <span style={{ color: 'var(--sub)', fontSize: 13 }}>Paper</span>
        {BGS.map((c) => <button type="button" key={c} aria-label={`Paper ${c}`} onClick={() => setBg(c)} style={{ width: 24, height: 24, borderRadius: 6, background: c, border: bg === c ? '3px solid var(--accent)' : '2px solid rgba(127,127,127,.5)' }} />)}
        <span style={{ flex: 1 }} />
        <button type="button" className="sc-iconbtn" aria-label="Undo" disabled={!strokes.length} onClick={() => setStrokes((p) => p.slice(0, -1))}><BiUndo /></button>
        <button type="button" className="sc-iconbtn" aria-label="Clear" disabled={!strokes.length} onClick={() => setStrokes([])}><BiTrash /></button>
      </div>
      <button type="button" className="sc-btn" style={{ width: '100%' }} disabled={!strokes.length} onClick={send}>Send doodle</button>
    </Sheet>
  );
}
