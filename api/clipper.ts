// Web Clipper (extensão do navegador): lista cadernos/etiquetas e cria notas a partir de páginas recortadas.
// Autenticação: sessão normal (cookie) ou código de ligação gerado nas Definições (Authorization: Bearer …).
import { randomBytes } from 'node:crypto';
import { isAuthed, json, unauthorized, sign, safeEqual } from './_lib/auth.js';
import { db, pushDocs, getMetaValue, setMetaValue, type DocIn } from './_lib/db.js';
import { saveFile } from './_lib/storage.js';

type Token = { id: string; name: string; createdAt: number; lastUsedAt?: number };

const newId = (n = 20) => randomBytes(24).toString('base64url').replace(/[-_]/g, 'x').slice(0, n);

async function tokenAuth(req: Request): Promise<Token | null> {
  const h = req.headers.get('authorization') || '';
  const m = h.match(/^Bearer\s+fnc_([A-Za-z0-9]+)\.([A-Za-z0-9_-]+)$/);
  if (!m) return null;
  if (!safeEqual(sign('clipper:' + m[1]), m[2])) return null;
  const tokens = await getMetaValue<Token[]>('clipper_tokens', []);
  return tokens.find((t) => t.id === m[1]) || null; // revogado = já não está na lista
}

const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'GET, POST, OPTIONS' };
const out = (data: unknown, status = 200) => json(data, { status, headers: cors });

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: cors });
}

// GET /api/clipper            -> cadernos, etiquetas e caderno predefinido (para a extensão)
// GET /api/clipper?tokens=1   -> lista de códigos de ligação (só com sessão)
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get('tokens')) {
    if (!isAuthed(req)) return unauthorized();
    return json({ tokens: await getMetaValue<Token[]>('clipper_tokens', []) });
  }
  if (!isAuthed(req) && !(await tokenAuth(req))) return out({ error: 'unauthorized' }, 401);
  const q = await db();
  const nbs = await q(`select id, data from docs where type = 'notebook' and not deleted`);
  const tags = await q(`select id, data from docs where type = 'tag' and not deleted`);
  const kv = await q(`select data from docs where id = 'settings' and type = 'kv' and not deleted`);
  const notebooks = nbs.map((r) => ({ id: r.id, name: r.data.name || 'Caderno', stack: r.data.stack || '' }))
    .sort((a, b) => (a.stack + ' ' + a.name).localeCompare(b.stack + ' ' + b.name, 'pt'));
  const def = kv[0]?.data?.value?.defaultNotebookId;
  return out({
    notebooks,
    tags: tags.map((r) => r.data.name).filter(Boolean).sort((a: string, b: string) => a.localeCompare(b, 'pt')),
    defaultNotebookId: notebooks.some((n) => n.id === def) ? def : notebooks[0]?.id || null,
  });
}

/** Remove tudo o que possa executar código ou partir a nota; devolve HTML limpo e o texto. */
async function clean(html: string, base: string): Promise<{ html: string; text: string }> {
  const { parseHTML } = await import('linkedom');
  const { document } = parseHTML(`<!doctype html><html><body><div id="r">${html}</div></body></html>`);
  const root = document.getElementById('r')!;
  root.querySelectorAll('script, style, noscript, iframe, object, embed, form, link, meta, template, svg, canvas, video, audio, button, input, select, textarea, nav, footer, aside').forEach((el: any) => el.remove());
  for (const el of Array.from(root.querySelectorAll('*')) as any[]) {
    for (const a of Array.from(el.attributes) as any[]) {
      const n = a.name.toLowerCase();
      if (n.startsWith('on') || n === 'srcset' || n === 'class' || n === 'id' || n.startsWith('data-') || n === 'style') el.removeAttribute(a.name);
    }
    for (const attr of ['href', 'src']) {
      const v = el.getAttribute(attr);
      if (!v) continue;
      try {
        const abs = new URL(v, base);
        if (!/^(https?:|mailto:|tel:|data:image\/)/.test(abs.href)) el.removeAttribute(attr);
        else el.setAttribute(attr, abs.href);
      } catch { el.removeAttribute(attr); }
    }
    if (el.tagName === 'A') { el.setAttribute('rel', 'noopener noreferrer'); el.removeAttribute('target'); }
    if (el.tagName === 'IMG' && !el.getAttribute('src')) el.remove();
  }
  root.querySelectorAll('br').forEach((b: any) => b.after(document.createTextNode('\n')));
  const blocks = 'p,div,li,h1,h2,h3,h4,h5,h6,tr,blockquote,pre';
  const outHtml = root.innerHTML;
  root.querySelectorAll(blocks).forEach((el: any) => el.append(document.createTextNode('\n')));
  root.querySelectorAll('td,th').forEach((el: any) => el.append(document.createTextNode(' ')));
  const text = (root.textContent || '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return { html: outHtml, text };
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

// POST /api/clipper                 -> cria uma nota { title, url, html?, excerpt?, mode, notebookId?, tags?, comment?, screenshot? }
// POST /api/clipper { action: 'token', name }      -> cria um código de ligação (só com sessão)
// POST /api/clipper { action: 'revoke', id }       -> revoga um código (só com sessão)
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return out({ error: 'Pedido inválido' }, 400);

  if (body.action === 'token' || body.action === 'revoke') {
    if (!isAuthed(req)) return unauthorized();
    const tokens = await getMetaValue<Token[]>('clipper_tokens', []);
    if (body.action === 'revoke') {
      await setMetaValue('clipper_tokens', tokens.filter((t) => t.id !== body.id));
      return json({ ok: true });
    }
    if (tokens.length >= 10) return json({ error: 'Já tem 10 códigos de ligação. Revogue um antes de criar outro.' }, { status: 400 });
    const id = newId(16);
    const t: Token = { id, name: String(body.name || 'Navegador').slice(0, 60), createdAt: Date.now() };
    await setMetaValue('clipper_tokens', [...tokens, t]);
    // O código completo só é mostrado uma vez; o servidor guarda apenas o identificador
    return json({ token: `fnc_${id}.${sign('clipper:' + id)}`, ...t });
  }

  const viaToken = await tokenAuth(req);
  if (!isAuthed(req) && !viaToken) return out({ error: 'unauthorized' }, 401);

  const pageUrl = String(body.url || '');
  let page: URL | null = null;
  try { page = new URL(pageUrl); if (!/^https?:$/.test(page.protocol)) page = null; } catch { page = null; }
  const title = String(body.title || page?.hostname || 'Página recortada').trim().slice(0, 300);
  const mode = ['article', 'full', 'selection', 'bookmark', 'screenshot'].includes(body.mode) ? body.mode : 'article';
  const q = await db();
  const now = Date.now();
  const noteId = newId();
  const docs: DocIn[] = [];

  // Caderno: o indicado (se existir), senão o predefinido
  const nbs = await q(`select id from docs where type = 'notebook' and not deleted`);
  const kv = await q(`select data from docs where id = 'settings' and type = 'kv' and not deleted`);
  const ids = new Set(nbs.map((r) => r.id));
  let notebookId = ids.has(body.notebookId) ? body.notebookId : kv[0]?.data?.value?.defaultNotebookId;
  if (!ids.has(notebookId)) notebookId = nbs[0]?.id;
  if (!notebookId) {
    notebookId = newId();
    docs.push({ id: notebookId, type: 'notebook', data: { id: notebookId, name: 'Primeiro caderno', stack: '', createdAt: now, updatedAt: now }, updatedAt: now });
  }

  // Etiquetas: usa as existentes pelo nome e cria as que faltarem
  const tagIds: string[] = [];
  const wanted: string[] = Array.isArray(body.tags) ? body.tags.map((t: any) => String(t).trim()).filter(Boolean).slice(0, 20) : [];
  if (wanted.length) {
    const existing = await q(`select id, data from docs where type = 'tag' and not deleted`);
    for (const name of wanted) {
      const hit = existing.find((r) => String(r.data.name || '').toLowerCase() === name.toLowerCase());
      if (hit) { tagIds.push(hit.id); continue; }
      const id = newId();
      docs.push({ id, type: 'tag', data: { id, name: name.slice(0, 60), parentId: null, updatedAt: now }, updatedAt: now });
      existing.push({ id, data: { name } });
      tagIds.push(id);
    }
  }

  // Conteúdo
  const header = page ? `<p><a href="${esc(page.href)}">${esc(page.href)}</a></p>` : '';
  const comment = String(body.comment || '').trim();
  const commentHtml = comment ? comment.split('\n').map((l) => `<p>${esc(l)}</p>`).join('') : '';
  let content = header + commentHtml;
  let text = (page ? page.href + '\n' : '') + (comment ? comment + '\n' : '');
  if (mode === 'bookmark') {
    const ex = String(body.excerpt || '').trim().slice(0, 600);
    if (ex) { content += `<blockquote><p>${esc(ex)}</p></blockquote>`; text += ex; }
  } else if (mode === 'screenshot') {
    const m = String(body.screenshot || '').match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);
    if (!m) return out({ error: 'Captura de ecrã inválida' }, 400);
    const bytes = Buffer.from(m[2], 'base64');
    if (bytes.length > 4_000_000) return out({ error: 'Captura de ecrã demasiado grande' }, 413);
    const fileId = newId();
    await saveFile(fileId, bytes, m[1]);
    const name = `Captura ${new Date(now).toISOString().slice(0, 10)}.${m[1].split('/')[1].replace('jpeg', 'jpg')}`;
    docs.push({ id: fileId, type: 'file', data: { id: fileId, name, mime: m[1], size: bytes.length, noteId, createdAt: now, uploaded: 1, updatedAt: now }, updatedAt: now });
    content += `<img src="/api/file?id=${fileId}" alt="${esc(title)}">`;
  } else {
    const c = await clean(String(body.html || '').slice(0, 3_000_000), page?.href || 'https://invalid.invalid/');
    if (!c.text && !/<img/i.test(c.html)) return out({ error: 'Não foi possível extrair conteúdo desta página. Experimente "Marcador" ou "Captura de ecrã".' }, 422);
    content += '<hr>' + c.html;
    text += c.text;
  }

  docs.push({
    id: noteId,
    type: 'note',
    data: { id: noteId, title, content, text, notebookId, tagIds, createdAt: now, updatedAt: now, trashed: 0, hasTodo: 0, todoDone: 0, sourceUrl: page?.href, author: String(body.author || '').slice(0, 120) || undefined },
    updatedAt: now,
  });
  const res = await pushDocs(docs);
  if (res.rejected.length) return out({ error: 'Não foi possível guardar a nota' }, 500);
  if (viaToken) {
    const tokens = await getMetaValue<Token[]>('clipper_tokens', []);
    await setMetaValue('clipper_tokens', tokens.map((t) => (t.id === viaToken.id ? { ...t, lastUsedAt: now } : t))).catch(() => {});
  }
  return out({ ok: true, id: noteId, title });
}
