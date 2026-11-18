// Separadores de notas abertas (computador). Guardados localmente em cada dispositivo.
import { useSyncExternalStore } from 'react';
import { uid } from './util';
import { navigate } from './router';

export interface Tab { id: string; noteId: string }
interface State { tabs: Tab[]; active: string | null }

const KEY = 'fn:tabs';
let state: State = load();
const subs = new Set<() => void>();

function load(): State {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || '');
    if (Array.isArray(s.tabs)) return s;
  } catch {}
  return { tabs: [], active: null };
}
function set(next: State) {
  state = next;
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
  subs.forEach((s) => s());
}

export function useTabs(): State {
  return useSyncExternalStore((cb) => { subs.add(cb); return () => subs.delete(cb); }, () => state);
}

/** Chamado sempre que a nota aberta muda: o separador ativo passa a mostrar essa nota. */
export function syncActiveTab(noteId: string) {
  const existing = state.tabs.find((t) => t.noteId === noteId);
  if (existing) {
    if (state.active !== existing.id) set({ ...state, active: existing.id });
    return;
  }
  const active = state.tabs.find((t) => t.id === state.active);
  if (active) set({ tabs: state.tabs.map((t) => (t.id === active.id ? { ...t, noteId } : t)), active: active.id });
  else {
    const t = { id: uid(8), noteId };
    set({ tabs: [...state.tabs, t], active: t.id });
  }
}

/** Abre uma nota num novo separador (Ctrl+clique ou clique do meio). */
export function openInNewTab(noteId: string) {
  const existing = state.tabs.find((t) => t.noteId === noteId);
  const t = existing || { id: uid(8), noteId };
  set({ tabs: existing ? state.tabs : [...state.tabs, t], active: t.id });
  navigate('notes', noteId);
}

export function activateTab(id: string) {
  const t = state.tabs.find((x) => x.id === id);
  if (!t) return;
  set({ ...state, active: id });
  navigate('notes', t.noteId);
}

export function closeTab(id: string) {
  const idx = state.tabs.findIndex((t) => t.id === id);
  if (idx < 0) return;
  const tabs = state.tabs.filter((t) => t.id !== id);
  if (state.active !== id) return set({ ...state, tabs });
  const next = tabs[Math.min(idx, tabs.length - 1)];
  set({ tabs, active: next?.id || null });
  if (next) navigate('notes', next.noteId);
  else navigate('notes');
}

export function closeOtherTabs(id: string) {
  set({ tabs: state.tabs.filter((t) => t.id === id), active: id });
}

/** Remove separadores de notas que deixaram de existir. */
export function pruneTabs(validIds: Set<string>) {
  const tabs = state.tabs.filter((t) => validIds.has(t.noteId));
  if (tabs.length !== state.tabs.length) set({ tabs, active: tabs.some((t) => t.id === state.active) ? state.active : tabs[0]?.id || null });
}
