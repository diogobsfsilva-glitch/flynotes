// Importação e exportação no formato ENEX (formato de exportação aberto do Evernote).
import { db, type Note } from './db';
import { md5 } from './md5';
import { addFile, fileUrl, guessMime } from './files';
import { createNotebook, getOrCreateTag, alive, buildNote, bulkAddNotes } from './store';
import { decryptText, unlocked } from './crypto';
import { escapeHtml } from './util';

function parseEnDate(s?: string | null): number | undefined {
  if (!s) return undefined;
  const m = s.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
  if (!m) return undefined;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
}
function enDate(ts: number) {
  return new Date(ts).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function b64ToBytes(b64: string) {
  const bin = atob(b64.replace(/\s+/g, ''));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export interface ImportProgress {
  done: number;
  total: number;
  current?: string;
}

/** Converte ENML (conteúdo de nota Evernote) em HTML compatível com o editor. */
export function enmlToHtml(enml: string, mediaMap: Map<string, { id: string; mime: string; name: string; size: number }>): string {
  // O parser HTML não conhece etiquetas autofechadas: <en-todo/> engoliria o texto seguinte
  const cleaned = enml
    .replace(/<\?xml[^>]*\?>/, '')
    .replace(/<!DOCTYPE[^>]*>/, '')
    .replace(/<(en-todo|en-media|en-crypt)([^>]*?)\s*\/>/gi, '<$1$2></$1>');
  const doc = new DOMParser().parseFromString(cleaned, 'text/html');
  const root = doc.querySelector('en-note') || doc.body;

  root.querySelectorAll('en-media').forEach((el) => {
    const hash = el.getAttribute('hash') || '';
    const f = mediaMap.get(hash);
    if (!f) return el.remove();
    let rep: HTMLElement;
    if (f.mime.startsWith('image/')) {
      rep = doc.createElement('img');
      rep.setAttribute('src', fileUrl(f.id));
      rep.setAttribute('alt', f.name);
    } else {
      rep = doc.createElement('div');
      rep.setAttribute('data-type', 'file');
      rep.setAttribute('data-id', f.id);
      rep.setAttribute('data-name', f.name);
      rep.setAttribute('data-mime', f.mime);
      rep.setAttribute('data-size', String(f.size));
    }
    el.replaceWith(rep);
  });

  root.querySelectorAll('en-crypt').forEach((el) => {
    const p = doc.createElement('p');
    p.textContent = '[Texto encriptado no Evernote — não foi possível importar]';
    el.replaceWith(p);
  });

  // Listas de verificação modernas do Evernote (ul com --en-todo)
  root.querySelectorAll('ul').forEach((ul) => {
    if (!(ul.getAttribute('style') || '').includes('--en-todo')) return;
    ul.setAttribute('data-type', 'taskList');
    ul.removeAttribute('style');
    ul.querySelectorAll(':scope > li').forEach((li) => {
      const checked = (li.getAttribute('style') || '').includes('--en-checked:true');
      li.setAttribute('data-type', 'taskItem');
      li.setAttribute('data-checked', String(checked));
      li.removeAttribute('style');
    });
  });

  // Caixas de verificação clássicas (en-todo). Um mesmo bloco pode ter várias:
  // <div><en-todo/>A<br/><en-todo checked="true"/>B</div> -> duas tarefas, cada uma com o seu estado.
  const blocks = new Set<HTMLElement>();
  for (const td of Array.from(root.querySelectorAll('en-todo'))) {
    const block = td.closest('div, p, li') as HTMLElement | null;
    blocks.add(block && root.contains(block) && block !== root ? block : (root as HTMLElement));
  }
  const trimBr = (h: string) => h.replace(/^(\s|<br\s*\/?>)+|(\s|<br\s*\/?>)+$/gi, '');
  for (const block of blocks) {
    const parts = block.innerHTML.split(/(<en-todo\b[^>]*>(?:\s*<\/en-todo>)?)/i);
    const frag = doc.createDocumentFragment();
    const before = trimBr(parts[0] || '');
    if (before) { const p = doc.createElement('p'); p.innerHTML = before; frag.appendChild(p); }
    const ul = doc.createElement('ul');
    ul.setAttribute('data-type', 'taskList');
    for (let i = 1; i < parts.length; i += 2) {
      const checked = /checked\s*=\s*["']?true/i.test(parts[i]);
      const li = doc.createElement('li');
      li.setAttribute('data-type', 'taskItem');
      li.setAttribute('data-checked', String(checked));
      const p = doc.createElement('p');
      p.innerHTML = trimBr(parts[i + 1] || '');
      li.appendChild(p);
      ul.appendChild(li);
    }
    if (ul.childNodes.length) frag.appendChild(ul);
    if (block === root) { block.innerHTML = ''; block.appendChild(frag); }
    else block.replaceWith(frag);
  }
  // Juntar listas de tarefas adjacentes
  root.querySelectorAll('ul[data-type="taskList"]').forEach((ul) => {
    let next = ul.nextElementSibling;
    while (next && next.matches('ul[data-type="taskList"]')) {
      const n = next.nextElementSibling;
      while (next.firstChild) ul.appendChild(next.firstChild);
      next.remove();
      next = n;
    }
  });

  // Divs de bloco do Evernote -> parágrafos
  root.querySelectorAll('div').forEach((div) => {
    if (div.hasAttribute('data-type')) return;
    if (div.querySelector('div, p, ul, ol, table, h1, h2, h3, h4, h5, h6, blockquote, pre')) return;
    const p = doc.createElement('p');
    p.innerHTML = div.innerHTML;
    for (const a of ['style']) if (div.getAttribute(a)) p.setAttribute(a, div.getAttribute(a)!);
    div.replaceWith(p);
  });
  return root.innerHTML;
}

export async function importEnex(file: File, onProgress?: (p: ImportProgress) => void, notebookName?: string): Promise<number> {
  const xml = new DOMParser().parseFromString(await file.text(), 'application/xml');
  if (xml.querySelector('parsererror')) throw new Error('Ficheiro ENEX inválido');
  const notesEl = Array.from(xml.getElementsByTagName('note'));
  const nbName = notebookName || cleanNotebookName(file.name.replace(/\.enex$/i, '')) || 'Importado';
  const existing = alive(await db.notebooks.toArray()).find((n) => n.name.trim().toLowerCase() === nbName.toLowerCase());
  const notebook = existing || (await createNotebook(nbName));
  let done = 0;
  // Gravação em lotes: muito mais rápido em ficheiros grandes (uma transação por 25 notas)
  const BATCH = 25;
  let pending: Note[] = [];
  const flush = async () => { await bulkAddNotes(pending); pending = []; };
  const tagCache = new Map<string, string>();
  const tagId = async (name: string) => {
    const key = name.trim().toLowerCase();
    if (!tagCache.has(key)) tagCache.set(key, (await getOrCreateTag(name)).id);
    return tagCache.get(key)!;
  };
  for (const el of notesEl) {
    const title = el.getElementsByTagName('title')[0]?.textContent || 'Sem título';
    onProgress?.({ done, total: notesEl.length, current: title });
    const mediaMap = new Map<string, { id: string; mime: string; name: string; size: number }>();
    const noteId = crypto.randomUUID().replace(/-/g, '').slice(0, 20);
    for (const r of Array.from(el.getElementsByTagName('resource'))) {
      const data = r.getElementsByTagName('data')[0]?.textContent || '';
      if (!data) continue;
      const bytes = b64ToBytes(data);
      const name = r.getElementsByTagName('file-name')[0]?.textContent || 'anexo';
      const mime = r.getElementsByTagName('mime')[0]?.textContent || guessMime(name);
      const meta = await addFile(new Blob([bytes as BlobPart], { type: mime }), name, noteId);
      mediaMap.set(md5(bytes), { id: meta.id, mime, name, size: bytes.length });
    }
    const enml = el.getElementsByTagName('content')[0]?.textContent || '';
    const html = enmlToHtml(enml, mediaMap);
    const tagIds: string[] = [];
    for (const t of Array.from(el.getElementsByTagName('tag'))) {
      if (t.textContent?.trim()) tagIds.push(await tagId(t.textContent));
    }
    const attrs = el.getElementsByTagName('note-attributes')[0];
    const lat = Number(attrs?.getElementsByTagName('latitude')[0]?.textContent);
    const lng = Number(attrs?.getElementsByTagName('longitude')[0]?.textContent);
    const reminder = parseEnDate(attrs?.getElementsByTagName('reminder-time')[0]?.textContent);
    pending.push(buildNote({
      id: noteId,
      title,
      content: html,
      notebookId: notebook.id,
      tagIds,
      createdAt: parseEnDate(el.getElementsByTagName('created')[0]?.textContent) || Date.now(),
      // Mantém a data de atualização original do Evernote
      updatedAt: parseEnDate(el.getElementsByTagName('updated')[0]?.textContent) || undefined,
      sourceUrl: attrs?.getElementsByTagName('source-url')[0]?.textContent || undefined,
      author: attrs?.getElementsByTagName('author')[0]?.textContent || undefined,
      location: Number.isFinite(lat) && Number.isFinite(lng) && (lat || lng) ? { lat, lng } : null,
      reminderAt: reminder || null,
    }));
    if (pending.length >= BATCH) await flush();
    done++;
  }
  await flush();
  onProgress?.({ done, total: notesEl.length });
  return done;
}

// ---------- Exportação ----------
const ENML_ALLOWED = new Set([
  'a', 'abbr', 'b', 'blockquote', 'br', 'caption', 'code', 'col', 'colgroup', 'dd', 'del', 'div', 'dl', 'dt', 'em',
  'font', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'ins', 'li', 'mark', 'ol', 'p', 'pre', 's', 'small', 'span',
  'strike', 'strong', 'sub', 'sup', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'u', 'ul',
]);

async function htmlToEnml(html: string, resources: string[]): Promise<string> {
  const doc = new DOMParser().parseFromString(`<div id="r">${html}</div>`, 'text/html');
  const root = doc.getElementById('r')!;
  // Tarefas -> en-todo, mantendo a formatação do texto e as subtarefas (com avanço)
  const convertTaskList = (ul: Element, depth: number): DocumentFragment => {
    const frag = doc.createDocumentFragment();
    for (const li of Array.from(ul.children)) {
      if (li.tagName !== 'LI') continue;
      const nested: Element[] = [];
      const parts: string[] = [];
      // O editor guarda o texto (e as sublistas) dentro de um <div> no item; noutros casos estão diretamente no <li>
      const wrapper = Array.from(li.children).find((c) => c.tagName === 'DIV') as Element | undefined;
      const kids = [...Array.from(li.childNodes).filter((c) => c !== wrapper), ...(wrapper ? Array.from(wrapper.childNodes) : [])];
      for (const child of kids) {
        const el = child.nodeType === 1 ? (child as Element) : null;
        if (el && el.matches('ul, ol')) nested.push(el);
        else if (el && el.matches('label, input')) continue; // caixa do editor
        else if (el) parts.push(el.tagName === 'P' ? el.innerHTML : el.outerHTML);
        else if ((child.textContent || '').trim()) parts.push(escapeHtml(child.textContent || ''));
      }
      const div = doc.createElement('div');
      if (depth) div.setAttribute('style', `padding-left: ${depth * 24}px`);
      div.innerHTML = `<en-todo checked="${li.getAttribute('data-checked') === 'true'}"></en-todo>` + parts.join('<br/>').replace(/<\/?p>/g, '');
      frag.appendChild(div);
      for (const n of nested) frag.appendChild(n.matches('[data-type="taskList"]') ? convertTaskList(n, depth + 1) : n.cloneNode(true));
    }
    return frag;
  };
  for (const ul of Array.from(root.querySelectorAll('ul[data-type="taskList"]'))) {
    if (!root.contains(ul) || ul.parentElement?.closest('ul[data-type="taskList"]')) continue; // só as de topo
    ul.replaceWith(convertTaskList(ul, 0));
  }
  // Imagens e ficheiros -> en-media
  const media = Array.from(root.querySelectorAll('img, div[data-type="file"]'));
  for (const el of media) {
    const id = el.getAttribute('data-id') || (el.getAttribute('src') || '').match(/id=([A-Za-z0-9_-]+)/)?.[1];
    if (!id) { el.remove(); continue; }
    try {
      const r = await fetch(fileUrl(id));
      const buf = new Uint8Array(await r.arrayBuffer());
      const meta = await db.files.get(id);
      const mime = meta?.mime || r.headers.get('content-type') || 'application/octet-stream';
      const hash = md5(buf);
      let bin = '';
      for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      resources.push(
        `<resource><data encoding="base64">${btoa(bin)}</data><mime>${mime}</mime>` +
          `<resource-attributes><file-name>${escapeHtml(meta?.name || id)}</file-name></resource-attributes></resource>`,
      );
      const m = doc.createElement('en-media');
      m.setAttribute('hash', hash);
      m.setAttribute('type', mime);
      el.replaceWith(m);
    } catch {
      el.remove();
    }
  }
  // Limpar elementos e atributos não permitidos
  const walk = (node: Element) => {
    for (const child of Array.from(node.children)) {
      const tag = child.tagName.toLowerCase();
      if (tag === 'en-todo' || tag === 'en-media') continue;
      if (!ENML_ALLOWED.has(tag)) {
        const span = doc.createElement(tag === 'label' || tag === 'input' ? 'span' : 'div');
        span.innerHTML = child.innerHTML;
        child.replaceWith(span);
        walk(span);
        continue;
      }
      for (const attr of Array.from(child.attributes)) {
        if (!['href', 'style', 'colspan', 'rowspan', 'title'].includes(attr.name)) child.removeAttribute(attr.name);
        if (attr.name === 'href' && !/^(https?:|mailto:)/.test(attr.value)) child.removeAttribute('href');
      }
      walk(child);
    }
  };
  walk(root);
  return new XMLSerializer().serializeToString(root).replace(/^<div[^>]*>|<\/div>$/g, '').replace(/ xmlns="[^"]*"/g, '');
}

export async function exportEnex(notes: Note[]): Promise<string> {
  const tags = new Map(alive(await db.tags.toArray()).map((t) => [t.id, t.name]));
  let out = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE en-export SYSTEM "http://xml.evernote.com/pub/evernote-export4.dtd">\n<en-export export-date="${enDate(Date.now())}" application="FlyNotes" version="1.0">\n`;
  for (const n of notes) {
    const resources: string[] = [];
    // Nota encriptada: se estiver desbloqueada nesta sessão, exporta o conteúdo; senão, um aviso
    let html = n.content;
    if (n.locked) {
      const pass = unlocked.get(n.id);
      html = pass
        ? await decryptText(n.locked as any, pass).catch(() => '<p>[Nota encriptada na FlyNotes — não foi possível desencriptar]</p>')
        : '<p>[Nota encriptada na FlyNotes — desbloqueie-a antes de exportar para incluir o conteúdo]</p>';
    }
    const enml = await htmlToEnml(html, resources);
    out += `<note><title>${escapeHtml(n.title || 'Sem título')}</title>`;
    out += `<created>${enDate(n.createdAt)}</created><updated>${enDate(n.updatedAt)}</updated>`;
    for (const t of n.tagIds) if (tags.get(t)) out += `<tag>${escapeHtml(tags.get(t)!)}</tag>`;
    out += '<note-attributes>';
    if (n.sourceUrl) out += `<source-url>${escapeHtml(n.sourceUrl)}</source-url>`;
    if (n.author) out += `<author>${escapeHtml(n.author)}</author>`;
    if (n.location) out += `<latitude>${n.location.lat}</latitude><longitude>${n.location.lng}</longitude>`;
    if (n.reminderAt) out += `<reminder-time>${enDate(n.reminderAt)}</reminder-time>`;
    out += '</note-attributes>';
    out += `<content><![CDATA[<?xml version="1.0" encoding="UTF-8" standalone="no"?><!DOCTYPE en-note SYSTEM "http://xml.evernote.com/pub/enml2.dtd"><en-note>${enml}</en-note>]]></content>`;
    out += resources.join('') + '</note>\n';
  }
  return out + '</en-export>\n';
}

export function htmlToMarkdown(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const walk = (node: Node, ctx: { list?: string; depth: number }): string => {
    if (node.nodeType === Node.TEXT_NODE) return (node.textContent || '').replace(/\s+/g, ' ');
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const el = node as HTMLElement;
    const kids = (c = ctx) => Array.from(el.childNodes).map((n) => walk(n, c)).join('');
    const tag = el.tagName.toLowerCase();
    switch (tag) {
      case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6':
        return '\n' + '#'.repeat(+tag[1]) + ' ' + kids().trim() + '\n\n';
      case 'p': return kids().trim() + '\n\n';
      case 'br': return '  \n';
      case 'strong': case 'b': return `**${kids()}**`;
      case 'em': case 'i': return `*${kids()}*`;
      case 's': case 'del': case 'strike': return `~~${kids()}~~`;
      case 'code': return el.closest('pre') ? kids() : '`' + kids() + '`';
      case 'pre': return '\n```\n' + (el.textContent || '') + '\n```\n\n';
      case 'blockquote': return kids().trim().split('\n').map((l) => '> ' + l).join('\n') + '\n\n';
      case 'a': return `[${kids()}](${el.getAttribute('href') || ''})`;
      case 'img': return `![${el.getAttribute('alt') || ''}](${el.getAttribute('src') || ''})`;
      case 'hr': return '\n---\n\n';
      case 'ul': case 'ol': {
        const isTask = el.getAttribute('data-type') === 'taskList';
        let i = 0;
        return Array.from(el.children).map((li) => {
          i++;
          const indent = '  '.repeat(ctx.depth);
          const marker = isTask ? `- [${li.getAttribute('data-checked') === 'true' ? 'x' : ' '}]` : tag === 'ol' ? `${i}.` : '-';
          const inner = Array.from(li.childNodes).map((n) => walk(n, { depth: ctx.depth + 1 })).join('').trim();
          return `${indent}${marker} ${inner}\n`;
        }).join('') + (ctx.depth ? '' : '\n');
      }
      case 'table': {
        const rows = Array.from(el.querySelectorAll('tr')).map((tr) => Array.from(tr.children).map((c) => (c.textContent || '').trim().replace(/\|/g, '\\|')));
        if (!rows.length) return '';
        const head = `| ${rows[0].join(' | ')} |\n| ${rows[0].map(() => '---').join(' | ')} |\n`;
        return '\n' + head + rows.slice(1).map((r) => `| ${r.join(' | ')} |`).join('\n') + '\n\n';
      }
      case 'div':
        if (el.getAttribute('data-type') === 'file') return `[📎 ${el.getAttribute('data-name')}](${fileUrl(el.getAttribute('data-id') || '')})\n\n`;
        return kids();
      default: return kids();
    }
  };
  return walk(doc.body, { depth: 0 }).replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

export function noteToHtmlDocument(n: Note): string {
  return `<!doctype html><html lang="pt"><head><meta charset="utf-8"><title>${escapeHtml(n.title || 'Nota')}</title>
<style>body{font-family:system-ui,sans-serif;max-width:760px;margin:40px auto;padding:0 16px;line-height:1.6;color:#222}
img{max-width:100%}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:6px 10px}
ul[data-type=taskList]{list-style:none;padding-left:4px}li[data-checked=true]{text-decoration:line-through;color:#888}
li[data-type=taskItem]::before{content:'☐ '}li[data-checked=true]::before{content:'☑ '}</style></head>
<body><h1>${escapeHtml(n.title || 'Sem título')}</h1>${n.content}</body></html>`;
}

/** Remove o sufixo "(N notas)" que o Evernote acrescenta aos nomes dos ficheiros exportados. */
export function cleanNotebookName(name: string): string {
  return name.replace(/\s*\(\s*\d+\s*(notas?|notes?)\s*\)\s*$/i, '').trim();
}
