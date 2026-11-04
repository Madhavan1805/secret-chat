import React, { useState } from 'react';
import { BiCheck } from 'react-icons/bi';
import api from './api';
import { Sheet } from './ui';
import { AVATARS, AvatarArt, avatarFile } from './avatars';
import { getMe, errMsg } from './config';

// Pick a cartoon avatar. It becomes the profile picture (same as uploading a photo).
export default function AvatarPicker({ T, onClose, onDone, ask }) {
  const [pick, setPick] = useState(AVATARS[0].key);
  const [busy, setBusy] = useState(false);

  const use = async () => {
    setBusy(true);
    try {
      const file = await avatarFile(pick);
      const fd = new FormData();
      fd.append('profile_picture', file);
      await api.patch('users/update_profile/', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      await getMe(true);
      onDone();
    } catch (e) {
      ask({ type: 'alert', title: errMsg(e, 'Could not set the avatar') });
      setBusy(false);
    }
  };

  return (
    <Sheet T={T} title="Choose an avatar" onClose={onClose}>
      <div style={{ display: 'flex', justifyContent: 'center', margin: '4px 0 16px' }}>
        <AvatarArt k={pick} size={116} />
      </div>
      <div role="radiogroup" aria-label="Avatars" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, justifyItems: 'center' }}>
        {AVATARS.map((a) => {
          const on = pick === a.key;
          return (
            <button key={a.key} type="button" role="radio" aria-checked={on} aria-label={a.label} onClick={() => setPick(a.key)}
              style={{ position: 'relative', border: `3px solid ${on ? 'var(--accent)' : 'transparent'}`, borderRadius: '50%', padding: 2, background: 'none', lineHeight: 0, transition: 'transform .12s', transform: on ? 'scale(1.06)' : 'none' }}>
              <AvatarArt k={a.key} size={60} />
              {on && <span style={{ position: 'absolute', right: -2, bottom: -2, width: 20, height: 20, borderRadius: '50%', background: 'var(--accent)', color: '#161616', display: 'grid', placeItems: 'center', fontSize: 14 }}><BiCheck /></span>}
            </button>
          );
        })}
      </div>
      <button type="button" className="sc-btn" style={{ width: '100%', marginTop: 20 }} disabled={busy} onClick={use}>{busy ? 'Saving…' : 'Use this avatar'}</button>
    </Sheet>
  );
}
