import React, { useEffect, useState } from 'react';

// Opening animation: the Chatzy logo pops in, hearts float up and the Chatzy letters bounce in.
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
        <img className="spl-logo" src="/logo.png" alt="" width="132" height="132" draggable="false" />
        <div className="spl-dots"><i /><i /><i /></div>
      </div>
      <h1 className="spl-word" aria-hidden="true">{'Chatzy'.split('').map((c, i) => <span key={i} style={{ '--d': `${0.5 + i * 0.07}s` }}>{c}</span>)}</h1>
      <p className="spl-tag">chat. share. smile.</p>
    </div>
  );
}
