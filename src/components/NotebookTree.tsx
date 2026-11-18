// Árvore de cadernos e stacks (conjuntos de cadernos) na barra lateral.
import { useMemo, useState } from 'react';
import { hasNotes, getDragNotes, moveNotesTo, touchDragProps } from '../lib/dnd';
import type { Note, Notebook } from '../lib/db';
import { patch, createNotebook } from '../lib/store';
import { href, navigate } from '../lib/router';
import { useLocalPref } from '../hooks';
import { Icon, Menu, askText, toast } from '../ui';
import { newStackDialog, renameStack, dissolveStack, renameStackTo } from './stacks';
import { InlineRename } from './InlineRename';

type Entry = { kind: 'stack'; name: string; notebooks: Notebook[] } | { kind: 'nb'; nb: Notebook };

export function buildTree(notebooks: Notebook[]): Entry[] {
  const stacks = new Map<string, Notebook[]>();
  const loose: Notebook[] = [];
  for (const nb of notebooks) {
    if (nb.stack) {
      if (!stacks.has(nb.stack)) stacks.set(nb.stack, []);
      stacks.get(nb.stack)!.push(nb);
    } else loose.push(nb);
  }
  const entries: Entry[] = [
    ...[...stacks.entries()].map(([name, list]) => ({ kind: 'stack' as const, name, notebooks: list.sort((a, b) => a.name.localeCompare(b.name, 'pt')) })),
    ...loose.map((nb) => ({ kind: 'nb' as const, nb })),
  ];
  const key = (e: Entry) => (e.kind === 'stack' ? e.name : e.nb.name);
  return entries.sort((a, b) => key(a).localeCompare(key(b), 'pt', { numeric: true }));
}

/** Toque prolongado (telemóvel): alternativa ao duplo clique para mudar o nome. */
function longPress(fn: () => void) {
  let t: any;
  const cancel = () => clearTimeout(t);
  return {
    onTouchStart: () => { t = setTimeout(() => { (navigator as any).vibrate?.(15); fn(); }, 550); },
    onTouchEnd: cancel,
    onTouchMove: cancel,
    onContextMenu: (e: React.MouseEvent) => { if (matchMedia('(pointer: coarse)').matches) e.preventDefault(); },
  };
}

export function NotebookTree({ notebooks: allNotebooks, notes, active, defaultId, hideEmpty = false }: { notebooks: Notebook[]; notes: Note[]; active: (view: string, key?: string, val?: string) => unknown; defaultId?: string; hideEmpty?: boolean }) {
  const [collapsed, setCollapsed] = useLocalPref<string[]>('collapsedStacks', []);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [noteOver, setNoteOver] = useState<string | null>(null);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of notes) m.set(n.notebookId, (m.get(n.notebookId) || 0) + 1);
    return m;
  }, [notes]);
  const count = (id: string) => counts.get(id) || 0;
  // Ocultar cadernos vazios (mantém sempre o predefinido e o que está aberto)
  const notebooks = hideEmpty ? allNotebooks.filter((nb) => count(nb.id) > 0 || nb.id === defaultId || active('notes', 'nb', nb.id)) : allNotebooks;
  const countEl = (n: number) => (n > 0 ? <span className="count">{n}</span> : null);
  const toggle = (name: string) => setCollapsed(collapsed.includes(name) ? collapsed.filter((x) => x !== name) : [...collapsed, name]);

  const drop = async (e: React.DragEvent, stack: string) => {
    e.preventDefault();
    setDragOver(null);
    const id = e.dataTransfer.getData('text/flynotes-notebook');
    const nb = notebooks.find((n) => n.id === id);
    if (!nb || (nb.stack || '') === stack) return;
    await patch<Notebook>('notebooks', id, { stack });
    toast(stack ? `“${nb.name}” movido para ${stack}` : `“${nb.name}” retirado da stack`);
  };
  const dropProps = (stack: string) => ({
    onDragOver: (e: React.DragEvent) => { if (e.dataTransfer.types.includes('text/flynotes-notebook')) { e.preventDefault(); setDragOver(stack || '_root'); } },
    onDragLeave: () => setDragOver(null),
    onDrop: (e: React.DragEvent) => drop(e, stack),
  });

  const nbLink = (nb: Notebook, deeper: boolean) => editing === 'nb:' + nb.id ? (
    <div key={nb.id} className={'side-link sub editing' + (deeper ? ' deeper' : '')}>
      <Icon name={nb.id === defaultId ? 'inbox' : 'book'} size={15} />
      <InlineRename value={nb.name} onSave={(v) => patch<Notebook>('notebooks', nb.id, { name: v })} onDone={() => setEditing(null)} />
    </div>
  ) : (
    <a key={nb.id} href={href('notes', undefined, { nb: nb.id })} draggable title="Duplo clique (ou toque prolongado) para mudar o nome"
      {...touchDragProps(() => ({ kind: 'notebook', id: nb.id, label: nb.name, onTap: () => setEditing('nb:' + nb.id) }))}
      onDoubleClick={(e) => { e.preventDefault(); setEditing('nb:' + nb.id); }}
      onDragStart={(e) => { e.dataTransfer.setData('text/flynotes-notebook', nb.id); e.dataTransfer.effectAllowed = 'move'; }}
      onDragOver={(e) => { if (hasNotes(e)) { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'move'; setNoteOver(nb.id); } }}
      onDragLeave={() => setNoteOver((v) => (v === nb.id ? null : v))}
      onDrop={(e) => { if (!hasNotes(e)) return; e.preventDefault(); e.stopPropagation(); setNoteOver(null); moveNotesTo(getDragNotes(e), nb); }}
      className={'side-link sub' + (deeper ? ' deeper' : '') + (active('notes', 'nb', nb.id) ? ' active' : '') + (noteOver === nb.id ? ' drop-target' : '')}>
      <Icon name={nb.id === defaultId ? 'inbox' : 'book'} size={15} /> <span className="truncate">{nb.name}</span>
      {countEl(count(nb.id))}
    </a>
  );

  return (
    <div className={'nb-tree' + (dragOver === '_root' ? ' drop-root' : '')} {...dropProps('')}>
      {buildTree(notebooks).map((e) => e.kind === 'nb' ? nbLink(e.nb, false) : (
        <div key={'s:' + e.name} className={'stack-group' + (dragOver === e.name ? ' drop' : '')} {...dropProps(e.name)}
          onDrop={(ev) => { ev.stopPropagation(); drop(ev, e.name); }}>
          <div className={'side-link sub stack' + (active('notes', 'stack', e.name) ? ' active' : '')}>
            <button className="stack-toggle" onClick={() => toggle(e.name)} aria-label={collapsed.includes(e.name) ? 'Expandir' : 'Recolher'}>
              <Icon name={collapsed.includes(e.name) ? 'chevronRight' : 'chevronDown'} size={13} />
            </button>
            {editing === 's:' + e.name ? (
              <span className="stack-name"><Icon name="stack" size={14} /> <InlineRename value={e.name} onSave={(v) => renameStackTo(e.name, v, notebooks)} onDone={() => setEditing(null)} /></span>
            ) : (
              <a href={href('notes', undefined, { stack: e.name })} className="stack-name" title="Duplo clique (ou toque prolongado) para mudar o nome"
                {...longPress(() => setEditing('s:' + e.name))}
                onDoubleClick={(ev) => { ev.preventDefault(); setEditing('s:' + e.name); }}><Icon name="stack" size={14} /> <span className="truncate">{e.name}</span></a>
            )}
            {countEl(e.notebooks.reduce((a, nb) => a + count(nb.id), 0))}
            <Menu className="stack-menu" trigger={<button className="icon-btn small" aria-label="Opções da stack"><Icon name="more" size={14} /></button>} items={[
              { label: 'Novo caderno nesta stack', icon: 'plus', onClick: async () => { const n = await askText('Novo caderno em ' + e.name, { ok: 'Criar' }); if (n?.trim()) { const nb = await createNotebook(n.trim(), e.name); navigate('notes', undefined, { nb: nb.id }); } } },
              { label: 'Mudar o nome da stack', icon: 'edit', onClick: () => renameStack(e.name, notebooks) },
              { label: 'Desfazer stack (manter cadernos)', icon: 'close', onClick: () => dissolveStack(e.name, notebooks) },
            ]} />
          </div>
          {!collapsed.includes(e.name) && e.notebooks.map((nb) => nbLink(nb, true))}
        </div>
      ))}
      <button className="side-link sub add-stack" onClick={() => newStackDialog(notebooks)}><Icon name="plus" size={14} /> Nova stack</button>
    </div>
  );
}
