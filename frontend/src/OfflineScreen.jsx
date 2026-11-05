import React, { useEffect, useState } from 'react';

// Shown over the app while the phone has no internet. It goes away by itself when the connection is back.
export default function OfflineScreen() {
  const [offline, setOffline] = useState(typeof navigator !== 'undefined' ? navigator.onLine === false : false);
  const [checking, setChecking] = useState(false);
  const [back, setBack] = useState(false);
  useEffect(() => {
    const off = () => { setOffline(true); setBack(false); };
    const on = () => { setOffline(false); setBack(true); setTimeout(() => setBack(false), 2200); };
    window.addEventListener('offline', off);
    window.addEventListener('online', on);
    return () => { window.removeEventListener('offline', off); window.removeEventListener('online', on); };
  }, []);
  const retry = () => {
    setChecking(true);
    setTimeout(() => { setChecking(false); if (navigator.onLine) { setOffline(false); setBack(true); setTimeout(() => setBack(false), 2200); } }, 900);
  };
  if (back) return <div className="of-toast" role="status">✅ Back online</div>;
  if (!offline) return null;
  return (
    <div className="of-root" role="alert">
      <div className="of-ring"><i /><i /><i /><span>📡</span></div>
      <h2>You're offline</h2>
      <p>Chatzy can't reach the internet. Messages will send again as soon as you're connected.</p>
      <button type="button" className="of-btn" onClick={retry} disabled={checking}>{checking ? 'Checking…' : 'Try again'}</button>
    </div>
  );
}
