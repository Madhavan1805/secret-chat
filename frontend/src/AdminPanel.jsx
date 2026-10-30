import React, { useCallback, useEffect, useState } from 'react';
import { Sheet } from './ui';
import api from './api';
import { errMsg, getPicUrl, formatListTime } from './config';

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
  const [busy, setBusy] = useState(false);

  const loadStats = useCallback(() => api.get('admin-api/stats/').then((r) => setStats(r.data)).catch(() => {}), []);
  const loadUsers = useCallback(() => api.get('admin-api/users/', { params: { q, filter } })
    .then((r) => { setUsers(r.data.users); setCount(r.data.count); })
    .catch((e) => ask({ type: 'alert', title: errMsg(e, 'Could not load users') })), [q, filter, ask]);
  const loadReports = useCallback(() => api.get('admin-api/reports/').then((r) => setReports(r.data.reports)).catch(() => {}), []);

  useEffect(() => { loadStats(); loadReports(); }, [loadStats, loadReports]);
  useEffect(() => { const t = setTimeout(loadUsers, 250); return () => clearTimeout(t); }, [loadUsers]);
  const reload = () => { loadStats(); loadUsers(); loadReports(); };

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
        {stat(stats?.total, 'Users')}{stat(stats?.online, 'Online')}{stat(stats?.new_today, 'New today')}{stat(stats?.open_reports, 'Reports')}{stat(stats?.banned, 'Banned')}
      </div>
      <div className="ad-tabs">
        <button type="button" className={tab === 'users' ? 'on' : ''} onClick={() => setTab('users')}>Users</button>
        <button type="button" className={tab === 'reports' ? 'on' : ''} onClick={() => setTab('reports')}>Reports{stats?.open_reports ? ` (${stats.open_reports})` : ''}</button>
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
                  {!u.is_admin && (u.is_banned
                    ? <button type="button" className="sc-btn" disabled={busy} onClick={() => unban(u.id, u.username)}>Unban</button>
                    : <button type="button" className="sc-btn danger" disabled={busy} onClick={() => ban(u.id, u.username)}>Ban this account</button>)}
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
    </Sheet>
  );
}
