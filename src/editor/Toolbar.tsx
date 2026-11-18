import { useEditorState, type Editor } from '@tiptap/react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon, Menu, askText, chooseDialog, type MenuItem } from '../ui';
import { sortTable, setTableFilter, getTableFilter, setTableBorders } from './tables';

async function chooseColor(title: string): Promise<string | null | undefined> {
  const v = await chooseDialog(title, [{ value: '__none', label: 'Sem cor (padrão)', icon: '⬜' }, ...CELL_COLORS.map(([l, c]) => ({ value: c, label: l, icon: '■' }))]);
  if (!v) return undefined;
  return v === '__none' ? null : v;
}
const CELL_COLORS: [string, string][] = [['Cinzento claro', '#f3f4f6'], ['Amarelo', '#fef9c3'], ['Verde', '#dcfce7'], ['Azul', '#dbeafe'], ['Rosa', '#fce7f3'], ['Laranja', '#ffedd5'], ['Lilás', '#ede9fe'], ['Cinzento escuro', '#6b7280'], ['Azul escuro', '#1d4ed8'], ['Vermelho', '#dc2626']];

const COLORS: [string, string][] = [['Preto', '#111827'], ['Vermelho', '#dc2626'], ['Laranja', '#ea580c'], ['Amarelo', '#ca8a04'], ['Verde', '#16a34a'], ['Ciano', '#0891b2'], ['Azul', '#2563eb'], ['Roxo', '#7c3aed'], ['Rosa', '#db2777'], ['Cinzento', '#6b7280']];
const HIGHLIGHTS: [string, string][] = [['Amarelo', '#fef08a'], ['Verde', '#bbf7d0'], ['Azul', '#bfdbfe'], ['Rosa', '#fbcfe8'], ['Laranja', '#fed7aa'], ['Lilás', '#e9d5ff']];

export interface ToolbarActions {
  onImage: () => void;
  onFile: () => void;
  onCamera: () => void;
  onAudio: () => void;
  onNoteLink: () => void;
  onDictate: () => void;
  dictating: boolean;
  onTask: () => void;
  onEvent: () => void;
}

const FONTS: [string, string | null][] = [['Sans Serif', null], ['Serif', 'Georgia, "Times New Roman", serif'], ['Monoespaçada', 'ui-monospace, Menlo, Consolas, monospace'], ['Manuscrita', '"Segoe Print", "Bradley Hand", "Comic Sans MS", cursive']];
const NUM_SIZES = [10, 12, 14, 15, 16, 18, 20, 24, 30, 36];

export function Toolbar({ editor, actions }: { editor: Editor; actions: ToolbarActions }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      strike: e.isActive('strike'),
      code: e.isActive('code'),
      h1: e.isActive('heading', { level: 1 }),
      h2: e.isActive('heading', { level: 2 }),
      h3: e.isActive('heading', { level: 3 }),
      bullet: e.isActive('bulletList'),
      ordered: e.isActive('orderedList'),
      task: e.isActive('taskList'),
      quote: e.isActive('blockquote'),
      codeBlock: e.isActive('codeBlock'),
      link: e.isActive('link'),
      table: e.isActive('table'),
      highlight: e.isActive('highlight'),
      sub: e.isActive('subscript'),
      sup: e.isActive('superscript'),
      align: e.isActive({ textAlign: 'center' }) ? 'center' : e.isActive({ textAlign: 'right' }) ? 'right' : 'left',
      font: (e.getAttributes('textStyle').fontFamily as string) || '',
      size: (e.getAttributes('textStyle').fontSize as string) || '',
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });
  const c = () => editor.chain().focus();
  // Barra adaptável: quando falta espaço, os grupos menos usados passam para o menu «⋯».
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  const [level, setLevel] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Ao mudar de largura recomeça com tudo visível e recolhe grupos até a barra caber (medição real).
  // Recomeça também quando o conteúdo da barra muda (entrar/sair de uma tabela, ditado, estilo e tipo de letra)
  const shape = `${w}|${s.table}|${actions.dictating}|${s.h1}${s.h2}${s.h3}|${s.font}|${s.size}`;
  useLayoutEffect(() => { setLevel(0); }, [shape]);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && level < 10 && el.scrollWidth > el.clientWidth + 1) setLevel(level + 1);
  }, [level, shape]);
  const hide = {
    font: level >= 1,
    indent: level >= 2,
    capture: level >= 3,
    color: level >= 4,
    lists: level >= 5,
    link: level >= 6,
    redo: level >= 7,
    insertLabel: level >= 8,
    style: level >= 9,
    underline: level >= 10,
  };
  const anyHidden = Object.values(hide).some(Boolean);
  const header = (label: string): MenuItem => ({ label, disabled: true });
  const style = s.h1 ? 'Título 1' : s.h2 ? 'Título 2' : s.h3 ? 'Título 3' : 'Normal';
  const overflow: MenuItem[] = [
    ...(hide.style ? [header('Estilo'), { label: 'Normal', checked: style === 'Normal', onClick: () => c().setParagraph().run() }, { label: 'Título 1', checked: s.h1, onClick: () => c().toggleHeading({ level: 1 }).run() }, { label: 'Título 2', checked: s.h2, onClick: () => c().toggleHeading({ level: 2 }).run() }, { label: 'Título 3', checked: s.h3, onClick: () => c().toggleHeading({ level: 3 }).run() }, { divider: true }] : []),
    ...(hide.underline ? [{ label: 'Sublinhado', checked: s.underline, onClick: () => c().toggleUnderline().run() }] : []),
    ...(hide.redo ? [{ label: 'Refazer', icon: 'redo', onClick: () => c().redo().run() }] : []),
    ...(hide.link ? [{ label: 'Ligação', icon: 'link', checked: s.link, onClick: () => setLink() }, { divider: true }] : []),
    ...(hide.capture ? [header('Captar'), { label: 'Ditado', icon: 'dictate', checked: actions.dictating, onClick: actions.onDictate }, { label: 'Gravar áudio', icon: 'mic', onClick: actions.onAudio }, { label: 'Lembrete / evento', icon: 'calendar', onClick: actions.onEvent }, { divider: true }] : []),
    ...(hide.color ? [header('Texto'), { label: 'Rasurado', checked: s.strike, onClick: () => c().toggleStrike().run() }, ...HIGHLIGHTS.slice(0, 4).map(([label, col]) => ({ label: 'Realce ' + label.toLowerCase(), swatch: col, onClick: () => c().toggleHighlight({ color: col }).run() })), { label: 'Sem realce', onClick: () => c().unsetHighlight().run() }, ...COLORS.slice(0, 7).map(([label, col]) => ({ label: 'Cor ' + label.toLowerCase(), swatch: col, onClick: () => c().setColor(col).run() })), { label: 'Cor padrão', onClick: () => c().unsetColor().run() }, { divider: true }] : []),
    ...(hide.lists ? [header('Listas'), { label: 'Lista numerada', checked: s.ordered, onClick: () => c().toggleOrderedList().run() }, { label: 'Lista de verificação', icon: 'checkCircle', checked: s.task, onClick: () => c().toggleTaskList().run() }, { divider: true }] : []),
    ...(hide.indent ? [header('Parágrafo'), { label: 'Diminuir avanço', icon: 'outdent', onClick: () => c().outdent().run() }, { label: 'Aumentar avanço', icon: 'indent', onClick: () => c().indent().run() }, { label: 'Alinhar à esquerda', icon: 'alignLeft', onClick: () => c().setTextAlign('left').run() }, { label: 'Centrar', icon: 'alignCenter', onClick: () => c().setTextAlign('center').run() }, { label: 'Alinhar à direita', icon: 'alignRight', onClick: () => c().setTextAlign('right').run() }, { divider: true }] : []),
    ...(hide.font ? [header('Tipo de letra'), ...FONTS.map(([label, fam]) => ({ label, checked: fam ? !!s.font && s.font.startsWith(fam.split(',')[0]) : !s.font, onClick: () => (fam ? c().setFontFamily(fam).run() : c().unsetFontFamily().run()) })), { divider: true }, header('Tamanho'), { label: 'Padrão', checked: !s.size, onClick: () => c().unsetFontSize().run() }, ...[12, 14, 16, 20, 24].map((n) => ({ label: String(n), checked: s.size === n + 'px', onClick: () => c().setFontSize(n + 'px').run() }))] : []),
  ];
  while (overflow.length && overflow[overflow.length - 1].divider) overflow.pop();
  const B = ({ on, icon, title, run, label }: { on?: boolean; icon?: string; title: string; run: () => void; label?: string }) => (
    <button type="button" className={'tb-btn' + (on ? ' on' : '')} title={title} aria-label={title}
      onMouseDown={(e) => e.preventDefault()} onClick={run}>
      {icon ? <Icon name={icon} size={17} /> : <span className="tb-label">{label}</span>}
    </button>
  );

  const setLink = async () => {
    const prev = editor.getAttributes('link').href || '';
    const url = await askText('Ligação', { initial: prev, placeholder: 'https://…', ok: 'Aplicar' });
    if (url === null) return;
    if (!url) return c().extendMarkRange('link').unsetLink().run();
    const href = /^(https?:|mailto:|tel:|#)/.test(url) ? url : 'https://' + url;
    if (editor.state.selection.empty && !prev) {
      c().insertContent(`<a href="${href.replace(/"/g, '&quot;')}">${url.replace(/</g, '&lt;')}</a> `).run();
    } else c().extendMarkRange('link').setLink({ href }).run();
  };

  return (
    <div className="toolbar" role="toolbar" ref={ref}>
      <B icon="undo" title="Anular (Ctrl+Z)" run={() => c().undo().run()} />
      {!hide.redo && <B icon="redo" title="Refazer (Ctrl+Shift+Z)" run={() => c().redo().run()} />}
      <span className="tb-sep" />
      {(!hide.capture || actions.dictating) && <B on={actions.dictating} icon="dictate" title={actions.dictating ? 'Parar o ditado' : 'Ditado: fale e o texto aparece na nota'} run={actions.onDictate} />}
      {!hide.capture && <B icon="mic" title="Gravar áudio" run={actions.onAudio} />}
      <B icon="checkCircle" title="Adicionar tarefa à nota" run={actions.onTask} />
      {!hide.capture && <B icon="calendar" title="Lembrete / evento" run={actions.onEvent} />}
      <span className="tb-sep" />
      {!hide.style && <Menu align="left" trigger={<button type="button" className="tb-btn tb-select" onMouseDown={(e) => e.preventDefault()}>{style} <Icon name="chevronDown" size={14} /></button>}
        items={[
          { label: 'Normal', checked: style === 'Normal', onClick: () => c().setParagraph().run() },
          { label: 'Título 1', checked: s.h1, onClick: () => c().toggleHeading({ level: 1 }).run() },
          { label: 'Título 2', checked: s.h2, onClick: () => c().toggleHeading({ level: 2 }).run() },
          { label: 'Título 3', checked: s.h3, onClick: () => c().toggleHeading({ level: 3 }).run() },
        ]} />}
      {!hide.font && <>
      <Menu align="left" trigger={<button type="button" className="tb-btn tb-select tb-font" title="Tipo de letra" onMouseDown={(e) => e.preventDefault()}>{(FONTS.find(([, f]) => f && s.font && s.font.startsWith(f.split(',')[0])) || FONTS[0])[0]} <Icon name="chevronDown" size={14} /></button>}
        items={FONTS.map(([label, fam]) => ({ label, checked: fam ? !!s.font && s.font.startsWith(fam.split(',')[0]) : !s.font, onClick: () => (fam ? c().setFontFamily(fam).run() : c().unsetFontFamily().run()) }))} />
      <Menu align="left" trigger={<button type="button" className="tb-btn tb-select tb-size" title="Tamanho da letra" onMouseDown={(e) => e.preventDefault()}>{s.size ? s.size.replace('px', '') : '—'} <Icon name="chevronDown" size={14} /></button>}
        items={[{ label: 'Tamanho padrão', checked: !s.size, onClick: () => c().unsetFontSize().run() }, { divider: true }, ...NUM_SIZES.map((n) => ({ label: String(n), checked: s.size === n + 'px', onClick: () => c().setFontSize(n + 'px').run() }))]} />
      </>}
      <span className="tb-sep" />
      <B on={s.bold} label="B" title="Negrito (Ctrl+B)" run={() => c().toggleBold().run()} />
      <B on={s.italic} label="I" title="Itálico (Ctrl+I)" run={() => c().toggleItalic().run()} />
      {!hide.underline && <B on={s.underline} label="U" title="Sublinhado (Ctrl+U)" run={() => c().toggleUnderline().run()} />}
      {!hide.color && <B on={s.strike} label="S" title="Rasurado" run={() => c().toggleStrike().run()} />}
      {!hide.color && <><Menu align="left" trigger={<button type="button" className={'tb-btn' + (s.highlight ? ' on' : '')} title="Realce" onMouseDown={(e) => e.preventDefault()}><Icon name="highlight" size={17} /></button>}
        items={[...HIGHLIGHTS.map(([label, col]) => ({ label, swatch: col, onClick: () => c().toggleHighlight({ color: col }).run() })), { divider: true }, { label: 'Sem realce', onClick: () => c().unsetHighlight().run() }]} />
      <Menu align="left" trigger={<button type="button" className="tb-btn" title="Cor do texto" onMouseDown={(e) => e.preventDefault()}><Icon name="palette" size={17} /></button>}
        items={[...COLORS.map(([label, col]) => ({ label, swatch: col, onClick: () => c().setColor(col).run() })), { divider: true }, { label: 'Cor padrão', onClick: () => c().unsetColor().run() }]} /></>}
      <span className="tb-sep" />
      <B on={s.bullet} icon="list" title="Lista com marcas" run={() => c().toggleBulletList().run()} />
      {!hide.lists && <B on={s.ordered} label="1." title="Lista numerada" run={() => c().toggleOrderedList().run()} />}
      {!hide.lists && <B on={s.task} icon="checkCircle" title="Lista de verificação" run={() => c().toggleTaskList().run()} />}
      {!hide.indent && <B icon="outdent" title="Diminuir avanço" run={() => c().outdent().run()} />}
      {!hide.indent && <B icon="indent" title="Aumentar avanço" run={() => c().indent().run()} />}
      <span className="tb-sep" />
      {!hide.indent && <Menu align="left" trigger={<button type="button" className="tb-btn" title="Alinhamento" onMouseDown={(e) => e.preventDefault()}><Icon name={s.align === 'center' ? 'alignCenter' : s.align === 'right' ? 'alignRight' : 'alignLeft'} size={17} /></button>}
        items={[
          { label: 'Esquerda', icon: 'alignLeft', onClick: () => c().setTextAlign('left').run() },
          { label: 'Centro', icon: 'alignCenter', onClick: () => c().setTextAlign('center').run() },
          { label: 'Direita', icon: 'alignRight', onClick: () => c().setTextAlign('right').run() },
        ]} />}
      {!hide.link && <B on={s.link} icon="link" title="Ligação (Ctrl+K)" run={setLink} />}
      <Menu align="left" trigger={<button type="button" className="tb-btn tb-insert" title="Inserir" onMouseDown={(e) => e.preventDefault()}><Icon name="plus" size={17} />{!hide.insertLabel && <> <span className="tb-label">Inserir</span></>}</button>}
        items={[
          { label: 'Imagem', icon: 'image', onClick: actions.onImage },
          { label: 'Ficheiro / PDF', icon: 'clip', onClick: actions.onFile },
          { label: 'Fotografia / digitalizar', icon: 'camera', onClick: actions.onCamera },
          { label: 'Gravação de áudio', icon: 'mic', onClick: actions.onAudio },
          { label: 'Ligação para nota', icon: 'note', onClick: actions.onNoteLink },
          { divider: true },
          { label: 'Tabela', icon: 'table', onClick: () => c().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
          { label: 'Bloco de código', icon: 'code', onClick: () => c().toggleCodeBlock().run() },
          { label: 'Citação', icon: 'quote', onClick: () => c().toggleBlockquote().run() },
          { label: 'Linha divisória', icon: 'hr', onClick: () => c().setHorizontalRule().run() },
          { label: 'Data e hora', icon: 'calendar', onClick: () => c().insertContent(new Date().toLocaleString('pt-PT', { dateStyle: 'long', timeStyle: 'short' }) + ' ').run() },
          { divider: true },
          { label: 'Código em linha', icon: 'code', onClick: () => c().toggleCode().run() },
          { label: 'Inferior à linha', onClick: () => c().toggleSubscript().run(), checked: s.sub },
          { label: 'Superior à linha', onClick: () => c().toggleSuperscript().run(), checked: s.sup },
          { label: 'Limpar formatação', icon: 'type', onClick: () => c().unsetAllMarks().clearNodes().run() },
        ]} />
      {s.table && (
        <Menu align="left" trigger={<button type="button" className="tb-btn on" title="Tabela" onMouseDown={(e) => e.preventDefault()}><Icon name="table" size={17} /> <span className="tb-label">Tabela</span></button>}
          items={[
            { label: 'Ordenar A→Z / 0→9 (coluna atual)', icon: 'sort', onClick: () => sortTable(editor, 'asc') },
            { label: 'Ordenar Z→A / 9→0 (coluna atual)', icon: 'sort', onClick: () => sortTable(editor, 'desc') },
            { label: getTableFilter(editor) ? `Filtro: “${getTableFilter(editor)}” — alterar` : 'Filtrar linhas…', icon: 'search', onClick: async () => {
              const q = await askText('Filtrar linhas da tabela', { initial: getTableFilter(editor), placeholder: 'Mostrar só as linhas que contêm…', ok: 'Filtrar' });
              if (q !== null) setTableFilter(editor, q.trim() || null);
            } },
            ...(getTableFilter(editor) ? [{ label: 'Remover filtro', icon: 'close', onClick: () => setTableFilter(editor, null) }] : []),
            { divider: true },
            { label: 'Linha acima', onClick: () => c().addRowBefore().run() },
            { label: 'Linha abaixo', onClick: () => c().addRowAfter().run() },
            { label: 'Coluna à esquerda', onClick: () => c().addColumnBefore().run() },
            { label: 'Coluna à direita', onClick: () => c().addColumnAfter().run() },
            { label: 'Juntar / separar células', onClick: () => c().mergeOrSplit().run() },
            { divider: true },
            { label: 'Linha de cabeçalho (topo)', onClick: () => c().toggleHeaderRow().run() },
            { label: 'Coluna de cabeçalho (primeira)', onClick: () => c().toggleHeaderColumn().run() },
            { label: 'Cor de fundo da célula', icon: 'palette', onClick: async () => {
              const v = await chooseColor('Cor de fundo da célula');
              if (v !== undefined) c().setCellAttribute('backgroundColor', v).run();
            } },
            { divider: true },
            { label: 'Bordas: contínuas', onClick: () => setTableBorders(editor, { borderStyle: null }) },
            { label: 'Bordas: tracejadas', onClick: () => setTableBorders(editor, { borderStyle: 'dashed' }) },
            { label: 'Bordas: grossas', onClick: () => setTableBorders(editor, { borderStyle: 'thick' }) },
            { label: 'Sem bordas', onClick: () => setTableBorders(editor, { borderStyle: 'none' }) },
            { label: 'Cor das bordas…', icon: 'palette', onClick: async () => {
              const v = await chooseColor('Cor das bordas');
              if (v !== undefined) setTableBorders(editor, { borderColor: v });
            } },
            { divider: true },
            { label: 'Eliminar linha', danger: true, onClick: () => c().deleteRow().run() },
            { label: 'Eliminar coluna', danger: true, onClick: () => c().deleteColumn().run() },
            { label: 'Eliminar tabela', danger: true, onClick: () => c().deleteTable().run() },
          ]} />
      )}
      {anyHidden && overflow.length > 0 && (
        <Menu align="right" trigger={<button type="button" className="tb-btn" title="Mais formatação" aria-label="Mais formatação" onMouseDown={(e) => e.preventDefault()}><Icon name="more" size={17} /></button>} items={overflow} />
      )}
    </div>
  );
}
