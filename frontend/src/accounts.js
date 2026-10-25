// Several logins on one phone (like Instagram): every account keeps its own token in a small list,
// and "switching" just makes that token the active one and reloads the app.
const KEY = 'sc_accounts';
// things that belong to the phone, not to one login: they survive a logout / account switch
const KEEP = /^(pinned_msg_|app_theme|custom_reactions|recent_emojis|sounds_off|lock_|sc_accounts)/;

const read = () => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(v) ? v.filter((a) => a && a.token && a.username) : [];
  } catch (e) { return []; }
};
const write = (list) => { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) { /* storage blocked */ } };

export const listAccounts = () => read();

// add (or refresh) an account after a login
export function rememberAccount({ token, username, id }) {
  if (!token || !username) return;
  const list = read().filter((a) => a.username !== username && a.token !== token);
  list.push({ token, username, id: id == null ? null : id });
  write(list);
}

export function forgetAccount(token) {
  if (!token) return;
  write(read().filter((a) => a.token !== token));
}

// make sure the account that is logged in right now is in the list (it was logged in before this feature existed)
export function rememberCurrent() {
  try {
    const token = localStorage.getItem('token');
    const username = localStorage.getItem('username');
    const id = localStorage.getItem('user_id');
    if (token && username) rememberAccount({ token, username, id: id ? Number(id) : null });
  } catch (e) { /* ignore */ }
  return read();
}

// clear everything of the current login but keep the phone-level settings and the account list
export function wipeSession() {
  const keep = {};
  try {
    Object.keys(localStorage).forEach((k) => { if (KEEP.test(k)) keep[k] = localStorage.getItem(k); });
    localStorage.clear();
    Object.entries(keep).forEach(([k, v]) => localStorage.setItem(k, v));
  } catch (e) { /* ignore */ }
}

export function switchAccount(acc) {
  try {
    localStorage.setItem('token', acc.token);
    localStorage.setItem('username', acc.username);
    if (acc.id != null) localStorage.setItem('user_id', String(acc.id)); else localStorage.removeItem('user_id');
  } catch (e) { /* ignore */ }
  window.location.assign('/home');          // a clean reload: sockets, caches and push all start fresh for that account
}
