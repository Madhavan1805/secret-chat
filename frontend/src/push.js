export function pushLogin(userId) {
  if (userId == null) return;
  const id = String(userId);
  let tries = 0;
  const attempt = () => {
    tries++;
    try {
      const m = window.median || window.gonative;
      if (m && m.onesignal) {
        if (typeof m.onesignal.login === 'function') {
          m.onesignal.login(id);
          return;
        }
        if (m.onesignal.externalUserId && typeof m.onesignal.externalUserId.set === 'function') {
          m.onesignal.externalUserId.set({ externalId: id });
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