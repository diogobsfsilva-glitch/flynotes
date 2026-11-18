// Paleta de comandos (Ctrl+P): saltar para qualquer nota, caderno, etiqueta, vista ou ação.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { alive, createNote, createTask } from '../lib/store';
import { useActiveNotes, useNotebooks, useTags, setLocalPref } from '../hooks';
import { navigate, href, openNote } from '../lib/router';
import { norm, relDate } from '../lib/util';
import { syncNow } from '../lib/sync';
import { Icon, toast } from '../ui';
import { editTask } from './NoteEditor';
import { pickTemplate } from './pickers';

type Cmd = { id: string; group: string; label: string; hint?: string; icon: string; run: () => void; score?: number };

export function CommandPalette({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const notes = useActiveNotes();
  const notebooks = useNotebooks();
  const tags = useTags();
  const searches = useLiveQuery(async () => alive(await db.searches.toArray()), []) || [];
  const listRef = useRef<HTMLDivElement>(null);

  const all: Cmd[] = useMemo(() => {
    const go = (fn: () => void) => () => { onClose(); fn(); };
    const actions: Cmd[] = [
      { id: 'a-note', group: 'Ações', label: 'Nova nota', icon: 'plus', hint: 'Ctrl+Alt+N', run: go(async () => { const n = await createNote(); navigate('notes', n.id); }) },
      { id: 'a-tpl', group: 'Ações', label: 'Nova nota a partir de modelo', icon: 'template', run: go(async () => { const t = await pickTemplate(); if (t) { const n = await createNote(t); navigate('notes', n.id); } }) },
      { id: 'a-task', group: 'Ações', label: 'Nova tarefa', icon: 'checkCircle', run: go(async () => editTask(await createTask({ title: '' }))) },
      { id: 'a-event', group: 'Ações', label: 'Novo evento no calendário', icon: 'calendar', run: go(() => navigate('calendar')) },
      { id: 'a-clip', group: 'Ações', label: 'Recortar página web', icon: 'globe', run: go(() => navigate('clip')) },
      { id: 'a-sync', group: 'Ações', label: 'Sincronizar agora', icon: 'sync', run: go(() => syncNow().then(() => toast('Sincronizado'))) },
      { id: 'a-dark', group: 'Ações', label: 'Tema escuro', icon: 'moon', run: go(() => { setLocalPref('theme', 'dark'); document.documentElement.dataset.theme = 'dark'; }) },
      { id: 'a-light', group: 'Ações', label: 'Tema claro', icon: 'sun', run: go(() => { setLocalPref('theme', 'light'); document.documentElement.dataset.theme = 'light'; }) },
    ];
    const views: Cmd[] = ([
      ['home', 'Início', 'home'], ['notes', 'Todas as notas', 'notes'], ['tasks', 'Tarefas', 'checkCircle'], ['calendar', 'Calendário', 'calendar'],
      ['shortcuts', 'Atalhos', 'star'], ['files', 'Ficheiros', 'clip'], ['templates', 'Modelos', 'template'], ['notebooks', 'Cadernos', 'book'],
      ['tags', 'Etiquetas', 'tag'], ['trash', 'Lixo', 'trash'], ['settings', 'Definições', 'settings'],
    ] as const).map(([v, l, i]) => ({ id: 'v-' + v, group: 'Ir para', label: l, icon: i, run: go(() => navigate(v as any)) }));
    const stacks = [...new Set(notebooks.map((n) => n.stack).filter(Boolean))] as string[];
    return [
      ...actions, ...views,
      ...stacks.map((s) => ({ id: 's-' + s, group: 'Stacks', label: s, icon: 'stack', run: go(() => { location.hash = href('notes', undefined, { stack: s }); }) })),
      ...notebooks.map((n) => ({ id: 'nb-' + n.id, group: 'Cadernos', label: n.name, hint: n.stack, icon: 'book', run: go(() => { location.hash = href('notes', undefined, { nb: n.id }); }) })),
      ...tags.map((t) => ({ id: 't-' + t.id, group: 'Etiquetas', label: t.name, icon: 'tag', run: go(() => { location.hash = href('notes', undefined, { tag: t.id }); }) })),
      ...searches.map((s) => ({ id: 'ss-' + s.id, group: 'Pesquisas guardadas', label: s.name, hint: s.query, icon: 'search', run: go(() => { location.hash = href('notes', undefined, { q: s.query, ss: s.id }); }) })),
      ...[...notes].sort((a, b) => b.updatedAt - a.updatedAt).map((n) => ({ id: 'n-' + n.id, group: 'Notas', label: n.title || 'Sem título', hint: relDate(n.updatedAt), icon: n.locked ? 'lock' : 'note', run: go(() => openNote(n.id)) })),
    ];
  }, [notes, notebooks, tags, searches, onClose]);

  const results = useMemo(() => {
    const t = norm(q.trim());
    if (!t) return [...all.filter((c) => c.group === 'Ações' || c.group === 'Ir para').slice(0, 10), ...all.filter((c) => c.group === 'Notas').slice(0, 8)];
    const words = t.split(/\s+/);
    const scored: Cmd[] = [];
    for (const c of all) {
      const label = norm(c.label);
      if (!words.every((w) => label.includes(w) || norm(c.hint || '').includes(w))) continue;
      let score = label.startsWith(t) ? 100 : label.includes(t) ? 60 : 30;
      if (c.group === 'Ações' || c.group === 'Ir para') score += 15;
      if (c.group === 'Cadernos' || c.group === 'Stacks') score += 10;
      scored.push({ ...c, score });
    }
    return scored.sort((a, b) => b.score! - a.score!).slice(0, 40);
  }, [q, all]);

  useEffect(() => setSel(0), [q]);
  useEffect(() => { listRef.current?.querySelector('.cp-item.on')?.scrollIntoView({ block: 'nearest' }); }, [sel]);

  let lastGroup = '';
  return (
    <div className="modal-backdrop cp-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="cp" role="dialog" aria-label="Paleta de comandos">
        <div className="cp-input">
          <Icon name="search" size={18} />
          <input autoFocus placeholder="Escreva para procurar notas, cadernos, etiquetas ou ações…" value={q} onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, results.length - 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
              if (e.key === 'Enter') { e.preventDefault(); results[sel]?.run(); }
              if (e.key === 'Escape') onClose();
            }} />
          <kbd>Esc</kbd>
        </div>
        <div className="cp-list" ref={listRef}>
          {!results.length && <p className="muted pad">Nada encontrado.</p>}
          {results.map((c, i) => {
            const head = c.group !== lastGroup ? <div className="cp-group">{c.group}</div> : null;
            lastGroup = c.group;
            return (
              <div key={c.id}>
                {head}
                <button className={'cp-item' + (i === sel ? ' on' : '')} onMouseEnter={() => setSel(i)} onClick={c.run}>
                  <Icon name={c.icon} size={16} /> <span className="truncate">{c.label}</span>
                  {c.hint && <small className="muted ml-auto truncate">{c.hint}</small>}
                </button>
              </div>
            );
          })}
        </div>
        <div className="cp-foot muted small">↑↓ navegar · Enter abrir · Esc fechar</div>
      </div>
    </div>
  );
}
