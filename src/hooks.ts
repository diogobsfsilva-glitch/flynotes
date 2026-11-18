import { useLiveQuery } from 'dexie-react-hooks';
import { liveQuery } from 'dexie';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { db, type Note, type Notebook, type Tag, type FileMeta } from './lib/db';
import { alive, type Settings } from './lib/store';
import { onSyncStatus, type SyncStatus } from './lib/sync';
import type { SearchContext } from './lib/search';

export function useNotebooks(): Notebook[] {
  return useLiveQuery(async () => alive(await db.notebooks.toArray()).sort((a, b) => a.name.localeCompare(b.name, 'pt')), [], []) || [];
}

export function useTags(): Tag[] {
  return useLiveQuery(async () => alive(await db.tags.toArray()).sort((a, b) => a.name.localeCompare(b.name, 'pt')), [], []) || [];
}

// Uma única leitura partilhada da tabela de notas para toda a aplicação (em vez de uma por componente):
// com milhares de notas, cada gravação passa a provocar uma leitura em vez de cinco ou seis.
let notesCache: Note[] | undefined;
const notesListeners = new Set<() => void>();
let notesSub: { unsubscribe(): void } | null = null;
function subscribeNotes(fn: () => void) {
  notesListeners.add(fn);
  if (!notesSub) {
    notesSub = liveQuery(async () => alive(await db.notes.toArray())).subscribe({
      next: (v) => { notesCache = v; notesListeners.forEach((l) => l()); },
      error: (e) => console.error(e),
    });
  }
  return () => {
    notesListeners.delete(fn);
    if (!notesListeners.size && notesSub) {
      // Mantém-se ativa por instantes para não recarregar ao mudar de vista
      setTimeout(() => { if (!notesListeners.size && notesSub) { notesSub.unsubscribe(); notesSub = null; notesCache = undefined; } }, 5000);
    }
  };
}
export function useAllNotes(): Note[] | undefined {
  return useSyncExternalStore(subscribeNotes, () => notesCache);
}

const activeCache = new WeakMap<Note[], Note[]>();
export function useActiveNotes(): Note[] {
  const all = useAllNotes();
  return useMemo(() => {
    if (!all) return [];
    let a = activeCache.get(all);
    if (!a) { a = all.filter((n) => !n.trashed); activeCache.set(all, a); }
    return a;
  }, [all]);
}

export function useSettings(): Settings {
  return useLiveQuery(async () => (await db.kv.get('settings'))?.value || {}, [], {}) || {};
}

export function useFilesByNote(): Map<string, FileMeta[]> {
  const files = useLiveQuery(async () => alive(await db.files.toArray()), [], []) || [];
  return useMemo(() => {
    const m = new Map<string, FileMeta[]>();
    for (const f of files) {
      if (!f.noteId) continue;
      if (!m.has(f.noteId)) m.set(f.noteId, []);
      m.get(f.noteId)!.push(f);
    }
    return m;
  }, [files]);
}

export function useSearchContext(): SearchContext {
  const notebooks = useNotebooks();
  const tags = useTags();
  const filesByNote = useFilesByNote();
  return useMemo(
    () => ({ notebooks: new Map(notebooks.map((n) => [n.id, n])), tags: new Map(tags.map((t) => [t.id, t])), filesByNote }),
    [notebooks, tags, filesByNote],
  );
}

export function useSyncStatus() {
  const [s, setS] = useState<{ status: SyncStatus; info?: string }>({ status: 'idle' });
  useEffect(() => onSyncStatus((status, info) => setS({ status, info })), []);
  return s;
}

/** Preferências locais deste dispositivo (não sincronizadas). */
export function useLocalPref<T>(key: string, initial: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => {
    try {
      const s = localStorage.getItem('fn:' + key);
      return s ? JSON.parse(s) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    const h = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (d?.key === key) setV(d.value);
    };
    window.addEventListener('fn:pref', h);
    return () => window.removeEventListener('fn:pref', h);
  }, [key]);
  const set = (nv: T) => setLocalPref(key, nv);
  return [v, set];
}

/** Altera uma preferência local e avisa todos os componentes que a usam. */
export function setLocalPref(key: string, value: unknown) {
  try { localStorage.setItem('fn:' + key, JSON.stringify(value)); } catch {}
  window.dispatchEvent(new CustomEvent('fn:pref', { detail: { key, value } }));
}
