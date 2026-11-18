import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

// ---------- Ícones (traço, 24x24) ----------
const P: Record<string, string> = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  note: 'M6 3h9l5 5v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM14 3v6h6M8 13h8M8 17h5',
  notes: 'M8 3h11a1 1 0 0 1 1 1v13M4 7h11a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1zM6 12h7M6 16h5',
  book: 'M4 4.5A1.5 1.5 0 0 1 5.5 3H20v15H5.5A1.5 1.5 0 0 0 4 19.5zM4 19.5A1.5 1.5 0 0 0 5.5 21H20M8 7h8',
  tag: 'M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9zM8 8h.01',
  check: 'M20 6 9 17l-5-5',
  checkCircle: 'M22 11.1V12a10 10 0 1 1-5.9-9.1M22 4 12 14l-3-3',
  calendar: 'M4 5h16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM16 3v4M8 3v4M3 10h18',
  trash: 'M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1L5 6M10 11v6M14 11v6',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-4.3-4.3',
  plus: 'M12 5v14M5 12h14',
  star: 'M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z',
  settings: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  moreV: 'M12 5h.01M12 12h.01M12 19h.01',
  back: 'M15 18l-6-6 6-6',
  close: 'M18 6 6 18M6 6l12 12',
  bell: 'M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
  pin: 'M12 17v5M9 3h6l-1 6 4 4H6l4-4z',
  clip: 'M21.4 11.1l-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5',
  camera: 'M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2zM12 9a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  mic: 'M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3zM19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8',
  image: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM21 15l-5-5L5 21',
  link: 'M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7',
  lock: 'M5 11h14a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1zM8 11V7a4 4 0 1 1 8 0v4',
  unlock: 'M5 11h14a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1zM8 11V7a4 4 0 0 1 7.9-1',
  history: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l4 2',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12',
  copy: 'M9 9h11a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V10a1 1 0 0 1 1-1zM5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1',
  move: 'M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20',
  template: 'M4 3h16a1 1 0 0 1 1 1v4H3V4a1 1 0 0 1 1-1zM3 8h7v13H4a1 1 0 0 1-1-1zM10 8h11v12a1 1 0 0 1-1 1H10z',
  sync: 'M23 4v6h-6M1 20v-6h6M3.5 9a9 9 0 0 1 14.8-3.4L23 10M1 14l4.7 4.4A9 9 0 0 0 20.5 15',
  cloudOff: 'M2 2l20 20M5.8 5.8A7 7 0 0 0 7 19h11a4 4 0 0 0 1.5-.3M10 5.1A7 7 0 0 1 18 10h.5a4 4 0 0 1 3.3 6.3',
  menu: 'M3 6h18M3 12h18M3 18h18',
  flag: 'M4 22V4s1.5-1 5-1 5 2 8 2 3-1 3-1v11s-1.5 1-3 1-5-2-8-2-5 1-5 1',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01',
  globe: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM2 12h20M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20z',
  printer: 'M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z',
  file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z',
  rows: 'M3 4h18v6H3zM3 14h18v6H3z',
  sort: 'M3 6h12M3 12h8M3 18h4M17 8v12M14 17l3 3 3-3',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
  chevronDown: 'M6 9l6 6 6-6',
  chevronRight: 'M9 18l6-6-6-6',
  chevronLeft: 'M15 18l-6-6 6-6',
  stack: 'M12 2 2 7l10 5 10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
  scan: 'M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 12h10',
  location: 'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0zM12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  maximize: 'M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3',
  undo: 'M3 7v6h6M21 17a9 9 0 0 0-15-6.7L3 13',
  redo: 'M21 7v6h-6M3 17a9 9 0 0 1 15-6.7L21 13',
  table: 'M3 3h18v18H3zM3 9h18M3 15h18M9 3v18M15 3v18',
  code: 'M16 18l6-6-6-6M8 6l-6 6 6 6',
  quote: 'M3 21c3 0 7-1 7-8V5H3v7h4c0 4-4 5-4 5zM14 21c3 0 7-1 7-8V5h-7v7h4c0 4-4 5-4 5z',
  hr: 'M3 12h18',
  type: 'M4 7V4h16v3M9 20h6M12 4v16',
  highlight: 'M9 11l-6 6v3h9l3-3M22 12l-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4',
  palette: 'M12 22a10 10 0 1 1 10-10c0 2.8-2.2 4-4 4h-2a2 2 0 0 0-1.5 3.3A1.8 1.8 0 0 1 12 22zM7.5 10.5h.01M12 7.5h.01M16.5 10.5h.01',
  alignLeft: 'M17 10H3M21 6H3M21 14H3M17 18H3',
  alignCenter: 'M18 10H6M21 6H3M21 14H3M18 18H6',
  alignRight: 'M21 10H7M21 6H3M21 14H3M21 18H7',
  indent: 'M3 8l4 4-4 4M21 12H11M21 6H11M21 18H11',
  outdent: 'M7 8l-4 4 4 4M21 12H11M21 6H11M21 18H11',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
  plane: 'M22 2 11 13M22 2l-7 20-4-9-9-4z',
  ocr: 'M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M8 8h8M12 8v8',
  dictate: 'M9 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3zM15 9v2a6 6 0 0 1-12 0V9M9 17v4M17 7c1 1 1.5 2.3 1.5 3.5S18 13 17 14M20 4c2 2 3 4.3 3 6.5S22 15 20 17',
  font: 'M4 20l6-16h1l6 16M6.5 14h9',
  pause: 'M6 4h4v16H6zM14 4h4v16h-4z',
  play: 'M6 4l14 8-14 8z',
  collapseList: 'M11 17l-5-5 5-5M18 17l-5-5 5-5',
  expandList: 'M13 17l5-5-5-5M6 17l5-5-5-5',
  inbox: 'M22 12h-6l-2 3h-4l-2-3H2M5.5 5h13l3.5 7v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z',
  files: 'M15 2H8a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7zM15 2v5h5M2 8v12a2 2 0 0 0 2 2h10',
  share: 'M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13',
};

export function Icon({ name, size = 18, className = '', fill }: { name: keyof typeof P | string; size?: number; className?: string; fill?: boolean }) {
  return (
    <svg className={'icon ' + className} width={size} height={size} viewBox="0 0 24 24" fill={fill ? 'currentColor' : 'none'}
      stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={P[name] || P.note} />
    </svg>
  );
}

// ---------- Modal ----------
const modalStack: string[] = [];
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

export function Modal({ title, onClose, children, footer, wide }: { title?: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    // Foco: entra na janela, fica preso nela (Tab) e volta ao elemento anterior ao fechar
    const prev = document.activeElement as HTMLElement | null;
    modalStack.push(id);
    const el = box.current;
    if (el && !el.contains(document.activeElement)) {
      const first = el.querySelector<HTMLElement>('[autofocus], .modal-body ' + FOCUSABLE.split(', ').join(', .modal-body ')) || el.querySelector<HTMLElement>(FOCUSABLE);
      (first || el).focus();
    }
    const k = (e: KeyboardEvent) => {
      if (modalStack[modalStack.length - 1] !== id) return; // só a janela de cima reage
      if (e.key === 'Escape') {
        if (el?.querySelector('.menu')) return; // fecha primeiro o menu aberto dentro da janela
        e.stopPropagation(); closeRef.current(); return;
      }
      if (e.key === 'Tab' && el) {
        const items = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((x) => x.offsetParent !== null);
        if (!items.length) return;
        const i = items.indexOf(document.activeElement as HTMLElement);
        if (e.shiftKey && (i <= 0)) { e.preventDefault(); items[items.length - 1].focus(); }
        else if (!e.shiftKey && i === items.length - 1) { e.preventDefault(); items[0].focus(); }
      }
    };
    window.addEventListener('keydown', k, true);
    return () => {
      window.removeEventListener('keydown', k, true);
      const at = modalStack.lastIndexOf(id);
      if (at >= 0) modalStack.splice(at, 1);
      if (prev && document.contains(prev)) prev.focus?.();
    };
  }, [id]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={'modal' + (wide ? ' wide' : '')} role="dialog" aria-modal="true" aria-labelledby={title ? id + '-t' : undefined} ref={box} tabIndex={-1}>
        {title && (
          <div className="modal-head">
            <h3 id={id + '-t'}>{title}</h3>
            <button className="icon-btn" onClick={onClose} aria-label="Fechar"><Icon name="close" /></button>
          </div>
        )}
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

// Diálogos imperativos (prompt / confirm / escolha)
function mount<T>(render: (done: (v: T) => void) => ReactNode): Promise<T> {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const root = createRoot(el);
    const done = (v: T) => {
      root.unmount();
      el.remove();
      resolve(v);
    };
    root.render(render(done));
  });
}

export function askText(title: string, opts: { initial?: string; placeholder?: string; ok?: string; type?: string; label?: string } = {}): Promise<string | null> {
  return mount<string | null>((done) => <PromptDialog title={title} {...opts} done={done} />);
}

function PromptDialog({ title, initial = '', placeholder, ok = 'OK', type = 'text', label, done }: any) {
  const [v, setV] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { setTimeout(() => { ref.current?.focus(); ref.current?.select(); }, 30); }, []);
  return (
    <Modal title={title} onClose={() => done(null)}
      footer={<><button className="btn" onClick={() => done(null)}>Cancelar</button><button className="btn primary" onClick={() => done(v)}>{ok}</button></>}>
      <form onSubmit={(e) => { e.preventDefault(); done(v); }}>
        {label && <label className="field-label">{label}</label>}
        <input ref={ref} className="input" type={type} value={v} placeholder={placeholder} onChange={(e) => setV(e.target.value)} />
      </form>
    </Modal>
  );
}

export function confirmDialog(message: string, opts: { ok?: string; danger?: boolean; title?: string } = {}): Promise<boolean> {
  return mount<boolean>((done) => (
    <Modal title={opts.title || 'Confirmar'} onClose={() => done(false)}
      footer={<><button className="btn" onClick={() => done(false)}>Cancelar</button>
        <button className={'btn ' + (opts.danger ? 'danger' : 'primary')} autoFocus onClick={() => done(true)}>{opts.ok || 'Confirmar'}</button></>}>
      <p>{message}</p>
    </Modal>
  ));
}

export function chooseDialog<T extends string>(title: string, options: { value: T; label: string; icon?: string; hint?: string }[]): Promise<T | null> {
  return mount<T | null>((done) => (
    <Modal title={title} onClose={() => done(null)}>
      <div className="choice-list">
        {options.map((o) => (
          <button key={o.value} className="choice" onClick={() => done(o.value)}>
            {o.icon && <span className="choice-icon">{o.icon}</span>}
            <span><strong>{o.label}</strong>{o.hint && <small>{o.hint}</small>}</span>
          </button>
        ))}
      </div>
    </Modal>
  ));
}

export function showModal<T>(render: (done: (v: T) => void) => ReactNode): Promise<T> {
  return mount(render);
}

// ---------- Toasts ----------
type ToastT = { id: number; text: string; action?: { label: string; fn: () => void } };
let toastId = 0;
const toastSubs = new Set<(t: ToastT[]) => void>();
let toasts: ToastT[] = [];
export function toast(text: string, action?: ToastT['action'], ms = 3500) {
  const t = { id: ++toastId, text, action };
  toasts = [...toasts, t];
  toastSubs.forEach((s) => s(toasts));
  setTimeout(() => {
    toasts = toasts.filter((x) => x.id !== t.id);
    toastSubs.forEach((s) => s(toasts));
  }, ms);
}
export function Toasts() {
  const [list, setList] = useState<ToastT[]>([]);
  useEffect(() => {
    toastSubs.add(setList);
    return () => { toastSubs.delete(setList); };
  }, []);
  return (
    <div className="toasts">
      {list.map((t) => (
        <div key={t.id} className="toast">
          <span>{t.text}</span>
          {t.action && <button onClick={t.action.fn}>{t.action.label}</button>}
        </div>
      ))}
    </div>
  );
}

// ---------- Menu suspenso ----------
export interface MenuItem {
  label?: string;
  icon?: string;
  onClick?: () => void;
  danger?: boolean;
  divider?: boolean;
  checked?: boolean;
  disabled?: boolean;
  swatch?: string;
}

export function Menu({ trigger, items, align = 'right', className = '' }: { trigger: ReactNode; items: MenuItem[]; align?: 'left' | 'right'; className?: string }) {
  const [open, setOpen] = useState(false);
  const [byKeyboard, setByKeyboard] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const focusTrigger = () => (ref.current?.querySelector('button, a') as HTMLElement | null)?.focus();
  // Aberto com o teclado: foco no primeiro item
  useEffect(() => {
    if (open && byKeyboard) (menuRef.current?.querySelector('.menu-item:not(:disabled)') as HTMLElement | null)?.focus();
  }, [open, byKeyboard]);
  const onMenuKey = (e: React.KeyboardEvent) => {
    const list = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('.menu-item:not(:disabled)') || []);
    const i = list.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'Escape') { e.preventDefault(); focusTrigger(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); list[(i + 1) % list.length]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); list[(i - 1 + list.length) % list.length]?.focus(); }
    else if (e.key === 'Home') { e.preventDefault(); list[0]?.focus(); }
    else if (e.key === 'End') { e.preventDefault(); list[list.length - 1]?.focus(); }
    else if (e.key === 'Tab') setOpen(false);
  };
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | TouchEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    // Esc fecha o menu mesmo quando foi aberto com o rato (o foco não está dentro dele)
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); if (ref.current?.contains(document.activeElement)) (ref.current.querySelector('button, a') as HTMLElement | null)?.focus(); } };
    document.addEventListener('mousedown', close);
    document.addEventListener('touchstart', close);
    document.addEventListener('keydown', esc, true);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('touchstart', close);
      document.removeEventListener('keydown', esc, true);
    };
  }, [open]);
  return (
    <div className={'menu-wrap ' + className} ref={ref}>
      <span onClick={(e) => { e.stopPropagation(); setByKeyboard(e.detail === 0); setOpen(!open); }}
        onKeyDown={(e) => { if (e.key === 'ArrowDown' && !open) { e.preventDefault(); setByKeyboard(true); setOpen(true); } }}>{trigger}</span>
      {open && (
        <div className={'menu ' + align} role="menu" ref={menuRef} onKeyDown={onMenuKey}>
          {items.map((it, i) =>
            it.divider ? <div key={i} className="menu-div" role="separator" /> : (
              <button key={i} role={it.checked !== undefined ? 'menuitemcheckbox' : 'menuitem'} aria-checked={it.checked !== undefined ? !!it.checked : undefined}
                className={'menu-item' + (it.danger ? ' danger' : '')} disabled={it.disabled}
                onClick={(e) => { e.stopPropagation(); setOpen(false); if (byKeyboard) focusTrigger(); it.onClick?.(); }}>
                {it.icon && <Icon name={it.icon} size={16} />}
                {it.swatch && <span className="swatch" style={{ background: it.swatch }} />}
                <span>{it.label}</span>
                {it.checked && <Icon name="check" size={14} className="menu-check" />}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}

export function useMedia(q: string) {
  const [m, setM] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const f = () => setM(mq.matches);
    mq.addEventListener('change', f);
    return () => mq.removeEventListener('change', f);
  }, [q]);
  return m;
}

export function Empty({ icon, title, text, children }: { icon: string; title: string; text?: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-icon"><Icon name={icon} size={36} /></div>
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {children}
    </div>
  );
}

// Logótipo FlyNotes: N com ponto âmbar ("faísca" de voo).
export function LogoMark({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="76 76 360 360" aria-hidden="true">
      <path d="M164 368V150l184 218V150" fill="none" stroke="#fff" strokeWidth="56" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="408" cy="112" r="30" fill="#fbbf24" />
    </svg>
  );
}
export function Logo({ size = 40 }: { size?: number }) {
  return <span className="logo-full" style={{ width: size, height: size, borderRadius: size * 0.22 }}><LogoMark size={size * 0.62} /></span>;
}
