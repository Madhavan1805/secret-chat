// Playing and cutting "the part of the song" for notes and statuses.

export const fmtTime = (sec) => {
  const s = Math.max(0, Math.round(sec || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

// Start playing a song from `start` for `len` seconds. loop=true keeps repeating that part, otherwise onEnd() is called.
export function playClip(src, start = 0, len = 30, { loop = false, onEnd } = {}) {
  const a = new Audio(src);
  a.preload = 'auto';
  const s = Math.max(0, Number(start) || 0);
  const end = len ? s + Number(len) : 0;
  const seek = () => { try { if (s > 0) a.currentTime = s; } catch (e) { /* not seekable yet */ } };
  a.addEventListener('loadedmetadata', seek);
  const wrap = () => { if (loop) { a.currentTime = s; const p = a.play(); if (p && p.catch) p.catch(() => {}); } else { a.pause(); if (onEnd) onEnd(); } };
  a.addEventListener('timeupdate', () => { if (end && a.currentTime >= end) wrap(); });
  a.addEventListener('ended', wrap);
  const p = a.play();
  if (p && p.catch) p.catch(() => { if (onEnd) onEnd(); });
  return a;
}

// for a React <audio> element: jump into the chosen part and stay inside it
export const clipProps = (start = 0, len = 30) => ({
  onLoadedMetadata: (e) => { try { if (start > 0) e.target.currentTime = start; } catch (err) { /* ignore */ } },
  onTimeUpdate: (e) => { if (len && e.target.currentTime >= start + len) e.target.currentTime = start; },
});

// ---------- cutting a phone file (decode, cut, save as a small WAV) ----------
export async function decodeFile(file) {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) throw new Error('no audio');
  const ctx = new Ctx();
  try {
    const buf = await file.arrayBuffer();
    return await new Promise((res, rej) => { ctx.decodeAudioData(buf, res, rej); });
  } finally { if (ctx.close) ctx.close().catch(() => {}); }
}

export function peaks(buffer, n = 90) {
  const data = buffer.getChannelData(0);
  const step = Math.max(1, Math.floor(data.length / n));
  const out = [];
  for (let i = 0; i < n; i += 1) {
    let max = 0;
    const from = i * step, to = Math.min(data.length, from + step);
    for (let j = from; j < to; j += Math.max(1, Math.floor(step / 40))) max = Math.max(max, Math.abs(data[j]));
    out.push(max);
  }
  const top = Math.max(...out, 0.001);
  return out.map((v) => v / top);
}

export function cropToWav(buffer, start, len) {
  const sr = buffer.sampleRate;
  const factor = Math.max(1, Math.floor(sr / 22050));          // about 22 kHz mono keeps the file small
  const outRate = Math.round(sr / factor);
  const from = Math.floor(start * sr);
  const to = Math.min(buffer.length, Math.floor((start + len) * sr));
  const n = Math.max(0, Math.floor((to - from) / factor));
  const chans = [];
  for (let c = 0; c < buffer.numberOfChannels; c += 1) chans.push(buffer.getChannelData(c));
  const pcm = new Int16Array(n);
  for (let i = 0; i < n; i += 1) {
    let sum = 0;
    for (let k = 0; k < factor; k += 1) for (let c = 0; c < chans.length; c += 1) sum += chans[c][from + i * factor + k] || 0;
    const v = Math.max(-1, Math.min(1, sum / (factor * chans.length)));
    pcm[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
  }
  const head = new ArrayBuffer(44);
  const dv = new DataView(head);
  const str = (o, s) => { for (let i = 0; i < s.length; i += 1) dv.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); dv.setUint32(4, 36 + pcm.length * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, outRate, true); dv.setUint32(28, outRate * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
  str(36, 'data'); dv.setUint32(40, pcm.length * 2, true);
  return new Blob([head, pcm.buffer], { type: 'audio/wav' });
}
