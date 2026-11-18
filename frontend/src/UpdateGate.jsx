import React, { useEffect, useRef, useState } from 'react';
import { BiRefresh } from 'react-icons/bi';

// When a newer version of Chatzy is live, people who still have the old copy open must update before they go on,
// so everybody always has the newest features. The running build id (__BUILD_ID__) is compared with /version.json.
const CHECK_EVERY = 2 * 60 * 1000;

const hardReload = async () => {
  try {
    if ('serviceWorker' in navigator) (await navigator.serviceWorker.getRegistrations()).forEach((r) => r.unregister());
    if (window.caches) (await caches.keys()).forEach((k) => caches.delete(k));
  } catch (e) { /* ignore */ }
  const url = new URL(window.location.href);
  url.searchParams.set('_u', String(Date.now()));                 // a new URL so the phone cannot reuse the old page
  window.location.replace(url.toString());
};

export default function UpdateGate() {
  const [news, setNews] = useState(null);                         // { notes } when an update is waiting
  const [busy, setBusy] = useState(false);
  const found = useRef(false);

  useEffect(() => {
    try {                                                         // tidy the cache-buster after an update
      const url = new URL(window.location.href);
      if (url.searchParams.has('_u')) { url.searchParams.delete('_u'); window.history.replaceState(null, '', url.pathname + url.search + url.hash); }
    } catch (e) { /* ignore */ }
    if (!import.meta.env.PROD) return undefined;                  // no popup while developing

    const check = async () => {
      if (found.current) return;
      try {
        const r = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
        if (!r.ok) return;
        const j = await r.json();
        if (j && j.v && j.v !== __BUILD_ID__) { found.current = true; setNews({ notes: Array.isArray(j.notes) ? j.notes.slice(0, 6) : [] }); }
      } catch (e) { /* offline: try again later */ }
    };
    check();
    const id = setInterval(check, CHECK_EVERY);
    const onVis = () => { if (!document.hidden) check(); };
    window.addEventListener('focus', check);
    window.addEventListener('online', check);
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(id); window.removeEventListener('focus', check); window.removeEventListener('online', check); document.removeEventListener('visibilitychange', onVis); };
  }, []);

  if (!news) return null;
  return (
    <div className="ug-wrap" role="alertdialog" aria-modal="true" aria-label="Update available">
      <div className="ug-card">
        <div className="ug-ico"><BiRefresh /></div>
        <h2 className="ug-title">New update is ready</h2>
        <p className="ug-sub">Update Chatzy to keep using it and get the newest features.</p>
        {news.notes.length > 0 && (
          <ul className="ug-notes">{news.notes.map((n) => <li key={n}>{n}</li>)}</ul>
        )}
        <button type="button" className="ug-btn" disabled={busy} onClick={() => { setBusy(true); hardReload(); }}>{busy ? 'Updating…' : 'Update now'}</button>
      </div>
    </div>
  );
}
