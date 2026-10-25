import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { BiStar, BiTrash, BiMobile, BiCamera } from 'react-icons/bi';
import api from './api';
import Avatar from './Avatar';
import QrCode from './QrCode';
import { PinPad } from './LockGate';
import { Sheet, Toggle, Choice, SettingRow, Seal } from './ui';
import { errMsg, formatListTime, asList } from './config';
import { setPin, checkPin, removePin, lockEnabled, shieldEnabled, setShieldEnabled, lockDelaySeconds, setLockDelaySeconds } from './appLock';

// ------------------------------------------------------------------ privacy
const WHO = [['everyone', 'Everyone'], ['friends', 'Friends'], ['nobody', 'Nobody']];

export function PrivacySheet({ T, onClose, ask }) {
  const [p, setP] = useState(null);
  useEffect(() => { api.get('privacy/').then((r) => setP(r.data)).catch(() => ask({ type: 'alert', title: 'Could not load privacy settings' })); }, []);
  const save = async (patch) => {
    const before = p;
    setP({ ...p, ...patch });
    try { const r = await api.post('privacy/', patch); setP(r.data); } catch (e) { setP(before); ask({ type: 'alert', title: errMsg(e, 'Could not save') }); }
  };
  return (
    <Sheet T={T} title="Privacy" onClose={onClose}>
      {!p ? <p style={{ color: 'var(--sub)' }}>Loading…</p> : (
        <>
          <label className="sc-label">Who can see my last seen and online status</label>
          <Choice value={p.last_seen} options={WHO} onChange={(v) => save({ last_seen: v })} />
          <p className="sc-label" style={{ fontWeight: 400 }}>If you hide yours, you will not see theirs either.</p>

          <label className="sc-label">Who can see my profile photo</label>
          <Choice value={p.photo} options={WHO} onChange={(v) => save({ photo: v })} />

          <div className="sc-set-group" style={{ marginTop: 22 }}>
            <SettingRow title="Read receipts" sub="Turn off to stop showing blue ticks. You will not see theirs either."
              right={<Toggle on={p.read_receipts} onChange={(v) => save({ read_receipts: v })} label="Read receipts" />} />
          </div>
        </>
      )}
    </Sheet>
  );
}

// ------------------------------------------------------------------ devices
export function DevicesSheet({ T, onClose, ask }) {
  const [rows, setRows] = useState(null);
  const load = useCallback(() => { api.get('devices/').then((r) => setRows(r.data.devices || [])).catch(() => setRows([])); }, []);
  useEffect(load, [load]);
  const revoke = async (d) => {
    const ok = await ask({ type: 'confirm', title: `Sign out ${d.name}?`, danger: true, okText: 'Sign out' });
    if (!ok) return;
    try { await api.post('devices/revoke/', { id: d.id }); load(); } catch (e) { ask({ type: 'alert', title: errMsg(e, 'Failed') }); }
  };
  const revokeOthers = async () => {
    const ok = await ask({ type: 'confirm', title: 'Sign out all other devices?', message: 'Only this device stays logged in.', danger: true, okText: 'Sign out all' });
    if (!ok) return;
    try { await api.post('devices/revoke_others/'); load(); } catch (e) { ask({ type: 'alert', title: errMsg(e, 'Failed') }); }
  };
  return (
    <Sheet T={T} title="Logged-in devices" onClose={onClose}>
      {!rows ? <p style={{ color: 'var(--sub)' }}>Loading…</p> : (
        <>
          <div className="sc-set-group">
            {rows.map((d) => (
              <SettingRow key={d.id} icon={<BiMobile />} title={`${d.name}${d.current ? ' (this device)' : ''}`}
                sub={`${d.ip ? `${d.ip} · ` : ''}Active ${formatListTime(d.last_used) || 'now'}`}
                right={!d.current && <button type="button" className="sc-iconbtn" aria-label={`Sign out ${d.name}`} onClick={() => revoke(d)}><BiTrash /></button>} />
            ))}
            {rows.length === 0 && <p style={{ padding: 16, color: 'var(--sub)', margin: 0 }}>No devices found.</p>}
          </div>
          {rows.length > 1 && <button type="button" className="sc-btn danger" onClick={revokeOthers}>Sign out all other devices</button>}
        </>
      )}
    </Sheet>
  );
}

// ------------------------------------------------------------------ app lock
const DELAYS = [[0, 'Instantly'], [30, '30 sec'], [300, '5 min']];

export function LockSheet({ T, onClose, ask }) {
  const [on, setOn] = useState(lockEnabled());
  const [mode, setMode] = useState(null);                 // null | 'new' | 'confirm' | 'verify-off' | 'verify-change'
  const [first, setFirst] = useState('');
  const [err, setErr] = useState(0);
  const [shield, setShield] = useState(shieldEnabled());
  const [delay, setDelay] = useState(lockDelaySeconds());

  const onPin = async (pin) => {
    if (mode === 'new') { setFirst(pin); setMode('confirm'); return; }
    if (mode === 'confirm') {
      if (pin !== first) { setErr((n) => n + 1); setMode('new'); return; }
      await setPin(pin); setOn(true); setMode(null); return;
    }
    if (!(await checkPin(pin))) { setErr((n) => n + 1); return; }
    if (mode === 'verify-off') { removePin(); setOn(false); setMode(null); } else setMode('new');
  };

  if (mode) {
    const title = mode === 'new' ? 'Choose a PIN' : mode === 'confirm' ? 'Repeat the PIN' : 'Enter current PIN';
    return (
      <Sheet T={T} title="App lock" onClose={() => setMode(null)}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, textAlign: 'center', paddingTop: 10 }}>
          <PinPad title={title} hint={mode === 'new' && err ? 'The PINs did not match. Try again.' : '4 digits. Stored only on this phone.'} onComplete={onPin} error={err} resetKey={mode} />
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet T={T} title="App lock & privacy shield" onClose={onClose}>
      <div className="sc-set-group">
        <SettingRow icon={<Seal size={22} />} title="PIN lock" sub={on ? 'On. Asks for your PIN when you come back to the app.' : 'Ask for a 4-digit PIN to open Chatzy.'}
          right={<Toggle on={on} onChange={(v) => setMode(v ? 'new' : 'verify-off')} label="PIN lock" />} />
        {on && <SettingRow title="Change PIN" onClick={() => setMode('verify-change')} />}
      </div>
      {on && (
        <>
          <label className="sc-label">Lock after leaving the app for</label>
          <Choice value={delay} options={DELAYS} onChange={(v) => { setDelay(v); setLockDelaySeconds(v); }} />
        </>
      )}
      <div className="sc-set-group" style={{ marginTop: 22 }}>
        <SettingRow title="Privacy shield" sub="Hides your chats in the app switcher and when the app goes to the background."
          right={<Toggle on={shield} onChange={(v) => { setShield(v); setShieldEnabled(v); }} label="Privacy shield" />} />
      </div>
      <p className="sc-label" style={{ fontWeight: 400, lineHeight: 1.5 }}>
        Blocking screenshots completely is only possible inside the Android app (it needs the FLAG_SECURE window setting). A website cannot do it.
      </p>
    </Sheet>
  );
}

// ------------------------------------------------------------------ QR: my code + scan
const QR_PREFIX = 'secretchat:add:';
export const qrTextFor = (username) => `${QR_PREFIX}${username}`;
export const parseQr = (raw) => (typeof raw === 'string' && raw.startsWith(QR_PREFIX) ? raw.slice(QR_PREFIX.length).trim() : null);

function Scanner({ onFound }) {
  const video = useRef(null);
  const [state, setState] = useState('starting');           // starting | live | unsupported | denied
  useEffect(() => {
    let stream; let timer; let stopped = false;
    (async () => {
      if (!('BarcodeDetector' in window) || !navigator.mediaDevices?.getUserMedia) { setState('unsupported'); return; }
      try {
        const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        if (stopped) { stream.getTracks().forEach((t) => t.stop()); return; }
        video.current.srcObject = stream;
        await video.current.play();
        setState('live');
        timer = setInterval(async () => {
          try {
            const codes = await detector.detect(video.current);
            const name = codes.length ? parseQr(codes[0].rawValue) : null;
            if (name) { clearInterval(timer); onFound(name); }
          } catch (e) { /* frame not ready */ }
        }, 350);
      } catch (e) { setState('denied'); }
    })();
    return () => { stopped = true; clearInterval(timer); if (stream) stream.getTracks().forEach((t) => t.stop()); };
  }, []);
  if (state === 'unsupported' || state === 'denied') {
    return <p style={{ color: 'var(--sub)', textAlign: 'center', margin: '24px 0' }}>{state === 'denied' ? 'Camera permission is off.' : 'This browser cannot scan codes.'} Type the Secret ID below instead.</p>;
  }
  return (
    <div style={{ position: 'relative', borderRadius: 24, overflow: 'hidden', background: '#000', aspectRatio: '1' }}>
      <video ref={video} playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      <div style={{ position: 'absolute', inset: '18%', border: '3px solid var(--accent)', borderRadius: 22, boxShadow: '0 0 0 999px rgba(0,0,0,.35)' }} />
      {state === 'starting' && <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: '#fff' }}>Starting camera…</span>}
    </div>
  );
}

export function QrSheet({ T, me, onClose, onAddUser }) {
  const [tab, setTab] = useState('mine');
  const [manual, setManual] = useState('');
  const name = me?.username || localStorage.getItem('username') || '';
  const go = (u) => { if (u) onAddUser(u); };
  return (
    <Sheet T={T} title="QR code" onClose={onClose}>
      <Choice value={tab} options={[['mine', 'My code'], ['scan', 'Scan']]} onChange={setTab} />
      {tab === 'mine' ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, marginTop: 26 }}>
          <div style={{ padding: 14, borderRadius: 28, background: 'var(--surface)' }}><QrCode text={qrTextFor(name)} size={236} /></div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 20 }}>{name}</div>
          <p style={{ color: 'var(--sub)', textAlign: 'center', margin: 0, maxWidth: 280 }}>Ask your friend to scan this from Chatzy to send you a request.</p>
        </div>
      ) : (
        <div style={{ marginTop: 20 }}>
          <Scanner onFound={go} />
          <label className="sc-label"><BiCamera style={{ verticalAlign: '-2px' }} /> Or type a Secret ID</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="sc-field" placeholder="username" value={manual} onChange={(e) => setManual(e.target.value)} autoCapitalize="none" />
            <button type="button" className="sc-btn" disabled={!manual.trim()} onClick={() => go(manual.trim())}>Add</button>
          </div>
        </div>
      )}
    </Sheet>
  );
}

// ------------------------------------------------------------------ starred messages
const previewOf = (m) => {
  if (m.message_type === 'image') return '📷 Photo';
  if (m.message_type === 'video') return '🎬 Video';
  if (m.message_type === 'audio') return '🎤 Voice message';
  if (m.message_type === 'document') return `📄 ${m.file_name || 'Document'}`;
  if (m.message_type === 'poll') return `📊 ${m.poll?.question || 'Poll'}`;
  return m.content;
};

export function StarredSheet({ T, onClose, ask }) {
  const navigate = useNavigate();
  const [rows, setRows] = useState(null);
  useEffect(() => { api.get('messages/starred/').then((r) => setRows(asList(r.data))).catch(() => setRows([])); }, []);
  const open = (r) => {
    onClose();
    if (r.is_group) navigate(`/chat/${encodeURIComponent(r.title)}`, { state: { chatId: r.chat_id } });
    else navigate(`/chat/${encodeURIComponent(r.title)}`, { state: { friendId: r.friend_id } });
  };
  const unstar = async (r) => {
    try { await api.post('messages/star/', { message_id: r.message.id }); setRows((x) => x.filter((y) => y.message.id !== r.message.id)); } catch (e) { ask({ type: 'alert', title: errMsg(e, 'Failed') }); }
  };
  return (
    <Sheet T={T} title="Starred messages" onClose={onClose}>
      {!rows ? <p style={{ color: 'var(--sub)' }}>Loading…</p> : rows.length === 0 ? (
        <div className="sc-empty"><BiStar style={{ fontSize: 34, color: 'var(--accent)' }} /><b>No starred messages</b>Long-press a message and choose Star to keep it here.</div>
      ) : (
        <div className="sc-set-group">
          {rows.map((r) => (
            <div key={r.message.id} className="sc-set" role="button" tabIndex={0} onClick={() => open(r)} onKeyDown={(e) => { if (e.key === 'Enter') open(r); }}>
              <span className="txt">
                <small style={{ color: 'var(--accent)', fontWeight: 600 }}>{r.message.sender_name} in {r.title}</small>
                <b style={{ fontWeight: 500, fontFamily: 'var(--font-body)', wordBreak: 'break-word' }}>{previewOf(r.message)}</b>
                <small>{formatListTime(r.message.created_at)}</small>
              </span>
              <button type="button" className="sc-iconbtn on" aria-label="Remove star" onClick={(e) => { e.stopPropagation(); unstar(r); }}><BiStar /></button>
            </div>
          ))}
        </div>
      )}
    </Sheet>
  );
}

// ------------------------------------------------------------------ blocked users
export function BlockedSheet({ T, onClose, users, onUnblock }) {
  return (
    <Sheet T={T} title="Blocked users" onClose={onClose}>
      {users.length === 0 ? <div className="sc-empty"><b>Nobody is blocked</b>People you block cannot message or call you.</div> : (
        <div className="sc-set-group">
          {users.map((u) => (
            <div key={u.id} className="sc-set">
              <Avatar src={u.profile_picture} name={u.username} size={38} T={T} />
              <span className="txt"><b>{u.username}</b></span>
              <button type="button" className="sc-btn ghost" onClick={() => onUnblock(u.id)}>Unblock</button>
            </div>
          ))}
        </div>
      )}
    </Sheet>
  );
}
