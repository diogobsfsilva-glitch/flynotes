import { Node, mergeAttributes, Extension } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { CodeBlock } from '@tiptap/extension-code-block';
import { TaskList } from '@tiptap/extension-task-list';
import { TaskItem } from '@tiptap/extension-task-item';
import { TableRow, TableCell, TableHeader } from '@tiptap/extension-table';
import { Highlight } from '@tiptap/extension-highlight';
import { TextStyle, Color, FontSize, FontFamily } from '@tiptap/extension-text-style';
import { TextAlign } from '@tiptap/extension-text-align';
import { Placeholder } from '@tiptap/extension-placeholder';
import { Subscript } from '@tiptap/extension-subscript';
import { Superscript } from '@tiptap/extension-superscript';
import { Typography } from '@tiptap/extension-typography';
import { fileUrl, fileIcon } from '../lib/files';
import { createAudioPlayer } from './audioPlayer';
import { StyledTable, TableFilter, ResizableTableView } from './tables';
import { DateMention } from './dateMention';
import { FindInNote } from './find';
import { CaptionedImage } from './figure';
import { formatBytes } from '../lib/util';
import { openFileViewer, prefersInAppViewer, shareOrDownload } from '../lib/viewer';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    fileAttachment: {
      insertFile: (attrs: { id: string; name: string; mime: string; size: number }) => ReturnType;
    };
    indentTools: {
      indent: () => ReturnType;
      outdent: () => ReturnType;
    };
  }
}

/** Bloco de código com tamanho ajustável: pega no canto (largura e altura; com altura fixa o código faz scroll). */
export const ResizableCodeBlock = CodeBlock.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: { default: null, parseHTML: (el) => Number(el.getAttribute('data-width')) || null, renderHTML: (a) => (a.width ? { 'data-width': String(a.width), style: `width:${a.width}px` } : {}) },
      height: { default: null, parseHTML: (el) => Number(el.getAttribute('data-height')) || null, renderHTML: (a) => (a.height ? { 'data-height': String(a.height), style: `height:${a.height}px;overflow:auto` } : {}) },
    };
  },
  addNodeView() {
    return ({ node, getPos, editor }) => {
      const dom = document.createElement('div');
      dom.className = 'code-wrap';
      const pre = document.createElement('pre');
      const code = document.createElement('code');
      if (node.attrs.language) code.className = 'language-' + node.attrs.language;
      pre.append(code);
      const grip = document.createElement('div');
      grip.className = 'code-resize-corner';
      grip.contentEditable = 'false';
      grip.title = 'Arraste para alterar o tamanho (duplo clique: tamanho automático)';
      dom.append(pre, grip);
      const apply = (w: number | null, h: number | null) => {
        dom.style.width = w ? w + 'px' : '';
        pre.style.height = h ? h + 'px' : '';
        pre.style.overflowY = h ? 'auto' : '';
      };
      apply(node.attrs.width, node.attrs.height);
      const save = (w: number | null, h: number | null) => {
        const pos = typeof getPos === 'function' ? getPos() : undefined;
        if (pos === undefined) return;
        const cur = editor.state.doc.nodeAt(pos);
        if (cur) editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...cur.attrs, width: w, height: h }));
      };
      if (!editor.isEditable) grip.style.display = 'none';
      grip.addEventListener('pointerdown', (e) => {
        if (!editor.isEditable) return;
        e.preventDefault();
        e.stopPropagation();
        grip.setPointerCapture(e.pointerId);
        const r = pre.getBoundingClientRect();
        const maxW = dom.parentElement?.clientWidth || r.width;
        let w: number | null = node.attrs.width || null, h: number | null = node.attrs.height || null;
        dom.classList.add('resizing');
        const move = (ev: PointerEvent) => {
          const nw = Math.round(Math.min(maxW, Math.max(160, r.width + ev.clientX - e.clientX)));
          w = nw >= maxW - 4 ? null : nw;
          h = Math.round(Math.min(2400, Math.max(48, r.height + ev.clientY - e.clientY)));
          apply(w, h);
        };
        const up = () => {
          grip.removeEventListener('pointermove', move);
          grip.removeEventListener('pointerup', up);
          grip.removeEventListener('pointercancel', up);
          dom.classList.remove('resizing');
          save(w, h);
        };
        grip.addEventListener('pointermove', move);
        grip.addEventListener('pointerup', up);
        grip.addEventListener('pointercancel', up);
      });
      grip.addEventListener('dblclick', (e) => { e.preventDefault(); apply(null, null); save(null, null); });
      return {
        dom,
        contentDOM: code,
        update: (n) => {
          if (n.type.name !== node.type.name) return false;
          node = n;
          apply(n.attrs.width, n.attrs.height);
          return true;
        },
        stopEvent: (e) => e.target === grip,
        ignoreMutation: (m) => !code.contains(m.target as globalThis.Node),
      };
    };
  },
});

/** Anexo (PDF, áudio, documento…) apresentado como cartão dentro da nota. */
export const FileAttachment = Node.create({
  name: 'fileAttachment',
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      id: { default: null, parseHTML: (el) => el.getAttribute('data-id') },
      name: { default: 'anexo', parseHTML: (el) => el.getAttribute('data-name') },
      mime: { default: 'application/octet-stream', parseHTML: (el) => el.getAttribute('data-mime') },
      size: { default: 0, parseHTML: (el) => Number(el.getAttribute('data-size') || 0) },
      // Tamanho da pré-visualização (PDF), ajustável com as pegas; null = tamanho padrão
      height: { default: null, parseHTML: (el) => Number(el.getAttribute('data-height')) || null },
      width: { default: null, parseHTML: (el) => Number(el.getAttribute('data-width')) || null },
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-type="file"]' }];
  },
  renderHTML({ node }) {
    return ['div', mergeAttributes({
      'data-type': 'file',
      'data-id': node.attrs.id,
      'data-name': node.attrs.name,
      'data-mime': node.attrs.mime,
      'data-size': String(node.attrs.size),
      ...(node.attrs.height ? { 'data-height': String(node.attrs.height) } : {}),
      ...(node.attrs.width ? { 'data-width': String(node.attrs.width) } : {}),
    }), node.attrs.name];
  },
  addCommands() {
    return {
      // Insere depois da seleção (nunca substitui o texto selecionado)
      insertFile: (attrs) => ({ state, chain }) => chain().setTextSelection(state.selection.to).insertContent({ type: this.name, attrs }).run(),
    };
  },
  addNodeView() {
    return ({ node, getPos, editor }) => {
      const { id, name, mime, size } = node.attrs;
      let applySize: (h: number | null, w: number | null) => void = () => {};
      const dom = document.createElement('div');
      dom.className = 'file-card';
      dom.contentEditable = 'false';
      const url = fileUrl(id);
      const head = document.createElement('div');
      head.className = 'file-card-head';
      const icon = document.createElement('span');
      icon.className = 'file-card-icon';
      icon.textContent = fileIcon(mime);
      const info = document.createElement('div');
      info.className = 'file-card-info';
      const nm = document.createElement('a');
      nm.href = url;
      nm.target = '_blank';
      nm.rel = 'noopener';
      nm.textContent = name;
      const meta = document.createElement('small');
      meta.textContent = `${(mime.split(';')[0].split('/').pop() || '').toUpperCase()} · ${formatBytes(size || 0)}`;
      info.append(nm, meta);
      const dl = document.createElement('a');
      dl.className = 'file-card-dl';
      dl.href = `${url}&download=1&name=${encodeURIComponent(name)}`;
      dl.textContent = '⬇';
      dl.title = 'Descarregar';
      const viewable = mime === 'application/pdf' || mime.startsWith('image/');
      const vf = { id, name, mime };
      // No telemóvel (ou na app instalada) o ficheiro abre dentro da app, com botão de fechar
      nm.addEventListener('click', (e) => {
        if (!prefersInAppViewer()) return;
        e.preventDefault();
        if (viewable) openFileViewer(vf); else shareOrDownload(vf);
      });
      dl.addEventListener('click', (e) => { if (prefersInAppViewer()) { e.preventDefault(); shareOrDownload(vf); } });
      head.append(icon, info);
      if (viewable) {
        const op = document.createElement('button');
        op.type = 'button';
        op.className = 'file-card-open';
        op.title = 'Abrir em ecrã inteiro';
        op.setAttribute('aria-label', 'Abrir em ecrã inteiro');
        op.textContent = '⤢';
        op.onclick = (e) => { e.preventDefault(); openFileViewer(vf); };
        head.append(op);
      }
      head.append(dl);
      dom.append(head);
      // Largura ajustável com a pega do canto (vídeo e áudio); guardada na nota
      const widthResize = (wrap: HTMLElement, corner: HTMLElement, minW: number) => {
      applySize = (_h, w) => { dom.style.width = w ? w + 'px' : ''; };
      applySize(null, node.attrs.width);
      const saveW = (w: number | null) => {
        const pos = typeof getPos === 'function' ? getPos() : undefined;
        if (pos === undefined || !editor.isEditable) return;
        const cur = editor.state.doc.nodeAt(pos);
        if (cur) editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...cur.attrs, width: w, height: null }));
      };
      corner.addEventListener('pointerdown', (e) => {
        if (!editor.isEditable) return;
        e.preventDefault();
        e.stopPropagation();
        corner.setPointerCapture(e.pointerId);
        const startX = e.clientX;
        const w0 = dom.getBoundingClientRect().width;
        const maxW = dom.parentElement?.clientWidth || w0;
        let w: number | null = node.attrs.width || null;
        wrap.classList.add('resizing');
        const move = (ev: PointerEvent) => {
          const nw = Math.round(Math.min(maxW, Math.max(minW, w0 + ev.clientX - startX)));
          w = nw >= maxW - 4 ? null : nw;
          applySize(null, w);
        };
        const up = () => {
          corner.removeEventListener('pointermove', move);
          corner.removeEventListener('pointerup', up);
          corner.removeEventListener('pointercancel', up);
          wrap.classList.remove('resizing');
          saveW(w);
        };
        corner.addEventListener('pointermove', move);
        corner.addEventListener('pointerup', up);
        corner.addEventListener('pointercancel', up);
      });
      corner.addEventListener('dblclick', (e) => { e.preventDefault(); applySize(null, null); saveW(null); });
      };
      let preview: HTMLElement | null = null;
      if (mime.startsWith('audio/')) {
        // Leitor de áudio com pega no canto para alterar a largura
        const aw = document.createElement('div');
        aw.className = 'audio-wrap';
        const ac = document.createElement('div');
        ac.className = 'media-resize-corner';
        ac.title = 'Arraste para alterar a largura (duplo clique: tamanho padrão)';
        aw.append(createAudioPlayer(url), ac);
        dom.append(aw);
        widthResize(aw, ac, 260);
      } else if (mime.startsWith('video/')) {
        const v = document.createElement('video');
        v.controls = true;
        v.preload = 'metadata';
        v.src = url;
        // Moldura com pega no canto: altera a largura (a altura acompanha a proporção do vídeo)
        const vw = document.createElement('div');
        vw.className = 'video-wrap';
        const vc = document.createElement('div');
        vc.className = 'media-resize-corner';
        vc.title = 'Arraste para alterar o tamanho (duplo clique: tamanho padrão)';
        vw.append(v, vc);
        dom.append(vw);
        preview = vw;
        widthResize(vw, vc, 220);
      } else if (mime === 'application/pdf') {
        const f = document.createElement('iframe');
        f.className = 'pdf-preview';
        f.loading = 'lazy';
        f.src = url;
        f.title = name;
        // Moldura redimensionável: pega na base (altura) e no canto (altura e largura)
        const wrap = document.createElement('div');
        wrap.className = 'pdf-wrap';
        const bar = document.createElement('div');
        bar.className = 'pdf-resize-bar';
        bar.title = 'Arraste para alterar a altura (duplo clique: tamanho padrão)';
        const corner = document.createElement('div');
        corner.className = 'pdf-resize-corner';
        corner.title = 'Arraste para alterar a altura e a largura';
        wrap.append(f, bar, corner);
        dom.append(wrap);
        preview = wrap;
        applySize = (h, w) => {
          f.style.height = h ? h + 'px' : '';
          dom.style.width = w ? w + 'px' : '';
        };
        applySize(node.attrs.height, node.attrs.width);
        const save = (h: number | null, w: number | null) => {
          const pos = typeof getPos === 'function' ? getPos() : undefined;
          if (pos === undefined || !editor.isEditable) return;
          const cur = editor.state.doc.nodeAt(pos);
          if (!cur) return;
          editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...cur.attrs, height: h, width: w }));
        };
        const drag = (handle: HTMLElement, both: boolean) => {
          handle.addEventListener('pointerdown', (e) => {
            if (!editor.isEditable) return;
            e.preventDefault();
            e.stopPropagation();
            handle.setPointerCapture(e.pointerId);
            const startY = e.clientY, startX = e.clientX;
            const h0 = f.getBoundingClientRect().height, w0 = dom.getBoundingClientRect().width;
            const maxW = (dom.parentElement?.clientWidth || w0);
            let h = h0, w: number | null = node.attrs.width || null;
            wrap.classList.add('resizing'); // o PDF deixa de captar o rato enquanto se arrasta
            const move = (ev: PointerEvent) => {
              h = Math.round(Math.min(2400, Math.max(160, h0 + ev.clientY - startY)));
              if (both) { const nw = Math.round(Math.min(maxW, Math.max(280, w0 + ev.clientX - startX))); w = nw >= maxW - 4 ? null : nw; }
              applySize(h, w);
            };
            const up = () => {
              handle.removeEventListener('pointermove', move);
              handle.removeEventListener('pointerup', up);
              handle.removeEventListener('pointercancel', up);
              wrap.classList.remove('resizing');
              save(h, w);
            };
            handle.addEventListener('pointermove', move);
            handle.addEventListener('pointerup', up);
            handle.addEventListener('pointercancel', up);
          });
          handle.addEventListener('dblclick', (e) => { e.preventDefault(); applySize(null, null); save(null, null); });
        };
        drag(bar, false);
        drag(corner, true);
      }
      if (preview) {
        const tg = document.createElement('button');
        tg.type = 'button';
        tg.className = 'file-card-toggle';
        tg.title = 'Mostrar/ocultar pré-visualização';
        tg.textContent = '⌃';
        tg.onclick = (e) => {
          e.preventDefault();
          const hidden = preview!.style.display === 'none';
          preview!.style.display = hidden ? '' : 'none';
          tg.classList.toggle('closed', !hidden);
        };
        head.insertBefore(tg, dl);
      }
      return {
        dom,
        // Mudança de tamanho não recria o bloco (o PDF não volta a carregar)
        update: (n) => {
          if (n.type.name !== 'fileAttachment' || n.attrs.id !== id) return false;
          applySize(n.attrs.height, n.attrs.width);
          return true;
        },
        stopEvent: (e) => (e.target as HTMLElement)?.classList?.contains('pdf-resize-bar') || (e.target as HTMLElement)?.classList?.contains('pdf-resize-corner') || (e.target as HTMLElement)?.classList?.contains('media-resize-corner'),
        ignoreMutation: () => true,
      };
    };
  },
});

/** Tab / Shift+Tab para indentar listas. */
const IndentTools = Extension.create({
  name: 'indentTools',
  addCommands() {
    return {
      indent: () => ({ editor, commands }) => {
        if (editor.isActive('table')) return commands.goToNextCell() || commands.addRowAfter();
        if (editor.isActive('taskItem')) return commands.sinkListItem('taskItem');
        if (editor.isActive('listItem')) return commands.sinkListItem('listItem');
        return commands.insertContent('\t');
      },
      outdent: () => ({ editor, commands }) => {
        if (editor.isActive('table')) return commands.goToPreviousCell();
        if (editor.isActive('taskItem')) return commands.liftListItem('taskItem');
        if (editor.isActive('listItem')) return commands.liftListItem('listItem');
        return false;
      },
    };
  },
  addKeyboardShortcuts() {
    return {
      Tab: () => this.editor.commands.indent(),
      'Shift-Tab': () => this.editor.commands.outdent(),
      // Teclado: Esc sai do editor para que Tab volte a navegar pela página (exceto com um menu aberto)
      Escape: () => {
        if (document.querySelector('.date-pop, .menu')) return false;
        (this.editor.view.dom as HTMLElement).blur();
        return true;
      },
    };
  },
});

const cellBg = {
  backgroundColor: {
    default: null,
    parseHTML: (el: HTMLElement) => el.getAttribute('data-bg') || el.style.backgroundColor || null,
    renderHTML: (a: Record<string, any>) => (a.backgroundColor ? { 'data-bg': a.backgroundColor, style: `background-color:${a.backgroundColor}` } : {}),
  },
};

export function buildExtensions(placeholder = 'Comece a escrever…') {
  return [
    StarterKit.configure({
      codeBlock: false, // substituído por ResizableCodeBlock
      heading: { levels: [1, 2, 3] },
      link: { openOnClick: false, autolink: true, defaultProtocol: 'https', HTMLAttributes: { rel: 'noopener noreferrer', target: null } },
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    StyledTable.configure({ resizable: true, View: ResizableTableView as any }),
    TableFilter,
    DateMention,
    FindInNote,
    TableRow,
    TableHeader.extend({ addAttributes() { return { ...this.parent?.(), ...cellBg }; } }),
    TableCell.extend({ addAttributes() { return { ...this.parent?.(), ...cellBg }; } }),
    Highlight.configure({ multicolor: true }),
    TextStyle,
    Color,
    FontSize,
    FontFamily,
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    CaptionedImage.configure({ inline: false, allowBase64: true }),
    Placeholder.configure({ placeholder }),
    Subscript,
    Superscript,
    Typography,
    FileAttachment,
    ResizableCodeBlock,
    IndentTools,
  ];
}
