import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Note, type Task } from '../lib/db';
import { buildExtensions } from '../editor/extensions';
import { Toolbar } from '../editor/Toolbar';
import { BlockHandle } from '../editor/BlockHandle';
import { put, patch, saveNoteContent, trashNote, duplicateNote, toggleShortcut, alive, createTask, toggleTask, restoreNote, deleteNoteForever, removeDoc, saveConflictCopy } from '../lib/store';
import { addFile, fileUrl, enhanceScan, downscaleImage } from '../lib/files';
import { escapeHtml, debounce, relDate, uid, wordCount, download, safeFilename, dateTimeShort, htmlToText } from '../lib/util';
import { encryptText, decryptText, unlocked } from '../lib/crypto';
import { exportEnex, htmlToMarkdown, noteToHtmlDocument } from '../lib/enex';
import { closeNote, navigate, openNote, useRoute } from '../lib/router';
import { FindBar, TocButton, SelectionBubble } from '../editor/EditorExtras';
import { highlightTerms } from '../lib/search';
import { Icon, Menu, askText, confirmDialog, toast, chooseDialog, showModal } from '../ui';
import { TagBar, pickNotebook, pickDateTime, pickNote, openHistory, recordAudio, NoteInfoDialog, sanitizePreview } from './pickers';
import { useNotebooks, useSettings, useActiveNotes } from '../hooks';
import { publishNoteActions } from '../lib/noteActions';
import { dictationSupported, startDictation, type Dictation } from '../lib/dictation';
import { useLocalPref } from '../hooks';

export function NoteEditor({ noteId, onBack }: { noteId: string; onBack?: () => void }) {
  const note = useLiveQuery(() => db.notes.get(noteId), [noteId]);
  const [, setUnlockTick] = useState(0);
  if (note === undefined) return <div className="editor-pane loading" />;
  if (!note || note.deleted) {
    return (
      <div className="editor-pane empty-editor">
        <p className="muted">Esta nota já não existe.</p>
        <button className="btn" onClick={closeNote}>Voltar</button>
      </div>
    );
  }
  if (note.locked && !unlocked.has(note.id)) return <LockedNote note={note} onBack={onBack} onUnlocked={() => setUnlockTick((x) => x + 1)} />;
  return <EditorInner key={note.id} note={note} onBack={onBack} />;
}

function LockedNote({ note, onBack, onUnlocked }: { note: Note; onBack?: () => void; onUnlocked: () => void }) {
  const [pass, setPass] = useState('');
  const [err, setErr] = useState('');
  return (
    <div className="editor-pane">
      <div className="editor-top">{onBack && <button className="icon-btn" onClick={onBack}><Icon name="back" /></button>}</div>
      <form className="locked" onSubmit={async (e) => {
        e.preventDefault();
        try {
          await decryptText(note.locked!, pass);
          unlocked.set(note.id, pass);
          onUnlocked();
        } catch {
          setErr('Frase-passe incorreta');
        }
      }}>
        <Icon name="lock" size={40} />
        <h2>{note.title || 'Nota encriptada'}</h2>
        <p className="muted">Esta nota está encriptada. Introduza a frase-passe para a abrir.</p>
        <input className="input" type="password" autoFocus value={pass} onChange={(e) => setPass(e.target.value)} placeholder="Frase-passe" />
        {err && <p className="danger-text">{err}</p>}
        <button className="btn primary">Desbloquear</button>
      </form>
    </div>
  );
}

function EditorInner({ note, onBack }: { note: Note; onBack?: () => void }) {
  const notebooks = useNotebooks();
  const settings = useSettings();
  const [title, setTitle] = useState(note.title);
  const [saved, setSaved] = useState(true);
  const [initialContent, setInitialContent] = useState<string | null>(note.locked ? null : note.content);
  const lastSaved = useRef({ title: note.title, content: note.content });
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const route = useRoute();
  const searchTerm = highlightTerms(route.params.get('q') || '').join(' ');
  const [find, setFindOpen] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const [focusMode, setFocusMode] = useState(false);
  const [expanded, setExpanded] = useLocalPref<boolean>('editorExpanded', false);
  const readOnly = !!note.trashed;

  // Notas encriptadas: desencriptar com a frase-passe desta sessão
  useEffect(() => {
    if (!note.locked) return;
    decryptText(note.locked, unlocked.get(note.id)!).then((html) => {
      lastSaved.current.content = html;
      setInitialContent(html);
    });
  }, []); // eslint-disable-line

  // Conteúdos que este editor gravou há pouco (para distinguir as nossas gravações das de outro dispositivo)
  const written = useRef<string[]>([]);
  const conflictFor = useRef(0);
  const persist = useMemo(
    () => debounce(async (t: string, html: string) => {
      written.current = [html, ...written.current].slice(0, 6);
      const pass = unlocked.get(note.id);
      const cur = await db.notes.get(note.id);
      if (cur?.locked && pass) {
        const locked = await encryptText(html, pass);
        const fresh = await db.notes.get(note.id);
        if (fresh && !fresh.deleted) await put('notes', { ...fresh, title: t, locked, content: '', text: '' });
      } else {
        await saveNoteContent(note.id, t, html);
      }
      lastSaved.current = { title: t, content: html };
      setSaved(true);
    }, 600),
    [note.id],
  );

  const editor = useEditor({
    extensions: buildExtensions(),
    content: initialContent ?? '',
    editable: !readOnly,
    immediatelyRender: true,
    editorProps: {
      attributes: { class: 'prose editor-content', spellcheck: 'true' },
      handlePaste: (_view, event) => {
        const files = Array.from(event.clipboardData?.files || []);
        if (!files.length) return false;
        event.preventDefault();
        insertFiles(files);
        return true;
      },
      handleDrop: (_view, event) => {
        const files = Array.from((event as DragEvent).dataTransfer?.files || []);
        if (!files.length) return false;
        event.preventDefault();
        insertFiles(files);
        return true;
      },
      handleClickOn: (_view, _pos, _node, _nodePos, event) => {
        const a = (event.target as HTMLElement).closest('a');
        if (!a) return false;
        const href = a.getAttribute('href') || '';
        if (href.startsWith('#/note/')) {
          event.preventDefault();
          if (href.includes('?')) location.hash = href;
          else openNote(href.slice(7));
          return true;
        }
        if ((event as MouseEvent).ctrlKey || (event as MouseEvent).metaKey || !editorRef.current?.isEditable) {
          window.open(href, '_blank', 'noopener');
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor }) => {
      setSaved(false);
      persist(titleRef.current?.value ?? title, editor.getHTML());
    },
  }, [initialContent === null ? 'locked' : 'ready']);

  // Atualizações vindas de outro dispositivo (sincronização) enquanto a nota está aberta
  useEffect(() => {
    if (!editor || editor.isDestroyed || note.locked) return;
    const differs = note.content !== lastSaved.current.content;
    if (differs && saved) {
      // Sem alterações locais por gravar: mostra a versão recebida, mesmo com o cursor no texto
      const { from, to } = editor.state.selection;
      const focused = editor.isFocused;
      editor.commands.setContent(note.content, { emitUpdate: false });
      if (focused) {
        const max = editor.state.doc.content.size;
        editor.commands.setTextSelection({ from: Math.min(from, max), to: Math.min(to, max) });
      }
      lastSaved.current.content = note.content;
    } else if (differs && !saved && !written.current.includes(note.content) && conflictFor.current !== note.updatedAt) {
      // Chegou uma versão de outro dispositivo enquanto havia texto por gravar aqui:
      // a versão local vai prevalecer, por isso a recebida fica guardada numa cópia.
      conflictFor.current = note.updatedAt;
      saveConflictCopy(note).then(() => toast('Esta nota foi alterada noutro dispositivo — a outra versão ficou numa cópia em conflito'));
    }
    if (note.title !== lastSaved.current.title && saved && document.activeElement !== titleRef.current) {
      setTitle(note.title);
      lastSaved.current.title = note.title;
    }
  }, [note.content, note.title]); // eslint-disable-line

  // Guardar ao sair
  useEffect(() => {
    const flushNow = () => persist.flush();
    const onVis = () => { if (document.visibilityState === 'hidden') persist.flush(); };
    window.addEventListener('pagehide', flushNow);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('pagehide', flushNow);
      document.removeEventListener('visibilitychange', onVis);
      persist.flush();
    };
  }, [persist]);
  useEffect(() => {
    if (!note.title && !note.content && !note.locked) setTimeout(() => titleRef.current?.focus(), 50);
  }, []); // eslint-disable-line
  useEffect(() => { autoGrow(titleRef.current); }, [title]);

  const insertFiles = useCallback(async (files: File[], scan = false) => {
    for (const f of files) {
      let blob: Blob = f;
      if (f.type.startsWith('image/')) blob = scan ? await enhanceScan(f) : await downscaleImage(f);
      const name = scan ? `Digitalização ${new Date().toLocaleString('pt-PT')}.jpg` : f.name;
      const meta = await addFile(blob, name, note.id);
      const ed = editorRef.current;
      if (!ed) continue;
      if (meta.mime.startsWith('image/')) ed.chain().focus().setTextSelection(ed.state.selection.to).setImage({ src: fileUrl(meta.id), alt: name }).run();
      else ed.chain().focus().insertFile({ id: meta.id, name: meta.name, mime: meta.mime, size: meta.size }).run();
    }
  }, [note.id]);
  const editorRef = useRef<Editor | null>(null);
  editorRef.current = editor;

  const nb = notebooks.find((n) => n.id === note.notebookId);
  const isShortcut = !!settings.shortcuts?.some((s) => s.kind === 'note' && s.id === note.id);

  const onTitle = (v: string) => {
    setTitle(v);
    setSaved(false);
    persist(v, editor?.getHTML() || '');
  };

  const [dictation, setDictation] = useState<Dictation | null>(null);
  const [interim, setInterim] = useState('');
  const toggleDictation = () => {
    if (dictation) { dictation.stop(); setDictation(null); return; }
    if (!dictationSupported()) return toast('O ditado não é suportado neste browser. Use o Chrome, Edge ou Safari.');
    const d = startDictation({
      onFinal: (t) => {
        const ed = editorRef.current;
        if (!ed || !t) return;
        const parts = t.split('\n');
        const chain = ed.chain().focus();
        parts.forEach((p, i) => { if (i > 0) chain.splitBlock(); if (p) chain.insertContent(p.replace(/^ /, '') + ' '); });
        chain.run();
      },
      onInterim: setInterim,
      onEnd: () => setDictation(null),
      onError: (m) => { toast(m); setDictation(null); },
    });
    setDictation(d);
    if (d) toast('A ouvir… diga "vírgula", "ponto final" ou "nova linha" para pontuar');
  };
  useEffect(() => () => dictation?.stop(), [dictation]);

  const actions = {
    onImage: () => imageInput.current?.click(),
    onFile: () => fileInput.current?.click(),
    onCamera: () => cameraInput.current?.click(),
    onAudio: async () => {
      const r = await recordAudio();
      if (!r) return;
      const ext = r.blob.type.includes('mp4') ? 'm4a' : 'webm';
      const meta = await addFile(r.blob, `Gravação ${new Date().toLocaleString('pt-PT').replace(/[/:]/g, '-')}.${ext}`, note.id);
      const chain = editor?.chain().focus().insertFile({ id: meta.id, name: meta.name, mime: meta.mime, size: meta.size });
      if (r.transcript) chain?.insertContent(`<blockquote><p><em>Transcrição:</em> ${escapeHtml(r.transcript).replace(/\n/g, '</p><p>')}</p></blockquote><p></p>`);
      chain?.run();
    },
    onDictate: () => toggleDictation(),
    dictating: !!dictation,
    onTask: async () => { const t = await createTask({ title: '', noteId: note.id }); editTask(t); },
    onEvent: async () => {
      const v = await pickDateTime('Lembrete / evento desta nota', note.reminderAt);
      if (v !== undefined) await patch<Note>('notes', note.id, { reminderAt: v, reminderDone: 0 });
    },
    onNoteLink: async () => {
      const target = await pickNote('Ligar a uma nota', note.id);
      if (!target) return;
      const text = (target.title || 'Sem título').replace(/</g, '&lt;');
      editor?.chain().focus().insertContent(`<a href="#/note/${target.id}">${text}</a> `).run();
    },
  };

  // Ctrl+F: procurar na nota
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f' && !e.shiftKey) {
        e.preventDefault();
        const sel = editor ? editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to, ' ') : '';
        setFindOpen(sel && sel.length < 60 ? sel : find || '');
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });
  // Aberta a partir de uma pesquisa: salta para a primeira ocorrência
  useEffect(() => {
    if (searchTerm && editor && !note.locked) setTimeout(() => setFindOpen(searchTerm.split(' ')[0]), 150);
  }, [editor, searchTerm]); // eslint-disable-line
  // Ligação para uma secção (#/note/<id>?h=N)
  useEffect(() => {
    const h = route.params.get('h');
    if (!editor || h == null) return;
    setTimeout(() => (editor.view.dom.querySelectorAll('h1, h2, h3')[Number(h)] as HTMLElement | undefined)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 200);
  }, [editor, route.params.get('h')]); // eslint-disable-line

  // Pedido de inserção vindo do botão "Criar" no telemóvel (fotografia / voz)
  useEffect(() => {
    const h = (e: Event) => {
      const kind = (e as CustomEvent).detail;
      if (kind === 'photo') actions.onCamera();
      if (kind === 'audio') actions.onAudio();
    };
    window.addEventListener('fn:insert', h);
    return () => window.removeEventListener('fn:insert', h);
  });

  const lockNote = async () => {
    if (note.locked) {
      const ok = await confirmDialog('Remover a encriptação desta nota? O conteúdo passa a ficar pesquisável.', { ok: 'Remover encriptação' });
      if (!ok) return;
      const html = editor?.getHTML() || '';
      const cur = (await db.notes.get(note.id))!;
      await put('notes', { ...cur, locked: null, content: html, text: htmlToText(html) });
      unlocked.delete(note.id);
      toast('Encriptação removida');
      return;
    }
    const pass = await askText('Encriptar nota', { type: 'password', label: 'Escolha uma frase-passe. Se a esquecer, não é possível recuperar o conteúdo.', ok: 'Encriptar' });
    if (!pass) return;
    const again = await askText('Confirmar frase-passe', { type: 'password', ok: 'Confirmar' });
    if (again !== pass) return toast('As frases-passe não coincidem');
    await persist.flush();
    const html = editor?.getHTML() || '';
    const locked = await encryptText(html, pass);
    const cur = (await db.notes.get(note.id))!;
    // As versões antigas ficariam legíveis; são removidas
    const versions = await db.versions.where('noteId').equals(note.id).toArray();
    for (const v of versions) await removeDoc('versions', v.id);
    await put('notes', { ...cur, locked, content: '', text: '' });
    unlocked.set(note.id, pass);
    toast('Nota encriptada');
  };

  const exportAs = async () => {
    const kind = await chooseDialog('Exportar nota', [
      { value: 'pdf', label: 'PDF / Imprimir', icon: '🖨️' },
      { value: 'html', label: 'Página HTML', icon: '🌐' },
      { value: 'md', label: 'Markdown', icon: '📝' },
      { value: 'enex', label: 'ENEX (compatível com Evernote)', icon: '🐘' },
    ]);
    const html = editor?.getHTML() || '';
    const n = { ...note, title, content: html };
    const fname = safeFilename(title || 'nota');
    if (kind === 'pdf') printNote(n);
    if (kind === 'html') download(fname + '.html', noteToHtmlDocument(n), 'text/html');
    if (kind === 'md') download(fname + '.md', `# ${title}\n\n` + htmlToMarkdown(html), 'text/markdown');
    if (kind === 'enex') download(fname + '.enex', await exportEnex([n]), 'application/xml');
  };

  const menuItems = readOnly ? [
    { label: 'Restaurar nota', icon: 'undo', onClick: async () => { await restoreNote(note.id); toast('Nota restaurada'); } },
    { label: 'Eliminar definitivamente', icon: 'trash', danger: true, onClick: async () => {
      if (await confirmDialog('Eliminar esta nota para sempre?', { danger: true, ok: 'Eliminar' })) { await deleteNoteForever(note.id); closeNote(); }
    } },
  ] : [
    { label: isShortcut ? 'Remover dos atalhos' : 'Adicionar aos atalhos', icon: 'star', onClick: async () => toast((await toggleShortcut('note', note.id)) ? 'Adicionado aos atalhos' : 'Removido dos atalhos') },
    { label: note.pinned ? 'Desafixar do topo' : 'Fixar no topo do caderno', icon: 'pin', onClick: () => patch<Note>('notes', note.id, { pinned: note.pinned ? 0 : 1 }) },
    { label: 'Fixar na página inicial', icon: 'home', onClick: async () => { const { setSetting } = await import('../lib/store'); await setSetting('pinnedNoteId', note.id); toast('Fixada na página inicial'); } },
    { divider: true },
    { label: 'Mover para…', icon: 'move', onClick: async () => { const id = await pickNotebook('Mover para caderno', note.notebookId); if (id) await patch<Note>('notes', note.id, { notebookId: id }); } },
    { label: 'Duplicar', icon: 'copy', onClick: async () => { await persist.flush(); const d = await duplicateNote(note.id); if (d) openNote(d.id); } },
    { label: 'Copiar ligação interna', icon: 'link', onClick: () => { navigator.clipboard?.writeText(`#/note/${note.id}`); toast('Ligação copiada — cole-a noutra nota'); } },
    { label: 'Guardar como modelo', icon: 'template', onClick: async () => {
      const name = await askText('Nome do modelo', { initial: title || 'Modelo' });
      if (name) { await put('templates', { id: uid(), name, title, content: editor?.getHTML() || '', updatedAt: 0 }); toast('Modelo guardado'); }
    } },
    { divider: true },
    { label: 'Histórico de versões', icon: 'history', onClick: async () => { await persist.flush(); openHistory(note); } },
    { label: note.locked ? 'Remover encriptação' : 'Encriptar nota', icon: note.locked ? 'unlock' : 'lock', onClick: lockNote },
    { label: 'Exportar…', icon: 'download', onClick: exportAs },
    { label: 'Informação da nota', icon: 'info', onClick: () => showModal<void>((done) => <NoteInfoDialog note={note} done={done} />) },
    { label: focusMode ? 'Sair do modo de foco' : 'Modo de foco', icon: 'maximize', onClick: () => setFocusMode(!focusMode) },
    { divider: true },
    { label: 'Mover para o lixo', icon: 'trash', danger: true, onClick: async () => {
      await persist.flush();
      await trashNote(note.id);
      closeNote();
      toast('Nota movida para o lixo', { label: 'Anular', fn: () => restoreNote(note.id) });
    } },
  ];

  // Disponibiliza as ações desta nota no menu "Nota" da barra de menus
  useEffect(() => {
    publishNoteActions([
      ...(readOnly ? [] : [{ label: 'Definir lembrete…', icon: 'bell', onClick: async () => {
        const v = await pickDateTime('Lembrete', note.reminderAt);
        if (v !== undefined) await patch<Note>('notes', note.id, { reminderAt: v, reminderDone: 0 });
      } }, { label: 'Adicionar tarefa à nota', icon: 'checkCircle', onClick: async () => { const t = await createTask({ title: '', noteId: note.id }); editTask(t); } }, { divider: true }]),
      ...menuItems,
    ]);
  });
  useEffect(() => () => publishNoteActions([]), []);

  return (
    <div className={'editor-pane' + (focusMode ? ' focus-mode' : '')}>
      <div className="editor-top">
        {onBack && <button className="icon-btn" onClick={() => { persist.flush(); onBack(); }} aria-label="Voltar"><Icon name="back" /></button>}
        {!onBack && (
          <button className="icon-btn" title={expanded ? 'Mostrar a lista de notas' : 'Expandir o editor (esconder a lista)'} onClick={() => setExpanded(!expanded)}>
            <Icon name={expanded ? 'expandList' : 'collapseList'} size={17} />
          </button>
        )}
        <div className="crumbs">
          {nb?.stack && <><a href={`#/notes?stack=${encodeURIComponent(nb.stack)}`} className="crumb muted">{nb.stack}</a><span className="crumb-sep">›</span></>}
          <button className="nb-btn" disabled={readOnly} title="Mover para outro caderno" onClick={async () => { const id = await pickNotebook('Mover para caderno', note.notebookId); if (id) await patch<Note>('notes', note.id, { notebookId: id }); }}>
            <Icon name="book" size={15} /> <span className="truncate">{nb?.name || 'Caderno'}</span>
          </button>
          <span className="crumb-sep hide-sm">›</span>
          <span className="crumb-title truncate hide-sm">{title || 'Sem título'}</span>
        </div>
        <span className="flex-1" />
        <span className="save-state muted">{readOnly ? 'No lixo' : saved ? 'Guardado' : 'A guardar…'}</span>
        {!readOnly && (
          <button className={'icon-btn' + (note.reminderAt && !note.reminderDone ? ' accent' : '')} title="Lembrete"
            onClick={async () => {
              const v = await pickDateTime('Lembrete', note.reminderAt);
              if (v !== undefined) await patch<Note>('notes', note.id, { reminderAt: v, reminderDone: 0 });
            }}><Icon name="bell" /></button>
        )}
        {!readOnly && <button className={'icon-btn' + (isShortcut ? ' accent' : '')} title="Atalho" onClick={async () => toast((await toggleShortcut('note', note.id)) ? 'Adicionado aos atalhos' : 'Removido dos atalhos')}><Icon name="star" fill={isShortcut} /></button>}
        <Menu trigger={<button className="icon-btn" aria-label="Mais opções"><Icon name="more" /></button>} items={menuItems} />
      </div>
      {readOnly && <div className="banner">Esta nota está no lixo. <button className="link-btn" onClick={() => restoreNote(note.id)}>Restaurar</button></div>}
      {editor && !readOnly && <Toolbar editor={editor} actions={actions} />}
      {dictation && (
        <div className="dictation-bar">
          <span className="rec-pulse" /> <strong>A ouvir</strong>
          <span className="truncate muted">{interim || 'Fale normalmente…'}</span>
          <button className="btn small" onClick={toggleDictation}>Parar</button>
        </div>
      )}
      {find !== null && editor && <FindBar editor={editor} initial={find} onClose={() => setFindOpen(null)} />}
      <div className="editor-scroll" ref={scrollRef}>
        <div className="editor-doc">
          {note.reminderAt && !note.reminderDone && (
            <div className="reminder-chip">
              <Icon name="bell" size={14} /> {dateTimeShort(note.reminderAt)}
              <button className="link-btn" onClick={() => patch<Note>('notes', note.id, { reminderDone: 1 })}>Marcar como feito</button>
            </div>
          )}
          {note.locked && <div className="reminder-chip"><Icon name="lock" size={14} /> Nota encriptada — o conteúdo não aparece na pesquisa</div>}
          <textarea ref={titleRef} className="title-input" rows={1} placeholder="Título" value={title} readOnly={readOnly}
            onChange={(e) => onTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); editor?.commands.focus('start'); } }} />
          {!readOnly && <TagBar note={note} />}
          <NoteTasks note={note} readOnly={readOnly} />
          {editor && <EditorContent editor={editor} />}
          {editor && !readOnly && <BlockHandle editor={editor} />}
          {editor && !readOnly && <SelectionBubble editor={editor} />}
          {editor && <TocButton editor={editor} noteId={note.id} scrollEl={scrollRef.current} />}
          <Backlinks noteId={note.id} />
          <div className="editor-foot muted">
            {wordCount(note.text)} palavras · Criada {relDate(note.createdAt)} · Atualizada {relDate(note.updatedAt)}
            {note.sourceUrl && <> · <a href={note.sourceUrl} target="_blank" rel="noopener noreferrer">Origem</a></>}
          </div>
        </div>
      </div>
      <input ref={fileInput} type="file" multiple hidden onChange={(e) => { insertFiles(Array.from(e.target.files || [])); e.target.value = ''; }} />
      <input ref={imageInput} type="file" accept="image/*" multiple hidden onChange={(e) => { insertFiles(Array.from(e.target.files || [])); e.target.value = ''; }} />
      <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden onChange={async (e) => {
        const files = Array.from(e.target.files || []);
        e.target.value = '';
        if (!files.length) return;
        const mode = await chooseDialog('Fotografia', [
          { value: 'scan', label: 'Documento digitalizado', icon: '📄', hint: 'Melhora o contraste e torna o texto pesquisável' },
          { value: 'photo', label: 'Fotografia normal', icon: '🖼️' },
        ]);
        if (mode) insertFiles(files, mode === 'scan');
      }} />
    </div>
  );
}

function autoGrow(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}

function NoteTasks({ note, readOnly }: { note: Note; readOnly: boolean }) {
  const tasks = useLiveQuery(async () => alive(await db.tasks.where('noteId').equals(note.id).toArray()).sort((a, b) => a.done - b.done || a.createdAt - b.createdAt), [note.id]) || [];
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');
  if (!tasks.length && !adding) {
    return readOnly ? null : <button className="add-task-link" onClick={() => setAdding(true)}><Icon name="checkCircle" size={15} /> Adicionar tarefa</button>;
  }
  return (
    <div className="note-tasks">
      <div className="note-tasks-head"><Icon name="checkCircle" size={15} /> Tarefas <small className="muted">{tasks.filter((t) => t.done).length}/{tasks.length}</small></div>
      {tasks.map((t) => <TaskRow key={t.id} task={t} compact />)}
      {!readOnly && (adding ? (
        <form onSubmit={async (e) => { e.preventDefault(); if (text.trim()) await createTask({ title: text.trim(), noteId: note.id }); setText(''); }}>
          <input className="input small" autoFocus placeholder="Nova tarefa e Enter" value={text} onChange={(e) => setText(e.target.value)} onBlur={() => !text && setAdding(false)} />
        </form>
      ) : <button className="link-btn" onClick={() => setAdding(true)}>+ Adicionar tarefa</button>)}
    </div>
  );
}

export function TaskRow({ task, compact, showNote }: { task: Task; compact?: boolean; showNote?: boolean }) {
  const linkedNote = useLiveQuery(() => (showNote && task.noteId ? db.notes.get(task.noteId) : undefined), [task.noteId, showNote]);
  const overdue = task.due && !task.done && task.due < Date.now();
  return (
    <div className={'task-row' + (task.done ? ' done' : '') + (compact ? ' compact' : '')}>
      <button className={'task-check' + (task.priority === 'high' ? ' high' : task.priority === 'medium' ? ' medium' : '')} onClick={() => toggleTask(task)} aria-label="Concluir">
        {task.done ? <Icon name="check" size={13} /> : null}
      </button>
      <div className="task-main" onClick={() => editTask(task)}>
        <div className="task-title">
          {task.flagged ? '🚩 ' : ''}{task.title || 'Sem título'}
          {task.priority && <span className={'prio-badge ' + task.priority}>{({ high: 'Alta', medium: 'Média', low: 'Baixa' } as any)[task.priority]}</span>}
          {task.description?.trim() && <span className="desc-icon" title={task.description}>📝</span>}
        </div>
        <div className="task-meta">
          {task.due && <span className={overdue ? 'danger-text' : ''}><Icon name="calendar" size={12} /> {dateTimeShort(task.due)}</span>}
          {task.repeat && <span>↻ {({ daily: 'diária', weekly: 'semanal', monthly: 'mensal' } as any)[task.repeat]}</span>}
          {task.reminderAt && <span><Icon name="bell" size={12} /> {dateTimeShort(task.reminderAt)}</span>}
          {showNote && linkedNote && !linkedNote.deleted && (
            <a href={`#/note/${linkedNote.id}`} onClick={(e) => e.stopPropagation()}><Icon name="note" size={12} /> {linkedNote.title || 'Sem título'}</a>
          )}
        </div>
      </div>
    </div>
  );
}

export async function editTask(task: Task) {
  const { TaskDialog } = await import('./TaskDialog');
  return showModal<void>((done) => <TaskDialog task={task} done={done} />);
}

function Backlinks({ noteId }: { noteId: string }) {
  const all = useActiveNotes();
  const links = useMemo(() => {
    const needle = `#/note/${noteId}`;
    return all.filter((n) => n.id !== noteId && n.content.includes(needle));
  }, [all, noteId]);
  if (!links.length) return null;
  return (
    <div className="backlinks">
      <div className="muted small-caps">Notas que ligam para esta</div>
      {links.map((n) => <a key={n.id} href={`#/note/${n.id}`} className="chip">{n.title || 'Sem título'}</a>)}
    </div>
  );
}

export function printNote(n: Note) {
  const w = window.open('', '_blank');
  if (!w) return toast('Permita janelas pop-up para imprimir');
  w.document.write(noteToHtmlDocument({ ...n, content: sanitizePreview(n.content) }).replace('</body>', '<script>window.onload=()=>{setTimeout(()=>window.print(),300)}<\/script></body>'));
  w.document.close();
}

export { navigate };
