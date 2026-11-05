import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// Long-press menu of a message: reaction pill on top, a preview of the message, then a tidy grid of actions.
// Hold any emoji (built-in or one of my own) and it grows and wiggles; when it is ready it is sent and rains.
const HOLD_MS = 480;

// This menu is a portal on <body>, outside the screen that carries the theme colours, so --panel / --text were
// undefined here and the menu came out see-through with faint text. Copy the colours from the chat screen.
const VARS = ['--bg', '--panel', '--surface', '--raised', '--accent', '--mine', '--mine-text', '--other', '--text', '--sub', '--line', '--input', '--seal'];
const FALLBACK = { '--panel': '#1c1626', '--raised': '#2a2038', '--text': '#ffffff', '--sub': 'rgba(255,255,255,.7)', '--line': 'rgba(255,255,255,.16)', '--accent': '#ff6477' };
const themeFromScreen = () => {
  const out = { ...FALLBACK };
  try {
    const el = document.querySelector('.chat-shell') || document.querySelector('.home-shell') || document.documentElement;
    const cs = getComputedStyle(el);
    VARS.forEach((v) => { const val = cs.getPropertyValue(v).trim(); if (val) out[v] = val; });
  } catch (e) { /* keep the fallback */ }
  return out;
};

// the menu is a portal, but React still bubbles its events to the message row (long-press / swipe / double-tap): keep them here
const stop = (e) => e.stopPropagation();

export default function MessageMenu({ preview, isMe, reactions, mine, showReactions, items, onReact, onFire, onMore, onClose }) {
  const [holding, setHolding] = useState('');
  const [vars] = useState(themeFromScreen);
  const timer = useRef(null);
  const fired = useRef(false);

  const down = (e, emoji) => {
    fired.current = false;
    setHolding(emoji);
    const el = e.currentTarget;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      fired.current = true;
      setHolding('');
      const r = el.getBoundingClientRect();
      if (navigator.vibrate) { try { navigator.vibrate(18); } catch (err) { /* ignore */ } }
      onFire(emoji, r.left + r.width / 2, r.top + r.height / 2);
    }, HOLD_MS);
  };
  const cancel = () => { clearTimeout(timer.current); setHolding(''); };
  const up = (emoji) => {
    const wasFired = fired.current;
    cancel();
    if (!wasFired) onReact(emoji);
  };

  return createPortal(
    <div className="mm-wrap" style={vars} role="dialog" aria-label="Message options"
      onTouchStart={stop} onTouchMove={stop} onTouchEnd={stop} onClick={stop} onDoubleClick={stop} onContextMenu={(e) => { e.preventDefault(); stop(e); }}>
      <div className="mm-backdrop" onClick={onClose} />
      <div className={`mm-sheet ${isMe ? 'mm-me' : ''}`}>
        {showReactions && (
          <div className="mm-react" role="group" aria-label="React">
            {reactions.map((e) => (
              <button key={e} type="button" aria-label={`React ${e}. Hold to send it raining`}
                className={`mm-emoji ${holding === e ? 'mm-hold' : ''} ${mine === e ? 'mm-mine' : ''}`}
                onPointerDown={(ev) => down(ev, e)} onPointerUp={() => up(e)}
                onPointerLeave={cancel} onPointerCancel={cancel} onContextMenu={(ev) => ev.preventDefault()}>{e}</button>
            ))}
            <button type="button" className="mm-emoji mm-plus" aria-label="More reactions" onClick={onMore}>+</button>
          </div>
        )}
        {showReactions && <div className="mm-hint">Hold an emoji to make it rain</div>}
        {preview && <div className="mm-preview">{preview}</div>}
        <div className="mm-grid">
          {items.filter((x) => !x.danger).map((x) => (
            <button key={x.label} type="button" className="mm-tile" onClick={x.fn}>
              <span className="mm-ico">{x.icon}</span>
              <span className="mm-lbl">{x.label}</span>
            </button>
          ))}
        </div>
        {items.filter((x) => x.danger).map((x) => (
          <button key={x.label} type="button" className="mm-danger" onClick={x.fn}><span className="mm-ico">{x.icon}</span>{x.label}</button>
        ))}
      </div>
    </div>,
    document.body,
  );
}
