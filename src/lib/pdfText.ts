// Extração do texto de PDFs para os tornar pesquisáveis. PDFs digitalizados (sem texto) passam por OCR nas primeiras páginas.
import { db } from './db';
import { put, getSettings } from './store';
import { fileUrl } from './files';

let pdfjsPromise: Promise<any> | null = null;
export async function pdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const lib = await import('pdfjs-dist');
      lib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
      return lib;
    })();
  }
  return pdfjsPromise;
}

const MAX_PAGES = 60;
const MAX_CHARS = 60000;

export async function extractPdfText(data: ArrayBuffer): Promise<string> {
  const lib = await pdfjs();
  const task = lib.getDocument({ data: new Uint8Array(data), isEvalSupported: false });
  const doc = await task.promise;
  let text = '';
  const pages = Math.min(doc.numPages, MAX_PAGES);
  for (let i = 1; i <= pages && text.length < MAX_CHARS; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((it: any) => ('str' in it ? it.str : '')).join(' ') + '\n';
  }
  text = text.replace(/[ \t]+/g, ' ').trim();
  // Sem texto: provavelmente digitalizado → OCR das primeiras 3 páginas
  if (text.length < 20) {
    const s = await getSettings();
    if (s.ocr !== false) {
      const { ocrImage } = await import('./ocr');
      for (let i = 1; i <= Math.min(doc.numPages, 3); i++) {
        const page = await doc.getPage(i);
        const vp = page.getViewport({ scale: 2 });
        const canvas = document.createElement('canvas');
        canvas.width = vp.width;
        canvas.height = vp.height;
        await page.render({ canvasContext: canvas.getContext('2d')!, viewport: vp, canvas }).promise;
        const blob: Blob = await new Promise((r) => canvas.toBlob((b) => r(b!), 'image/png'));
        text += (await ocrImage(blob)) + '\n';
      }
    }
  }
  try { await (task.destroy?.() ?? doc.destroy?.()); } catch {}
  return text.slice(0, MAX_CHARS).trim();
}

/** Indexa um PDF já guardado (por id). */
export async function indexPdf(id: string, blob?: Blob) {
  const meta = await db.files.get(id);
  if (!meta || meta.mime !== 'application/pdf') return;
  const buf = blob ? await blob.arrayBuffer() : await (await fetch(fileUrl(id))).arrayBuffer();
  const text = await extractPdfText(buf);
  const cur = await db.files.get(id);
  if (cur) await put('files', { ...cur, ocrText: text || ' ', textIndexed: 1 } as any);
}

let running = false;
/** Indexa em segundo plano os PDFs que ainda não têm texto (ex.: importados do Evernote). */
export async function indexPendingPdfs(onProgress?: (done: number, total: number) => void) {
  if (running) return 0;
  running = true;
  try {
    const all = (await db.files.toArray()).filter((f) => !f.deleted && f.mime === 'application/pdf' && !(f as any).textIndexed && !f.ocrText);
    let done = 0;
    for (const f of all) {
      if (!navigator.onLine) break;
      try { await indexPdf(f.id); } catch (e) { console.warn('PDF não indexado', f.name, e); await put('files', { ...f, textIndexed: 1 } as any); }
      onProgress?.(++done, all.length);
      await new Promise((r) => setTimeout(r, 200));
    }
    return done;
  } finally {
    running = false;
  }
}
