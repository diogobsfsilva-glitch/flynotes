import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Note, type Notebook, type Version } from '../lib/db';
import { alive, createNotebook, getOrCreateTag, put, saveNoteContent } from '../lib/store';
import { norm, relDate, dateTimeShort, toLocalInput, fromLocalInput } from '../lib/util';
import { Modal, Icon, showModal, askText, toast } from '../ui';
import { useNotebooks, useTags, useActiveNotes } from '../hooks';
import { TemplateGallery, type TemplateChoice } from './TemplateGallery';
import { dictationSupported, startDictation, type Dictation } from '../lib/dictation';

// ---------- Escolher caderno ----------
export function pickNotebook(title = 'Mover para caderno', currentId?: string): Promise<string | null> {
  return showModal<string | null>((done) => <NotebookPicker title={title} currentId={currentId} done={done} />);
}

function NotebookPicker({ title, currentId, done }: { title: string; currentId?: string; done: (v: string | null) => void }) {
  const notebooks = useNotebooks();
  const [q, setQ] = useState('');
  const groups = useMemo(() => groupByStack(notebooks.filter((n) => norm(n.name).includes(norm(q)))), [notebooks, q]);
  return (
    <Modal title={title} onClose={() => done(null)}>
      <input className="input" autoFocus placeholder="Procurar caderno…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="pick-list">
        {groups.map(([stack, list]) => (
          <div key={stack || '_'}>
            {stack && <div className="pick-group"><Icon name="stack" size={14} /> {stack}</div>}
            {list.map((nb) => (
              <button key={nb.id} className={'pick-item' + (nb.id === currentId ? ' current' : '')} onClick={() => done(nb.id)}>
                <Icon name="book" size={16} /> {nb.name}
                {nb.id === currentId && <Icon name="check" size={14} className="ml-auto" />}
              </button>
            ))}
          </div>
        ))}
        <button className="pick-item add" onClick={async () => {
          const name = await askText('Novo caderno', { initial: q, placeholder: 'Nome do caderno', ok: 'Criar' });
          if (name?.trim()) done((await createNotebook(name.trim())).id);
        }}><Icon name="plus" size={16} /> Novo caderno{q ? ` “${q}”` : ''}</button>
      </div>
    </Modal>
  );
}

export function groupByStack(notebooks: Notebook[]): [string, Notebook[]][] {
  const m = new Map<string, Notebook[]>();
  for (const nb of notebooks) {
    const k = nb.stack || '';
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(nb);
  }
  return [...m.entries()].sort((a, b) => (a[0] === '' ? 1 : b[0] === '' ? -1 : a[0].localeCompare(b[0], 'pt')));
}

// ---------- Barra de etiquetas ----------
export function TagBar({ note }: { note: Note }) {
  const tags = useTags();
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  const byId = new Map(tags.map((t) => [t.id, t]));
  const suggestions = tags.filter((t) => !note.tagIds.includes(t.id) && norm(t.name).includes(norm(q))).slice(0, 6);

  useEffect(() => { if (adding) ref.current?.focus(); }, [adding]);

  const addTag = async (name: string) => {
    if (!name.trim()) return;
    const t = await getOrCreateTag(name);
    const cur = await db.notes.get(note.id);
    if (cur && !cur.tagIds.includes(t.id)) await put('notes', { ...cur, tagIds: [...cur.tagIds, t.id] });
    setQ('');
  };
  const removeTag = async (id: string) => {
    const cur = await db.notes.get(note.id);
    if (cur) await put('notes', { ...cur, tagIds: cur.tagIds.filter((x) => x !== id) });
  };

  return (
    <div className="tagbar">
      <Icon name="tag" size={15} className="muted" />
      {note.tagIds.map((id) => byId.get(id) && (
        <span key={id} className="chip">{byId.get(id)!.name}<button onClick={() => removeTag(id)} aria-label="Remover etiqueta">×</button></span>
      ))}
      {adding ? (
        <span className="tag-input-wrap">
          <input ref={ref} className="tag-input" value={q} placeholder="Etiqueta…" onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(q); }
              if (e.key === 'Escape') { setAdding(false); setQ(''); }
              if (e.key === 'Backspace' && !q && note.tagIds.length) removeTag(note.tagIds[note.tagIds.length - 1]);
            }}
            onBlur={() => setTimeout(() => { if (q) addTag(q); setAdding(false); }, 150)} />
          {q && suggestions.length > 0 && (
            <div className="tag-suggest">
              {suggestions.map((t) => <button key={t.id} onMouseDown={(e) => { e.preventDefault(); addTag(t.name); }}>{t.name}</button>)}
            </div>
          )}
        </span>
      ) : (
        <button className="chip add" onClick={() => setAdding(true)}>+ Etiqueta</button>
      )}
    </div>
  );
}

// ---------- Data / lembrete ----------
export function pickDateTime(title: string, initial?: number | null, allowClear = true): Promise<number | null | undefined> {
  return showModal<number | null | undefined>((done) => <DateTimeDialog title={title} initial={initial} allowClear={allowClear} done={done} />);
}

function DateTimeDialog({ title, initial, allowClear, done }: { title: string; initial?: number | null; allowClear: boolean; done: (v: number | null | undefined) => void }) {
  const [v, setV] = useState(toLocalInput(initial || defaultReminder()));
  const quick = (days: number, hour = 9) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setHours(hour, 0, 0, 0);
    done(d.getTime());
  };
  return (
    <Modal title={title} onClose={() => done(undefined)}
      footer={<>
        {allowClear && initial ? <button className="btn danger-text" onClick={() => done(null)}>Remover</button> : null}
        <span className="flex-1" />
        <button className="btn" onClick={() => done(undefined)}>Cancelar</button>
        <button className="btn primary" onClick={() => done(fromLocalInput(v))}>Guardar</button>
      </>}>
      <div className="quick-dates">
        <button className="btn" onClick={() => { const d = new Date(); d.setHours(d.getHours() + 1, 0, 0, 0); done(d.getTime()); }}>Daqui a 1 hora</button>
        <button className="btn" onClick={() => quick(0, 18)}>Hoje às 18:00</button>
        <button className="btn" onClick={() => quick(1)}>Amanhã às 9:00</button>
        <button className="btn" onClick={() => quick(7)}>Próxima semana</button>
      </div>
      <label className="field-label">Data e hora</label>
      <input className="input" type="datetime-local" value={v} onChange={(e) => setV(e.target.value)} />
    </Modal>
  );
}
function defaultReminder() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d.getTime();
}

// ---------- Ligação para outra nota ----------
export function pickNote(title = 'Ligar a uma nota', excludeId?: string): Promise<Note | null> {
  return showModal<Note | null>((done) => <NotePicker title={title} excludeId={excludeId} done={done} />);
}

function NotePicker({ title, excludeId, done }: { title: string; excludeId?: string; done: (v: Note | null) => void }) {
  const notes = useActiveNotes();
  const [q, setQ] = useState('');
  const list = notes.filter((n) => n.id !== excludeId && norm(n.title || 'sem título').includes(norm(q)))
    .sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 50);
  return (
    <Modal title={title} onClose={() => done(null)}>
      <input className="input" autoFocus placeholder="Procurar nota pelo título…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="pick-list">
        {list.map((n) => (
          <button key={n.id} className="pick-item" onClick={() => done(n)}>
            <Icon name="note" size={16} /> <span className="truncate">{n.title || 'Sem título'}</span>
            <small className="ml-auto muted">{relDate(n.updatedAt)}</small>
          </button>
        ))}
        {!list.length && <p className="muted pad">Nenhuma nota encontrada.</p>}
      </div>
    </Modal>
  );
}

// ---------- Histórico de versões ----------
export function openHistory(note: Note) {
  return showModal<void>((done) => <HistoryDialog note={note} done={done} />);
}

function HistoryDialog({ note, done }: { note: Note; done: () => void }) {
  const versions = useLiveQuery(async () => alive(await db.versions.where('noteId').equals(note.id).toArray()).sort((a, b) => b.savedAt - a.savedAt), [note.id]) || [];
  const [sel, setSel] = useState<Version | null>(null);
  useEffect(() => { if (!sel && versions[0]) setSel(versions[0]); }, [versions, sel]);
  return (
    <Modal wide title="Histórico da nota" onClose={done}
      footer={sel && <>
        <span className="muted">Versão de {dateTimeShort(sel.savedAt)}</span>
        <span className="flex-1" />
        <button className="btn primary" onClick={async () => {
          await saveNoteContent(note.id, sel.title, sel.content);
          toast('Versão restaurada');
          done();
        }}>Restaurar esta versão</button>
      </>}>
      {!versions.length ? <p className="muted">Ainda não há versões anteriores. O FlyNotes guarda uma versão automaticamente enquanto edita (no máximo uma a cada 10 minutos, até 30 versões).</p> : (
        <div className="history">
          <div className="history-list">
            {versions.map((v) => (
              <button key={v.id} className={'pick-item' + (sel?.id === v.id ? ' current' : '')} onClick={() => setSel(v)}>
                <Icon name="history" size={15} /> {dateTimeShort(v.savedAt)}
              </button>
            ))}
          </div>
          <div className="history-preview prose">
            {sel && <><h2>{sel.title || 'Sem título'}</h2><div dangerouslySetInnerHTML={{ __html: sanitizePreview(sel.content) }} /></>}
          </div>
        </div>
      )}
    </Modal>
  );
}

/** Pré-visualização segura de HTML guardado (remove scripts, handlers e iframes). */
export function sanitizePreview(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script,style,iframe,object,embed,link,meta,form').forEach((el) => el.remove());
  doc.querySelectorAll('*').forEach((el) => {
    for (const a of Array.from(el.attributes)) {
      if (a.name.startsWith('on') || (['href', 'src'].includes(a.name) && /^\s*javascript:/i.test(a.value))) el.removeAttribute(a.name);
    }
  });
  return doc.body.innerHTML;
}

// ---------- Escolher modelo ----------
export type { TemplateChoice } from './TemplateGallery';
export function pickTemplate(): Promise<TemplateChoice | null> {
  return showModal<TemplateChoice | null>((done) => (
    <Modal wide title="Escolher modelo" onClose={() => done(null)}>
      <TemplateGallery showBlank onUse={done} />
    </Modal>
  ));
}

// ---------- Gravador de áudio ----------
export interface Recording { blob: Blob; transcript: string }
export function recordAudio(): Promise<Recording | null> {
  return showModal<Recording | null>((done) => <AudioRecorder done={done} />);
}

function AudioRecorder({ done }: { done: (v: Recording | null) => void }) {
  const [state, setState] = useState<'idle' | 'rec' | 'paused' | 'error'>('idle');
  const [secs, setSecs] = useState(0);
  const [level, setLevel] = useState(0);
  const [transcribe, setTranscribe] = useState(() => dictationSupported());
  const [transcript, setTranscript] = useState('');
  const [interim, setInterim] = useState('');
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const stream = useRef<MediaStream | null>(null);
  const dict = useRef<Dictation | null>(null);
  const textRef = useRef('');
  const raf = useRef(0);

  useEffect(() => {
    if (state !== 'rec') return;
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [state]);
  useEffect(() => () => {
    cancelAnimationFrame(raf.current);
    dict.current?.stop();
    stream.current?.getTracks().forEach((t) => t.stop());
  }, []);

  const start = async () => {
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Medidor de nível
      const ctx = new AudioContext();
      const an = ctx.createAnalyser();
      an.fftSize = 256;
      ctx.createMediaStreamSource(stream.current).connect(an);
      const data = new Uint8Array(an.frequencyBinCount);
      const tick = () => {
        an.getByteTimeDomainData(data);
        let peak = 0;
        for (const v of data) peak = Math.max(peak, Math.abs(v - 128));
        setLevel(Math.min(1, peak / 64));
        raf.current = requestAnimationFrame(tick);
      };
      tick();
      const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : '';
      const r = new MediaRecorder(stream.current, mime ? { mimeType: mime } : undefined);
      chunks.current = [];
      r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      r.onstop = () => {
        cancelAnimationFrame(raf.current);
        dict.current?.stop();
        stream.current?.getTracks().forEach((t) => t.stop());
        ctx.close().catch(() => {});
        done({ blob: new Blob(chunks.current, { type: r.mimeType || 'audio/webm' }), transcript: textRef.current.trim() });
      };
      r.start(1000);
      rec.current = r;
      if (transcribe) startTranscription();
      setState('rec');
    } catch {
      setState('error');
    }
  };
  const startTranscription = () => {
    dict.current = startDictation({
      onFinal: (t) => { textRef.current += (textRef.current ? ' ' : '') + t; setTranscript(textRef.current); },
      onInterim: setInterim,
    });
  };
  const pause = () => {
    if (!rec.current) return;
    if (state === 'rec') { rec.current.pause(); dict.current?.stop(); dict.current = null; setState('paused'); }
    else { rec.current.resume(); if (transcribe) startTranscription(); setState('rec'); }
  };
  const mm = String(Math.floor(secs / 60)).padStart(2, '0') + ':' + String(secs % 60).padStart(2, '0');
  const bars = Array.from({ length: 24 }, (_, i) => Math.max(0.08, level * (0.55 + 0.45 * Math.sin(i * 1.7 + secs))));
  return (
    <Modal title="Gravação de áudio" onClose={() => { if (rec.current && rec.current.state !== 'inactive') { rec.current.onstop = null; rec.current.stop(); } dict.current?.stop(); stream.current?.getTracks().forEach((t) => t.stop()); done(null); }}>
      <div className="recorder">
        <div className={'rec-dot' + (state === 'rec' ? ' live' : '')}><Icon name="mic" size={32} /></div>
        <div className="rec-time">{mm}{state === 'paused' && <small className="muted"> em pausa</small>}</div>
        {state !== 'idle' && state !== 'error' && (
          <div className="rec-bars" aria-hidden="true">{bars.map((h, i) => <i key={i} style={{ height: `${Math.round(h * 100)}%`, opacity: state === 'paused' ? 0.3 : 1 }} />)}</div>
        )}
        {state === 'error' && <p className="danger-text">Não foi possível aceder ao microfone. Verifique as permissões do browser.</p>}
        {state === 'idle' && dictationSupported() && (
          <label className="check"><input type="checkbox" checked={transcribe} onChange={(e) => setTranscribe(e.target.checked)} /> Transcrever também para texto na nota</label>
        )}
        {(transcript || interim) && <div className="rec-transcript">{transcript} <span className="muted">{interim}</span></div>}
        {state === 'idle' || state === 'error' ? <button className="btn primary" onClick={start}><Icon name="mic" size={16} /> Começar a gravar</button> : (
          <div className="row gap">
            <button className="btn" onClick={pause}><Icon name={state === 'paused' ? 'play' : 'pause'} size={15} /> {state === 'paused' ? 'Retomar' : 'Pausa'}</button>
            <button className="btn danger" onClick={() => rec.current?.stop()}>Parar e anexar</button>
          </div>
        )}
      </div>
    </Modal>
  );
}

// ---------- Informação da nota ----------
export function NoteInfoDialog({ note, done }: { note: Note; done: () => void }) {
  const files = useLiveQuery(async () => alive(await db.files.where('noteId').equals(note.id).toArray()), [note.id]) || [];
  const words = (note.text.match(/\S+/g) || []).length;
  return (
    <Modal title="Informação da nota" onClose={done}>
      <dl className="info-list">
        <dt>Criada</dt><dd>{new Date(note.createdAt).toLocaleString('pt-PT')}</dd>
        <dt>Atualizada</dt><dd>{new Date(note.updatedAt).toLocaleString('pt-PT')}</dd>
        <dt>Palavras</dt><dd>{words}</dd>
        <dt>Caracteres</dt><dd>{note.text.length}</dd>
        <dt>Anexos</dt><dd>{files.length}</dd>
        {note.sourceUrl && <><dt>Origem</dt><dd><a href={note.sourceUrl} target="_blank" rel="noopener noreferrer">{note.sourceUrl}</a></dd></>}
        {note.author && <><dt>Autor</dt><dd>{note.author}</dd></>}
        {note.location && <><dt>Localização</dt><dd><a target="_blank" rel="noopener noreferrer" href={`https://www.openstreetmap.org/?mlat=${note.location.lat}&mlon=${note.location.lng}#map=16/${note.location.lat}/${note.location.lng}`}>{note.location.lat.toFixed(5)}, {note.location.lng.toFixed(5)}</a></dd></>}
      </dl>
      <div className="row gap">
        <button className="btn" onClick={async () => {
          const url = await askText('Endereço de origem', { initial: note.sourceUrl || '', placeholder: 'https://…' });
          if (url !== null) await put('notes', { ...(await db.notes.get(note.id))!, sourceUrl: url });
        }}>Editar origem</button>
        <button className="btn" onClick={() => {
          if (!navigator.geolocation) return toast('Localização indisponível');
          navigator.geolocation.getCurrentPosition(async (p) => {
            await put('notes', { ...(await db.notes.get(note.id))!, location: { lat: p.coords.latitude, lng: p.coords.longitude } });
            toast('Localização adicionada');
          }, () => toast('Não foi possível obter a localização'));
        }}><Icon name="location" size={15} /> Adicionar localização</button>
      </div>
    </Modal>
  );
}
