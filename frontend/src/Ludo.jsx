import React from 'react';

// Ludo board drawn as an SVG (15 x 15 cells). Track cell i is TRACK[i]; home columns and yards per player index.
const TRACK = [[1, 6], [2, 6], [3, 6], [4, 6], [5, 6], [6, 5], [6, 4], [6, 3], [6, 2], [6, 1], [6, 0], [7, 0], [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5],
  [9, 6], [10, 6], [11, 6], [12, 6], [13, 6], [14, 6], [14, 7], [14, 8], [13, 8], [12, 8], [11, 8], [10, 8], [9, 8], [8, 9], [8, 10], [8, 11], [8, 12], [8, 13],
  [8, 14], [7, 14], [6, 14], [6, 13], [6, 12], [6, 11], [6, 10], [6, 9], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8], [0, 7], [0, 6]];
const HOME = [
  [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7]],
  [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5]],
  [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7]],
  [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9]],
];
const YARD = [[1.5, 1.5], [10.5, 1.5], [10.5, 10.5], [1.5, 10.5]];            // top-left corner of each 4x4 yard block (start cells 0, 13, 26, 39)
const SLOTS = [[1, 1], [2.4, 1], [1, 2.4], [2.4, 2.4]];
export const LUDO_COLORS = ['#ef4444', '#22c55e', '#facc15', '#3b82f6'];
const SAFE = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

const cellOf = (idx, pos) => {
  if (pos === -1) return null;
  if (pos <= 50) return TRACK[(idx * 13 + pos) % 52];
  if (pos <= 55) return HOME[idx][pos - 51];
  return [7, 7];
};

export default function LudoBoard({ players, pos, movable, myIdx, onToken }) {
  const tokens = [];
  const stack = {};
  players.forEach((pl, idx) => {
    (pos[String(pl.id)] || []).forEach((p, t) => {
      let x; let y;
      if (p === -1) { [x, y] = [YARD[idx][0] + SLOTS[t][0] - 0.5 + 0.5, YARD[idx][1] + SLOTS[t][1] - 0.5 + 0.5]; x += 0.5; y += 0.5; } else {
        const c = cellOf(idx, p); x = c[0] + 0.5; y = c[1] + 0.5;
        const key = `${c[0]},${c[1]}`; stack[key] = (stack[key] || 0) + 1; x += (stack[key] - 1) * 0.18; y -= (stack[key] - 1) * 0.12;
      }
      tokens.push({ idx, t, x, y, id: pl.id, p });
    });
  });
  return (
    <svg viewBox="0 0 15 15" style={{ width: '100%', maxWidth: 300, display: 'block', borderRadius: 12, background: '#f8f5ee' }} role="img" aria-label="Ludo board">
      {YARD.map((y, i) => <rect key={`y${i}`} x={y[0] - 0.5} y={y[1] - 0.5} width={4} height={4} rx={0.6} fill={LUDO_COLORS[i]} opacity={players[i] ? 0.35 : 0.12} />)}
      <rect x="0" y="0" width="6" height="6" fill="none" /><rect x="9" y="0" width="6" height="6" fill="none" />
      {TRACK.map((c, i) => (
        <rect key={i} x={c[0] + 0.04} y={c[1] + 0.04} width="0.92" height="0.92" rx="0.15"
          fill={i % 13 === 0 ? LUDO_COLORS[i / 13] : SAFE.has(i) ? '#e5e0d2' : '#fff'} stroke="#cfc8b6" strokeWidth="0.05" />
      ))}
      {HOME.map((col, i) => col.map((c, j) => <rect key={`${i}-${j}`} x={c[0] + 0.04} y={c[1] + 0.04} width="0.92" height="0.92" rx="0.15" fill={LUDO_COLORS[i]} opacity={0.75} />))}
      <polygon points="6,6 9,6 7.5,7.5" fill={LUDO_COLORS[1]} /><polygon points="9,6 9,9 7.5,7.5" fill={LUDO_COLORS[2]} />
      <polygon points="9,9 6,9 7.5,7.5" fill={LUDO_COLORS[3]} /><polygon points="6,9 6,6 7.5,7.5" fill={LUDO_COLORS[0]} />
      {SAFE.size && [8, 21, 34, 47].map((i) => <text key={i} x={TRACK[i][0] + 0.5} y={TRACK[i][1] + 0.72} fontSize="0.7" textAnchor="middle" fill="#a39b85">★</text>)}
      {tokens.map((tk) => {
        const can = tk.idx === myIdx && movable.includes(tk.t);
        return (
          <g key={`${tk.id}-${tk.t}`} onClick={can ? () => onToken(tk.t) : undefined} style={{ cursor: can ? 'pointer' : 'default' }}>
            {can && <circle cx={tk.x} cy={tk.y} r="0.52" fill="none" stroke="#111" strokeWidth="0.1"><animate attributeName="r" values="0.46;0.62;0.46" dur="0.9s" repeatCount="indefinite" /></circle>}
            <circle cx={tk.x} cy={tk.y} r="0.36" fill={LUDO_COLORS[tk.idx]} stroke="#fff" strokeWidth="0.12" />
            <circle cx={tk.x - 0.1} cy={tk.y - 0.1} r="0.09" fill="#fff" opacity=".7" />
          </g>
        );
      })}
    </svg>
  );
}
