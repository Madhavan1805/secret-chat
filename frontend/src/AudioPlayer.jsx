import React, { useState, useRef } from 'react';
import { BiPlay, BiPause } from 'react-icons/bi';

const fmt = (t) => {
  if (!t || !Number.isFinite(t)) return '0:00';
  return `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
};

export default function AudioPlayer({ src, isMe, T }) {
  const ref = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);

  const color = isMe ? T.mineText : T.accent;

  const toggle = () => {
    if (!ref.current) return;
    if (playing) ref.current.pause(); else ref.current.play().catch(() => {});
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
    <div className="d-flex align-items-center gap-2" style={{ minWidth: 200 }}>
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
        style={{ width: 36, height: 36, borderRadius: '50%', background: color, color: isMe ? '#fff' : '#1f2937', border: 'none' }}
      >
        {playing ? <BiPause size={22} /> : <BiPlay size={22} />}
      </button>
      <div className="flex-grow-1">
        <div onClick={seek} style={{ height: 5, borderRadius: 3, background: 'rgba(128,128,128,0.35)', cursor: 'pointer' }}>
          <div style={{ width: `${progress}%`, height: '100%', borderRadius: 3, background: color }} />
        </div>
        <small style={{ fontSize: 10, opacity: 0.8 }}>{playing || current ? fmt(current) : fmt(duration)}</small>
      </div>
    </div>
  );
}
