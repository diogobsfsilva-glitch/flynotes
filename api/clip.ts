// Web clipper: descarrega uma página e extrai o conteúdo principal (modo artigo).
import { isAuthed, json, unauthorized } from './_lib/auth.js';
import { safeFetch, BlockedUrlError } from './_lib/safeFetch.js';

export async function POST(req: Request) {
  if (!isAuthed(req)) return unauthorized();
  const { url } = await req.json().catch(() => ({}));
  let target: URL;
  try {
    target = new URL(url);
    if (!/^https?:$/.test(target.protocol)) throw new Error();
  } catch {
    return json({ error: 'URL inválido' }, { status: 400 });
  }
  let html = '';
  try {
    const { response: r, url: finalUrl } = await safeFetch(target, {
      headers: { 'user-agent': 'Mozilla/5.0 (FlyNotes Web Clipper)', accept: 'text/html,*/*' },
      signal: AbortSignal.timeout(12000),
    });
    target = finalUrl;
    html = (await r.text()).slice(0, 3_000_000);
  } catch (e: any) {
    if (e instanceof BlockedUrlError) return json({ error: e.message }, { status: 400 });
    if (e?.code === 'ENOTFOUND') return json({ error: 'Não foi possível encontrar o site' }, { status: 502 });
    return json({ error: 'Não foi possível abrir a página' }, { status: 502 });
  }
  const { parseHTML } = await import('linkedom');
  const { Readability } = await import('@mozilla/readability');
  const { document } = parseHTML(html);
  const base = document.createElement('base');
  base.setAttribute('href', target.href);
  document.head?.appendChild(base);
  // Tornar links e imagens absolutos
  for (const el of Array.from(document.querySelectorAll('a[href], img[src]')) as any[]) {
    const attr = el.tagName === 'A' ? 'href' : 'src';
    try { el.setAttribute(attr, new URL(el.getAttribute(attr), target).href); } catch {}
  }
  const pageTitle = document.querySelector('title')?.textContent?.trim() || target.hostname;
  let article: any = null;
  try { article = new Readability(document as any).parse(); } catch {}
  return json({
    title: article?.title || pageTitle,
    content: article?.content || '',
    excerpt: article?.excerpt || '',
    siteName: article?.siteName || target.hostname,
    url: target.href,
  });
}
