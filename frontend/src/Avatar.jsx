import React from 'react';
import { getPicUrl } from './config';

// ring: undefined | 'new' (unseen status) | 'seen' | 'close' (close friends status)
export default function Avatar({ name, src, size = 40, T, online, emoji, ring }) {
  const pic = getPicUrl(src);
  const inner = ring ? size - 8 : size;
  const face = pic ? (
    <img src={pic} alt="" style={{ width: inner, height: inner, borderRadius: '50%', objectFit: 'cover', display: 'block' }} />
  ) : (
    <div
      className="d-flex align-items-center justify-content-center"
      style={{ width: inner, height: inner, borderRadius: '50%', background: T.mine, color: T.mineText, fontSize: inner * 0.42, fontWeight: 700, fontFamily: 'var(--font-display)' }}
    >
      {emoji || (name ? name.charAt(0).toUpperCase() : '?')}
    </div>
  );
  return (
    <div className="position-relative flex-shrink-0" style={{ width: size, height: size }}>
      {ring ? <div className={`sc-ring ${ring === 'new' ? '' : ring}`}><div>{face}</div></div> : face}
      {online && (
        <span style={{ position: 'absolute', right: 0, bottom: 0, width: Math.max(10, size * 0.27), height: Math.max(10, size * 0.27), borderRadius: '50%', background: 'var(--online, #3DDC97)', border: `2px solid ${T.bg}` }} />
      )}
    </div>
  );
}
