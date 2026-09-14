/**
 * Height of the area the app actually gets to draw in, published as the CSS
 * variable `--app-h`.
 *
 * As an iOS home-screen app with a black-translucent status bar, the layout
 * viewport comes up short of the screen by the status-bar inset (59 pt on a
 * Dynamic Island phone). Everything sized against it — `100dvh`,
 * `position: fixed; inset: 0` — stops that far above the bottom edge and
 * leaves a dead strip under the tab bar. The screen size is the truth there.
 */
function measure(): number {
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (!iosStandalone) return window.innerHeight;
  // iOS never swaps screen.width/height on rotation; the manifest locks portrait anyway.
  return Math.max(window.innerHeight, screen.height, screen.width);
}

export function appHeight(): number {
  return measure();
}

export function syncAppHeight(): void {
  const update = () => {
    document.documentElement.style.setProperty('--app-h', `${measure()}px`);
  };
  update();
  window.addEventListener('resize', update);
  window.addEventListener('orientationchange', update);
}
