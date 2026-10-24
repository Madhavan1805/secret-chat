import React, { useState } from 'react';

// Small built-in emoji picker (no library needed).
//   <EmojiPicker T={T} onPick={(emoji) => ...} />
const CATEGORIES = [
  { key: 'recent', icon: '🕘', label: 'Recent', emojis: [] },
  { key: 'smileys', icon: '😀', label: 'Smileys', emojis: ('😀 😃 😄 😁 😆 😅 😂 🤣 🥲 ☺️ 😊 😇 🙂 🙃 😉 😌 😍 🥰 😘 😗 😙 😚 😋 😛 😝 😜 🤪 🤨 🧐 🤓 😎 🥸 🤩 🥳 😏 😒 😞 😔 😟 😕 🙁 ☹️ 😣 😖 😫 😩 🥺 😢 😭 😤 😠 😡 🤬 🤯 😳 🥵 🥶 😱 😨 😰 😥 😓 🤗 🤔 🤭 🤫 🤥 😶 😐 😑 😬 🙄 😯 😦 😧 😮 😲 🥱 😴 🤤 😪 😵 🤐 🥴 🤢 🤮 🤧 😷 🤒 🤕 🤑 🤠 😈 👿 👹 👺 🤡 💩 👻 💀 ☠️ 👽 🤖 🎃').split(' ') },
  { key: 'people', icon: '👍', label: 'People', emojis: ('👍 👎 👌 🤌 🤏 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ ✋ 🤚 🖐️ 🖖 👋 🤝 🙏 ✍️ 💪 🦾 🙌 👏 🤲 👐 🫶 🫡 🫰 🫵 💅 🧠 👀 👁️ 👅 👄 🙋 🙆 🙅 🤷 🤦 💁 🙇 🤳 💃 🕺 🚶 🏃 👨‍👩‍👧 👫 👬 👭 💑 💏').split(' ') },
  { key: 'hearts', icon: '❤️', label: 'Hearts', emojis: ('❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❤️‍🔥 ❣️ 💕 💞 💓 💗 💖 💘 💝 💟 ♥️ 💋 💯 💢 💥 💫 💦 💨 🕊️ ✨ ⭐ 🌟 🔥 🎉 🎊 🎁 🏆 🥇 👑 💎').split(' ') },
  { key: 'nature', icon: '🐶', label: 'Animals', emojis: ('🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🙈 🙉 🙊 🐔 🐧 🐦 🐤 🦆 🦅 🦉 🦇 🐺 🐗 🐴 🦄 🐝 🦋 🐌 🐞 🐢 🐍 🐙 🦀 🐠 🐬 🐳 🦈 🐘 🦒 🐒 🌸 🌹 🌺 🌻 🌼 🌷 🌱 🌴 🌵 🍀 🍁 🌈 ☀️ 🌙 ⛅ ⚡ ❄️ 🌊').split(' ') },
  { key: 'food', icon: '🍕', label: 'Food', emojis: ('🍎 🍊 🍋 🍌 🍉 🍇 🍓 🍒 🍑 🥭 🍍 🥥 🥝 🍅 🥑 🌽 🥕 🍞 🧀 🍳 🥞 🍗 🍖 🌭 🍔 🍟 🍕 🌮 🌯 🍝 🍜 🍣 🍤 🍚 🍛 🍦 🍩 🍪 🎂 🍰 🍫 🍬 🍭 ☕ 🍵 🥤 🍺 🍻 🥂 🍷').split(' ') },
  { key: 'fun', icon: '⚽', label: 'Fun', emojis: ('⚽ 🏀 🏈 ⚾ 🎾 🏏 🏸 🎱 🏓 🥊 🎯 🎮 🎲 🎵 🎶 🎤 🎧 🎸 🎬 📸 📱 💻 📞 💡 🔒 🔑 💰 💸 🚗 🏍️ ✈️ 🚀 🏠 🌍 ⏰ 📚 ✏️ 🎈 🧿 🔔 🚫 ✅ ❌ ❓ ❗ ⚠️ 💤').split(' ') },
];

const RECENT_KEY = 'recent_emojis';
const loadRecent = () => { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch (e) { return []; } };
const saveRecent = (emoji) => {
  try {
    const list = [emoji, ...loadRecent().filter((e) => e !== emoji)].slice(0, 24);
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch (e) { /* ignore */ }
};

export default function EmojiPicker({ T, onPick, height = 230 }) {
  const recent = loadRecent();
  const [cat, setCat] = useState(recent.length ? 'recent' : 'smileys');
  const light = !!T?.light;
  const list = cat === 'recent' ? recent : (CATEGORIES.find((c) => c.key === cat)?.emojis || []);

  // onMouseDown preventDefault keeps the keyboard / text cursor where it was
  const keep = (e) => e.preventDefault();

  return (
    <div style={{ background: light ? '#fff' : (T?.raised || '#261C33'), border: `1px solid ${T?.accent || '#FF6477'}`, borderRadius: 14, overflow: 'hidden', color: light ? '#1f2937' : '#fff' }}>
      <div className="d-flex" style={{ borderBottom: `1px solid ${T?.accent || '#FF6477'}33` }}>
        {CATEGORIES.map((c) => (
          <button
            key={c.key} type="button" title={c.label} onMouseDown={keep} onClick={() => setCat(c.key)}
            className="btn p-1 border-0 flex-fill"
            style={{ fontSize: 18, borderRadius: 0, background: cat === c.key ? `${T?.accent || '#FF6477'}33` : 'transparent' }}
          >{c.icon}</button>
        ))}
      </div>
      <div style={{ height, overflowY: 'auto', padding: 6, display: 'flex', flexWrap: 'wrap', alignContent: 'flex-start' }}>
        {list.length === 0 && <div className="w-100 text-center small opacity-50 mt-4">No recent emojis yet</div>}
        {list.map((e, i) => (
          <button
            key={`${e}${i}`} type="button" onMouseDown={keep}
            className="btn p-0 border-0"
            style={{ width: '12.5%', minWidth: 36, height: 38, fontSize: 22, lineHeight: 1 }}
            onClick={() => { saveRecent(e); onPick(e); }}
          >{e}</button>
        ))}
      </div>
    </div>
  );
}
