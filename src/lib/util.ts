export function uid(len = 20): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const arr = crypto.getRandomValues(new Uint8Array(len));
  let s = '';
  for (const b of arr) s += chars[b % chars.length];
  return s;
}

/** Normaliza texto para pesquisa: minúsculas e sem acentos. */
export function norm(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

export function htmlToText(html: string): string {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('br').forEach((b) => b.replaceWith('\n'));
  doc.querySelectorAll('td,th').forEach((el) => el.append(' '));
  doc.querySelectorAll('p,div,li,h1,h2,h3,h4,h5,h6,tr,blockquote,pre').forEach((el) => el.append('\n'));
  return (doc.body.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function todoState(html: string): { hasTodo: 0 | 1; todoDone: 0 | 1 } {
  const total = (html.match(/data-type="taskItem"/g) || []).length;
  if (!total) return { hasTodo: 0, todoDone: 0 };
  const checked = (html.match(/data-type="taskItem"[^>]*data-checked="true"/g) || []).length;
  return { hasTodo: 1, todoDone: checked === total ? 1 : 0 };
}

const rtf = new Intl.RelativeTimeFormat('pt-PT', { numeric: 'auto' });
const dfShort = new Intl.DateTimeFormat('pt-PT', { day: 'numeric', month: 'short' });
const dfYear = new Intl.DateTimeFormat('pt-PT', { day: 'numeric', month: 'short', year: 'numeric' });
const dfFull = new Intl.DateTimeFormat('pt-PT', { dateStyle: 'full', timeStyle: 'short' });
const dfTime = new Intl.DateTimeFormat('pt-PT', { hour: '2-digit', minute: '2-digit' });

export function relDate(ts: number): string {
  const diff = Date.now() - ts;
  const min = diff / 60000;
  if (min < 1) return 'agora mesmo';
  if (min < 60) return rtf.format(-Math.round(min), 'minute');
  const h = min / 60;
  if (h < 24 && new Date(ts).getDate() === new Date().getDate()) return 'hoje, ' + dfTime.format(ts);
  if (h < 48) return 'ontem';
  const d = new Date(ts);
  return d.getFullYear() === new Date().getFullYear() ? dfShort.format(d) : dfYear.format(d);
}

export function fullDate(ts: number) {
  return dfFull.format(ts);
}

export function shortDate(ts: number) {
  const d = new Date(ts);
  return d.getFullYear() === new Date().getFullYear() ? dfShort.format(d) : dfYear.format(d);
}

export function dateTimeShort(ts: number) {
  return shortDate(ts) + ', ' + dfTime.format(ts);
}

export function startOfDay(ts = Date.now()) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function toLocalInput(ts?: number | null): string {
  if (!ts) return '';
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInput(v: string): number | null {
  if (!v) return null;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
}

export function formatBytes(n: number) {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(0) + ' KB';
  return (n / 1024 / 1024).toFixed(1) + ' MB';
}

export function debounce<T extends (...a: any[]) => any>(fn: T, ms: number) {
  let t: any;
  let pending: Parameters<T> | null = null;
  let inflight: Promise<unknown> = Promise.resolve();
  const run = () => {
    const p = pending;
    pending = null;
    if (p) inflight = Promise.resolve(fn(...p)).catch((e) => console.error(e));
    return inflight;
  };
  const d = (...a: Parameters<T>) => {
    clearTimeout(t);
    pending = a;
    t = setTimeout(run, ms);
  };
  // Executa já a chamada pendente (se houver) e devolve uma promessa que termina quando a gravação acabar.
  d.flush = () => {
    clearTimeout(t);
    return run();
  };
  return d as unknown as T & { flush(): Promise<unknown> };
}

export function wordCount(text: string) {
  const m = text.trim().match(/\S+/g);
  return m ? m.length : 0;
}

export function download(filename: string, data: BlobPart, mime = 'application/octet-stream') {
  const url = URL.createObjectURL(new Blob([data], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function safeFilename(s: string) {
  return (s || 'nota').replace(/[\\/:*?"<>|]+/g, '-').slice(0, 80).trim() || 'nota';
}
