import React, { useEffect, useRef, useState } from 'react';
import { ZegoUIKitPrebuilt } from '@zegocloud/zego-uikit-prebuilt';
import api from './api';
import { getToken, getMe, clearMe, errMsg } from './config';
import { connectSocket, disconnectSocket, subscribe, isSocketOpen } from './socket';
import { maybeNotify, showNotification } from './notify';


const ZEGO_APP_ID = Number(import.meta.env.VITE_ZEGO_APP_ID || 505657632);
const ZEGO_SECRET = import.meta.env.VITE_ZEGO_SERVER_SECRET;
const RING_SECONDS = 45;

/**
 * Mount ONCE in App.jsx (inside <Router>, outside <Routes>).
 * - keeps the WebSocket connected while logged in
 * - sends a heartbeat every 15 s (online status + "delivered" ticks)
 * - rings on incoming calls (Accept / Decline) and runs the Zego call screen
 * - shows browser notifications for new messages
 */
export default function CallManager() {
  const [token, setToken] = useState(getToken());
  const [me, setMe] = useState(null);
  const [incoming, setIncoming] = useState(null);
  const [outgoing, setOutgoing] = useState(null);
  const [active, setActive] = useState(null);
  const [toast, setToast] = useState('');

  const containerRef = useRef(null);
  const zegoRef = useRef(null);
  const ringRef = useRef(null);
  const dismissed = useRef(new Set());
  const S = useRef({});
  S.current = { me, incoming, outgoing, active };

  const flash = (t) => { setToast(t); setTimeout(() => setToast(''), 3500); };

  // ------------------------------------------------------------ ringtone
  const stopRing = () => {
    const r = ringRef.current;
    if (r) { clearInterval(r.id); try { r.ctx.close(); } catch (e) { /* ignore */ } ringRef.current = null; }
  };
  const startRing = () => {
    stopRing();
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      const ctx = new Ctx();
      const beep = () => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.frequency.value = 480;
        g.gain.value = 0.08;
        o.connect(g); g.connect(ctx.destination);
        o.start();
        setTimeout(() => { try { o.stop(); } catch (e) { /* ignore */ } }, 450);
      };
      beep();
      ringRef.current = { ctx, id: setInterval(beep, 1500) };
    } catch (e) { /* autoplay blocked - the popup still shows */ }
  };

  // ---------------------------------------------- login state watcher
  useEffect(() => {
    const t = setInterval(() => { const k = getToken(); setToken((p) => (p === k ? p : k)); }, 1500);
    return () => clearInterval(t);
  }, []);

  // --------------------------------------- socket + heartbeat while logged in
  useEffect(() => {
    if (!token) {
      disconnectSocket();
      clearMe();
      setMe(null); setIncoming(null); setOutgoing(null); setActive(null);
      return undefined;
    }
    disconnectSocket();
    connectSocket();
    getMe(true).then(setMe).catch(() => {});
    const beat = () => api.post('users/heartbeat/').catch(() => {});
    beat();
    const hb = setInterval(beat, 15000);
    const unsub = subscribe((evt) => S.current.handle && S.current.handle(evt));
    return () => { clearInterval(hb); unsub(); };
  }, [token]);

  // ------------------------------------------------------------ call logic
  const leaveLocal = () => {
    if (zegoRef.current) { try { zegoRef.current.destroy(); } catch (e) { /* ignore */ } zegoRef.current = null; }
    setActive(null);
  };

  const joinRoom = (info) => {
    if (!ZEGO_SECRET) { flash('VITE_ZEGO_SERVER_SECRET .env-la set pannala!'); return; }
    stopRing();
    setIncoming(null);
    setOutgoing(null);
    setActive(info);
  };

  const endCall = async () => {
    const a = S.current.active;
    leaveLocal();
    if (a && a.call_id) { try { await api.post(`calls/${a.call_id}/end/`); } catch (e) { /* ignore */ } }
  };

  const handle = (evt) => {
    const s = S.current;
    switch (evt.event) {
      case 'message':
        maybeNotify(evt, { myId: s.me?.id });
        break;

      case 'call_incoming':
        if (s.active || s.outgoing || (s.incoming && s.incoming.call_id !== evt.call_id)) {
          if (evt.call_id) api.post(`calls/${evt.call_id}/decline/`).catch(() => {});
          break;
        }
        if (evt.call_id && dismissed.current.has(evt.call_id)) break;
        setIncoming(evt);
        if (document.hidden) showNotification('📞 Incoming call', `${evt.caller_name} is calling…`, 'call');
        break;

      case 'call_accepted':
        if (s.outgoing && s.outgoing.call.id === evt.call_id) {
          joinRoom({ room_id: s.outgoing.call.room_id, call_id: evt.call_id, call_type: s.outgoing.call.call_type, is_group: false });
        }
        break;

      case 'call_declined':
        if (s.outgoing && s.outgoing.call.id === evt.call_id) { setOutgoing(null); flash(`${s.outgoing.name} call-a decline pannitaanga`); }
        break;

      case 'call_cancelled':
        if (s.incoming && s.incoming.call_id === evt.call_id) { setIncoming(null); }
        break;

      case 'call_ended':
        if (s.active && s.active.call_id === evt.call_id) { leaveLocal(); flash('Call ended'); }
        break;

      default:
        break;
    }
  };
  S.current.handle = handle;

  const accept = async () => {
    const c = S.current.incoming;
    if (!c) return;
    if (c.is_group) {
      joinRoom({ room_id: c.room_id, call_id: null, call_type: c.call_type, is_group: true });
      return;
    }
    try {
      const r = await api.post(`calls/${c.call_id}/accept/`);
      joinRoom({ room_id: r.data.room_id, call_id: c.call_id, call_type: c.call_type, is_group: false });
    } catch (e) {
      setIncoming(null);
      flash(errMsg(e, 'Call expire aayiduchu'));
    }
  };

  const decline = async () => {
    const c = S.current.incoming;
    setIncoming(null);
    if (!c) return;
    if (c.call_id) { dismissed.current.add(c.call_id); api.post(`calls/${c.call_id}/decline/`).catch(() => {}); }
  };

  const cancelOutgoing = async () => {
    const o = S.current.outgoing;
    setOutgoing(null);
    if (o) api.post(`calls/${o.call.id}/cancel/`).catch(() => {});
  };

  // start from ChatView / Home / Calls tab:  startCall({friendId, name, callType}) or ({group:true, chatId, callType, name})
  const start = async (d) => {
    const s = S.current;
    if (s.active || s.outgoing) { flash('Already oru call-la irukeenga'); return; }
    if (!ZEGO_SECRET) { flash('VITE_ZEGO_SERVER_SECRET .env-la set pannala!'); return; }
    const callType = d.callType === 'video' ? 'video' : 'audio';
    try {
      if (d.group) {
        const r = await api.post('calls/start_group/', { chat_id: d.chatId, call_type: callType });
        joinRoom({ room_id: r.data.room_id, call_id: null, call_type: callType, is_group: true });
      } else {
        const r = await api.post('calls/start/', { receiver_id: d.friendId, call_type: callType });
        setOutgoing({ call: r.data, name: d.name || r.data.receiver_name });
      }
    } catch (e) {
      flash(errMsg(e, 'Call start aagala'));
    }
  };

  useEffect(() => {
    const h = (e) => S.current.start && S.current.start(e.detail || {});
    S.current.start = start;
    window.addEventListener('chat:start-call', h);
    return () => window.removeEventListener('chat:start-call', h);
  }, []);
  S.current.start = start;

  // ring while a call is incoming (auto-stop after 45 s)
  useEffect(() => {
    if (!incoming) { stopRing(); return undefined; }
    startRing();
    const t = setTimeout(() => setIncoming(null), RING_SECONDS * 1000);
    return () => { clearTimeout(t); stopRing(); };
  }, [incoming]);

  // outgoing: timeout + polling fallback (works even if the WebSocket is down)
  useEffect(() => {
    if (!outgoing) return undefined;
    const id = outgoing.call.id;
    const timeout = setTimeout(() => {
      api.post(`calls/${id}/cancel/`).catch(() => {});
      setOutgoing(null);
      flash('Yaarum edukkala (no answer)');
    }, RING_SECONDS * 1000);
    const poll = setInterval(async () => {
      try {
        const r = await api.get('calls/');
        const c = (r.data || []).find((x) => x.id === id);
        if (!c) return;
        if (c.status === 'ongoing') {
          joinRoom({ room_id: c.room_id, call_id: id, call_type: c.call_type, is_group: false });
        } else if (c.status === 'declined' || c.status === 'missed' || c.status === 'completed') {
          setOutgoing(null);
          flash(c.status === 'declined' ? 'Call declined' : 'No answer');
        }
      } catch (e) { /* ignore */ }
    }, 2500);
    return () => { clearTimeout(timeout); clearInterval(poll); };
  }, [outgoing]);

  // incoming fallback when the WebSocket is not connected
  useEffect(() => {
    if (!token) return undefined;
    const poll = setInterval(async () => {
      if (isSocketOpen() || S.current.incoming || S.current.active || S.current.outgoing) return;
      try {
        const r = await api.get('calls/');
        const c = (r.data || []).find((x) => x.status === 'ringing' && x.direction === 'incoming'
          && Date.now() - new Date(x.started_at).getTime() < 50000 && !dismissed.current.has(x.id));
        if (c) {
          setIncoming({ call_id: c.id, room_id: c.room_id, caller_id: c.caller, caller_name: c.caller_name, call_type: c.call_type, is_group: false });
        }
      } catch (e) { /* ignore */ }
    }, 4000);
    return () => clearInterval(poll);
  }, [token]);

  // Zego call screen
  useEffect(() => {
    if (!active || !containerRef.current) return undefined;
    let zp;
    try {
      const uid = String(S.current.me?.id || `u_${Date.now()}`);
      const name = S.current.me?.username || localStorage.getItem('username') || 'User';
      const kit = ZegoUIKitPrebuilt.generateKitTokenForProduction(ZEGO_APP_ID, ZEGO_SECRET, active.room_id, uid, name);
      zp = ZegoUIKitPrebuilt.create(kit);
      zegoRef.current = zp;
      zp.joinRoom({
        container: containerRef.current,
        scenario: { mode: active.is_group ? ZegoUIKitPrebuilt.GroupCall : ZegoUIKitPrebuilt.OneONoneCall },
        showPreJoinView: false,
        turnOnMicrophoneWhenJoining: true,
        turnOnCameraWhenJoining: active.call_type === 'video',
        showMyCameraToggleButton: active.call_type === 'video',
        showMyMicrophoneToggleButton: true,
        showAudioVideoSettingsButton: true,
        onLeaveRoom: () => { endCall(); },
      });
    } catch (e) {
      flash('Call join aagala: ' + (e?.message || e));
      setActive(null);
    }
    return () => { try { zp && zp.destroy(); } catch (e) { /* ignore */ } if (zegoRef.current === zp) zegoRef.current = null; };
  }, [active]);

  // ------------------------------------------------------------------ UI
  const overlay = { position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(20,5,10,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 };
  const card = { background: '#3b0e1b', border: '1px solid #fcd34d', borderRadius: 20, padding: 28, width: '100%', maxWidth: 340, textAlign: 'center', color: '#fff', boxShadow: '0 0 40px rgba(252,211,77,0.35)' };
  const avatar = { width: 84, height: 84, borderRadius: '50%', margin: '0 auto 14px', background: 'linear-gradient(135deg,#d4af37,#fcd34d)', color: '#3b0e1b', fontSize: 36, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' };

  return (
    <>
      {toast && (
        <div style={{ position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 10002, background: '#1f1f1f', color: '#fff', border: '1px solid #fcd34d', borderRadius: 24, padding: '8px 18px', fontSize: 13 }}>
          {toast}
        </div>
      )}

      {incoming && !active && (
        <div style={overlay}>
          <div style={card}>
            <div style={avatar}>{(incoming.is_group ? '👥' : incoming.caller_name || '?').toString().charAt(0).toUpperCase()}</div>
            <h5 className="fw-bold mb-1">{incoming.caller_name}</h5>
            <p className="mb-1" style={{ color: '#fcd34d' }}>
              {incoming.is_group ? `${incoming.group_name || 'Group'} ${incoming.call_type} call` : `Incoming ${incoming.call_type} call…`}
            </p>
            <p className="small opacity-50 mb-4">{incoming.call_type === 'video' ? '📹' : '📞'} ringing</p>
            <div className="d-flex justify-content-center gap-4">
              <button onClick={decline} className="btn btn-danger rounded-circle fs-4" style={{ width: 64, height: 64 }} title="Decline">✕</button>
              <button onClick={accept} className="btn btn-success rounded-circle fs-4" style={{ width: 64, height: 64 }} title="Accept">✓</button>
            </div>
          </div>
        </div>
      )}

      {outgoing && !active && (
        <div style={overlay}>
          <div style={card}>
            <div style={avatar}>{(outgoing.name || '?').charAt(0).toUpperCase()}</div>
            <h5 className="fw-bold mb-1">{outgoing.name}</h5>
            <p className="mb-4" style={{ color: '#fcd34d' }}>{outgoing.call.call_type === 'video' ? '📹 Video' : '📞 Voice'} calling…</p>
            <button onClick={cancelOutgoing} className="btn btn-danger rounded-pill px-4 fw-bold">Cancel</button>
          </div>
        </div>
      )}

      {active && (
        <div ref={containerRef} style={{ position: 'fixed', inset: 0, zIndex: 10001, background: '#000' }} />
      )}
    </>
  );
}
