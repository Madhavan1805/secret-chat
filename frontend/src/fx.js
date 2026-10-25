// Emoji effects drawn straight onto the page, so any screen can call them without any state.
//   burstAt('❤️', x, y)  a small pop of emojis floating up from a point (double-tap like)
//   rainAll('🔥')        emojis pouring down the whole screen (long-press on a reaction)

const reduced = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };

function layer(cls) {
  const el = document.createElement('div');
  el.className = cls;
  document.body.appendChild(el);
  return el;
}

export function burstAt(emoji, x, y, count = 9) {
  if (reduced()) return;
  const box = layer('fx-layer');
  for (let i = 0; i < count; i += 1) {
    const s = document.createElement('span');
    s.className = 'fx-pop';
    s.textContent = emoji;
    s.style.left = `${x}px`;
    s.style.top = `${y}px`;
    s.style.setProperty('--dx', `${(Math.random() - 0.5) * 150}px`);
    s.style.setProperty('--dy', `${-(70 + Math.random() * 130)}px`);
    s.style.setProperty('--s', `${0.8 + Math.random() * 1.1}`);
    s.style.setProperty('--r', `${(Math.random() - 0.5) * 50}deg`);
    s.style.animationDelay = `${i * 30}ms`;
    box.appendChild(s);
  }
  setTimeout(() => box.remove(), 1800);
}

export function rainAll(emoji, count = 46) {
  if (reduced()) return;
  const box = layer('fx-layer');
  const w = window.innerWidth;
  for (let i = 0; i < count; i += 1) {
    const s = document.createElement('span');
    s.className = 'fx-drop';
    s.textContent = emoji;
    s.style.left = `${Math.random() * (w - 24)}px`;
    s.style.fontSize = `${20 + Math.random() * 26}px`;
    s.style.setProperty('--sway', `${(Math.random() - 0.5) * 60}px`);
    s.style.animationDuration = `${1.8 + Math.random() * 1.6}s`;
    s.style.animationDelay = `${Math.random() * 1.1}s`;
    box.appendChild(s);
  }
  setTimeout(() => box.remove(), 5200);
}
