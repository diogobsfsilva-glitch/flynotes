// Imagem com legenda (figure + figcaption). A legenda é pesquisável e pode ser preenchida automaticamente.
import { Image } from '@tiptap/extension-image';
import { db } from '../lib/db';
import { openFileViewer, prefersInAppViewer } from '../lib/viewer';

export const CaptionedImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      caption: {
        default: '',
        parseHTML: (el) => el.closest('figure')?.querySelector('figcaption')?.textContent || el.getAttribute('data-caption') || '',
        renderHTML: () => ({}),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'figure[data-type="image"] img[src]' }, { tag: 'img[src]' }];
  },
  renderHTML({ node, HTMLAttributes }) {
    const img: any = ['img', { ...HTMLAttributes, alt: node.attrs.caption || HTMLAttributes.alt || '' }];
    if (!node.attrs.caption) return img;
    return ['figure', { 'data-type': 'image' }, img, ['figcaption', {}, node.attrs.caption]];
  },
  addNodeView() {
    return ({ node, editor, getPos }) => {
      const fig = document.createElement('figure');
      fig.className = 'img-figure';
      fig.dataset.type = 'image';
      const img = document.createElement('img');
      img.src = node.attrs.src;
      img.alt = node.attrs.caption || node.attrs.alt || '';
      // Moldura com pega no canto para alterar o tamanho (a altura acompanha a proporção)
      const wrap = document.createElement('span');
      wrap.className = 'img-wrap';
      const grip = document.createElement('span');
      grip.className = 'media-resize-corner';
      grip.title = 'Arraste para alterar o tamanho (duplo clique: tamanho original)';
      const applyWidth = (w: number | null) => { img.style.width = w ? w + 'px' : ''; };
      applyWidth(Number(node.attrs.width) || null);
      const saveWidth = (w: number | null) => {
        const pos = typeof getPos === 'function' ? getPos() : null;
        if (pos == null) return;
        const cur = editor.state.doc.nodeAt(pos);
        if (cur) editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...cur.attrs, width: w, height: null }));
      };
      grip.addEventListener('pointerdown', (e) => {
        if (!editor.isEditable) return;
        e.preventDefault();
        e.stopPropagation();
        grip.setPointerCapture(e.pointerId);
        const startX = e.clientX;
        const w0 = img.getBoundingClientRect().width;
        const maxW = fig.clientWidth || w0;
        let w: number | null = Number(node.attrs.width) || null;
        wrap.classList.add('resizing');
        const move = (ev: PointerEvent) => {
          const nw = Math.round(Math.min(maxW, Math.max(60, w0 + ev.clientX - startX)));
          w = nw;
          applyWidth(nw);
        };
        const up = () => {
          grip.removeEventListener('pointermove', move);
          grip.removeEventListener('pointerup', up);
          grip.removeEventListener('pointercancel', up);
          wrap.classList.remove('resizing');
          saveWidth(w);
        };
        grip.addEventListener('pointermove', move);
        grip.addEventListener('pointerup', up);
        grip.addEventListener('pointercancel', up);
      });
      grip.addEventListener('dblclick', (e) => { e.preventDefault(); applyWidth(null); saveWidth(null); });
      // Abrir a imagem em ecrã inteiro (com botão de fechar): um toque no telemóvel, duplo clique no computador
      const openFull = () => {
        const src = String(node.attrs.src || '');
        const id = src.match(/\/api\/file\?id=([A-Za-z0-9_-]+)/)?.[1];
        const name = node.attrs.caption || node.attrs.alt || 'Imagem';
        openFileViewer(id ? { id, name, mime: 'image/*' } : { id: '', name, mime: 'image/*', url: src });
      };
      img.addEventListener('click', () => { if (prefersInAppViewer()) openFull(); });
      img.addEventListener('dblclick', (e) => { e.preventDefault(); openFull(); });
      img.title = 'Duplo clique para ver em ecrã inteiro';
      wrap.append(img, grip);
      const cap = document.createElement('input');
      cap.className = 'img-caption';
      cap.placeholder = 'Adicionar legenda…';
      cap.value = node.attrs.caption || '';
      const auto = document.createElement('button');
      auto.type = 'button';
      auto.className = 'img-autocap';
      auto.textContent = '✨ Legenda automática';
      auto.title = 'Preencher a legenda com o texto reconhecido na imagem (ou o nome do ficheiro)';
      const setCaption = (v: string) => {
        const pos = typeof getPos === 'function' ? getPos() : null;
        if (pos == null) return;
        editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, caption: v }));
      };
      cap.onchange = () => setCaption(cap.value.trim());
      cap.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); cap.blur(); } e.stopPropagation(); };
      auto.onclick = async () => {
        const id = String(node.attrs.src).match(/id=([A-Za-z0-9_-]+)/)?.[1];
        const f = id ? await db.files.get(id) : undefined;
        const ocr = (f?.ocrText || '').replace(/\s+/g, ' ').trim();
        const text = ocr ? ocr.slice(0, 140) + (ocr.length > 140 ? '…' : '') : (f?.name || '').replace(/\.[a-z0-9]+$/i, '');
        if (!text) { auto.textContent = 'Sem texto reconhecido'; return; }
        cap.value = text;
        setCaption(text);
      };
      const bar = document.createElement('div');
      bar.className = 'img-capbar';
      bar.append(cap, auto);
      if (!editor.isEditable) { cap.readOnly = true; auto.remove(); grip.remove(); if (!cap.value) bar.style.display = 'none'; }
      fig.append(wrap, bar);
      return {
        dom: fig,
        stopEvent: (e) => bar.contains(e.target as globalThis.Node) || e.target === grip,
        ignoreMutation: () => true,
        update: (n) => {
          if (n.type.name !== node.type.name) return false;
          node = n;
          if (img.getAttribute('src') !== n.attrs.src) img.src = n.attrs.src;
          applyWidth(Number(n.attrs.width) || null);
          if (document.activeElement !== cap) cap.value = n.attrs.caption || '';
          return true;
        },
      };
    };
  },
});
