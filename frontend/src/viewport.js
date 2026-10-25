// Mobile viewport helpers
//  1. --app-height / --app-top : the REAL visible area (height shrinks and top moves when the keyboard opens),
//     so the chat header never slides off the top and there is never a blank strip above the keyboard.
//  2. html.kb-open : set while the on-screen keyboard is up (the composer then drops its bottom safe-area padding).
//  3. blocks pinch-zoom / double-tap zoom, because the app should behave like a native app.

export function setupViewport() {
  const root = document.documentElement;
  const vv = window.visualViewport;
  let baseline = window.innerHeight;       // tallest window height seen = the keyboard-closed height
  let settleTimer = null;

  const isTyping = () => {
    const el = document.activeElement;
    return !!el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT' || el.isContentEditable);
  };

  const apply = () => {
    const inner = window.innerHeight;
    if (inner > baseline) baseline = inner;
    const vvh = vv ? vv.height : inner;
    // Two ways a phone shows the keyboard:
    //  a) it shrinks the window itself (innerHeight drops)  -> innerHeight is the visible area
    //  b) it floats over the page (innerHeight stays tall)  -> visualViewport.height is the visible area
    // Trusting visualViewport alone left a big blank gap on some Android WebViews (it can lag or double count).
    const windowShrank = inner < baseline - 100;
    const h = windowShrank ? inner : vvh;
    // When the keyboard floats over the page, Chrome / WebView also PANS the visible area down so the
    // focused input stays in view (visualViewport.offsetTop > 0). A fixed screen at top:0 is then pushed
    // up and off, which hides the header and leaves a blank gap above the keyboard. Follow the pan.
    const top = vv ? Math.max(0, vv.offsetTop) : 0;
    root.style.setProperty('--app-height', `${Math.round(h)}px`);
    root.style.setProperty('--app-top', `${Math.round(top)}px`);
    root.classList.toggle('kb-open', isTyping() && h < baseline - 120);
    // the browser sometimes scrolls the whole page up when the keyboard opens - put it back
    if (window.scrollY !== 0) window.scrollTo(0, 0);
  };

  // The keyboard animates for ~300 ms and some WebViews report the final size late, so keep
  // re-measuring for a moment after anything that can open or close it.
  const settle = () => {
    apply();
    clearInterval(settleTimer);
    let n = 0;
    settleTimer = setInterval(() => { apply(); if (++n >= 12) clearInterval(settleTimer); }, 100);
  };

  apply();
  if (vv) {
    vv.addEventListener('resize', settle);
    vv.addEventListener('scroll', apply);
  }
  window.addEventListener('resize', settle);
  document.addEventListener('focusin', settle);
  document.addEventListener('focusout', settle);
  window.addEventListener('orientationchange', () => {
    baseline = 0;
    setTimeout(() => { baseline = window.innerHeight; settle(); }, 300);
  });

  // ---- no zoom ----
  const stop = (e) => e.preventDefault();
  document.addEventListener('gesturestart', stop, { passive: false });     // iOS pinch
  document.addEventListener('gesturechange', stop, { passive: false });
  document.addEventListener('touchmove', (e) => { if (e.touches && e.touches.length > 1) e.preventDefault(); }, { passive: false });
  document.addEventListener('wheel', (e) => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });  // ctrl + wheel zoom
  // double-tap zoom is turned off in CSS (touch-action: manipulation) so quick taps still work
}
