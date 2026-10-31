// Chat folders (Family, College, Work ...). Kept on this phone only.
const KEY = 'folders_v1';
export const getFolders = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return []; } };
const save = (list) => { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) { /* ignore */ } return list; };
export const addFolder = (name) => save([...getFolders(), { id: `f${Date.now()}`, name: name.trim().slice(0, 20), keys: [] }]);
export const removeFolder = (id) => save(getFolders().filter((f) => f.id !== id));
export const toggleInFolder = (id, key) => save(getFolders().map((f) => (f.id !== id ? f
  : { ...f, keys: f.keys.includes(key) ? f.keys.filter((k) => k !== key) : [...f.keys, key] })));
