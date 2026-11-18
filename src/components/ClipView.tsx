// Web clipper e destino de partilha (Android/iOS: "Partilhar para FlyNotes").
import { useEffect, useState } from 'react';
import type { Route } from '../lib/router';
import { navigate } from '../lib/router';
import { createNote } from '../lib/store';
import { escapeHtml } from '../lib/util';
import { Icon, toast } from '../ui';
import { pickNotebook } from './pickers';

type Mode = 'article' | 'bookmark' | 'full';

export function ClipView({ route }: { route: Route }) {
  const shared = route.view === 'share';
  const initialUrl = route.params.get('url') || extractUrl(route.params.get('text') || '') || '';
  const [url, setUrl] = useState(initialUrl);
  const [mode, setMode] = useState<Mode>('article');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ title: string; content: string; excerpt: string; url: string } | null>(null);
  const [notebookId, setNotebookId] = useState<string | undefined>();

  // Partilha de texto simples (sem URL) cria logo uma nota
  useEffect(() => {
    if (!shared) return;
    const text = route.params.get('text') || '';
    const title = route.params.get('title') || '';
    if (!initialUrl && (text || title)) {
      (async () => {
        const n = await createNote({ title: title || text.split('\n')[0].slice(0, 60), content: text.split('\n').map((l) => `<p>${escapeHtml(l)}</p>`).join('') });
        navigate('notes', n.id, undefined, true);
      })();
    }
  }, []); // eslint-disable-line

  useEffect(() => { if (initialUrl) fetchPreview(initialUrl); }, []); // eslint-disable-line

  async function fetchPreview(u: string) {
    setBusy(true);
    setPreview(null);
    try {
      const r = await fetch('/api/clip', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: normalize(u) }) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Erro');
      setPreview(data);
    } catch (e: any) {
      toast(e.message || 'Não foi possível recortar a página');
    } finally {
      setBusy(false);
    }
  }

  const save = async () => {
    const u = normalize(url);
    const title = preview?.title || route.params.get('title') || u;
    let content = '';
    const header = `<p><a href="${escapeHtml(u)}">${escapeHtml(u)}</a></p>`;
    if (mode === 'bookmark') content = header + (preview?.excerpt ? `<blockquote><p>${escapeHtml(preview.excerpt)}</p></blockquote>` : '');
    else content = header + '<hr>' + (preview?.content || '');
    const n = await createNote({ title, content, sourceUrl: u, notebookId });
    toast('Página guardada');
    navigate('notes', n.id);
  };

  const bookmarklet = `javascript:(function(){window.open('${location.origin}/#/clip?url='+encodeURIComponent(location.href),'_blank')})()`;

  return (
    <div className="page clip-page">
      <header className="page-head"><h1>Recortar página web</h1></header>
      <form className="row gap" onSubmit={(e) => { e.preventDefault(); fetchPreview(url); }}>
        <input className="input flex-1" type="url" inputMode="url" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} />
        <button className="btn primary" disabled={!url || busy}>{busy ? 'A carregar…' : 'Pré-visualizar'}</button>
      </form>
      <div className="seg">
        <button className={mode === 'article' ? 'on' : ''} onClick={() => setMode('article')}>Artigo</button>
        <button className={mode === 'full' ? 'on' : ''} onClick={() => setMode('full')}>Conteúdo simplificado</button>
        <button className={mode === 'bookmark' ? 'on' : ''} onClick={() => setMode('bookmark')}>Marcador</button>
      </div>
      {preview && (
        <div className="clip-preview">
          <div className="row gap">
            <h2 className="flex-1">{preview.title}</h2>
            <button className="btn" onClick={async () => setNotebookId((await pickNotebook('Guardar em')) || undefined)}><Icon name="book" size={15} /> Caderno</button>
            <button className="btn primary" onClick={save}><Icon name="download" size={15} /> Guardar no FlyNotes</button>
          </div>
          <div className="prose clip-body" dangerouslySetInnerHTML={{ __html: mode === 'bookmark' ? `<p>${escapeHtml(preview.excerpt)}</p>` : sanitize(preview.content) }} />
        </div>
      )}
      <section className="help-box">
        <h3><Icon name="info" size={16} /> Recortar diretamente do browser</h3>
        <p><strong>No telemóvel:</strong> instale o FlyNotes no ecrã principal e use <em>Partilhar → FlyNotes</em> em qualquer página ou texto.</p>
        <p><strong>No computador:</strong> arraste este botão para a barra de marcadores e clique nele em qualquer página:</p>
        <a className="btn bookmarklet" href={bookmarklet} onClick={(e) => { e.preventDefault(); toast('Arraste o botão para a barra de marcadores'); }}><Icon name="plane" size={15} /> Recortar para FlyNotes</a>
      </section>
    </div>
  );
}

function normalize(u: string) {
  return /^https?:\/\//i.test(u) ? u : 'https://' + u;
}
function extractUrl(text: string) {
  return text.match(/https?:\/\/\S+/)?.[0];
}
function sanitize(html: string) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script,style,iframe,object,embed,form').forEach((e) => e.remove());
  doc.querySelectorAll('*').forEach((el) => { for (const a of Array.from(el.attributes)) if (a.name.startsWith('on')) el.removeAttribute(a.name); });
  return doc.body.innerHTML;
}
