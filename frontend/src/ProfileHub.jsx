import React, { useState } from 'react';
import { BiStar, BiShield, BiLock, BiDevices, BiQrScan, BiPalette, BiBell, BiBlock, BiVolumeFull, BiLogOut, BiEdit, BiTrash, BiChevronRight, BiCamera, BiUserCircle } from 'react-icons/bi';
import api from './api';
import Avatar from './Avatar';
import { Sheet, Toggle, SettingRow } from './ui';
import { PrivacySheet, DevicesSheet, LockSheet, QrSheet, StarredSheet, BlockedSheet } from './Sheets';
import { APP_MODES, CHAT_THEMES } from './theme';
import { lockEnabled } from './appLock';
import AccountsSheet from './Accounts';
import AdminPanel from './AdminPanel';
import { MoodSheet, BirthdaySheet, AwaySheet } from './PlusUI2';
import { listAccounts } from './accounts';
import { DEFAULT_REACTIONS, getCustomReactions, getQuickReaction, setQuickReaction } from './reactions';
import { burstAt } from './fx';
import PhotoCropper from './PhotoCropper';
import { soundsEnabled, setSoundsEnabled } from './sounds';
import { getMe, errMsg, shortFile } from './config';

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

// choose the emoji a double-tap on a message sends
function QuickReactionSheet({ T, onClose }) {
  const [cur, setCur] = useState(getQuickReaction());
  const all = [...DEFAULT_REACTIONS, ...getCustomReactions()];
  return (
    <Sheet T={T} title="Double-tap reaction" onClose={onClose}>
      <p style={{ color: 'var(--sub)', fontSize: 13.5, margin: '0 4px 14px', lineHeight: 1.5 }}>Double-tap any message and this emoji is sent as your reaction. Hold a reaction to make it rain.</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        {all.map((e) => (
          <button key={e} type="button" aria-pressed={cur === e} aria-label={`Use ${e}`}
            onClick={(ev) => { setCur(e); setQuickReaction(e); burstAt(e, ev.clientX, ev.clientY, 7); }}
            style={{ width: 56, height: 56, fontSize: 28, borderRadius: 18, border: cur === e ? '2px solid var(--accent)' : '1px solid var(--line)', background: 'var(--raised)' }}>{e}</button>
        ))}
      </div>
    </Sheet>
  );
}

export default function ProfileHub({ T, me, currentUsername, ask, refresh, appTheme, changeAppTheme, notifPerm, enableNotifications, blockedUsers, doUnblock, deleteAccount, doLogout, onAddUser, openQrFirst }) {
  const [sheet, setSheet] = useState(openQrFirst ? 'qr' : null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [cropFile, setCropFile] = useState(null);          // picture waiting to be adjusted
  const [sounds, setSounds] = useState(soundsEnabled());
  const close = () => setSheet(null);

  const pickPhoto = (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (file) setCropFile(file);
  };
  const upload = async (file) => {
    setCropFile(null);
    const fd = new FormData();
    fd.append('profile_picture', shortFile(file));
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
      <div style={{ borderRadius: 26, overflow: 'hidden', background: 'var(--panel)', border: '1px solid var(--line)', marginBottom: 18 }}>
        <div style={{ height: 84, background: 'linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 35%, var(--panel)))', opacity: 0.9 }} />
        <div style={{ padding: '0 18px 18px', marginTop: -48, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          <div style={{ position: 'relative', borderRadius: '50%', border: '4px solid var(--panel)', lineHeight: 0 }}>
            <Avatar src={me?.profile_picture} name={currentUsername} size={92} T={T} />
            <input type="file" id="dp-upload" className="d-none" accept="image/*" onChange={pickPhoto} />
            <label htmlFor="dp-upload" aria-label="Change photo" style={{ position: 'absolute', right: -2, bottom: -2, width: 32, height: 32, borderRadius: '50%', background: 'var(--accent)', color: '#161616', display: 'grid', placeItems: 'center', cursor: 'pointer', border: '3px solid var(--panel)', fontSize: 16, margin: 0 }}><BiCamera /></label>
          </div>
          {editing ? (
            <div style={{ width: '100%', textAlign: 'left', marginTop: 14 }}>
              <label className="sc-label">Secret ID</label>
              <input className="sc-field" value={name} onChange={(e) => setName(e.target.value)} />
              <label className="sc-label">Bio</label>
              <textarea className="sc-field" rows="2" value={bio} onChange={(e) => setBio(e.target.value)} />
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button type="button" className="sc-btn" style={{ flex: 1 }} onClick={save}>Save</button>
                <button type="button" className="sc-btn ghost" style={{ flex: 1 }} onClick={() => setEditing(false)}>Cancel</button>
              </div>
              {me?.profile_picture && <button type="button" className="sc-btn ghost" style={{ width: '100%', marginTop: 8, height: 36, fontSize: 13 }} onClick={removePic}>Remove photo</button>}
            </div>
          ) : (
            <>
              <h2 style={{ margin: '12px 0 2px', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 24, letterSpacing: '-.02em' }}>{currentUsername}</h2>
              <p style={{ margin: '0 0 14px', color: 'var(--sub)', fontSize: 14, maxWidth: 280, lineHeight: 1.45 }}>{me?.bio || 'No bio yet'}</p>
              <div style={{ display: 'flex', gap: 8, width: '100%' }}>
                <button type="button" className="sc-btn" style={{ flex: 1, height: 40, fontSize: 14, whiteSpace: 'nowrap', padding: '0 12px', minWidth: 0 }} onClick={() => { setName(currentUsername); setBio(me?.bio || ''); setEditing(true); }}><BiEdit /> Edit profile</button>
                <button type="button" className="sc-btn ghost" style={{ flex: 1, height: 40, fontSize: 14, whiteSpace: 'nowrap', padding: '0 12px', minWidth: 0 }} onClick={() => setSheet('qr')}><BiQrScan /> My QR</button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="sc-set-group">
        <SettingRow icon={<BiUserCircle />} title="Switch account" sub={listAccounts().length > 1 ? `${listAccounts().length} accounts on this phone` : 'Add another account'} onClick={() => setSheet('accounts')} right={chev} />
        <SettingRow icon={<span style={{ fontSize: 20 }}>🎂</span>} title="My birthday" sub={me?.birthday ? `${me.birthday.split('-')[1]}/${me.birthday.split('-')[0]}` : 'Friends get a note on the day'} onClick={() => setSheet('bday')} right={chev} />
        <SettingRow icon={<span style={{ fontSize: 20 }}>🤖</span>} title="Away auto-reply" sub={me?.away ? 'On' : 'Off'} onClick={() => setSheet('away')} right={chev} />
        <SettingRow icon={<span style={{ fontSize: 20 }}>{me?.mood?.emoji || '🙂'}</span>} title="My mood" sub={me?.mood ? `${me.mood.emoji} ${me.mood.text}`.trim() : 'Show friends how you feel for 24 hours'} onClick={() => setSheet('mood')} right={chev} />
        <SettingRow icon={<span style={{ fontSize: 20 }}>{getQuickReaction()}</span>} title="Double-tap reaction" sub="Sent when you double-tap a message" onClick={() => setSheet('quick')} right={chev} />
        <SettingRow icon={<BiStar />} title="Starred messages" onClick={() => setSheet('starred')} right={chev} />
      </div>

      <div className="sc-set-group">
        <SettingRow icon={<BiShield />} title="Privacy" sub="Last seen, photo, read receipts" onClick={() => setSheet('privacy')} right={chev} />
        <SettingRow icon={<BiLock />} title="App lock" sub={lockEnabled() ? 'PIN is on' : 'Off'} onClick={() => setSheet('lock')} right={chev} />
        <SettingRow icon={<BiDevices />} title="Logged-in devices" onClick={() => setSheet('devices')} right={chev} />
        {me?.is_admin && <SettingRow icon={<BiShield />} title="Admin panel" sub="Users, reports and bans" onClick={() => setSheet('admin')} right={chev} />}
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
      <p style={{ textAlign: 'center', color: 'var(--sub)', fontSize: 12, margin: '18px 0 0' }}>Chatzy · Designed and built by Madhavan</p>

      {cropFile && <PhotoCropper T={T} file={cropFile} onCancel={() => setCropFile(null)} onDone={upload} />}
      {sheet === 'quick' && <QuickReactionSheet T={T} onClose={close} />}
      {sheet === 'bday' && <BirthdaySheet T={T} me={me} onClose={close} ask={ask} onDone={() => refresh && refresh()} />}
      {sheet === 'away' && <AwaySheet T={T} me={me} onClose={close} ask={ask} onDone={() => refresh && refresh()} />}
      {sheet === 'mood' && <MoodSheet T={T} me={me} onClose={close} ask={ask} onDone={() => refresh && refresh()} />}
      {sheet === 'admin' && <AdminPanel T={T} onClose={close} ask={ask} />}
      {sheet === 'accounts' && <AccountsSheet T={T} onClose={close} ask={ask} />}
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
