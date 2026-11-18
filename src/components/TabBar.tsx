import { useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { useTabs, activateTab, closeTab, closeOtherTabs, syncActiveTab, pruneTabs, openInNewTab } from '../lib/tabs';
import { createNote } from '../lib/store';
import type { Route } from '../lib/router';
import { Icon, Menu } from '../ui';

export function TabBar({ route }: { route: Route }) {
  const { tabs, active } = useTabs();
  const notes = useLiveQuery(async () => {
    const list = await db.notes.bulkGet(tabs.map((t) => t.noteId));
    return new Map(list.filter(Boolean).map((n) => [n!.id, n!]));
  }, [tabs.map((t) => t.noteId).join(',')]);

  // A nota aberta é sempre a do separador ativo
  useEffect(() => {
    if (route.noteId && (route.view === 'notes' || route.view === 'search' || route.view === 'trash')) syncActiveTab(route.noteId);
  }, [route.noteId, route.view]);

  useEffect(() => {
    if (!notes) return;
    pruneTabs(new Set([...notes.values()].filter((n) => !n.deleted).map((n) => n.id)));
  }, [notes]);

  const showingNote = !!route.noteId;
  return (
    <div className="tabbar">
      <button className="mb-nav" title="Recuar" onClick={() => history.back()}><Icon name="chevronLeft" size={16} /></button>
      <button className="mb-nav" title="Avançar" onClick={() => history.forward()}><Icon name="chevronRight" size={16} /></button>
      <div className="tabs" role="tablist" aria-label="Notas abertas">
        {tabs.map((t) => {
          const n = notes?.get(t.noteId);
          const isActive = showingNote && t.id === active;
          return (
            <div key={t.id} className={'tab' + (isActive ? ' active' : '')} title={n?.title || 'Sem título'}
              role="tab" tabIndex={0} aria-selected={isActive}
              onClick={() => activateTab(t.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activateTab(t.id); }
                else if (e.key === 'Delete') { e.preventDefault(); closeTab(t.id); }
              }}
              onAuxClick={(e) => { if (e.button === 1) { e.preventDefault(); closeTab(t.id); } }}
              onContextMenu={(e) => {
                // Antes fechava os outros separadores sem aviso; agora mostra um menu
                e.preventDefault();
                (e.currentTarget.querySelector('.tab-menu button') as HTMLElement | null)?.click();
              }}>
              <Icon name={n?.locked ? 'lock' : 'note'} size={14} />
              <span className="truncate">{n?.title || 'Sem título'}</span>
              <Menu className="tab-menu" align="left" trigger={<button className="tab-menu-btn" tabIndex={-1} aria-hidden="true" />} items={[
                { label: 'Fechar separador', icon: 'close', onClick: () => closeTab(t.id) },
                { label: 'Fechar os outros separadores', onClick: () => { closeOtherTabs(t.id); activateTab(t.id); } },
              ]} />
              <button className="tab-x" aria-label="Fechar separador" onClick={(e) => { e.stopPropagation(); closeTab(t.id); }}>×</button>
            </div>
          );
        })}
        <button className="tab-new" title="Nova nota num novo separador" onClick={async () => { const n = await createNote(); openInNewTab(n.id); }}><Icon name="plus" size={15} /></button>
      </div>
    </div>
  );
}
