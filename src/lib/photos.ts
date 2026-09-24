import { db, newId } from '../db/db';
import type { BodyPhoto } from '../db/types';

/**
 * Long edge of a stored photo. Enough to see a change in the mirror a month
 * later on a phone screen, and it keeps each one near 150 KB instead of the
 * 3-4 MB a camera hands over.
 */
const MAX_EDGE = 1440;
const QUALITY = 0.82;

/**
 * Downscales and re-encodes as JPEG.
 *
 * Drawn from an <img> rather than `createImageBitmap`: the img path is the one
 * every browser rotates by the EXIF orientation before it reaches the canvas,
 * so a portrait taken on an iPhone does not come out lying on its side.
 */
export async function compressPhoto(file: Blob): Promise<{ blob: Blob; width: number; height: number }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('No se pudo leer la imagen.'));
      el.src = url;
    });
    const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
    const width = Math.round(img.naturalWidth * scale);
    const height = Math.round(img.naturalHeight * scale);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo comprimir la imagen.'))), 'image/jpeg', QUALITY),
    );
    return { blob, width, height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function addPhoto(
  bodyMetricId: string,
  localDate: string,
  file: Blob,
): Promise<BodyPhoto> {
  const { blob, width, height } = await compressPhoto(file);
  const photo: BodyPhoto = { id: newId(), bodyMetricId, localDate, takenAt: Date.now(), blob, width, height };
  await db.bodyPhotos.put(photo);
  return photo;
}

// ------------------------------------------------------------ backup form

/** A photo as it travels in the JSON backup: the bytes as a data URL. */
export type BodyPhotoRecord = Omit<BodyPhoto, 'blob'> & { dataUrl: string };

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const [head, body] = dataUrl.split(',', 2);
  const mime = /data:([^;]+)/.exec(head)?.[1] ?? 'image/jpeg';
  const bytes = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type: mime });
}

export async function photosToRecords(photos: BodyPhoto[]): Promise<BodyPhotoRecord[]> {
  return Promise.all(
    photos.map(async ({ blob, ...rest }) => ({ ...rest, dataUrl: await blobToDataUrl(blob) })),
  );
}

export function recordToPhoto({ dataUrl, ...rest }: BodyPhotoRecord): BodyPhoto {
  return { ...rest, blob: dataUrlToBlob(dataUrl) };
}
