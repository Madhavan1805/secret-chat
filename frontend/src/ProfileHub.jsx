import { t, getLang } from './i18n';
import { TwoFactorSheet, BroadcastSheet, StorageSheet, QuickRepliesSheet, LanguageSheet } from './Extras5UI';
import React, { useState } from 'react';
import { BiSmile, BiStar, BiShield, BiLock, BiDevices, BiQrScan, BiPalette, BiBell, BiBlock, BiVolumeFull, BiLogOut, BiEdit, BiTrash, BiChevronRight, BiCamera, BiUserCircle, BiExpand, BiGift } from 'react-icons/bi';
import api from './api';
import Avatar from './Avatar';
import { Sheet, Toggle, SettingRow, Choice } from './ui';
import AvatarPicker from './AvatarPicker';
import MediaViewer from './MediaViewer';
import { onlineAlertsEnabled, setOnlineAlertsEnabled } from './onlineAlerts';
import { PrivacySheet, DevicesSheet, LockSheet, QrSheet, StarredSheet, BlockedSheet } from './Sheets';
import { APP_MODES, CHAT_THEMES, TEXT_SIZES, FONT_STYLES, getTextScale, setTextScale, getFontStyle, setFontStyle } from './theme';
import { lockEnabled } from './appLock';
import AccountsSheet from './Accounts';
const AdminPanel = React.lazy(() => import('./AdminPanel'));
import { getQuiet } from './quiet';
import { AskInbox } from './PlusUI3';
import { MoodSheet, BirthdaySheet, AwaySheet, QuietSheet } from './PlusUI2';
import { listAccounts } from './accounts';
import { DEFAULT_REACTIONS, getCustomReactions, getQuickReaction, setQuickReaction } from './reactions';
import { burstAt } from './fx';
import { UI_SCALES, getUiScale, setUiScale } from './uiScale';
import { CHANGELOG, hasUnseenUpdate, markUpdateSeen } from './changelog';
import PhotoCropper from './PhotoCropper';
import { soundsEnabled, setSoundsEnabled } from './sounds';
import { getMe, errMsg, shortFile, getPicUrl } from './config';

const chev = <BiChevronRight style={{ fontSize: 20, color: 'var(--sub)' }} />;

function ThemeSheet({ T, onClose, appTheme, onPick }) {
  const [size, setSize] = useState(getTextScale());
  const [font, setFont] = useState(getFontStyle());
  const keys = [...APP_MODES.map((m) => m.key), ...Object.keys(CHAT_THEMES).filter((k) => !APP_MODES.some((m) => m.key === k))];
  return (
    <Sheet T={T} title={t('Appearance')} onClose={onClose}>
      <label className="sc-label">Text size</label>
      <Choice value={size} options={TEXT_SIZES} onChange={(v) => { setSize(v); setTextScale(v); }} />
      <label className="sc-label" style={{ marginTop: 14 }}>Font style</label>
      <Choice value={font} options={FONT_STYLES.map(([k, l]) => [k, l])} onChange={(v) => { setFont(v); setFontStyle(v); }} />
      <p style={{ margin: '12px 4px', fontSize: 'calc(15px * var(--ts, 1))' }}>The quick brown fox says hello, Chatzy 👋</p>
      <label className="sc-label" style={{ marginTop: 6 }}>Colour theme</label>
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

// What's new: the details of every update (the update pop-up itself only says that an update is ready)
function WhatsNewSheet({ T, onClose }) {
  useEffect(() => { markUpdateSeen(); }, []);
  return (
    <Sheet T={T} title="What's new" onClose={onClose}>
      {CHANGELOG.map((c, i) => (
        <div key={c.id} style={{ marginBottom: 14, padding: '12px 14px', borderRadius: 18, background: 'var(--raised)', border: '1px solid var(--line)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <b style={{ fontSize: 15 }}>{c.title}</b>
            {i === 0 && <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: 'var(--accent)', color: '#161616' }}>Latest</span>}
          </div>
          <div style={{ fontSize: 12, color: 'var(--sub)', margin: '2px 0 8px' }}>{c.date}</div>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6, fontSize: 14, lineHeight: 1.45 }}>
            {c.items.map((it) => <li key={it}>{it}</li>)}
          </ul>
        </div>
      ))}
    </Sheet>
  );
}

// Display size: scales the whole app on this phone (for phones where everything looks too big or too small)
function DisplaySizeSheet({ T, onClose }) {
  const [v, setV] = useState(getUiScale());
  const pick = (n) => { setV(n); setUiScale(n); };
  return (
    <Sheet T={T} title={t('Display size')} onClose={onClose}>
      <p style={{ color: 'var(--sub)', fontSize: 13.5, margin: '0 4px 14px', lineHeight: 1.5 }}>Everything looks too big or too small on your phone? Change the size of the whole app here. It is saved on this phone only.</p>
      <Choice value={v} options={UI_SCALES.map((s) => [s.v, s.label])} onChange={pick} />
      <input type="range" min="0.8" max="1.2" step="0.05" value={v} aria-label="Display size"
        onChange={(e) => pick(Math.round(Number(e.target.value) * 100) / 100)} style={{ width: '100%', margin: '18px 0 6px', accentColor: 'var(--accent)' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--sub)', padding: '0 2px' }}><span>Smaller</span><span>{Math.round(v * 100)}%</span><span>Bigger</span></div>
      <div style={{ margin: '16px 0 4px', padding: 14, borderRadius: 18, background: 'var(--raised)', border: '1px solid var(--line)' }}>
        <span style={{ display: 'inline-block', padding: '8px 12px', borderRadius: '16px 16px 16px 4px', background: 'var(--line)', fontSize: 14 }}>Hey! How does this size feel? 👋</span>
      </div>
      <button type="button" className="sc-btn" disabled={v === 1} onClick={() => pick(1)} style={{ width: '100%', marginTop: 12 }}>Reset to default</button>
    </Sheet>
  );
}

// choose the emoji a double-tap on a message sends
function QuickReactionSheet({ T, onClose }) {
  const [cur, setCur] = useState(getQuickReaction());
  const all = [...DEFAULT_REACTIONS, ...getCustomReactions()];
  return (
    <Sheet T={T} title={t('Double-tap reaction')} onClose={onClose}>
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
  const [viewPhoto, setViewPhoto] = useState(false);           // my own photo, full size
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [cropFile, setCropFile] = useState(null);          // picture waiting to be adjusted
  const [sounds, setSounds] = useState(soundsEnabled());
  const [onlineAlerts, setOnlineAlerts] = useState(onlineAlertsEnabled());
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
            <button type="button" aria-label="View my photo" disabled={!me?.profile_picture} onClick={() => setViewPhoto(true)} style={{ border: 0, padding: 0, background: 'none', borderRadius: '50%', lineHeight: 0, cursor: me?.profile_picture ? 'zoom-in' : 'default' }}>
              <Avatar src={me?.profile_picture} name={currentUsername} size={92} T={T} />
            </button>
            <input type="file" id="dp-upload" className="d-none" accept="image/*" onChange={pickPhoto} />
            <label htmlFor="dp-upload" aria-label="Change photo" style={{ position: 'absolute', right: -2, bottom: -2, width: 32, height: 32, borderRadius: '50%', background: 'var(--accent)', color: '#161616', display: 'grid', placeItems: 'center', cursor: 'pointer', border: '3px solid var(--panel)', fontSize: 16, margin: 0 }}><BiCamera /></label>
          </div>
          {editing ? (
            <div style={{ width: '100%', textAlign: 'left', marginTop: 14 }}>
              <label className="sc-label">Chatzy ID</label>
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
                <button type="button" className="sc-btn ghost" style={{ flex: 1, height: 40, fontSize: 14, whiteSpace: 'nowrap', padding: '0 12px', minWidth: 0 }} onClick={() => setSheet('qr')}><BiQrScan /> {t('My QR')}</button>
              </div>
              <button type="button" className="sc-btn ghost" style={{ width: '100%', height: 40, fontSize: 14, marginTop: 8 }} onClick={() => setSheet('avatar')}><BiSmile /> Choose a cartoon avatar</button>
            </>
          )}
        </div>
      </div>

      <div className="sc-set-group">
        <SettingRow icon={<BiUserCircle />} title={t('Switch account')} sub={listAccounts().length > 1 ? `${listAccounts().length} accounts on this phone` : 'Add another account'} onClick={() => setSheet('accounts')} right={chev} />
        <SettingRow icon={<span style={{ fontSize: 20 }}>🙈</span>} title={t('Ask me anything')} sub="Anonymous questions from friends" onClick={() => setSheet('ask')} right={chev} />
        <SettingRow icon={<span style={{ fontSize: 20 }}>🎂</span>} title={t('My birthday')} sub={me?.birthday ? `${me.birthday.split('-')[1]}/${me.birthday.split('-')[0]}` : 'Friends get a note on the day'} onClick={() => setSheet('bday')} right={chev} />
        <SettingRow icon={<span style={{ fontSize: 20 }}>🤖</span>} title={t('Away auto-reply')} sub={me?.away ? 'On' : 'Off'} onClick={() => setSheet('away')} right={chev} />
        <SettingRow icon={<span style={{ fontSize: 20 }}>{me?.mood?.emoji || '🙂'}</span>} title={t('My mood')} sub={me?.mood ? `${me.mood.emoji} ${me.mood.text}`.trim() : 'Show friends how you feel for 24 hours'} onClick={() => setSheet('mood')} right={chev} />
        <SettingRow icon={<span style={{ fontSize: 20 }}>{getQuickReaction()}</span>} title={t('Double-tap reaction')} sub="Sent when you double-tap a message" onClick={() => setSheet('quick')} right={chev} />
        <SettingRow icon={<BiStar />} title={t('Starred messages')} onClick={() => setSheet('starred')} right={chev} />
        <SettingRow icon={<span style={{ fontSize: 20 }}>⚡</span>} title={t('Quick replies')} sub="Type / in a chat to use them" onClick={() => setSheet('qreplies')} right={chev} />
        <SettingRow icon={<span style={{ fontSize: 20 }}>📢</span>} title={t('Broadcast lists')} sub="One message to many friends" onClick={() => setSheet('broadcast')} right={chev} />
      </div>

      <div className="sc-set-group">
        <SettingRow icon={<BiShield />} title={t('Privacy')} sub="Last seen, photo, read receipts" onClick={() => setSheet('privacy')} right={chev} />
        <SettingRow icon={<BiShield />} title={t('2-step verification')} sub="Authenticator code when you log in" onClick={() => setSheet('twofa')} right={chev} />
        <SettingRow icon={<BiLock />} title={t('App lock')} sub={lockEnabled() ? 'PIN is on' : 'Off'} onClick={() => setSheet('lock')} right={chev} />
        <SettingRow icon={<BiDevices />} title={t('Logged-in devices')} onClick={() => setSheet('devices')} right={chev} />
        {me?.is_admin && <SettingRow icon={<BiShield />} title={t('Admin panel')} sub="Users, reports, groups and tools" onClick={() => setSheet('admin')} right={chev} />}
        <SettingRow icon={<BiBlock />} title={t('Blocked users')} sub={blockedUsers.length ? `${blockedUsers.length} blocked` : 'Nobody'} onClick={() => setSheet('blocked')} right={chev} />
      </div>

      <div className="sc-set-group">
        <SettingRow icon={<span style={{ fontSize: 20 }}>🌐</span>} title={t('Language')} sub={getLang() === 'ta' ? 'தமிழ்' : 'English'} onClick={() => setSheet('lang')} right={chev} />
        <SettingRow icon={<span style={{ fontSize: 20 }}>💾</span>} title={t('Storage')} sub="Media size, clear cache" onClick={() => setSheet('storage')} right={chev} />
        <SettingRow icon={<BiGift />} title="What's new" sub={hasUnseenUpdate() ? 'New: see what changed' : 'Details of every update'} onClick={() => setSheet('news')} right={chev} />
        <SettingRow icon={<BiExpand />} title={t('Display size')} sub={getUiScale() === 1 ? 'Default' : `${Math.round(getUiScale() * 100)}%`} onClick={() => setSheet('size')} right={chev} />
        <SettingRow icon={<BiPalette />} title={t('Appearance')} sub={(CHAT_THEMES[appTheme] || CHAT_THEMES.default).label} onClick={() => setSheet('theme')} right={chev} />
        <SettingRow icon={<span style={{ fontSize: 20 }}>🌙</span>} title={t('Quiet hours')} sub={getQuiet().on ? `${getQuiet().from} – ${getQuiet().to}` : 'Off'} onClick={() => setSheet('quiet')} right={chev} />
        <SettingRow icon={<BiBell />} title={t('Online alerts')} sub="A small pop-up when a friend comes online" right={<Toggle on={onlineAlerts} onChange={(v) => { setOnlineAlerts(v); setOnlineAlertsEnabled(v); }} label="Online alerts" />} />
        <SettingRow icon={<BiVolumeFull />} title={t('Sounds')} right={<Toggle on={sounds} onChange={(v) => { setSounds(v); setSoundsEnabled(v); }} label="Sounds" />} />
        {notifPerm !== 'unsupported' && (
          <SettingRow icon={<BiBell />} title={t('Notifications')} sub={notifPerm === 'granted' ? 'On' : 'Tap to allow'} onClick={notifPerm === 'granted' ? undefined : enableNotifications} />
        )}
      </div>

      <div className="sc-set-group">
        <SettingRow icon={<BiLogOut />} title={t('Log out')} onClick={doLogout} />
        <SettingRow icon={<BiTrash />} title={t('Delete my account')} sub="Erases everything. Cannot be undone." onClick={deleteAccount} danger />
      </div>
      <p style={{ textAlign: 'center', color: 'var(--sub)', fontSize: 12, margin: '18px 0 0' }}>Chatzy · Designed and built by Madhavan</p>

      {cropFile && <PhotoCropper T={T} file={cropFile} onCancel={() => setCropFile(null)} onDone={upload} />}
      {sheet === 'quick' && <QuickReactionSheet T={T} onClose={close} />}
      {sheet === 'ask' && <AskInbox T={T} onClose={close} ask={ask} />}
      {sheet === 'quiet' && <QuietSheet T={T} onClose={close} />}
      {sheet === 'bday' && <BirthdaySheet T={T} me={me} onClose={close} ask={ask} onDone={() => refresh && refresh()} />}
      {sheet === 'away' && <AwaySheet T={T} me={me} onClose={close} ask={ask} onDone={() => refresh && refresh()} />}
      {sheet === 'mood' && <MoodSheet T={T} me={me} onClose={close} ask={ask} onDone={() => refresh && refresh()} />}
      {sheet === 'twofa' && <TwoFactorSheet T={T} onClose={close} ask={ask} />}
      {sheet === 'broadcast' && <BroadcastSheet T={T} onClose={close} ask={ask} />}
      {sheet === 'storage' && <StorageSheet T={T} onClose={close} ask={ask} />}
      {sheet === 'qreplies' && <QuickRepliesSheet T={T} onClose={close} ask={ask} />}
      {sheet === 'lang' && <LanguageSheet T={T} onClose={close} />}
      {sheet === 'admin' && <React.Suspense fallback={null}><AdminPanel T={T} onClose={close} ask={ask} /></React.Suspense>}
      {sheet === 'accounts' && <AccountsSheet T={T} onClose={close} ask={ask} />}
      {viewPhoto && me?.profile_picture && <MediaViewer src={getPicUrl(me.profile_picture)} type="image" name={`${currentUsername}.jpg`} onClose={() => setViewPhoto(false)} />}
      {sheet === 'avatar' && <AvatarPicker T={T} ask={ask} onClose={close} onDone={() => { close(); refresh(); }} />}
      {sheet === 'privacy' && <PrivacySheet T={T} onClose={close} ask={ask} />}
      {sheet === 'devices' && <DevicesSheet T={T} onClose={close} ask={ask} />}
      {sheet === 'lock' && <LockSheet T={T} onClose={() => { close(); }} ask={ask} />}
      {sheet === 'starred' && <StarredSheet T={T} onClose={close} ask={ask} />}
      {sheet === 'blocked' && <BlockedSheet T={T} onClose={close} users={blockedUsers} onUnblock={doUnblock} />}
      {sheet === 'news' && <WhatsNewSheet T={T} onClose={close} />}
      {sheet === 'size' && <DisplaySizeSheet T={T} onClose={close} />}
      {sheet === 'theme' && <ThemeSheet T={T} onClose={close} appTheme={appTheme} onPick={changeAppTheme} />}
      {sheet === 'qr' && <QrSheet T={T} me={me} onClose={close} onAddUser={(u) => { close(); onAddUser(u); }} />}
    </div>
  );
}
