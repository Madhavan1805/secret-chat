import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BiPlay, BiStop, BiMusic } from 'react-icons/bi';
import { Sheet } from './ui';
import { fmtTime, playClip, decodeFile, peaks, cropToWav } from './clip';

// Choose which part of the song to use, like Instagram: drag the window over the song, then tap Done.
// pick = { url | file, title, artist, art }.  onDone({ ...pick, start, len, file? })
const BARS = 90;
const fakeBars = (seed) => {
  let h = 0; for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return Array.from({ length: BARS }, (_, i) => { h = (h * 1103515245 + 12345) & 0x7fffffff; return 0.25 + 0.75 * Math.abs(Math.sin(i / 5 + (h % 7))) * ((h % 100) / 100 * 0.5 + 0.5); });
};

export default function ClipStep({ T, pick, defaultLen = 30, onDone, onBack }) {
  const [duration, setDuration] = useState(0);
  const [bars, setBars] = useState(() => fakeBars(pick.title || 'song'));
  const [buffer, setBuffer] = useState(null);
  const [len, setLen] = useState(defaultLen);
  const [start, setStart] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const audio = useRef(null);
  const strip = useRef(null);
  const drag = useRef(null);
  const src = useMemo(() => (pick.file ? URL.createObjectURL(pick.file) : pick.url), [pick]);
  useEffect(() => () => { if (pick.file) URL.revokeObjectURL(src); }, [src]);

  // song length + real waveform (phone files) or just the length (search previews)
  useEffect(() => {
    let dead = false;
    const probe = new Audio(src);
    probe.preload = 'metadata';
    probe.addEventListener('loadedmetadata', () => { if (!dead && Number.isFinite(probe.duration)) setDuration((d) => d || probe.duration); });
    if (pick.file) {
      decodeFile(pick.file).then((b) => { if (dead) return; setBuffer(b); setDuration(b.duration); setBars(peaks(b, BARS)); }).catch(() => {});
    }
    return () => { dead = true; };
  }, [src]);

  const lens = [15, 30].filter((l) => l <= Math.floor(duration || 30));
  const effLen = duration ? Math.min(len, Math.floor(duration)) : len;
  const maxStart = Math.max(0, (duration || 0) - effLen);
  const st = Math.min(start, maxStart);

  const stop = () => { if (audio.current) { audio.current.pause(); audio.current = null; } setPlaying(false); };
  useEffect(() => stop, []);
  const play = () => { stop(); setPlaying(true); audio.current = playClip(src, st, effLen, { loop: true, onEnd: () => setPlaying(false) }); };
  // moving the window or changing its length restarts the preview from the new spot
  useEffect(() => { if (playing) play(); }, [st, effLen]);

  const toStart = (clientX, centered) => {
    const r = strip.current.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    const t = frac * duration - (centered ? effLen / 2 : 0);
    return Math.round(Math.min(maxStart, Math.max(0, t)));
  };
  const down = (e) => {
    if (!duration) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const r = strip.current.getBoundingClientRect();
    const winX = r.left + (st / duration) * r.width;
    const inside = e.clientX >= winX && e.clientX <= winX + (effLen / duration) * r.width;
    drag.current = { grab: inside ? e.clientX - winX : (effLen / duration) * r.width / 2, left: r.left, w: r.width };
    if (!inside) setStart(toStart(e.clientX, true));
  };
  const move = (e) => {
    if (!drag.current) return;
    const { grab, left, w } = drag.current;
    const t = ((e.clientX - grab - left) / w) * duration;
    setStart(Math.round(Math.min(maxStart, Math.max(0, t))));
  };
  const up = () => { drag.current = null; };

  const done = async () => {
    stop();
    setBusy(true); setErr('');
    try {
      if (pick.file && buffer) {                              // bake the chosen part into a small file: plays instantly, nothing to seek
        const blob = cropToWav(buffer, st, effLen);
        const file = new File([blob], `${(pick.title || 'clip').replace(/[^\w\- ]+/g, '').slice(0, 40) || 'clip'}.wav`, { type: 'audio/wav' });
        onDone({ ...pick, file, start: 0, len: effLen });
      } else onDone({ ...pick, start: st, len: effLen });
    } catch (e) { setErr('Could not cut that song. Try another one.'); }
    setBusy(false);
  };

  return (
    <Sheet T={T} title="Choose the part" onClose={() => { stop(); onBack(); }}
      right={<button type="button" className="sc-btn" style={{ height: 36, padding: '0 16px' }} disabled={busy || !duration} onClick={done}>{busy ? 'Cutting…' : 'Done'}</button>}>
      <div className="cl-head">
        {pick.art ? <img src={pick.art} alt="" width={84} height={84} /> : <span className="cl-art"><BiMusic /></span>}
        <b>{pick.title}</b>
        {pick.artist && <small>{pick.artist}</small>}
      </div>

      <div className="cl-row">
        <button type="button" className="cl-play" onClick={() => (playing ? stop() : play())} aria-label={playing ? 'Stop preview' : 'Play preview'}>{playing ? <BiStop /> : <BiPlay />}</button>
        <div className="cl-times">{fmtTime(st)} – {fmtTime(st + effLen)}<small>{duration ? ` of ${fmtTime(duration)}` : ' loading…'}</small></div>
        <div className="cl-lens">
          {lens.map((l) => <button type="button" key={l} className={`px-chip${effLen === l ? ' on' : ''}`} onClick={() => setLen(l)}>{l}s</button>)}
        </div>
      </div>

      <div className="cl-strip" ref={strip} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} role="slider" aria-label="Part of the song" aria-valuemin={0} aria-valuemax={Math.round(maxStart)} aria-valuenow={st}>
        <div className="cl-bars">{bars.map((v, i) => <i key={i} style={{ height: `${Math.max(8, v * 100)}%` }} />)}</div>
        {duration > 0 && <div className="cl-win" style={{ left: `${(st / duration) * 100}%`, width: `${(effLen / duration) * 100}%` }} />}
      </div>
      <p className="px-note" style={{ textAlign: 'center', margin: '12px 0 0' }}>
        {duration && duration <= 31 ? 'This is a 30 second preview. Upload the full song from your phone to pick any part of it.' : 'Drag the box to pick the part you like.'}
      </p>
      {err && <div className="text-danger small" style={{ textAlign: 'center' }}>{err}</div>}
    </Sheet>
  );
}
