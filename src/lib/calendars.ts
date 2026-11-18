// Calendários externos (Google, Outlook, iCal): obtidos pelo servidor e guardados em cache para uso offline.
import type { CalendarSub } from './store';

export interface ExtEvent { uid: string; title: string; start: number; end: number; allDay: boolean; location?: string; description?: string; calId: string; color: string }

const memo = new Map<string, { at: number; events: ExtEvent[] }>();
const TTL = 5 * 60 * 1000;
const cacheKey = (id: string) => 'fn:cal:' + id;

export async function fetchCalendar(sub: CalendarSub, from: number, to: number, force = false): Promise<ExtEvent[]> {
  const key = `${sub.id}:${from}:${to}`;
  const hit = memo.get(key);
  if (!force && hit && Date.now() - hit.at < TTL) return hit.events;
  try {
    const r = await fetch('/api/calendar', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: sub.url, from, to }) });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Erro');
    const events: ExtEvent[] = (data.events || []).map((e: any) => ({ ...e, calId: sub.id, color: sub.color }));
    memo.set(key, { at: Date.now(), events });
    try { localStorage.setItem(cacheKey(sub.id), JSON.stringify({ from, to, events })); } catch {}
    return events;
  } catch (e) {
    // Sem rede: usa a última cópia guardada
    try {
      const c = JSON.parse(localStorage.getItem(cacheKey(sub.id)) || 'null');
      if (c) return (c.events as ExtEvent[]).filter((e) => e.end >= from && e.start <= to).map((e) => ({ ...e, color: sub.color }));
    } catch {}
    throw e;
  }
}

export async function testCalendar(url: string): Promise<{ name?: string; count: number }> {
  const r = await fetch('/api/calendar', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url, from: Date.now() - 30 * 86400000, to: Date.now() + 120 * 86400000 }) });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || 'Não foi possível ler o calendário');
  return { name: data.name, count: (data.events || []).length };
}

export const CAL_COLORS = ['#0ea5e9', '#22c55e', '#f59e0b', '#ef4444', '#a855f7', '#ec4899', '#14b8a6', '#64748b'];
