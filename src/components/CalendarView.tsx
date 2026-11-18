// Calendário: vistas Mês / Semana / Dia / Agenda, eventos FlyNotes, tarefas, lembretes e calendários Google/Outlook (iCal).
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type CalEvent, type Task, type Note } from '../lib/db';
import { alive, createNote, createTask, put, removeDoc, setSetting, type CalendarSub } from '../lib/store';
import { useActiveNotes, useSettings, useLocalPref } from '../hooks';
import { fetchCalendar, testCalendar, CAL_COLORS, type ExtEvent } from '../lib/calendars';
import { navigate, openNote, useRoute } from '../lib/router';
import { uid, escapeHtml, toLocalInput, fromLocalInput } from '../lib/util';
import { Icon, Menu, Modal, showModal, toast, confirmDialog, askText, useMedia } from '../ui';
import { editTask } from './NoteEditor';

type View = 'month' | 'week' | 'day' | 'agenda';
type Item = {
  key: string; kind: 'event' | 'ext' | 'task' | 'reminder' | 'note';
  title: string; start: number; end: number; allDay: boolean; color: string; done?: boolean;
  ref?: CalEvent | ExtEvent | Task | Note;
};

const WD = ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'];
const WD_SHORT = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];
const LOCAL_COLOR = '#22c55e';
const TASK_COLOR = '#a855f7';
const REM_COLOR = '#f59e0b';

const sod = (d: Date | number) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const dayKey = (d: Date | number) => { const x = new Date(d); return `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`; };
const mondayOf = (d: Date) => addDays(sod(d), -((d.getDay() + 6) % 7));
const hm = (t: number) => new Date(t).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
function isoWeek(d: Date) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - y0.getTime()) / 86400000 + 1) / 7);
}

export function CalendarView() {
  const route = useRoute();
  const isMobile = useMedia('(max-width: 820px)');
  const [view, setView] = useLocalPref<View>('calView', 'month');
  const [cursor, setCursor] = useState(() => { const d = route.params.get('d'); return d ? sod(new Date(d + 'T00:00:00')) : sod(new Date()); });
  const settings = useSettings();
  const subs = settings.calendars || [];
  const layers = { events: true, tasks: true, reminders: true, notes: false, ...(settings.calendarLayers || {}) };
  const notes = useActiveNotes();
  const tasks = useLiveQuery(async () => alive(await db.tasks.toArray()), []) || [];
  const events = useLiveQuery(async () => alive(await db.events.toArray()), []) || [];
  const [ext, setExt] = useState<ExtEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => { const d = route.params.get('d'); if (d) setCursor(sod(new Date(d + 'T00:00:00'))); }, [route.params.get('d')]); // eslint-disable-line

  // Intervalo visível
  const range = useMemo(() => {
    if (view === 'month') { const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1); const s = mondayOf(first); return { from: s, to: addDays(s, 42) }; }
    if (view === 'week') { const s = mondayOf(cursor); return { from: s, to: addDays(s, 7) }; }
    if (view === 'day') return { from: sod(cursor), to: addDays(sod(cursor), 1) };
    return { from: sod(cursor), to: addDays(sod(cursor), 60) };
  }, [view, cursor]);

  // Calendários externos
  useEffect(() => {
    const active = subs.filter((s) => s.enabled);
    if (!active.length) { setExt([]); return; }
    let cancel = false;
    setLoading(true);
    Promise.allSettled(active.map((s) => fetchCalendar(s, range.from.getTime() - 86400000, range.to.getTime() + 86400000, refresh > 0)))
      .then((res) => {
        if (cancel) return;
        setExt(res.flatMap((r) => (r.status === 'fulfilled' ? r.value : [])));
        const failed = res.filter((r) => r.status === 'rejected').length;
        if (failed) toast(`${failed} calendário(s) não puderam ser atualizados`);
      })
      .finally(() => !cancel && setLoading(false));
    return () => { cancel = true; };
  }, [JSON.stringify(subs), range.from.getTime(), range.to.getTime(), refresh]); // eslint-disable-line

  const items: Item[] = useMemo(() => {
    const out: Item[] = [];
    if (layers.events) for (const e of events) out.push({ key: 'e' + e.id, kind: 'event', title: e.title || '(sem título)', start: e.start, end: e.end, allDay: !!e.allDay, color: e.color || LOCAL_COLOR, ref: e });
    for (const e of ext) out.push({ key: 'x' + e.calId + e.uid, kind: 'ext', title: e.title, start: e.allDay ? sod(new Date(new Date(e.start).toISOString().slice(0, 10) + 'T00:00:00')).getTime() : e.start, end: e.allDay ? sod(new Date(new Date(e.end - 1).toISOString().slice(0, 10) + 'T00:00:00')).getTime() + 86399999 : e.end, allDay: e.allDay, color: e.color, ref: e });
    if (layers.tasks) for (const t of tasks) if (t.due) out.push({ key: 't' + t.id, kind: 'task', title: t.title || 'Tarefa', start: t.due, end: t.due + 1800000, allDay: false, color: TASK_COLOR, done: !!t.done, ref: t });
    if (layers.reminders) for (const n of notes) if (n.reminderAt) out.push({ key: 'r' + n.id, kind: 'reminder', title: n.title || 'Sem título', start: n.reminderAt, end: n.reminderAt + 1800000, allDay: false, color: REM_COLOR, done: !!n.reminderDone, ref: n });
    if (layers.notes) for (const n of notes) out.push({ key: 'n' + n.id, kind: 'note', title: n.title || 'Sem título', start: n.createdAt, end: n.createdAt, allDay: true, color: '#64748b', ref: n });
    return out.sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start - b.start);
  }, [events, ext, tasks, notes, layers.events, layers.tasks, layers.reminders, layers.notes]);

  const byDay = useMemo(() => {
    const m = new Map<string, Item[]>();
    for (const it of items) {
      let d = sod(it.start);
      const last = sod(Math.max(it.start, it.end - 1));
      for (let i = 0; i < 60 && d <= last; i++, d = addDays(d, 1)) {
        const k = dayKey(d);
        if (!m.has(k)) m.set(k, []);
        m.get(k)!.push(it);
      }
    }
    return m;
  }, [items]);

  const shift = (n: number) => {
    const d = new Date(cursor);
    if (view === 'month') d.setMonth(d.getMonth() + n);
    else if (view === 'week') d.setDate(d.getDate() + 7 * n);
    else if (view === 'day') d.setDate(d.getDate() + n);
    else d.setDate(d.getDate() + 30 * n);
    setCursor(d);
  };
  const title = view === 'month' ? cursor.toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' })
    : view === 'week' ? `Semana ${isoWeek(cursor)} · ${mondayOf(cursor).toLocaleDateString('pt-PT', { day: 'numeric', month: 'short' })} – ${addDays(mondayOf(cursor), 6).toLocaleDateString('pt-PT', { day: 'numeric', month: 'short', year: 'numeric' })}`
      : view === 'day' ? cursor.toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
        : 'Próximos 60 dias';

  const openItem = (it: Item) => {
    if (it.kind === 'event') editEvent(it.ref as CalEvent);
    else if (it.kind === 'ext') showExt(it.ref as ExtEvent, subs);
    else if (it.kind === 'task') editTask(it.ref as Task);
    else openNote((it.ref as Note).id);
  };
  const newEvent = (start?: Date, allDay = false) => {
    const s = start ? new Date(start) : (() => { const d = new Date(cursor); const now = new Date(); d.setHours(now.getHours() + 1, 0, 0, 0); return d; })();
    editEvent({ id: uid(), title: '', start: s.getTime(), end: s.getTime() + 3600000, allDay: allDay ? 1 : 0, createdAt: Date.now(), updatedAt: 0 } as CalEvent, true);
  };
  const newRecording = async () => {
    const n = await createNote({ title: 'Gravação ' + new Date().toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' }) });
    navigate('notes', n.id);
    setTimeout(() => window.dispatchEvent(new CustomEvent('fn:insert', { detail: 'audio' })), 400);
  };
  const setLayer = (k: keyof typeof layers) => setSetting('calendarLayers', { ...layers, [k]: !layers[k] });

  return (
    <div className="cal-page">
      {!isMobile && (
        <aside className="cal-side">
          <MiniMonth cursor={cursor} onPick={(d) => setCursor(d)} marked={byDay} />
          <div className="cal-side-sec">
            <div className="cal-side-head">Calendário FlyNotes</div>
            <Layer color={LOCAL_COLOR} label="Eventos" on={layers.events} toggle={() => setLayer('events')} />
            <Layer color={TASK_COLOR} label="Tarefas" on={layers.tasks} toggle={() => setLayer('tasks')} />
            <Layer color={REM_COLOR} label="Lembretes de notas" on={layers.reminders} toggle={() => setLayer('reminders')} />
            <Layer color="#64748b" label="Notas criadas" on={layers.notes} toggle={() => setLayer('notes')} />
          </div>
          {subs.length > 0 && (
            <div className="cal-side-sec">
              <div className="cal-side-head">Calendários ligados {loading && <Icon name="sync" size={12} className="spin" />}</div>
              {subs.map((s) => <SubRow key={s.id} sub={s} subs={subs} onRefresh={() => setRefresh((x) => x + 1)} />)}
            </div>
          )}
          <div className="cal-side-sec">
            <div className="cal-side-head">Ligar calendário</div>
            <button className="cal-connect" onClick={() => connectCalendar('google', subs)}><GoogleLogo /> Google <Icon name="plus" size={14} className="ml-auto" /></button>
            <button className="cal-connect" onClick={() => connectCalendar('outlook', subs)}><OutlookLogo /> Outlook <Icon name="plus" size={14} className="ml-auto" /></button>
            <button className="cal-connect" onClick={() => connectCalendar('ics', subs)}><Icon name="calendar" size={16} /> Outro (iCal / iCloud) <Icon name="plus" size={14} className="ml-auto" /></button>
          </div>
        </aside>
      )}
      <section className="cal-main">
        <header className="cal-head">
          <h1>Calendário</h1>
          <span className="flex-1" />
          {!isMobile && <button className="btn" onClick={newRecording}><Icon name="mic" size={15} /> Nova gravação</button>}
          <button className="btn primary" onClick={() => newEvent()}><Icon name="plus" size={15} /> Novo evento</button>
          <button className="btn" title="Nova tarefa" onClick={async () => { const d = new Date(cursor); d.setHours(18, 0, 0, 0); editTask(await createTask({ title: '', due: d.getTime() })); }}><Icon name="checkCircle" size={15} /></button>
          <select className="input inline cal-view-sel" value={view} onChange={(e) => setView(e.target.value as View)}>
            <option value="month">Mês</option><option value="week">Semana</option><option value="day">Dia</option><option value="agenda">Agenda</option>
          </select>
        </header>
        <div className="cal-nav">
          <span className="cal-title cap">{title}</span>
          <span className="flex-1" />
          <button className="btn small" onClick={() => setCursor(sod(new Date()))}>Hoje</button>
          <button className="icon-btn" onClick={() => shift(-1)} aria-label="Anterior"><Icon name="chevronLeft" /></button>
          <button className="icon-btn" onClick={() => shift(1)} aria-label="Seguinte"><Icon name="chevronRight" /></button>
        </div>
        {view === 'month' && <MonthGrid cursor={cursor} byDay={byDay} onItem={openItem} onDay={(d) => { setCursor(d); setView('day'); }} onNew={(d) => newEvent(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 9), false)} compact={isMobile} />}
        {(view === 'week' || view === 'day') && <TimeGrid days={view === 'week' ? Array.from({ length: 7 }, (_, i) => addDays(mondayOf(cursor), i)) : [sod(cursor)]} byDay={byDay} onItem={openItem} onNew={newEvent} onDay={(d) => { setCursor(d); setView('day'); }} />}
        {view === 'agenda' && <Agenda from={range.from} byDay={byDay} onItem={openItem} />}
        {isMobile && subs.length === 0 && (
          <div className="cal-mobile-connect">
            <button className="btn" onClick={() => connectCalendar('google', subs)}><GoogleLogo /> Ligar Google</button>
            <button className="btn" onClick={() => connectCalendar('outlook', subs)}><OutlookLogo /> Ligar Outlook</button>
          </div>
        )}
      </section>
    </div>
  );
}

function Layer({ color, label, on, toggle }: { color: string; label: string; on: boolean; toggle: () => void }) {
  return (
    <label className="cal-layer">
      <input type="checkbox" checked={on} onChange={toggle} style={{ accentColor: color }} />
      <span className="cal-dot" style={{ background: color, opacity: on ? 1 : 0.3 }} /> {label}
    </label>
  );
}

function SubRow({ sub, subs, onRefresh }: { sub: CalendarSub; subs: CalendarSub[]; onRefresh: () => void }) {
  const update = (patch: Partial<CalendarSub>) => setSetting('calendars', subs.map((s) => (s.id === sub.id ? { ...s, ...patch } : s)));
  return (
    <div className="cal-layer sub">
      <input type="checkbox" checked={sub.enabled} onChange={() => update({ enabled: !sub.enabled })} style={{ accentColor: sub.color }} />
      <span className="cal-dot" style={{ background: sub.color, opacity: sub.enabled ? 1 : 0.3 }} />
      <span className="truncate flex-1" title={sub.url}>{sub.name}</span>
      {sub.provider === 'google' ? <GoogleLogo size={12} /> : sub.provider === 'outlook' ? <OutlookLogo size={12} /> : null}
      <Menu className="sub-menu" trigger={<button className="icon-btn small"><Icon name="more" size={14} /></button>} items={[
        { label: 'Atualizar agora', icon: 'sync', onClick: onRefresh },
        { label: 'Mudar o nome', icon: 'edit', onClick: async () => { const n = await askText('Nome do calendário', { initial: sub.name }); if (n?.trim()) update({ name: n.trim() }); } },
        ...CAL_COLORS.map((c) => ({ label: 'Cor', swatch: c, checked: sub.color === c, onClick: () => update({ color: c }) })),
        { divider: true },
        { label: 'Remover calendário', icon: 'trash', danger: true, onClick: async () => { if (await confirmDialog(`Deixar de mostrar “${sub.name}”?`, { danger: true, ok: 'Remover' })) setSetting('calendars', subs.filter((s) => s.id !== sub.id)); } },
      ]} />
    </div>
  );
}

// ---------- Mini calendário ----------
function MiniMonth({ cursor, onPick, marked }: { cursor: Date; onPick: (d: Date) => void; marked: Map<string, Item[]> }) {
  const [month, setMonth] = useState(() => new Date(cursor.getFullYear(), cursor.getMonth(), 1));
  useEffect(() => setMonth(new Date(cursor.getFullYear(), cursor.getMonth(), 1)), [cursor.getFullYear(), cursor.getMonth()]); // eslint-disable-line
  const start = mondayOf(month);
  const today = dayKey(new Date());
  return (
    <div className="mini-month">
      <div className="row">
        <strong className="cap flex-1">{month.toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' })}</strong>
        <button className="icon-btn small" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><Icon name="chevronLeft" size={14} /></button>
        <button className="icon-btn small" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><Icon name="chevronRight" size={14} /></button>
      </div>
      <div className="mm-grid">
        {WD_SHORT.map((w) => <span key={w} className="mm-wd">{w[0].toUpperCase()}</span>)}
        {Array.from({ length: 42 }, (_, i) => addDays(start, i)).map((d) => (
          <button key={d.getTime()} onClick={() => onPick(d)}
            className={'mm-day' + (d.getMonth() !== month.getMonth() ? ' other' : '') + (dayKey(d) === today ? ' today' : '') + (dayKey(d) === dayKey(cursor) ? ' sel' : '') + (marked.get(dayKey(d))?.length ? ' has' : '')}>
            {d.getDate()}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------- Vista Mês ----------
function Chip({ it, onClick, showTime = true }: { it: Item; onClick: () => void; showTime?: boolean }) {
  return (
    <button className={'cal-chip' + (it.allDay ? ' allday' : '') + (it.done ? ' done' : '') + (it.end < Date.now() ? ' past' : '')}
      style={{ ['--c' as any]: it.color }} onClick={(e) => { e.stopPropagation(); onClick(); }} title={`${it.allDay ? '' : hm(it.start) + ' '}${it.title}`}>
      {!it.allDay && <i className="cal-sq" />}
      {it.kind === 'task' && (it.done ? '☑ ' : '☐ ')}
      {!it.allDay && showTime && <span className="cal-time">{hm(it.start)}</span>} <span className="truncate">{it.title}</span>
    </button>
  );
}

function MonthGrid({ cursor, byDay, onItem, onDay, onNew, compact }: { cursor: Date; byDay: Map<string, Item[]>; onItem: (i: Item) => void; onDay: (d: Date) => void; onNew: (d: Date) => void; compact: boolean }) {
  const start = mondayOf(new Date(cursor.getFullYear(), cursor.getMonth(), 1));
  const weeks = Array.from({ length: 6 }, (_, w) => Array.from({ length: 7 }, (_, i) => addDays(start, w * 7 + i)));
  const today = dayKey(new Date());
  const max = compact ? 2 : 3;
  return (
    <div className="month">
      <div className="month-head"><span className="wk-col" />{WD.map((w) => <span key={w}>{compact ? w.slice(0, 3) : w}</span>)}</div>
      {weeks.map((week) => (
        <div key={week[0].getTime()} className="month-row">
          <span className="wk-col">Semana<br />{isoWeek(week[0])}</span>
          {week.map((d) => {
            const list = byDay.get(dayKey(d)) || [];
            return (
              <div key={d.getTime()} className={'month-cell' + (d.getMonth() !== cursor.getMonth() ? ' other' : '') + (d.getDay() === 0 || d.getDay() === 6 ? ' weekend' : '')} onDoubleClick={() => onNew(d)} onClick={() => compact && onDay(d)}>
                <button className={'month-num' + (dayKey(d) === today ? ' today' : '')} onClick={(e) => { e.stopPropagation(); onDay(d); }}>{d.getDate()}</button>
                {compact ? (
                  <div className="month-dots">{list.slice(0, 4).map((it) => <i key={it.key} style={{ background: it.color }} />)}</div>
                ) : (
                  <>
                    {list.slice(0, max).map((it) => <Chip key={it.key} it={it} onClick={() => onItem(it)} />)}
                    {list.length > max && <button className="cal-more" onClick={(e) => { e.stopPropagation(); onDay(d); }}>+ {list.length - max} mais</button>}
                  </>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ---------- Vistas Semana / Dia ----------
const HOUR_H = 48;
function TimeGrid({ days, byDay, onItem, onNew, onDay }: { days: Date[]; byDay: Map<string, Item[]>; onItem: (i: Item) => void; onNew: (d: Date, allDay?: boolean) => void; onDay: (d: Date) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.scrollTo({ top: HOUR_H * 7.5 }); }, []);
  const today = dayKey(new Date());
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(t); }, []);
  return (
    <div className="tg">
      <div className="tg-head">
        <span className="tg-gutter" />
        {days.map((d) => (
          <button key={d.getTime()} className={'tg-day' + (dayKey(d) === today ? ' today' : '')} onClick={() => onDay(d)}>
            <small>{WD_SHORT[(d.getDay() + 6) % 7]}</small> <strong>{d.getDate()}</strong>
          </button>
        ))}
      </div>
      <div className="tg-allday">
        <span className="tg-gutter small muted">dia todo</span>
        {days.map((d) => (
          <div key={d.getTime()} className="tg-allday-cell" onDoubleClick={() => onNew(d, true)}>
            {(byDay.get(dayKey(d)) || []).filter((i) => i.allDay).map((it) => <Chip key={it.key} it={it} onClick={() => onItem(it)} />)}
          </div>
        ))}
      </div>
      <div className="tg-body" ref={ref}>
        <div className="tg-hours">{Array.from({ length: 24 }, (_, h) => <span key={h} style={{ height: HOUR_H }}>{h > 0 ? String(h).padStart(2, '0') + ':00' : ''}</span>)}</div>
        {days.map((d) => {
          const list = (byDay.get(dayKey(d)) || []).filter((i) => !i.allDay);
          const placed = layout(list, d);
          return (
            <div key={d.getTime()} className="tg-col" style={{ height: HOUR_H * 24 }}
              onDoubleClick={(e) => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); const min = Math.floor(((e.clientY - r.top) / HOUR_H) * 2) * 30; const s = new Date(d); s.setMinutes(min); onNew(s); }}>
              {Array.from({ length: 24 }, (_, h) => <i key={h} className="tg-line" style={{ top: h * HOUR_H }} />)}
              {dayKey(d) === today && <i className="tg-now" style={{ top: ((now - sod(d).getTime()) / 3600000) * HOUR_H }} />}
              {placed.map(({ it, top, height, col, cols }) => (
                <button key={it.key} className={'tg-ev' + (it.done ? ' done' : '')} style={{ top, height, left: `calc(${(col / cols) * 100}% + 2px)`, width: `calc(${100 / cols}% - 4px)`, ['--c' as any]: it.color }}
                  onClick={(e) => { e.stopPropagation(); onItem(it); }} onDoubleClick={(e) => e.stopPropagation()} title={it.title}>
                  <strong className="truncate">{it.kind === 'task' ? (it.done ? '☑ ' : '☐ ') : ''}{it.title}</strong>
                  {height > 32 && <small>{hm(it.start)}{it.kind !== 'task' && it.kind !== 'reminder' ? ' – ' + hm(it.end) : ''}</small>}
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function layout(list: Item[], day: Date) {
  const d0 = sod(day).getTime();
  const evs = list.map((it) => {
    const s = Math.max(it.start, d0), e = Math.min(Math.max(it.end, it.start + 1800000), d0 + 86400000);
    return { it, s, e };
  }).sort((a, b) => a.s - b.s || b.e - a.e);
  const out: { it: Item; top: number; height: number; col: number; cols: number }[] = [];
  let group: typeof out = [];
  let groupEnd = 0;
  const cols: number[] = [];
  const flush = () => { const n = Math.max(1, ...group.map((g) => g.col + 1)); group.forEach((g) => (g.cols = n)); out.push(...group); group = []; cols.length = 0; };
  for (const ev of evs) {
    if (group.length && ev.s >= groupEnd) flush();
    let col = cols.findIndex((end) => end <= ev.s);
    if (col < 0) { col = cols.length; cols.push(ev.e); } else cols[col] = ev.e;
    group.push({ it: ev.it, top: ((ev.s - d0) / 3600000) * HOUR_H, height: Math.max(20, ((ev.e - ev.s) / 3600000) * HOUR_H - 2), col, cols: 1 });
    groupEnd = Math.max(groupEnd, ev.e);
  }
  flush();
  return out;
}

// ---------- Agenda ----------
function Agenda({ from, byDay, onItem }: { from: Date; byDay: Map<string, Item[]>; onItem: (i: Item) => void }) {
  const days = Array.from({ length: 60 }, (_, i) => addDays(from, i)).filter((d) => byDay.get(dayKey(d))?.length);
  if (!days.length) return <p className="muted pad">Nada agendado nos próximos 60 dias.</p>;
  return (
    <div className="agenda">
      {days.map((d) => (
        <div key={d.getTime()} className="agenda-day">
          <div className="agenda-date"><strong>{d.getDate()}</strong><small className="cap">{d.toLocaleDateString('pt-PT', { weekday: 'short', month: 'short' })}</small></div>
          <div className="agenda-list">
            {(byDay.get(dayKey(d)) || []).map((it) => (
              <button key={it.key} className="agenda-item" onClick={() => onItem(it)}>
                <i className="cal-dot" style={{ background: it.color }} />
                <span className="agenda-time">{it.allDay ? 'Dia todo' : hm(it.start)}</span>
                <span className={'truncate' + (it.done ? ' done-text' : '')}>{it.kind === 'task' ? '☐ ' : it.kind === 'reminder' ? '🔔 ' : ''}{it.title}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------- Diálogos ----------
export function editEvent(ev: CalEvent, isNew = false) {
  return showModal<void>((done) => <EventDialog ev={ev} isNew={isNew} done={done} />);
}

function EventDialog({ ev, isNew, done }: { ev: CalEvent; isNew: boolean; done: () => void }) {
  const [e, setE] = useState<CalEvent>(ev);
  const set = (k: keyof CalEvent, v: any) => setE({ ...e, [k]: v });
  const dateOnly = (t: number) => toLocalInput(t).slice(0, 10);
  const save = async () => {
    if (!e.title.trim()) return done();
    const end = e.end < e.start ? e.start + 3600000 : e.end;
    await put('events', { ...e, title: e.title.trim(), end });
    done();
  };
  const meetingNote = async () => {
    const when = new Date(e.start).toLocaleString('pt-PT', { dateStyle: 'full', timeStyle: e.allDay ? undefined : 'short' });
    const n = await createNote({
      title: e.title || 'Reunião',
      content: `<p><strong>Data:</strong> ${escapeHtml(when)}</p>${e.location ? `<p><strong>Local:</strong> ${escapeHtml(e.location)}</p>` : ''}<p><strong>Participantes:</strong> </p><h2>Notas</h2><p></p><h2>Decisões</h2><ul><li><p></p></li></ul><h2>Próximos passos</h2><ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p></p></li></ul>`,
    });
    await put('events', { ...e, noteId: n.id });
    done();
    navigate('notes', n.id);
  };
  return (
    <Modal title={isNew ? 'Novo evento' : 'Evento'} onClose={save}
      footer={<>
        {!isNew && <button className="btn danger-text" onClick={async () => { if (await confirmDialog('Eliminar este evento?', { danger: true, ok: 'Eliminar' })) { await removeDoc('events', e.id); done(); } }}>Eliminar</button>}
        <span className="flex-1" />
        <button className="btn" onClick={done}>Cancelar</button>
        <button className="btn primary" onClick={save}>Guardar</button>
      </>}>
      <input className="input big" autoFocus placeholder="Título do evento" value={e.title} onChange={(x) => set('title', x.target.value)} onKeyDown={(x) => x.key === 'Enter' && save()} />
      <label className="check"><input type="checkbox" checked={!!e.allDay} onChange={(x) => set('allDay', x.target.checked ? 1 : 0)} /> Dia todo</label>
      <div className="form-grid">
        {e.allDay ? <>
          <label>Início<input className="input" type="date" value={dateOnly(e.start)} onChange={(x) => { const t = new Date(x.target.value + 'T00:00:00').getTime(); setE({ ...e, start: t, end: Math.max(e.end, t + 86399999) }); }} /></label>
          <label>Fim<input className="input" type="date" value={dateOnly(e.end)} onChange={(x) => set('end', new Date(x.target.value + 'T23:59:59').getTime())} /></label>
        </> : <>
          <label>Início<input className="input" type="datetime-local" value={toLocalInput(e.start)} onChange={(x) => { const t = fromLocalInput(x.target.value); if (t) setE({ ...e, start: t, end: t + (e.end - e.start) }); }} /></label>
          <label>Fim<input className="input" type="datetime-local" value={toLocalInput(e.end)} onChange={(x) => { const t = fromLocalInput(x.target.value); if (t) set('end', t); }} /></label>
        </>}
        <label>Local<input className="input" value={e.location || ''} placeholder="Ex.: Sala de reuniões" onChange={(x) => set('location', x.target.value)} /></label>
        <label>Lembrete
          <select className="input" value={e.reminderMin ?? ''} onChange={(x) => set('reminderMin', x.target.value === '' ? null : Number(x.target.value))}>
            <option value="">Sem lembrete</option><option value="0">Na hora</option><option value="10">10 min antes</option><option value="30">30 min antes</option><option value="60">1 hora antes</option><option value="1440">1 dia antes</option>
          </select>
        </label>
      </div>
      <textarea className="input" rows={3} placeholder="Descrição" value={e.description || ''} onChange={(x) => set('description', x.target.value)} />
      <div className="row gap wrap" style={{ marginTop: 10 }}>
        <span className="muted small">Cor:</span>
        {[LOCAL_COLOR, ...CAL_COLORS].map((c) => <button key={c} className={'color-dot' + ((e.color || LOCAL_COLOR) === c ? ' on' : '')} style={{ background: c }} onClick={() => set('color', c)} />)}
      </div>
      <div className="row gap" style={{ marginTop: 12 }}>
        <Icon name="note" size={15} className="muted" />
        {e.noteId ? <a href={`#/note/${e.noteId}`} onClick={() => save()}>Abrir nota da reunião</a> : <button className="link-btn" onClick={meetingNote}>Criar nota da reunião</button>}
      </div>
    </Modal>
  );
}

function showExt(e: ExtEvent, subs: CalendarSub[]) {
  const sub = subs.find((s) => s.id === e.calId);
  return showModal<void>((done) => (
    <Modal title={e.title} onClose={done}
      footer={<>
        <span className="muted small">{sub?.name} · só de leitura</span>
        <span className="flex-1" />
        <button className="btn primary" onClick={async () => {
          const when = e.allDay ? new Date(e.start).toLocaleDateString('pt-PT', { dateStyle: 'full' }) : new Date(e.start).toLocaleString('pt-PT', { dateStyle: 'full', timeStyle: 'short' });
          const n = await createNote({
            title: e.title,
            content: `<p><strong>Data:</strong> ${escapeHtml(when)}</p>${e.location ? `<p><strong>Local:</strong> ${escapeHtml(e.location)}</p>` : ''}${e.description ? `<blockquote><p>${escapeHtml(e.description).replace(/\n/g, '</p><p>')}</p></blockquote>` : ''}<h2>Notas</h2><p></p><h2>Próximos passos</h2><ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p></p></li></ul>`,
          });
          done();
          navigate('notes', n.id);
        }}><Icon name="note" size={15} /> Criar nota da reunião</button>
      </>}>
      <p><Icon name="calendar" size={15} /> {e.allDay ? new Date(e.start).toLocaleDateString('pt-PT', { dateStyle: 'full' }) + ' (dia todo)' : `${new Date(e.start).toLocaleString('pt-PT', { dateStyle: 'full', timeStyle: 'short' })} – ${hm(e.end)}`}</p>
      {e.location && <p><Icon name="location" size={15} /> {e.location}</p>}
      {e.description && <p className="pre-wrap muted">{e.description}</p>}
    </Modal>
  ));
}

// ---------- Ligar Google / Outlook / iCal ----------
async function connectCalendar(provider: CalendarSub['provider'], subs: CalendarSub[]) {
  const res = await showModal<{ url: string; name: string } | null>((done) => <ConnectDialog provider={provider} done={done} />);
  if (!res) return;
  const color = CAL_COLORS[subs.length % CAL_COLORS.length];
  await setSetting('calendars', [...subs, { id: uid(10), name: res.name, url: res.url, color, provider, enabled: true }]);
  toast(`Calendário “${res.name}” ligado`);
}

function ConnectDialog({ provider, done }: { provider: CalendarSub['provider']; done: (v: { url: string; name: string } | null) => void }) {
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const label = provider === 'google' ? 'Google Calendar' : provider === 'outlook' ? 'Outlook / Microsoft 365' : 'Calendário iCal';
  const test = async () => {
    setBusy(true);
    setErr('');
    try {
      const r = await testCalendar(url.trim());
      done({ url: url.trim(), name: name.trim() || r.name || label });
      toast(`${r.count} eventos encontrados`);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal wide title={`Ligar ${label}`} onClose={() => done(null)}
      footer={<><button className="btn" onClick={() => done(null)}>Cancelar</button><button className="btn primary" disabled={!url.trim() || busy} onClick={test}>{busy ? 'A verificar…' : 'Ligar calendário'}</button></>}>
      <div className="connect-steps">
        {provider === 'google' && <ol>
          <li>Abra o <a href="https://calendar.google.com/calendar/r/settings" target="_blank" rel="noopener noreferrer">Google Calendar → Definições</a> no computador.</li>
          <li>À esquerda, em <em>Definições dos meus calendários</em>, escolha o calendário (ex.: nome@empresa.com).</li>
          <li>Desça até <em>Integrar calendário</em> e copie o <strong>Endereço secreto no formato iCal</strong>.</li>
          <li>Cole-o abaixo. Repita para cada calendário (aniversários, feriados…).</li>
        </ol>}
        {provider === 'outlook' && <ol>
          <li>Abra o <a href="https://outlook.office.com/calendar/options/calendar/SharedCalendars" target="_blank" rel="noopener noreferrer">Outlook na Web → Definições → Calendário → Calendários partilhados</a>.</li>
          <li>Em <em>Publicar um calendário</em>, escolha o calendário e <strong>Pode ver todos os detalhes</strong>, e clique em <em>Publicar</em>.</li>
          <li>Copie a ligação <strong>ICS</strong> e cole-a abaixo.</li>
          <li className="muted">Se a sua empresa bloquear a publicação, peça ao IT para a permitir.</li>
        </ol>}
        {provider === 'ics' && <p>Cole o endereço de qualquer calendário no formato iCal (.ics ou webcal://), por exemplo do iCloud, de feriados ou de uma reserva.</p>}
        <p className="muted small">O endereço é privado: fica guardado apenas na sua FlyNotes. Os eventos são só de leitura e atualizam-se automaticamente.</p>
      </div>
      <label className="field-label">Endereço iCal</label>
      <input className="input" autoFocus placeholder="https://calendar.google.com/calendar/ical/…/basic.ics" value={url} onChange={(e) => setUrl(e.target.value)} />
      <label className="field-label">Nome (opcional)</label>
      <input className="input" placeholder={label} value={name} onChange={(e) => setName(e.target.value)} />
      {err && <p className="danger-text">{err}</p>}
    </Modal>
  );
}

function GoogleLogo({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z" /><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" /><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" /><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C36.9 39.2 44 34 44 24c0-1.2-.1-2.3-.4-3.5z" /></svg>
  );
}
function OutlookLogo({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="4" width="14" height="16" rx="2" fill="#0a64ad" /><rect x="2" y="7" width="11" height="10" rx="1.5" fill="#0078d4" /><circle cx="7.5" cy="12" r="2.6" fill="none" stroke="#fff" strokeWidth="1.6" /></svg>
  );
}
