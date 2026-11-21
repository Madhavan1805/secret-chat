import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BiX, BiRefresh, BiCamera } from 'react-icons/bi';
import { useBackClose } from './backClose';

const MODES = ['Video', 'Photo', 'Video note'];
const pickMime = () => {
  if (typeof MediaRecorder === 'undefined') return '';
  return ['video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'].find((m) => MediaRecorder.isTypeSupported(m)) || '';
};

// In-app camera like WhatsApp: Video / Photo / Video note.
// onCapture(File)   onClose()   onFallback() is called when the camera can't be opened
export default function CameraCapture({ onCapture, onClose, onFallback }) {
  useBackClose(true, onClose);
  const [mode, setMode] = useState('Photo');
  const [facing, setFacing] = useState('environment');
  const [rec, setRec] = useState(false);
  const [secs, setSecs] = useState(0);
  const [err, setErr] = useState('');
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const recRef = useRef(null);
  const chunks = useRef([]);
  const timer = useRef(null);
  const cancelled = useRef(false);

  const stopStream = () => { if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; } };

  useEffect(() => {
    let dead = false;
    stopStream();
    const note = mode === 'Video note';
    const face = note ? 'user' : facing;
    (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: face, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: mode !== 'Photo',
        });
        if (dead) { s.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = s;
        if (videoRef.current) { videoRef.current.srcObject = s; videoRef.current.play().catch(() => {}); }
      } catch (e) {
        if (!dead) { setErr('Camera could not be opened'); if (onFallback) onFallback(); }
      }
    })();
    return () => { dead = true; };
  }, [mode, facing]); // eslint-disable-line

  useEffect(() => () => { clearInterval(timer.current); try { if (recRef.current && recRef.current.state !== 'inactive') { cancelled.current = true; recRef.current.stop(); } } catch (e) { /* ignore */ } stopStream(); }, []);

  const snap = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement('canvas');
    c.width = v.videoWidth; c.height = v.videoHeight;
    const ctx = c.getContext('2d');
    if (facing === 'user') { ctx.translate(c.width, 0); ctx.scale(-1, 1); }
    ctx.drawImage(v, 0, 0);
    c.toBlob((b) => { if (b) { stopStream(); onCapture(new File([b], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' })); } }, 'image/jpeg', 0.9);
  };

  const stopRec = () => { clearInterval(timer.current); setRec(false); try { recRef.current && recRef.current.state !== 'inactive' && recRef.current.stop(); } catch (e) { /* ignore */ } };

  const startRec = () => {
    const s = streamRef.current;
    if (!s || typeof MediaRecorder === 'undefined') { setErr('Video recording is not supported here'); return; }
    chunks.current = []; cancelled.current = false;
    const mime = pickMime();
    let mr;
    try { mr = new MediaRecorder(s, mime ? { mimeType: mime } : undefined); } catch (e) { setErr('Video recording is not supported here'); return; }
    mr.ondataavailable = (e) => { if (e.data && e.data.size) chunks.current.push(e.data); };
    mr.onstop = () => {
      if (cancelled.current) return;
      const type = (mr.mimeType || mime || 'video/webm').split(';')[0];
      const ext = type.includes('mp4') ? 'mp4' : 'webm';
      const blob = new Blob(chunks.current, { type });
      if (blob.size) { stopStream(); onCapture(new File([blob], `${mode === 'Video note' ? 'videonote' : 'video'}-${Date.now()}.${ext}`, { type })); }
    };
    mr.start(500);
    recRef.current = mr;
    setRec(true); setSecs(0);
    const max = mode === 'Video note' ? 60 : 180;
    timer.current = setInterval(() => setSecs((n) => { if (n + 1 >= max) { stopRec(); } return n + 1; }), 1000);
  };

  const press = () => {
    if (mode === 'Photo') snap();
    else if (rec) stopRec();
    else startRec();
  };

  const mm = `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
  const note = mode === 'Video note';

  return createPortal(
    <div className="cam-root" role="dialog" aria-label="Camera">
      <div className={`cam-view${note ? ' note' : ''}`}>
        <video ref={videoRef} playsInline muted autoPlay className={facing === 'user' || note ? 'mirror' : ''} />
      </div>
      {err && <p className="cam-err">{err}</p>}
      <button type="button" className="cam-x" onClick={onClose} aria-label="Close camera"><BiX /></button>
      {rec && <span className="cam-time"><i />{mm}</span>}
      <div className="cam-bottom">
        <div className="cam-row">
          <span className="cam-side" />
          <button type="button" className={`cam-shot${rec ? ' rec' : ''}${mode === 'Photo' ? ' photo' : ''}`} onClick={press} aria-label={mode === 'Photo' ? 'Take photo' : rec ? 'Stop recording' : 'Start recording'}><i /></button>
          {!note && !rec ? <button type="button" className="cam-side" onClick={() => setFacing(facing === 'user' ? 'environment' : 'user')} aria-label="Flip camera"><BiRefresh /></button> : <span className="cam-side" />}
        </div>
        {!rec && (
          <div className="cam-modes">
            {MODES.map((m) => <button key={m} type="button" className={m === mode ? 'on' : ''} onClick={() => setMode(m)}>{m}</button>)}
          </div>
        )}
        {mode === 'Photo' && !rec && <small className="cam-hint"><BiCamera /> Tap to take a photo</small>}
        {mode !== 'Photo' && !rec && <small className="cam-hint">Tap to start, tap again to stop</small>}
      </div>
    </div>,
    document.body,
  );
}
