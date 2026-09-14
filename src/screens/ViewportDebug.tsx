import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Card, Screen, TopBar } from '../components/ui';
import { ChevronLeft } from '../components/icons';
import { appHeight } from '../lib/viewport';

// Reads a CSS length the way the browser resolves it, e.g. `100dvh` or an env() inset.
function cssLength(prop: 'height' | 'padding-top', value: string): number {
  const el = document.createElement('div');
  el.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;';
  el.style.setProperty(prop, value);
  document.body.appendChild(el);
  const px = prop === 'height' ? el.getBoundingClientRect().height : parseFloat(getComputedStyle(el).paddingTop);
  el.remove();
  return Math.round(px * 10) / 10;
}

function measure(): [string, string | number][] {
  const vv = window.visualViewport;
  const nav = navigator as Navigator & { standalone?: boolean };
  return [
    ['version', __APP_VERSION__],
    ['standalone', String(nav.standalone)],
    ['screen', `${screen.width} x ${screen.height}`],
    ['innerHeight', window.innerHeight],
    ['outerHeight', window.outerHeight],
    ['clientHeight', document.documentElement.clientHeight],
    ['visualViewport h', vv ? Math.round(vv.height) : '-'],
    ['visualViewport top', vv ? Math.round(vv.offsetTop) : '-'],
    ['100dvh', cssLength('height', '100dvh')],
    ['100lvh', cssLength('height', '100lvh')],
    ['100svh', cssLength('height', '100svh')],
    ['safe top', cssLength('padding-top', 'env(safe-area-inset-top)')],
    ['safe bottom', cssLength('padding-top', 'env(safe-area-inset-bottom)')],
    ['--app-h', appHeight()],
    ['doc scrollHeight', document.scrollingElement?.scrollHeight ?? '-'],
    ['dpr', window.devicePixelRatio],
  ];
}

/**
 * Screenshot aid for the iOS home-screen viewport. The three coloured bars
 * show which kind of positioning can still paint in the bottom strip.
 */
export function ViewportDebug() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<[string, string | number][]>([]);

  useEffect(() => {
    // After the bars mount, so doc scrollHeight includes the DOC bar.
    const id = requestAnimationFrame(() => setRows(measure()));
    return () => cancelAnimationFrame(id);
  }, []);

  const h = appHeight();
  const bar = 'z-[100] flex h-14 items-center justify-center text-xs font-bold text-white';

  return (
    <Screen>
      <TopBar
        title="Viewport"
        left={
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="-ml-2 flex size-10 items-center justify-center rounded-lg text-muted active:bg-raised"
          >
            <ChevronLeft className="size-5" />
          </button>
        }
      />
      <Card className="p-3">
        {rows.map(([k, v]) => (
          <div key={k} className="tabular flex justify-between py-0.5 text-sm">
            <span className="text-muted">{k}</span>
            <span>{v}</span>
          </div>
        ))}
      </Card>
      {createPortal(
        <>
          <div className={`${bar} fixed left-0 w-1/3 bg-red-600`} style={{ top: h - 56 }}>
            FIXED
          </div>
          <div className={`${bar} absolute left-1/3 w-1/3 bg-green-600`} style={{ top: h - 56 }}>
            DOC
          </div>
          <div className={`${bar} fixed right-0 bottom-0 w-1/3 bg-blue-600`}>BOTTOM-0</div>
        </>,
        document.body,
      )}
    </Screen>
  );
}
