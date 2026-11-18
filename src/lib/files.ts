// Anexos: guardados localmente (cache offline) e carregados para o servidor em segundo plano.
import { db, type FileMeta } from './db';
import { uid } from './util';
import { put, getSettings } from './store';
import { scheduleSync } from './sync';

export const fileUrl = (id: string) => `/api/file?id=${id}`;

export async function addFile(blob: Blob, name: string, noteId?: string | null): Promise<FileMeta> {
  const id = uid();
  const mime = blob.type || guessMime(name);
  // Disponível offline de imediato através da Cache Storage (servida pelo service worker)
  try {
    const cache = await caches.open('flynotes-files');
    await cache.put(fileUrl(id), new Response(blob, { headers: { 'content-type': mime } }));
  } catch {}
  await db.uploads.put({ id, blob, name, mime });
  const meta = await put<FileMeta>('files', {
    id,
    name,
    mime,
    size: blob.size,
    noteId: noteId || null,
    createdAt: Date.now(),
    uploaded: 0,
    updatedAt: 0,
  });
  scheduleSync(300);
  if (mime.startsWith('image/')) runOcrLater(id, blob);
  if (mime === 'application/pdf') setTimeout(() => import('./pdfText').then((m) => m.indexPdf(id, blob)).catch((e) => console.warn('PDF', e)), 800);
  return meta;
}

async function runOcrLater(id: string, blob: Blob) {
  const s = await getSettings();
  if (s.ocr === false) return;
  setTimeout(async () => {
    try {
      const { ocrImage } = await import('./ocr');
      const text = await ocrImage(blob);
      if (text.trim()) {
        const cur = await db.files.get(id);
        if (cur) await put('files', { ...cur, ocrText: text.trim().slice(0, 20000) });
      }
    } catch (e) {
      console.warn('OCR falhou', e);
    }
  }, 500);
}

export function guessMime(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
    svg: 'image/svg+xml', mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', webm: 'audio/webm', ogg: 'audio/ogg',
    mp4: 'video/mp4', mov: 'video/quicktime', txt: 'text/plain', csv: 'text/csv', doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    zip: 'application/zip',
  };
  return map[ext] || 'application/octet-stream';
}

export function fileIcon(mime: string): string {
  if (mime.startsWith('image/')) return '🖼️';
  if (mime.startsWith('audio/')) return '🎙️';
  if (mime.startsWith('video/')) return '🎬';
  if (mime === 'application/pdf') return '📕';
  if (mime.includes('sheet') || mime.includes('excel') || mime === 'text/csv') return '📊';
  if (mime.includes('word')) return '📄';
  if (mime.includes('presentation') || mime.includes('powerpoint')) return '📽️';
  if (mime.includes('zip')) return '🗜️';
  return '📎';
}

/** Melhora uma foto de documento (digitalização): escala de cinzentos + contraste. */
export async function enhanceScan(file: Blob): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const max = 2200;
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale);
  const h = Math.round(bmp.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bmp, 0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  // Histograma para normalizar níveis
  let min = 255, max2 = 0;
  for (let i = 0; i < d.length; i += 16) {
    const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    if (g < min) min = g;
    if (g > max2) max2 = g;
  }
  const range = Math.max(1, max2 - min);
  for (let i = 0; i < d.length; i += 4) {
    let g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    g = ((g - min) / range) * 255;
    g = g > 200 ? 255 : g < 60 ? g * 0.6 : g; // fundo branco, texto escuro
    d[i] = d[i + 1] = d[i + 2] = g;
  }
  ctx.putImageData(img, 0, 0);
  return new Promise((res) => canvas.toBlob((b) => res(b!), 'image/jpeg', 0.85));
}

/** Reduz fotos muito grandes antes de anexar. */
export async function downscaleImage(file: File, max = 2400): Promise<Blob> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif' || file.type === 'image/svg+xml') return file;
  try {
    const bmp = await createImageBitmap(file);
    if (Math.max(bmp.width, bmp.height) <= max && file.size < 3 * 1024 * 1024) return file;
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    return await new Promise((res) => canvas.toBlob((b) => res(b || file), 'image/jpeg', 0.88));
  } catch {
    return file;
  }
}
