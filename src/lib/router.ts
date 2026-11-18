import { useSyncExternalStore } from 'react';

export type View = 'home' | 'notes' | 'tasks' | 'calendar' | 'trash' | 'notebooks' | 'tags' | 'settings' | 'clip' | 'share' | 'more' | 'search' | 'shortcuts' | 'files' | 'templates';

export interface Route {
  view: View;
  noteId?: string;
  params: URLSearchParams;
}

function parse(): Route {
  const h = location.hash.replace(/^#\/?/, '');
  const [path, qs = ''] = h.split('?');
  const [view, id] = path.split('/');
  const params = new URLSearchParams(qs);
  if (view === 'note' && id) return { view: 'notes', noteId: id, params };
  const v = (view || 'home') as View;
  return { view: v, noteId: id || undefined, params };
}

let current = parse();
const subs = new Set<() => void>();
window.addEventListener('hashchange', () => {
  current = parse();
  subs.forEach((s) => s());
});

export function useRoute(): Route {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => current,
  );
}

export function href(view: View, noteId?: string, params?: Record<string, string | undefined>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) if (v) qs.set(k, v);
  const q = qs.toString();
  return `#/${view}${noteId ? '/' + noteId : ''}${q ? '?' + q : ''}`;
}

export function navigate(view: View, noteId?: string, params?: Record<string, string | undefined>, replace = false) {
  const h = href(view, noteId, params);
  if (replace) history.replaceState(null, '', h);
  else history.pushState(null, '', h);
  current = parse();
  subs.forEach((s) => s());
}

/** Abre uma nota mantendo o contexto atual da lista (caderno, etiqueta, pesquisa). */
export function openNote(id: string) {
  const r = current;
  const params: Record<string, string> = {};
  r.params.forEach((v, k) => (params[k] = v));
  const view = r.view === 'notes' || r.view === 'trash' || r.view === 'search' ? r.view : 'notes';
  navigate(view, id, view === r.view ? params : {});
}

export function closeNote() {
  const r = current;
  const params: Record<string, string> = {};
  r.params.forEach((v, k) => (params[k] = v));
  navigate(r.view, undefined, params);
}
