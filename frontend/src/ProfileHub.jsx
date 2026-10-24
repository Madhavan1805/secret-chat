import React, { useState } from 'react';
import { BiStar, BiShield, BiLock, BiDevices, BiQrScan, BiPalette, BiBell, BiBlock, BiVolumeFull, BiLogOut, BiEdit, BiTrash, BiChevronRight, BiCamera } from 'react-icons/bi';
import api from './api';
import Avatar from './Avatar';
import { Sheet, Toggle, SettingRow } from './ui';
import { PrivacySheet, DevicesSheet, LockSheet, QrSheet, StarredSheet, BlockedSheet } from './Sheets';
import { APP_MODES, CHAT_THEMES } from './theme';
import { lockEnabled } from './appLock';
import { soundsEnabled, setSoundsEnabled } from './sounds';
import { getMe, errMsg } from './config';

const chev = <BiChevronRight style={{ fontSize: 20, color: 'var(--sub)' }} />;

function ThemeSheet({ T, onClose, appTheme, onPick }) {
  const keys = [...APP_MODES.map((m) => m.key), ...Object.keys(CHAT_THEMES).filter((k) => !APP_MODES.some((m) => m.key === k))];
  return (
    <Sheet T={T} title="Appearance" onClose={onClose}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {keys.map((k) => {
          const t = CHAT_THEMES[k];
          const on = appTheme === k;
          return (
            <button key={k} type="button" onClick={() => onPick(k)} aria-pressed={on}
              style={{ textAlign: 'left', padding: 12, borderRadius: 20, border: `2px solid ${on ? t.accent : 'transparent'}`, background: t.bg, color: t.text, cursor: 'pointer' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 10 }}>
                <span style={{ alignSelf: 'flex-start', width: '70%', height: 14, borderRadius: '10px 10px 10px 3px', background: t.other }} />
                <span style={{ alignSelf: 'flex-end', width: '55%', height: 14, borderRadius: '10px 10px 3px 10px', background: t.mine }} />
              </div>
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 14 }}>{t.label}</span>
            </button>
          );
        })}
      </div>
    </Sheet>
  );
}

export default function ProfileHub({ T, me, currentUsername, ask, refresh, appTheme, changeAppTheme, notifPerm, enableNotifications, blockedUsers, doUnblock, deleteAccount, doLogout, onAddUser, openQrFirst }) {
  const [sheet, setSheet] = useState(openQrFirst ? 'qr' : null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [sounds, setSounds] = useState(soundsEnabled());
  const close = () => setSheet(null);

  const upload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('profile_picture', file);
    try { await api.patch('users/update_profile/', fd, { headers: { 'Content-Type': 'multipart/form-data' } }); await getMe(true); refresh(); } catch (err) { ask({ type: 'alert', title: errMsg(err, 'Upload failed') }); }
  };
  const removePic = async () => {
    try { await api.patch('users/update_profile/', { remove_picture: 'true' }); await getMe(true); refresh(); } catch (err) { ask({ type: 'alert', title: errMsg(err, 'Failed') }); }
  };
  const save = async () => {
    if (!name.trim()) { ask({ type: 'alert', title: 'Name cannot be empty' }); return; }
    try {
      const fd = new FormData();
      fd.append('username', name); fd.append('bio', bio);
      const r = await api.patch('users/update_profile/', fd);
      localStorage.setItem('username', r.data.username);
      await getMe(true); setEditing(false); refresh();
    } catch (err) { ask({ type: 'alert', title: errMsg(err, 'Update failed') }); }
  };

  return (
    <div style={{ padding: '4px 6px 20px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '8px 8px 18px' }}>
        <Avatar src={me?.profile_picture} name={currentUsername} size={96} T={T} />
        <input type="file" id="dp-upload" className="d-none" accept="image/*" onChange={upload} />
        <div style={{ display: 'flex', gap: 8, margin: '12px 0 4px' }}>
          <label htmlFor="dp-upload" className="sc-btn ghost" style={{ height: 36, fontSize: 13, margin: 0, cursor: 'pointer' }}><BiCamera /> Change photo</label>
          {me?.profile_picture && <button type="button" className="sc-btn ghost" style={{ height: 36, fontSize: 13 }} onClick={removePic}>Remove</button>}
        </div>
        {editing ? (
          <div style={{ width: '100%', textAlign: 'left' }}>
            <label className="sc-label">Secret ID</label>
            <input className="sc-field" value={name} onChange={(e) => setName(e.target.value)} />
            <label className="sc-label">Bio</label>
            <textarea className="sc-field" rows="2" value={bio} onChange={(e) => setBio(e.target.value)} />
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button type="button" className="sc-btn" style={{ flex: 1 }} onClick={save}>Save</button>
              <button type="button" className="sc-btn ghost" style={{ flex: 1 }} onClick={() => setEditing(false)}>Cancel</button>
            </div>
          </div>
        ) : (
          <>
            <h2 style={{ margin: '8px 0 2px', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 26, letterSpacing: '-.02em' }}>{currentUsername}</h2>
            <p style={{ margin: 0, color: 'var(--sub)', fontSize: 14, maxWidth: 280 }}>{me?.bio || 'Add a short bio so friends know who you are.'}</p>
            <button type="button" className="sc-btn ghost" style={{ marginTop: 12, height: 38, fontSize: 14 }} onClick={() => { setName(currentUsername); setBio(me?.bio || ''); setEditing(true); }}><BiEdit /> Edit profile</button>
          </>
        )}
      </div>

      <div className="sc-set-group">
        <SettingRow icon={<BiQrScan />} title="QR code" sub="Add friends by scanning" onClick={() => setSheet('qr')} right={chev} />
        <SettingRow icon={<BiStar />} title="Starred messages" onClick={() => setSheet('starred')} right={chev} />
      </div>

      <div className="sc-set-group">
        <SettingRow icon={<BiShield />} title="Privacy" sub="Last seen, photo, read receipts" onClick={() => setSheet('privacy')} right={chev} />
        <SettingRow icon={<BiLock />} title="App lock" sub={lockEnabled() ? 'PIN is on' : 'Off'} onClick={() => setSheet('lock')} right={chev} />
        <SettingRow icon={<BiDevices />} title="Logged-in devices" onClick={() => setSheet('devices')} right={chev} />
        <SettingRow icon={<BiBlock />} title="Blocked users" sub={blockedUsers.length ? `${blockedUsers.length} blocked` : 'Nobody'} onClick={() => setSheet('blocked')} right={chev} />
      </div>

      <div className="sc-set-group">
        <SettingRow icon={<BiPalette />} title="Appearance" sub={(CHAT_THEMES[appTheme] || CHAT_THEMES.default).label} onClick={() => setSheet('theme')} right={chev} />
        <SettingRow icon={<BiVolumeFull />} title="Sounds" right={<Toggle on={sounds} onChange={(v) => { setSounds(v); setSoundsEnabled(v); }} label="Sounds" />} />
        {notifPerm !== 'unsupported' && (
          <SettingRow icon={<BiBell />} title="Notifications" sub={notifPerm === 'granted' ? 'On' : 'Tap to allow'} onClick={notifPerm === 'granted' ? undefined : enableNotifications} />
        )}
      </div>

      <div className="sc-set-group">
        <SettingRow icon={<BiLogOut />} title="Log out" onClick={doLogout} />
        <SettingRow icon={<BiTrash />} title="Delete my account" sub="Erases everything. Cannot be undone." onClick={deleteAccount} danger />
      </div>
      <p style={{ textAlign: 'center', color: 'var(--sub)', fontSize: 12, margin: '18px 0 0' }}>Secret Chat · Designed and built by Madhavan</p>

      {sheet === 'privacy' && <PrivacySheet T={T} onClose={close} ask={ask} />}
      {sheet === 'devices' && <DevicesSheet T={T} onClose={close} ask={ask} />}
      {sheet === 'lock' && <LockSheet T={T} onClose={() => { close(); }} ask={ask} />}
      {sheet === 'starred' && <StarredSheet T={T} onClose={close} ask={ask} />}
      {sheet === 'blocked' && <BlockedSheet T={T} onClose={close} users={blockedUsers} onUnblock={doUnblock} />}
      {sheet === 'theme' && <ThemeSheet T={T} onClose={close} appTheme={appTheme} onPick={changeAppTheme} />}
      {sheet === 'qr' && <QrSheet T={T} me={me} onClose={close} onAddUser={(u) => { close(); onAddUser(u); }} />}
    </div>
  );
}
