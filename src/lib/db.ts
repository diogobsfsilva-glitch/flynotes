import Dexie, { type Table } from 'dexie';

export interface Base {
  id: string;
  updatedAt: number;
  dirty?: 0 | 1;
  deleted?: 0 | 1;
  syncedAt?: number;
  pushedAt?: number;
}

export interface Note extends Base {
  title: string;
  content: string; // HTML do editor
  text: string; // texto simples (para pesquisa e pré-visualização)
  notebookId: string;
  tagIds: string[];
  createdAt: number;
  trashed: 0 | 1;
  trashedAt?: number;
  pinned?: 0 | 1;
  reminderAt?: number | null;
  reminderDone?: 0 | 1;
  sourceUrl?: string;
  author?: string;
  location?: { lat: number; lng: number } | null;
  locked?: { salt: string; iv: string; data: string } | null;
  hasTodo?: 0 | 1;
  todoDone?: 0 | 1; // todas as caixas marcadas
}

export interface Notebook extends Base {
  name: string;
  stack?: string;
  createdAt: number;
}

export interface Tag extends Base {
  name: string;
  parentId?: string | null;
}

export interface Task extends Base {
  title: string;
  done: 0 | 1;
  due?: number | null;
  reminderAt?: number | null;
  priority?: 'high' | 'medium' | 'low' | null;
  flagged?: 0 | 1;
  noteId?: string | null;
  description?: string;
  createdAt: number;
  completedAt?: number | null;
  repeat?: 'daily' | 'weekly' | 'monthly' | null;
}

export interface FileMeta extends Base {
  name: string;
  mime: string;
  size: number;
  noteId?: string | null;
  createdAt: number;
  ocrText?: string;
  uploaded?: 0 | 1;
}

export interface SavedSearch extends Base {
  name: string;
  query: string;
}

export interface Template extends Base {
  name: string;
  title: string;
  content: string;
}

export interface Version extends Base {
  noteId: string;
  title: string;
  content: string;
  savedAt: number;
}

export interface CalEvent extends Base {
  title: string;
  start: number;
  end: number;
  allDay: 0 | 1;
  location?: string;
  description?: string;
  color?: string;
  noteId?: string | null;
  reminderMin?: number | null;
  createdAt: number;
}

export interface KV extends Base {
  value: any;
}

export interface Meta {
  key: string;
  value: any;
}

export interface PendingUpload {
  id: string;
  blob: Blob;
  name: string;
  mime: string;
}

class FlyDB extends Dexie {
  notes!: Table<Note, string>;
  notebooks!: Table<Notebook, string>;
  tags!: Table<Tag, string>;
  tasks!: Table<Task, string>;
  files!: Table<FileMeta, string>;
  searches!: Table<SavedSearch, string>;
  templates!: Table<Template, string>;
  versions!: Table<Version, string>;
  kv!: Table<KV, string>;
  events!: Table<CalEvent, string>;
  meta!: Table<Meta, string>;
  uploads!: Table<PendingUpload, string>;

  constructor() {
    super('flynotes');
    this.version(1).stores({
      notes: 'id, notebookId, updatedAt, createdAt, trashed, dirty, *tagIds, reminderAt',
      notebooks: 'id, dirty',
      tags: 'id, dirty',
      tasks: 'id, noteId, due, done, dirty',
      files: 'id, noteId, dirty',
      searches: 'id, dirty',
      templates: 'id, dirty',
      versions: 'id, noteId, dirty',
      kv: 'id, dirty',
      meta: 'key',
      uploads: 'id',
    });
    this.version(2).stores({ events: 'id, start, dirty, noteId' });
  }
}

export const db = new FlyDB();

// Correspondência entre tabelas locais e tipos no servidor
export const TABLE_TYPES = {
  notes: 'note',
  notebooks: 'notebook',
  tags: 'tag',
  tasks: 'task',
  files: 'file',
  searches: 'search',
  templates: 'template',
  versions: 'version',
  kv: 'kv',
  events: 'event',
} as const;
export type SyncTable = keyof typeof TABLE_TYPES;
export const TYPE_TABLES: Record<string, SyncTable> = Object.fromEntries(
  Object.entries(TABLE_TYPES).map(([t, ty]) => [ty, t as SyncTable]),
);

export async function getMeta<T = any>(key: string, fallback: T): Promise<T> {
  const m = await db.meta.get(key);
  return (m?.value ?? fallback) as T;
}
export async function setMeta(key: string, value: any) {
  await db.meta.put({ key, value });
}
