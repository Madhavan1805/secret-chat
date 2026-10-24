import React, { useMemo } from 'react';
import { qrMatrix } from './qr';

// Draws a QR code as an SVG. Always dark-on-white with a quiet zone so every phone camera can read it.
export default function QrCode({ text, size = 220 }) {
  const m = useMemo(() => { try { return qrMatrix(text); } catch (e) { return null; } }, [text]);
  if (!m) return <div style={{ width: size, height: size }} />;
  const q = 4; const n = m.length + q * 2;
  let d = '';
  m.forEach((row, y) => row.forEach((v, x) => { if (v) d += `M${x + q},${y + q}h1v1h-1z`; }));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${n} ${n}`} shapeRendering="crispEdges" role="img" aria-label="QR code">
      <rect width={n} height={n} fill="#fff" rx="1.5" />
      <path d={d} fill="#14091c" />
    </svg>
  );
}
