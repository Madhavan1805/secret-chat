// frontend/src/push.js
// Links the logged-in user to this phone in OneSignal (works only inside the Median APK).
// External ID is "u<id>" because OneSignal blocks simple IDs like "1".

export function pushLogin(userId) {
  if (userId == null) return;
  const id = 'u' + String(userId);
  let tries = 0;
  const attempt = () => {
    tries++;
    try {
      const m = window.median || window.gonative;
      const os = m && m.onesignal;
      if (os) {
        if (typeof os.login === 'function') { os.login(id); return; }
        if (os.externalUserId && typeof os.externalUserId.set === 'function') {
          os.externalUserId.set({ externalId: id });
          return;
        }
      }
    } catch (e) { /* ignore */ }
    if (tries < 15) setTimeout(attempt, 1000);
  };
  attempt();
}

export function pushLogout() {
  try {
    const m = window.median || window.gonative;
    if (m && m.onesignal && typeof m.onesignal.logout === 'function') {
      m.onesignal.logout();
    }
  } catch (e) { /* ignore */ }
}
