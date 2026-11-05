import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BiX } from 'react-icons/bi';
import { playSound } from './sounds';
import Avatar from './Avatar';
import { useBackClose } from './backClose';

// ------------------------------------------------------------------ board geometry (15 x 15 cells)
const TRACK = [[1, 6], [2, 6], [3, 6], [4, 6], [5, 6], [6, 5], [6, 4], [6, 3], [6, 2], [6, 1], [6, 0], [7, 0], [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5],
  [9, 6], [10, 6], [11, 6], [12, 6], [13, 6], [14, 6], [14, 7], [14, 8], [13, 8], [12, 8], [11, 8], [10, 8], [9, 8], [8, 9], [8, 10], [8, 11], [8, 12], [8, 13],
  [8, 14], [7, 14], [6, 14], [6, 13], [6, 12], [6, 11], [6, 10], [6, 9], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8], [0, 7], [0, 6]];
const HOME = [
  [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7]],
  [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5]],
  [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7]],
  [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9]],
];
const YARD_ORIGIN = [[0, 0], [9, 0], [9, 9], [0, 9]];                 // each yard is a 6x6 block
const SLOT = [[1.8, 1.8], [4.2, 1.8], [1.8, 4.2], [4.2, 4.2]];
export const LUDO_COLORS = ['#e53935', '#2e9d4a', '#f6b800', '#1e6fe0'];
const LIGHT = ['#fde0df', '#d7f0dd', '#fff1c2', '#d6e6fb'];
const DARK = ['#a3201d', '#1c6b31', '#b88400', '#134a9c'];
const SAFE = new Set([0, 8, 13, 21, 26, 34, 39, 47]);
const STEP_MS = 190;

const cellOf = (idx, pos, slot) => {
  if (pos === -1) return [YARD_ORIGIN[idx][0] + SLOT[slot][0], YARD_ORIGIN[idx][1] + SLOT[slot][1]];
  if (pos <= 50) { const c = TRACK[(idx * 13 + pos) % 52]; return [c[0] + 0.5, c[1] + 0.5]; }
  if (pos <= 55) { const c = HOME[idx][pos - 51]; return [c[0] + 0.5, c[1] + 0.5]; }
  return [7.5 + [-0.28, 0, 0.28, 0][idx] * 0.9, 7.5 + [0, -0.28, 0, 0.28][idx] * 0.9];
};

// ------------------------------------------------------------------ the board with walking tokens + sounds
export function LudoBoard({ players, pos, movable, myIdx, onToken, lastMover, size = 320 }) {
  const [shown, setShown] = useState(pos);
  const [busy, setBusy] = useState(false);
  const shownRef = useRef(pos);
  const target = JSON.stringify(pos);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) { first.current = false; shownRef.current = pos; setShown(pos); return undefined; }
    // build the list of single steps from what is on screen to the new positions
    const steps = [];
    const cap = [];
    Object.keys(pos).forEach((uid) => {
      (pos[uid] || []).forEach((np, t) => {
        const op = (shownRef.current[uid] || [])[t];
        if (op === undefined || op === np) return;
        if (np === -1) { cap.push({ uid, t, to: -1 }); return; }
        if (op === -1) { steps.push({ uid, t, to: 0, jump: true }); return; }
        for (let p = op + 1; p <= np; p += 1) steps.push({ uid, t, to: p });
      });
    });
    const all = [...steps, ...cap];
    if (!all.length) { shownRef.current = pos; setShown(pos); return undefined; }
    setBusy(true);
    let i = 0;
    const timer = setInterval(() => {
      const st = all[i]; i += 1;
      const next = { ...shownRef.current, [st.uid]: [...shownRef.current[st.uid]] };
      next[st.uid][st.t] = st.to;
      shownRef.current = next; setShown(next);
      if (st.to === -1) playSound('capture'); else if (st.to === 56) playSound('home'); else playSound('hop');
      if (i >= all.length) { clearInterval(timer); shownRef.current = pos; setShown(pos); setBusy(false); }
    }, STEP_MS);
    return () => { clearInterval(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  const stack = {};
  const tokens = [];
  players.forEach((pl, idx) => {
    (shown[String(pl.id)] || []).forEach((p, t) => {
      let [x, y] = cellOf(idx, p, t);
      if (p >= 0 && p <= 55) { const key = `${x},${y}`; stack[key] = (stack[key] || 0) + 1; x += (stack[key] - 1) * 0.2; y -= (stack[key] - 1) * 0.16; }
      tokens.push({ idx, t, x, y, id: pl.id, p });
    });
  });
  tokens.sort((a, b) => a.y - b.y);

  return (
    <svg viewBox="0 0 15 15" style={{ width: size, maxWidth: '100%', display: 'block', borderRadius: 16, boxShadow: '0 10px 30px rgba(0,0,0,.35)' }} role="img" aria-label="Ludo board">
      <defs>
        {LUDO_COLORS.map((c, i) => (
          <radialGradient key={i} id={`lt${i}`} cx="35%" cy="30%" r="75%"><stop offset="0" stopColor="#fff" stopOpacity=".95" /><stop offset=".25" stopColor={c} /><stop offset="1" stopColor={DARK[i]} /></radialGradient>
        ))}
        <filter id="lsh" x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="0" dy="0.08" stdDeviation="0.07" floodOpacity=".5" /></filter>
      </defs>
      <rect width="15" height="15" rx="0.6" fill="#fffdf6" />
      {YARD_ORIGIN.map((o, i) => (
        <g key={`y${i}`} opacity={players[i] ? 1 : 0.45}>
          <rect x={o[0]} y={o[1]} width="6" height="6" fill={LUDO_COLORS[i]} />
          <rect x={o[0] + 0.9} y={o[1] + 0.9} width="4.2" height="4.2" rx="0.5" fill={LIGHT[i]} />
          {SLOT.map((sl, k) => <circle key={k} cx={o[0] + sl[0]} cy={o[1] + sl[1]} r="0.55" fill="#fff" stroke={LUDO_COLORS[i]} strokeWidth="0.1" />)}
        </g>
      ))}
      {TRACK.map((c, i) => (
        <rect key={i} x={c[0]} y={c[1]} width="1" height="1" fill={i % 13 === 0 ? LUDO_COLORS[i / 13] : '#fff'} stroke="#c9c3b2" strokeWidth="0.05" />
      ))}
      {HOME.map((col, i) => col.map((c, j) => <rect key={`${i}-${j}`} x={c[0]} y={c[1]} width="1" height="1" fill={LUDO_COLORS[i]} stroke="#fff" strokeWidth="0.05" opacity={0.9} />))}
      {[8, 21, 34, 47].map((i) => <text key={i} x={TRACK[i][0] + 0.5} y={TRACK[i][1] + 0.78} fontSize="0.8" textAnchor="middle" fill="#b0a98f">★</text>)}
      <polygon points="6,6 9,6 7.5,7.5" fill={LUDO_COLORS[1]} /><polygon points="9,6 9,9 7.5,7.5" fill={LUDO_COLORS[2]} />
      <polygon points="9,9 6,9 7.5,7.5" fill={LUDO_COLORS[3]} /><polygon points="6,9 6,6 7.5,7.5" fill={LUDO_COLORS[0]} />
      {tokens.map((tk) => {
        const can = !busy && tk.idx === myIdx && movable.includes(tk.t);
        return (
          <g key={`${tk.id}-${tk.t}`} onClick={can ? () => onToken(tk.t) : undefined}
            style={{ cursor: can ? 'pointer' : 'default', transition: `transform ${STEP_MS}ms ease-in-out`, transform: `translate(${tk.x}px, ${tk.y}px)` }}>
            {can && <circle r="0.62" fill="none" stroke="#111" strokeWidth="0.09" strokeDasharray="0.25 0.2"><animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="2.2s" repeatCount="indefinite" /></circle>}
            <g filter="url(#lsh)" style={{ transform: can ? 'translateY(-0.12px)' : undefined }}>
              <ellipse cx="0" cy="0.34" rx="0.34" ry="0.14" fill="#000" opacity=".22" />
              <path d="M-0.34 0.3 Q-0.34 -0.05 0 -0.1 Q0.34 -0.05 0.34 0.3 Z" fill={`url(#lt${tk.idx})`} stroke="#fff" strokeWidth="0.07" />
              <circle cx="0" cy="-0.27" r="0.24" fill={`url(#lt${tk.idx})`} stroke="#fff" strokeWidth="0.07" />
            </g>
          </g>
        );
      })}
    </svg>
  );
}

// ------------------------------------------------------------------ dice that really rolls
const PIPS = { 1: [[1, 1]], 2: [[0, 0], [2, 2]], 3: [[0, 0], [1, 1], [2, 2]], 4: [[0, 0], [2, 0], [0, 2], [2, 2]], 5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]], 6: [[0, 0], [0, 1], [0, 2], [2, 0], [2, 1], [2, 2]] };
function Face({ n }) {
  return (
    <svg viewBox="0 0 30 30" width="100%" height="100%" aria-hidden="true">
      {(PIPS[n] || []).map(([cx, cy], i) => <circle key={i} cx={6.5 + cx * 8.5} cy={6.5 + cy * 8.5} r="2.6" fill={n === 1 ? '#e53935' : '#222'} />)}
    </svg>
  );
}
export function LudoDice({ seq, value, disabled, onRoll }) {
  const [rolling, setRolling] = useState(false);
  const [face, setFace] = useState(value || 1);
  const prev = useRef(seq);
  useEffect(() => {
    if (seq === prev.current) { if (value) setFace(value); return undefined; }
    prev.current = seq;
    setRolling(true); playSound('dice');
    const iv = setInterval(() => setFace(1 + Math.floor(Math.random() * 6)), 90);
    const done = setTimeout(() => { clearInterval(iv); setFace(value || 1); setRolling(false); }, 800);
    return () => { clearInterval(iv); clearTimeout(done); };
  }, [seq, value]);
  return (
    <button type="button" className={`ld-dice${rolling ? ' roll' : ''}${disabled ? '' : ' ready'}`} disabled={disabled || rolling} onClick={onRoll} aria-label="Roll the dice">
      <Face n={face} />
    </button>
  );
}

// ------------------------------------------------------------------ full-screen game
export function LudoGame({ g, meId, move, busy, onClose, pics = {} }) {
  useBackClose(true, onClose);
  const L = g.ludo || { players: [] };
  const myIdx = L.players.findIndex((p) => p.id === meId);
  const turnP = L.players[L.turn];
  const myTurn = L.started && !g.finished && turnP && turnP.id === meId;
  const lastTurn = useRef(null);
  useEffect(() => {
    if (L.started && !g.finished && myTurn && lastTurn.current !== `${L.turn}-${L.seq}`) { lastTurn.current = `${L.turn}-${L.seq}`; playSound('turn'); }
  }, [myTurn, L.turn, L.seq, L.started, g.finished]);
  const wonOnce = useRef(false);
  useEffect(() => { if (g.finished && !wonOnce.current) { wonOnce.current = true; setTimeout(() => playSound('win'), 600); } }, [g.finished]);

  return createPortal(
    <div className="ld-root" role="dialog" aria-label="Ludo">
      <div className="ld-top">
        <b>🎲 Ludo</b>
        <span style={{ flex: 1 }} />
        <button type="button" className="ld-x" onClick={onClose} aria-label="Close"><BiX /></button>
      </div>
      <div className="ld-players">
        {L.players.map((p, i) => {
          const active = L.started && !g.finished && turnP && turnP.id === p.id;
          const home = ((L.pos || {})[String(p.id)] || []).filter((x) => x === 56).length;
          return (
            <div key={p.id} className={`ld-pl${active ? ' on' : ''}`} style={{ '--c': LUDO_COLORS[i] }}>
              <Avatar src={pics[p.id]} name={p.name} size={34} T={{ accent: LUDO_COLORS[i] }} />
              <span className="n">{p.id === meId ? 'You' : p.name}</span>
              <span className="h">🏠 {home}/4</span>
            </div>
          );
        })}
      </div>
      <div className="ld-stage">
        {L.started ? (
          <LudoBoard players={L.players} pos={L.pos || {}} movable={myTurn && L.die ? L.movable : []} myIdx={myIdx} onToken={(t) => move(`t${t}`)} size={Math.min(window.innerWidth - 20, 420)} />
        ) : (
          <div className="ld-lobby">
            <div style={{ fontSize: 56 }}>🎲</div>
            <h3>{L.players.length}/4 players joined</h3>
            <p>{myIdx < 0 ? 'Tap Join to play.' : `Waiting for ${g.starter} to start.`}</p>
            {myIdx < 0 && <button type="button" className="ld-btn" disabled={busy} onClick={() => move('join')}>Join game</button>}
            {meId === g.starter_id && <button type="button" className="ld-btn" disabled={busy || L.players.length < 2} onClick={() => move('start')}>Start game</button>}
          </div>
        )}
      </div>
      {L.started && (
        <div className="ld-bottom">
          <LudoDice seq={L.seq} value={L.last_die} disabled={busy || !myTurn || !!L.die} onRoll={() => move('roll')} />
          <div className="ld-info">
            <b>{g.finished ? `🏆 ${g.winner} won!` : myTurn ? (L.die ? 'Tap a glowing token' : 'Your turn, roll the dice!') : `${turnP ? turnP.name : ''}'s turn`}</b>
            {L.msg ? <span>{L.msg}</span> : null}
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
