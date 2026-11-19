import React, { useEffect, useState } from 'react';

// Every deploy has a new build id (see vite.config.js). When the live /version.json differs from the build that is
// running, a full-screen "Update" box appears and the app cannot be used until the person taps Update,
// so nobody keeps running an old version that is missing the new features.
const CURRENT = typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : null;   // eslint-disable-line no-undef
const CHECK_EVERY = 3 * 60 * 1000;

export default function UpdateGate() {
  const [stale, setStale] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!CURRENT) return undefined;                                         // dev server: nothing to compare
    let live = true;
    const check = () => {
      fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => { if (live && j && j.build && String(j.build) !== CURRENT) setStale(true); })
        .catch(() => {});                                                   // offline: try again later
    };
    check();
    const id = setInterval(check, CHECK_EVERY);
    const onShow = () => { if (!document.hidden) check(); };
    document.addEventListener('visibilitychange', onShow);
    window.addEventListener('online', check);
    return () => { live = false; clearInterval(id); document.removeEventListener('visibilitychange', onShow); window.removeEventListener('online', check); };
  }, []);

  const update = async () => {
    setBusy(true);
    try {
      if (navigator.serviceWorker) { const regs = await navigator.serviceWorker.getRegistrations(); await Promise.all(regs.map((r) => r.unregister())); }
      if (window.caches) { const keys = await caches.keys(); await Promise.all(keys.map((k) => caches.delete(k))); }
    } catch (e) { /* reload anyway */ }
    window.location.reload();
  };

  if (!stale) return null;
  return (
    <div role="alertdialog" aria-modal="true" aria-label="Update available"
         style={{ position: 'fixed', inset: 0, zIndex: 100000, background: 'rgba(8,8,14,.82)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: 'var(--panel, #1c1c22)', color: 'var(--text, #fff)', borderRadius: 24, padding: '26px 22px', maxWidth: 340, width: '100%', textAlign: 'center', boxShadow: '0 16px 60px rgba(0,0,0,.55)' }}>
        <div style={{ fontSize: 44 }}>🚀</div>
        <h3 style={{ margin: '8px 0 6px', fontSize: 21 }}>Update available</h3>
        <p style={{ margin: '0 0 18px', lineHeight: 1.5, opacity: 0.85 }}>A new version of Chatzy is ready with new features. Update the app to keep using it.</p>
        <button type="button" className="sc-btn" style={{ width: '100%', height: 46 }} disabled={busy} onClick={update}>{busy ? 'Updating…' : 'Update app'}</button>
      </div>
    </div>
  );
}
