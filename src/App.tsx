import { useEffect, useState } from 'react';
import { useRoute, navigate, href, openNote } from './lib/router';
import { db } from './lib/db';
import { alive, createNote, createTask, ensureDefaultNotebook, cleanupNotebookNames, mergeDuplicateDefaultNotebooks } from './lib/store';
import { syncNow, onSyncStatus } from './lib/sync';
import { Sidebar } from './components/Sidebar';
import { Home } from './components/Home';
import { NotesView } from './components/NotesView';
import { TasksView } from './components/TasksView';
import { CalendarView } from './components/CalendarView';
import { NotebooksView, TagsView } from './components/ManageViews';
import { SettingsView } from './components/SettingsView';
import { ClipView } from './components/ClipView';
import { Login } from './components/Login';
import { MenuBar } from './components/MenuBar';
import { CommandPalette } from './components/CommandPalette';
import { TabBar } from './components/TabBar';
import { ShortcutsView, FilesView, TemplatesView } from './components/ExtraViews';
import { useLocalPref } from './hooks';
import { editTask } from './components/NoteEditor';
import { Icon, Logo, Toasts, toast, useMedia, chooseDialog } from './ui';
import { pickTemplate } from './components/pickers';
import { useSyncStatus } from './hooks';

type Auth = 'checking' | 'in' | 'out';

export default function App() {
  const [auth, setAuth] = useState<Auth>('checking');

  useEffect(() => {
    fetch('/api/login', { credentials: 'same-origin' })
      .then((r) => {
        if (r.ok) { localStorage.setItem('fn:authed', '1'); setAuth('in'); }
        else { localStorage.removeItem('fn:authed'); setAuth('out'); }
      })
      .catch(() => setAuth(localStorage.getItem('fn:authed') ? 'in' : 'out'));
    return onSyncStatus((s) => { if (s === 'unauthorized') { localStorage.removeItem('fn:authed'); setAuth('out'); } });
  }, []);

  if (auth === 'checking') return <div className="splash"><Logo size={64} /></div>;
  if (auth === 'out') return <><Login onLogin={() => { localStorage.setItem('fn:authed', '1'); setAuth('in'); }} /><Toasts /></>;
  return <Shell onLogout={async () => { await fetch('/api/login', { method: 'DELETE' }); localStorage.removeItem('fn:authed'); setAuth('out'); }} />;
}

function Shell({ onLogout }: { onLogout: () => void }) {
  const route = useRoute();
  const isMobile = useMedia('(max-width: 820px)');
  const sync = useSyncStatus();
  const [sidebarHidden, setSidebarHidden] = useLocalPref<boolean>('sidebarHidden', false);
  const [palette, setPalette] = useState(false);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'p') { e.preventDefault(); setPalette((v) => !v); }
    };
    const open = () => setPalette(true);
    window.addEventListener('keydown', h);
    window.addEventListener('fn:palette', open);
    return () => { window.removeEventListener('keydown', h); window.removeEventListener('fn:palette', open); };
  }, []);

  useEffect(() => {
    syncNow().then(async () => {
      await ensureDefaultNotebook();
      await mergeDuplicateDefaultNotebooks();
      const fixed = await cleanupNotebookNames();
      if (fixed) toast(`${fixed} caderno(s) com “(N notas)” no nome foram corrigidos`);
      // PDFs ainda sem texto pesquisável (ex.: importados) são indexados em segundo plano
      setTimeout(() => import('./lib/pdfText').then((m) => m.indexPendingPdfs()).catch(() => {}), 8000);
    });
    // Destino de partilha do sistema (PWA instalada): /?share_url=…&share_text=…
    const sp = new URLSearchParams(location.search);
    if (sp.has('share_url') || sp.has('share_text') || sp.has('share_title')) {
      const params = { url: sp.get('share_url') || undefined, text: sp.get('share_text') || undefined, title: sp.get('share_title') || undefined };
      history.replaceState(null, '', '/');
      navigate('share', undefined, params, true);
    }
    // Atalho "Nova nota" do ícone da app
    if (route.params.get('new') === 'note') {
      createNote().then((n) => navigate('notes', n.id, undefined, true));
    }
  }, []); // eslint-disable-line

  useReminders();
  useShortcuts();
  useEffect(() => {
    const h = (e: Event) => {
      const titles = (e as CustomEvent).detail as string[];
      toast(`⚠️ Conflito de edição em “${titles[0]}”${titles.length > 1 ? ` e mais ${titles.length - 1}` : ''}: foi guardada uma cópia, nada se perdeu`, { label: 'Ver', fn: () => navigate('notes', undefined, { q: 'intitle:conflito' }) }, 12000);
    };
    window.addEventListener('fn:conflict', h);
    return () => window.removeEventListener('fn:conflict', h);
  }, []);

  const editorOpen = isMobile && !!route.noteId;
  let content;
  switch (route.view) {
    case 'notes': case 'trash': case 'search': content = <NotesView route={route} />; break;
    case 'tasks': content = <TasksView />; break;
    case 'calendar': content = <CalendarView />; break;
    case 'notebooks': content = <NotebooksView />; break;
    case 'tags': content = <TagsView />; break;
    case 'settings': content = <SettingsView onLogout={onLogout} />; break;
    case 'clip': case 'share': content = <ClipView route={route} />; break;
    case 'more': content = <MoreView />; break;
    case 'shortcuts': content = <ShortcutsView />; break;
    case 'files': content = <FilesView />; break;
    case 'templates': content = <TemplatesView />; break;
    default: content = <Home />;
  }

  return (
    <div className="app-shell">
      {!isMobile && (
        <div className="topbar">
          <MenuBar onLogout={onLogout} onToggleSidebar={() => setSidebarHidden(!sidebarHidden)} />
          <TabBar route={route} />
        </div>
      )}
    <div className={'app' + (editorOpen ? ' editor-open' : '')}>
      {!isMobile && !sidebarHidden && <Sidebar route={route} />}
      <main className="main">
        {isMobile && !editorOpen && sync.status === 'offline' && <div className="offline-bar"><Icon name="cloudOff" size={14} /> Offline — as alterações sincronizam quando houver rede</div>}
        {content}
      </main>
      {isMobile && !editorOpen && <MobileNav route={route} />}
      <Toasts />
      {palette && <CommandPalette onClose={() => setPalette(false)} />}
    </div>
    </div>
  );
}

function MobileNav({ route }: { route: ReturnType<typeof useRoute> }) {
  const create = async () => {
    const kind = await chooseDialog('Criar', [
      { value: 'note', label: 'Nota', icon: '📝' },
      { value: 'photo', label: 'Fotografia / digitalizar documento', icon: '📷' },
      { value: 'audio', label: 'Nota de voz', icon: '🎙️' },
      { value: 'task', label: 'Tarefa', icon: '✅' },
      { value: 'template', label: 'A partir de modelo', icon: '🗂️' },
      { value: 'clip', label: 'Recortar página web', icon: '🌐' },
    ]);
    if (!kind) return;
    const nb = route.params.get('nb') || undefined;
    if (kind === 'note' || kind === 'photo' || kind === 'audio') {
      const n = await createNote({ notebookId: nb });
      navigate('notes', n.id, nb ? { nb } : {});
      if (kind !== 'note') setTimeout(() => window.dispatchEvent(new CustomEvent('fn:insert', { detail: kind })), 400);
    }
    if (kind === 'task') { const t = await createTask({ title: '' }); editTask(t); }
    if (kind === 'template') { const t = await pickTemplate(); if (t) { const n = await createNote({ ...t, notebookId: nb }); navigate('notes', n.id); } }
    if (kind === 'clip') navigate('clip');
  };
  const is = (v: string) => route.view === v;
  return (
    <nav className="mobile-nav">
      <a href="#/home" className={is('home') ? 'on' : ''}><Icon name="home" size={22} /><span>Início</span></a>
      <a href="#/notes" className={is('notes') && !route.params.get('q') ? 'on' : ''}><Icon name="notes" size={22} /><span>Notas</span></a>
      <button className="fab" onClick={create} aria-label="Criar"><Icon name="plus" size={26} /></button>
      <a href={href('search')} className={is('search') ? 'on' : ''}><Icon name="search" size={22} /><span>Pesquisa</span></a>
      <a href="#/more" className={['more', 'tasks', 'calendar', 'notebooks', 'tags', 'settings', 'trash', 'clip'].includes(route.view) ? 'on' : ''}><Icon name="menu" size={22} /><span>Mais</span></a>
    </nav>
  );
}

function MoreView() {
  const links: [string, string, string][] = [
    ['#/tasks', 'checkCircle', 'Tarefas'],
    ['#/calendar', 'calendar', 'Calendário'],
    ['#/shortcuts', 'star', 'Atalhos'],
    ['#/files', 'clip', 'Ficheiros'],
    ['#/templates', 'template', 'Modelos'],
    [href('notes', undefined, { filter: 'reminders' }), 'bell', 'Lembretes'],
    ['#/notebooks', 'book', 'Cadernos'],
    ['#/tags', 'tag', 'Etiquetas'],
    ['#/clip', 'globe', 'Recortar página web'],
    ['#/trash', 'trash', 'Lixo'],
    ['#/settings', 'settings', 'Definições'],
  ];
  return (
    <div className="page more-page">
      <header className="page-head"><h1>Mais</h1></header>
      <div className="more-list">
        {links.map(([h, icon, label]) => <a key={h} href={h} className="more-item"><Icon name={icon} size={20} /> {label} <Icon name="chevronRight" size={16} className="ml-auto muted" /></a>)}
      </div>
      <MobileSidebarLists />
    </div>
  );
}

function MobileSidebarLists() {
  // Reutiliza a barra lateral (cadernos, etiquetas, atalhos) dentro do separador "Mais"
  const route = useRoute();
  return <div className="more-sidebar"><Sidebar route={route} /></div>;
}

/** Verifica lembretes de notas e tarefas e mostra notificações. */
function useReminders() {
  useEffect(() => {
    const notified = new Set<string>(JSON.parse(localStorage.getItem('fn:notified') || '[]'));
    const fire = (id: string, title: string, body: string, onOpen: () => void) => {
      if (notified.has(id)) return;
      notified.add(id);
      localStorage.setItem('fn:notified', JSON.stringify([...notified].slice(-500)));
      toast('⏰ ' + title, { label: 'Abrir', fn: onOpen }, 10000);
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        try {
          const n = new Notification(title, { body, icon: '/icon-192.png', tag: id });
          n.onclick = () => { window.focus(); onOpen(); };
        } catch {
          navigator.serviceWorker?.ready.then((reg) => reg.showNotification(title, { body, icon: '/icon-192.png', tag: id }));
        }
      }
    };
    const check = async () => {
      const now = Date.now();
      const notes = alive(await db.notes.toArray());
      for (const n of notes) {
        if (n.reminderAt && !n.reminderDone && !n.trashed && n.reminderAt <= now && now - n.reminderAt < 7 * 86400000) {
          fire('n' + n.id + n.reminderAt, n.title || 'Lembrete', 'Lembrete de nota', () => openNote(n.id));
        }
      }
      const events = alive(await db.events.toArray());
      for (const ev of events) {
        if (ev.reminderMin == null) continue;
        const at = ev.start - ev.reminderMin * 60000;
        if (at <= now && now - at < 86400000 && ev.end > now - 3600000) {
          fire('e' + ev.id + at, ev.title || 'Evento', `${new Date(ev.start).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}${ev.location ? ' · ' + ev.location : ''}`, () => navigate('calendar', undefined, { d: new Date(ev.start).toISOString().slice(0, 10) }));
        }
      }
      const tasks = alive(await db.tasks.toArray());
      for (const t of tasks) {
        if (t.done) continue;
        const at = t.reminderAt || t.due;
        if (at && at <= now && now - at < 7 * 86400000) fire('t' + t.id + at, t.title || 'Tarefa', t.reminderAt ? 'Lembrete de tarefa' : 'Prazo da tarefa', () => editTask(t));
      }
    };
    check();
    const i = setInterval(check, 30000);
    return () => clearInterval(i);
  }, []);
}

function useShortcuts() {
  useEffect(() => {
    const onKey = async (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
      if ((e.ctrlKey || e.metaKey) && e.altKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        const n = await createNote();
        navigate('notes', n.id);
      } else if (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && !target.isContentEditable) || (e.key === '/' && !typing)) {
        e.preventDefault();
        const side = document.getElementById('side-search') as HTMLInputElement | null;
        if (side && side.offsetParent) { side.focus(); return; }
        if (!location.hash.startsWith('#/notes') && !location.hash.startsWith('#/search')) navigate('notes');
        setTimeout(() => (document.querySelector('.search-box input') as HTMLInputElement | null)?.focus(), 50);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
