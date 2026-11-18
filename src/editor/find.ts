// Procurar (e substituir) na nota, com realce de todas as ocorrências. Ignora acentos e maiúsculas.
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Editor } from '@tiptap/react';
import type { Node as PMNode } from '@tiptap/pm/model';

interface FindState { query: string; index: number; matches: { from: number; to: number }[] }
export const findKey = new PluginKey<FindState>('find');

const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function findMatches(doc: PMNode, query: string) {
  const out: { from: number; to: number }[] = [];
  const q = fold(query);
  if (!q) return out;
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    // A normalização NFD mantém o comprimento para texto em forma composta (caso normal)
    const t = fold(node.text);
    let i = t.indexOf(q);
    while (i >= 0 && out.length < 1000) {
      out.push({ from: pos + i, to: pos + i + q.length });
      i = t.indexOf(q, i + q.length);
    }
  });
  return out;
}

export const FindInNote = Extension.create({
  name: 'findInNote',
  addProseMirrorPlugins() {
    return [
      new Plugin<FindState>({
        key: findKey,
        state: {
          init: () => ({ query: '', index: 0, matches: [] }),
          apply(tr, prev, _o, state) {
            const meta = tr.getMeta(findKey) as Partial<FindState> | undefined;
            if (meta) {
              const query = meta.query ?? prev.query;
              const matches = findMatches(state.doc, query);
              const index = Math.min(meta.index ?? 0, Math.max(0, matches.length - 1));
              return { query, index, matches };
            }
            if (tr.docChanged && prev.query) {
              const matches = findMatches(state.doc, prev.query);
              return { ...prev, matches, index: Math.min(prev.index, Math.max(0, matches.length - 1)) };
            }
            return prev;
          },
        },
        props: {
          decorations(state) {
            const s = findKey.getState(state);
            if (!s?.query || !s.matches.length) return null;
            return DecorationSet.create(state.doc, s.matches.map((m, i) => Decoration.inline(m.from, m.to, { class: i === s.index ? 'find-hit current' : 'find-hit' })));
          },
        },
      }),
    ];
  },
});

export function setFind(editor: Editor, query: string, index = 0) {
  editor.view.dispatch(editor.state.tr.setMeta(findKey, { query, index }));
  revealCurrent(editor);
}
export function findStep(editor: Editor, dir: 1 | -1) {
  const s = findKey.getState(editor.state);
  if (!s?.matches.length) return;
  const index = (s.index + dir + s.matches.length) % s.matches.length;
  editor.view.dispatch(editor.state.tr.setMeta(findKey, { index }));
  revealCurrent(editor);
}
export function findInfo(editor: Editor) {
  const s = findKey.getState(editor.state);
  return { count: s?.matches.length || 0, index: s?.index || 0 };
}
export function replaceCurrent(editor: Editor, text: string) {
  const s = findKey.getState(editor.state);
  const m = s?.matches[s.index];
  if (!m) return;
  editor.view.dispatch(editor.state.tr.insertText(text, m.from, m.to));
  editor.view.dispatch(editor.state.tr.setMeta(findKey, { index: s!.index }));
  revealCurrent(editor);
}
export function replaceAll(editor: Editor, text: string) {
  const s = findKey.getState(editor.state);
  if (!s?.matches.length) return 0;
  let tr = editor.state.tr;
  for (const m of [...s.matches].reverse()) tr = tr.insertText(text, m.from, m.to);
  editor.view.dispatch(tr);
  editor.view.dispatch(editor.state.tr.setMeta(findKey, { index: 0 }));
  return s.matches.length;
}
function revealCurrent(editor: Editor) {
  const s = findKey.getState(editor.state);
  const m = s?.matches[s.index];
  if (!m) return;
  const tr = editor.state.tr.setSelection(TextSelection.create(editor.state.doc, m.from, m.to)).scrollIntoView();
  editor.view.dispatch(tr);
  requestAnimationFrame(() => {
    const el = editor.view.dom.querySelector('.find-hit.current');
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });
}
