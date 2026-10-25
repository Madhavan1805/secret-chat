import React, { useEffect } from 'react';
import { BiShow, BiHide } from 'react-icons/bi';
import { passwordStrength } from './auth';

/* Shared shell for Login / Register / Forgot password.
   Self-contained styles (no Bootstrap needed). Same maroon + gold as Home and ChatView. */

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Great+Vibes&display=swap');

.au-root{
  --wine:#0F0B14; --wine-deep:#0A0710; --gold:#FF6477; --gold-d:#E8405A; --ivory:#F6F0FB;
  --mute:rgba(246,240,251,.66); --line:rgba(246,240,251,.14); --err:#ff9b8f; --ok:#6ee7a0;
  width:100%; min-height:100vh; min-height:100dvh; box-sizing:border-box; padding:28px 16px 40px;
  display:flex; justify-content:center;
  background:radial-gradient(70% 50% at 10% 0%, rgba(232,64,90,.28), transparent 70%), radial-gradient(60% 50% at 100% 100%, rgba(122,92,255,.16), transparent 70%), var(--wine);
  color:var(--ivory); font-family:'Instrument Sans','Noto Sans Tamil',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;
}
.au-root *{box-sizing:border-box}
.au-wrap{
  width:100%; max-width:440px; display:grid; gap:26px; align-content:start;
  grid-template-areas:"brand" "card" "sign";
}

/* ---- brand ---- */
.au-brand{grid-area:brand; text-align:center}
.au-logo{display:flex; align-items:center; justify-content:center; gap:12px; line-height:1}
.au-logo{align-items:baseline; gap:0}
.au-logo-a{font-family:'Fredoka','Bricolage Grotesque',system-ui,sans-serif; font-weight:700; font-size:2.6rem; letter-spacing:-.01em}
.au-logo-b{display:block; font-family:'Fredoka','Bricolage Grotesque',system-ui,sans-serif; font-weight:700; font-size:2.6rem; margin-left:0; color:var(--gold); text-shadow:0 0 14px rgba(255,100,119,.45)}
.au-seal-intro{animation:au-stamp .6s .1s cubic-bezier(.2,.8,.2,1) both}
@keyframes au-stamp{0%{transform:scale(1.5) rotate(14deg);opacity:0}60%{transform:scale(.92) rotate(-3deg);opacity:1}100%{transform:none}}
.au-tag{display:none; margin:16px 0 0; max-width:28ch; color:var(--mute); font-size:1.08rem; line-height:1.6}

/* ---- card ---- */
.au-card{
  grid-area:card; align-self:start; padding:28px 24px 24px; border-radius:30px;
  background:#1B1424;
  border:1px solid var(--line); box-shadow:0 24px 60px rgba(0,0,0,.35);
}
.au-h{font-family:'Bricolage Grotesque','Noto Sans Tamil',system-ui,sans-serif; font-weight:600; font-size:1.7rem; line-height:1.2; margin:0 0 8px}
.au-sub{margin:0 0 22px; color:var(--mute); font-size:.95rem; line-height:1.55}

/* ---- fields ---- */
.au-field{margin-bottom:14px}
.au-label{display:block; margin-bottom:6px; font-size:.86rem; font-weight:500}
.au-input-wrap{position:relative; display:flex; align-items:center}
.au-ico{position:absolute; left:13px; font-size:1.15rem; color:var(--gold); opacity:.85; pointer-events:none}
.au-input{
  width:100%; height:50px; padding:0 46px 0 42px; border-radius:18px; font-size:1rem; outline:none;
  color:var(--ivory); background:#261C33; border:1px solid transparent;
  transition:border-color .15s, box-shadow .15s;
}
.au-input::placeholder{color:rgba(253,251,247,.5)}
.au-input:focus-visible{border-color:var(--gold); box-shadow:0 0 0 3px rgba(255,100,119,.25)}
.au-input[aria-invalid="true"]{border-color:var(--err)}
.au-eye{
  position:absolute; right:5px; width:36px; height:36px; display:grid; place-items:center; border:0; border-radius:8px;
  background:transparent; color:var(--mute); font-size:1.25rem; cursor:pointer;
}
.au-eye:hover{color:var(--gold)}
.au-eye:focus-visible{outline:2px solid var(--gold)}
.au-msg{min-height:1.2em; margin:6px 2px 0; font-size:.82rem; line-height:1.4; color:var(--mute)}
.au-msg.err{color:var(--err)}
.au-msg.ok{color:var(--ok)}

.au-seg{display:grid; grid-template-columns:1fr 1fr; gap:4px; padding:4px; margin-bottom:14px; border-radius:12px;
  background:rgba(0,0,0,.25); border:1px solid var(--line)}
.au-seg button{height:38px; border:0; border-radius:9px; background:transparent; color:var(--mute);
  font-size:.92rem; font-weight:600; cursor:pointer}
.au-seg button[aria-pressed="true"]{background:rgba(255,100,119,.16); color:var(--gold); box-shadow:inset 0 0 0 1px var(--line)}
.au-seg button:focus-visible{outline:2px solid var(--gold)}

.au-meter{display:grid; grid-template-columns:repeat(4,1fr); gap:4px; margin-top:8px}
.au-meter i{height:4px; border-radius:2px; background:rgba(255,255,255,.14)}
.au-meter i.l1{background:#ff9b8f} .au-meter i.l2{background:#ffc46b}
.au-meter i.l3{background:#d8e66b} .au-meter i.l4{background:var(--ok)}

/* ---- buttons, links, alerts ---- */
.au-btn{
  width:100%; height:52px; margin-top:6px; border:0; border-radius:26px; cursor:pointer;
  font-size:1.02rem; font-weight:700; color:#fff; font-family:'Bricolage Grotesque','Noto Sans Tamil',system-ui,sans-serif;
  background:linear-gradient(150deg,#E8405A,#A3153A); box-shadow:0 10px 24px rgba(160,20,50,.35); transition:filter .15s, transform .08s;
}
.au-btn:hover:not(:disabled){filter:brightness(1.07)}
.au-btn:active:not(:disabled){transform:translateY(1px)}
.au-btn:disabled{opacity:.6; cursor:not-allowed}
.au-btn:focus-visible{outline:3px solid #fff; outline-offset:2px}
.au-row{display:flex; justify-content:flex-end; margin:-4px 0 14px; font-size:.88rem}
.au-split{display:flex; justify-content:space-between; gap:12px; margin-top:16px; font-size:.88rem}
.au-link{padding:0; border:0; background:none; color:var(--gold); font:inherit; font-weight:500; text-decoration:none; cursor:pointer}
.au-link:hover:not(:disabled){text-decoration:underline}
.au-link:disabled{color:var(--mute); cursor:default}
.au-link:focus-visible{outline:2px solid var(--gold); outline-offset:3px; border-radius:3px}
.au-alt{margin:20px 0 0; text-align:center; color:var(--mute); font-size:.92rem}
.au-alert{margin-bottom:16px; padding:10px 12px; border:1px solid; border-radius:10px; font-size:.9rem; line-height:1.45}
.au-alert.err{background:rgba(255,155,143,.1); border-color:rgba(255,155,143,.4); color:#ffd7d1}
.au-alert.ok{background:rgba(110,231,160,.1); border-color:rgba(110,231,160,.4); color:#cdf8de}

/* ---- the maker's mark ---- */
.au-sign{grid-area:sign; display:flex; align-items:center; justify-content:center; gap:14px}
.au-seal{
  flex:none; width:46px; height:46px; display:grid; place-items:center; border-radius:50%;
  font-family:'Bricolage Grotesque','Noto Sans Tamil',system-ui,sans-serif; font-weight:700; font-size:1.3rem; color:#fff;
  background:radial-gradient(circle at 32% 26%, #FF8795 0%, #E03A50 52%, #8E1230 100%);
  box-shadow:0 0 0 3px rgba(15,11,20,.95), 0 0 0 4.5px rgba(255,100,119,.5), 0 8px 20px rgba(0,0,0,.45);
}
.au-sign-by{font-size:.8rem; color:var(--mute)}
.au-sign-name{
  display:inline-block; padding:0 .25em .08em 0; line-height:1.15; font-size:2.7rem;
  font-family:'Great Vibes','Apple Chancery','URW Chancery L','Z003',cursive;
  color:var(--gold); text-shadow:0 0 16px rgba(255,100,119,.4);
  transform:rotate(-2deg); transform-origin:left center;
  clip-path:inset(-15% 100% -15% 0); animation:au-write 1.5s .35s cubic-bezier(.4,.1,.2,1) forwards;
}
@keyframes au-write{to{clip-path:inset(-15% -5% -15% 0)}}
@media (prefers-reduced-motion:reduce){ .au-sign-name{animation:none; clip-path:none} }

/* ---- desktop: brand + maker's mark on the left, form on the right ---- */
@media (min-width:900px){
  .au-root{align-items:center}
  .au-wrap{
    max-width:1040px; min-height:600px; column-gap:88px; row-gap:40px; grid-template-columns:1fr 440px;
    grid-template-rows:1fr auto; grid-template-areas:"brand card" "sign card";
  }
  .au-brand{text-align:left; align-self:start; padding-top:12px}
  .au-logo{justify-content:flex-start}
  .au-logo-a{font-size:5rem}
  .au-logo-b{font-size:5rem; margin-left:0}
  .au-tag{display:block}
  .au-card{align-self:center}
  .au-sign{justify-content:flex-start; gap:18px; align-self:end}
  .au-seal{width:58px; height:58px; font-size:1.65rem}
  .au-sign-name{font-size:3.8rem}
}
`;

export function Signature() {
  return (
    <div className="au-sign" aria-label="Designed and built by Madhavan">
      <span className="au-seal" aria-hidden="true">M</span>
      <div>
        <div className="au-sign-by">Designed and built by</div>
        <span className="au-sign-name" aria-hidden="true">Madhavan</span>
      </div>
    </div>
  );
}

export default function AuthLayout({ title, subtitle, children }) {
  useEffect(() => { document.title = `${title} - Chatzy`; }, [title]);
  return (
    <div className="au-root">
      <style>{CSS}</style>
      <div className="au-wrap">
        <header className="au-brand">
          <div className="au-logo">
            <span className="au-logo-a">Chat</span>
            <span className="au-logo-b">zy</span>
          </div>
          <p className="au-tag">Private conversations with the people you choose to add. Nothing else.</p>
        </header>

        <main className="au-card">
          <h1 className="au-h">{title}</h1>
          {subtitle && <p className="au-sub">{subtitle}</p>}
          {children}
        </main>

        <Signature />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- form parts */
export function Field({ id, label, icon: Icon, message, tone, right, inputRef, children, ...input }) {
  const msgId = `${id}-msg`;
  return (
    <div className="au-field">
      <label className="au-label" htmlFor={id}>{label}</label>
      <div className="au-input-wrap">
        {Icon && <Icon className="au-ico" aria-hidden="true" />}
        <input
          id={id}
          ref={inputRef}
          className="au-input"
          aria-invalid={tone === 'err' ? 'true' : undefined}
          aria-describedby={message ? msgId : undefined}
          {...input}
        />
        {right}
      </div>
      <div id={msgId} className={`au-msg ${tone || ''}`} aria-live="polite">{message}</div>
      {children}
    </div>
  );
}

export function PasswordField({ show, onToggle, ...props }) {
  return (
    <Field
      {...props}
      type={show ? 'text' : 'password'}
      right={(
        <button
          type="button"
          className="au-eye"
          onClick={onToggle}
          aria-label={show ? 'Hide password' : 'Show password'}
          aria-pressed={show}
        >
          {show ? <BiHide /> : <BiShow />}
        </button>
      )}
    />
  );
}

export function StrengthMeter({ password }) {
  const { score } = passwordStrength(password);
  return (
    <div className="au-meter" aria-hidden="true">
      {[1, 2, 3, 4].map((n) => <i key={n} className={score >= n ? `l${score}` : ''} />)}
    </div>
  );
}

export function Alert({ tone = 'err', children }) {
  return <div className={`au-alert ${tone}`} role={tone === 'err' ? 'alert' : 'status'}>{children}</div>;
}

export function SubmitButton({ busy, children }) {
  return <button type="submit" className="au-btn" disabled={busy}>{busy ? 'Please wait...' : children}</button>;
}
