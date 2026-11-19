import React, { useEffect, useState } from 'react';
import api from './api';
import { getMe } from './config';

// When an admin turns Maintenance mode on (Admin > Tools), everyone except admins sees a "back soon" screen.
export default function MaintenanceGate() {
  const [state, setState] = useState({ on: false, message: '' });
  useEffect(() => {
    let live = true;
    const check = () => api.get('app/status/').then((r) => { if (live) setState({ on: !!r.data.maintenance, message: r.data.message || '' }); }).catch(() => {});
    check();
    const id = setInterval(check, 60000);
    const onShow = () => { if (!document.hidden) check(); };
    document.addEventListener('visibilitychange', onShow);
    return () => { live = false; clearInterval(id); document.removeEventListener('visibilitychange', onShow); };
  }, []);
  const [admin, setAdmin] = useState(false);
  useEffect(() => {
    if (!state.on) return;
    getMe().then((m) => setAdmin(!!(m && m.is_admin))).catch(() => setAdmin(false));     // admins can still use the app
  }, [state.on]);
  if (!state.on || admin) return null;
  return (
    <div role="alertdialog" aria-modal="true" aria-label="Maintenance"
         style={{ position: 'fixed', inset: 0, zIndex: 100001, background: 'var(--bg, #101014)', color: 'var(--text, #fff)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 28, textAlign: 'center' }}>
      <div style={{ fontSize: 64 }}>🚧</div>
      <h2 style={{ margin: '12px 0 8px' }}>We'll be right back</h2>
      <p style={{ maxWidth: 320, lineHeight: 1.5, opacity: 0.85 }}>{state.message || 'Chatzy is being updated. Please try again in a little while.'}</p>
      <button type="button" className="sc-btn" style={{ marginTop: 18, minWidth: 160 }} onClick={() => window.location.reload()}>Try again</button>
    </div>
  );
}
