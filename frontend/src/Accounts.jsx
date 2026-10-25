import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BiPlus, BiX, BiCheck } from 'react-icons/bi';
import Avatar from './Avatar';
import { Sheet } from './ui';
import { API_ORIGIN, getToken } from './config';
import { forgetAccount, rememberCurrent, switchAccount } from './accounts';

// "Switch account": every login saved on this phone, tap one to use it, or add another.
export default function AccountsSheet({ T, onClose, ask }) {
  const navigate = useNavigate();
  const [list, setList] = useState(() => rememberCurrent());
  const active = getToken();

  const remove = async (acc) => {
    const ok = await ask({
      type: 'confirm', danger: true, okText: 'Remove',
      title: `Remove ${acc.username}?`,
      message: 'This logs that account out on this phone. You can log in to it again later.',
    });
    if (!ok) return;
    // log that account out on the server too (a plain fetch, because the app's api client always sends the ACTIVE account's token)
    try { await fetch(`${API_ORIGIN}/api/auth/logout/`, { method: 'POST', headers: { Authorization: `Token ${acc.token}` } }); } catch (e) { /* offline: it is still removed here */ }
    forgetAccount(acc.token);
    setList((l) => l.filter((a) => a.token !== acc.token));
  };

  const add = () => {
    onClose();
    setTimeout(() => navigate('/', { state: { addAccount: true } }), 150);     // let the sheet close first
  };

  return (
    <Sheet T={T} title="Accounts" onClose={onClose}>
      <div className="sc-set-group">
        {list.map((acc) => {
          const isActive = acc.token === active;
          return (
            <div key={acc.token} className="sc-set" style={{ alignItems: 'center' }}>
              <button type="button" onClick={() => (isActive ? onClose() : switchAccount(acc))} aria-label={isActive ? `${acc.username}, active` : `Switch to ${acc.username}`}
                style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 12, padding: 0, border: 0, background: 'transparent', color: 'inherit', textAlign: 'left' }}>
                <Avatar src={null} name={acc.username} size={44} T={T} />
                <span className="txt"><b>{acc.username}</b><small>{isActive ? 'Active now' : 'Tap to switch'}</small></span>
              </button>
              {isActive
                ? <BiCheck style={{ fontSize: 24, color: 'var(--accent)' }} aria-hidden />
                : <button type="button" className="sc-dots" aria-label={`Remove ${acc.username}`} onClick={() => remove(acc)}><BiX /></button>}
            </div>
          );
        })}
      </div>
      <button type="button" className="sc-btn ghost" style={{ width: '100%' }} onClick={add}><BiPlus /> Add account</button>
      <p style={{ color: 'var(--sub)', fontSize: 12.5, margin: '12px 4px 0', lineHeight: 1.5 }}>
        Log in to another Secret ID and switch between them any time without logging out.
      </p>
    </Sheet>
  );
}
