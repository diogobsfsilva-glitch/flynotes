// Tabelas avançadas: ordenar linhas, filtrar (vista temporária) e estilo das bordas.
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { Table, TableView } from '@tiptap/extension-table';
import { TableMap } from '@tiptap/pm/tables';
import type { EditorView } from '@tiptap/pm/view';
import type { Editor } from '@tiptap/react';
import type { Node as PMNode } from '@tiptap/pm/model';

/**
 * Vista da tabela com uma pega no canto inferior direito para alterar a largura total.
 * A largura é guardada como larguras de coluna (mantendo a proporção entre elas).
 */
export class ResizableTableView extends TableView {
  private grip: HTMLElement;
  private rail: HTMLElement;
  private ro?: ResizeObserver;
  constructor(node: PMNode, cellMinWidth: number, private pmView: EditorView, HTMLAttributes: Record<string, any> = {}) {
    super(node, cellMinWidth, pmView, HTMLAttributes);
    this.rail = document.createElement('div');
    this.rail.className = 'table-resize-rail';
    this.rail.contentEditable = 'false';
    this.grip = document.createElement('div');
    this.grip.className = 'table-resize-corner';
    this.grip.title = 'Arraste para alterar a largura da tabela (duplo clique: largura total)';
    this.rail.append(this.grip);
    this.dom.append(this.rail);
    if (!pmView.editable) this.rail.style.display = 'none';
    // A pega acompanha o canto da tabela, qualquer que seja a largura
    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(() => { this.rail.style.width = this.table.offsetWidth + 'px'; });
      this.ro.observe(this.table);
    }
    this.grip.addEventListener('pointerdown', (e) => this.startDrag(e));
    this.grip.addEventListener('dblclick', (e) => { e.preventDefault(); this.commit(null); });
  }
  private cols(): HTMLElement[] { return Array.from(this.colgroup.children) as HTMLElement[]; }
  private startDrag(e: PointerEvent) {
    if (!this.pmView.editable) return;
    e.preventDefault();
    e.stopPropagation();
    this.grip.setPointerCapture(e.pointerId);
    const cols = this.cols();
    const n = cols.length || 1;
    const total0 = this.table.getBoundingClientRect().width;
    // Larguras atuais de cada coluna (medidas no ecrã; se o navegador não as der, divide por igual)
    const measured = cols.map((c) => c.getBoundingClientRect().width);
    const sum = measured.reduce((a, b) => a + b, 0);
    const base = sum > 10 ? measured.map((w) => (w / sum) * total0) : cols.map(() => total0 / n);
    const min = 40 * n;
    let widths = base;
    this.dom.classList.add('resizing');
    const move = (ev: PointerEvent) => {
      const total = Math.min(2400, Math.max(min, total0 + ev.clientX - e.clientX));
      widths = base.map((w) => Math.max(40, Math.round((w / total0) * total)));
      cols.forEach((c, i) => { c.style.width = widths[i] + 'px'; c.style.minWidth = ''; });
      this.table.style.width = widths.reduce((a, b) => a + b, 0) + 'px';
      this.table.style.minWidth = '';
    };
    const up = () => {
      this.grip.removeEventListener('pointermove', move);
      this.grip.removeEventListener('pointerup', up);
      this.grip.removeEventListener('pointercancel', up);
      this.dom.classList.remove('resizing');
      this.commit(widths);
    };
    this.grip.addEventListener('pointermove', move);
    this.grip.addEventListener('pointerup', up);
    this.grip.addEventListener('pointercancel', up);
  }
  /** Guarda as larguras nas células (null = sem larguras, a tabela volta a ocupar a largura da nota). */
  private commit(widths: number[] | null) {
    const view = this.pmView;
    let pos: number;
    try { pos = view.posAtDOM(this.contentDOM, 0); } catch { return; }
    const $pos = view.state.doc.resolve(pos);
    let d = $pos.depth;
    while (d > 0 && $pos.node(d).type.name !== 'table') d--;
    if (d === 0 && $pos.node(0).type.name !== 'table') return;
    const table = $pos.node(d);
    const start = $pos.start(d);
    const map = TableMap.get(table);
    const tr = view.state.tr;
    const seen = new Set<number>();
    for (const cellPos of map.map) {
      if (seen.has(cellPos)) continue;
      seen.add(cellPos);
      const cell = table.nodeAt(cellPos);
      if (!cell) continue;
      const col = map.colCount(cellPos);
      const span = cell.attrs.colspan || 1;
      const colwidth = widths ? Array.from({ length: span }, (_, i) => widths[col + i] || 40) : null;
      tr.setNodeMarkup(start + cellPos, undefined, { ...cell.attrs, colwidth });
    }
    if (tr.docChanged) view.dispatch(tr);
  }
  stopEvent(e: Event) { return this.rail.contains(e.target as Node); }
  destroy() { this.ro?.disconnect(); }
}

/** Tabela com atributos de borda (cor e estilo). */
export const StyledTable = Table.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      borderColor: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-border-color'),
        renderHTML: (a) => (a.borderColor ? { 'data-border-color': a.borderColor, style: `--tb-color:${a.borderColor}` } : {}),
      },
      borderStyle: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-border-style'),
        renderHTML: (a) => (a.borderStyle ? { 'data-border-style': a.borderStyle } : {}),
      },
    };
  },
});

// ---------- Localizar a tabela e a coluna atuais ----------
export function currentTable(editor: Editor): { node: PMNode; pos: number; col: number } | null {
  const { $from } = editor.state.selection;
  for (let d = $from.depth; d > 0; d--) {
    if ($from.node(d).type.name === 'table') {
      // Coluna: índice da célula na linha (profundidade d+2 é a célula)
      const col = $from.depth >= d + 2 ? $from.index(d + 1) : 0;
      return { node: $from.node(d), pos: $from.before(d), col };
    }
  }
  return null;
}

function parseValue(text: string): { kind: 'num' | 'date' | 'text'; v: number | string } {
  const t = text.trim();
  const date = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (date) {
    const y = +date[3] < 100 ? 2000 + +date[3] : +date[3];
    return { kind: 'date', v: new Date(y, +date[2] - 1, +date[1]).getTime() };
  }
  const iso = t.match(/^\d{4}-\d{2}-\d{2}/);
  if (iso) return { kind: 'date', v: Date.parse(t) };
  const num = t.replace(/[€$%\s]/g, '');
  if (/^-?[\d.]+(,\d+)?$/.test(num) || /^-?\d+(\.\d+)?$/.test(num)) {
    const n = /,\d+$/.test(num) || /\.\d{3}/.test(num) ? Number(num.replace(/\./g, '').replace(',', '.')) : Number(num);
    if (Number.isFinite(n)) return { kind: 'num', v: n };
  }
  return { kind: 'text', v: t.toLowerCase() };
}

/** Ordena as linhas da tabela pela coluna onde está o cursor (mantém a linha de cabeçalho no topo). */
export function sortTable(editor: Editor, dir: 'asc' | 'desc') {
  const t = currentTable(editor);
  if (!t) return;
  const rows: PMNode[] = [];
  t.node.forEach((r) => rows.push(r));
  const isHeader = (r: PMNode) => r.childCount > 0 && r.firstChild!.type.name === 'tableHeader' && Array.from({ length: r.childCount }).every((_, i) => r.child(i).type.name === 'tableHeader');
  const head = rows.length && isHeader(rows[0]) ? [rows[0]] : [];
  const body = rows.slice(head.length);
  const cellText = (r: PMNode) => (t.col < r.childCount ? r.child(t.col).textContent : '');
  body.sort((a, b) => {
    const va = parseValue(cellText(a));
    const vb = parseValue(cellText(b));
    let r: number;
    if (va.kind === vb.kind && va.kind !== 'text') r = (va.v as number) - (vb.v as number);
    else r = String(va.v).localeCompare(String(vb.v), 'pt', { numeric: true });
    if (!cellText(a).trim()) return 1;
    if (!cellText(b).trim()) return -1;
    return dir === 'asc' ? r : -r;
  });
  const next = t.node.type.create(t.node.attrs, [...head, ...body]);
  editor.view.dispatch(editor.state.tr.replaceWith(t.pos, t.pos + t.node.nodeSize, next));
}

export function setTableBorders(editor: Editor, attrs: { borderColor?: string | null; borderStyle?: string | null }) {
  const t = currentTable(editor);
  if (!t) return;
  editor.view.dispatch(editor.state.tr.setNodeMarkup(t.pos, undefined, { ...t.node.attrs, ...attrs }));
}

// ---------- Filtro de linhas (apenas na vista; não altera o conteúdo) ----------
const filterKey = new PluginKey<{ pos: number; query: string } | null>('tableFilter');

export const TableFilter = Extension.create({
  name: 'tableFilter',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: filterKey,
        state: {
          init: () => null,
          apply(tr, value: { pos: number; query: string } | null): { pos: number; query: string } | null {
            const meta = tr.getMeta(filterKey) as { pos: number; query: string } | null | undefined;
            if (meta !== undefined) return meta;
            if (value && tr.docChanged) return { pos: tr.mapping.map(value.pos), query: value.query };
            return value;
          },
        },
        props: {
          decorations(state) {
            const f = filterKey.getState(state);
            if (!f || !f.query) return null;
            const table = state.doc.nodeAt(f.pos);
            if (!table || table.type.name !== 'table') return null;
            const q = f.query.toLowerCase();
            const decos: Decoration[] = [];
            let offset = f.pos + 1;
            table.forEach((row, _o, i) => {
              const header = i === 0 && row.firstChild?.type.name === 'tableHeader';
              if (!header && !row.textContent.toLowerCase().includes(q)) decos.push(Decoration.node(offset, offset + row.nodeSize, { class: 'row-filtered' }));
              offset += row.nodeSize;
            });
            decos.push(Decoration.node(f.pos, f.pos + table.nodeSize, { 'data-filter': f.query }));
            return DecorationSet.create(state.doc, decos);
          },
        },
      }),
    ];
  },
});

export function setTableFilter(editor: Editor, query: string | null) {
  const t = currentTable(editor);
  if (!t && query) return;
  editor.view.dispatch(editor.state.tr.setMeta(filterKey, query ? { pos: t!.pos, query } : null));
}
export function getTableFilter(editor: Editor): string {
  return filterKey.getState(editor.state)?.query || '';
}
