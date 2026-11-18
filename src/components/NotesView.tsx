import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Note } from '../lib/db';
import { useAllNotes, useNotebooks, useTags, useSearchContext, useLocalPref, useSettings } from '../hooks';
import { searchNotes, snippetFor, highlightTerms } from '../lib/search';
import { createNote, put, trashNote, restoreNote, deleteNoteForever, emptyTrash, toggleShortcut, getOrCreateTag } from '../lib/store';
import { relDate, uid, escapeHtml, norm } from '../lib/util';
import { navigate, openNote, closeNote, type Route } from '../lib/router';
import { openInNewTab } from '../lib/tabs';
import { Icon, Menu, Empty, toast, confirmDialog, askText, useMedia } from '../ui';
import { NoteEditor } from './NoteEditor';
import { pickNotebook, pickTemplate } from './pickers';
import { exportEnex } from '../lib/enex';
import { setDragNotes, touchDragProps } from '../lib/dnd';
import { download } from '../lib/util';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';

type Sort = 'updated' | 'created' | 'title' | 'relevance';
type Mode = 'snippets' | 'cards' | 'list';

export function NotesView({ route }: { route: Route }) {
  const isMobile = useMedia('(max-width: 820px)');
  const coarse = useMedia('(pointer: coarse)');
  const all = useAllNotes();
  const notebooks = useNotebooks();
  const tags = useTags();
  const ctx = useSearchContext();
  const settings = useSettings();
  const [sort, setSort] = useLocalPref<Sort>('sort', 'updated');
  const [mode, setMode] = useLocalPref<Mode>('mode', 'snippets');
  const [expanded] = useLocalPref<boolean>('editorExpanded', false);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const trash = route.view === 'trash';
  const nbId = route.params.get('nb') || undefined;
  const tagId = route.params.get('tag') || undefined;
  const stack = route.params.get('stack') || undefined;
  const filter = route.params.get('filter') || undefined;
  const q = route.params.get('q') || '';
  const [query, setQuery] = useState(q);
  useEffect(() => setQuery(q), [q]);

  const nb = notebooks.find((n) => n.id === nbId);
  const tag = tags.find((t) => t.id === tagId);
  const savedSearch = useLiveQuery(() => (route.params.get('ss') ? db.searches.get(route.params.get('ss')!) : undefined), [route.params.get('ss')]);

  const { list, title } = useMemo(() => {
    let notes = (all || []).filter((n) => (trash ? n.trashed : !n.trashed));
    let title = trash ? 'Lixo' : route.view === 'search' ? 'Pesquisa' : 'Todas as notas';
    if (nbId) { notes = notes.filter((n) => n.notebookId === nbId); title = nb?.name || 'Caderno'; }
    if (stack) {
      const ids = new Set(notebooks.filter((n) => n.stack === stack).map((n) => n.id));
      notes = notes.filter((n) => ids.has(n.notebookId));
      title = stack;
    }
    if (tagId) {
      const descendants = new Set([tagId]);
      let grew = true;
      while (grew) { grew = false; for (const t of tags) if (t.parentId && descendants.has(t.parentId) && !descendants.has(t.id)) { descendants.add(t.id); grew = true; } }
      notes = notes.filter((n) => n.tagIds.some((t) => descendants.has(t)));
      title = '#' + (tag?.name || 'etiqueta');
    }
    if (filter === 'reminders') { notes = notes.filter((n) => n.reminderAt && !n.reminderDone); title = 'Lembretes'; }
    if (filter === 'untagged') { notes = notes.filter((n) => !n.tagIds.length); title = 'Notas sem etiqueta'; }
    if (filter === 'todo') { notes = notes.filter((n) => n.hasTodo && !n.todoDone); title = 'Listas por concluir'; }
    let hits = searchNotes(notes, q, ctx);
    if (q) title = savedSearch?.name || `Pesquisa: ${q}`;
    const s = q && sort === 'relevance' ? 'relevance' : sort;
    if (s !== 'relevance') {
      hits = [...hits].sort((a, b) => s === 'title' ? (a.note.title || '').localeCompare(b.note.title || '', 'pt') : s === 'created' ? b.note.createdAt - a.note.createdAt : b.note.updatedAt - a.note.updatedAt);
    }
    if (filter === 'reminders') hits.sort((a, b) => (a.note.reminderAt || 0) - (b.note.reminderAt || 0));
    if (!trash) hits.sort((a, b) => (b.note.pinned || 0) - (a.note.pinned || 0));
    return { list: hits.map((h) => h.note), title };
  }, [all, trash, nbId, tagId, stack, filter, q, ctx, sort, nb, tag, notebooks, tags, savedSearch]);

  const terms = useMemo(() => highlightTerms(q), [q]);
  const nbById = useMemo(() => new Map(notebooks.map((n) => [n.id, n])), [notebooks]);
  const tagById = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags]);
  // Desenho progressivo da lista: 80 notas de cada vez, mais ao chegar ao fim (milhares de notas sem bloquear)
  const PAGE = 80;
  const [shown, setShown] = useState(PAGE);
  useEffect(() => setShown(PAGE), [trash, nbId, tagId, stack, filter, q, sort]);
  const activeIdx = route.noteId ? list.findIndex((n) => n.id === route.noteId) : -1;
  const sentinelObs = useRef<IntersectionObserver | null>(null);
  const sentinel = useCallback((el: HTMLDivElement | null) => {
    sentinelObs.current?.disconnect();
    if (!el) return;
    sentinelObs.current = new IntersectionObserver((e) => { if (e[0].isIntersecting) setShown((n) => n + PAGE); }, { rootMargin: '600px' });
    sentinelObs.current.observe(el);
  }, []);
  const params = () => { const p: Record<string, string> = {}; route.params.forEach((v, k) => (p[k] = v)); return p; };

  const runSearch = (v: string) => navigate(route.view, undefined, { ...params(), q: v || undefined, ss: undefined }, true);

  const newNote = async (withTemplate = false) => {
    let base = { title: '', content: '' };
    if (withTemplate) {
      const t = await pickTemplate();
      if (!t) return;
      base = t;
    }
    const tagIds = tagId ? [tagId] : [];
    const n = await createNote({ ...base, notebookId: nbId || undefined, tagIds });
    navigate('notes', n.id, nbId ? { nb: nbId } : tagId ? { tag: tagId } : {});
  };

  const toggleSel = (id: string) => {
    const s = new Set(selected);
    s.has(id) ? s.delete(id) : s.add(id);
    setSelected(s);
  };
  const bulk = async (action: string) => {
    const ids = [...selected];
    if (!ids.length) return;
    if (action === 'trash') { for (const id of ids) await trashNote(id); toast(`${ids.length} nota(s) movida(s) para o lixo`); }
    if (action === 'restore') for (const id of ids) await restoreNote(id);
    if (action === 'delete' && await confirmDialog(`Eliminar ${ids.length} nota(s) para sempre?`, { danger: true, ok: 'Eliminar' })) for (const id of ids) await deleteNoteForever(id);
    if (action === 'move') { const to = await pickNotebook(); if (to) for (const id of ids) { const n = await db.notes.get(id); if (n) await put('notes', { ...n, notebookId: to }); } }
    if (action === 'tag') {
      const name = await askText('Adicionar etiqueta às notas selecionadas', { placeholder: 'Etiqueta' });
      if (name?.trim()) { const t = await getOrCreateTag(name); for (const id of ids) { const n = await db.notes.get(id); if (n && !n.tagIds.includes(t.id)) await put('notes', { ...n, tagIds: [...n.tagIds, t.id] }); } }
    }
    if (action === 'export') { const notes = (await db.notes.bulkGet(ids)).filter(Boolean) as Note[]; download('flynotes-export.enex', await exportEnex(notes), 'application/xml'); }
    setSelected(new Set());
    setSelecting(false);
  };

  const showEditor = !!route.noteId;
  const listPane = (
    <section className={'list-pane' + (mode === 'cards' ? ' cards-mode' : '')}>
      <header className="list-head">
        <div className="list-title-row">
          {isMobile && <button className="icon-btn" onClick={() => navigate('home')} aria-label="Início"><Icon name="back" /></button>}
          <h2 className="truncate">{title}</h2>
          <span className="flex-1" />
          {!trash && (nbId || tagId || q) && (
            <button className={'icon-btn' + (isShortcutActive(settings, nbId, tagId, route.params.get('ss')) ? ' accent' : '')} title="Atalho"
              onClick={async () => {
                if (nbId) toast((await toggleShortcut('notebook', nbId)) ? 'Caderno nos atalhos' : 'Removido dos atalhos');
                else if (tagId) toast((await toggleShortcut('tag', tagId)) ? 'Etiqueta nos atalhos' : 'Removida dos atalhos');
                else if (q) {
                  let ssId = route.params.get('ss');
                  if (!ssId) {
                    const name = await askText('Guardar pesquisa', { initial: q, ok: 'Guardar' });
                    if (!name) return;
                    ssId = uid();
                    await put('searches', { id: ssId, name, query: q, updatedAt: 0 });
                    navigate(route.view, undefined, { ...params(), ss: ssId }, true);
                  }
                  toast((await toggleShortcut('search', ssId)) ? 'Pesquisa guardada nos atalhos' : 'Removida dos atalhos');
                }
              }}><Icon name="star" fill={isShortcutActive(settings, nbId, tagId, route.params.get('ss'))} /></button>
          )}
          <Menu trigger={<button className="icon-btn" aria-label="Opções da lista"><Icon name="sort" /></button>} items={[
            { label: 'Data de atualização', checked: sort === 'updated', onClick: () => setSort('updated') },
            { label: 'Data de criação', checked: sort === 'created', onClick: () => setSort('created') },
            { label: 'Título', checked: sort === 'title', onClick: () => setSort('title') },
            ...(q ? [{ label: 'Relevância', checked: sort === 'relevance', onClick: () => setSort('relevance') }] : []),
            { divider: true },
            { label: 'Excertos', icon: 'rows', checked: mode === 'snippets', onClick: () => setMode('snippets') },
            { label: 'Cartões', icon: 'grid', checked: mode === 'cards', onClick: () => setMode('cards') },
            { label: 'Lista compacta', icon: 'list', checked: mode === 'list', onClick: () => setMode('list') },
            { divider: true },
            { label: selecting ? 'Cancelar seleção' : 'Selecionar notas', icon: 'checkCircle', onClick: () => { setSelecting(!selecting); setSelected(new Set()); } },
            ...(trash ? [{ label: 'Esvaziar lixo', icon: 'trash', danger: true, onClick: async () => { if (await confirmDialog('Eliminar definitivamente todas as notas do lixo?', { danger: true, ok: 'Esvaziar' })) { await emptyTrash(); toast('Lixo esvaziado'); } } }] : []),
          ]} />
        </div>
        <form className="search-box" onSubmit={(e) => { e.preventDefault(); runSearch(query); }}>
          <Icon name="search" size={16} />
          <input type="search" autoFocus={route.view === 'search' && !route.noteId} placeholder={trash ? 'Procurar no lixo' : 'Procurar notas…'} value={query} onChange={(e) => setQuery(e.target.value)}
            onBlur={() => query !== q && runSearch(query)} enterKeyHint="search" />
          {query && <button type="button" className="icon-btn small" onClick={() => { setQuery(''); runSearch(''); }}><Icon name="close" size={14} /></button>}
        </form>
        <div className="list-sub muted">
          {list.length} {list.length === 1 ? 'nota' : 'notas'}
          {nb?.stack && <> · <Icon name="stack" size={12} /> {nb.stack}</>}
        </div>
        {selecting && (
          <div className="bulk-bar">
            <span>{selected.size} selecionada(s)</span>
            <button className="link-btn" onClick={() => setSelected(new Set(list.map((n) => n.id)))}>Todas</button>
            <span className="flex-1" />
            {trash ? <>
              <button className="btn small" onClick={() => bulk('restore')}>Restaurar</button>
              <button className="btn small danger" onClick={() => bulk('delete')}>Eliminar</button>
            </> : <>
              <button className="btn small" onClick={() => bulk('move')} title="Mover"><Icon name="move" size={14} /></button>
              <button className="btn small" onClick={() => bulk('tag')} title="Etiquetar"><Icon name="tag" size={14} /></button>
              <button className="btn small" onClick={() => bulk('export')} title="Exportar"><Icon name="download" size={14} /></button>
              <button className="btn small danger" onClick={() => bulk('trash')} title="Lixo"><Icon name="trash" size={14} /></button>
            </>}
          </div>
        )}
      </header>
      <div className="note-list" role="list">
        {all === undefined ? null : list.length === 0 ? (
          trash ? <Empty icon="trash" title="O lixo está vazio" text="As notas eliminadas aparecem aqui e podem ser restauradas." />
            : q ? <Empty icon="search" title="Sem resultados" text="Experimente outras palavras ou operadores como tag:, notebook:, intitle:, todo:true, created:day-7." />
              : <Empty icon="note" title="Ainda não há notas aqui" text="Crie a primeira nota para começar.">
                <button className="btn primary" onClick={() => newNote()}><Icon name="plus" size={16} /> Nova nota</button>
              </Empty>
) : <>{list.slice(0, Math.max(shown, activeIdx + 20)).map((n) => (
          <NoteCard key={n.id} note={n} mode={mode} active={n.id === route.noteId} terms={terms} query={q}
            notebookName={!nbId ? nbById.get(n.notebookId)?.name : undefined}
            tagNames={n.tagIds.map((id) => tagById.get(id)?.name).filter(Boolean) as string[]}
            selecting={selecting} selected={selected.has(n.id)}
            dragIds={trash ? undefined : selecting && selected.has(n.id) ? [...selected] : [n.id]}
            touchDrag={!trash && coarse}
            onClick={(e) => (selecting ? toggleSel(n.id) : (e.ctrlKey || e.metaKey) && !isMobile ? openInNewTab(n.id) : openNote(n.id))}
            onMiddleClick={() => !isMobile && openInNewTab(n.id)} />
        ))}
        {list.length > Math.max(shown, activeIdx + 20) && <div ref={sentinel} className="list-more muted">A carregar mais notas…</div>}
        </>}
      </div>
      {!trash && !isMobile && (
        <div className="list-foot">
          <button className="btn primary block" onClick={() => newNote()}><Icon name="plus" size={16} /> Nova nota</button>
          <button className="btn" title="Nova nota a partir de modelo" onClick={() => newNote(true)}><Icon name="template" size={16} /></button>
        </div>
      )}
    </section>
  );

  if (isMobile) {
    return showEditor ? <NoteEditor noteId={route.noteId!} onBack={closeNote} /> : listPane;
  }
  return (
    <div className="notes-layout">
      {!(expanded && showEditor) && listPane}
      {showEditor ? <NoteEditor noteId={route.noteId!} /> : (
        <div className="editor-pane empty-editor">
          <Empty icon="plane" title="Selecione uma nota" text="Ou crie uma nova com Ctrl+Alt+N." />
        </div>
      )}
    </div>
  );
}

function isShortcutActive(settings: any, nbId?: string, tagId?: string, ssId?: string | null) {
  const s = settings.shortcuts || [];
  if (nbId) return s.some((x: any) => x.kind === 'notebook' && x.id === nbId);
  if (tagId) return s.some((x: any) => x.kind === 'tag' && x.id === tagId);
  if (ssId) return s.some((x: any) => x.kind === 'search' && x.id === ssId);
  return false;
}

export function NoteCard({ note, mode, active, terms, query, notebookName, tagNames, onClick, onMiddleClick, selecting, selected, dragIds, touchDrag }: {
  note: Note; mode: Mode; active?: boolean; terms: string[]; query: string; notebookName?: string; tagNames: string[];
  onClick: (e: React.MouseEvent) => void; onMiddleClick?: () => void; selecting?: boolean; selected?: boolean; dragIds?: string[]; touchDrag?: boolean;
}) {
  // Telemóvel: toque prolongado levanta a nota e mostra os destinos
  const touch = useMemo(() => touchDragProps(() => (touchDrag && dragIdsRef.current ? { kind: 'notes', ids: dragIdsRef.current, label: dragIdsRef.current.length > 1 ? `${dragIdsRef.current.length} notas` : noteTitleRef.current } : null)), [touchDrag]);
  const dragIdsRef = useRef(dragIds);
  dragIdsRef.current = dragIds;
  const noteTitleRef = useRef('');
  noteTitleRef.current = note.title || 'Sem título';
  const thumb = useMemo(() => note.content.match(/<img[^>]+src="([^"]+)"/)?.[1], [note.content]);
  const hasFiles = note.content.includes('data-type="file"');
  const snippet = note.locked ? '🔒 Conteúdo encriptado' : snippetFor(note.text, query, mode === 'cards' ? 220 : 140);
  return (
    <div role="listitem" tabIndex={0} aria-current={active ? 'true' : undefined} className={`note-card ${mode}` + (active ? ' active' : '') + (selected ? ' selected' : '')} onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(e as any); }
        else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          const sib = (e.key === 'ArrowDown' ? e.currentTarget.nextElementSibling : e.currentTarget.previousElementSibling) as HTMLElement | null;
          if (sib?.classList.contains('note-card')) sib.focus();
        }
      }}
      onAuxClick={(e) => { if (e.button === 1 && onMiddleClick) { e.preventDefault(); onMiddleClick(); } }}
      {...(touchDrag ? touch : {})}
      draggable={!!dragIds && !touchDrag}
      onDragStart={dragIds && !touchDrag ? (e) => { setDragNotes(e, dragIds); e.currentTarget.classList.add('dragging'); } : undefined}
      onDragEnd={(e) => e.currentTarget.classList.remove('dragging')}
      title={dragIds ? 'Arraste para um caderno ou para o lixo · Ctrl+clique abre num novo separador' : 'Ctrl+clique para abrir num novo separador'}>
      {selecting && <span className={'sel-box' + (selected ? ' on' : '')}>{selected && <Icon name="check" size={12} />}</span>}
      <div className="note-card-body">
        <div className="note-card-title">
          {note.pinned ? <Icon name="pin" size={13} className="accent-text" /> : null}
          <Highlight text={note.title || 'Sem título'} terms={terms} />
        </div>
        {mode !== 'list' && <div className="note-card-snippet"><Highlight text={snippet} terms={terms} /></div>}
        <div className="note-card-meta">
          <span>{relDate(note.updatedAt)}</span>
          {notebookName && <span className="truncate"><Icon name="book" size={11} /> {notebookName}</span>}
          {note.reminderAt && !note.reminderDone ? <Icon name="bell" size={12} /> : null}
          {hasFiles && <Icon name="clip" size={12} />}
          {note.hasTodo ? <Icon name="checkCircle" size={12} /> : null}
          {note.locked ? <Icon name="lock" size={12} /> : null}
          {mode !== 'list' && tagNames.slice(0, 3).map((t) => <span key={t} className="mini-tag">{t}</span>)}
        </div>
      </div>
      {thumb && mode !== 'list' && <img className="note-thumb" src={thumb} alt="" loading="lazy" />}
    </div>
  );
}

export function Highlight({ text, terms }: { text: string; terms: string[] }): ReactNode {
  if (!terms.length) return text;
  const n = norm(text);
  const marks: [number, number][] = [];
  for (const t of terms) {
    let i = n.indexOf(t);
    while (i >= 0 && marks.length < 50) { marks.push([i, i + t.length]); i = n.indexOf(t, i + t.length); }
  }
  if (!marks.length) return text;
  marks.sort((a, b) => a[0] - b[0]);
  const out: ReactNode[] = [];
  let pos = 0;
  marks.forEach(([s, e], k) => {
    if (s < pos) return;
    out.push(text.slice(pos, s), <mark key={k}>{text.slice(s, e)}</mark>);
    pos = e;
  });
  out.push(text.slice(pos));
  return <>{out}</>;
}

export { escapeHtml };
