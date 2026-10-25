import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Seal } from './ui';
import { resolveTheme, getAppTheme, themeVars } from './theme';
import { lockEnabled, shieldEnabled, lockDelaySeconds, checkPin, checkDecoy, decoyEnabled, LOCK_EVENT } from './appLock';
import DecoyApp from './DecoyApp';

// Keypad used for unlocking and for choosing a new PIN.
export function PinPad({ title, hint, onComplete, error, resetKey }) {
  const [pin, setPin] = useState('');
  const [shake, setShake] = useState(false);
  useEffect(() => { setPin(''); }, [resetKey]);
  useEffect(() => {
    if (!error) return undefined;
    setShake(true); setPin('');
    const t = setTimeout(() => setShake(false), 420);
    return () => clearTimeout(t);
  }, [error]);

  const press = (d) => {
    if (pin.length >= 4) return;
    const next = pin + d;
    setPin(next);
    if (next.length === 4) setTimeout(() => onComplete(next), 120);
  };
  useEffect(() => {
    const onKey = (e) => {
      if (/^[0-9]$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') setPin((p) => p.slice(0, -1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <>
      <Seal size={84} keyhole />
      <h1>{title}</h1>
      <p>{hint}</p>
      <div className={`sc-pin${shake ? ' shake' : ''}`} aria-label={`${pin.length} of 4 digits entered`}>
        {[0, 1, 2, 3].map((i) => <i key={i} className={i < pin.length ? 'f' : ''} />)}
      </div>
      <div className="sc-pad">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => <button key={d} type="button" onClick={() => press(d)}>{d}</button>)}
        <button type="button" className="blank" tabIndex={-1} aria-hidden="true">0</button>
        <button type="button" onClick={() => press('0')}>0</button>
        <button type="button" aria-label="Delete digit" onClick={() => setPin((p) => p.slice(0, -1))}>⌫</button>
      </div>
    </>
  );
}

// Wraps the whole app: locks after the app has been in the background, and hides the screen in the app switcher.
export default function LockGate({ children }) {
  const [locked, setLocked] = useState(() => lockEnabled());
  const [shielded, setShielded] = useState(false);
  const [err, setErr] = useState(0);
  const [decoy, setDecoy] = useState(false);          // the decoy PIN was used: show the empty fake app
  const hiddenAt = useRef(0);
  const T = resolveTheme(getAppTheme());

  const sync = useCallback(() => { if (!lockEnabled()) setLocked(false); }, []);
  useEffect(() => {
    window.addEventListener(LOCK_EVENT, sync);
    return () => window.removeEventListener(LOCK_EVENT, sync);
  }, [sync]);

  useEffect(() => {
    const onVis = () => {
      if (document.hidden) {
        hiddenAt.current = Date.now();
        if (shieldEnabled()) setShielded(true);
      } else {
        setShielded(false);
        if (lockEnabled() && hiddenAt.current && (Date.now() - hiddenAt.current) / 1000 >= lockDelaySeconds()) setLocked(true);
        hiddenAt.current = 0;
      }
    };
    const onBlur = () => { if (shieldEnabled()) setShielded(true); };
    const onFocus = () => setShielded(false);
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  const tryPin = async (pin) => {
    if (await checkPin(pin)) { setDecoy(false); setLocked(false); setErr(0); return; }
    if (decoyEnabled() && await checkDecoy(pin)) { setDecoy(true); setLocked(false); setErr(0); return; }
    setErr((n) => n + 1);
  };

  return (
    <>
      {decoy && !locked ? <DecoyApp T={T} /> : children}
      {shielded && !locked && <div className="sc-shield" style={themeVars(T)}><Seal size={96} keyhole /></div>}
      {locked && (
        <div className="sc-lock" style={themeVars(T)} role="dialog" aria-label="App locked">
          <PinPad title="Chatzy is locked" hint="Enter your 4-digit PIN" onComplete={tryPin} error={err} />
        </div>
      )}
    </>
  );
}
