// Small built-in sound effects (generated with the Web Audio API, so there are no audio files to host).
//   playSound('send' | 'receive' | 'delete' | 'tick' | 'like')
// Browsers only allow sound after the user touched the page once, so the audio context is unlocked
// on the first tap / key press.

let ctx = null;

const getCtx = () => {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  try { ctx = new AC(); } catch (e) { ctx = null; }
  return ctx;
};

const unlock = () => {
  const c = getCtx();
  if (c && c.state === 'suspended') c.resume().catch(() => {});
};
if (typeof window !== 'undefined') {
  ['touchstart', 'pointerdown', 'keydown', 'click'].forEach((ev) => window.addEventListener(ev, unlock, { passive: true }));
}

// one short note: [frequency Hz, start offset s, length s, volume]
const SOUNDS = {
  send:    { type: 'sine',     notes: [[880, 0, 0.07, 0.18], [1175, 0.06, 0.09, 0.16]] },
  receive: { type: 'triangle', notes: [[660, 0, 0.1, 0.22], [880, 0.1, 0.14, 0.22]] },
  delete:  { type: 'sine',     notes: [[420, 0, 0.08, 0.2], [260, 0.08, 0.14, 0.2]] },
  tick:    { type: 'sine',     notes: [[1500, 0, 0.04, 0.13], [1500, 0.09, 0.05, 0.13]] },   // double tick
  like:    { type: 'sine',     notes: [[784, 0, 0.08, 0.2], [988, 0.08, 0.08, 0.2], [1319, 0.16, 0.14, 0.2]] },
};

const lastPlayed = {};

export const soundsEnabled = () => {
  try { return localStorage.getItem('sounds_off') !== '1'; } catch (e) { return true; }
};
export const setSoundsEnabled = (on) => {
  try { localStorage.setItem('sounds_off', on ? '0' : '1'); } catch (e) { /* ignore */ }
};

export function playSound(name) {
  if (!soundsEnabled()) return;
  const def = SOUNDS[name];
  const c = getCtx();
  if (!def || !c) return;
  const now = Date.now();
  if (lastPlayed[name] && now - lastPlayed[name] < 120) return;   // never stack the same sound
  lastPlayed[name] = now;
  try {
    if (c.state === 'suspended') c.resume().catch(() => {});
    const t0 = c.currentTime + 0.01;
    def.notes.forEach(([freq, offset, len, vol]) => {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = def.type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t0 + offset);
      gain.gain.exponentialRampToValueAtTime(vol, t0 + offset + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + offset + len);
      osc.connect(gain);
      gain.connect(c.destination);
      osc.start(t0 + offset);
      osc.stop(t0 + offset + len + 0.03);
    });
  } catch (e) { /* sound must never break the app */ }
}
