// Pesquisa de texto integral com sintaxe ao estilo Evernote (operadores em inglês ou português).
import type { Note, Notebook, Tag, FileMeta } from './db';
import { norm, startOfDay } from './util';

export interface ParsedQuery {
  words: { text: string; neg: boolean; phrase: boolean; prefix: boolean }[];
  intitle: { text: string; neg: boolean }[];
  notebooks: { name: string; neg: boolean }[];
  tags: { name: string; neg: boolean }[];
  todo: { val: 'true' | 'false' | '*'; neg: boolean }[];
  created: { at: number; neg: boolean }[];
  updated: { at: number; neg: boolean }[];
  resources: { mime: string; neg: boolean }[];
  reminder?: boolean;
  sources: { text: string; neg: boolean }[];
  any: boolean;
  empty: boolean;
}

const ALIASES: Record<string, string> = {
  caderno: 'notebook', etiqueta: 'tag', titulo: 'intitle', 'título': 'intitle', tarefa: 'todo', criado: 'created',
  atualizado: 'updated', anexo: 'resource', lembrete: 'reminder', fonte: 'source', qualquer: 'any',
  reminderorder: 'reminder', remindertime: 'reminder', sourceurl: 'source',
};

function tokenize(q: string): string[] {
  const out: string[] = [];
  // -"frase exata" e -operador:"valor" ficam num só token
  const re = /-?(?:[\wÀ-ÿ]+:)?"[^"]*"?|\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(q))) out.push(m[0]);
  return out;
}

function parseDate(v: string): number | undefined {
  const s = v.toLowerCase();
  const today = startOfDay();
  if (s === 'day' || s === 'hoje' || s === 'today') return today;
  const rel = s.match(/^(day|week|month|year|dia|semana|mes|mês|ano)(?:-(\d+))?$/);
  if (rel) {
    const n = Number(rel[2] || 0);
    const d = new Date(today);
    const unit = rel[1];
    if (unit === 'day' || unit === 'dia') d.setDate(d.getDate() - n);
    else if (unit === 'week' || unit === 'semana') { d.setDate(d.getDate() - d.getDay() - 7 * n); }
    else if (unit === 'month' || unit === 'mes' || unit === 'mês') { d.setDate(1); d.setMonth(d.getMonth() - n); }
    else { d.setMonth(0, 1); d.setFullYear(d.getFullYear() - n); }
    return d.getTime();
  }
  const abs = s.match(/^(\d{4})-?(\d{2})?-?(\d{2})?$/);
  if (abs) return new Date(Number(abs[1]), Number(abs[2] || 1) - 1, Number(abs[3] || 1)).getTime();
  const iso = Date.parse(v);
  return Number.isFinite(iso) ? iso : undefined;
}

export function parseQuery(q: string): ParsedQuery {
  const p: ParsedQuery = { words: [], intitle: [], notebooks: [], tags: [], todo: [], created: [], updated: [], resources: [], sources: [], any: false, empty: true };
  for (let tok of tokenize(q.trim())) {
    let neg = false;
    if (tok.startsWith('-') && tok.length > 1) { neg = true; tok = tok.slice(1); }
    const op = tok.match(/^([\wÀ-ÿ]+):(.*)$/);
    if (op) {
      const key = ALIASES[norm(op[1])] || ALIASES[op[1].toLowerCase()] || op[1].toLowerCase();
      const val = op[2].replace(/^"|"$/g, '');
      switch (key) {
        case 'any': p.any = true; continue;
        case 'intitle': if (val) p.intitle.push({ text: norm(val), neg }); continue;
        case 'notebook': if (val) p.notebooks.push({ name: norm(val), neg }); continue;
        case 'tag': if (val) p.tags.push({ name: norm(val), neg }); continue;
        case 'todo': p.todo.push({ val: /^(false|nao|não)$/i.test(val) ? 'false' : val === '*' || val === '' ? '*' : 'true', neg }); continue;
        case 'created': { const at = parseDate(val); if (at !== undefined) p.created.push({ at, neg }); continue; }
        case 'updated': { const at = parseDate(val); if (at !== undefined) p.updated.push({ at, neg }); continue; }
        case 'resource': p.resources.push({ mime: val.toLowerCase(), neg }); continue;
        case 'reminder': p.reminder = !neg; continue;
        case 'source': if (val) p.sources.push({ text: norm(val), neg }); continue;
      }
    }
    const phrase = tok.startsWith('"');
    let text = norm(tok.replace(/^"|"$/g, '')).trim();
    const prefix = text.endsWith('*');
    if (prefix) text = text.slice(0, -1);
    if (text) p.words.push({ text, neg, phrase, prefix });
  }
  p.empty = !p.words.length && !p.intitle.length && !p.notebooks.length && !p.tags.length && !p.todo.length &&
    !p.created.length && !p.updated.length && !p.resources.length && p.reminder === undefined && !p.sources.length;
  return p;
}

export interface SearchContext {
  notebooks: Map<string, Notebook>;
  tags: Map<string, Tag>;
  filesByNote: Map<string, FileMeta[]>;
}

export interface SearchHit {
  note: Note;
  score: number;
}

export function searchNotes(notes: Note[], query: string, ctx: SearchContext): SearchHit[] {
  const p = parseQuery(query);
  if (p.empty) return notes.map((note) => ({ note, score: 0 }));
  const hits: SearchHit[] = [];
  for (const note of notes) {
    const s = matchNote(note, p, ctx);
    if (s !== null) hits.push({ note, score: s });
  }
  return hits.sort((a, b) => b.score - a.score || b.note.updatedAt - a.note.updatedAt);
}

function matchNote(note: Note, p: ParsedQuery, ctx: SearchContext): number | null {
  const title = norm(note.title);
  const files = ctx.filesByNote.get(note.id) || [];
  const tagNames = note.tagIds.map((id) => norm(ctx.tags.get(id)?.name || ''));
  const nb = ctx.notebooks.get(note.notebookId);
  const body = norm(note.text) + ' ' + files.map((f) => norm(f.name + ' ' + (f.ocrText || ''))).join(' ') + ' ' + tagNames.join(' ');

  // Filtros estruturados (sempre obrigatórios)
  for (const t of p.intitle) if (title.includes(t.text) === t.neg) return null;
  for (const n of p.notebooks) {
    const nbName = norm(nb?.name || '');
    const stack = norm(nb?.stack || '');
    const ok = wildcardMatch(nbName, n.name) || (stack && wildcardMatch(stack, n.name));
    if (ok === n.neg) return null;
  }
  for (const t of p.tags) {
    const ok = tagNames.some((tn) => wildcardMatch(tn, t.name));
    if (ok === t.neg) return null;
  }
  // Como no Evernote: todo:true = com caixas marcadas, todo:false = com caixas por marcar, todo:* = com caixas.
  if (p.todo.length) {
    const html = note.content || '';
    const checked = /data-checked="true"/.test(html);
    const unchecked = /data-checked="false"/.test(html);
    for (const t of p.todo) {
      const ok = t.val === 'true' ? checked : t.val === 'false' ? unchecked : checked || unchecked || !!note.hasTodo;
      if (ok === t.neg) return null;
    }
  }
  // created:X = desde X; -created:X = antes de X
  for (const c of p.created) if ((note.createdAt >= c.at) === c.neg) return null;
  for (const c of p.updated) if ((note.updatedAt >= c.at) === c.neg) return null;
  for (const r of p.resources) {
    const ok = files.some((f) => wildcardMatch(f.mime.toLowerCase(), r.mime) || f.mime.toLowerCase().startsWith(r.mime.replace('*', '')));
    if (ok === r.neg) return null;
  }
  if (p.reminder === true && !note.reminderAt) return null;
  if (p.reminder === false && note.reminderAt) return null;
  for (const src of p.sources) if (norm(note.sourceUrl || '').includes(src.text) === src.neg) return null;

  // Palavras: todas (por defeito) ou qualquer uma (any:)
  let score = 1;
  let anyMatched = false;
  for (const w of p.words) {
    const inTitle = title.includes(w.text);
    const found = inTitle || body.includes(w.text);
    if (w.neg) {
      if (found) return null;
      continue;
    }
    if (found) {
      anyMatched = true;
      score += inTitle ? 10 : 3;
      if (title === w.text) score += 10;
    } else if (!p.any) return null;
  }
  if (p.any && p.words.some((w) => !w.neg) && !anyMatched) return null;
  return score;
}

function wildcardMatch(value: string, pattern: string) {
  if (!pattern.includes('*')) return value === pattern;
  const re = new RegExp('^' + pattern.split('*').map(escapeRe).join('.*') + '$');
  return re.test(value);
}
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Excerto do texto à volta da primeira ocorrência, para mostrar nos resultados. */
/** Texto numa linha para pré-visualizações: linhas separadas por « · » em vez de coladas. */
export function flatText(text: string): string {
  return (text || '').split(/\n+/).map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' · ');
}

export function snippetFor(raw: string, query: string, len = 160): string {
  const text = flatText(raw);
  const p = parseQuery(query);
  const words = p.words.filter((w) => !w.neg).map((w) => w.text);
  if (!words.length) return text.slice(0, len);
  const n = norm(text);
  let idx = -1;
  for (const w of words) {
    idx = n.indexOf(w);
    if (idx >= 0) break;
  }
  if (idx < 0) return text.slice(0, len);
  const start = Math.max(0, idx - 50);
  return (start > 0 ? '…' : '') + text.slice(start, start + len);
}

export function highlightTerms(query: string): string[] {
  return parseQuery(query).words.filter((w) => !w.neg).map((w) => w.text).filter((w) => w.length > 1);
}
