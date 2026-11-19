import React, { useCallback, useEffect, useState } from 'react';
import { Sheet } from './ui';
import api from './api';
import { errMsg, formatListTime } from './config';
import { KINDS, STATUS } from './Feedback';
import { UsersTab } from './AdminUsers';
import { BarChart, dt } from './AdminParts';
import './admin.css';

const cancelled = (v) => v === null || v === undefined || v === false;
const TABS = [['overview', 'Overview', '📊'], ['users', 'Users', '👥'], ['reports', 'Reports', '🚩'], ['groups', 'Groups', '💬'], ['feedback', 'Feedback', '💡'], ['tools', 'Tools', '🛠']];

// Admin page: overview + graphs, every account in detail, reports (with the reported chat), groups, feedback and tools.
export default function AdminPanel({ T, onClose, ask }) {
  const [tab, setTab] = useState('overview');
  const [stats, setStats] = useState(null);
  const [openUser, setOpenUser] = useState(null);

  const loadStats = useCallback(() => api.get('admin-api/stats/').then((r) => setStats(r.data)).catch(() => {}), []);
  useEffect(() => { loadStats(); }, [loadStats]);

  const goUser = (id) => { setOpenUser(id); setTab('users'); };
  const badge = { reports: stats?.open_reports, feedback: stats?.open_feedback };

  return (
    <Sheet T={T} title="Admin" onClose={onClose}>
      <div className="adm">
        <nav className="adm-tabs" aria-label="Admin sections">
          {TABS.map(([k, l, ic]) => (
            <button key={k} type="button" className={`adm-tab${tab === k ? ' on' : ''}`} onClick={() => { setTab(k); if (k !== 'users') setOpenUser(null); }}>
              <i aria-hidden="true">{ic}</i>{l}{badge[k] > 0 && <span className="adm-dot">{badge[k]}</span>}
            </button>
          ))}
        </nav>
        {tab === 'overview' && <Overview stats={stats} go={setTab} />}
        {tab === 'users' && <UsersTab ask={ask} onChanged={loadStats} openId={openUser} setOpenId={setOpenUser} />}
        {tab === 'reports' && <ReportsTab ask={ask} onChanged={loadStats} goUser={goUser} />}
        {tab === 'groups' && <GroupsTab ask={ask} onChanged={loadStats} />}
        {tab === 'feedback' && <FeedbackTab ask={ask} onChanged={loadStats} />}
        {tab === 'tools' && <ToolsTab ask={ask} />}
      </div>
    </Sheet>
  );
}

// ------------------------------------------------------------------ overview
function Overview({ stats, go }) {
  const [an, setAn] = useState(null);
  useEffect(() => { api.get('admin-api/analytics/').then((r) => setAn(r.data)).catch(() => {}); }, []);
  const cards = [
    ['👥', stats?.total, 'Users'], ['🟢', stats?.online, 'Online now'], ['⚡', stats?.active_24h, 'Active 24h'],
    ['🆕', stats?.new_today, 'New today'], ['💬', stats?.groups, 'Groups'], ['✉️', stats?.messages, 'Messages'],
    ['📨', stats?.messages_today, 'Messages today'], ['🚫', stats?.banned, 'Banned'],
  ];
  const labels = an ? an.days.map((d) => new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })) : [];
  const types = an ? Object.entries(an.types).sort((a, b) => b[1] - a[1]) : [];
  const typeTotal = types.reduce((n, [, c]) => n + c, 0) || 1;
  return (
    <>
      {(stats?.open_reports > 0 || stats?.open_feedback > 0) && (
        <>
          <p className="adm-h" style={{ marginTop: 0 }}>Needs attention</p>
          {stats.open_reports > 0 && <button type="button" className="adm-alert" onClick={() => go('reports')}><span className="ic">🚩</span><span><b>{stats.open_reports} open report{stats.open_reports > 1 ? 's' : ''}</b><span>People reported accounts</span></span><span className="go">›</span></button>}
          {stats.open_feedback > 0 && <button type="button" className="adm-alert" onClick={() => go('feedback')}><span className="ic">💡</span><span><b>{stats.open_feedback} feedback waiting</b><span>Ideas and problems from users</span></span><span className="go">›</span></button>}
        </>
      )}
      <p className="adm-h">Right now</p>
      <div className="adm-grid">
        {cards.map(([ic, n, l]) => <div key={l} className="adm-stat"><span className="ic">{ic}</span><span><b>{n ?? '–'}</b><span>{l}</span></span></div>)}
      </div>
      <p className="adm-h">Last 14 days</p>
      {an ? (
        <>
          <BarChart title="New sign-ups" values={an.signups} labels={labels} color="#30a860" />
          <BarChart title="Messages sent" values={an.messages} labels={labels} />
          <BarChart title="People who sent a message" values={an.active} labels={labels} color="#f0a020" />
          <p className="adm-h">What people send (all time)</p>
          <div className="adm-card">
            {types.map(([k, c]) => (
              <div key={k} style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span>{k}</span><span className="adm-sub">{c}</span></div>
                <div style={{ height: 6, borderRadius: 3, background: 'rgba(127,127,127,.2)' }}><div style={{ width: `${(c / typeTotal) * 100}%`, height: '100%', borderRadius: 3, background: 'var(--accent)' }} /></div>
              </div>
            ))}
          </div>
        </>
      ) : <p className="adm-empty">Loading graphs…</p>}
    </>
  );
}

// ------------------------------------------------------------------ reports (+ the reported chat, last 20 messages only)
function ReportsTab({ ask, onChanged, goUser }) {
  const [reports, setReports] = useState(null);
  const [all, setAll] = useState(false);
  const [ctx, setCtx] = useState({});                       // report id -> { messages } or { loading }
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api.get('admin-api/reports/', { params: { status: all ? 'all' : 'open' } }).then((r) => setReports(r.data.reports)).catch(() => setReports([])), [all]);
  useEffect(() => { load(); }, [load]);

  const post = async (url, body, after) => {
    setBusy(true);
    try { await api.post(url, body); if (after) await after(); onChanged(); } catch (e) { ask({ type: 'alert', title: errMsg(e, 'Could not do that') }); }
    setBusy(false);
  };
  const viewChat = async (r) => {
    if (ctx[r.id] && !ctx[r.id].loading) { setCtx((m) => { const n = { ...m }; delete n[r.id]; return n; }); return; }
    setCtx((m) => ({ ...m, [r.id]: { loading: true } }));
    try { const res = await api.get(`admin-api/reports/${r.id}/context/`); setCtx((m) => ({ ...m, [r.id]: res.data })); } catch (e) { setCtx((m) => { const n = { ...m }; delete n[r.id]; return n; }); ask({ type: 'alert', title: errMsg(e, 'Could not open') }); }
  };
  const delMsg = async (r, m) => {
    const ok = await ask({ type: 'confirm', title: 'Delete this message?', message: 'It is removed for both people.', okText: 'Delete', danger: true });
    if (ok) post('admin-api/messages/delete/', { report_id: r.id, message_id: m.id }, async () => { const res = await api.get(`admin-api/reports/${r.id}/context/`); setCtx((x) => ({ ...x, [r.id]: res.data })); });
  };
  const warn = async (r) => {
    const text = await ask({ type: 'prompt', title: `Warn ${r.reported}`, message: 'Sent from the official ChatzyTeam account.', initial: '', maxLength: 500, okText: 'Send warning' });
    if (!cancelled(text) && String(text).trim()) post('admin-api/users/warn/', { user_id: r.reported_id, text }, () => ask({ type: 'alert', title: 'Warning sent' }));
  };
  const ban = async (r) => {
    const len = await ask({ type: 'choice', title: `Ban ${r.reported}`, message: 'For how long?', choices: [{ label: '⏱ 1 day', value: '1' }, { label: '📅 7 days', value: '7' }, { label: '🗓 30 days', value: '30' }, { label: '🚫 Permanent', value: '0' }] });
    if (cancelled(len)) return;
    const reason = await ask({ type: 'prompt', title: 'Reason (shown to them)', initial: '', maxLength: 200, okText: 'Ban', danger: true });
    if (cancelled(reason)) return;
    post('admin-api/users/ban/', { user_id: r.reported_id, days: Number(len), reason }, load);
  };

  return (
    <>
      <div className="adm-chips">
        <button type="button" className={`adm-chip${!all ? ' on' : ''}`} onClick={() => setAll(false)}>Open</button>
        <button type="button" className={`adm-chip${all ? ' on' : ''}`} onClick={() => setAll(true)}>All</button>
      </div>
      {(reports || []).map((r) => (
        <div key={r.id} className="adm-card">
          <p><span className="adm-tag red">{r.reason}</span> {r.resolved && <span className="adm-tag green">resolved</span>} <span className="adm-sub">· {formatListTime(r.created_at)}</span></p>
          <p><button type="button" className="adm-back" style={{ padding: 0 }} onClick={() => goUser(r.reported_id)}><b>{r.reported}</b></button> reported by <b>{r.reporter}</b></p>
          {r.details && <p className="adm-sub">“{r.details}”</p>}
          <div className="adm-row">
            <button type="button" className="adm-btn ghost" onClick={() => viewChat(r)}>{ctx[r.id] ? 'Hide chat' : '👁 View chat'}</button>
            {!r.resolved && !r.reported_banned && <button type="button" className="adm-btn ghost" disabled={busy} onClick={() => warn(r)}>⚠️ Warn</button>}
            {!r.reported_banned && <button type="button" className="adm-btn danger" disabled={busy} onClick={() => ban(r)}>Ban</button>}
            {!r.resolved && <button type="button" className="adm-btn ghost" disabled={busy} onClick={() => post('admin-api/reports/resolve/', { id: r.id }, load)}>Dismiss</button>}
          </div>
          {ctx[r.id] && (
            <div style={{ marginTop: 10 }}>
              {ctx[r.id].loading ? <p className="adm-sub">Loading…</p> : (
                <>
                  <p className="adm-sub" style={{ margin: '0 0 4px' }}>Last {ctx[r.id].messages.length} messages of this one chat. Your view is saved in the activity log.</p>
                  {ctx[r.id].messages.map((m) => (
                    <div key={m.id} className="adm-msg">
                      <div className="who"><span>{m.sender}</span><small>{dt(m.at)}</small></div>
                      <p>{m.text || '…'}</p>
                      <button type="button" onClick={() => delMsg(r, m)}>🗑 Delete message</button>
                    </div>
                  ))}
                  {!ctx[r.id].messages.length && <p className="adm-sub">{ctx[r.id].note || 'No messages.'}</p>}
                </>
              )}
            </div>
          )}
        </div>
      ))}
      {reports && !reports.length && <p className="adm-empty">No {all ? '' : 'open '}reports. 🎉</p>}
    </>
  );
}

// ------------------------------------------------------------------ groups
function GroupsTab({ ask, onChanged }) {
  const [groups, setGroups] = useState(null);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(null);
  const [g, setG] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api.get('admin-api/groups/', { params: { q } }).then((r) => setGroups(r.data.groups)).catch(() => setGroups([])), [q]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);
  const loadOne = useCallback(() => (open ? api.get(`admin-api/groups/${open}/`).then((r) => setG(r.data)).catch(() => setG(null)) : null), [open]);
  useEffect(() => { setG(null); loadOne(); }, [loadOne]);

  const post = async (url, body, closeAfter) => {
    setBusy(true);
    try { await api.post(url, body); if (closeAfter) setOpen(null); else await loadOne(); load(); onChanged(); } catch (e) { ask({ type: 'alert', title: errMsg(e, 'Could not do that') }); }
    setBusy(false);
  };

  if (open) {
    if (!g) return <><button type="button" className="adm-back" onClick={() => setOpen(null)}>‹ Groups</button><p className="adm-empty">Loading…</p></>;
    const rename = async () => {
      const name = await ask({ type: 'prompt', title: 'Rename group', initial: g.name, maxLength: 60, okText: 'Rename' });
      if (!cancelled(name) && String(name).trim()) post('admin-api/groups/rename/', { chat_id: g.id, name });
    };
    const removeMember = async (m) => {
      const ok = await ask({ type: 'confirm', title: `Remove ${m.username}?`, message: `They leave “${g.name}”.`, okText: 'Remove', danger: true });
      if (ok) post('admin-api/groups/remove-member/', { chat_id: g.id, user_id: m.id });
    };
    const del = async () => {
      const ok = await ask({ type: 'confirm', title: `Delete “${g.name}”?`, message: 'All its messages are removed for every member. This cannot be undone.', okText: 'Delete group', danger: true });
      if (ok) post('admin-api/groups/delete/', { chat_id: g.id }, true);
    };
    return (
      <>
        <button type="button" className="adm-back" onClick={() => setOpen(null)}>‹ Groups</button>
        <div className="adm-hero"><span className="adm-av big">{g.name.charAt(0).toUpperCase()}</span><h3>{g.name}</h3><p className="adm-sub" style={{ margin: 0 }}>{g.description || 'No description'}</p></div>
        <div className="adm-nums"><div className="adm-num"><b>{g.members.length}</b><span>Members</span></div><div className="adm-num"><b>{g.messages}</b><span>Messages</span></div><div className="adm-num"><b>{g.announce_only ? 'Yes' : 'No'}</b><span>Admins-only</span></div></div>
        <div className="adm-row"><button type="button" className="adm-btn" disabled={busy} onClick={rename}>✏️ Rename</button><button type="button" className="adm-btn danger" disabled={busy} onClick={del}>🗑 Delete group</button></div>
        <p className="adm-h">Members</p>
        {g.members.map((m) => (
          <div key={m.id} className="adm-user" style={{ cursor: 'default' }}>
            <span className="adm-av">{m.username.charAt(0).toUpperCase()}</span>
            <span style={{ flex: 1 }}><span className="nm">{m.username} {m.is_group_admin && <span className="adm-tag amber">Group admin</span>}</span></span>
            <button type="button" className="adm-btn ghost" style={{ height: 32 }} disabled={busy} onClick={() => removeMember(m)}>Remove</button>
          </div>
        ))}
        <p className="adm-sub" style={{ margin: '10px 4px' }}>Created {dt(g.created_at)}{g.created_by ? ` by ${g.created_by}` : ''}. Message contents are not shown here.</p>
      </>
    );
  }
  return (
    <>
      <input className="adm-search" placeholder="Search group name" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search groups" />
      {(groups || []).map((x) => (
        <button key={x.id} type="button" className="adm-user" onClick={() => setOpen(x.id)}>
          <span className="adm-av">{x.name.charAt(0).toUpperCase()}</span>
          <span style={{ flex: 1, minWidth: 0 }}><span className="nm">{x.name}</span><span className="meta" style={{ display: 'block' }}>{x.members} members · {x.messages} messages · by {x.created_by || '—'}</span></span>
          <span className="adm-sub">›</span>
        </button>
      ))}
      {groups && !groups.length && <p className="adm-empty">No groups.</p>}
    </>
  );
}

// ------------------------------------------------------------------ feedback from users
function FeedbackTab({ ask, onChanged }) {
  const [fbs, setFbs] = useState(null);
  const [all, setAll] = useState(false);
  const [reply, setReply] = useState({});
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api.get('admin-api/feedback/', { params: { status: all ? 'all' : 'open' } }).then((r) => setFbs(r.data.feedback)).catch(() => setFbs([])), [all]);
  useEffect(() => { load(); }, [load]);
  const update = async (id, status) => {
    setBusy(true);
    try { await api.post('admin-api/feedback/update/', { id, status, reply: (reply[id] || '').trim() }); setReply((m) => ({ ...m, [id]: '' })); await load(); onChanged(); } catch (e) { ask({ type: 'alert', title: errMsg(e, 'Could not update') }); }
    setBusy(false);
  };
  return (
    <>
      <div className="adm-chips">
        <button type="button" className={`adm-chip${!all ? ' on' : ''}`} onClick={() => setAll(false)}>Open</button>
        <button type="button" className={`adm-chip${all ? ' on' : ''}`} onClick={() => setAll(true)}>All</button>
      </div>
      {(fbs || []).map((f) => (
        <div key={f.id} className="adm-card">
          <p><b>{f.user}</b> · {(KINDS.find((k) => k[0] === f.kind) || KINDS[2])[1]} · <span className="adm-sub">{formatListTime(f.created_at)}</span> · <span className="adm-tag">{STATUS[f.status]}</span></p>
          <p style={{ whiteSpace: 'pre-wrap' }}>{f.text}</p>
          {f.reply && <p className="adm-sub">Your reply: {f.reply}</p>}
          <textarea className="adm-input" rows={2} maxLength={500} placeholder="Reply to this user (optional)" value={reply[f.id] || ''} onChange={(e) => setReply((m) => ({ ...m, [f.id]: e.target.value }))} aria-label="Reply" />
          <div className="adm-row" style={{ marginTop: 0 }}>
            {f.status === 'new' && <button type="button" className="adm-btn ghost" disabled={busy} onClick={() => update(f.id, 'seen')}>Mark seen</button>}
            <button type="button" className="adm-btn" disabled={busy} onClick={() => update(f.id, 'done')}>{(reply[f.id] || '').trim() ? 'Reply + done' : 'Mark done'}</button>
            {(reply[f.id] || '').trim() && <button type="button" className="adm-btn ghost" disabled={busy} onClick={() => update(f.id, f.status)}>Reply only</button>}
          </div>
        </div>
      ))}
      {fbs && !fbs.length && <p className="adm-empty">No feedback {all ? 'yet' : 'waiting'}.</p>}
    </>
  );
}

// ------------------------------------------------------------------ tools: announce, maintenance, banned words, log, export
function ToolsTab({ ask }) {
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [maint, setMaint] = useState({ maintenance: false, message: '' });
  const [mmsg, setMmsg] = useState('');
  const [words, setWords] = useState([]);
  const [word, setWord] = useState('');
  const [log, setLog] = useState(null);
  const [lq, setLq] = useState('');

  const loadWords = useCallback(() => api.get('admin-api/words/').then((r) => setWords(r.data.words)).catch(() => {}), []);
  const loadLog = useCallback(() => api.get('admin-api/log/', { params: { q: lq } }).then((r) => setLog(r.data.log)).catch(() => setLog([])), [lq]);
  useEffect(() => { loadWords(); api.get('app/status/').then((r) => { setMaint(r.data); setMmsg(r.data.message || ''); }).catch(() => {}); }, [loadWords]);
  useEffect(() => { const t = setTimeout(loadLog, 250); return () => clearTimeout(t); }, [loadLog]);

  const announce = async () => {
    const ok = await ask({ type: 'confirm', title: 'Send to every user?', message: 'A pop-up shows in the app and a phone notification goes to everyone.', okText: 'Send' });
    if (!ok) return;
    setBusy(true);
    try { const r = await api.post('admin-api/announce/', { title, text }); setTitle(''); setText(''); loadLog(); ask({ type: 'alert', title: `Sent to ${r.data.sent_to} users` }); } catch (e) { ask({ type: 'alert', title: errMsg(e, 'Could not send') }); }
    setBusy(false);
  };
  const setMaintenance = async (on) => {
    const ok = await ask({ type: 'confirm', title: on ? 'Turn ON maintenance mode?' : 'Turn OFF maintenance mode?', message: on ? 'Everyone except admins sees a “back soon” screen until you turn it off.' : 'The app opens for everyone again.', okText: on ? 'Turn on' : 'Turn off', danger: on });
    if (!ok) return;
    try { const r = await api.post('admin-api/maintenance/', { on, message: mmsg }); setMaint({ maintenance: r.data.maintenance, message: r.data.message }); setMmsg(r.data.message); loadLog(); } catch (e) { ask({ type: 'alert', title: errMsg(e, 'Could not change') }); }
  };
  const addWord = async () => {
    try { const r = await api.post('admin-api/words/', { word }); setWords(r.data.words); setWord(''); loadLog(); } catch (e) { ask({ type: 'alert', title: errMsg(e, 'Could not add') }); }
  };
  const delWord = async (id) => { try { await api.post('admin-api/words/delete/', { id }); loadWords(); loadLog(); } catch (e) { /* ignore */ } };
  const exportCsv = async () => {
    try {
      const r = await api.get('admin-api/users/export/', { responseType: 'blob' });
      const url = URL.createObjectURL(r.data);
      const a = document.createElement('a');
      a.href = url; a.download = 'chatzy-users.csv';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      loadLog();
    } catch (e) { ask({ type: 'alert', title: errMsg(e, 'Could not export') }); }
  };

  return (
    <>
      <p className="adm-h" style={{ marginTop: 0 }}>📢 Announcement to everyone</p>
      <div className="adm-card">
        <input className="adm-input" placeholder="Title (optional)" maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Announcement title" />
        <textarea className="adm-input" rows={3} placeholder="Message" maxLength={500} value={text} onChange={(e) => setText(e.target.value)} aria-label="Announcement text" />
        <button type="button" className="adm-btn" disabled={busy || !text.trim()} onClick={announce}>Send to everyone</button>
      </div>

      <p className="adm-h">🚧 Maintenance mode</p>
      <div className="adm-card">
        <div className="adm-switch"><span><b>{maint.maintenance ? 'ON: users see “back soon”' : 'Off'}</b><br /><span className="adm-sub">Admins can still open the app.</span></span>
          <button type="button" className={`adm-btn${maint.maintenance ? ' ghost' : ' danger'}`} onClick={() => setMaintenance(!maint.maintenance)}>{maint.maintenance ? 'Turn off' : 'Turn on'}</button></div>
        <input className="adm-input" style={{ marginTop: 10 }} placeholder="Message shown to users" maxLength={200} value={mmsg} onChange={(e) => setMmsg(e.target.value)} aria-label="Maintenance message" />
      </div>

      <p className="adm-h">🤬 Banned words</p>
      <div className="adm-card">
        <p className="adm-sub">A message with one of these words cannot be sent (text messages, not by admins).</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="adm-input" style={{ marginBottom: 0 }} placeholder="Add a word" maxLength={40} value={word} onChange={(e) => setWord(e.target.value)} aria-label="Banned word" onKeyDown={(e) => { if (e.key === 'Enter' && word.trim()) addWord(); }} />
          <button type="button" className="adm-btn" disabled={word.trim().length < 2} onClick={addWord}>Add</button>
        </div>
        <div className="adm-row">{words.map((w) => <button key={w.id} type="button" className="adm-chip" onClick={() => delWord(w.id)} title="Tap to remove">{w.word} ✕</button>)}</div>
        {!words.length && <p className="adm-sub" style={{ margin: '8px 0 0' }}>No banned words.</p>}
      </div>

      <p className="adm-h">📥 Export</p>
      <div className="adm-card"><p className="adm-sub">All accounts as a CSV file: name, email, phone, join date, last seen, status.</p><button type="button" className="adm-btn" onClick={exportCsv}>Download users CSV</button></div>

      <p className="adm-h">📜 Activity log</p>
      <div className="adm-card">
        <input className="adm-input" placeholder="Search admin, user or action" value={lq} onChange={(e) => setLq(e.target.value)} aria-label="Search log" />
        {(log || []).map((a) => (
          <div key={a.id} className="adm-log"><b>{a.admin}</b> · {a.action}{a.target ? <> → <b>{a.target}</b></> : null}<br /><span className="adm-sub">{dt(a.at)}{a.detail ? ` · ${a.detail}` : ''}</span></div>
        ))}
        {log && !log.length && <p className="adm-sub" style={{ margin: 0 }}>Nothing logged yet.</p>}
      </div>
    </>
  );
}
