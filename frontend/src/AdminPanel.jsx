import React, { useCallback, useEffect, useState } from 'react';
import { Sheet } from './ui';
import api from './api';
import { errMsg, getPicUrl, formatListTime } from './config';
import { KINDS, STATUS } from './Feedback';

const FILTERS = [['all', 'All'], ['reported', 'Reported'], ['banned', 'Banned']];
const day = (d) => (d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

// Admin page: every registered account, the reports people sent, and Ban / Unban.
export default function AdminPanel({ T, onClose, ask }) {
  const [tab, setTab] = useState('users');
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [count, setCount] = useState(0);
  const [reports, setReports] = useState([]);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [open, setOpen] = useState(null);                 // user id whose details are open
  const [detail, setDetail] = useState(null);             // full details of that user
  const [groups, setGroups] = useState([]);
  const [gq, setGq] = useState('');
  const [anTitle, setAnTitle] = useState('');
  const [anText, setAnText] = useState('');
  const [busy, setBusy] = useState(false);
  const [fbs, setFbs] = useState([]);                       // feedback from users
  const [fbAll, setFbAll] = useState(false);
  const [fbReply, setFbReply] = useState({});

  const loadStats = useCallback(() => api.get('admin-api/stats/').then((r) => setStats(r.data)).catch(() => {}), []);
  const loadUsers = useCallback(() => api.get('admin-api/users/', { params: { q, filter } })
    .then((r) => { setUsers(r.data.users); setCount(r.data.count); })
    .catch((e) => ask({ type: 'alert', title: errMsg(e, 'Could not load users') })), [q, filter, ask]);
  const loadReports = useCallback(() => api.get('admin-api/reports/').then((r) => setReports(r.data.reports)).catch(() => {}), []);

  const loadFeedback = useCallback(() => api.get('admin-api/feedback/', { params: { status: fbAll ? 'all' : 'open' } }).then((r) => setFbs(r.data.feedback)).catch(() => {}), [fbAll]);
  useEffect(() => { if (tab === 'feedback') loadFeedback(); }, [tab, loadFeedback]);
  const updateFeedback = async (id, status) => {
    setBusy(true);
    try {
      await api.post('admin-api/feedback/update/', { id, status, reply: (fbReply[id] || '').trim() });
      setFbReply((m) => ({ ...m, [id]: '' }));
      await loadFeedback(); loadStats();
    } catch (e) { ask({ type: 'alert', title: errMsg(e, 'Could not update') }); }
    setBusy(false);
  };

  const loadGroups = useCallback(() => api.get('admin-api/groups/', { params: { q: gq } }).then((r) => setGroups(r.data.groups)).catch(() => {}), [gq]);
  const loadDetail = useCallback((id) => api.get(`admin-api/users/${id}/`).then((r) => setDetail(r.data)).catch(() => setDetail(null)), []);

  useEffect(() => { loadStats(); loadReports(); }, [loadStats, loadReports]);
  useEffect(() => { if (tab === 'groups') { const t = setTimeout(loadGroups, 250); return () => clearTimeout(t); } return undefined; }, [tab, loadGroups]);
  useEffect(() => { setDetail(null); if (open) loadDetail(open); }, [open, loadDetail]);
  useEffect(() => { const t = setTimeout(loadUsers, 250); return () => clearTimeout(t); }, [loadUsers]);
  const reload = () => { loadStats(); loadUsers(); loadReports(); if (tab === 'groups') loadGroups(); if (open) loadDetail(open); };

  // one small helper for the simple confirm -> POST -> reload actions
  const act = async (url, body, title, message, okText, danger) => {
    const ok = await ask({ type: 'confirm', title, message, okText, danger });
    if (!ok) return false;
    setBusy(true);
    try { await api.post(url, body); reload(); setBusy(false); return true; } catch (e) { ask({ type: 'alert', title: errMsg(e, 'Could not do that') }); }
    setBusy(false);
    return false;
  };
  const setPassword = async (id, name) => {
    const pw = await ask({ type: 'prompt', title: `New password for ${name}`, message: 'At least 6 characters. They are signed out everywhere and must log in with this. Tell them in person.', initial: '', maxLength: 40, okText: 'Set password' });
    if (!pw) return;
    setBusy(true);
    try { await api.post('admin-api/users/password/', { user_id: id, password: pw }); reload(); ask({ type: 'alert', title: 'Password changed' }); } catch (e) { ask({ type: 'alert', title: errMsg(e, 'Could not change') }); }
    setBusy(false);
  };
  const deleteUser = async (id, name) => {
    if (await act('admin-api/users/delete/', { user_id: id }, `Delete ${name} for good?`, 'Their account, chats, messages and media are removed. This cannot be undone.', 'Delete', true)) setOpen(null);
  };
  const sendAnnouncement = async () => {
    const ok = await ask({ type: 'confirm', title: 'Send to every user?', message: 'A pop-up shows in the app and a phone notification is sent to everyone.', okText: 'Send' });
    if (!ok) return;
    setBusy(true);
    try {
      const r = await api.post('admin-api/announce/', { title: anTitle, text: anText });
      setAnTitle(''); setAnText('');
      ask({ type: 'alert', title: `Sent to ${r.data.sent_to} users` });
    } catch (e) { ask({ type: 'alert', title: errMsg(e, 'Could not send') }); }
    setBusy(false);
  };
  const deleteGroup = (g) => act('admin-api/groups/delete/', { chat_id: g.id }, `Delete group "${g.name}"?`, 'All its messages are removed for every member. This cannot be undone.', 'Delete group', true);

  const ban = async (id, name) => {
    const reason = await ask({ type: 'prompt', title: `Ban ${name}?`, message: 'They are logged out on every phone and cannot log in. Reason (shown to them):', initial: '', maxLength: 200, okText: 'Ban', danger: true });
    if (reason === null || reason === undefined || reason === false) return;
    setBusy(true);
    try { await api.post('admin-api/users/ban/', { user_id: id, reason }); reload(); } catch (e) { ask({ type: 'alert', title: errMsg(e, 'Could not ban') }); }
    setBusy(false);
  };
  const unban = async (id, name) => {
    const ok = await ask({ type: 'confirm', title: `Unban ${name}?`, okText: 'Unban' });
    if (!ok) return;
    setBusy(true);
    try { await api.post('admin-api/users/unban/', { user_id: id }); reload(); } catch (e) { ask({ type: 'alert', title: errMsg(e, 'Could not unban') }); }
    setBusy(false);
  };
  const resolve = async (id) => { try { await api.post('admin-api/reports/resolve/', { id }); reload(); } catch (e) { /* ignore */ } };

  const stat = (n, l) => <div className="ad-stat"><b>{n ?? '–'}</b><span>{l}</span></div>;

  return (
    <Sheet T={T} title="Admin" onClose={onClose}>
      <div className="ad-stats">
        {stat(stats?.total, 'Users')}{stat(stats?.online, 'Online')}{stat(stats?.active_24h, 'Active 24h')}{stat(stats?.new_today, 'New today')}{stat(stats?.banned, 'Banned')}
        {stat(stats?.groups, 'Groups')}{stat(stats?.messages, 'Messages')}{stat(stats?.messages_today, 'Msgs today')}{stat(stats?.open_reports, 'Reports')}
      </div>
      <div className="ad-tabs">
        <button type="button" className={tab === 'users' ? 'on' : ''} onClick={() => setTab('users')}>Users</button>
        <button type="button" className={tab === 'reports' ? 'on' : ''} onClick={() => setTab('reports')}>Reports{stats?.open_reports ? ` (${stats.open_reports})` : ''}</button>
        <button type="button" className={tab === 'feedback' ? 'on' : ''} onClick={() => setTab('feedback')}>Feedback{stats?.open_feedback ? ` (${stats.open_feedback})` : ''}</button>
        <button type="button" className={tab === 'groups' ? 'on' : ''} onClick={() => setTab('groups')}>Groups</button>
        <button type="button" className={tab === 'announce' ? 'on' : ''} onClick={() => setTab('announce')}>Announce</button>
      </div>

      {tab === 'users' && (
        <>
          <input className="form-control mb-2" placeholder="Search user ID, email or mobile" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search users" />
          <div className="ad-tabs sm">
            {FILTERS.map(([k, l]) => <button type="button" key={k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{l}</button>)}
          </div>
          <p className="ad-count">{count} account{count === 1 ? '' : 's'}</p>
          {users.map((u) => (
            <div key={u.id} className={`ad-user${u.is_banned ? ' banned' : ''}`}>
              <button type="button" className="ad-row" onClick={() => setOpen(open === u.id ? null : u.id)}>
                <span className="ad-av">{u.profile_picture ? <img src={getPicUrl(u.profile_picture)} alt="" /> : u.username[0]?.toUpperCase()}</span>
                <span className="ad-main">
                  <b>{u.username}{u.is_admin && <i className="ad-tag">admin</i>}{u.is_banned && <i className="ad-tag red">banned</i>}{u.is_online && !u.is_banned && <i className="ad-dot" />}</b>
                  <small>Joined {day(u.date_joined)}{u.report_count ? ` · ${u.report_count} report${u.report_count > 1 ? 's' : ''}` : ''}</small>
                </span>
              </button>
              {open === u.id && (
                <div className="ad-more">
                  <p>Email: {u.email || '—'}</p>
                  <p>Mobile: {u.phone_number || '—'}</p>
                  <p>Last seen: {u.last_seen ? formatListTime(u.last_seen) : '—'} · Devices: {u.devices}</p>
                  {u.is_banned && <p>Banned {day(u.banned_at)}{u.ban_reason ? ` — ${u.ban_reason}` : ''}</p>}
                  {detail && detail.id === u.id && (
                    <>
                      <p>Bio: {detail.bio || '—'}</p>
                      <p>Messages sent: {detail.messages_sent} · Chats: {detail.chats} · Statuses: {detail.statuses}</p>
                      <p>Reported others: {detail.reports_made} · Reported by others: {detail.reports_received}</p>
                      {detail.groups.length > 0 && <p>Groups: {detail.groups.map((g) => g.name).join(', ')}</p>}
                      {detail.sessions.length > 0 && <p>Logged in on:</p>}
                      {detail.sessions.map((d, i) => <p key={i} className="ad-sub">• {d.device} · {d.ip || 'ip ?'} · {formatListTime(d.last_used)}</p>)}
                    </>
                  )}
                  <div className="ad-acts">
                    <button type="button" className="sc-btn ghost" disabled={busy} onClick={() => act('admin-api/users/logout/', { user_id: u.id }, `Sign ${u.username} out?`, 'Logged out on every phone. They can log in again.', 'Sign out')}>Sign out everywhere</button>
                    {!u.is_admin && (
                      <>
                        <button type="button" className="sc-btn ghost" disabled={busy} onClick={() => setPassword(u.id, u.username)}>Set new password</button>
                        {u.profile_picture && <button type="button" className="sc-btn ghost" disabled={busy} onClick={() => act('admin-api/users/photo/', { user_id: u.id }, 'Remove profile photo?', '', 'Remove')}>Remove photo</button>}
                        <button type="button" className="sc-btn ghost" disabled={busy} onClick={() => act('admin-api/users/clear/', { user_id: u.id }, 'Clear note, mood and statuses?', 'Their note, mood and all statuses are removed.', 'Clear')}>Clear note and statuses</button>
                        {u.is_banned
                          ? <button type="button" className="sc-btn" disabled={busy} onClick={() => unban(u.id, u.username)}>Unban</button>
                          : <button type="button" className="sc-btn danger" disabled={busy} onClick={() => ban(u.id, u.username)}>Ban this account</button>}
                        <button type="button" className="sc-btn danger" disabled={busy} onClick={() => deleteUser(u.id, u.username)}>Delete account</button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
          {!users.length && <p className="ad-count">Nobody found.</p>}
        </>
      )}

      {tab === 'reports' && (
        <>
          {reports.map((r) => (
            <div key={r.id} className="ad-user">
              <div className="ad-more" style={{ borderTop: 0 }}>
                <p><b>{r.reported}</b> reported by <b>{r.reporter}</b> · {formatListTime(r.created_at)}</p>
                <p>Reason: {r.reason}{r.details ? ` — ${r.details}` : ''}</p>
                <div style={{ display: 'flex', gap: 8 }}>
                  {!r.reported_banned && <button type="button" className="sc-btn danger" disabled={busy} onClick={() => ban(r.reported_id, r.reported)}>Ban {r.reported}</button>}
                  <button type="button" className="sc-btn ghost" onClick={() => resolve(r.id)}>Dismiss</button>
                </div>
              </div>
            </div>
          ))}
          {!reports.length && <p className="ad-count">No open reports.</p>}
        </>
      )}

      {tab === 'feedback' && (
        <>
          <div className="ad-tabs sm">
            <button type="button" className={!fbAll ? 'on' : ''} onClick={() => setFbAll(false)}>Open</button>
            <button type="button" className={fbAll ? 'on' : ''} onClick={() => setFbAll(true)}>All</button>
          </div>
          {fbs.map((f) => (
            <div key={f.id} className="ad-user">
              <div className="ad-more" style={{ borderTop: 0 }}>
                <p><b>{f.user}</b> · {(KINDS.find((k) => k[0] === f.kind) || KINDS[2])[1]} · {formatListTime(f.created_at)} · <b>{STATUS[f.status]}</b></p>
                <p style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{f.text}</p>
                {f.reply && <p style={{ opacity: .8 }}>Your reply: {f.reply}</p>}
                <textarea className="form-control mb-2" rows={2} maxLength={500} placeholder="Reply to this user (optional)" value={fbReply[f.id] || ''} onChange={(e) => setFbReply((m) => ({ ...m, [f.id]: e.target.value }))} aria-label="Reply" />
                <div style={{ display: 'flex', gap: 8 }}>
                  {f.status === 'new' && <button type="button" className="sc-btn ghost" disabled={busy} onClick={() => updateFeedback(f.id, 'seen')}>Mark seen</button>}
                  <button type="button" className="sc-btn" disabled={busy} onClick={() => updateFeedback(f.id, 'done')}>{(fbReply[f.id] || '').trim() ? 'Reply and mark done' : 'Mark done'}</button>
                  {(fbReply[f.id] || '').trim() && <button type="button" className="sc-btn ghost" disabled={busy} onClick={() => updateFeedback(f.id, f.status)}>Reply only</button>}
                </div>
              </div>
            </div>
          ))}
          {!fbs.length && <p className="ad-count">No feedback yet.</p>}
        </>
      )}

      {tab === 'announce' && (
        <>
          <p className="ad-count" style={{ textAlign: 'left' }}>Send a message to every user: shows as a pop-up in the app and as a phone notification.</p>
          <input className="form-control mb-2" placeholder="Title (optional)" maxLength={80} value={anTitle} onChange={(e) => setAnTitle(e.target.value)} aria-label="Announcement title" />
          <textarea className="form-control mb-2" rows={4} placeholder="Message" maxLength={500} value={anText} onChange={(e) => setAnText(e.target.value)} aria-label="Announcement text" />
          <button type="button" className="sc-btn" disabled={busy || !anText.trim()} onClick={sendAnnouncement}>Send to everyone</button>
        </>
      )}

      {tab === 'groups' && (
        <>
          <input className="form-control mb-2" placeholder="Search group name" value={gq} onChange={(e) => setGq(e.target.value)} aria-label="Search groups" />
          <p className="ad-count">{groups.length} group{groups.length === 1 ? '' : 's'}</p>
          {groups.map((g) => (
            <div key={g.id} className="ad-user">
              <div className="ad-more" style={{ borderTop: 0, paddingLeft: 4 }}>
                <p><b>{g.name}</b></p>
                <p>{g.members} members · {g.messages} messages · by {g.created_by || '—'} · {day(g.created_at)}</p>
                <button type="button" className="sc-btn danger" disabled={busy} onClick={() => deleteGroup(g)}>Delete group</button>
              </div>
            </div>
          ))}
          {!groups.length && <p className="ad-count">No groups.</p>}
        </>
      )}
    </Sheet>
  );
}
