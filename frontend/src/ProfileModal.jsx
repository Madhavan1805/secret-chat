import React, { useState } from 'react';
import { BiX, BiPhoneCall, BiVideo } from 'react-icons/bi';
import Avatar from './Avatar';
import { useBackClose } from './backClose';
import MediaViewer from './MediaViewer';
import { getPicUrl, lastSeenText, startCall } from './config';

// A friend's profile: photo, name, bio, online / last seen, quick call buttons.
// (phone number and other private fields are intentionally NOT shown)
export default function ProfileModal({ user, name, T, online, onClose }) {
  useBackClose(true, onClose);
  const [photo, setPhoto] = useState(false);
  const pic = getPicUrl(user?.profile_picture);
  const status = online ? '● Online' : (user?.last_seen ? lastSeenText(user.last_seen) : 'Offline');

  const call = (callType) => {
    onClose();
    if (user?.id) startCall({ friendId: user.id, name, callType });
  };

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: 'var(--app-height, 100dvh)', zIndex: 9400, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="position-relative text-center"
        style={{ width: '100%', maxWidth: 340, background: T.light ? '#fff' : (T.raised || '#261C33'), color: T.light ? '#1f2937' : '#fff', border: `1px solid ${T.accent}`, borderRadius: 28, padding: '28px 20px 20px' }}
      >
        <button type="button" className="btn p-0 border-0 position-absolute" style={{ top: 10, right: 12, color: 'inherit' }} onClick={onClose} title="Close"><BiX size={26} /></button>

        <div className="d-flex justify-content-center mb-3" style={{ cursor: pic ? 'zoom-in' : 'default' }} onClick={() => pic && setPhoto(true)}>
          <Avatar src={user?.profile_picture} name={name} size={110} T={T} online={online} />
        </div>

        <h5 className="fw-bold mb-1">{name}</h5>
        <div className="small mb-3" style={{ color: online ? '#22c55e' : undefined, opacity: online ? 1 : 0.65 }}>{status}</div>

        <div className="text-start px-3 py-2 mb-3" style={{ background: 'rgba(128,128,128,0.15)', borderRadius: 12 }}>
          <div className="small" style={{ color: T.accent, fontWeight: 600 }}>About</div>
          <div style={{ fontSize: 14, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{user?.bio || 'No bio added.'}</div>
        </div>

        <div className="d-flex gap-2 justify-content-center">
          <button type="button" className="btn btn-sm rounded-pill px-3 d-flex align-items-center gap-1" style={{ border: `1px solid ${T.accent}`, color: 'inherit' }} onClick={() => call('audio')}>
            <BiPhoneCall /> Voice
          </button>
          <button type="button" className="btn btn-sm rounded-pill px-3 d-flex align-items-center gap-1" style={{ border: `1px solid ${T.accent}`, color: 'inherit' }} onClick={() => call('video')}>
            <BiVideo /> Video
          </button>
        </div>
      </div>

      {photo && pic && <MediaViewer src={pic} type="image" name={`${name}.jpg`} onClose={() => setPhoto(false)} />}
    </div>
  );
}
