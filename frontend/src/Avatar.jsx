import React from 'react';
import { getPicUrl } from './config';

export default function Avatar({ name, src, size = 40, T, online, emoji }) {
  const pic = getPicUrl(src);
  return (
    <div className="position-relative flex-shrink-0" style={{ width: size, height: size }}>
      {pic ? (
        <img src={pic} alt="" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', border: `1px solid ${T.accent}` }} />
      ) : (
        <div
          className="d-flex align-items-center justify-content-center fw-bold"
          style={{ width: size, height: size, borderRadius: '50%', background: T.mine, color: T.mineText, fontSize: size * 0.42 }}
        >
          {emoji || (name ? name.charAt(0).toUpperCase() : '?')}
        </div>
      )}
      {online && (
        <span style={{ position: 'absolute', right: 0, bottom: 0, width: size * 0.28, height: size * 0.28, borderRadius: '50%', background: '#22c55e', border: `2px solid ${T.bg}` }} />
      )}
    </div>
  );
}
