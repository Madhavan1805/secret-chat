import React, { useCallback, useEffect, useState } from 'react';
import api from './api';
import QrCode from './QrCode';
import { Sheet, Choice, SettingRow } from './ui';
import { errMsg, formatSize, asList } from './config';
import { getLang, setLang, t } from './i18n';
import { TONE_LIST, previewTone, setLocalTone } from './tones';

// ------------------------------------------------------------------ 2-step verification
export function TwoFactorSheet({ T, onClose, ask }) {
  const [on, setOn] = useState(null);
  const [setup, setSetup] = useState(null);          // { secret, uri } while turning on
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { api.get('account/2fa/').then((r) => setOn(!!r.data.enabled)).catch(() => setOn(false)); }, []);

  const start = async () => {
    setBusy(true);
    try { const r = await api.post('account/2fa/setup/'); setSetup(r.data); setCode(''); } catch (e) { ask({ type: 'alert', title: errMsg(e, 'Could not start') }); }
    setBusy(false);
  };
  const enable = async () => {
    setBusy(true);
    try { await api.post('account/2fa/enable/', { code }); setOn(true); setSetup(null); ask({ type: 'alert', title: '2-step verification is on', message: 'From now on, logging in needs the 6-digit code from your authenticator app.' }); } catch (e) { ask({ type: 'alert', title: errMsg(e, 'Wrong code') }); }
    setBusy(false);
  };
  const disable = async () => {
    const password = await ask({ type: 'prompt', title: 'Turn off 2-step verification', message: 'Your account password:', inputType: 'password', okText: 'Next' });
    if (!password) return;
    const c = await ask({ type: 'prompt', title: 'Authenticator code', message: 'The 6-digit code now:', inputMode: 'numeric', maxLength: 6, okText: 'Turn off', danger: true });
    if (!c) return;
    try { await api.post('account/2fa/disable/', { password, code: c }); setOn(false); } catch (e) { ask({ type: 'alert', title: errMsg(e, 'Could not turn off') }); }
  };

  return (
    <Sheet T={T} title={t('2-step verification')} onClose={onClose}>
      {on === null && <p style={{ color: 'var(--sub)' }}>Loading…</p>}
      {on === false && !setup && (
        <>
          <p style={{ color: 'var(--sub)', lineHeight: 1.5 }}>Even if someone knows your password, they cannot log in without a 6-digit code from an authenticator app (Google Authenticator, Microsoft Authenticator, Authy…).</p>
          <button type="button" className="sc-btn" disabled={busy} onClick={start}>Set up</button>
        </>
      )}
      {on === false && setup && (
        <>
          <p style={{ lineHeight: 1.5 }}>1. Open your authenticator app and add an account: scan this QR, or type the key.</p>
          <div style={{ display: 'flex', justifyContent: 'center', margin: '10px 0', background: '#fff', padding: 10, borderRadius: 14 }}><QrCode text={setup.uri} size={190} /></div>
          <p style={{ textAlign: 'center', wordBreak: 'break-all', fontFamily: 'monospace', fontSize: 14, userSelect: 'all' }}>{setup.secret}</p>
          <p style={{ lineHeight: 1.5 }}>2. Type the 6-digit code it shows:</p>
          <input className="sc-field" inputMode="numeric" maxLength={6} placeholder="123456" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
          <button type="button" className="sc-btn" style={{ marginTop: 10 }} disabled={busy || code.length !== 6} onClick={enable}>Turn on</button>
          <p style={{ color: 'var(--sub)', fontSize: 12.5, lineHeight: 1.5, marginTop: 10 }}>Keep the key somewhere safe. If you lose your phone and the key, you cannot log in.</p>
        </>
      )}
      {on === true && (
        <>
          <p style={{ lineHeight: 1.5 }}>✅ 2-step verification is <b>on</b>. Logging in needs your password and an authenticator code.</p>
          <button type="button" className="sc-btn danger" onClick={disable}>{t('Turn off')}</button>
        </>
      )}
    </Sheet>
  );
}

// ------------------------------------------------------------------ broadcast lists
export function BroadcastSheet({ T, onClose, ask }) {
  const [lists, setLists] = useState(null);
  const [friends, setFriends] = useState([]);
  const [view, setView] = useState({ mode: 'list' });          // list | edit (list or {}) | send (list)
  const [name, setName] = useState('');
  const [picked, setPicked] = useState({});
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api.get('broadcasts/').then((r) => setLists(r.data.lists)).catch(() => setLists([])), []);
  useEffect(() => {
    load();
    api.get('chats/targets/').then((r) => setFriends(asList(r.data).filter((x) => x.type === 'friend'))).catch(() => {});
  }, [load]);

  const openEdit = (l) => {
    setName(l ? l.name : '');
    setPicked(l ? Object.fromEntries(l.recipients.map((r) => [r.id, true])) : {});
    setView({ mode: 'edit', list: l });
  };
  const save = async () => {
    const ids = Object.keys(picked).filter((k) => picked[k]).map(Number);
    setBusy(true);
    try {
      if (view.list) await api.post('broadcasts/update/', { id: view.list.id, name, recipient_ids: ids });
      else await api.post('broadcasts/', { name, recipient_ids: ids });
      await load();
      setView({ mode: 'list' });
    } catch (e) { ask({ type: 'alert', title: errMsg(e, 'Could not save') }); }
    setBusy(false);
  };
  const remove = async () => {
    const ok = await ask({ type: 'confirm', title: `Delete "${view.list.name}"?`, message: 'Messages already sent stay in the chats.', danger: true, okText: 'Delete' });
    if (!ok) return;
    try { await api.post('broadcasts/delete/', { id: view.list.id }); await load(); setView({ mode: 'list' }); } catch (e) { ask({ type: 'alert', title: errMsg(e, 'Failed') }); }
  };
  const send = async () => {
    setBusy(true);
    try {
      const r = await api.post('broadcasts/send/', { id: view.list.id, content: text });
      setText('');
      setView({ mode: 'list' });
      ask({ type: 'alert', title: `Sent to ${r.data.sent} friend${r.data.sent === 1 ? '' : 's'}`, message: r.data.skipped ? `${r.data.skipped} skipped (blocked or locked chat).` : 'Each one got it as a normal chat message.' });
    } catch (e) { ask({ type: 'alert', title: errMsg(e, 'Could not send') }); }
    setBusy(false);
  };

  const back = view.mode !== 'list' ? () => setView({ mode: 'list' }) : onClose;
  return (
    <Sheet T={T} title={view.mode === 'edit' ? (view.list ? 'Edit list' : 'New list') : view.mode === 'send' ? view.list.name : t('Broadcast lists')} onClose={back}>
      {view.mode === 'list' && (
        <>
          <p style={{ color: 'var(--sub)', lineHeight: 1.5 }}>Write once, send to many friends. Everyone gets it as a normal one-to-one message, and replies come to you privately.</p>
          {lists === null && <p style={{ color: 'var(--sub)' }}>Loading…</p>}
          <div className="sc-set-group">
            {(lists || []).map((l) => (
              <SettingRow key={l.id} icon={<span style={{ fontSize: 20 }}>📢</span>} title={l.name} sub={`${l.recipients.length} friend${l.recipients.length === 1 ? '' : 's'}`}
                onClick={() => setView({ mode: 'send', list: l })}
                right={<button type="button" className="sc-btn ghost" style={{ height: 32, padding: '0 12px', fontSize: 13 }} onClick={(e) => { e.stopPropagation(); openEdit(l); }}>{t('Edit')}</button>} />
            ))}
          </div>
          <button type="button" className="sc-btn" style={{ marginTop: 12 }} onClick={() => openEdit(null)}>+ New list</button>
        </>
      )}
      {view.mode === 'edit' && (
        <>
          <input className="sc-field" placeholder="List name (e.g. College friends)" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
          <p className="sc-label" style={{ marginTop: 14 }}>Friends in this list</p>
          <div style={{ maxHeight: '45vh', overflowY: 'auto' }}>
            {friends.map((f) => (
              <label key={f.friend_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 2px' }}>
                <input type="checkbox" checked={!!picked[f.friend_id]} onChange={(e) => setPicked((p) => ({ ...p, [f.friend_id]: e.target.checked }))} />
                <span>{f.name}</span>
              </label>
            ))}
            {!friends.length && <p style={{ color: 'var(--sub)' }}>No friends yet.</p>}
          </div>
          <button type="button" className="sc-btn" style={{ marginTop: 12 }} disabled={busy || !name.trim()} onClick={save}>{t('Save')}</button>
          {view.list && <button type="button" className="sc-btn danger" style={{ marginTop: 8 }} onClick={remove}>{t('Delete')}</button>}
        </>
      )}
      {view.mode === 'send' && (
        <>
          <p style={{ color: 'var(--sub)' }}>To: {view.list.recipients.map((r) => r.username).join(', ') || 'nobody'}</p>
          <textarea className="sc-field" rows={5} style={{ height: 'auto', padding: 12 }} placeholder="Type your message" maxLength={4000} value={text} onChange={(e) => setText(e.target.value)} />
          <button type="button" className="sc-btn" style={{ marginTop: 10 }} disabled={busy || !text.trim()} onClick={send}>{t('Send')}</button>
        </>
      )}
    </Sheet>
  );
}

// ------------------------------------------------------------------ storage
const KIND = { image: '🖼️ Photos', video: '🎞️ Videos', audio: '🎙️ Voice notes', document: '📄 Documents' };
export function StorageSheet({ T, onClose, ask }) {
  const [data, setData] = useState(null);
  const [est, setEst] = useState(null);
  const [cleared, setCleared] = useState(false);
  useEffect(() => {
    api.get('storage/').then((r) => setData(r.data)).catch(() => setData({ kinds: {}, total_bytes: 0 }));
    if (navigator.storage && navigator.storage.estimate) navigator.storage.estimate().then(setEst).catch(() => {});
  }, []);
  const clearCache = async () => {
    const ok = await ask({ type: 'confirm', title: 'Clear app cache?', message: 'Saved app files on this phone are removed and downloaded again when needed. Your chats, login and settings are not touched.', okText: 'Clear' });
    if (!ok) return;
    try {
      if (window.caches) { const keys = await caches.keys(); await Promise.all(keys.map((k) => caches.delete(k))); }
      setCleared(true);
      if (navigator.storage && navigator.storage.estimate) navigator.storage.estimate().then(setEst).catch(() => {});
    } catch (e) { ask({ type: 'alert', title: 'Could not clear' }); }
  };
  return (
    <Sheet T={T} title={t('Storage')} onClose={onClose}>
      {!data ? <p style={{ color: 'var(--sub)' }}>Loading…</p> : (
        <>
          <p className="sc-label">Media in your chats (on the server)</p>
          <div className="sc-set-group">
            {Object.keys(KIND).map((k) => (
              <SettingRow key={k} title={KIND[k]} sub={`${data.kinds[k]?.count || 0} files`} right={<b>{formatSize(data.kinds[k]?.bytes || 0)}</b>} />
            ))}
            <SettingRow title="Total" right={<b>{formatSize(data.total_bytes)}</b>} />
          </div>
          <p style={{ color: 'var(--sub)', fontSize: 12.5, lineHeight: 1.5 }}>To free space, delete big photos / videos from the chat (long-press → Delete). Use the chat Media gallery to find them.</p>
        </>
      )}
      <p className="sc-label" style={{ marginTop: 18 }}>On this phone</p>
      <div className="sc-set-group">
        <SettingRow title="App cache" sub={est ? `${formatSize(est.usage || 0)} used` : 'Saved app files'} right={cleared ? <b>Cleared ✓</b> : undefined} />
      </div>
      <button type="button" className="sc-btn ghost" onClick={clearCache}>Clear app cache</button>
    </Sheet>
  );
}

// ------------------------------------------------------------------ quick replies
export function QuickRepliesSheet({ T, onClose, ask }) {
  const [rows, setRows] = useState(null);
  const [shortcut, setShortcut] = useState('');
  const [text, setText] = useState('');
  const load = () => api.get('quick-replies/').then((r) => setRows(r.data.replies)).catch(() => setRows([]));
  useEffect(() => { load(); }, []);
  const add = async () => {
    try { const r = await api.post('quick-replies/', { shortcut, text }); setRows(r.data.replies); setShortcut(''); setText(''); } catch (e) { ask({ type: 'alert', title: errMsg(e, 'Could not save') }); }
  };
  const del = async (id) => { try { await api.post('quick-replies/delete/', { id }); load(); } catch (e) { ask({ type: 'alert', title: errMsg(e, 'Failed') }); } };
  return (
    <Sheet T={T} title={t('Quick replies')} onClose={onClose}>
      <p style={{ color: 'var(--sub)', lineHeight: 1.5 }}>Save a text you type often. In any chat, type <b>/</b> and the shortcut (like <b>/busy</b>) to drop it in.</p>
      <input className="sc-field" placeholder="Shortcut, e.g. busy" maxLength={20} value={shortcut} onChange={(e) => setShortcut(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))} />
      <textarea className="sc-field" rows={3} style={{ height: 'auto', padding: 12, marginTop: 8 }} placeholder="Text, e.g. I'm busy now, will call you later" maxLength={500} value={text} onChange={(e) => setText(e.target.value)} />
      <button type="button" className="sc-btn" style={{ marginTop: 8 }} disabled={!shortcut || !text.trim()} onClick={add}>{t('Save')}</button>
      <div className="sc-set-group" style={{ marginTop: 16 }}>
        {(rows || []).map((q) => (
          <SettingRow key={q.id} title={`/${q.shortcut}`} sub={q.text}
            right={<button type="button" className="sc-btn ghost" style={{ height: 32, padding: '0 12px', fontSize: 13 }} onClick={() => del(q.id)}>{t('Delete')}</button>} />
        ))}
      </div>
    </Sheet>
  );
}

// ------------------------------------------------------------------ language
export function LanguageSheet({ T, onClose }) {
  const [lang, setL] = useState(getLang());
  const pick = (v) => { setLang(v); setL(v); setTimeout(() => window.location.reload(), 150); };
  return (
    <Sheet T={T} title={t('Language')} onClose={onClose}>
      <Choice value={lang} options={[['en', 'English'], ['ta', 'தமிழ்']]} onChange={pick} />
      <p style={{ color: 'var(--sub)', fontSize: 13, lineHeight: 1.5, marginTop: 12 }}>Menus and main screens change. The app reloads once.</p>
    </Sheet>
  );
}

// ------------------------------------------------------------------ message tone + call ringtone for one chat
export function ToneSheet({ T, chatId, friendId, isGroup, tone, callTone, onClose, ask }) {
  const [tn, setTn] = useState(tone || '');
  const [ct, setCt] = useState(callTone || '');
  const save = async (patch) => {
    try {
      await api.post('chats/settings/', { chat_id: chatId, ...patch });
      setLocalTone(chatId, friendId, patch);
    } catch (e) { ask({ type: 'alert', title: errMsg(e, 'Could not save') }); }
  };
  return (
    <Sheet T={T} title={t('Chat tone')} onClose={onClose}>
      <p className="sc-label">New message sound</p>
      <Choice value={tn} options={TONE_LIST} onChange={(v) => { setTn(v); previewTone(v); save({ tone: v }); }} />
      {!isGroup && (
        <>
          <p className="sc-label" style={{ marginTop: 20 }}>Ringtone when this friend calls</p>
          <Choice value={ct} options={TONE_LIST} onChange={(v) => { setCt(v); previewTone(v); save({ call_tone: v }); }} />
        </>
      )}
      <p style={{ color: 'var(--sub)', fontSize: 12.5, lineHeight: 1.5, marginTop: 14 }}>Plays while the app is open. Phone notifications use the phone's own sound.</p>
    </Sheet>
  );
}

// ------------------------------------------------------------------ "/shortcut" suggestions above the message box
export function QuickReplyList({ replies, query, onPick }) {
  const q = query.toLowerCase();
  const list = replies.filter((r) => r.shortcut.startsWith(q)).slice(0, 5);
  if (!list.length) return null;
  return (
    <div className="sc-menu" style={{ position: 'absolute', left: 10, right: 10, bottom: '100%', top: 'auto', marginBottom: 6, zIndex: 50 }}>
      {list.map((r) => (
        <button key={r.id} type="button" onMouseDown={(ev) => ev.preventDefault()} onClick={() => onPick(r.text)}>
          <b>/{r.shortcut}</b> <span style={{ color: 'var(--sub)' }}>{r.text.slice(0, 40)}</span>
        </button>
      ))}
    </div>
  );
}
