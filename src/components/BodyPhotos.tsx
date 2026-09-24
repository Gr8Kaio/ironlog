import { useEffect, useRef, useState } from 'react';
import type { BodyMetric, BodyPhoto } from '../db/types';
import { fmtKg } from '../lib/calc';
import { formatDate } from '../lib/dates';
import { cx } from './ui';
import { CameraIcon, ChevronLeft, ChevronRight } from './icons';

/** An object URL for a stored blob, revoked when the blob changes or the view goes away. */
export function useBlobUrl(blob: Blob | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return;
    }
    const next = URL.createObjectURL(blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [blob]);
  return url;
}

export function PhotoThumb({
  blob,
  className,
  onClick,
  children,
}: {
  blob: Blob;
  className?: string;
  onClick?: () => void;
  children?: React.ReactNode;
}) {
  const url = useBlobUrl(blob);
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx('relative overflow-hidden rounded-xl bg-raised active:opacity-80', className)}
    >
      {url ? <img src={url} alt="" className="size-full object-cover" /> : null}
      {children}
    </button>
  );
}

/**
 * The file input behind a normal button. No `capture` attribute on purpose:
 * without it iOS offers both the camera and the photo library, and a mirror
 * shot taken earlier with the camera app is as good as one taken here.
 */
export function AddPhotoButton({ onPick, className }: { onPick: (files: File[]) => void; className?: string }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        type="button"
        onClick={() => input.current?.click()}
        className={cx(
          'flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-line text-xs text-muted active:bg-raised',
          className,
        )}
      >
        <CameraIcon className="size-5" />
        Add photo
      </button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          if (files.length > 0) onPick(files);
        }}
      />
    </>
  );
}

/**
 * Full-screen look at one photo, stepping through the rest in date order.
 * "Compare" puts the oldest photo next to this one, which is the question a
 * progress photo is there to answer.
 */
export function PhotoViewer({
  photos,
  startId,
  metricsById,
  onClose,
}: {
  photos: BodyPhoto[];
  startId: string;
  metricsById: Map<string, BodyMetric>;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(() => Math.max(0, photos.findIndex((p) => p.id === startId)));
  const [compare, setCompare] = useState(false);
  const photo = photos[index];
  const first = photos[0];
  const canCompare = photos.length > 1 && photo && first && photo.id !== first.id;
  const touchX = useRef<number | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1));
      if (e.key === 'ArrowRight') setIndex((i) => Math.min(photos.length - 1, i + 1));
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose, photos.length]);

  if (!photo) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black pt-safe pb-safe"
      onTouchStart={(e) => {
        touchX.current = e.touches[0].clientX;
      }}
      onTouchEnd={(e) => {
        if (touchX.current === null) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        touchX.current = null;
        if (Math.abs(dx) < 50) return;
        setIndex((i) => (dx < 0 ? Math.min(photos.length - 1, i + 1) : Math.max(0, i - 1)));
      }}
    >
      <div className="flex items-center gap-2 px-3 py-2 text-white">
        <button
          type="button"
          onClick={onClose}
          className="-ml-1 flex size-10 items-center justify-center rounded-lg active:bg-white/10"
          aria-label="Close"
        >
          <ChevronLeft className="size-5" />
        </button>
        <div className="min-w-0 flex-1 text-sm">
          <Caption photo={photo} metric={metricsById.get(photo.bodyMetricId)} />
        </div>
        {canCompare ? (
          <button
            type="button"
            onClick={() => setCompare((v) => !v)}
            className={cx(
              'rounded-lg px-3 py-2 text-xs font-semibold',
              compare ? 'bg-white text-black' : 'bg-white/10 text-white',
            )}
          >
            Compare
          </button>
        ) : null}
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center gap-1 px-1">
        {compare && canCompare ? (
          <>
            <Side photo={first} metric={metricsById.get(first.bodyMetricId)} />
            <Side photo={photo} metric={metricsById.get(photo.bodyMetricId)} />
          </>
        ) : (
          <FullImage blob={photo.blob} />
        )}
      </div>

      <div className="flex items-center justify-between px-3 py-3 text-white">
        <button
          type="button"
          disabled={index === 0}
          onClick={() => setIndex((i) => i - 1)}
          className="flex size-11 items-center justify-center rounded-lg active:bg-white/10 disabled:opacity-30"
          aria-label="Older"
        >
          <ChevronLeft className="size-5" />
        </button>
        <span className="tabular text-xs text-white/60">
          {index + 1} / {photos.length}
        </span>
        <button
          type="button"
          disabled={index === photos.length - 1}
          onClick={() => setIndex((i) => i + 1)}
          className="flex size-11 items-center justify-center rounded-lg active:bg-white/10 disabled:opacity-30"
          aria-label="Newer"
        >
          <ChevronRight className="size-5" />
        </button>
      </div>
    </div>
  );
}

function Caption({ photo, metric }: { photo: BodyPhoto; metric?: BodyMetric }) {
  return (
    <>
      <span className="font-semibold">{formatDate(photo.localDate)}</span>
      {metric?.weightKg != null ? <span className="text-white/60"> · {fmtKg(metric.weightKg)} kg</span> : null}
    </>
  );
}

function FullImage({ blob }: { blob: Blob }) {
  const url = useBlobUrl(blob);
  return url ? <img src={url} alt="" className="max-h-full max-w-full object-contain" /> : null;
}

function Side({ photo, metric }: { photo: BodyPhoto; metric?: BodyMetric }) {
  const url = useBlobUrl(photo.blob);
  return (
    <div className="flex h-full min-w-0 flex-1 flex-col items-center justify-center gap-2">
      {url ? <img src={url} alt="" className="max-h-[85%] max-w-full object-contain" /> : null}
      <div className="text-center text-xs text-white">
        <Caption photo={photo} metric={metric} />
      </div>
    </div>
  );
}
