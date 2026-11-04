import React, { useEffect, useState } from 'react';

// Opening animation: a little mascot pops out of a chat bubble, hearts float up and the Chatzy letters bounce in.
export default function Splash({ onDone }) {
  const [out, setOut] = useState(false);
  useEffect(() => {
    const a = setTimeout(() => setOut(true), 2100);
    const b = setTimeout(onDone, 2500);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, [onDone]);
  return (
    <div className={`spl-root${out ? ' out' : ''}`} role="status" aria-label="Loading Chatzy">
      <div className="spl-glow" />
      {['❤', '💬', '✨', '❤', '💬'].map((h, i) => <span key={i} className="spl-float" style={{ '--i': i }}>{h}</span>)}
      <div className="spl-stage">
        <svg className="spl-bubble" viewBox="0 0 160 140" aria-hidden="true">
          <defs>
            <linearGradient id="splg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#FFB36B" /><stop offset="1" stopColor="#E03A50" /></linearGradient>
          </defs>
          <path d="M20 20 Q20 6 36 6 H124 Q140 6 140 22 V82 Q140 98 124 98 H70 L40 126 L44 98 H36 Q20 98 20 82 Z" fill="url(#splg)" />
        </svg>
        <svg className="spl-avatar" viewBox="0 0 100 100" aria-hidden="true">
          <circle cx="50" cy="52" r="34" fill="#FFE0C2" />
          <path d="M16 46 Q18 14 50 14 Q82 14 84 46 Q70 30 50 32 Q30 30 16 46 Z" fill="#3A1B2B" />
          <g className="spl-eyes"><ellipse cx="38" cy="54" rx="4" ry="5" fill="#2B1320" /><ellipse cx="62" cy="54" rx="4" ry="5" fill="#2B1320" /></g>
          <path d="M38 68 Q50 80 62 68" stroke="#C2354C" strokeWidth="4" fill="none" strokeLinecap="round" />
          <circle cx="29" cy="64" r="6" fill="#FF8795" opacity=".5" /><circle cx="71" cy="64" r="6" fill="#FF8795" opacity=".5" />
        </svg>
        <div className="spl-dots"><i /><i /><i /></div>
      </div>
      <h1 className="spl-word" aria-hidden="true">{'Chatzy'.split('').map((c, i) => <span key={i} style={{ '--d': `${0.5 + i * 0.07}s` }}>{c}</span>)}</h1>
      <p className="spl-tag">chat. share. smile.</p>
    </div>
  );
}
