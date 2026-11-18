// Gestão de cadernos (e pilhas) e de etiquetas (hierárquicas).
import { Fragment, useRef, useState } from 'react';
import { useActiveNotes, useNotebooks, useTags, useSettings } from '../hooks';
import { createNotebook, deleteNotebook, patch, setSetting, deleteTag, getOrCreateTag, put, toggleShortcut } from '../lib/store';
import type { Notebook, Tag, Note } from '../lib/db';
import { href } from '../lib/router';
import { Icon, Menu, askText, confirmDialog, toast, chooseDialog } from '../ui';
import { groupByStack } from './pickers';
import { newStackDialog, renameStack, dissolveStack, renameStackTo } from './stacks';
import { InlineRename } from './InlineRename';
import { exportEnex } from '../lib/enex';
import { download, safeFilename, relDate, norm } from '../lib/util';

export function NotebooksView() {
  const notebooks = useNotebooks();
  const notes = useActiveNotes();
  const settings = useSettings();
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<'title' | 'updated' | 'count'>('title');
  const [asc, setAsc] = useState(true);
  const [open, setOpen] = useState<string[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const clickTimer = useRef<any>(null);
  const stacks = [...new Set(notebooks.map((n) => n.stack).filter(Boolean))] as string[];

  const stats = new Map<string, { count: number; updated: number }>();
  for (const nb of notebooks) stats.set(nb.id, { count: 0, updated: nb.updatedAt || nb.createdAt });
  for (const n of notes) {
    const s = stats.get(n.notebookId);
    if (s) { s.count++; s.updated = Math.max(s.updated, n.updatedAt); }
  }
  const filter = norm(q);
  const visible = notebooks.filter((nb) => !filter || norm(nb.name).includes(filter) || norm(nb.stack || '').includes(filter));
  const cmp = (a: { name: string; count: number; updated: number }, b: { name: string; count: number; updated: number }) => {
    const r = sort === 'title' ? a.name.localeCompare(b.name, 'pt', { numeric: true }) : sort === 'count' ? a.count - b.count : a.updated - b.updated;
    return asc ? r : -r;
  };
  const nbRow = (nb: Notebook) => ({ name: nb.name, count: stats.get(nb.id)!.count, updated: stats.get(nb.id)!.updated });
  const groups = new Map<string, Notebook[]>();
  const loose: Notebook[] = [];
  for (const nb of visible) nb.stack ? (groups.get(nb.stack) || groups.set(nb.stack, []).get(nb.stack)!).push(nb) : loose.push(nb);
  type Row = { kind: 'stack'; name: string; list: Notebook[]; count: number; updated: number } | { kind: 'nb'; nb: Notebook; name: string; count: number; updated: number };
  const rows: Row[] = [
    ...[...groups.entries()].map(([name, list]) => ({ kind: 'stack' as const, name, list: list.sort((a, b) => cmp(nbRow(a), nbRow(b))), count: list.reduce((t, nb) => t + stats.get(nb.id)!.count, 0), updated: Math.max(...list.map((nb) => stats.get(nb.id)!.updated)) })),
    ...loose.map((nb) => ({ kind: 'nb' as const, nb, ...nbRow(nb) })),
  ].sort(cmp);
  const isOpen = (name: string) => !!filter || open.includes(name);

  const add = async (stack?: string) => {
    const name = await askText(stack ? `Novo caderno em ${stack}` : 'Novo caderno', { placeholder: 'Nome do caderno', ok: 'Criar' });
    if (name?.trim()) await createNotebook(name.trim(), stack);
  };
  const setStack = async (nb: Notebook) => {
    const options = [...stacks.map((s) => ({ value: s, label: s, icon: '📚' })), { value: '__new', label: 'Nova stack…', icon: '➕' }];
    if (nb.stack) options.push({ value: '__none', label: 'Remover da stack', icon: '✖️' });
    const v = await chooseDialog('Mover para stack', options);
    if (!v) return;
    if (v === '__none') return patch<Notebook>('notebooks', nb.id, { stack: '' });
    if (v === '__new') {
      const s = await askText('Nome da stack', { ok: 'Criar' });
      if (s?.trim()) await patch<Notebook>('notebooks', nb.id, { stack: s.trim() });
      return;
    }
    await patch<Notebook>('notebooks', nb.id, { stack: v });
  };
  const header = (key: typeof sort, label: string, cls = '') => (
    <th className={'sortable ' + cls} onClick={() => (sort === key ? setAsc(!asc) : (setSort(key), setAsc(key === 'title')))}>
      {label} {sort === key && (asc ? '↑' : '↓')}
    </th>
  );
  const nbMenu = (nb: Notebook) => (
    <Menu trigger={<button className="icon-btn small"><Icon name="more" size={16} /></button>} items={[
      { label: 'Abrir', icon: 'notes', onClick: () => { location.hash = href('notes', undefined, { nb: nb.id }); } },
      { label: 'Mudar o nome', icon: 'edit', onClick: async () => { const n = await askText('Mudar o nome do caderno', { initial: nb.name }); if (n?.trim()) await patch<Notebook>('notebooks', nb.id, { name: n.trim() }); } },
      { label: 'Mover para stack…', icon: 'stack', onClick: () => setStack(nb) },
      { label: 'Tornar predefinido', icon: 'inbox', onClick: () => setSetting('defaultNotebookId', nb.id) },
      { label: 'Adicionar aos atalhos', icon: 'star', onClick: async () => toast((await toggleShortcut('notebook', nb.id)) ? 'Adicionado aos atalhos' : 'Removido dos atalhos') },
      { label: 'Exportar (.enex)', icon: 'download', onClick: async () => download(safeFilename(nb.name) + '.enex', await exportEnex(notes.filter((n) => n.notebookId === nb.id)), 'application/xml') },
      { divider: true },
      { label: 'Eliminar caderno', icon: 'trash', danger: true, onClick: async () => {
        if (notebooks.length <= 1) return toast('Precisa de pelo menos um caderno');
        if (await confirmDialog(`Eliminar “${nb.name}”? As notas deste caderno vão para o lixo.`, { danger: true, ok: 'Eliminar' })) await deleteNotebook(nb.id);
      } },
    ]} />
  );
  const nbTr = (nb: Notebook, inStack: boolean) => (
    <tr key={nb.id} className="nb-row">
      <td className={inStack ? 'indent' : ''}>
        {editing === 'nb:' + nb.id ? (
          <span className="row gap"><Icon name={settings.defaultNotebookId === nb.id ? 'inbox' : 'book'} size={15} />
            <InlineRename className="wide" value={nb.name} onSave={(v) => patch<Notebook>('notebooks', nb.id, { name: v })} onDone={() => setEditing(null)} /></span>
        ) : (
          <a href={href('notes', undefined, { nb: nb.id })} title="Clique para abrir · duplo clique para mudar o nome"
            onClick={(e) => { e.preventDefault(); clearTimeout(clickTimer.current); const h = href('notes', undefined, { nb: nb.id }); clickTimer.current = setTimeout(() => { location.hash = h; }, 260); }}
            onDoubleClick={(e) => { e.preventDefault(); clearTimeout(clickTimer.current); setEditing('nb:' + nb.id); }}>
            <Icon name={settings.defaultNotebookId === nb.id ? 'inbox' : 'book'} size={15} /> {nb.name}
            <small className="muted">{stats.get(nb.id)!.count}</small>
          </a>
        )}
        {settings.defaultNotebookId === nb.id && <span className="badge">Predefinido</span>}
      </td>
      <td className="muted">{relDate(stats.get(nb.id)!.updated)}</td>
      <td className="muted hide-sm">{relDate(nb.createdAt)}</td>
      <td className="actions">{nbMenu(nb)}</td>
    </tr>
  );

  return (
    <div className="page wide-page">
      <header className="page-head">
        <h1>Cadernos <small className="muted count-title">{notebooks.length}</small></h1>
        <span className="flex-1" />
        <div className="search-box inline-search">
          <Icon name="search" size={15} />
          <input type="search" placeholder="Localizar cadernos…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </header>
      <div className="row gap wrap toolbar-row">
        <button className="btn primary" onClick={() => add()}><Icon name="plus" size={16} /> Novo caderno</button>
        <button className="btn" onClick={() => newStackDialog(notebooks)}><Icon name="stack" size={16} /> Nova stack</button>
        <span className="flex-1" />
        <button className="btn small" onClick={() => setOpen(open.length ? [] : stacks)}>{open.length ? 'Recolher tudo' : 'Expandir tudo'}</button>
      </div>
      <table className="table nb-table">
        <thead><tr>{header('title', 'Título')}{header('updated', 'Atualizado')}<th className="hide-sm">Criado</th><th /></tr></thead>
        <tbody>
          {rows.map((r) => r.kind === 'nb' ? nbTr(r.nb, false) : (
            <Fragment key={'s' + r.name}>
              <tr className="stack-row" onClick={() => setOpen(isOpen(r.name) ? open.filter((x) => x !== r.name) : [...open, r.name])}>
                <td>
                  <span className="row-toggle"><Icon name={isOpen(r.name) ? 'chevronDown' : 'chevronRight'} size={14} /></span>
                  <Icon name="stack" size={15} />{' '}
                  {editing === 's:' + r.name
                    ? <InlineRename className="wide" value={r.name} onSave={(v) => renameStackTo(r.name, v, notebooks)} onDone={() => setEditing(null)} />
                    : <strong title="Duplo clique para mudar o nome" onDoubleClick={(e) => { e.stopPropagation(); setEditing('s:' + r.name); }}>{r.name}</strong>}
                  {' '}<small className="muted">{r.list.length} cadernos · {r.count} notas</small>
                </td>
                <td className="muted">{relDate(r.updated)}</td>
                <td className="hide-sm" />
                <td className="actions" onClick={(e) => e.stopPropagation()}>
                  <Menu trigger={<button className="icon-btn small"><Icon name="more" size={16} /></button>} items={[
                    { label: 'Ver notas da stack', icon: 'notes', onClick: () => { location.hash = href('notes', undefined, { stack: r.name }); } },
                    { label: 'Novo caderno nesta stack', icon: 'plus', onClick: () => add(r.name) },
                    { label: 'Mudar o nome da stack', icon: 'edit', onClick: () => renameStack(r.name, notebooks) },
                    { label: 'Desfazer stack (manter cadernos)', icon: 'close', onClick: () => dissolveStack(r.name, notebooks) },
                  ]} />
                </td>
              </tr>
              {isOpen(r.name) && r.list.map((nb) => nbTr(nb, true))}
            </Fragment>
          ))}
          {!rows.length && <tr><td colSpan={4} className="muted center">Nenhum caderno encontrado.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

export function TagsView() {
  const tags = useTags();
  const notes = useActiveNotes();
  const counts = new Map<string, number>();
  for (const n of notes) for (const t of n.tagIds) counts.set(t, (counts.get(t) || 0) + 1);
  const roots = tags.filter((t) => !t.parentId || !tags.find((x) => x.id === t.parentId));

  return (
    <div className="page">
      <header className="page-head">
        <h1>Etiquetas</h1>
        <span className="flex-1" />
        <button className="btn primary" onClick={async () => { const n = await askText('Nova etiqueta', { ok: 'Criar' }); if (n?.trim()) await getOrCreateTag(n); }}><Icon name="plus" size={16} /> Nova etiqueta</button>
      </header>
      <p className="muted">As etiquetas podem ser organizadas em hierarquia: uma etiqueta “mãe” mostra também as notas das etiquetas “filhas”.</p>
      {!tags.length && <p className="muted">Ainda não há etiquetas. Adicione-as a partir de qualquer nota.</p>}
      <div className="tag-tree">
        {roots.map((t) => <TagNode key={t.id} tag={t} tags={tags} counts={counts} notes={notes} depth={0} />)}
      </div>
    </div>
  );
}

function TagNode({ tag, tags, counts, notes, depth }: { tag: Tag; tags: Tag[]; counts: Map<string, number>; notes: Note[]; depth: number }) {
  const kids = tags.filter((t) => t.parentId === tag.id);
  const descendants = (id: string): string[] => [id, ...tags.filter((t) => t.parentId === id).flatMap((t) => descendants(t.id))];
  return (
    <>
      <div className="tag-node" style={{ paddingLeft: depth * 22 }}>
        <a href={href('notes', undefined, { tag: tag.id })} className="chip">{tag.name} <small>{counts.get(tag.id) || 0}</small></a>
        <span className="flex-1" />
        <Menu trigger={<button className="icon-btn small"><Icon name="more" size={16} /></button>} items={[
          { label: 'Renomear', icon: 'edit', onClick: async () => { const n = await askText('Renomear etiqueta', { initial: tag.name }); if (n?.trim()) await patch<Tag>('tags', tag.id, { name: n.trim() }); } },
          { label: 'Mover para dentro de…', icon: 'move', onClick: async () => {
            const banned = new Set(descendants(tag.id));
            const v = await chooseDialog('Etiqueta mãe', [{ value: '__root', label: '(Nível superior)', icon: '⬆️' }, ...tags.filter((t) => !banned.has(t.id)).map((t) => ({ value: t.id, label: t.name, icon: '🏷️' }))]);
            if (v) await patch<Tag>('tags', tag.id, { parentId: v === '__root' ? null : v });
          } },
          { label: 'Juntar com outra etiqueta…', icon: 'copy', onClick: async () => {
            const v = await chooseDialog(`Juntar “${tag.name}” com`, tags.filter((t) => t.id !== tag.id).map((t) => ({ value: t.id, label: t.name, icon: '🏷️' })));
            if (!v) return;
            for (const n of notes.filter((n) => n.tagIds.includes(tag.id))) await put('notes', { ...n, tagIds: [...new Set(n.tagIds.map((x) => (x === tag.id ? v : x)))] });
            await deleteTag(tag.id);
            toast('Etiquetas juntas');
          } },
          { label: 'Adicionar aos atalhos', icon: 'star', onClick: async () => toast((await toggleShortcut('tag', tag.id)) ? 'Adicionada aos atalhos' : 'Removida dos atalhos') },
          { divider: true },
          { label: 'Eliminar etiqueta', icon: 'trash', danger: true, onClick: async () => { if (await confirmDialog(`Eliminar a etiqueta “${tag.name}”? As notas não são apagadas.`, { danger: true, ok: 'Eliminar' })) await deleteTag(tag.id); } },
        ]} />
      </div>
      {depth < 6 && kids.map((k) => <TagNode key={k.id} tag={k} tags={tags} counts={counts} notes={notes} depth={depth + 1} />)}
    </>
  );
}
