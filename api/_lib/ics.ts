// Leitor de calendários iCal (.ics) com expansão de eventos recorrentes (RRULE) num intervalo de datas.
export interface IcsEvent { uid: string; title: string; start: number; end: number; allDay: boolean; location?: string; description?: string }

function unfold(text: string) {
  return text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '');
}
function unescape(v: string) {
  return v.replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\;/g, ';').replace(/\\\\/g, '\\');
}

/** Converte uma hora local de um fuso (TZID) em instante UTC. */
function zonedToUtc(y: number, mo: number, d: number, h: number, mi: number, s: number, tz?: string): number {
  const guess = Date.UTC(y, mo, d, h, mi, s);
  if (!tz) return guess;
  try {
    const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const parts = Object.fromEntries(fmt.formatToParts(new Date(guess)).map((p) => [p.type, p.value]));
    const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
    return guess - (asUtc - guess);
  } catch {
    return guess;
  }
}

function parseDate(value: string, params: Record<string, string>): { t: number; allDay: boolean } {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!m) return { t: Date.parse(value), allDay: false };
  const [, y, mo, d, h, mi, s, z] = m;
  if (!h) return { t: Date.UTC(+y, +mo - 1, +d), allDay: true };
  if (z) return { t: Date.UTC(+y, +mo - 1, +d, +h, +mi, +s), allDay: false };
  return { t: zonedToUtc(+y, +mo - 1, +d, +h, +mi, +s, params.TZID || 'Europe/Lisbon'), allDay: false };
}

interface Raw { props: Record<string, { value: string; params: Record<string, string> }[]> }

function parseBlocks(text: string): Raw[] {
  const lines = unfold(text).split('\n');
  const out: Raw[] = [];
  let cur: Raw | null = null;
  let depth = 0;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { cur = { props: {} }; depth = 0; continue; }
    if (line === 'END:VEVENT') { if (cur) out.push(cur); cur = null; continue; }
    if (!cur) continue;
    if (line.startsWith('BEGIN:')) { depth++; continue; }
    if (line.startsWith('END:')) { depth--; continue; }
    if (depth > 0) continue; // ignora VALARM
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const [name, ...rawParams] = line.slice(0, idx).split(';');
    const params: Record<string, string> = {};
    for (const p of rawParams) { const [k, v] = p.split('='); params[k.toUpperCase()] = (v || '').replace(/^"|"$/g, ''); }
    (cur.props[name.toUpperCase()] ||= []).push({ value: line.slice(idx + 1), params });
  }
  return out;
}

const DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

export function expandIcs(text: string, from: number, to: number): IcsEvent[] {
  const events: IcsEvent[] = [];
  const overrides = new Map<string, Set<number>>();
  const blocks = parseBlocks(text);
  // Ocorrências alteradas individualmente (RECURRENCE-ID) substituem a original
  for (const b of blocks) {
    const rid = b.props['RECURRENCE-ID']?.[0];
    if (rid) {
      const uid = b.props.UID?.[0]?.value || '';
      if (!overrides.has(uid)) overrides.set(uid, new Set());
      overrides.get(uid)!.add(parseDate(rid.value, rid.params).t);
    }
  }
  for (const b of blocks) {
    const ds = b.props.DTSTART?.[0];
    if (!ds) continue;
    if ((b.props.STATUS?.[0]?.value || '').toUpperCase() === 'CANCELLED') continue;
    const start = parseDate(ds.value, ds.params);
    const de = b.props.DTEND?.[0];
    let end = de ? parseDate(de.value, de.params).t : start.t + (start.allDay ? 86400000 : 3600000);
    const dur = b.props.DURATION?.[0]?.value;
    if (!de && dur) {
      const m = dur.match(/P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?/);
      if (m) end = start.t + ((+m[1] || 0) * 7 * 86400 + (+m[2] || 0) * 86400 + (+m[3] || 0) * 3600 + (+m[4] || 0) * 60) * 1000;
    }
    const length = Math.max(0, end - start.t);
    const uid = b.props.UID?.[0]?.value || Math.random().toString(36);
    const base = {
      uid,
      title: unescape(b.props.SUMMARY?.[0]?.value || '(sem título)'),
      allDay: start.allDay,
      location: b.props.LOCATION?.[0] ? unescape(b.props.LOCATION[0].value) : undefined,
      description: b.props.DESCRIPTION?.[0] ? unescape(b.props.DESCRIPTION[0].value).slice(0, 2000) : undefined,
    };
    const exdates = new Set<number>();
    for (const ex of b.props.EXDATE || []) for (const v of ex.value.split(',')) exdates.add(parseDate(v, ex.params).t);
    const isOverride = !!b.props['RECURRENCE-ID'];
    const rrule: string | undefined = isOverride ? undefined : b.props.RRULE?.[0]?.value;
    const push = (t: number) => {
      if (exdates.has(t) || (!isOverride && overrides.get(uid)?.has(t))) return;
      if (t + length < from || t > to) return;
      events.push({ ...base, uid: uid + '@' + t, start: t, end: t + length });
    };
    if (!rrule) { push(start.t); continue; }
    const r: Record<string, string> = Object.fromEntries(rrule.split(';').map((p: string) => p.split('=')));
    const freq = r.FREQ;
    const interval = +(r.INTERVAL || 1);
    const count = r.COUNT ? +r.COUNT : Infinity;
    const until = r.UNTIL ? parseDate(r.UNTIL, {}).t : Infinity;
    const byDay = r.BYDAY ? r.BYDAY.split(',').map((d: string) => DAYS.indexOf(d.slice(-2))) : null;
    const s0 = new Date(start.t);
    let n = 0;
    for (let i = 0; i < 5000 && n < count; i++) {
      const d = new Date(s0);
      if (freq === 'DAILY') d.setUTCDate(d.getUTCDate() + i * interval);
      else if (freq === 'WEEKLY') d.setUTCDate(d.getUTCDate() + i * 7 * interval);
      else if (freq === 'MONTHLY') d.setUTCMonth(d.getUTCMonth() + i * interval);
      else if (freq === 'YEARLY') d.setUTCFullYear(d.getUTCFullYear() + i * interval);
      else break;
      if (d.getTime() > until || d.getTime() > to) break;
      if (freq === 'WEEKLY' && byDay?.length) {
        // Gera cada dia da semana indicado em BYDAY dentro desta semana
        const weekStart = new Date(d);
        weekStart.setUTCDate(d.getUTCDate() - d.getUTCDay());
        for (const wd of byDay.sort()) {
          const occ = new Date(weekStart);
          occ.setUTCDate(weekStart.getUTCDate() + wd);
          occ.setUTCHours(s0.getUTCHours(), s0.getUTCMinutes(), s0.getUTCSeconds());
          if (occ.getTime() < start.t || occ.getTime() > until || n >= count) continue;
          n++;
          push(occ.getTime());
        }
      } else {
        n++;
        push(d.getTime());
      }
    }
  }
  return events.sort((a, b) => a.start - b.start).slice(0, 3000);
}
