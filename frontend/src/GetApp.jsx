import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BiDownload, BiMobileAlt } from 'react-icons/bi';

const APK = '/chatzy.apk';

// true inside the Android app (WebView) or an installed home-screen app: no need to offer a download there
export const insideApp = () => {
  try {
    if (/; wv\)|\bwv\b|median|gonative/i.test(navigator.userAgent)) return true;      // the Median / GoNative app adds "median" to the user agent
    if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return true;
    if (window.navigator.standalone) return true;
  } catch (e) { /* ignore */ }
  return false;
};
const isAndroid = () => /Android/i.test(navigator.userAgent || '');
const isIOS = () => /iPhone|iPad|iPod/i.test(navigator.userAgent || '');

// the file is only offered when it is really on the site (otherwise the host would answer with the web page itself)
function useApkInfo() {
  const [info, setInfo] = useState({ ready: false, version: '', size: '' });
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        // read only the first bytes: a real APK is a zip file and starts with "PK"; the web page (HTML) does not
        const r = await fetch(APK, { headers: { Range: 'bytes=0-3' }, cache: 'no-store' });
        const type = (r.headers.get('content-type') || '').toLowerCase();
        let head = new Uint8Array(0);
        if (r.ok && r.body) {
          const reader = r.body.getReader();
          const first = await reader.read();
          try { await reader.cancel(); } catch (e) { /* ignore */ }
          head = first.value || head;
        }
        const total = Number((r.headers.get('content-range') || '').split('/')[1] || r.headers.get('content-length') || 0);
        // hide the button only when we are SURE the file is not an APK (missing, or the web page); unknown = show it
        const bad = !r.ok || type.includes('text/html') || (head.length >= 2 && !(head[0] === 0x50 && head[1] === 0x4b));
        const ok = !bad;
        const len = total > 1000000 ? total : 0;
        let version = '';
        try { version = (await (await fetch('/app-version.json', { cache: 'no-store' })).json()).version || ''; } catch (e) { /* optional */ }
        if (live) setInfo({ ready: ok, version, size: len ? `${(len / 1048576).toFixed(1)} MB` : '' });
      } catch (e) { if (live) setInfo({ ready: true, version: '', size: '' }); }
    })();
    return () => { live = false; };
  }, []);
  return info;
}

function useInstallPrompt() {
  const [evt, setEvt] = useState(null);
  useEffect(() => {
    const on = (e) => { e.preventDefault(); setEvt(e); };
    window.addEventListener('beforeinstallprompt', on);
    return () => window.removeEventListener('beforeinstallprompt', on);
  }, []);
  return evt;
}

// small card on the login page (Android browsers only)
export function GetAppCard() {
  const apk = useApkInfo();
  if (insideApp() || !isAndroid() || !apk.ready) return null;
  return (
    <div className="ga-card">
      <span className="ga-ic"><BiMobileAlt /></span>
      <div className="ga-t"><b>Get the Chatzy app</b><small>Faster, full screen{apk.size ? ` · ${apk.size}` : ''}</small></div>
      <Link to="/download" className="ga-btn">Download</Link>
    </div>
  );
}

// /download : the page you can share with friends
export function DownloadPage() {
  const apk = useApkInfo();
  const prompt = useInstallPrompt();
  const inApp = insideApp();
  const install = async () => { if (prompt) { prompt.prompt(); try { await prompt.userChoice; } catch (e) { /* ignore */ } } };
  return (
    <div className="ga-page">
      <div className="ga-hero">
        <img src="/icon.png" alt="" width="84" height="84" style={{ borderRadius: 22 }} />
        <h1>Chatzy</h1>
        <p>Private chats, notes, status and more.</p>
      </div>

      {inApp ? (
        <div className="ga-box"><b>You are already using the app 🎉</b></div>
      ) : (
        <>
          {isIOS() ? (
            <div className="ga-box">
              <b>iPhone</b>
              <p>There is no APK for iPhone. Open this site in Safari → Share → <b>Add to Home Screen</b>.</p>
            </div>
          ) : (
            <>
              {apk.ready ? (
                <a className="ga-big" href={APK} download="Chatzy.apk"><BiDownload /> Download for Android{apk.version ? ` · v${apk.version}` : ''}</a>
              ) : (
                <div className="ga-box"><b>The Android file is not uploaded yet.</b><p>Please check back soon.</p></div>
              )}
              {apk.ready && (
                <ol className="ga-steps">
                  <li>Tap <b>Download for Android</b> and open the file when it finishes.</li>
                  <li>If Android asks, allow <b>Install unknown apps</b> for your browser (one time).</li>
                  <li>Tap <b>Install</b>, then open Chatzy and log in.</li>
                </ol>
              )}
            </>
          )}
          {prompt && <button type="button" className="ga-alt" onClick={install}>Or install the web app instead</button>}
          <p className="ga-foot">Only download Chatzy from <b>{window.location.host}</b>.</p>
        </>
      )}
      <Link to="/" className="ga-back">Continue in the browser</Link>
    </div>
  );
}
