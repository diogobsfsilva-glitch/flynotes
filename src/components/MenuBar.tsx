// Barra de menus de aplicação (computador): Ficheiro, Editar, Ver, Nota, Janela, Ferramentas, Ajuda.
import { useEffect, useRef, useState } from 'react';
import { db, TABLE_TYPES, type SyncTable } from '../lib/db';
import { alive, createNote, createNotebook, createTask } from '../lib/store';
import { importEnex, exportEnex } from '../lib/enex';
import { download } from '../lib/util';
import { syncNow } from '../lib/sync';
import { navigate, href } from '../lib/router';
import { useNoteActions } from '../lib/noteActions';
import { useLocalPref, setLocalPref } from '../hooks';
import { Icon, askText, toast, showModal, Modal, type MenuItem } from '../ui';
import { pickTemplate } from './pickers';
import { editTask } from './NoteEditor';

// Página de apoio ao projeto (contribuições voluntárias)
export const SUPPORT_URL = 'https://ko-fi.com/dfs78035';

type MenuDef = { id: string; label: string; items: MenuItem[] };

export function MenuBar({ onLogout, onToggleSidebar }: { onLogout: () => void; onToggleSidebar: () => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const enexInput = useRef<HTMLInputElement>(null);
  const noteActions = useNoteActions();
  const [mode] = useLocalPref<string>('mode', 'snippets');
  const [sort] = useLocalPref<string>('sort', 'updated');
  const [theme] = useLocalPref<string>('theme', 'system');
  const [sideTheme] = useLocalPref<string>('sidebarTheme', 'dark');

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(null); };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(null);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);

  const newNote = async (template = false) => {
    let base = {};
    if (template) { const t = await pickTemplate(); if (!t) return; base = t; }
    const n = await createNote(base);
    navigate('notes', n.id);
  };
  const exec = (cmd: string) => () => {
    try {
      if (!document.execCommand(cmd)) throw new Error();
    } catch {
      toast(`Use o atalho de teclado (${cmd === 'paste' ? 'Ctrl+V' : cmd === 'copy' ? 'Ctrl+C' : 'Ctrl+X'})`);
    }
  };
  const setTheme = (t: string) => {
    setLocalPref('theme', t);
    document.documentElement.dataset.theme = t === 'system' ? '' : t;
  };

  const menus: MenuDef[] = [
    { id: 'file', label: 'Ficheiro', items: [
      { label: 'Nova nota\tCtrl+Alt+N', icon: 'note', onClick: () => newNote() },
      { label: 'Nova nota a partir de modelo', icon: 'template', onClick: () => newNote(true) },
      { label: 'Nova tarefa', icon: 'checkCircle', onClick: async () => editTask(await createTask({ title: '' })) },
      { label: 'Novo caderno…', icon: 'book', onClick: async () => { const n = await askText('Novo caderno', { ok: 'Criar' }); if (n?.trim()) { const nb = await createNotebook(n.trim()); navigate('notes', undefined, { nb: nb.id }); } } },
      { divider: true },
      { label: 'Importar notas do Evernote (.enex)…', icon: 'upload', onClick: () => enexInput.current?.click() },
      { label: 'Exportar todas as notas (.enex)', icon: 'download', onClick: async () => {
        toast('A preparar exportação…');
        const notes = alive(await db.notes.toArray()).filter((n) => !n.trashed);
        download(`flynotes-${new Date().toISOString().slice(0, 10)}.enex`, await exportEnex(notes), 'application/xml');
      } },
      { label: 'Cópia de segurança (.json)', icon: 'download', onClick: async () => {
        const out: Record<string, any[]> = {};
        for (const t of Object.keys(TABLE_TYPES) as SyncTable[]) out[t] = alive(await (db[t] as any).toArray());
        download(`flynotes-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ app: 'FlyNotes', version: 1, exportedAt: Date.now(), data: out }), 'application/json');
      } },
      { divider: true },
      { label: 'Terminar sessão', icon: 'logout', onClick: onLogout },
    ] },
    { id: 'edit', label: 'Editar', items: [
      { label: 'Anular\tCtrl+Z', icon: 'undo', onClick: exec('undo') },
      { label: 'Refazer\tCtrl+Y', icon: 'redo', onClick: exec('redo') },
      { divider: true },
      { label: 'Cortar\tCtrl+X', onClick: exec('cut') },
      { label: 'Copiar\tCtrl+C', icon: 'copy', onClick: exec('copy') },
      { label: 'Colar\tCtrl+V', onClick: exec('paste') },
      { label: 'Selecionar tudo\tCtrl+A', onClick: exec('selectAll') },
      { divider: true },
      { label: 'Ir para… (paleta de comandos)\tCtrl+P', icon: 'search', onClick: () => window.dispatchEvent(new Event('fn:palette')) },
      { label: 'Pesquisar notas\tCtrl+K', icon: 'search', onClick: () => { navigate('notes'); setTimeout(() => (document.querySelector('.search-box input') as HTMLInputElement | null)?.focus(), 50); } },
    ] },
    { id: 'view', label: 'Ver', items: [
      { label: 'Início', icon: 'home', onClick: () => navigate('home') },
      { label: 'Todas as notas', icon: 'notes', onClick: () => navigate('notes') },
      { label: 'Tarefas', icon: 'checkCircle', onClick: () => navigate('tasks') },
      { label: 'Calendário', icon: 'calendar', onClick: () => navigate('calendar') },
      { label: 'Atalhos', icon: 'star', onClick: () => navigate('shortcuts') },
      { label: 'Ficheiros', icon: 'clip', onClick: () => navigate('files') },
      { label: 'Modelos', icon: 'template', onClick: () => navigate('templates') },
      { label: 'Cadernos', icon: 'book', onClick: () => navigate('notebooks') },
      { label: 'Lembretes', icon: 'bell', onClick: () => { location.hash = href('notes', undefined, { filter: 'reminders' }); } },
      { label: 'Lixo', icon: 'trash', onClick: () => navigate('trash') },
      { divider: true },
      { label: 'Lista: excertos', checked: mode === 'snippets', onClick: () => setLocalPref('mode', 'snippets') },
      { label: 'Lista: cartões', checked: mode === 'cards', onClick: () => setLocalPref('mode', 'cards') },
      { label: 'Lista: compacta', checked: mode === 'list', onClick: () => setLocalPref('mode', 'list') },
      { divider: true },
      { label: 'Ordenar por atualização', checked: sort === 'updated', onClick: () => setLocalPref('sort', 'updated') },
      { label: 'Ordenar por criação', checked: sort === 'created', onClick: () => setLocalPref('sort', 'created') },
      { label: 'Ordenar por título', checked: sort === 'title', onClick: () => setLocalPref('sort', 'title') },
      { divider: true },
      { label: 'Mostrar/ocultar barra lateral', icon: 'menu', onClick: onToggleSidebar },
      { label: 'Barra lateral clara', checked: sideTheme === 'light', onClick: () => setLocalPref('sidebarTheme', sideTheme === 'light' ? 'dark' : 'light') },
      { label: 'Tema claro', icon: 'sun', checked: theme === 'light', onClick: () => setTheme('light') },
      { label: 'Tema escuro', icon: 'moon', checked: theme === 'dark', onClick: () => setTheme('dark') },
      { label: 'Tema automático', checked: theme === 'system', onClick: () => setTheme('system') },
      { label: 'Cores da aplicação…', icon: 'palette', onClick: () => navigate('settings') },
    ] },
    { id: 'note', label: 'Nota', items: noteActions.length ? noteActions : [
      { label: 'Abra uma nota para ver as opções', disabled: true },
      { label: 'Nova nota', icon: 'note', onClick: () => newNote() },
    ] },
    { id: 'window', label: 'Janela', items: [
      { label: 'Abrir em nova janela', icon: 'copy', onClick: () => window.open(location.href, '_blank', 'noopener') },
      { label: 'Ecrã inteiro\tF11', icon: 'maximize', onClick: () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {}) },
      { label: 'Recarregar\tCtrl+R', icon: 'sync', onClick: () => location.reload() },
    ] },
    { id: 'tools', label: 'Ferramentas', items: [
      { label: 'Sincronizar agora', icon: 'sync', onClick: () => syncNow().then(() => toast('Sincronizado')) },
      { label: 'Recortar página web', icon: 'globe', onClick: () => navigate('clip') },
      { divider: true },
      { label: 'Gerir cadernos', icon: 'book', onClick: () => navigate('notebooks') },
      { label: 'Gerir etiquetas', icon: 'tag', onClick: () => navigate('tags') },
      { divider: true },
      { label: 'Definições', icon: 'settings', onClick: () => navigate('settings') },
    ] },
    { id: 'help', label: 'Ajuda', items: [
      { label: 'Sintaxe de pesquisa e atalhos', icon: 'search', onClick: () => navigate('settings') },
      { label: 'Apoiar a FlyNotes (Ko-fi)', icon: 'star', onClick: () => window.open(SUPPORT_URL, '_blank', 'noopener') },
      { label: 'Sobre a FlyNotes', icon: 'info', onClick: () => showModal<void>((done) => (
        <Modal title="FlyNotes" onClose={done}>
          <p>Versão 1.0 — notas, tarefas e documentos, no computador e no telemóvel, com funcionamento offline.</p>
          <p className="muted">Os dados ficam na sua base de dados privada e os anexos no seu armazenamento.</p>
          <p>A FlyNotes é gratuita e de código aberto. Se lhe for útil, pode <a href={SUPPORT_URL} target="_blank" rel="noopener noreferrer">apoiar o desenvolvimento no Ko-fi</a>.</p>
        </Modal>
      )) },
    ] },
  ];

  return (
    <div className="menubar" ref={ref}>
      {menus.map((m) => (
        <div key={m.id} className="mb-item">
          <button className={'mb-label' + (open === m.id ? ' on' : '')}
            onClick={() => setOpen(open === m.id ? null : m.id)}
            onMouseEnter={() => open && open !== m.id && setOpen(m.id)}>{m.label}</button>
          {open === m.id && (
            <div className="menu left mb-menu">
              {m.items.map((it, i) => it.divider ? <div key={i} className="menu-div" /> : (
                <button key={i} className={'menu-item' + (it.danger ? ' danger' : '')} disabled={it.disabled}
                  onClick={() => { setOpen(null); it.onClick?.(); }}>
                  {it.icon ? <Icon name={it.icon} size={15} /> : <span className="mb-icon-pad" />}
                  <span>{it.label?.split('\t')[0]}</span>
                  {it.checked && <Icon name="check" size={14} className="menu-check" />}
                  {it.label?.includes('\t') && <kbd className="mb-kbd">{it.label.split('\t')[1]}</kbd>}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
      <input ref={enexInput} type="file" accept=".enex,application/xml,text/xml" multiple hidden onChange={async (e) => {
        const files = Array.from(e.target.files || []);
        e.target.value = '';
        let total = 0;
        for (const f of files) {
          try { total += await importEnex(f, (p) => p.done % 10 === 0 && toast(`${f.name}: ${p.done}/${p.total}`, undefined, 1500)); }
          catch (err: any) { toast(`${f.name}: ${err.message}`); }
        }
        toast(`${total} notas importadas`);
      }} />
    </div>
  );
}
