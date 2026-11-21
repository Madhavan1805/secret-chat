import React, { useCallback, useEffect, useState } from 'react';
import api from './api';
import { errMsg, formatListTime } from './config';
import { Avatar, Tags, KV, dt, dd, seen } from './AdminParts';

const FILTERS = [['all', 'All'], ['reported', 'Reported'], ['banned', 'Banned'], ['verified', 'Verified']];
const cancelled = (v) => v === null || v === undefined || v === false;

// ------------------------------------------------------------------ list of every account
export function UsersTab({ ask, onChanged, openId, setOpenId }) {
  const [users, setUsers] = useState([]);
  const [count, setCount] = useState(0);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => api.get('admin-api/users/', { params: { q, filter } })
    .then((r) => { setUsers(r.data.users); setCount(r.data.count); setLoading(false); })
    .catch((e) => { setLoading(false); ask({ type: 'alert', title: errMsg(e, 'Could not load users') }); }), [q, filter, ask]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  if (openId) return <UserDetail id={openId} ask={ask} onBack={() => { setOpenId(null); load(); }} onChanged={() => { load(); onChanged(); }} />;
  return (
    <>
      <input className="adm-search" placeholder="Search name, email or phone" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search users" />
      <div className="adm-chips">
        {FILTERS.map(([k, l]) => <button key={k} type="button" className={`adm-chip${filter === k ? ' on' : ''}`} onClick={() => setFilter(k)}>{l}</button>)}
      </div>
      <p className="adm-sub" style={{ margin: '0 4px 8px' }}>{loading ? 'Loading…' : `${count} account${count === 1 ? '' : 's'}${count > users.length ? ` (showing ${users.length})` : ''}`}</p>
      {users.map((u) => (
        <button key={u.id} type="button" className="adm-user" onClick={() => setOpenId(u.id)}>
          <Avatar u={u} />
          <span style={{ minWidth: 0, flex: 1 }}>
            <span className="nm">{u.username} <Tags u={u} /></span>
            <span className="meta" style={{ display: 'block' }}>{u.is_online ? <span className="on">● Online</span> : seen(u)} · joined {dd(u.date_joined)}</span>
          </span>
          <span className="adm-sub">›</span>
        </button>
      ))}
      {!loading && !users.length && <p className="adm-empty">No accounts match.</p>}
    </>
  );
}

// ------------------------------------------------------------------ one account: everything + every action
function UserDetail({ id, ask, onBack, onChanged }) {
  const [d, setD] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api.get(`admin-api/users/${id}/`).then((r) => setD(r.data)).catch((e) => ask({ type: 'alert', title: errMsg(e, 'Could not load') })), [id, ask]);
  useEffect(() => { load(); }, [load]);

  const call = async (url, body, okMsg) => {
    setBusy(true);
    try { await api.post(url, { user_id: id, ...body }); await load(); onChanged(); if (okMsg) ask({ type: 'alert', title: okMsg }); setBusy(false); return true; } catch (e) { ask({ type: 'alert', title: errMsg(e, 'Could not do that') }); }
    setBusy(false);
    return false;
  };
  const confirmCall = async (url, title, message, okText, danger, okMsg, body = {}) => {
    const ok = await ask({ type: 'confirm', title, message, okText, danger });
    if (ok) return call(url, body, okMsg);
    return false;
  };

  if (!d) return <><button type="button" className="adm-back" onClick={onBack}>‹ Users</button><p className="adm-empty">Loading…</p></>;

  const warn = async () => {
    const text = await ask({ type: 'prompt', title: `Warn ${d.username}`, message: 'They get this as a message from the official ChatzyTeam account and as a phone notification.', initial: '', maxLength: 500, okText: 'Send warning' });
    if (!cancelled(text) && String(text).trim()) call('admin-api/users/warn/', { text }, 'Warning sent');
  };
  const sendMessage = async () => {
    const text = await ask({ type: 'prompt', title: `Message ${d.username}`, message: 'Sent to their chat from your account. You do not need to be friends, and they can reply.', initial: '', maxLength: 500, okText: 'Send' });
    if (!cancelled(text) && String(text).trim()) call('admin-api/users/message/', { content: String(text).trim() }, 'Message sent');
  };
  const setPassword = async () => {
    const pw = await ask({ type: 'prompt', title: `New password for ${d.username}`, message: 'At least 6 characters. They are signed out everywhere and must log in with this. Tell it to them privately.', initial: '', maxLength: 40, okText: 'Set password' });
    if (!cancelled(pw) && String(pw).length) call('admin-api/users/password/', { password: pw }, 'Password changed');
  };
  const ban = async () => {
    const len = await ask({ type: 'choice', title: `Ban ${d.username}`, message: 'For how long?', choices: [
      { label: '⏱ 1 day', value: '1' }, { label: '📅 7 days', value: '7' }, { label: '🗓 30 days', value: '30' }, { label: '🚫 Permanent', value: '0' }] });
    if (cancelled(len)) return;
    const reason = await ask({ type: 'prompt', title: 'Reason (shown to them)', initial: '', maxLength: 200, okText: 'Ban', danger: true });
    if (cancelled(reason)) return;
    call('admin-api/users/ban/', { days: Number(len), reason });
  };
  const remove = async () => {
    const ok = await ask({ type: 'confirm', title: `Delete ${d.username} for good?`, message: 'Their account, chats, messages and media are removed. This cannot be undone.', okText: 'Delete', danger: true });
    if (!ok) return;
    if (await call('admin-api/users/delete/', {})) onBack();
  };

  const mine = d.admin_source === 'env';
  const A = ({ icon, label, onClick, danger, hide }) => (hide ? null : <button type="button" className={`adm-act${danger ? ' danger' : ''}`} disabled={busy} onClick={onClick}><i>{icon}</i>{label}</button>);

  return (
    <>
      <button type="button" className="adm-back" onClick={onBack}>‹ Users</button>
      <div className="adm-hero">
        <Avatar u={d} big />
        <h3>{d.username}</h3>
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}><Tags u={d} /></div>
        <p className="adm-sub" style={{ margin: '8px 0 0' }}>{d.bio || '—'}</p>
        <p className="adm-sub" style={{ margin: '2px 0 0' }}>{d.is_online ? '● Online now' : seen(d)}</p>
      </div>

      {d.is_banned && (
        <div className="adm-card" style={{ border: '1px solid #e5484d' }}>
          <p><b>🚫 Banned</b> {d.banned_until ? `until ${dt(d.banned_until)}` : 'permanently'}</p>
          <p className="adm-sub">{d.ban_reason ? `Reason: ${d.ban_reason}` : 'No reason given'}</p>
        </div>
      )}

      <div className="adm-acts">
        <A icon="💬" label="Message" onClick={sendMessage} hide={d.is_admin} />
        <A icon="⚠️" label="Warn" onClick={warn} hide={d.is_admin} />
        <A icon="✓" label={d.is_verified ? 'Remove tick' : 'Verify'} onClick={() => call('admin-api/users/verify/', { verified: !d.is_verified })} />
        <A icon="🛡" label={d.is_admin ? 'Remove admin' : 'Make admin'} onClick={() => confirmCall('admin-api/users/admin/',
          d.is_admin ? `Remove admin from ${d.username}?` : `Make ${d.username} an admin?`,
          d.is_admin ? '' : 'They can see this panel, ban people and delete accounts.', d.is_admin ? 'Remove' : 'Make admin', false, null, { make: !d.is_admin })} />
        <A icon="📵" label="Sign out" onClick={() => confirmCall('admin-api/users/logout/', `Sign ${d.username} out?`, 'Logged out on every phone. They can log in again.', 'Sign out', false, 'Signed out everywhere')} />
        <A icon="🔑" label="New password" onClick={setPassword} hide={d.is_admin} />
        <A icon="🖼" label="Remove photo" onClick={() => confirmCall('admin-api/users/photo/', 'Remove profile photo?', '', 'Remove')} hide={d.is_admin || !d.profile_picture} />
        <A icon="🧹" label="Clear note + status" onClick={() => confirmCall('admin-api/users/clear/', 'Clear note, mood and statuses?', 'Their note, mood and all statuses are removed.', 'Clear')} hide={d.is_admin} />
        {d.is_banned
          ? <A icon="♻️" label="Unban" onClick={() => confirmCall('admin-api/users/unban/', `Unban ${d.username}?`, '', 'Unban')} />
          : <A icon="🚫" label="Ban" danger onClick={ban} hide={d.is_admin} />}
        <A icon="🗑" label="Delete account" danger onClick={remove} hide={d.is_admin} />
      </div>
      {d.is_admin && <p className="adm-sub" style={{ margin: '4px 4px 0' }}>{mine ? 'Admin set in the ADMIN_USERNAMES variable on Railway. Admins cannot be banned or deleted here.' : 'Admins cannot be banned or deleted here.'}</p>}

      <p className="adm-h">Activity</p>
      <div className="adm-nums">
        <div className="adm-num"><b>{d.messages_sent}</b><span>Sent</span></div>
        <div className="adm-num"><b>{d.messages_received}</b><span>Received</span></div>
        <div className="adm-num"><b>{d.chats}</b><span>Chats</span></div>
        <div className="adm-num"><b>{d.friends}</b><span>Friends</span></div>
        <div className="adm-num"><b>{d.groups.length}</b><span>Groups</span></div>
        <div className="adm-num"><b>{d.statuses}</b><span>Statuses</span></div>
      </div>

      <p className="adm-h">Account</p>
      <div className="adm-card">
        <KV k="User ID" v={`#${d.id}`} />
        <KV k="Email" v={d.email} />
        <KV k="Phone" v={d.phone_number} />
        <KV k="Joined" v={dt(d.date_joined)} />
        <KV k="Last login" v={dt(d.last_login)} />
        <KV k="Last seen" v={d.is_online ? 'Online now' : dt(d.last_seen)} />
        <KV k="2-step verification" v={d.two_factor ? 'On' : 'Off'} />
        <KV k="Birthday" v={d.birthday} />
        <KV k="Mood" v={d.mood} />
        <KV k="Away auto-reply" v={d.auto_reply} />
        <KV k="Stickers made" v={d.stickers} />
        <KV k="Feedback sent" v={d.feedback} />
      </div>

      <p className="adm-h">Privacy settings</p>
      <div className="adm-card">
        <KV k="Last seen" v={d.privacy.last_seen} />
        <KV k="Profile photo" v={d.privacy.photo} />
        <KV k="Read receipts" v={d.privacy.read_receipts ? 'On' : 'Off'} />
      </div>

      <p className="adm-h">Logged-in devices ({d.sessions.length})</p>
      <div className="adm-card">
        {d.sessions.map((s, i) => (
          <div key={i} className="adm-log"><b>{s.device}</b><br /><span className="adm-sub">IP {s.ip || '?'} · last used {dt(s.last_used)} · since {dd(s.created)}</span></div>
        ))}
        {!d.sessions.length && <p className="adm-sub" style={{ margin: 0 }}>Not logged in anywhere.</p>}
      </div>

      {d.groups.length > 0 && (
        <>
          <p className="adm-h">Groups</p>
          <div className="adm-card"><p style={{ margin: 0 }}>{d.groups.map((g) => g.name).join(' · ')}</p></div>
        </>
      )}

      <p className="adm-h">Reports ({d.reports_received} against · {d.reports_made} made)</p>
      <div className="adm-card">
        {d.reports_in.map((r) => (
          <div key={r.id} className="adm-log"><b>{r.reason}</b> by {r.by} · {formatListTime(r.at)}{r.resolved ? ' · resolved' : ''}{r.details ? <><br /><span className="adm-sub">{r.details}</span></> : null}</div>
        ))}
        {!d.reports_in.length && <p className="adm-sub" style={{ margin: 0 }}>No reports against this account.</p>}
      </div>

      <p className="adm-h">Admin history</p>
      <div className="adm-card">
        {d.log.map((l, i) => <div key={i} className="adm-log"><b>{l.action}</b> by {l.admin} · {dt(l.at)}{l.detail ? <><br /><span className="adm-sub">{l.detail}</span></> : null}</div>)}
        {!d.log.length && <p className="adm-sub" style={{ margin: 0 }}>Nothing yet.</p>}
      </div>
    </>
  );
}
