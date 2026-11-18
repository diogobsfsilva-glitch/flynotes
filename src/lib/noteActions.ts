// Ações da nota aberta, publicadas pelo editor para o menu "Nota" da barra de menus.
import { useSyncExternalStore } from 'react';
import type { MenuItem } from '../ui';

let current: MenuItem[] = [];
const subs = new Set<() => void>();

export function publishNoteActions(items: MenuItem[]) {
  current = items;
  subs.forEach((s) => s());
}

export function useNoteActions(): MenuItem[] {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => current,
  );
}
