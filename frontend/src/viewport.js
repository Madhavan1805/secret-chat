// Mobile viewport helpers
//  1. --app-height : always the REAL visible height (shrinks when the keyboard opens), so the
//     chat header never slides off the top of the screen while typing.
//  2. blocks pinch-zoom / double-tap zoom, because the app should behave like a native app.

export function setupViewport() {
  const root = document.documentElement;
  const vv = window.visualViewport;

  const apply = () => {
    const h = vv ? vv.height : window.innerHeight;
    root.style.setProperty('--app-height', `${Math.round(h)}px`);
    // the browser sometimes scrolls the whole page up when the keyboard opens - put it back
    if (window.scrollY !== 0) window.scrollTo(0, 0);
  };

  apply();
  if (vv) {
    vv.addEventListener('resize', apply);
    vv.addEventListener('scroll', apply);
  }
  window.addEventListener('resize', apply);
  window.addEventListener('orientationchange', () => setTimeout(apply, 250));

  // ---- no zoom ----
  const stop = (e) => e.preventDefault();
  document.addEventListener('gesturestart', stop, { passive: false });     // iOS pinch
  document.addEventListener('gesturechange', stop, { passive: false });
  document.addEventListener('touchmove', (e) => { if (e.touches && e.touches.length > 1) e.preventDefault(); }, { passive: false });
  document.addEventListener('wheel', (e) => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });  // ctrl + wheel zoom
  // double-tap zoom is turned off in CSS (touch-action: manipulation) so quick taps still work
}
