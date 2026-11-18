// Operações sobre stacks (conjuntos de cadernos).
import { useState } from 'react';
import type { Notebook } from '../lib/db';
import { patch, createNotebook, alive } from '../lib/store';
import { db } from '../lib/db';
import { Modal, showModal, askText, confirmDialog, toast } from '../ui';

export async function newStackDialog(notebooks: Notebook[]) {
  const res = await showModal<{ name: string; ids: string[] } | null>((done) => <NewStack notebooks={notebooks} done={done} />);
  if (!res) return;
  for (const id of res.ids) await patch<Notebook>('notebooks', id, { stack: res.name });
  if (!res.ids.length) await createNotebook('Novo caderno', res.name);
  toast(`Stack “${res.name}” criada`);
}

function NewStack({ notebooks, done }: { notebooks: Notebook[]; done: (v: { name: string; ids: string[] } | null) => void }) {
  const [name, setName] = useState('');
  const [ids, setIds] = useState<string[]>([]);
  const ok = () => name.trim() && done({ name: name.trim(), ids });
  return (
    <Modal title="Nova stack" onClose={() => done(null)}
      footer={<><button className="btn" onClick={() => done(null)}>Cancelar</button><button className="btn primary" disabled={!name.trim()} onClick={ok}>Criar stack</button></>}>
      <p className="muted">Uma stack é um conjunto de cadernos (por exemplo “02 TRABALHO”).</p>
      <input className="input" autoFocus placeholder="Nome da stack" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && ok()} />
      <label className="field-label">Cadernos a incluir</label>
      <div className="pick-list check-list">
        {notebooks.map((nb) => (
          <label key={nb.id} className="pick-item">
            <input type="checkbox" checked={ids.includes(nb.id)} onChange={(e) => setIds(e.target.checked ? [...ids, nb.id] : ids.filter((x) => x !== nb.id))} />
            {nb.name} {nb.stack && <small className="muted">({nb.stack})</small>}
          </label>
        ))}
      </div>
    </Modal>
  );
}

export async function renameStack(name: string, notebooks: Notebook[]) {
  const n = await askText('Mudar o nome da stack', { initial: name });
  if (!n?.trim() || n.trim() === name) return;
  for (const nb of notebooks.filter((x) => x.stack === name)) await patch<Notebook>('notebooks', nb.id, { stack: n.trim() });
}

export async function renameStackTo(name: string, next: string, notebooks: Notebook[]) {
  const n = next.trim();
  if (!n || n === name) return;
  for (const nb of notebooks.filter((x) => x.stack === name)) await patch<Notebook>('notebooks', nb.id, { stack: n });
  // Mantém o estado recolhido/expandido com o novo nome
  try {
    const k = 'fn:collapsedStacks';
    const c: string[] = JSON.parse(localStorage.getItem(k) || '[]');
    if (c.includes(name)) localStorage.setItem(k, JSON.stringify(c.map((x) => (x === name ? n : x))));
  } catch {}
}

export async function dissolveStack(name: string, notebooks: Notebook[]) {
  if (!(await confirmDialog(`Desfazer a stack “${name}”? Os cadernos e as notas mantêm-se.`, { ok: 'Desfazer' }))) return;
  for (const nb of notebooks.filter((x) => x.stack === name)) await patch<Notebook>('notebooks', nb.id, { stack: '' });
}

/** Importa uma estrutura de cadernos/stacks (JSON: { notebooks: [{ name, stack }] }). */
export async function importStructure(file: File): Promise<{ created: number; updated: number }> {
  const data = JSON.parse(await file.text());
  const list: { name: string; stack?: string | null }[] = Array.isArray(data) ? data : data.notebooks;
  if (!Array.isArray(list)) throw new Error('Ficheiro de estrutura inválido');
  const existing = alive(await db.notebooks.toArray());
  let created = 0, updated = 0;
  for (const item of list) {
    if (!item?.name) continue;
    const stack = item.stack || '';
    const nb = existing.find((n) => n.name.trim().toLowerCase() === item.name.trim().toLowerCase());
    if (nb) {
      if ((nb.stack || '') !== stack) { await patch<Notebook>('notebooks', nb.id, { stack }); updated++; }
    } else {
      await createNotebook(item.name.trim(), stack);
      created++;
    }
  }
  return { created, updated };
}
