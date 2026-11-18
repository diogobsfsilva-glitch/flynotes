// Operações de dados (locais, depois sincronizadas).
import { db, type Note, type Notebook, type Tag, type Task, type SyncTable, type Base, type Version, getMeta } from './db';
import { uid, htmlToText, todoState, startOfDay } from './util';
import { scheduleSync, syncNow } from './sync';

export async function put<T extends Base>(table: SyncTable, obj: T): Promise<T> {
  // Nunca anterior à versão em que se baseia: protege contra relógios atrasados noutros dispositivos.
  const row = { ...obj, updatedAt: Math.max(Date.now(), (obj.updatedAt || 0) + 1), dirty: 1 as const };
  await (db[table] as any).put(row);
  scheduleSync();
  return row;
}

export async function patch<T extends Base>(table: SyncTable, id: string, changes: Partial<T>) {
  const cur = await (db[table] as any).get(id);
  if (!cur) return;
  return put(table, { ...cur, ...changes });
}

export async function removeDoc(table: SyncTable, id: string) {
  const cur = await (db[table] as any).get(id);
  // Mantém syncedAt: sem ele, o eco da última versão enviada era confundido com um conflito.
  await (db[table] as any).put({ id, updatedAt: Math.max(Date.now(), (cur?.updatedAt || 0) + 1), dirty: 1, deleted: 1, syncedAt: cur?.syncedAt });
  scheduleSync();
}

export const alive = <T extends Base>(rows: T[]) => rows.filter((r) => !r.deleted);

// ---------- Cadernos ----------
let ensuring: Promise<string> | null = null;
export function ensureDefaultNotebook(): Promise<string> {
  if (!ensuring) ensuring = ensureDefaultNotebookInner().finally(() => { ensuring = null; });
  return ensuring;
}
async function ensureDefaultNotebookInner(): Promise<string> {
  const kv = await db.kv.get('settings');
  const all = alive(await db.notebooks.toArray());
  const def = kv?.value?.defaultNotebookId;
  if (def && all.find((n) => n.id === def)) return def;
  if (all.length) return all[0].id;
  // Dispositivo novo: antes de criar um caderno, recebe os do servidor (evita «Primeiro caderno» duplicados).
  if (navigator.onLine && !(await getMeta<number>('lastSyncAt', 0))) {
    await syncNow().catch(() => {});
    const again = alive(await db.notebooks.toArray());
    const def2 = (await db.kv.get('settings'))?.value?.defaultNotebookId;
    if (def2 && again.find((n) => n.id === def2)) return def2;
    if (again.length) return again[0].id;
  }
  const nb = await createNotebook('Primeiro caderno');
  await setSetting('defaultNotebookId', nb.id);
  return nb.id;
}

/** Junta cadernos «Primeiro caderno» duplicados (criados por dispositivos novos) no caderno predefinido. */
export async function mergeDuplicateDefaultNotebooks(): Promise<number> {
  const all = alive(await db.notebooks.toArray());
  const dups = all.filter((n) => n.name === 'Primeiro caderno' && !n.stack);
  if (dups.length < 2) return 0;
  // Fica sempre o mais antigo (mesma escolha em todos os dispositivos, mesmo sem estarem sincronizados)
  const keep = [...dups].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0) || a.id.localeCompare(b.id))[0];
  const def = (await db.kv.get('settings'))?.value?.defaultNotebookId;
  if (dups.some((n) => n.id === def && n.id !== keep.id)) await setSetting('defaultNotebookId', keep.id);
  let merged = 0;
  for (const nb of dups) {
    if (nb.id === keep.id) continue;
    const notes = await db.notes.where('notebookId').equals(nb.id).toArray();
    for (const n of notes) await put('notes', { ...n, notebookId: keep.id });
    await removeDoc('notebooks', nb.id);
    merged++;
  }
  return merged;
}

export async function createNotebook(name: string, stack?: string): Promise<Notebook> {
  return put<Notebook>('notebooks', { id: uid(), name, stack: stack || '', createdAt: Date.now(), updatedAt: 0 });
}

export async function deleteNotebook(id: string) {
  const notes = await db.notes.where('notebookId').equals(id).toArray();
  for (const n of alive(notes)) await put('notes', { ...n, trashed: 1, trashedAt: Date.now() });
  await removeDoc('notebooks', id);
}

// ---------- Notas ----------
/** Monta uma nota completa (sem gravar) — usado na importação em lote. */
export function buildNote(partial: Partial<Note> & { notebookId: string }): Note {
  const clean = Object.fromEntries(Object.entries(partial).filter(([, v]) => v !== undefined)) as Partial<Note>;
  const content = clean.content || '';
  const now = Date.now();
  return {
    id: uid(),
    title: '',
    tagIds: [],
    createdAt: now,
    trashed: 0,
    ...clean,
    content,
    text: htmlToText(content),
    updatedAt: clean.updatedAt || now,
    ...todoState(content),
    dirty: 1,
  } as Note;
}

/** Grava várias notas numa só transação (uma única atualização da interface em vez de uma por nota). */
export async function bulkAddNotes(notes: Note[]) {
  if (!notes.length) return;
  await db.notes.bulkPut(notes as any);
  scheduleSync();
}

export async function createNote(partial: Partial<Note> = {}): Promise<Note> {
  // Ignorar campos explicitamente indefinidos para não apagar os valores predefinidos
  const clean = Object.fromEntries(Object.entries(partial).filter(([, v]) => v !== undefined)) as Partial<Note>;
  const notebookId = clean.notebookId || (await ensureDefaultNotebook());
  const content = clean.content || '';
  const now = Date.now();
  const note: Note = {
    id: uid(),
    title: '',
    tagIds: [],
    createdAt: now,
    trashed: 0,
    ...clean,
    content,
    text: htmlToText(content),
    notebookId,
    updatedAt: now,
    ...todoState(content),
  } as Note;
  return put('notes', note);
}

export async function saveNoteContent(id: string, title: string, content: string) {
  const cur = await db.notes.get(id);
  if (!cur) return;
  if (cur.title === title && cur.content === content) return;
  await maybeSnapshot(cur);
  // Relê depois do snapshot: entretanto a nota pode ter mudado de caderno, ido para o lixo, etc.
  await db.transaction('rw', db.notes, async () => {
    const fresh = await db.notes.get(id);
    if (!fresh || fresh.deleted) return;
    await put('notes', { ...fresh, title, content, text: htmlToText(content), ...todoState(content) });
  });
}

/** Guarda uma versão no histórico, no máximo uma a cada 10 minutos por nota. */
async function maybeSnapshot(cur: Note) {
  if (!cur.content && !cur.title) return;
  const versions = alive(await db.versions.where('noteId').equals(cur.id).toArray()).sort((a, b) => b.savedAt - a.savedAt);
  if (versions[0] && Date.now() - versions[0].savedAt < 10 * 60 * 1000) return;
  if (versions[0] && versions[0].content === cur.content && versions[0].title === cur.title) return;
  await put<Version>('versions', {
    id: uid(),
    noteId: cur.id,
    title: cur.title,
    content: cur.content,
    savedAt: cur.updatedAt || Date.now(),
    updatedAt: 0,
  });
  // Manter as 30 versões mais recentes
  for (const v of versions.slice(29)) await removeDoc('versions', v.id);
}

export async function trashNote(id: string) {
  await patch<Note>('notes', id, { trashed: 1, trashedAt: Date.now() });
}
export async function restoreNote(id: string) {
  const n = await db.notes.get(id);
  if (!n) return;
  const nb = await db.notebooks.get(n.notebookId);
  const notebookId = nb && !nb.deleted ? n.notebookId : await ensureDefaultNotebook();
  await put('notes', { ...n, trashed: 0, trashedAt: undefined, notebookId });
}
export async function deleteNoteForever(id: string) {
  const files = await db.files.where('noteId').equals(id).toArray();
  if (files.length) {
    // Um anexo pode estar a ser usado por outra nota (duplicada ou cópia em conflito): nesse caso passa para ela.
    const others = alive(await db.notes.toArray()).filter((n) => n.id !== id);
    for (const f of files) {
      const user = others.find((n) => n.content.includes(f.id));
      if (user) { await put('files', { ...f, noteId: user.id }); continue; }
      // O ficheiro em si só é apagado no servidor ao fim de 35 dias, para que restaurar uma cópia de segurança o traga de volta.
      await removeDoc('files', f.id);
    }
  }
  const versions = await db.versions.where('noteId').equals(id).toArray();
  for (const v of versions) await removeDoc('versions', v.id);
  const tasks = await db.tasks.where('noteId').equals(id).toArray();
  for (const t of alive(tasks)) await patch<Task>('tasks', t.id, { noteId: null });
  await removeDoc('notes', id);
}
export async function emptyTrash() {
  const trashed = alive(await db.notes.where('trashed').equals(1).toArray());
  for (const n of trashed) await deleteNoteForever(n.id);
}
/** Guarda uma versão de uma nota como «cópia em conflito» (ex.: alterada noutro dispositivo enquanto era editada aqui). */
export async function saveConflictCopy(n: Note) {
  const stamp = new Date(n.updatedAt).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' });
  const { id: _id, updatedAt: _u, dirty: _d, syncedAt: _s, ...rest } = n as any;
  return createNote({ ...rest, title: `${n.title || 'Sem título'} (cópia em conflito ${stamp})`, pinned: 0, trashed: 0 });
}

export async function duplicateNote(id: string) {
  const n = await db.notes.get(id);
  if (!n) return;
  const { id: _id, updatedAt: _u, dirty: _d, ...rest } = n;
  return createNote({ ...rest, title: n.title + ' (cópia)', createdAt: Date.now(), pinned: 0 });
}

// ---------- Etiquetas ----------
export async function getOrCreateTag(name: string): Promise<Tag> {
  const clean = name.trim();
  const all = alive(await db.tags.toArray());
  const found = all.find((t) => t.name.toLowerCase() === clean.toLowerCase());
  if (found) return found;
  return put<Tag>('tags', { id: uid(), name: clean, parentId: null, updatedAt: 0 });
}
export async function deleteTag(id: string) {
  const notes = await db.notes.where('tagIds').equals(id).toArray();
  for (const n of alive(notes)) await put('notes', { ...n, tagIds: n.tagIds.filter((t) => t !== id) });
  const children = alive(await db.tags.toArray()).filter((t) => t.parentId === id);
  for (const c of children) await patch<Tag>('tags', c.id, { parentId: null });
  await removeDoc('tags', id);
}

// ---------- Tarefas ----------
export async function createTask(partial: Partial<Task>): Promise<Task> {
  return put<Task>('tasks', {
    id: uid(),
    title: '',
    done: 0,
    createdAt: Date.now(),
    updatedAt: 0,
    ...partial,
  } as Task);
}
export async function toggleTask(t: Task) {
  if (!t.done && t.repeat && t.due) {
    // Tarefa recorrente: avança a data em vez de concluir
    const d = new Date(t.due);
    if (t.repeat === 'daily') d.setDate(d.getDate() + 1);
    if (t.repeat === 'weekly') d.setDate(d.getDate() + 7);
    if (t.repeat === 'monthly') d.setMonth(d.getMonth() + 1);
    await put('tasks', { ...t, due: d.getTime() });
    return;
  }
  await put('tasks', { ...t, done: t.done ? 0 : 1, completedAt: t.done ? null : Date.now() });
}

export function taskBucket(t: Task): 'overdue' | 'today' | 'upcoming' | 'nodate' {
  if (!t.due) return 'nodate';
  const today = startOfDay();
  if (t.due < today) return 'overdue';
  if (t.due < today + 86400000) return 'today';
  return 'upcoming';
}

// ---------- Definições (sincronizadas) ----------
export interface Settings {
  defaultNotebookId?: string;
  shortcuts?: { kind: 'note' | 'notebook' | 'tag' | 'search'; id: string }[];
  homeWidgets?: Record<string, boolean>;
  pinnedNoteId?: string | null;
  ocr?: boolean;
  userName?: string;
  calendars?: CalendarSub[];
  calendarLayers?: { events?: boolean; tasks?: boolean; reminders?: boolean; notes?: boolean };
}
export interface CalendarSub { id: string; name: string; url: string; color: string; provider: 'google' | 'outlook' | 'ics'; enabled: boolean }
export async function getSettings(): Promise<Settings> {
  return (await db.kv.get('settings'))?.value || {};
}
export async function setSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
  // Parte da linha existente para manter updatedAt/syncedAt (carimbo sempre posterior ao anterior)
  const row = (await db.kv.get('settings')) || { id: 'settings', value: {}, updatedAt: 0 };
  await put('kv', { ...row, value: { ...(row.value || {}), [key]: value } });
}
export async function toggleShortcut(kind: 'note' | 'notebook' | 'tag' | 'search', id: string) {
  const s = await getSettings();
  const list = s.shortcuts || [];
  const exists = list.some((x) => x.kind === kind && x.id === id);
  await setSetting('shortcuts', exists ? list.filter((x) => !(x.kind === kind && x.id === id)) : [...list, { kind, id }]);
  return !exists;
}

/** Corrige cadernos importados com "(N notas)" no nome; junta-os ao caderno com o nome limpo, se existir. */
export async function cleanupNotebookNames(): Promise<number> {
  const re = /\s*\(\s*\d+\s*(notas?|notes?)\s*\)\s*$/i;
  const all = alive(await db.notebooks.toArray());
  let fixed = 0;
  for (const nb of all) {
    if (!re.test(nb.name)) continue;
    const clean = nb.name.replace(re, '').trim();
    const target = all.find((x) => x.id !== nb.id && !re.test(x.name) && x.name.trim().toLowerCase() === clean.toLowerCase());
    if (target) {
      const notes = await db.notes.where('notebookId').equals(nb.id).toArray();
      for (const n of alive(notes)) await put('notes', { ...n, notebookId: target.id });
      if (!target.stack && nb.stack) await patch<Notebook>('notebooks', target.id, { stack: nb.stack });
      await removeDoc('notebooks', nb.id);
    } else {
      await patch<Notebook>('notebooks', nb.id, { name: clean });
    }
    fixed++;
  }
  return fixed;
}
