// Pega de arrastar blocos (⋮⋮): arrastar para reordenar; clicar para opções do bloco.
import { useRef, useState } from 'react';
import { DragHandle } from '@tiptap/extension-drag-handle-react';
import type { Editor } from '@tiptap/react';
import type { Node as PMNode } from '@tiptap/pm/model';
import { Icon } from '../ui';

export function BlockHandle({ editor }: { editor: Editor }) {
  const target = useRef<{ node: PMNode | null; pos: number }>({ node: null, pos: -1 });
  const [menu, setMenu] = useState(false);

  const atBlock = () => {
    const { node, pos } = target.current;
    if (!node || pos < 0) return null;
    return { node, pos };
  };
  const run = (fn: (b: { node: PMNode; pos: number }) => void) => () => {
    const b = atBlock();
    setMenu(false);
    if (b) fn(b);
  };
  const turnInto = (cmd: (c: ReturnType<Editor['chain']>) => ReturnType<Editor['chain']>) =>
    run(({ pos, node }) => {
      if (!node.isTextblock && !['bulletList', 'orderedList', 'taskList', 'blockquote'].includes(node.type.name)) return;
      cmd(editor.chain().focus().setTextSelection(pos + 1)).run();
    });

  return (
    <DragHandle editor={editor} className="block-handle-wrap"
      onNodeChange={({ node, pos }) => { target.current = { node, pos }; if (!node) setMenu(false); }}>
      <div className="block-handle">
        <button type="button" className="bh-add" title="Inserir bloco abaixo" onMouseDown={(e) => e.preventDefault()}
          onClick={run(({ node, pos }) => editor.chain().focus().insertContentAt(pos + node.nodeSize, { type: 'paragraph' }).setTextSelection(pos + node.nodeSize + 1).run())}>
          <Icon name="plus" size={14} />
        </button>
        <button type="button" className="bh-grip" title="Arrastar para mover · clicar para opções" onClick={() => setMenu(!menu)}>
          <svg width="12" height="16" viewBox="0 0 12 16" aria-hidden="true">
            {[3, 8, 13].flatMap((y) => [3, 9].map((x) => <circle key={x + '-' + y} cx={x} cy={y} r="1.5" fill="currentColor" />))}
          </svg>
        </button>
        {menu && (
          <div className="menu left bh-menu" onMouseDown={(e) => e.preventDefault()}>
            <div className="bh-menu-title">Transformar em</div>
            <button className="menu-item" onClick={turnInto((c) => c.setParagraph())}><Icon name="type" size={15} /> Texto</button>
            <button className="menu-item" onClick={turnInto((c) => c.setHeading({ level: 1 }))}><span className="bh-h">H1</span> Título 1</button>
            <button className="menu-item" onClick={turnInto((c) => c.setHeading({ level: 2 }))}><span className="bh-h">H2</span> Título 2</button>
            <button className="menu-item" onClick={turnInto((c) => c.setHeading({ level: 3 }))}><span className="bh-h">H3</span> Título 3</button>
            <button className="menu-item" onClick={turnInto((c) => c.toggleBulletList())}><Icon name="list" size={15} /> Lista com marcas</button>
            <button className="menu-item" onClick={turnInto((c) => c.toggleOrderedList())}><span className="bh-h">1.</span> Lista numerada</button>
            <button className="menu-item" onClick={turnInto((c) => c.toggleTaskList())}><Icon name="checkCircle" size={15} /> Lista de verificação</button>
            <button className="menu-item" onClick={turnInto((c) => c.toggleBlockquote())}><Icon name="quote" size={15} /> Citação</button>
            <button className="menu-item" onClick={turnInto((c) => c.toggleCodeBlock())}><Icon name="code" size={15} /> Bloco de código</button>
            <div className="menu-div" />
            <button className="menu-item" onClick={run(({ node, pos }) => editor.chain().focus().insertContentAt(pos + node.nodeSize, node.toJSON()).run())}><Icon name="copy" size={15} /> Duplicar bloco</button>
            <button className="menu-item" onClick={run(({ pos }) => editor.chain().focus().setNodeSelection(pos).run())}><Icon name="checkCircle" size={15} /> Selecionar bloco</button>
            <button className="menu-item danger" onClick={run(({ node, pos }) => editor.chain().focus().deleteRange({ from: pos, to: pos + node.nodeSize }).run())}><Icon name="trash" size={15} /> Eliminar bloco</button>
          </div>
        )}
      </div>
    </DragHandle>
  );
}
