// Put this file at: frontend/src/push.js
// Links the logged-in user to this phone in OneSignal (works only inside the Median APK).

export function pushLogin(userId) {
  try {
    if (userId != null && window.median && window.median.onesignal && window.median.onesignal.login) {
      window.median.onesignal.login(String(userId));
    }
  } catch (e) { /* ignore */ }
}

export function pushLogout() {
  try {
    if (window.median && window.median.onesignal && window.median.onesignal.logout) {
      window.median.onesignal.logout();
    }
  } catch (e) { /* ignore */ }
}