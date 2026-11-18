// Arrastar e largar: notas para cadernos / lixo e cadernos vazios para o lixo.
import { db, type Note, type Notebook } from './db';
import { alive, patch, put, removeDoc, restoreNote, trashNote } from './store';
import { toast } from '../ui';

export const NOTES_TYPE = 'text/flynotes-notes';
export const NOTEBOOK_TYPE = 'text/flynotes-notebook';

export const hasNotes = (e: React.DragEvent | DragEvent) => !!e.dataTransfer?.types.includes(NOTES_TYPE);
export const hasNotebook = (e: React.DragEvent | DragEvent) => !!e.dataTransfer?.types.includes(NOTEBOOK_TYPE);

export function setDragNotes(e: React.DragEvent, ids: string[]) {
  e.dataTransfer.setData(NOTES_TYPE, JSON.stringify(ids));
  e.dataTransfer.effectAllowed = 'move';
  // Etiqueta que acompanha o cursor quando se arrastam várias notas
  if (ids.length > 1) {
    const tag = document.createElement('div');
    tag.className = 'drag-count';
    tag.textContent = `${ids.length} notas`;
    document.body.append(tag);
    e.dataTransfer.setDragImage(tag, 10, 10);
    setTimeout(() => tag.remove(), 0);
  }
}
export function getDragNotes(e: React.DragEvent): string[] {
  try { const v = JSON.parse(e.dataTransfer.getData(NOTES_TYPE) || '[]'); return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []; }
  catch { return []; }
}

const plural = (n: number) => (n === 1 ? '1 nota' : `${n} notas`);

export async function moveNotesTo(ids: string[], nb: Notebook) {
  const notes = (await db.notes.bulkGet(ids)).filter((n): n is Note => !!n && !n.deleted && n.notebookId !== nb.id);
  if (!notes.length) return toast(ids.length > 1 ? 'As notas já estão neste caderno' : 'A nota já está neste caderno');
  const before = notes.map((n) => [n.id, n.notebookId] as const);
  for (const n of notes) await patch<Note>('notes', n.id, { notebookId: nb.id });
  toast(`${plural(notes.length)} ${notes.length === 1 ? 'movida' : 'movidas'} para “${nb.name}”`, {
    label: 'Anular',
    fn: async () => { for (const [id, old] of before) await patch<Note>('notes', id, { notebookId: old }); },
  });
}

export async function trashNotes(ids: string[]) {
  const notes = (await db.notes.bulkGet(ids)).filter((n): n is Note => !!n && !n.deleted && !n.trashed);
  if (!notes.length) return;
  for (const n of notes) await trashNote(n.id);
  toast(`${plural(notes.length)} ${notes.length === 1 ? 'movida' : 'movidas'} para o lixo`, {
    label: 'Anular',
    fn: async () => { for (const n of notes) await restoreNote(n.id); },
  });
}

/** Elimina um caderno, mas só se estiver vazio (sem notas fora do lixo). */
export async function trashEmptyNotebook(id: string) {
  const nb = await db.notebooks.get(id);
  if (!nb || nb.deleted) return;
  const all = alive(await db.notebooks.toArray());
  if (all.length <= 1) return toast('Precisa de pelo menos um caderno');
  const count = alive(await db.notes.where('notebookId').equals(id).toArray()).filter((n) => !n.trashed).length;
  if (count > 0) return toast(`“${nb.name}” tem ${plural(count)}. Só os cadernos vazios podem ser arrastados para o lixo — mova ou elimine primeiro as notas.`, undefined, 6000);
  const { dirty: _d, deleted: _x, ...saved } = nb as any;
  await removeDoc('notebooks', id);
  toast(`Caderno “${nb.name}” eliminado`, { label: 'Anular', fn: async () => { await put('notebooks', saved); } });
}

// ---------- Telemóvel: toque prolongado + arrastar com o dedo ----------
type TouchPayload = { kind: 'notes'; ids: string[]; label: string } | { kind: 'notebook'; id: string; label: string; onTap?: () => void };

/**
 * Propriedades de toque para um elemento arrastável no telemóvel.
 * Toque prolongado (0,45 s) «levanta» o item e abre um painel com os destinos; larga-se o dedo sobre o destino.
 * Num caderno, se o dedo não se mexer, o toque prolongado continua a servir para mudar o nome (onTap).
 */
// Estado partilhado (só há um dedo a arrastar de cada vez): sobrevive a redesenhos do componente
let timer: any = null;
let sx = 0, sy = 0;
export function touchDragProps(getPayload: () => TouchPayload | null) {
  const cancel = () => { clearTimeout(timer); timer = null; };
  return {
    onTouchStart: (e: React.TouchEvent) => {
      if (e.touches.length !== 1) return cancel();
      const t = e.touches[0];
      sx = t.clientX; sy = t.clientY;
      const el = e.currentTarget as HTMLElement;
      cancel();
      timer = setTimeout(() => { timer = null; const p = getPayload(); if (p) startTouchDrag(p, sx, sy, el); }, 450);
    },
    onTouchMove: (e: React.TouchEvent) => {
      const t = e.touches[0];
      if (timer && (Math.abs(t.clientX - sx) > 10 || Math.abs(t.clientY - sy) > 10)) cancel(); // está a deslizar a lista
    },
    onTouchEnd: cancel,
    onTouchCancel: cancel,
    onContextMenu: (e: React.MouseEvent) => { if (matchMedia('(pointer: coarse)').matches) e.preventDefault(); },
  };
}

async function startTouchDrag(p: TouchPayload, x0: number, y0: number, source: HTMLElement) {
  (navigator as any).vibrate?.(15);
  const notebooks = p.kind === 'notes' ? alive(await db.notebooks.toArray()).sort((a, b) => ((a.stack || '') + ' ' + a.name).localeCompare((b.stack || '') + ' ' + b.name, 'pt')) : [];
  source.classList.add('dragging');
  const ghost = document.createElement('div');
  ghost.className = 'td-ghost';
  ghost.textContent = p.label;
  const sheet = document.createElement('div');
  sheet.className = 'td-sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-label', 'Largar em');
  const hint = document.createElement('div');
  hint.className = 'td-hint';
  hint.textContent = p.kind === 'notes' ? 'Arraste até ao destino e largue' : 'Arraste até ao lixo e largue (só cadernos vazios)';
  const trash = document.createElement('div');
  trash.className = 'td-target td-trash';
  trash.dataset.trash = '1';
  trash.textContent = '🗑  Lixo';
  sheet.append(hint, trash);
  let list: HTMLElement | null = null;
  if (p.kind === 'notes') {
    list = document.createElement('div');
    list.className = 'td-list';
    let stack = '';
    for (const nb of notebooks) {
      if ((nb.stack || '') !== stack) {
        stack = nb.stack || '';
        if (stack) { const h = document.createElement('div'); h.className = 'td-stack'; h.textContent = stack; list.append(h); }
      }
      const t = document.createElement('div');
      t.className = 'td-target' + (nb.stack ? ' in-stack' : '');
      t.dataset.nb = nb.id;
      t.textContent = nb.name;
      list.append(t);
    }
    sheet.append(list);
  }
  document.body.append(sheet, ghost);
  document.documentElement.classList.add('td-active');

  let moved = false;
  let over: HTMLElement | null = null;
  let scrollDir = 0;
  let raf = 0;
  const place = (x: number, y: number) => { ghost.style.transform = `translate(${Math.round(x + 12)}px, ${Math.round(y - 46)}px)`; };
  place(x0, y0);
  const autoScroll = () => {
    if (scrollDir && list) list.scrollTop += scrollDir * 9;
    raf = requestAnimationFrame(autoScroll);
  };
  raf = requestAnimationFrame(autoScroll);

  const onMove = (e: TouchEvent) => {
    e.preventDefault(); // enquanto se arrasta, a página não desliza
    const t = e.touches[0];
    if (Math.abs(t.clientX - x0) > 10 || Math.abs(t.clientY - y0) > 10) moved = true;
    place(t.clientX, t.clientY);
    const hit = (document.elementFromPoint(t.clientX, t.clientY) as HTMLElement | null)?.closest('.td-target') as HTMLElement | null;
    if (hit !== over) { over?.classList.remove('over'); hit?.classList.add('over'); over = hit; }
    // Perto do topo/fundo da lista de cadernos: desliza sozinha
    scrollDir = 0;
    if (list) {
      const r = list.getBoundingClientRect();
      if (t.clientY > r.bottom - 44) scrollDir = 1;
      else if (t.clientY < r.top + 30 && t.clientY > r.top - 20) scrollDir = -1;
    }
  };
  const finish = (drop: boolean) => {
    document.removeEventListener('touchmove', onMove);
    document.removeEventListener('touchend', onEnd);
    document.removeEventListener('touchcancel', onCancel);
    cancelAnimationFrame(raf);
    sheet.remove();
    ghost.remove();
    source.classList.remove('dragging');
    document.documentElement.classList.remove('td-active');
    // O toque que termina o arrasto não deve abrir a nota/caderno
    const swallow = (ev: Event) => { ev.preventDefault(); ev.stopPropagation(); };
    document.addEventListener('click', swallow, { capture: true, once: true });
    setTimeout(() => document.removeEventListener('click', swallow, true), 400);
    if (!drop) return;
    if (!moved) { if (p.kind === 'notebook') p.onTap?.(); return; }
    if (!over) return;
    if (over.dataset.trash) return void (p.kind === 'notes' ? trashNotes(p.ids) : trashEmptyNotebook(p.id));
    const nb = notebooks.find((n) => n.id === over!.dataset.nb);
    if (nb && p.kind === 'notes') moveNotesTo(p.ids, nb);
  };
  const onEnd = (e: TouchEvent) => { e.preventDefault(); finish(true); };
  const onCancel = () => finish(false);
  document.addEventListener('touchmove', onMove, { passive: false });
  document.addEventListener('touchend', onEnd, { passive: false });
  document.addEventListener('touchcancel', onCancel);
}
