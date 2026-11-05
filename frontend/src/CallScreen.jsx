import React, { useEffect, useRef, useState } from 'react';
import { BiMicrophone, BiMicrophoneOff, BiVideo, BiVideoOff, BiPhoneOff, BiCamera } from 'react-icons/bi';
import { Room, RoomEvent, Track } from 'livekit-client';
import api from './api';

// In-call screen (voice + video, 1:1 and group) on LiveKit. The LiveKit secret never reaches the phone:
// the backend hands out a short-lived token for this room only (POST calls/token/).
const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export default function CallScreen({ info, name, onEnd, onError }) {
  const isVideo = info.call_type === 'video';
  const roomRef = useRef(null);
  const audioHost = useRef(null);
  const localVid = useRef(null);
  const [status, setStatus] = useState('Connecting…');          // Connecting… | Ringing… | connected
  const [remote, setRemote] = useState({});                      // identity -> { name, el (video element) }
  const [peers, setPeers] = useState(0);
  const [mic, setMic] = useState(true);
  const [cam, setCam] = useState(isVideo);
  const [facing, setFacing] = useState('user');
  const [secs, setSecs] = useState(0);
  const endedRef = useRef(false);

  useEffect(() => {
    let dead = false;
    const room = new Room({ adaptiveStream: true, dynacast: true });
    roomRef.current = room;
    const sync = () => setPeers(room.remoteParticipants.size);

    const attach = (track, participant) => {
      if (track.kind === Track.Kind.Audio) {
        const a = track.attach();
        a.setAttribute('playsinline', 'true');
        audioHost.current && audioHost.current.appendChild(a);
      } else if (track.kind === Track.Kind.Video) {
        setRemote((m) => ({ ...m, [participant.identity]: { name: participant.name || participant.identity, track } }));
      }
    };
    room
      .on(RoomEvent.TrackSubscribed, (track, pub, p) => attach(track, p))
      .on(RoomEvent.TrackUnsubscribed, (track, pub, p) => {
        track.detach().forEach((el) => el.remove());
        if (track.kind === Track.Kind.Video) setRemote((m) => { const n = { ...m }; delete n[p.identity]; return n; });
      })
      .on(RoomEvent.ParticipantConnected, sync)
      .on(RoomEvent.ParticipantDisconnected, () => {
        sync();
        if (!info.is_group && room.remoteParticipants.size === 0 && !endedRef.current) { endedRef.current = true; onEnd(false); }
      })
      .on(RoomEvent.Disconnected, () => { if (!endedRef.current && !dead) { endedRef.current = true; onEnd(false); } });

    (async () => {
      try {
        const r = await api.post('calls/token/', { room_id: info.room_id });
        if (dead) return;
        await room.connect(r.data.url, r.data.token);
        if (dead) { room.disconnect(); return; }
        await room.localParticipant.setMicrophoneEnabled(true);
        if (isVideo) await room.localParticipant.setCameraEnabled(true, { facingMode: 'user' });
        sync();
        setStatus(room.remoteParticipants.size ? 'connected' : 'Ringing…');
        room.remoteParticipants.forEach((p) => p.trackPublications.forEach((pub) => pub.track && attach(pub.track, p)));
      } catch (e) {
        if (!dead) onError((e && e.response && e.response.data && e.response.data.error) || 'Call join aagala. Camera/mic permission check pannunga.', true);
      }
    })();

    return () => { dead = true; endedRef.current = true; try { room.disconnect(); } catch (e) { /* ignore */ } roomRef.current = null; };
  }, []);                                                       // eslint-disable-line react-hooks/exhaustive-deps

  // my own camera preview
  useEffect(() => {
    const room = roomRef.current;
    if (!room || !cam || !localVid.current) return undefined;
    const pub = room.localParticipant.getTrackPublication(Track.Source.Camera);
    const t = pub && pub.videoTrack;
    if (t && localVid.current) t.attach(localVid.current);
    return () => { if (t && localVid.current) t.detach(localVid.current); };
  }, [cam, peers, status, facing]);

  useEffect(() => { if (peers > 0) setStatus('connected'); }, [peers]);
  useEffect(() => {
    if (status !== 'connected') return undefined;
    const t = setInterval(() => setSecs((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [status]);

  const toggleMic = async () => { const n = !mic; setMic(n); try { await roomRef.current.localParticipant.setMicrophoneEnabled(n); } catch (e) { setMic(!n); } };
  const toggleCam = async () => { const n = !cam; setCam(n); try { await roomRef.current.localParticipant.setCameraEnabled(n, { facingMode: facing }); } catch (e) { setCam(!n); onError('Camera open aagala'); } };
  const flip = async () => {
    const next = facing === 'user' ? 'environment' : 'user';
    try {
      const pub = roomRef.current.localParticipant.getTrackPublication(Track.Source.Camera);
      await pub.videoTrack.restartTrack({ facingMode: next });
      setFacing(next);
    } catch (e) { onError('Camera flip aagala'); }
  };
  const end = () => { if (endedRef.current) return; endedRef.current = true; onEnd(true); };

  const peerName = info.is_group ? (name || 'Group call') : name;
  const tiles = Object.entries(remote);
  const subtitle = status === 'connected' ? fmt(secs) : status;

  return (
    <div className="cl-screen" role="dialog" aria-label="Call">
      <div ref={audioHost} style={{ display: 'none' }} />
      {isVideo && tiles.length > 0 ? (
        <div className={`cl-grid cl-n${Math.min(tiles.length, 4)}`}>
          {tiles.map(([id, t]) => <RemoteTile key={id} tile={t} />)}
        </div>
      ) : (
        <div className="cl-voice">
          <div className={`cl-avatar ${status === 'connected' ? '' : 'cl-pulse'}`}>{(peerName || '?').charAt(0).toUpperCase()}</div>
        </div>
      )}
      <div className="cl-top">
        <div className="cl-name">{peerName}</div>
        <div className="cl-sub">{info.is_group && status === 'connected' ? `${peers + 1} in call · ${fmt(secs)}` : subtitle}</div>
      </div>
      {isVideo && cam && <video ref={localVid} className="cl-self" autoPlay muted playsInline style={{ transform: facing === 'user' ? 'scaleX(-1)' : 'none' }} />}
      <div className="cl-bar">
        <button type="button" className={`cl-btn ${mic ? '' : 'cl-off'}`} onClick={toggleMic} aria-label={mic ? 'Mute' : 'Unmute'}>{mic ? <BiMicrophone /> : <BiMicrophoneOff />}</button>
        {isVideo && <button type="button" className={`cl-btn ${cam ? '' : 'cl-off'}`} onClick={toggleCam} aria-label="Camera">{cam ? <BiVideo /> : <BiVideoOff />}</button>}
        {isVideo && cam && <button type="button" className="cl-btn" onClick={flip} aria-label="Flip camera"><BiCamera /></button>}
        <button type="button" className="cl-btn cl-end" onClick={end} aria-label="End call"><BiPhoneOff /></button>
      </div>
    </div>
  );
}

function RemoteTile({ tile }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    tile.track.attach(el);
    return () => { try { tile.track.detach(el); } catch (e) { /* ignore */ } };
  }, [tile.track]);
  return (
    <div className="cl-tile">
      <video ref={ref} autoPlay playsInline />
      <span className="cl-tname">{tile.name}</span>
    </div>
  );
}
