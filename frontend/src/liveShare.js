// Keeps posting this phone's position to the server while a live-location message is active.
// It works while the app is open (a web view cannot track in the background).
import api from './api';

let watchId = null;
let current = null;
let lastSent = 0;
const EVERY_MS = 8000;

export const sharingId = () => current;

export function stopSharing(notifyServer = false) {
  if (watchId !== null && navigator.geolocation) navigator.geolocation.clearWatch(watchId);
  const id = current;
  watchId = null; current = null;
  if (notifyServer && id) api.post('live/update/', { message_id: id, stop: true }).catch(() => {});
}

export function startSharing(messageId) {
  stopSharing(false);
  if (!navigator.geolocation) return;
  current = messageId;
  watchId = navigator.geolocation.watchPosition((pos) => {
    const now = Date.now();
    if (now - lastSent < EVERY_MS || current !== messageId) return;
    lastSent = now;
    api.post('live/update/', { message_id: messageId, lat: pos.coords.latitude, lng: pos.coords.longitude })
      .then((r) => { if (r.data && r.data.active === false) stopSharing(false); })
      .catch(() => {});
  }, () => {}, { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
}
