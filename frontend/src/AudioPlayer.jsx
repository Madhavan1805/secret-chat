import React, { useState, useRef, useEffect, useMemo } from 'react';
import { BiPlay, BiPause } from 'react-icons/bi';

const fmt = (t) => {
  if (!t || !Number.isFinite(t)) return '0:00';
  return `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
};
const SPEEDS = [1, 1.5, 2];
const BARS = 36;
const cache = new Map();                                   // src -> bar heights (0..1)

// the same bars every time for one voice note, until the real ones are read from the audio
const fakeBars = (src) => {
  let h = 7;
  for (let i = 0; i < src.length; i += 1) h = (h * 31 + src.charCodeAt(i)) % 9973;
  return Array.from({ length: BARS }, (_, i) => { h = (h * 73 + 41 + i) % 9973; return 0.25 + (h % 100) / 140; });
};

async function readBars(src) {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  const buf = await (await fetch(src)).arrayBuffer();
  const ctx = new Ctx();
  try {
    const audio = await ctx.decodeAudioData(buf);
    const data = audio.getChannelData(0);
    const step = Math.floor(data.length / BARS) || 1;
    const bars = Array.from({ length: BARS }, (_, i) => {
      let max = 0;
      const from = i * step;
      for (let j = from; j < from + step && j < data.length; j += 8) max = Math.max(max, Math.abs(data[j]));
      return max;
    });
    const top = Math.max(...bars, 0.001);
    return bars.map((b) => Math.max(0.12, b / top));
  } finally { if (ctx.close) ctx.close().catch(() => {}); }
}

export default function AudioPlayer({ src, isMe, T }) {
  const ref = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [real, setReal] = useState(cache.get(src) || null);
  const fake = useMemo(() => fakeBars(src || ''), [src]);
  const bars = real || fake;

  const color = isMe ? T.mineText : T.accent;

  useEffect(() => {
    if (!src || cache.has(src)) return undefined;
    let dead = false;
    readBars(src).then((b) => { if (b) cache.set(src, b); if (!dead && b) setReal(b); }).catch(() => {});
    return () => { dead = true; };
  }, [src]);

  const toggle = () => {
    if (!ref.current) return;
    if (playing) ref.current.pause(); else ref.current.play().catch(() => {});
  };
  const cycleSpeed = () => {
    const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
    setSpeed(next);
    if (ref.current) ref.current.playbackRate = next;
  };

  const onTime = () => {
    const a = ref.current;
    if (!a) return;
    setCurrent(a.currentTime);
    if (Number.isFinite(a.duration) && a.duration > 0) setProgress((a.currentTime / a.duration) * 100);
  };

  // MediaRecorder webm files report duration = Infinity: force the browser to compute it
  const onMeta = (e) => {
    const a = e.target;
    a.playbackRate = speed;
    if (a.duration === Infinity) {
      a.currentTime = 1e101;
      const fix = () => { a.removeEventListener('timeupdate', fix); a.currentTime = 0; setDuration(a.duration); };
      a.addEventListener('timeupdate', fix);
    } else {
      setDuration(a.duration);
    }
  };

  const seek = (e) => {
    const a = ref.current;
    if (!a || !Number.isFinite(a.duration)) return;
    const rect = e.currentTarget.getBoundingClientRect();
    a.currentTime = ((e.clientX - rect.left) / rect.width) * a.duration;
  };

  return (
    <div className="d-flex align-items-center gap-2" style={{ minWidth: 220 }}>
      <audio
        ref={ref}
        src={src}
        preload="metadata"
        onTimeUpdate={onTime}
        onLoadedMetadata={onMeta}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setProgress(0); setCurrent(0); }}
      />
      <button
        onClick={toggle}
        className="btn p-0 d-flex align-items-center justify-content-center"
        style={{ width: 36, height: 36, borderRadius: '50%', background: color, color: isMe ? '#fff' : '#1f2937', border: 'none', flex: 'none' }}
        aria-label={playing ? 'Pause' : 'Play'}
      >
        {playing ? <BiPause size={22} /> : <BiPlay size={22} />}
      </button>
      <div className="flex-grow-1" style={{ minWidth: 0 }}>
        <div onClick={seek} style={{ display: 'flex', alignItems: 'center', gap: 2, height: 28, cursor: 'pointer' }} role="slider" aria-label="Seek" aria-valuenow={Math.round(progress)}>
          {bars.map((b, i) => (
            <span key={i} style={{ flex: 1, height: `${Math.round(b * 100)}%`, minHeight: 3, borderRadius: 2, background: (i / BARS) * 100 < progress ? color : 'rgba(128,128,128,0.4)' }} />
          ))}
        </div>
        <small style={{ fontSize: 10, opacity: 0.8 }}>{playing || current ? fmt(current) : fmt(duration)}</small>
      </div>
      <button type="button" onClick={cycleSpeed} aria-label="Playback speed"
        style={{ flex: 'none', minWidth: 38, height: 26, borderRadius: 13, border: 0, fontSize: 12, fontWeight: 700, background: 'rgba(128,128,128,0.28)', color: 'inherit' }}>
        {speed}x
      </button>
    </div>
  );
}
