import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { BiArrowBack } from 'react-icons/bi';
import { themeVars } from './theme';
import { useBackClose } from './backClose';

// ---- wax seal: a slightly wobbly blob so it looks hand-stamped, not a perfect circle ----
const blobPath = (size, seed = 3) => {
  const c = size / 2, r = size * 0.43, n = 18;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const wob = 1 + 0.07 * Math.sin(a * 5 + seed) + 0.04 * Math.cos(a * 3 + seed * 2);
    pts.push([c + Math.cos(a) * r * wob, c + Math.sin(a) * r * wob]);
  }
  let d = '';
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    if (i === 0) d += `M${p1[0].toFixed(1)},${p1[1].toFixed(1)}`;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d + 'Z';
};

let uid = 0;
export function Seal({ size = 40, children, keyhole = false, seed = 3, style }) {
  const id = useMemo(() => `sg${++uid}`, []);
  const d = useMemo(() => blobPath(100, seed), [seed]);
  return (
    <span className="sc-seal-wrap" style={{ width: size, height: size, ...style }}>
      <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
        <defs>
          <radialGradient id={id} cx="32%" cy="26%" r="85%">
            <stop offset="0" stopColor="#FF8795" /><stop offset=".52" stopColor="#E03A50" /><stop offset="1" stopColor="#8E1230" />
          </radialGradient>
        </defs>
        <path d={d} fill={`url(#${id})`} />
        <circle cx="50" cy="50" r="31" fill="none" stroke="rgba(0,0,0,.22)" strokeWidth="2.5" />
        <circle cx="50" cy="50" r="31" fill="none" stroke="rgba(255,255,255,.18)" strokeWidth="1" transform="translate(0,1.5)" />
        {keyhole && (
          <g fill="rgba(60,0,15,.55)">
            <circle cx="50" cy="44" r="8" />
            <path d="M46 48 L54 48 L56 64 L44 64 Z" />
          </g>
        )}
      </svg>
      {children && <span className="glyph" style={{ width: size, height: size, fontSize: size * 0.46 }}>{children}</span>}
    </span>
  );
}

// the send button: a seal that gets "stamped" every time you press it
export function SealButton({ onClick, disabled, label = 'Send', stampKey, children, size = 46 }) {
  const [stamp, setStamp] = useState(false);
  useEffect(() => {
    if (stampKey === undefined) return undefined;
    setStamp(true);
    const t = setTimeout(() => setStamp(false), 480);
    return () => clearTimeout(t);
  }, [stampKey]);
  return (
    <button type="button" className={`sc-seal-btn${stamp ? ' stamp' : ''}`} style={{ width: size, height: size }}
      onClick={onClick} disabled={disabled} aria-label={label}>
      <Seal size={size} seed={5}>{children}</Seal>
    </button>
  );
}

export function Toggle({ on, onChange, label }) {
  return <button type="button" role="switch" aria-checked={!!on} aria-label={label} className="sc-switch" onClick={() => onChange(!on)} />;
}

export function Choice({ value, options, onChange }) {
  return (
    <div className="sc-choice" role="group">
      {options.map(([v, label]) => (
        <button key={String(v)} type="button" aria-pressed={value === v} onClick={() => onChange(v)}>{label}</button>
      ))}
    </div>
  );
}

// one row of a settings list
export function SettingRow({ icon, title, sub, onClick, right, danger }) {
  const body = (
    <>
      {icon && <span className="ico">{icon}</span>}
      <span className="txt"><b>{title}</b>{sub && <small>{sub}</small>}</span>
      {right}
    </>
  );
  return onClick
    ? <button type="button" className={`sc-set${danger ? ' danger' : ''}`} onClick={onClick}>{body}</button>
    : <div className={`sc-set${danger ? ' danger' : ''}`}>{body}</div>;
}

// full screen panel rendered in a portal. CSS variables must be re-applied because portals sit outside the screen shell.
export function Sheet({ T, title, onClose, children, right }) {
  useBackClose(true, onClose);          // back button closes the sheet instead of leaving the app
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose && onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return createPortal(
    <div className="sc-sheet" style={themeVars(T)} role="dialog" aria-label={title}>
      <div className="sc-sheet-in">
        <div className="sc-sheet-top">
          <button type="button" className="sc-iconbtn" onClick={onClose} aria-label="Back"><BiArrowBack /></button>
          <h2>{title}</h2>
          {right}
        </div>
        <div className="sc-sheet-body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
