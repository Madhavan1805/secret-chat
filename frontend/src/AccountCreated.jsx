import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';

/* Full-screen "account created" celebration: a drawn check mark, confetti and a bouncing card.
   Shown by Register after a successful sign-up; the button (or 3.5 s later) goes to the login page. */
const CSS = `
.ac-wrap{position:fixed; inset:0; z-index:10050; display:grid; place-items:center; padding:20px; background:rgba(10,7,16,.82); backdrop-filter:blur(6px); animation:ac-fade .3s both; overflow:hidden}
.ac-card{position:relative; width:100%; max-width:340px; padding:34px 24px 24px; border-radius:30px; text-align:center; color:#F6F0FB; background:#1B1424; border:1px solid rgba(246,240,251,.14); box-shadow:0 30px 80px rgba(0,0,0,.55); animation:ac-pop .6s cubic-bezier(.2,1.2,.3,1) both; box-sizing:border-box}
.ac-badge{width:96px; height:96px; margin:0 auto 18px; border-radius:50%; display:grid; place-items:center; background:radial-gradient(circle at 32% 26%, #FF8795 0%, #E03A50 55%, #8E1230 100%); animation:ac-ring 1.6s .5s ease-out 1; box-shadow:0 0 0 0 rgba(255,100,119,.55)}
.ac-badge svg{width:52px; height:52px}
.ac-tick{fill:none; stroke:#fff; stroke-width:6; stroke-linecap:round; stroke-linejoin:round; stroke-dasharray:60; stroke-dashoffset:60; animation:ac-draw .55s .45s cubic-bezier(.5,0,.2,1) forwards}
.ac-title{margin:0 0 6px; font-family:'Bricolage Grotesque','Noto Sans Tamil',system-ui,sans-serif; font-weight:700; font-size:1.55rem; animation:ac-up .5s .7s both}
.ac-sub{margin:0 0 20px; color:rgba(246,240,251,.7); font-size:.95rem; line-height:1.5; animation:ac-up .5s .85s both}
.ac-name{color:#FF6477; font-weight:700}
.ac-btn{width:100%; height:50px; border:0; border-radius:26px; cursor:pointer; font-size:1rem; font-weight:700; color:#fff; background:linear-gradient(150deg,#E8405A,#A3153A); box-shadow:0 10px 24px rgba(160,20,50,.35); animation:ac-up .5s 1s both}
.ac-btn:focus-visible{outline:3px solid #fff; outline-offset:2px}
.ac-bar{height:3px; margin-top:14px; border-radius:2px; background:rgba(255,255,255,.12); overflow:hidden}
.ac-bar i{display:block; height:100%; background:#FF6477; transform-origin:left; animation:ac-bar 3.5s 1s linear forwards; transform:scaleX(0)}
.ac-conf{position:absolute; top:-10px; width:9px; height:14px; border-radius:2px; opacity:0; animation:ac-fall linear forwards; pointer-events:none}
@keyframes ac-fade{from{opacity:0}}
@keyframes ac-pop{0%{transform:scale(.6) translateY(30px); opacity:0}100%{transform:none; opacity:1}}
@keyframes ac-draw{to{stroke-dashoffset:0}}
@keyframes ac-ring{0%{box-shadow:0 0 0 0 rgba(255,100,119,.55)}100%{box-shadow:0 0 0 38px rgba(255,100,119,0)}}
@keyframes ac-up{from{opacity:0; transform:translateY(12px)}to{opacity:1; transform:none}}
@keyframes ac-bar{to{transform:scaleX(1)}}
@keyframes ac-fall{0%{transform:translateY(0) rotate(0); opacity:1}100%{transform:translateY(105vh) rotate(var(--r)); opacity:.9}}
@media (prefers-reduced-motion:reduce){.ac-wrap *,.ac-card,.ac-badge{animation-duration:.01s!important; animation-delay:0s!important} .ac-conf{display:none} .ac-tick{stroke-dashoffset:0}}
`;
const COLORS = ['#FF6477', '#FFC46B', '#6EE7A0', '#7A5CFF', '#F6F0FB', '#4FC3F7'];
const PIECES = Array.from({ length: 36 }, (_, i) => ({
  left: (i * 97) % 100, delay: ((i * 37) % 10) / 10 * 0.9 + 0.35, dur: 2.2 + ((i * 53) % 10) / 10 * 1.6,
  color: COLORS[i % COLORS.length], r: ((i % 2 ? 1 : -1) * (300 + (i * 29) % 400)) + 'deg',
}));

export default function AccountCreated({ username, onContinue }) {
  useEffect(() => {
    const t = setTimeout(onContinue, 4500);
    return () => clearTimeout(t);
  }, [onContinue]);
  return createPortal(
    <div className="ac-wrap" role="dialog" aria-modal="true" aria-label="Account created">
      <style>{CSS}</style>
      {PIECES.map((p, i) => (
        <span key={i} className="ac-conf" style={{ left: `${p.left}%`, background: p.color, animationDelay: `${p.delay}s`, animationDuration: `${p.dur}s`, '--r': p.r }} />
      ))}
      <div className="ac-card">
        <div className="ac-badge"><svg viewBox="0 0 52 52" aria-hidden="true"><path className="ac-tick" d="M13 27 l9 9 l17 -19" /></svg></div>
        <h2 className="ac-title">Account created!</h2>
        <p className="ac-sub">Welcome to Chatzy, <span className="ac-name">{username}</span>.<br />Now log in to start chatting.</p>
        <button type="button" className="ac-btn" onClick={onContinue} autoFocus>Log in</button>
        <div className="ac-bar"><i /></div>
      </div>
    </div>,
    document.body,
  );
}
