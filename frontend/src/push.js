// frontend/src/push.js  (DEBUG version - shows a popup once per app open)
let shown = false;

export function pushLogin(userId) {
  if (userId == null) return;
  const id = String(userId);
  let tries = 0;
  const attempt = () => {
    tries++;
    const m = window.median || window.gonative;
    const os = m && m.onesignal;
    try {
      if (os && typeof os.login === 'function') {
        os.login(id);
        if (!shown) { shown = true; alert('PUSH: login called for user ' + id); }
        return;
      }
      if (os && os.externalUserId && typeof os.externalUserId.set === 'function') {
        os.externalUserId.set({ externalId: id });
        if (!shown) { shown = true; alert('PUSH: externalUserId.set called for user ' + id); }
        return;
      }
    } catch (e) {
      if (!shown) { shown = true; alert('PUSH ERROR: ' + e); }
      return;
    }
    if (tries < 10) {
      setTimeout(attempt, 1000);
    } else if (!shown) {
      shown = true;
      alert('PUSH: bridge not found. median=' + (!!window.median) +
        ' gonative=' + (!!window.gonative) +
        ' onesignal=' + (!!os) +
        ' keys=' + (os ? Object.keys(os).join(',') : 'none'));
    }
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
