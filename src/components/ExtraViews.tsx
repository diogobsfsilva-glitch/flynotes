// Páginas: Atalhos, Ficheiros (todos os anexos) e Modelos.
import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type FileMeta } from '../lib/db';
import { alive, createNote, removeDoc, setSetting, toggleShortcut } from '../lib/store';
import { useActiveNotes, useNotebooks, useTags, useSettings, useLocalPref } from '../hooks';
import { fileUrl, fileIcon } from '../lib/files';
import { openFileViewer, prefersInAppViewer, shareOrDownload } from '../lib/viewer';
import { formatBytes, relDate, norm } from '../lib/util';
import { href, navigate, openNote } from '../lib/router';
import { BUILTIN_TEMPLATES } from '../lib/templates';
import { TemplateGallery } from './TemplateGallery';
import { Icon, Empty, toast, confirmDialog } from '../ui';

// ---------- Atalhos ----------
export function ShortcutsView() {
  const settings = useSettings();
  const notes = useActiveNotes();
  const notebooks = useNotebooks();
  const tags = useTags();
  const searches = useLiveQuery(async () => alive(await db.searches.toArray()), []) || [];
  const list = settings.shortcuts || [];
  const resolve = (s: { kind: string; id: string }) => {
    if (s.kind === 'note') { const n = notes.find((x) => x.id === s.id); return n && { icon: 'note', label: n.title || 'Sem título', sub: 'Nota · ' + relDate(n.updatedAt), href: `#/note/${n.id}` }; }
    if (s.kind === 'notebook') { const n = notebooks.find((x) => x.id === s.id); return n && { icon: 'book', label: n.name, sub: 'Caderno' + (n.stack ? ' · ' + n.stack : ''), href: href('notes', undefined, { nb: n.id }) }; }
    if (s.kind === 'tag') { const t = tags.find((x) => x.id === s.id); return t && { icon: 'tag', label: t.name, sub: 'Etiqueta', href: href('notes', undefined, { tag: t.id }) }; }
    const q = searches.find((x) => x.id === s.id);
    return q && { icon: 'search', label: q.name, sub: 'Pesquisa guardada · ' + q.query, href: href('notes', undefined, { q: q.query, ss: q.id }) };
  };
  const move = (i: number, d: number) => {
    const next = [...list];
    const [x] = next.splice(i, 1);
    next.splice(i + d, 0, x);
    setSetting('shortcuts', next);
  };
  return (
    <div className="page">
      <header className="page-head"><h1>Atalhos <small className="muted count-title">{list.length}</small></h1></header>
      <p className="muted">Acesso rápido às notas, cadernos, etiquetas e pesquisas que mais usa. Adicione-os com a estrela ☆.</p>
      {!list.length ? <Empty icon="star" title="Sem atalhos" text="Abra uma nota, caderno, etiqueta ou pesquisa e toque na estrela para a adicionar aqui." /> : (
        <div className="list-card">
          {list.map((s, i) => {
            const r = resolve(s);
            if (!r) return null;
            return (
              <div key={s.kind + s.id} className="list-row">
                <a href={r.href} className="list-main"><Icon name={r.icon} size={17} /> <span><strong>{r.label}</strong><small className="muted">{r.sub}</small></span></a>
                <button className="icon-btn small" disabled={i === 0} onClick={() => move(i, -1)} title="Subir">↑</button>
                <button className="icon-btn small" disabled={i === list.length - 1} onClick={() => move(i, 1)} title="Descer">↓</button>
                <button className="icon-btn small" title="Remover dos atalhos" onClick={() => toggleShortcut(s.kind as any, s.id)}><Icon name="close" size={14} /></button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------- Ficheiros ----------
type Kind = 'all' | 'image' | 'pdf' | 'audio' | 'other';
const kindOf = (m: string): Kind => (m.startsWith('image/') ? 'image' : m === 'application/pdf' ? 'pdf' : m.startsWith('audio/') || m.startsWith('video/') ? 'audio' : 'other');

export function FilesView() {
  const files = useLiveQuery(async () => alive(await db.files.toArray()), []) || [];
  const notes = useActiveNotes();
  const noteMap = useMemo(() => new Map(notes.map((n) => [n.id, n])), [notes]);
  const [kind, setKind] = useState<Kind>('all');
  const [q, setQ] = useState('');
  const [mode, setMode] = useLocalPref<'grid' | 'list'>('filesMode', 'grid');
  const list = files
    .filter((f) => !f.noteId || noteMap.has(f.noteId))
    .filter((f) => kind === 'all' || kindOf(f.mime) === kind)
    .filter((f) => !q || norm(f.name + ' ' + (f.ocrText || '') + ' ' + (noteMap.get(f.noteId || '')?.title || '')).includes(norm(q)))
    .sort((a, b) => b.createdAt - a.createdAt);
  const counts = (k: Kind) => files.filter((f) => k === 'all' || kindOf(f.mime) === k).length;
  const open = (f: FileMeta) => {
    if (f.noteId) return openNote(f.noteId);
    if (prefersInAppViewer()) return f.mime === 'application/pdf' || f.mime.startsWith('image/') ? openFileViewer(f) : shareOrDownload(f);
    window.open(fileUrl(f.id), '_blank');
  };
  return (
    <div className="page wide-page">
      <header className="page-head">
        <h1>Ficheiros <small className="muted count-title">{files.length}</small></h1>
        <span className="flex-1" />
        <div className="search-box inline-search"><Icon name="search" size={15} /><input type="search" placeholder="Procurar ficheiros (inclui texto reconhecido)…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      </header>
      <div className="row gap wrap toolbar-row">
        <div className="seg">
          {([['all', 'Todos'], ['image', 'Imagens'], ['pdf', 'PDF'], ['audio', 'Áudio e vídeo'], ['other', 'Outros']] as [Kind, string][]).map(([k, l]) => (
            <button key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>{l} <small>{counts(k)}</small></button>
          ))}
        </div>
        <span className="flex-1" />
        <button className={'icon-btn' + (mode === 'grid' ? ' accent' : '')} onClick={() => setMode('grid')} title="Grelha"><Icon name="grid" /></button>
        <button className={'icon-btn' + (mode === 'list' ? ' accent' : '')} onClick={() => setMode('list')} title="Lista"><Icon name="list" /></button>
      </div>
      {!list.length ? <Empty icon="clip" title="Sem ficheiros" text="As imagens, PDFs, gravações e documentos anexados às notas aparecem aqui." /> : mode === 'grid' ? (
        <div className="file-grid">
          {list.map((f) => (
            <button key={f.id} className="file-tile" onClick={() => open(f)}>
              <div className="file-thumb">{kindOf(f.mime) === 'image' ? <img src={fileUrl(f.id)} alt="" loading="lazy" /> : <span>{fileIcon(f.mime)}</span>}</div>
              <strong className="truncate">{f.name}</strong>
              <small className="muted truncate">{noteMap.get(f.noteId || '')?.title || 'Sem nota'} · {formatBytes(f.size)}</small>
            </button>
          ))}
        </div>
      ) : (
        <table className="table">
          <thead><tr><th>Nome</th><th>Nota</th><th className="hide-sm">Tamanho</th><th className="hide-sm">Adicionado</th><th /></tr></thead>
          <tbody>
            {list.map((f) => (
              <tr key={f.id}>
                <td><a onClick={() => open(f)} className="pointer">{fileIcon(f.mime)} {f.name}</a></td>
                <td className="muted truncate">{noteMap.get(f.noteId || '')?.title || '—'}</td>
                <td className="muted hide-sm">{formatBytes(f.size)}</td>
                <td className="muted hide-sm">{relDate(f.createdAt)}</td>
                <td className="actions"><a className="icon-btn small" href={`${fileUrl(f.id)}&download=1&name=${encodeURIComponent(f.name)}`} title="Descarregar"><Icon name="download" size={15} /></a></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ---------- Modelos ----------
export function TemplatesView() {
  const use = async (t: { title: string; content: string }) => {
    const n = await createNote(t);
    navigate('notes', n.id);
  };
  return (
    <div className="page wide-page tpl-page">
      <header className="page-head"><h1>Modelos <small className="muted count-title">{BUILTIN_TEMPLATES.length}+</small></h1></header>
      <p className="muted">Escolha um modelo para ver como fica e clique em <strong>Usar este modelo</strong> (ou faça duplo clique). Para guardar os seus, abra uma nota e use <strong>Nota → Guardar como modelo</strong>.</p>
      <TemplateGallery onUse={use} />
    </div>
  );
}
