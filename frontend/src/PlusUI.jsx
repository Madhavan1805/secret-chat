import React, { useEffect, useState } from 'react';
import { BiLock, BiX } from 'react-icons/bi';
import api from './api';
import { Sheet } from './ui';
import { errMsg } from './config';

// ------------------------------------------------------------------ helpers
const pad = (n) => String(n).padStart(2, '0');
const toLocalInput = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const fmtWhen = (iso) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });
const inHours = (h) => new Date(Date.now() + h * 3600 * 1000);
const tomorrowAt = (hr) => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(hr, 0, 0, 0); return d; };
const todayAt = (hr) => { const d = new Date(); d.setHours(hr, 0, 0, 0); return d; };
const money = (v) => Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 });

function countdown(ms) {
  if (ms <= 0) return 'Opening…';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${pad(sec)}s`;
  return `${m}m ${pad(sec)}s`;
}

// ------------------------------------------------------------------ pick a date and time (capsule + reminder)
function WhenPicker({ presets, value, onChange }) {
  return (
    <>
      <div className="px-presets">
        {presets.map(([label, d]) => (
          <button type="button" key={label} className={`px-chip${value && Math.abs(new Date(value) - d) < 60000 ? ' on' : ''}`} onClick={() => onChange(toLocalInput(d))}>{label}</button>
        ))}
      </div>
      <input type="datetime-local" className="sc-field" style={{ marginTop: 10 }} value={value} min={toLocalInput(new Date())} onChange={(e) => onChange(e.target.value)} aria-label="Date and time" />
    </>
  );
}

// ------------------------------------------------------------------ TIME CAPSULE
export function CapsuleSheet({ T, onClose, onSet }) {
  const [when, setWhen] = useState('');
  const [err, setErr] = useState('');
  const presets = [['Tomorrow 9 AM', tomorrowAt(9)], ['In 1 week', inHours(24 * 7)], ['In 1 month', inHours(24 * 30)]];
  const done = () => {
    const d = new Date(when);
    if (!when || Number.isNaN(d.getTime())) { setErr('Pick a date and time'); return; }
    if (d.getTime() < Date.now() + 60000) { setErr('Pick a time at least a minute from now'); return; }
    onSet(d.toISOString());
  };
  return (
    <Sheet T={T} title="Time capsule" onClose={onClose}>
      <p className="px-note">Write your message, then lock it. They see a locked card with a countdown, and it opens only at the time you pick.</p>
      <WhenPicker presets={presets} value={when} onChange={(v) => { setWhen(v); setErr(''); }} />
      {err && <div className="text-danger small" style={{ margin: '10px 4px 0' }}>{err}</div>}
      <button type="button" className="sc-btn" style={{ width: '100%', marginTop: 16 }} onClick={done}><BiLock /> Lock until then</button>
    </Sheet>
  );
}

// ------------------------------------------------------------------ WHISPER (groups)
export function WhisperSheet({ T, members, meId, onClose, onSet }) {
  const [ids, setIds] = useState([]);
  const others = (members || []).filter((p) => p.id !== meId);
  const toggle = (id) => setIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  return (
    <Sheet T={T} title="Whisper" onClose={onClose}>
      <p className="px-note">Only the people you tick can read the next message. Everyone else sees that a whisper was sent, but not what it says.</p>
      <div className="sc-set-group">
        {others.map((p) => (
          <label key={p.id} className="sc-set" style={{ cursor: 'pointer' }}>
            <span className="txt"><b>{p.username}</b></span>
            <input type="checkbox" className="form-check-input" style={{ width: 20, height: 20 }} checked={ids.includes(p.id)} onChange={() => toggle(p.id)} />
          </label>
        ))}
      </div>
      <button type="button" className="sc-btn" style={{ width: '100%', marginTop: 16 }} disabled={ids.length === 0} onClick={() => onSet(ids)}>Whisper to {ids.length || ''} {ids.length === 1 ? 'person' : 'people'}</button>
    </Sheet>
  );
}

// ------------------------------------------------------------------ REMINDER
export function ReminderSheet({ T, defaultText, onClose, onCreate }) {
  const [text, setText] = useState(defaultText || '');
  const [when, setWhen] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const presets = [['In 1 hour', inHours(1)], ['Tonight 8 PM', todayAt(20)], ['Tomorrow 9 AM', tomorrowAt(9)]].filter(([, d]) => d.getTime() > Date.now() + 60000);
  const save = async () => {
    const d = new Date(when);
    if (!text.trim()) { setErr('Write what to remind about'); return; }
    if (!when || Number.isNaN(d.getTime())) { setErr('Pick a date and time'); return; }
    setBusy(true); setErr('');
    try { await onCreate({ text: text.trim(), remind_at: d.toISOString() }); } catch (e) { setErr(errMsg(e, 'Could not set the reminder')); setBusy(false); }
  };
  return (
    <Sheet T={T} title="Remind us" onClose={onClose}>
      <p className="px-note">At the time you pick, a reminder pops up in this chat and both of you get a notification.</p>
      <textarea className="sc-field" rows={2} maxLength={200} style={{ height: 'auto', minHeight: 60, padding: '12px 16px', resize: 'none', marginBottom: 12 }}
        placeholder="Exam at 10 AM, bring ID card" value={text} onChange={(e) => setText(e.target.value.replace(/\n/g, ' '))} aria-label="Reminder text" />
      <WhenPicker presets={presets} value={when} onChange={(v) => { setWhen(v); setErr(''); }} />
      {err && <div className="text-danger small" style={{ margin: '10px 4px 0' }}>{err}</div>}
      <button type="button" className="sc-btn" style={{ width: '100%', marginTop: 16 }} disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Set reminder'}</button>
    </Sheet>
  );
}

// ------------------------------------------------------------------ SPLIT EXPENSE
export function ExpenseSheet({ T, members, meId, onClose, onCreate }) {
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [ids, setIds] = useState(() => (members || []).map((p) => p.id));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const toggle = (id) => setIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const n = new Set([...ids, meId]).size;
  const each = Number(amount) > 0 ? Number(amount) / n : 0;
  const save = async () => {
    if (!title.trim()) { setErr('What was it for?'); return; }
    if (!(Number(amount) > 0)) { setErr('Enter the amount'); return; }
    if (n < 2) { setErr('Pick at least one more person'); return; }
    setBusy(true); setErr('');
    try { await onCreate({ title: title.trim(), amount, member_ids: ids }); } catch (e) { setErr(errMsg(e, 'Could not add the expense')); setBusy(false); }
  };
  return (
    <Sheet T={T} title="Split expense" onClose={onClose}>
      <p className="px-note">You paid. Everyone ticked owes you an equal share, and you can mark shares as paid later.</p>
      <input className="sc-field" placeholder="Dinner, cab, tickets…" maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} aria-label="What was it for" style={{ marginBottom: 10 }} />
      <input className="sc-field" placeholder="Total amount (₹)" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} aria-label="Total amount" />
      <div className="sc-section" style={{ margin: '16px 4px 6px' }}>Split between</div>
      <div className="sc-set-group">
        {(members || []).map((p) => (
          <label key={p.id} className="sc-set" style={{ cursor: p.id === meId ? 'default' : 'pointer' }}>
            <span className="txt"><b>{p.id === meId ? 'You (paid)' : p.username}</b></span>
            <input type="checkbox" className="form-check-input" style={{ width: 20, height: 20 }} disabled={p.id === meId} checked={p.id === meId || ids.includes(p.id)} onChange={() => toggle(p.id)} />
          </label>
        ))}
      </div>
      {each > 0 && <p className="px-note" style={{ textAlign: 'center', marginTop: 12 }}>About ₹{money(each)} each, {n} people</p>}
      {err && <div className="text-danger small" style={{ margin: '6px 4px 0' }}>{err}</div>}
      <button type="button" className="sc-btn" style={{ width: '100%', marginTop: 12 }} disabled={busy} onClick={save}>{busy ? 'Adding…' : 'Add expense'}</button>
    </Sheet>
  );
}

export function BalancesSheet({ T, chatId, meId, onClose }) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    api.get('expenses/balances/', { params: { chat_id: chatId } })
      .then((r) => setRows(r.data.transfers || [])).catch((e) => setErr(errMsg(e, 'Could not load balances')));
  }, [chatId]);
  return (
    <Sheet T={T} title="Who owes whom" onClose={onClose}>
      {err && <div className="text-danger small">{err}</div>}
      {rows && rows.length === 0 && <p className="px-note" style={{ textAlign: 'center', margin: '30px 0' }}>All settled up 🎉</p>}
      <div className="sc-set-group">
        {(rows || []).map((t, i) => (
          <div key={i} className="sc-set">
            <span className="txt">
              <b>{t.from_id === meId ? 'You' : t.from_name} → {t.to_id === meId ? 'you' : t.to_name}</b>
              <small>{t.from_id === meId ? 'You owe' : (t.to_id === meId ? 'Owes you' : 'Owes')}</small>
            </span>
            <b style={{ fontFamily: 'var(--font-display)' }}>₹{money(t.amount)}</b>
          </div>
        ))}
      </div>
      <p className="px-note" style={{ marginTop: 12 }}>Only unpaid shares are counted.</p>
    </Sheet>
  );
}

export function ExpenseCard({ exp, meId, onSettle, onBalances }) {
  const payerMe = exp.payer_id === meId;
  const pending = exp.shares.filter((s) => !s.paid).length;
  return (
    <div style={{ minWidth: 230 }}>
      <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 2 }}>💸 Expense · paid by {payerMe ? 'you' : exp.payer_name}</div>
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 17 }}>{exp.title}</div>
      <div style={{ fontSize: 22, fontWeight: 800, margin: '2px 0 8px' }}>₹{money(exp.amount)}</div>
      {exp.shares.map((s) => {
        const mine = s.user_id === meId;
        const canTap = (mine || payerMe) && s.user_id !== exp.payer_id;
        return (
          <div key={s.user_id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', fontSize: 13.5, borderTop: '1px solid rgba(255,255,255,.12)' }}>
            <span style={{ flex: 1 }}>{mine ? 'You' : s.username}{s.user_id === exp.payer_id ? ' (paid)' : ''}</span>
            <span>₹{money(s.amount)}</span>
            {s.user_id === exp.payer_id ? <span aria-hidden>✅</span> : (
              <button type="button" disabled={!canTap} onClick={(e) => { e.stopPropagation(); onSettle(exp.id, s.user_id); }}
                style={{ border: 0, borderRadius: 999, padding: '2px 10px', fontSize: 12, fontWeight: 700, background: s.paid ? 'rgba(61,220,151,.25)' : 'rgba(0,0,0,.22)', color: 'inherit', opacity: canTap || s.paid ? 1 : 0.7 }}>
                {s.paid ? 'Paid ✓' : (canTap ? 'Mark paid' : 'Unpaid')}
              </button>
            )}
          </div>
        );
      })}
      <button type="button" onClick={(e) => { e.stopPropagation(); onBalances(); }} style={{ marginTop: 6, padding: 0, border: 0, background: 'transparent', color: 'inherit', textDecoration: 'underline', fontSize: 12.5, fontWeight: 700 }}>
        {pending ? `${pending} unpaid · See balances` : 'All paid · See balances'}
      </button>
    </div>
  );
}

// ------------------------------------------------------------------ capsule + whisper bubble parts
export function CapsuleLocked({ msg, onOpened }) {
  const [now, setNow] = useState(Date.now());
  const left = new Date(msg.unlock_at).getTime() - now;
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), left > 3600000 ? 30000 : 1000);
    return () => clearInterval(t);
  }, [left > 3600000]);
  useEffect(() => { if (left <= 0 && onOpened) { const t = setTimeout(onOpened, 1500); return () => clearTimeout(t); } return undefined; }, [left <= 0]);
  return (
    <div className="px-locked">
      <span className="px-lockicon"><BiLock /></span>
      <div><b>Time capsule</b><div style={{ fontSize: 12.5, opacity: 0.8 }}>Opens {fmtWhen(msg.unlock_at)}</div></div>
      <span className="px-count">{countdown(left)}</span>
    </div>
  );
}

export function WhisperLocked({ msg }) {
  const names = (msg.whisper?.to || []).map((u) => u.username).filter((u) => u !== msg.sender_name);
  return <div className="px-locked"><span className="px-lockicon">🤫</span><div><b>Whisper</b><div style={{ fontSize: 12.5, opacity: 0.8 }}>{names.length ? `For ${names.join(', ')}` : 'Only a few people can read this'}</div></div></div>;
}

export function MsgTags({ msg, isMe }) {
  const showCap = isMe && msg.unlock_at && new Date(msg.unlock_at).getTime() > Date.now();
  const names = (msg.whisper?.to || []).map((u) => u.username).filter((u) => u !== msg.sender_name);
  if (!showCap && !(isMe && names.length)) return null;
  return (
    <div style={{ fontSize: 11, opacity: 0.85, marginBottom: 3 }}>
      {showCap && <span>🔒 Opens {fmtWhen(msg.unlock_at)}</span>}
      {isMe && names.length > 0 && <span>{showCap ? ' · ' : ''}🤫 Whisper to {names.join(', ')}</span>}
    </div>
  );
}

// the chip above the composer: "Opens Mon 9 AM" / "Whisper to …"
export function ModeChip({ mode, onClear }) {
  if (!mode) return null;
  return (
    <div className="px-mode">
      <span>{mode.unlock_at ? `🔒 Opens ${fmtWhen(mode.unlock_at)}` : `🤫 Whisper to ${mode.names.join(', ')}`}</span>
      <button type="button" onClick={onClear} aria-label="Cancel"><BiX /></button>
    </div>
  );
}

// ------------------------------------------------------------------ DAILY QUESTION
export function DailyBar({ T, chatId, refreshKey, open, setOpen }) {
  const [d, setD] = useState(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const seenKey = d ? `daily_seen_${chatId}_${d.day}` : '';
  const [, bump] = useState(0);

  const load = async () => {
    try { const r = await api.get('daily/', { params: { chat_id: chatId } }); setD(r.data); } catch (e) { /* groups or locked: no bar */ }
  };
  useEffect(() => { if (chatId) load(); }, [chatId, refreshKey]);

  const send = async () => {
    if (!text.trim()) { setErr('Write your answer first'); return; }
    setBusy(true); setErr('');
    try { const r = await api.post('daily/', { chat_id: chatId, text: text.trim() }); setD(r.data); setText(''); } catch (e) { setErr(errMsg(e, 'Could not save')); }
    setBusy(false);
  };

  const seen = (() => { try { return localStorage.getItem(seenKey) === '1'; } catch (e) { return false; } })();
  const closeSheet = () => {
    if (d?.revealed) { try { localStorage.setItem(seenKey, '1'); } catch (e) { /* ignore */ } bump((x) => x + 1); }
    setOpen(false);
  };
  if (!d) return null;
  const showChip = d.mine === null || (d.revealed && !seen);

  return (
    <>
      {showChip && (
        <button type="button" className="px-daily" onClick={() => setOpen(true)}>
          <span aria-hidden>💬</span>
          <span className="t">{d.revealed ? 'Both answered today. See the answers' : (d.partner_answered && d.mine === null ? `${d.partner_name} answered. Your turn` : `Today: ${d.question}`)}</span>
        </button>
      )}
      {open && (
        <Sheet T={T} title="Question of the day" onClose={closeSheet}>
          <div className="px-q">{d.question}</div>
          {d.mine === null ? (
            <>
              <textarea className="sc-field" rows={3} maxLength={300} autoFocus style={{ height: 'auto', minHeight: 90, padding: '12px 16px', resize: 'none' }}
                placeholder="Your answer" value={text} onChange={(e) => setText(e.target.value)} aria-label="Your answer" />
              <p className="px-note">{d.partner_answered ? `${d.partner_name} already answered. You will see it as soon as you answer.` : `${d.partner_name}'s answer stays hidden until both of you have answered.`}</p>
              {err && <div className="text-danger small">{err}</div>}
              <button type="button" className="sc-btn" style={{ width: '100%', marginTop: 8 }} disabled={busy} onClick={send}>{busy ? 'Saving…' : 'Submit answer'}</button>
            </>
          ) : (
            <>
              <div className="px-ans"><small>You</small><p>{d.mine}</p></div>
              {d.revealed
                ? <div className="px-ans them"><small>{d.partner_name}</small><p>{d.theirs}</p></div>
                : <div className="px-ans wait"><small>{d.partner_name}</small><p>{d.partner_answered ? 'Answered' : 'Has not answered yet'}. Their answer shows here when you both have answered.</p></div>}
            </>
          )}
        </Sheet>
      )}
    </>
  );
}
