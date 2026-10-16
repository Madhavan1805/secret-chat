// The person's own favourite reaction emojis (kept on this device).
export const DEFAULT_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
const KEY = 'custom_reactions';
const MAX_CUSTOM = 12;

export const getCustomReactions = () => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(v) ? v.filter((e) => typeof e === 'string' && !DEFAULT_REACTIONS.includes(e)).slice(0, MAX_CUSTOM) : [];
  } catch (e) { return []; }
};

const save = (list) => { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) { /* ignore */ } return list; };

export const addCustomReaction = (emoji) => {
  if (!emoji || DEFAULT_REACTIONS.includes(emoji)) return getCustomReactions();
  return save([emoji, ...getCustomReactions().filter((e) => e !== emoji)].slice(0, MAX_CUSTOM));
};

export const removeCustomReaction = (emoji) => save(getCustomReactions().filter((e) => e !== emoji));
