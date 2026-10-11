// Browser notifications for new messages + a tiny "which chat is open" registry
let activeChat = null;
export const setActiveChat = (id) => { activeChat = id; };
export const getActiveChat = () => activeChat;

export const canNotify = () => typeof Notification !== 'undefined';
export const notifyPermission = () => (canNotify() ? Notification.permission : 'unsupported');

export const requestNotifyPermission = async () => {
  if (!canNotify()) return 'unsupported';
  try { return await Notification.requestPermission(); } catch (e) { return 'denied'; }
};

export function showNotification(title, body, tag, onClick) {
  if (!canNotify() || Notification.permission !== 'granted') return;
  try {
    const n = new Notification(title, { body, tag });
    n.onclick = () => { window.focus(); if (onClick) onClick(); n.close(); };
  } catch (e) { /* some browsers only allow notifications from a service worker */ }
}

// call for every realtime event; decides if a popup is needed
export function maybeNotify(evt) {
  if (!evt || evt.event !== 'message' || evt.action !== 'new') return;
  if (evt.mine || evt.muted) return;
  const open = Number(evt.chat_id) === Number(activeChat);
  if (open && !document.hidden) return;              // you are looking at that chat
  if (!open && !document.hidden && activeChat == null) return;   // on Home: badges are enough
  showNotification(evt.title || 'New message', evt.body || '', `chat_${evt.chat_id}`);
}
