/**
 * Height of the area the app actually gets to draw in, published as the CSS
 * variable `--app-h`.
 *
 * As an iOS home-screen app with a black-translucent status bar, innerHeight,
 * 100dvh and 100svh come up short of the screen by the status-bar inset
 * (measured: 812 of 874 pt, 62 pt short). Anything sized by them leaves a
 * dead strip under the tab bar. `position: fixed; bottom: 0` still lands on
 * the real bottom edge; the screen size is the truth for heights.
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
