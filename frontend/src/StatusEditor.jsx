import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { BiMusic, BiCrop, BiSmile, BiText, BiPencil, BiUndo, BiTrash, BiRotateRight, BiCheck, BiX } from 'react-icons/bi';
import EmojiPicker from './EmojiPicker';

// Photo status editor: crop / rotate, text, emoji, drawing. Everything is drawn into one picture when the status is posted.
const MAX_SIDE = 1600;
const COLORS = ['#ffffff', '#111111', '#ff3b30', '#ff9500', '#ffd60a', '#34c759', '#0a84ff', '#bf5af2', '#ff2d92'];
const ASPECTS = [['Free', 0], ['1:1', 1], ['4:5', 4 / 5], ['9:16', 9 / 16], ['16:9', 16 / 9]];
const TEXT_FONT = '"Fredoka","Noto Sans Tamil",system-ui,sans-serif';
const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
let uid = 0;

const loadImage = (file) => new Promise((res, rej) => {
  const url = URL.createObjectURL(file);
  const im = new Image();
  im.onload = () => { URL.revokeObjectURL(url); res(im); };
  im.onerror = () => { URL.revokeObjectURL(url); rej(new Error('bad image')); };
  im.src = url;
});

const toBase = (im) => {
  const k = Math.min(1, MAX_SIDE / Math.max(im.naturalWidth, im.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k);
  c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
  return c;
};

function paintStrokes(ctx, W, H, strokes) {
  strokes.forEach((s) => {
    if (!s.pts.length) return;
    ctx.strokeStyle = s.color; ctx.lineWidth = s.w * W; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    s.pts.forEach(([x, y], i) => { if (i) ctx.lineTo(x * W, y * H); else ctx.moveTo(x * W, y * H); });
    if (s.pts.length === 1) ctx.lineTo(s.pts[0][0] * W + 0.01, s.pts[0][1] * H);
    ctx.stroke();
  });
}

function paintItems(ctx, W, H, items) {
  items.forEach((it) => {
    const px = it.size * W;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = it.kind === 'emoji' ? `${px}px ${EMOJI_FONT}` : `700 ${px}px ${TEXT_FONT}`;
    ctx.fillStyle = it.color || '#fff';
    if (it.kind === 'text') { ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = px * 0.12; }
    const lines = String(it.text).split('\n');
    lines.forEach((ln, i) => ctx.fillText(ln, it.x * W, it.y * H + (i - (lines.length - 1) / 2) * px * 1.2));
    ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';
  });
}

const StatusEditor = forwardRef(function StatusEditor({ file, T, onMusic, hasSong }, ref) {
  const [base, setBase] = useState(null);
  const [bad, setBad] = useState(false);
  const [edited, setEdited] = useState(false);              // cropped or rotated
  const [items, setItems] = useState([]);
  const [strokes, setStrokes] = useState([]);
  const [tool, setTool] = useState(null);                    // null | crop | draw | text | emoji
  const [sel, setSel] = useState(null);
  const [color, setColor] = useState('#ffffff');
  const [draft, setDraft] = useState(null);                  // text being typed { id?, text, color }
  const [crop, setCrop] = useState(null);                    // { x, y, w, h } as fractions of the picture
  const [aspect, setAspect] = useState(0);
  const [box, setBox] = useState({ w: 280, h: 400 });
  const wrap = useRef(null);
  const canvas = useRef(null);
  const drawing = useRef(null);
  const dragging = useRef(null);
  const cropDrag = useRef(null);

  useEffect(() => { loadImage(file).then((im) => setBase(toBase(im))).catch(() => setBad(true)); }, [file]);

  // the picture, fitted into the free space
  useEffect(() => {
    if (!wrap.current || !base) return undefined;
    const fit = () => {
      const r = wrap.current.getBoundingClientRect();
      const cw = Math.max(80, r.width - 8), ch = Math.max(80, r.height - 8);
      const k = Math.min(cw / base.width, ch / base.height);
      setBox({ w: Math.round(base.width * k), h: Math.round(base.height * k) });
    };
    fit();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null;
    if (ro) ro.observe(wrap.current);
    window.addEventListener('resize', fit);
    return () => { if (ro) ro.disconnect(); window.removeEventListener('resize', fit); };
  }, [base]);

  // picture + drawing on the visible canvas
  useEffect(() => {
    const c = canvas.current;
    if (!c || !base) return;
    c.width = base.width; c.height = base.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(base, 0, 0);
    paintStrokes(ctx, base.width, base.height, strokes);
  }, [base, strokes]);

  // ------------------------------------------------ what the parent can ask for
  useImperativeHandle(ref, () => ({
    isDirty: () => edited || items.length > 0 || strokes.length > 0,
    exportFile: () => new Promise((resolve) => {
      if (!base) { resolve(file); return; }
      const out = document.createElement('canvas');
      out.width = base.width; out.height = base.height;
      const ctx = out.getContext('2d');
      ctx.drawImage(base, 0, 0);
      paintStrokes(ctx, out.width, out.height, strokes);
      paintItems(ctx, out.width, out.height, items);
      out.toBlob((b) => resolve(b ? new File([b], 'status.jpg', { type: 'image/jpeg' }) : file), 'image/jpeg', 0.92);
    }),
  }), [base, edited, items, strokes, file]);

  // ------------------------------------------------ text + emoji items
  const rel = (e, el) => { const r = el.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]; };
  const itemDown = (e, it) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setSel(it.id);
    dragging.current = { id: it.id, sx: e.clientX, sy: e.clientY, moved: false, parent: e.currentTarget.parentElement };
  };
  const itemMove = (e) => {
    const d = dragging.current;
    if (!d) return;
    if (Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy) > 5) d.moved = true;
    if (!d.moved) return;
    const [x, y] = rel(e, d.parent);
    setItems((p) => p.map((i) => (i.id === d.id ? { ...i, x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) } : i)));
  };
  const itemUp = (e, it) => {
    const d = dragging.current;
    dragging.current = null;
    if (d && !d.moved && it.kind === 'text') { setDraft({ id: it.id, text: it.text, color: it.color }); setTool('text'); }
  };
  const resize = (f) => setItems((p) => p.map((i) => (i.id === sel ? { ...i, size: Math.min(0.5, Math.max(0.03, i.size * f)) } : i)));
  const removeSel = () => { setItems((p) => p.filter((i) => i.id !== sel)); setSel(null); };

  const openText = () => { setTool('text'); setDraft({ text: '', color }); };
  const doneText = () => {
    const text = (draft?.text || '').replace(/\s+$/g, '');
    if (draft?.id) {
      if (!text.trim()) setItems((p) => p.filter((i) => i.id !== draft.id));
      else setItems((p) => p.map((i) => (i.id === draft.id ? { ...i, text, color: draft.color } : i)));
    } else if (text.trim()) {
      uid += 1;
      setItems((p) => [...p, { id: `t${uid}`, kind: 'text', text, color: draft.color, size: 0.075, x: 0.5, y: 0.5 }]);
      setSel(`t${uid}`);
    }
    setDraft(null); setTool(null);
  };
  const addEmoji = (emoji) => {
    uid += 1;
    setItems((p) => [...p, { id: `e${uid}`, kind: 'emoji', text: emoji, size: 0.16, x: 0.5, y: 0.5 }]);
    setSel(`e${uid}`); setTool(null);
  };

  // ------------------------------------------------ drawing
  const penDown = (e) => {
    if (tool !== 'draw') return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const [x, y] = rel(e, e.currentTarget);
    drawing.current = true;
    setStrokes((p) => [...p, { color, w: 0.012, pts: [[x, y]] }]);
  };
  const penMove = (e) => {
    if (!drawing.current) return;
    const [x, y] = rel(e, e.currentTarget);
    setStrokes((p) => p.map((s, i) => (i === p.length - 1 ? { ...s, pts: [...s.pts, [x, y]] } : s)));
  };
  const penUp = () => { drawing.current = false; };

  // ------------------------------------------------ crop + rotate
  const startCrop = () => { setSel(null); setTool('crop'); setAspect(0); setCrop({ x: 0.05, y: 0.05, w: 0.9, h: 0.9 }); };
  const setAspectTo = (a) => {
    setAspect(a);
    if (!a || !base) return;
    let w = 1, h = (base.width / (a * base.height));          // fractions: pixel ratio (w*W)/(h*H) = a
    if (h > 1) { h = 1; w = (a * base.height) / base.width; }
    w *= 0.9; h *= 0.9;
    setCrop({ x: (1 - w) / 2, y: (1 - h) / 2, w, h });
  };
  const cropDown = (e) => {
    if (!crop) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const r = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - r.left, py = e.clientY - r.top;
    const cx = crop.x * r.width, cy = crop.y * r.height, cw = crop.w * r.width, ch = crop.h * r.height;
    const near = (ax, ay) => Math.hypot(px - ax, py - ay) < 32;
    let mode = null;
    if (near(cx, cy)) mode = 'nw'; else if (near(cx + cw, cy)) mode = 'ne'; else if (near(cx, cy + ch)) mode = 'sw'; else if (near(cx + cw, cy + ch)) mode = 'se';
    else if (px > cx && px < cx + cw && py > cy && py < cy + ch) mode = 'move';
    if (mode) cropDrag.current = { mode, sx: e.clientX, sy: e.clientY, start: { ...crop }, r };
  };
  const cropMove = (e) => {
    const d = cropDrag.current;
    if (!d || !base) return;
    const dx = (e.clientX - d.sx) / d.r.width, dy = (e.clientY - d.sy) / d.r.height;
    const s = d.start;
    const clampN = (v) => Math.min(1, Math.max(0, v));
    if (d.mode === 'move') {
      setCrop({ ...s, x: Math.min(1 - s.w, Math.max(0, s.x + dx)), y: Math.min(1 - s.h, Math.max(0, s.y + dy)) });
      return;
    }
    // corner: the opposite corner stays put
    const fx = d.mode.includes('w') ? s.x + s.w : s.x;
    const fy = d.mode.includes('n') ? s.y + s.h : s.y;
    let mx = clampN((d.mode.includes('w') ? s.x : s.x + s.w) + dx);
    let my = clampN((d.mode.includes('n') ? s.y : s.y + s.h) + dy);
    let w = Math.max(0.1, Math.abs(mx - fx)), h = Math.max(0.1, Math.abs(my - fy));
    if (aspect) {
      h = (w * base.width) / (aspect * base.height);
      if (h > 1) { h = 1; w = (aspect * base.height) / base.width; }
    }
    let x = d.mode.includes('w') ? fx - w : fx;
    let y = d.mode.includes('n') ? fy - h : fy;
    if (x < 0) { w += x; x = 0; if (aspect) h = (w * base.width) / (aspect * base.height); }
    if (y < 0) { h += y; y = 0; if (aspect) w = (h * aspect * base.height) / base.width; }
    if (x + w > 1) w = 1 - x;
    if (y + h > 1) h = 1 - y;
    setCrop({ x, y, w, h });
  };
  const cropUp = () => { cropDrag.current = null; };

  const applyCrop = () => {
    if (!crop || !base) return;
    const sw = Math.max(8, Math.round(crop.w * base.width)), sh = Math.max(8, Math.round(crop.h * base.height));
    const c = document.createElement('canvas');
    c.width = sw; c.height = sh;
    c.getContext('2d').drawImage(base, crop.x * base.width, crop.y * base.height, sw, sh, 0, 0, sw, sh);
    const mapX = (x) => (x - crop.x) / crop.w, mapY = (y) => (y - crop.y) / crop.h;
    setItems((p) => p.map((i) => ({ ...i, x: Math.min(1, Math.max(0, mapX(i.x))), y: Math.min(1, Math.max(0, mapY(i.y))), size: i.size / crop.w })));
    setStrokes((p) => p.map((s) => ({ ...s, w: s.w / crop.w, pts: s.pts.map(([x, y]) => [mapX(x), mapY(y)]) })));
    setBase(c); setEdited(true); setCrop(null); setTool(null);
  };
  const rotate = () => {
    if (!base) return;
    const c = document.createElement('canvas');
    c.width = base.height; c.height = base.width;
    const ctx = c.getContext('2d');
    ctx.translate(c.width / 2, c.height / 2); ctx.rotate(Math.PI / 2);
    ctx.drawImage(base, -base.width / 2, -base.height / 2);
    const k = base.width / base.height;                    // sizes are relative to the width, which becomes the old height
    setItems((p) => p.map((i) => ({ ...i, x: 1 - i.y, y: i.x, size: i.size * k })));
    setStrokes((p) => p.map((s) => ({ ...s, w: s.w * k, pts: s.pts.map(([x, y]) => [1 - y, x]) })));
    setBase(c); setEdited(true);
    if (tool === 'crop') { setCrop({ x: 0.05, y: 0.05, w: 0.9, h: 0.9 }); setAspect(0); }
  };

  const selected = items.find((i) => i.id === sel);

  return (
    <div className="se-root">
      <div className="se-tools">
        <button type="button" className={hasSong ? 'on' : ''} onClick={onMusic} aria-label="Add song"><BiMusic /></button>
        <button type="button" className={tool === 'crop' ? 'on' : ''} onClick={() => (tool === 'crop' ? setTool(null) : startCrop())} aria-label="Crop and rotate"><BiCrop /></button>
        <button type="button" className={tool === 'emoji' ? 'on' : ''} onClick={() => { setSel(null); setTool(tool === 'emoji' ? null : 'emoji'); }} aria-label="Add emoji"><BiSmile /></button>
        <button type="button" className={tool === 'text' ? 'on' : ''} onClick={openText} aria-label="Add text"><BiText /></button>
        <button type="button" className={tool === 'draw' ? 'on' : ''} onClick={() => { setSel(null); setTool(tool === 'draw' ? null : 'draw'); }} aria-label="Draw"><BiPencil /></button>
      </div>

      <div className="se-wrap" ref={wrap} onPointerDown={() => setSel(null)}>
        {bad && <p className="text-danger">Could not open that picture.</p>}
        {base && (
          <div className="se-stage" style={{ width: box.w, height: box.h }}>
            <canvas ref={canvas} style={{ width: box.w, height: box.h, touchAction: tool === 'draw' ? 'none' : 'auto', cursor: tool === 'draw' ? 'crosshair' : 'default' }}
              onPointerDown={penDown} onPointerMove={penMove} onPointerUp={penUp} onPointerCancel={penUp} />
            <div className="se-layer" style={{ pointerEvents: tool === 'draw' || tool === 'crop' ? 'none' : 'auto', display: tool === 'crop' ? 'none' : 'block' }}>
              {items.map((it) => (
                <div key={it.id} className={`se-item${sel === it.id ? ' sel' : ''}`}
                  style={{ left: `${it.x * 100}%`, top: `${it.y * 100}%`, fontSize: it.size * box.w, color: it.color, fontFamily: it.kind === 'emoji' ? EMOJI_FONT : TEXT_FONT, fontWeight: it.kind === 'text' ? 700 : 400, textShadow: it.kind === 'text' ? '0 1px 8px rgba(0,0,0,.45)' : 'none' }}
                  onPointerDown={(e) => itemDown(e, it)} onPointerMove={itemMove} onPointerUp={(e) => itemUp(e, it)} onPointerCancel={() => { dragging.current = null; }}>
                  {it.text}
                </div>
              ))}
            </div>
            {tool === 'crop' && crop && (
              <div className="se-crop" onPointerDown={cropDown} onPointerMove={cropMove} onPointerUp={cropUp} onPointerCancel={cropUp}>
                <div className="se-crop-box" style={{ left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, width: `${crop.w * 100}%`, height: `${crop.h * 100}%` }}>
                  <i className="nw" /><i className="ne" /><i className="sw" /><i className="se" />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* the bar that belongs to the tool in use */}
      {tool === 'draw' && (
        <div className="se-bar">
          {COLORS.map((c) => <button type="button" key={c} className={`se-sw${color === c ? ' on' : ''}`} style={{ background: c }} onClick={() => setColor(c)} aria-label={`Colour ${c}`} />)}
          <button type="button" className="se-ic" disabled={!strokes.length} onClick={() => setStrokes((p) => p.slice(0, -1))} aria-label="Undo"><BiUndo /></button>
        </div>
      )}
      {tool === 'crop' && (
        <div className="se-bar">
          {ASPECTS.map(([l, a]) => <button type="button" key={l} className={`px-chip${aspect === a ? ' on' : ''}`} onClick={() => setAspectTo(a)}>{l}</button>)}
          <button type="button" className="se-ic" onClick={rotate} aria-label="Rotate"><BiRotateRight /></button>
          <button type="button" className="se-ic" onClick={() => { setTool(null); setCrop(null); }} aria-label="Cancel crop"><BiX /></button>
          <button type="button" className="se-ic ok" onClick={applyCrop} aria-label="Apply crop"><BiCheck /></button>
        </div>
      )}
      {tool !== 'crop' && tool !== 'draw' && selected && (
        <div className="se-bar">
          <button type="button" className="se-ic" onClick={() => resize(0.88)} aria-label="Smaller">A−</button>
          <button type="button" className="se-ic" onClick={() => resize(1.14)} aria-label="Bigger">A+</button>
          <button type="button" className="se-ic" onClick={removeSel} aria-label="Delete"><BiTrash /></button>
        </div>
      )}
      {tool === 'emoji' && <div className="se-emoji"><EmojiPicker T={T} onPick={addEmoji} height={190} /></div>}

      {tool === 'text' && draft && (
        <div className="se-text">
          <textarea autoFocus rows={3} maxLength={120} value={draft.text} placeholder="Type something"
            style={{ color: draft.color }} onChange={(e) => setDraft({ ...draft, text: e.target.value })} aria-label="Text" />
          <div className="se-bar" style={{ justifyContent: 'center' }}>
            {COLORS.map((c) => <button type="button" key={c} className={`se-sw${draft.color === c ? ' on' : ''}`} style={{ background: c }} onClick={() => { setDraft({ ...draft, color: c }); setColor(c); }} aria-label={`Colour ${c}`} />)}
          </div>
          <div className="se-bar" style={{ justifyContent: 'center' }}>
            <button type="button" className="sc-btn ghost" style={{ height: 40 }} onClick={() => { setDraft(null); setTool(null); }}>Cancel</button>
            <button type="button" className="sc-btn" style={{ height: 40 }} onClick={doneText}>Done</button>
          </div>
        </div>
      )}
    </div>
  );
});

export default StatusEditor;
