import React from 'react';
import { getPicUrl, formatListTime } from './config';

export const dt = (d) => (d ? new Date(d).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—');
export const dd = (d) => (d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
export const seen = (u) => (u.is_online ? 'Online now' : (u.last_seen ? `Last seen ${formatListTime(u.last_seen)}` : 'Never seen'));

export function Avatar({ u, big }) {
  const pic = getPicUrl(u.profile_picture);
  return pic
    ? <img className={`adm-av${big ? ' big' : ''}`} src={pic} alt="" loading="lazy" />
    : <span className={`adm-av${big ? ' big' : ''}`} aria-hidden="true">{(u.username || '?').charAt(0).toUpperCase()}</span>;
}

export function Tags({ u }) {
  return (
    <>
      {u.is_verified && <span className="adm-tag blue">✓ Verified</span>}
      {u.is_admin && <span className="adm-tag amber">🛡 Admin</span>}
      {u.is_banned && <span className={`adm-tag ${u.auto_ban ? 'amber' : 'red'}`}>{u.auto_ban ? '⏳ Auto-ban 24h' : (u.banned_until ? 'Temp ban' : 'Banned')}</span>}
      {u.report_count > 0 && <span className="adm-tag red">{u.report_count} report{u.report_count > 1 ? 's' : ''}</span>}
    </>
  );
}

export function KV({ k, v }) {
  return <div className="adm-kv"><span>{k}</span><span>{v === null || v === undefined || v === '' ? '—' : v}</span></div>;
}

// small bar chart, no library: values are drawn as rounded bars, last bar is highlighted
export function BarChart({ title, values, labels, color = 'var(--accent)' }) {
  const max = Math.max(1, ...values);
  const total = values.reduce((a, b) => a + b, 0);
  const w = 100 / values.length;
  return (
    <div className="adm-card adm-chart">
      <div className="row"><span className="adm-sub">{title}</span><b>{total}</b></div>
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" role="img" aria-label={`${title}: ${total} in the last ${values.length} days`}>
        {values.map((v, i) => {
          const h = Math.max(v ? 2 : 0.6, (v / max) * 38);
          return <rect key={i} x={i * w + w * 0.14} y={40 - h} width={w * 0.72} height={h} rx="1" fill={color} opacity={i === values.length - 1 ? 1 : 0.55} />;
        })}
      </svg>
      <div className="ax"><span>{labels[0]}</span><span>today</span></div>
    </div>
  );
}
