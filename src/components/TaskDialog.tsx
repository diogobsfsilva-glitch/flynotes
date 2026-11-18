import { useState } from 'react';
import type { Task } from '../lib/db';
import { put, removeDoc } from '../lib/store';
import { toLocalInput, fromLocalInput } from '../lib/util';
import { Modal, confirmDialog, Icon } from '../ui';
import { pickNote } from './pickers';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';

export function TaskDialog({ task, done, isNew }: { task: Task; done: () => void; isNew?: boolean }) {
  const [t, setT] = useState<Task>(task);
  const note = useLiveQuery(() => (t.noteId ? db.notes.get(t.noteId) : undefined), [t.noteId]);
  const set = (k: keyof Task, v: any) => setT({ ...t, [k]: v });
  const save = async () => {
    if (!t.title.trim()) return done();
    await put('tasks', { ...t, title: t.title.trim() });
    done();
  };
  return (
    <Modal title={isNew ? 'Nova tarefa' : 'Tarefa'} onClose={save}
      footer={<>
        {!isNew && <button className="btn danger-text" onClick={async () => {
          if (await confirmDialog('Eliminar esta tarefa?', { danger: true, ok: 'Eliminar' })) { await removeDoc('tasks', t.id); done(); }
        }}>Eliminar</button>}
        <span className="flex-1" />
        <button className="btn" onClick={done}>Cancelar</button>
        <button className="btn primary" onClick={save}>Guardar</button>
      </>}>
      <form onSubmit={(e) => { e.preventDefault(); save(); }}>
        <input className="input big" autoFocus placeholder="O que é preciso fazer?" value={t.title} onChange={(e) => set('title', e.target.value)} />
      </form>
      <textarea className="input" rows={3} placeholder="Descrição (opcional)" value={t.description || ''} onChange={(e) => set('description', e.target.value)} />
      <div className="form-grid">
        <label>Prazo<input className="input" type="datetime-local" value={toLocalInput(t.due)} onChange={(e) => set('due', fromLocalInput(e.target.value))} /></label>
        <label>Lembrete<input className="input" type="datetime-local" value={toLocalInput(t.reminderAt)} onChange={(e) => set('reminderAt', fromLocalInput(e.target.value))} /></label>
        <label>Prioridade
          <select className="input" value={t.priority || ''} onChange={(e) => set('priority', e.target.value || null)}>
            <option value="">Nenhuma</option><option value="high">Alta</option><option value="medium">Média</option><option value="low">Baixa</option>
          </select>
        </label>
        <label>Repetir
          <select className="input" value={t.repeat || ''} onChange={(e) => set('repeat', e.target.value || null)}>
            <option value="">Não repetir</option><option value="daily">Diariamente</option><option value="weekly">Semanalmente</option><option value="monthly">Mensalmente</option>
          </select>
        </label>
      </div>
      <div className="row gap wrap">
        <label className="check"><input type="checkbox" checked={!!t.flagged} onChange={(e) => set('flagged', e.target.checked ? 1 : 0)} /> 🚩 Sinalizada</label>
        <label className="check"><input type="checkbox" checked={!!t.done} onChange={(e) => setT({ ...t, done: e.target.checked ? 1 : 0, completedAt: e.target.checked ? Date.now() : null })} /> Concluída</label>
      </div>
      <div className="row gap">
        <Icon name="note" size={15} className="muted" />
        {note && !note.deleted ? <a href={`#/note/${note.id}`} onClick={save}>{note.title || 'Sem título'}</a> : <span className="muted">Sem nota associada</span>}
        <button className="link-btn" onClick={async () => { const n = await pickNote('Associar a uma nota'); if (n) set('noteId', n.id); }}>{t.noteId ? 'Alterar' : 'Associar nota'}</button>
        {t.noteId && <button className="link-btn" onClick={() => set('noteId', null)}>Remover</button>}
      </div>
    </Modal>
  );
}
