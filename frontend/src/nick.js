// Private nicknames: only this phone shows them.
const key = (name) => `nick_${name}`;
export const getNick = (name) => { try { return localStorage.getItem(key(name)) || ''; } catch (e) { return ''; } };
export const setNick = (name, nick) => {
  try { if (nick) localStorage.setItem(key(name), nick); else localStorage.removeItem(key(name)); } catch (e) { /* ignore */ }
};
export const shownName = (name) => getNick(name) || name;

// Drafts: what you typed and did not send, kept per chat.
const dkey = (name) => `draft_${name}`;
export const getDraft = (name) => { try { return localStorage.getItem(dkey(name)) || ''; } catch (e) { return ''; } };
export const setDraft = (name, text) => {
  try { if (text && text.trim()) localStorage.setItem(dkey(name), text); else localStorage.removeItem(dkey(name)); } catch (e) { /* ignore */ }
};
