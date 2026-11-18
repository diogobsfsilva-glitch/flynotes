import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Task } from '../lib/db';
import { alive, createTask, taskBucket } from '../lib/store';
import { Icon, Empty, showModal } from '../ui';
import { TaskRow } from './NoteEditor';
import { TaskDialog } from './TaskDialog';
import { useLocalPref } from '../hooks';

type Filter = 'open' | 'today' | 'flagged' | 'done' | 'all';

export function TasksView() {
  const tasks = useLiveQuery(async () => alive(await db.tasks.toArray()), []) || [];
  const [filter, setFilter] = useLocalPref<Filter>('taskFilter', 'open');
  const [groupBy, setGroupBy] = useLocalPref<'due' | 'priority' | 'note'>('taskGroup', 'due');
  const [text, setText] = useState('');

  let list = tasks;
  if (filter === 'open') list = tasks.filter((t) => !t.done);
  if (filter === 'today') list = tasks.filter((t) => !t.done && ['today', 'overdue'].includes(taskBucket(t)));
  if (filter === 'flagged') list = tasks.filter((t) => !t.done && t.flagged);
  if (filter === 'done') list = tasks.filter((t) => t.done).sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));

  const groups: [string, Task[]][] = [];
  if (filter === 'done') groups.push(['Concluídas', list]);
  else if (groupBy === 'due') {
    const labels: Record<string, string> = { overdue: 'Em atraso', today: 'Hoje', upcoming: 'Próximas', nodate: 'Sem data' };
    for (const b of ['overdue', 'today', 'upcoming', 'nodate']) {
      const g = list.filter((t) => !t.done && taskBucket(t) === b).sort((a, c) => (a.due || 0) - (c.due || 0));
      if (g.length) groups.push([labels[b], g]);
    }
    const doneInAll = list.filter((t) => t.done);
    if (doneInAll.length) groups.push(['Concluídas', doneInAll]);
  } else if (groupBy === 'priority') {
    const labels: Record<string, string> = { high: 'Prioridade alta', medium: 'Prioridade média', low: 'Prioridade baixa', none: 'Sem prioridade' };
    for (const p of ['high', 'medium', 'low', 'none']) {
      const g = list.filter((t) => (t.priority || 'none') === p).sort((a, c) => a.done - c.done || (a.due || 9e15) - (c.due || 9e15));
      if (g.length) groups.push([labels[p], g]);
    }
  } else {
    const withNote = list.filter((t) => t.noteId);
    const without = list.filter((t) => !t.noteId);
    if (withNote.length) groups.push(['Associadas a notas', withNote]);
    if (without.length) groups.push(['Tarefas soltas', without]);
  }

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    const due = filter === 'today' ? new Date().setHours(18, 0, 0, 0) : null;
    await createTask({ title: text.trim(), due, flagged: filter === 'flagged' ? 1 : 0 });
    setText('');
  };

  return (
    <div className="page tasks-page">
      <header className="page-head">
        <h1>Tarefas</h1>
        <span className="flex-1" />
        <button className="btn primary" onClick={() => showModal<void>((done) => <TaskDialog isNew task={{ id: crypto.randomUUID().replace(/-/g, '').slice(0, 20), title: '', done: 0, createdAt: Date.now(), updatedAt: 0 }} done={done} />)}>
          <Icon name="plus" size={16} /> Nova tarefa
        </button>
      </header>
      <div className="seg">
        {([['open', 'Por fazer'], ['today', 'Hoje'], ['flagged', 'Sinalizadas'], ['done', 'Concluídas'], ['all', 'Todas']] as [Filter, string][]).map(([k, l]) => (
          <button key={k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{l}</button>
        ))}
      </div>
      {filter !== 'done' && (
        <div className="row gap muted small group-by">
          Agrupar por:
          <select className="input inline" value={groupBy} onChange={(e) => setGroupBy(e.target.value as any)}>
            <option value="due">Prazo</option><option value="priority">Prioridade</option><option value="note">Nota</option>
          </select>
        </div>
      )}
      <form onSubmit={add} className="task-add">
        <Icon name="plus" size={16} />
        <input placeholder="Adicionar tarefa e premir Enter" value={text} onChange={(e) => setText(e.target.value)} />
      </form>
      {!list.length ? <Empty icon="checkCircle" title="Sem tarefas" text="As tarefas podem ter prazo, lembrete, prioridade, repetição e ficar associadas a uma nota." /> :
        groups.map(([label, g]) => (
          <section key={label} className="task-group">
            <h4 className={label === 'Em atraso' ? 'danger-text' : ''}>{label} <small className="muted">{g.length}</small></h4>
            {g.map((t) => <TaskRow key={t.id} task={t} showNote />)}
          </section>
        ))}
    </div>
  );
}
