import { useState } from 'react';
import { useLocalPref } from '../hooks';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { alive, createNote, createTask } from '../lib/store';
import { useNotebooks, useTags, useSettings, useActiveNotes, useSyncStatus } from '../hooks';
import { navigate, href, type Route } from '../lib/router';
import { Icon, Menu, LogoMark } from '../ui';
import { pickTemplate } from './pickers';
import { NotebookTree } from './NotebookTree';
import { hasNotes, hasNotebook, getDragNotes, trashNotes, trashEmptyNotebook, NOTEBOOK_TYPE } from '../lib/dnd';
import { syncNow } from '../lib/sync';
import { editTask } from './NoteEditor';
import { relDate } from '../lib/util';

export function Sidebar({ route, collapsed }: { route: Route; collapsed?: boolean }) {
  const notebooks = useNotebooks();
  const tags = useTags();
  const settings = useSettings();
  const notes = useActiveNotes();
  const searches = useLiveQuery(async () => alive(await db.searches.toArray()), []) || [];
  const [openNb, setOpenNb] = useState(true);
  const [trashOver, setTrashOver] = useState(false);
  const [hideEmpty, setHideEmpty] = useLocalPref<boolean>('hideEmptyNotebooks', false);
  const [openTags, setOpenTags] = useState(false);
  const [openSc, setOpenSc] = useState(true);
  const [q, setQ] = useState('');
  const [sideTheme] = useLocalPref<string>('sidebarTheme', 'dark');
  const sync = useSyncStatus();
  const lastSync = useLiveQuery(() => db.meta.get('lastSyncAt'), []);
  const trashCount = useLiveQuery(async () => alive(await db.notes.where('trashed').equals(1).toArray()).length, []) || 0;
  const openTasks = useLiveQuery(async () => alive(await db.tasks.where('done').equals(0).toArray()).length, []) || 0;

  const active = (view: string, key?: string, val?: string) =>
    route.view === view && (!key || route.params.get(key) === val) && (key || ![...route.params.keys()].some((k) => ['nb', 'tag', 'q', 'filter', 'stack'].includes(k)));

  const newNote = async () => {
    const n = await createNote({ notebookId: route.params.get('nb') || undefined });
    navigate('notes', n.id, route.params.get('nb') ? { nb: route.params.get('nb')! } : {});
  };

  const shortcuts = (settings.shortcuts || []).map((s) => {
    if (s.kind === 'note') { const n = notes.find((x) => x.id === s.id); return n && { key: s.kind + s.id, icon: 'note', label: n.title || 'Sem título', href: `#/note/${n.id}` }; }
    if (s.kind === 'notebook') { const n = notebooks.find((x) => x.id === s.id); return n && { key: s.kind + s.id, icon: 'book', label: n.name, href: href('notes', undefined, { nb: n.id }) }; }
    if (s.kind === 'tag') { const t = tags.find((x) => x.id === s.id); return t && { key: s.kind + s.id, icon: 'tag', label: t.name, href: href('notes', undefined, { tag: t.id }) }; }
    if (s.kind === 'search') { const q = searches.find((x) => x.id === s.id); return q && { key: s.kind + s.id, icon: 'search', label: q.name, href: href('notes', undefined, { q: q.query, ss: q.id }) }; }
    return null;
  }).filter(Boolean) as { key: string; icon: string; label: string; href: string }[];

  const rootTags = tags.filter((t) => !t.parentId || !tags.find((x) => x.id === t.parentId));

  return (
    <aside className={'sidebar' + (collapsed ? ' collapsed' : '') + (sideTheme !== 'dark' ? ' ' + sideTheme : '')}>
      <div className="brand">
        <span className="brand-logo"><LogoMark size={19} /></span>
        <span className="brand-name">FlyNotes</span>
        <span className="flex-1" />
        <button className={'icon-btn small sync-' + sync.status} title={syncTitle(sync.status, lastSync?.value)} onClick={() => syncNow()}>
          <Icon name={sync.status === 'offline' ? 'cloudOff' : 'sync'} size={15} className={sync.status === 'syncing' ? 'spin' : ''} />
        </button>
      </div>

      <form className="side-search" onSubmit={(e) => { e.preventDefault(); navigate('notes', undefined, q.trim() ? { q: q.trim() } : {}); setQ(''); }}>
        <Icon name="search" size={15} />
        <input id="side-search" type="search" placeholder="Pesquisar" value={q} onChange={(e) => setQ(e.target.value)} />
        <kbd>Ctrl+K</kbd>
      </form>

      <div className="new-row">
        <button className="btn primary new-btn" onClick={newNote}><Icon name="plus" size={17} /> Nota</button>
        <button className="quick-icon" title="Nova tarefa" onClick={async () => { const t = await createTask({ title: '' }); editTask(t); }}><Icon name="checkCircle" size={17} /></button>
        <button className="quick-icon" title="Novo evento no calendário (tarefa com data)" onClick={async () => { const d = new Date(); d.setHours(d.getHours() + 1, 0, 0, 0); const t = await createTask({ title: '', due: d.getTime() }); editTask(t); }}><Icon name="calendar" size={17} /></button>
        <button className="quick-icon" title="Nota a partir de modelo" onClick={async () => { const t = await pickTemplate(); if (t) { const n = await createNote(t); navigate('notes', n.id); } }}><Icon name="template" size={17} /></button>
        <Menu trigger={<button className="quick-icon" aria-label="Mais opções de criação"><Icon name="more" size={17} /></button>} items={[
          { label: 'Recortar página web', icon: 'globe', onClick: () => navigate('clip') },
          { label: 'Fotografia / digitalizar', icon: 'camera', onClick: async () => { const n = await createNote(); navigate('notes', n.id); setTimeout(() => window.dispatchEvent(new CustomEvent('fn:insert', { detail: 'photo' })), 400); } },
          { label: 'Nota de voz', icon: 'mic', onClick: async () => { const n = await createNote(); navigate('notes', n.id); setTimeout(() => window.dispatchEvent(new CustomEvent('fn:insert', { detail: 'audio' })), 400); } },
        ]} />
      </div>

      <nav className="side-nav">
        <a href="#/home" className={'side-link' + (route.view === 'home' ? ' active' : '')}><Icon name="home" /> Início</a>
        <a href="#/shortcuts" className={'side-link' + (route.view === 'shortcuts' ? ' active' : '')}><Icon name="star" /> Atalhos</a>
        <a href="#/notes" className={'side-link' + (active('notes') ? ' active' : '')}><Icon name="notes" /> Notas <span className="count">{notes.length}</span></a>
        <a href="#/tasks" className={'side-link' + (route.view === 'tasks' ? ' active' : '')}><Icon name="checkCircle" /> Tarefas {openTasks > 0 && <span className="count">{openTasks}</span>}</a>
        <a href="#/calendar" className={'side-link' + (route.view === 'calendar' ? ' active' : '')}><Icon name="calendar" /> Calendário</a>
        <a href="#/files" className={'side-link' + (route.view === 'files' ? ' active' : '')}><Icon name="clip" /> Ficheiros</a>
        <a href={href('notes', undefined, { filter: 'reminders' })} className={'side-link' + (active('notes', 'filter', 'reminders') ? ' active' : '')}><Icon name="bell" /> Lembretes</a>
        <a href="#/templates" className={'side-link' + (route.view === 'templates' ? ' active' : '')}><Icon name="template" /> Modelos</a>

        {shortcuts.length > 0 && (
          <div className="side-section">
            <button className="side-head" onClick={() => setOpenSc(!openSc)}><Icon name={openSc ? 'chevronDown' : 'chevronRight'} size={14} /> Atalhos</button>
            {openSc && shortcuts.map((s) => (
              <a key={s.key} href={s.href} className="side-link sub"><Icon name={s.icon} size={15} /> <span className="truncate">{s.label}</span></a>
            ))}
          </div>
        )}

        <div className="side-section">
          <div className="side-head-row">
            <button className="side-head" onClick={() => setOpenNb(!openNb)}><Icon name={openNb ? 'chevronDown' : 'chevronRight'} size={14} /> Cadernos</button>
            <button className={'icon-btn small' + (hideEmpty ? ' on' : '')} onClick={() => setHideEmpty(!hideEmpty)}
              title={hideEmpty ? 'Mostrar cadernos vazios' : 'Ocultar cadernos vazios'} aria-label={hideEmpty ? 'Mostrar cadernos vazios' : 'Ocultar cadernos vazios'} aria-pressed={hideEmpty}>
              <Icon name={hideEmpty ? 'expandList' : 'collapseList'} size={13} />
            </button>
            <a href="#/notebooks" className="icon-btn small" title="Gerir cadernos" aria-label="Gerir cadernos"><Icon name="settings" size={13} /></a>
          </div>
          {openNb && <NotebookTree notebooks={notebooks} notes={notes} active={active} defaultId={settings.defaultNotebookId} hideEmpty={hideEmpty} />}
        </div>

        <div className="side-section">
          <div className="side-head-row">
            <button className="side-head" onClick={() => setOpenTags(!openTags)}><Icon name={openTags ? 'chevronDown' : 'chevronRight'} size={14} /> Etiquetas</button>
            <a href="#/tags" className="icon-btn small" title="Gerir etiquetas"><Icon name="settings" size={13} /></a>
          </div>
          {openTags && rootTags.map((t) => <TagLink key={t.id} tag={t} all={tags} route={route} depth={0} />)}
          {openTags && !tags.length && <p className="muted side-empty">Sem etiquetas</p>}
        </div>

        <div className="side-section">
          <a href="#/trash" className={'side-link' + (route.view === 'trash' ? ' active' : '') + (trashOver ? ' drop-target danger' : '')}
            title="Arraste para aqui notas ou cadernos vazios"
            onDragOver={(e) => { if (hasNotes(e) || hasNotebook(e)) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setTrashOver(true); } }}
            onDragLeave={() => setTrashOver(false)}
            onDrop={(e) => {
              if (!hasNotes(e) && !hasNotebook(e)) return;
              e.preventDefault();
              setTrashOver(false);
              if (hasNotes(e)) trashNotes(getDragNotes(e));
              else trashEmptyNotebook(e.dataTransfer.getData(NOTEBOOK_TYPE));
            }}><Icon name="trash" /> Lixo {trashCount > 0 && <span className="count">{trashCount}</span>}</a>
          <a href="#/settings" className={'side-link' + (route.view === 'settings' ? ' active' : '')}><Icon name="settings" /> Definições</a>
        </div>
      </nav>
      <a href="#/settings" className="side-user" title={syncTitle(sync.status, lastSync?.value)}>
        <span className="avatar">{initials(settings.userName || 'FlyNotes')}</span>
        <span className="side-user-text"><strong className="truncate">{settings.userName || 'O meu FlyNotes'}</strong><small className="truncate">{syncTitle(sync.status, lastSync?.value)}</small></span>
        <span className={'sync-dot ' + sync.status} />
      </a>
    </aside>
  );
}

function TagLink({ tag, all, route, depth }: { tag: any; all: any[]; route: Route; depth: number }) {
  const kids = all.filter((t) => t.parentId === tag.id);
  return (
    <>
      <a href={href('notes', undefined, { tag: tag.id })} style={{ paddingLeft: 28 + depth * 14 }}
        className={'side-link sub' + (route.view === 'notes' && route.params.get('tag') === tag.id ? ' active' : '')}>
        <Icon name="tag" size={14} /> <span className="truncate">{tag.name}</span>
      </a>
      {depth < 5 && kids.map((k) => <TagLink key={k.id} tag={k} all={all} route={route} depth={depth + 1} />)}
    </>
  );
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
}

export function syncTitle(s: string, last?: number) {
  if (s === 'syncing') return 'A sincronizar…';
  if (s === 'offline') return 'Offline — as alterações ficam guardadas no dispositivo';
  if (s === 'error') return 'Erro de sincronização — nova tentativa em breve';
  if (s === 'unauthorized') return 'Sessão expirada';
  return last ? 'Sincronizado ' + relDate(last) : 'Sincronizado';
}
