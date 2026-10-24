import { useEffect, useRef } from 'react';

// The phone's back button / back swipe should close the sheet, popup or viewer that is open,
// not throw the user out of the app. Every overlay pushes one history entry while it is open;
// "back" then pops that entry and closes the top overlay.
//
//   useBackClose(isOpen, () => setOpen(false));

const stack = [];          // open overlays, the last one is on top
let listening = false;
let counter = 0;
let ignoreCount = 0;       // popstate events caused by our own history.back()
let ignoreUntil = 0;

function onPop() {
  if (ignoreCount > 0 && Date.now() < ignoreUntil) { ignoreCount -= 1; return; }
  ignoreCount = 0;
  const top = stack.pop();
  if (top) top.close();
}

export function useBackClose(open, onClose) {
  const cb = useRef(onClose);
  cb.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    if (!listening) { window.addEventListener('popstate', onPop); listening = true; }
    counter += 1;
    const id = `overlay-${counter}`;
    const entry = { id, close: () => { if (cb.current) cb.current(); } };
    stack.push(entry);
    try { window.history.pushState({ ...(window.history.state || {}), __overlay: id }, ''); } catch (e) { /* ignore */ }

    return () => {
      const i = stack.indexOf(entry);
      if (i === -1) return;                       // it was closed with the back button: the entry is already gone
      stack.splice(i, 1);                         // closed from inside the app (X button, tap outside, saved...)
      if (window.history.state && window.history.state.__overlay === id) {
        ignoreCount += 1;
        ignoreUntil = Date.now() + 800;
        window.history.back();                    // remove our entry so the next back press works normally
      }
    };
  }, [open]);
}
