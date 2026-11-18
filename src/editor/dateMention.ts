// Datas com "@": escreva @amanhã, @sexta, @15/11 ou @3 dias para inserir uma data que se atualiza ("hoje", "amanhã", "há 2 dias").
import { Node, mergeAttributes } from '@tiptap/core';
import Suggestion from '@tiptap/suggestion';
import { PluginKey } from '@tiptap/pm/state';

const WEEKDAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const day = (offset: number, base = new Date()) => { const d = new Date(base); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + offset); return d; };
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function relativeLabel(isoDate: string): string {
  const d = new Date(isoDate + 'T00:00:00');
  const diff = Math.round((d.getTime() - day(0).getTime()) / 86400000);
  if (diff === 0) return 'hoje';
  if (diff === 1) return 'amanhã';
  if (diff === -1) return 'ontem';
  if (diff > 1 && diff < 7) return WEEKDAYS[d.getDay()];
  if (diff < 0 && diff > -30) return `há ${-diff} dias`;
  if (diff > 0 && diff <= 30) return `daqui a ${diff} dias`;
  return '';
}
export function fullLabel(isoDate: string): string {
  const d = new Date(isoDate + 'T00:00:00');
  return d.toLocaleDateString('pt-PT', { weekday: 'short', day: 'numeric', month: 'short', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
}

/** Interpreta o texto escrito depois de "@" e devolve sugestões de datas. */
export function dateSuggestions(query: string): { label: string; date: string }[] {
  const q = norm(query.trim());
  const out: { label: string; date: string }[] = [];
  const add = (label: string, d: Date) => { if (!out.some((o) => o.date === iso(d))) out.push({ label, date: iso(d) }); };
  const fixed: [string, Date][] = [['Hoje', day(0)], ['Amanhã', day(1)], ['Depois de amanhã', day(2)], ['Ontem', day(-1)], ['Próxima semana', day(7)]];
  for (const [l, d] of fixed) if (!q || norm(l).startsWith(q)) add(l, d);
  WEEKDAYS.forEach((w, i) => {
    if (q && norm(w).startsWith(q)) {
      let off = (i - new Date().getDay() + 7) % 7;
      if (off === 0) off = 7;
      add(w[0].toUpperCase() + w.slice(1), day(off));
    }
  });
  const rel = q.match(/^(\d{1,3})\s*(d|dia|dias|s|sem|semana|semanas|m|mes|meses)?$/);
  if (rel && rel[2]) {
    const n = +rel[1];
    const unit = rel[2][0];
    const d = unit === 'd' ? day(n) : unit === 's' ? day(n * 7) : (() => { const x = day(0); x.setMonth(x.getMonth() + n); return x; })();
    add(`Daqui a ${n} ${unit === 'd' ? 'dias' : unit === 's' ? 'semanas' : 'meses'}`, d);
  }
  const abs = q.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/);
  if (abs) {
    const now = new Date();
    let y = abs[3] ? (+abs[3] < 100 ? 2000 + +abs[3] : +abs[3]) : now.getFullYear();
    let d = new Date(y, +abs[2] - 1, +abs[1]);
    if (!abs[3] && d < day(0)) d = new Date(++y, +abs[2] - 1, +abs[1]);
    if (!isNaN(d.getTime())) add(d.toLocaleDateString('pt-PT', { day: 'numeric', month: 'long', year: 'numeric' }), d);
  }
  return out.slice(0, 7);
}

const key = new PluginKey('dateMention');

export const DateMention = Node.create({
  name: 'dateMention',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return { date: { default: null, parseHTML: (el) => el.getAttribute('data-date') } };
  },
  parseHTML() {
    return [{ tag: 'span[data-type="date"]' }];
  },
  renderHTML({ node, HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-type': 'date', 'data-date': node.attrs.date, class: 'date-chip' }), '📅 ' + fullLabel(node.attrs.date)];
  },
  renderText({ node }) {
    return fullLabel(node.attrs.date);
  },
  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement('span');
      dom.className = 'date-chip';
      dom.contentEditable = 'false';
      const render = () => {
        const rel = relativeLabel(node.attrs.date);
        const past = new Date(node.attrs.date + 'T23:59:59').getTime() < Date.now();
        dom.classList.toggle('past', past);
        dom.textContent = '📅 ' + fullLabel(node.attrs.date) + (rel ? ` · ${rel}` : '');
      };
      render();
      dom.title = 'Clique para abrir no calendário';
      dom.onclick = () => { location.hash = '#/calendar?d=' + node.attrs.date; };
      return { dom };
    };
  },
  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        char: '@',
        pluginKey: key,
        allowSpaces: true,
        items: ({ query }) => dateSuggestions(query),
        command: ({ editor, range, props }) => {
          editor.chain().focus().insertContentAt(range, [{ type: this.name, attrs: { date: (props as any).date } }, { type: 'text', text: ' ' }]).run();
        },
        render: () => {
          let el: HTMLDivElement | null = null;
          let items: { label: string; date: string }[] = [];
          let sel = 0;
          let cmd: ((p: any) => void) | null = null;
          const draw = () => {
            if (!el) return;
            el.innerHTML = '';
            if (!items.length) { el.style.display = 'none'; return; }
            el.style.display = '';
            const h = document.createElement('div');
            h.className = 'date-pop-head';
            h.textContent = 'Inserir data';
            el.append(h);
            items.forEach((it, i) => {
              const b = document.createElement('button');
              b.type = 'button';
              b.className = 'menu-item' + (i === sel ? ' on' : '');
              b.innerHTML = `<span>📅</span><span>${it.label}</span><small class="muted" style="margin-left:auto">${fullLabel(it.date)}</small>`;
              b.onmousedown = (e) => { e.preventDefault(); cmd?.(it); };
              el!.append(b);
            });
          };
          const place = (rect: DOMRect | null) => {
            if (!el || !rect) return;
            el.style.left = Math.min(rect.left, window.innerWidth - 300) + 'px';
            el.style.top = rect.bottom + 6 + 'px';
          };
          return {
            onStart: (p) => {
              el = document.createElement('div');
              el.className = 'menu date-pop';
              document.body.append(el);
              items = p.items as any;
              cmd = p.command;
              sel = 0;
              draw();
              place(p.clientRect?.() || null);
            },
            onUpdate: (p) => { items = p.items as any; cmd = p.command; sel = 0; draw(); place(p.clientRect?.() || null); },
            onKeyDown: ({ event }) => {
              if (!items.length) return false;
              if (event.key === 'ArrowDown') { sel = (sel + 1) % items.length; draw(); return true; }
              if (event.key === 'ArrowUp') { sel = (sel - 1 + items.length) % items.length; draw(); return true; }
              if (event.key === 'Enter' || event.key === 'Tab') { cmd?.(items[sel]); return true; }
              if (event.key === 'Escape') { el?.remove(); el = null; return true; }
              return false;
            },
            onExit: () => { el?.remove(); el = null; },
          };
        },
      }),
    ];
  },
});
