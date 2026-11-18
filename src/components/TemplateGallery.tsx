// Galeria de modelos: categorias, pesquisa e pré-visualização.
import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { alive, removeDoc } from '../lib/store';
import { BUILTIN_TEMPLATES, TEMPLATE_CATEGORIES } from '../lib/templates';
import { norm } from '../lib/util';
import { Icon, confirmDialog, toast } from '../ui';
import { sanitizePreview } from './pickers';

export interface TemplateChoice { title: string; content: string }
type Entry = { id: string; name: string; icon: string; category: string; description: string; title: string; content: () => string; mine?: boolean };

export function TemplateGallery({ onUse, showBlank }: { onUse: (t: TemplateChoice) => void; showBlank?: boolean }) {
  const mine = useLiveQuery(async () => alive(await db.templates.toArray()), []) || [];
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string>('Todos');
  const [sel, setSel] = useState<string | null>(null);
  const all: Entry[] = useMemo(() => [
    ...mine.map((t) => ({ id: 'm:' + t.id, name: t.name, icon: '⭐', category: 'Os meus modelos', description: 'Modelo guardado por si', title: t.title, content: () => t.content, mine: true })),
    ...BUILTIN_TEMPLATES,
  ], [mine]);
  const cats = ['Todos', ...(mine.length ? ['Os meus modelos'] : []), ...TEMPLATE_CATEGORIES];
  const list = all.filter((t) => (cat === 'Todos' || t.category === cat) && (!q || norm(t.name + ' ' + t.description + ' ' + t.category).includes(norm(q))));
  const current = all.find((t) => t.id === sel) || list[0];
  const preview = useMemo(() => (current ? sanitizePreview(current.content()) : ''), [current?.id]); // eslint-disable-line

  return (
    <div className="tpl-gallery">
      <aside className="tpl-cats">
        <div className="search-box"><Icon name="search" size={15} /><input type="search" placeholder="Procurar modelos" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        {cats.map((c) => (
          <button key={c} className={'tpl-cat' + (cat === c ? ' on' : '')} onClick={() => setCat(c)}>
            {c} <small>{c === 'Todos' ? all.length : all.filter((t) => t.category === c).length}</small>
          </button>
        ))}
      </aside>
      <div className="tpl-list">
        {showBlank && !q && cat === 'Todos' && (
          <button className="tpl-item" onClick={() => onUse({ title: '', content: '' })}>
            <span className="tpl-icon">📄</span><span><strong>Nota em branco</strong><small>Começar do zero</small></span>
          </button>
        )}
        {list.map((t) => (
          <button key={t.id} className={'tpl-item' + (current?.id === t.id ? ' on' : '')} onClick={() => setSel(t.id)} onDoubleClick={() => onUse({ title: t.title, content: t.content() })}>
            <span className="tpl-icon">{t.icon}</span>
            <span className="tpl-text"><strong>{t.name}</strong><small>{t.description}</small></span>
          </button>
        ))}
        {!list.length && <p className="muted pad">Nenhum modelo encontrado.</p>}
      </div>
      {current && (
        <section className="tpl-preview">
          <header>
            <span className="tpl-icon big">{current.icon}</span>
            <div className="flex-1"><h3>{current.name}</h3><small className="muted">{current.category}</small></div>
            {current.mine && <button className="icon-btn" title="Eliminar modelo" onClick={async () => {
              if (await confirmDialog(`Eliminar o modelo “${current.name}”?`, { danger: true, ok: 'Eliminar' })) { await removeDoc('templates', current.id.slice(2)); setSel(null); toast('Modelo eliminado'); }
            }}><Icon name="trash" size={16} /></button>}
            <button className="btn primary" onClick={() => onUse({ title: current.title, content: current.content() })}>Usar este modelo</button>
          </header>
          <div className="tpl-paper prose small"><h2>{current.title || current.name}</h2><div dangerouslySetInnerHTML={{ __html: preview }} /></div>
        </section>
      )}
    </div>
  );
}
