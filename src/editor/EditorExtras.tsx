// Componentes do editor: procurar na nota, índice flutuante e barra flutuante de formatação.
import { useEffect, useRef, useState } from 'react';
import { useEditorState, type Editor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import { setFind, findStep, findInfo, replaceCurrent, replaceAll } from './find';
import { useLocalPref } from '../hooks';
import { Icon, Modal, showModal, askText, toast } from '../ui';

// ---------- Procurar na nota ----------
export function FindBar({ editor, initial, onClose }: { editor: Editor; initial: string; onClose: () => void }) {
  const [q, setQ] = useState(initial);
  const [rep, setRep] = useState('');
  const [showRep, setShowRep] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const info = useEditorState({ editor, selector: ({ editor: e }) => findInfo(e) });
  useEffect(() => { setFind(editor, initial); ref.current?.focus(); ref.current?.select(); }, [initial]); // eslint-disable-line
  useEffect(() => () => { if (!editor.isDestroyed) setFind(editor, ''); }, [editor]);
  return (
    <div className="find-bar">
      <Icon name="search" size={15} />
      <input ref={ref} value={q} placeholder="Procurar na nota" onChange={(e) => { setQ(e.target.value); setFind(editor, e.target.value); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); findStep(editor, e.shiftKey ? -1 : 1); }
          if (e.key === 'Escape') onClose();
        }} />
      <span className="muted small find-count">{q ? (info.count ? `${info.index + 1} de ${info.count}` : 'Sem resultados') : ''}</span>
      <button className="icon-btn small" title="Anterior (Shift+Enter)" onClick={() => findStep(editor, -1)}><Icon name="chevronLeft" size={15} /></button>
      <button className="icon-btn small" title="Seguinte (Enter)" onClick={() => findStep(editor, 1)}><Icon name="chevronRight" size={15} /></button>
      {editor.isEditable && <button className={'btn small' + (showRep ? ' on' : '')} onClick={() => setShowRep(!showRep)}>Substituir</button>}
      {showRep && (
        <>
          <input value={rep} placeholder="Substituir por" onChange={(e) => setRep(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && replaceCurrent(editor, rep)} />
          <button className="btn small" onClick={() => replaceCurrent(editor, rep)}>Este</button>
          <button className="btn small" onClick={() => toast(`${replaceAll(editor, rep)} substituição(ões)`)}>Todos</button>
        </>
      )}
      <button className="icon-btn small" title="Fechar (Esc)" onClick={onClose}><Icon name="close" size={15} /></button>
    </div>
  );
}

// ---------- Índice flutuante ----------
export function TocButton({ editor, noteId, scrollEl }: { editor: Editor; noteId: string; scrollEl: HTMLElement | null }) {
  const headings = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const out: { level: number; text: string; pos: number }[] = [];
      e.state.doc.forEach((n, pos) => { if (n.type.name === 'heading' && n.textContent.trim()) out.push({ level: n.attrs.level, text: n.textContent, pos }); });
      return out;
    },
    equalityFn: (a, b) => JSON.stringify(a) === JSON.stringify(b),
  });
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!scrollEl) return;
    let t: any;
    const on = () => { setVisible(true); clearTimeout(t); t = setTimeout(() => !open && setVisible(false), 2500); };
    scrollEl.addEventListener('scroll', on, { passive: true });
    return () => { scrollEl.removeEventListener('scroll', on); clearTimeout(t); };
  }, [scrollEl, open]);
  if (!headings || headings.length < 2) return null;
  const go = (i: number) => {
    const el = editor.view.dom.querySelectorAll('h1, h2, h3')[i] as HTMLElement | undefined;
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setOpen(false);
  };
  return (
    <div className={'toc' + (visible || open ? ' show' : '')}>
      <button className="toc-btn" title="Índice da nota" onClick={() => setOpen(!open)}><Icon name="list" size={17} /></button>
      {open && (
        <div className="toc-panel">
          <div className="toc-title">Índice</div>
          {headings.map((h, i) => (
            <div key={i} className={'toc-item l' + h.level}>
              <button onClick={() => go(i)} className="truncate">{h.text}</button>
              <button className="toc-link" title="Copiar ligação para esta secção" onClick={() => { navigator.clipboard?.writeText(`#/note/${noteId}?h=${i}`); toast('Ligação para a secção copiada — cole-a noutra nota'); }}><Icon name="link" size={13} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- Barra flutuante ao selecionar texto (personalizável) ----------
type ToolId = 'bold' | 'italic' | 'underline' | 'strike' | 'highlight' | 'color' | 'link' | 'code' | 'h1' | 'h2' | 'bullet' | 'task' | 'quote' | 'clear';
const TOOLS: { id: ToolId; label: string; icon?: string; text?: string }[] = [
  { id: 'bold', label: 'Negrito', text: 'B' }, { id: 'italic', label: 'Itálico', text: 'I' }, { id: 'underline', label: 'Sublinhado', text: 'U' },
  { id: 'strike', label: 'Rasurado', text: 'S' }, { id: 'highlight', label: 'Realce', icon: 'highlight' }, { id: 'color', label: 'Cor do texto', icon: 'palette' },
  { id: 'link', label: 'Ligação', icon: 'link' }, { id: 'code', label: 'Código', icon: 'code' }, { id: 'h1', label: 'Título 1', text: 'H1' },
  { id: 'h2', label: 'Título 2', text: 'H2' }, { id: 'bullet', label: 'Lista', icon: 'list' }, { id: 'task', label: 'Lista de verificação', icon: 'checkCircle' },
  { id: 'quote', label: 'Citação', icon: 'quote' }, { id: 'clear', label: 'Limpar formatação', icon: 'type' },
];
const DEFAULT_TOOLS: ToolId[] = ['bold', 'italic', 'underline', 'strike', 'highlight', 'color', 'link', 'h2', 'task'];
const COLORS = ['#111827', '#dc2626', '#ea580c', '#16a34a', '#2563eb', '#7c3aed'];

export function SelectionBubble({ editor }: { editor: Editor }) {
  const [tools, setTools] = useLocalPref<ToolId[]>('bubbleTools', DEFAULT_TOOLS);
  const [colors, setColors] = useState(false);
  const st = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'), italic: e.isActive('italic'), underline: e.isActive('underline'), strike: e.isActive('strike'),
      highlight: e.isActive('highlight'), link: e.isActive('link'), code: e.isActive('code'), h1: e.isActive('heading', { level: 1 }),
      h2: e.isActive('heading', { level: 2 }), bullet: e.isActive('bulletList'), task: e.isActive('taskList'), quote: e.isActive('blockquote'),
    }),
  });
  const c = () => editor.chain().focus();
  const run: Record<ToolId, () => void> = {
    bold: () => c().toggleBold().run(), italic: () => c().toggleItalic().run(), underline: () => c().toggleUnderline().run(),
    strike: () => c().toggleStrike().run(), highlight: () => c().toggleHighlight({ color: '#fef08a' }).run(), color: () => setColors(!colors),
    link: async () => {
      const prev = editor.getAttributes('link').href || '';
      const url = await askText('Ligação', { initial: prev, placeholder: 'https://…', ok: 'Aplicar' });
      if (url === null) return;
      if (!url) c().extendMarkRange('link').unsetLink().run();
      else c().extendMarkRange('link').setLink({ href: /^(https?:|mailto:|tel:|#)/.test(url) ? url : 'https://' + url }).run();
    },
    code: () => c().toggleCode().run(), h1: () => c().toggleHeading({ level: 1 }).run(), h2: () => c().toggleHeading({ level: 2 }).run(),
    bullet: () => c().toggleBulletList().run(), task: () => c().toggleTaskList().run(), quote: () => c().toggleBlockquote().run(),
    clear: () => c().unsetAllMarks().run(),
  };
  const customize = () => showModal<void>((done) => <CustomizeTools tools={tools} setTools={setTools} done={done} />);
  return (
    <BubbleMenu editor={editor} className="bubble" shouldShow={({ editor: e, state }) => e.isEditable && !state.selection.empty && !e.isActive('image') && !e.isActive('fileAttachment') && !e.isActive('dateMention')}>
      {TOOLS.filter((t) => tools.includes(t.id)).map((t) => (
        <button key={t.id} type="button" className={'tb-btn' + ((st as any)?.[t.id] ? ' on' : '')} title={t.label} onMouseDown={(e) => e.preventDefault()} onClick={run[t.id]}>
          {t.icon ? <Icon name={t.icon} size={16} /> : <span className="tb-label">{t.text}</span>}
        </button>
      ))}
      <button type="button" className="tb-btn bubble-cfg" title="Personalizar esta barra" onMouseDown={(e) => e.preventDefault()} onClick={customize}><Icon name="settings" size={14} /></button>
      {colors && (
        <div className="bubble-colors">
          {COLORS.map((col) => <button key={col} style={{ background: col }} onMouseDown={(e) => e.preventDefault()} onClick={() => { c().setColor(col).run(); setColors(false); }} />)}
          <button className="none" onMouseDown={(e) => e.preventDefault()} onClick={() => { c().unsetColor().run(); setColors(false); }}>×</button>
        </div>
      )}
    </BubbleMenu>
  );
}

function CustomizeTools({ tools, setTools, done }: { tools: ToolId[]; setTools: (t: ToolId[]) => void; done: () => void }) {
  const [sel, setSel] = useState<ToolId[]>(tools);
  return (
    <Modal title="Personalizar a barra flutuante" onClose={done}
      footer={<><button className="btn" onClick={() => setSel(DEFAULT_TOOLS)}>Repor predefinição</button><span className="flex-1" /><button className="btn primary" onClick={() => { setTools(sel); done(); }}>Guardar</button></>}>
      <p className="muted">Escolha as ferramentas que aparecem quando seleciona texto.</p>
      <div className="pick-list check-list">
        {TOOLS.map((t) => (
          <label key={t.id} className="pick-item">
            <input type="checkbox" checked={sel.includes(t.id)} onChange={(e) => setSel(e.target.checked ? TOOLS.map((x) => x.id).filter((id) => id === t.id || sel.includes(id)) : sel.filter((x) => x !== t.id))} />
            {t.icon ? <Icon name={t.icon} size={15} /> : <strong style={{ width: 15 }}>{t.text}</strong>} {t.label}
          </label>
        ))}
      </div>
    </Modal>
  );
}
