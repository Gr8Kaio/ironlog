/**
 * iOS home-screen web apps can start with a viewport 62 pt short of the
 * screen, leaving the fixed tab bar above a dead strip. The first scroll of
 * the document corrects it: a drag on the tab bar was enough on device. The
 * screens scroll in their own container, so the document never gets that
 * scroll on its own. This gives it one: 2 px down and back, then again a
 * little later in case iOS was still settling.
 */
function nudge(): void {
  const spacer = document.createElement('div');
  spacer.setAttribute('aria-hidden', 'true');
  spacer.style.cssText = `height:${window.innerHeight + 2}px;pointer-events:none;`;
  document.body.appendChild(spacer);
  window.scrollTo(0, 2);
  requestAnimationFrame(() => {
    window.scrollTo(0, 0);
    spacer.remove();
  });
}

export function fixIosViewportOnLaunch(): void {
  if ((navigator as Navigator & { standalone?: boolean }).standalone !== true) return;

  const settle = () => {
    nudge();
    window.setTimeout(nudge, 600);
  };

  if (document.readyState === 'complete') settle();
  else window.addEventListener('load', settle, { once: true });

  // Coming back from the app switcher can start short again.
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) settle();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') settle();
  });
}
