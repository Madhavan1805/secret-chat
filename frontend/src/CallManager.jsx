import React, { useEffect, useRef, useState } from 'react';
import { BiPhone, BiPhoneOff } from 'react-icons/bi';
import CallScreen from './CallScreen';
import api from './api';
import { getToken, getMe, clearMe, errMsg } from './config';
import { connectSocket, disconnectSocket, subscribe, isSocketOpen } from './socket';
import { maybeNotify, showNotification } from './notify';


const RING_SECONDS = 45;

/**
 * Mount ONCE in App.jsx (inside <Router>, outside <Routes>).
 * - keeps the WebSocket connected while logged in
 * - sends a heartbeat every 15 s (online status + "delivered" ticks)
 * - rings on incoming calls (Accept / Decline) and runs the call screen (LiveKit, see CallScreen.jsx)
 * - shows browser notifications for new messages
 */
export default function CallManager() {
  const [token, setToken] = useState(getToken());
  const [me, setMe] = useState(null);
  const [incoming, setIncoming] = useState(null);
  const [outgoing, setOutgoing] = useState(null);
  const [active, setActive] = useState(null);
  const [toast, setToast] = useState('');

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
  const leaveLocal = () => setActive(null);

  const joinRoom = (info) => {
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
          joinRoom({ room_id: s.outgoing.call.room_id, call_id: evt.call_id, call_type: s.outgoing.call.call_type, is_group: false, name: s.outgoing.name });
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
      joinRoom({ room_id: c.room_id, call_id: null, call_type: c.call_type, is_group: true, name: c.group_name || c.caller_name });
      return;
    }
    try {
      const r = await api.post(`calls/${c.call_id}/accept/`);
      joinRoom({ room_id: r.data.room_id, call_id: c.call_id, call_type: c.call_type, is_group: false, name: c.caller_name });
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
    const callType = d.callType === 'video' ? 'video' : 'audio';
    try {
      if (d.group) {
        const r = await api.post('calls/start_group/', { chat_id: d.chatId, call_type: callType });
        joinRoom({ room_id: r.data.room_id, call_id: null, call_type: callType, is_group: true, name: d.name });
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
          joinRoom({ room_id: c.room_id, call_id: id, call_type: c.call_type, is_group: false, name: outgoing.name });
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

  // ------------------------------------------------------------------ UI
  return (
    <>
      {toast && (
        <div style={{ position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 10002, background: '#1f1f1f', color: '#fff', border: '1px solid rgba(255,100,119,.5)', borderRadius: 24, padding: '8px 18px', fontSize: 13 }}>
          {toast}
        </div>
      )}

      {incoming && !active && (
        <div className="cl-ring">
          <div>
            <div className="cl-avatar cl-pulse" style={{ margin: '0 auto' }}>{(incoming.is_group ? '👥' : incoming.caller_name || '?').toString().charAt(0).toUpperCase()}</div>
            <div className="cl-name">{incoming.is_group ? (incoming.group_name || 'Group') : incoming.caller_name}</div>
            <div className="cl-sub">{incoming.is_group ? `${incoming.caller_name} started a ${incoming.call_type} call` : `Chatzy ${incoming.call_type === 'video' ? 'video' : 'voice'} call…`}</div>
          </div>
          <div className="cl-actions">
            <button type="button" onClick={decline} className="cl-act cl-decline"><span><BiPhoneOff /></span>Decline</button>
            <button type="button" onClick={accept} className="cl-act cl-accept"><span><BiPhone /></span>Accept</button>
          </div>
        </div>
      )}

      {outgoing && !active && (
        <div className="cl-ring">
          <div>
            <div className="cl-avatar cl-pulse" style={{ margin: '0 auto' }}>{(outgoing.name || '?').charAt(0).toUpperCase()}</div>
            <div className="cl-name">{outgoing.name}</div>
            <div className="cl-sub">{outgoing.call.call_type === 'video' ? 'Video calling…' : 'Calling…'}</div>
          </div>
          <div className="cl-actions">
            <button type="button" onClick={cancelOutgoing} className="cl-act cl-decline"><span><BiPhoneOff /></span>Cancel</button>
          </div>
        </div>
      )}

      {active && (
        <CallScreen key={active.room_id} info={active} name={active.name}
          onEnd={() => endCall()} onError={(msg, fatal) => { flash(msg); if (fatal) endCall(); }} />
      )}
    </>
  );
}
