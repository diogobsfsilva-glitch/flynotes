import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { alive, createNote, createTask, put, taskBucket, setSetting } from '../lib/store';
import { useActiveNotes, useNotebooks, useTags, useSettings } from '../hooks';
import { navigate, href, openNote } from '../lib/router';
import { relDate, debounce, dateTimeShort } from '../lib/util';
import { flatText } from '../lib/search';
import { Icon, Menu } from '../ui';
import { TaskRow, editTask } from './NoteEditor';
import { pickTemplate, sanitizePreview } from './pickers';

const WIDGETS: [string, string][] = [
  ['recent', 'Notas recentes'], ['scratch', 'Bloco de rascunho'], ['tasks', 'Tarefas'], ['pinned', 'Nota fixada'],
  ['shortcuts', 'Atalhos'], ['reminders', 'Lembretes'], ['tags', 'Etiquetas'], ['notebooks', 'Cadernos'],
];

export function Home() {
  const notes = useActiveNotes();
  const settings = useSettings();
  const widgets = { recent: true, scratch: true, tasks: true, pinned: true, shortcuts: true, reminders: true, tags: true, notebooks: true, ...(settings.homeWidgets || {}) };
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Bom dia' : hour < 20 ? 'Boa tarde' : 'Boa noite';
  const today = new Date().toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' });

  const quick = async (kind: string) => {
    if (kind === 'note') { const n = await createNote(); navigate('notes', n.id); }
    if (kind === 'template') { const t = await pickTemplate(); if (t) { const n = await createNote(t); navigate('notes', n.id); } }
    if (kind === 'task') { const t = await createTask({ title: '' }); editTask(t); }
    if (kind === 'clip') navigate('clip');
  };

  return (
    <div className="home">
      <header className="home-head">
        <div>
          <h1>{greeting}!</h1>
          <p className="muted cap">{today}</p>
        </div>
        <span className="flex-1" />
        <Menu trigger={<button className="btn small"><Icon name="settings" size={14} /> Personalizar</button>}
          items={WIDGETS.map(([k, label]) => ({ label, checked: (widgets as any)[k], onClick: () => setSetting('homeWidgets', { ...widgets, [k]: !(widgets as any)[k] }) }))} />
      </header>

      <div className="quick-actions">
        <button className="quick" onClick={() => quick('note')}><Icon name="note" /> Nova nota</button>
        <button className="quick" onClick={() => quick('task')}><Icon name="checkCircle" /> Nova tarefa</button>
        <button className="quick" onClick={() => quick('template')}><Icon name="template" /> Modelo</button>
        <button className="quick" onClick={() => quick('clip')}><Icon name="globe" /> Recortar web</button>
      </div>

      <div className="widgets">
        {widgets.recent && <RecentWidget notes={notes} />}
        {widgets.scratch && <ScratchPad />}
        {widgets.tasks && <TasksWidget />}
        {widgets.pinned && <PinnedWidget />}
        {widgets.reminders && <RemindersWidget notes={notes} />}
        {widgets.shortcuts && <ShortcutsWidget />}
        {widgets.notebooks && <NotebooksWidget notes={notes} />}
        {widgets.tags && <TagsWidget notes={notes} />}
      </div>
    </div>
  );
}

function Widget({ title, icon, children, link, wide }: { title: string; icon: string; children: React.ReactNode; link?: string; wide?: boolean }) {
  return (
    <section className={'widget' + (wide ? ' wide' : '')}>
      <header><Icon name={icon} size={16} /> <h3>{title}</h3><span className="flex-1" />{link && <a href={link} className="muted small">Ver tudo</a>}</header>
      <div className="widget-body">{children}</div>
    </section>
  );
}

function RecentWidget({ notes }: { notes: any[] }) {
  const recent = useMemo(() => [...notes].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 8), [notes]);
  return (
    <Widget title="Notas recentes" icon="notes" link="#/notes" wide>
      {!recent.length ? <p className="muted">Ainda não tem notas. Crie a primeira!</p> : (
        <div className="recent-grid">
          {recent.map((n) => {
            const thumb = n.content.match(/<img[^>]+src="([^"]+)"/)?.[1];
            return (
              <button key={n.id} className="recent-card" onClick={() => openNote(n.id)}>
                <strong className="truncate">{n.title || 'Sem título'}</strong>
                {thumb ? <img src={thumb} alt="" loading="lazy" /> : <p>{n.locked ? '🔒' : flatText(n.text).slice(0, 140)}</p>}
                <small className="muted">{relDate(n.updatedAt)}</small>
              </button>
            );
          })}
        </div>
      )}
    </Widget>
  );
}

function ScratchPad() {
  const doc = useLiveQuery(() => db.kv.get('scratchpad'), []);
  const [text, setText] = useState<string | null>(null);
  useEffect(() => { if (doc !== undefined && text === null) setText(doc?.value || ''); }, [doc]); // eslint-disable-line
  useEffect(() => { if (doc && text !== null && document.activeElement?.id !== 'scratch') setText(doc.value || ''); }, [doc?.updatedAt]); // eslint-disable-line
  const save = useMemo(() => debounce((v: string) => put('kv', { id: 'scratchpad', value: v, updatedAt: 0 }), 700), []);
  return (
    <Widget title="Bloco de rascunho" icon="edit">
      <textarea id="scratch" className="scratch" placeholder="Apontamentos rápidos…" value={text ?? ''}
        onChange={(e) => { setText(e.target.value); save(e.target.value); }} />
      {text && (
        <button className="link-btn" onClick={async () => {
          const html = text.split('\n').map((l) => `<p>${l.replace(/</g, '&lt;')}</p>`).join('');
          const n = await createNote({ title: text.split('\n')[0].slice(0, 60), content: html });
          setText(''); save('');
          navigate('notes', n.id);
        }}>Converter em nota</button>
      )}
    </Widget>
  );
}

function TasksWidget() {
  const tasks = useLiveQuery(async () => alive(await db.tasks.where('done').equals(0).toArray()), []) || [];
  const sorted = [...tasks].sort((a, b) => (a.due || 9e15) - (b.due || 9e15)).slice(0, 7);
  const overdue = tasks.filter((t) => taskBucket(t) === 'overdue').length;
  const today = tasks.filter((t) => taskBucket(t) === 'today').length;
  const [text, setText] = useState('');
  return (
    <Widget title="Tarefas" icon="checkCircle" link="#/tasks">
      <div className="task-stats">
        <span className={overdue ? 'danger-text' : ''}><strong>{overdue}</strong> em atraso</span>
        <span><strong>{today}</strong> para hoje</span>
        <span><strong>{tasks.length}</strong> por fazer</span>
      </div>
      <form onSubmit={async (e) => { e.preventDefault(); if (text.trim()) await createTask({ title: text.trim() }); setText(''); }}>
        <input className="input small" placeholder="+ Adicionar tarefa rápida" value={text} onChange={(e) => setText(e.target.value)} />
      </form>
      {sorted.map((t) => <TaskRow key={t.id} task={t} compact />)}
      {!tasks.length && <p className="muted">Nada pendente. 🎉</p>}
    </Widget>
  );
}

function PinnedWidget() {
  const settings = useSettings();
  const note = useLiveQuery(() => (settings.pinnedNoteId ? db.notes.get(settings.pinnedNoteId) : undefined), [settings.pinnedNoteId]);
  return (
    <Widget title={note && !note.deleted && !note.trashed ? note.title || 'Nota fixada' : 'Nota fixada'} icon="pin">
      {note && !note.deleted && !note.trashed ? (
        <div className="pinned-preview" onClick={() => openNote(note.id)}>
          {note.locked ? <p>🔒 Nota encriptada</p> : <div className="prose small" dangerouslySetInnerHTML={{ __html: sanitizePreview(note.content) }} />}
        </div>
      ) : <p className="muted">Abra uma nota e escolha “Fixar na página inicial” no menu ⋯.</p>}
    </Widget>
  );
}

function RemindersWidget({ notes }: { notes: any[] }) {
  const list = notes.filter((n) => n.reminderAt && !n.reminderDone).sort((a, b) => a.reminderAt - b.reminderAt).slice(0, 6);
  return (
    <Widget title="Lembretes" icon="bell" link={href('notes', undefined, { filter: 'reminders' })}>
      {!list.length ? <p className="muted">Sem lembretes ativos.</p> : list.map((n) => (
        <a key={n.id} href={`#/note/${n.id}`} className="row-link">
          <span className="truncate">{n.title || 'Sem título'}</span>
          <small className={n.reminderAt < Date.now() ? 'danger-text' : 'muted'}>{dateTimeShort(n.reminderAt)}</small>
        </a>
      ))}
    </Widget>
  );
}

function ShortcutsWidget() {
  const settings = useSettings();
  const notebooks = useNotebooks();
  const tags = useTags();
  const notes = useActiveNotes();
  const searches = useLiveQuery(async () => alive(await db.searches.toArray()), []) || [];
  const items = (settings.shortcuts || []).map((s) => {
    if (s.kind === 'note') { const n = notes.find((x) => x.id === s.id); return n && { icon: 'note', label: n.title || 'Sem título', href: `#/note/${n.id}` }; }
    if (s.kind === 'notebook') { const n = notebooks.find((x) => x.id === s.id); return n && { icon: 'book', label: n.name, href: href('notes', undefined, { nb: n.id }) }; }
    if (s.kind === 'tag') { const t = tags.find((x) => x.id === s.id); return t && { icon: 'tag', label: t.name, href: href('notes', undefined, { tag: t.id }) }; }
    const q = searches.find((x) => x.id === s.id);
    return q && { icon: 'search', label: q.name, href: href('notes', undefined, { q: q.query, ss: q.id }) };
  }).filter(Boolean) as any[];
  return (
    <Widget title="Atalhos" icon="star">
      {!items.length ? <p className="muted">Use a estrela ☆ numa nota, caderno, etiqueta ou pesquisa para a adicionar aqui.</p> :
        items.map((i, k) => <a key={k} href={i.href} className="row-link"><Icon name={i.icon} size={15} /> <span className="truncate">{i.label}</span></a>)}
    </Widget>
  );
}

function NotebooksWidget({ notes }: { notes: any[] }) {
  const notebooks = useNotebooks();
  return (
    <Widget title="Cadernos" icon="book" link="#/notebooks">
      {notebooks.slice(0, 8).map((nb) => (
        <a key={nb.id} href={href('notes', undefined, { nb: nb.id })} className="row-link">
          <Icon name="book" size={15} /> <span className="truncate">{nb.name}</span>
          <small className="muted ml-auto">{notes.filter((n) => n.notebookId === nb.id).length}</small>
        </a>
      ))}
    </Widget>
  );
}

function TagsWidget({ notes }: { notes: any[] }) {
  const tags = useTags();
  const counts = new Map<string, number>();
  for (const n of notes) for (const t of n.tagIds) counts.set(t, (counts.get(t) || 0) + 1);
  return (
    <Widget title="Etiquetas" icon="tag" link="#/tags">
      <div className="tag-cloud">
        {!tags.length && <p className="muted">Sem etiquetas.</p>}
        {tags.map((t) => <a key={t.id} href={href('notes', undefined, { tag: t.id })} className="chip">{t.name} <small>{counts.get(t.id) || 0}</small></a>)}
      </div>
    </Widget>
  );
}
