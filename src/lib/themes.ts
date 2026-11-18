// Cores da aplicação: cor de destaque (botões, seleção, ligações) e estilo da barra lateral.
// O CSS é gerado aqui e injetado no arranque; a escolha fica em localStorage (por dispositivo).

export interface Accent {
  id: string;
  label: string;
  light: [accent: string, accent2: string, soft: string];
  dark: [accent: string, accent2: string, soft: string];
  side: string; // barra lateral escura, com um toque da cor
  sideDark: string; // idem, no tema escuro
  brand: [string, string]; // gradiente do logótipo e do avatar
  // Tons neutros próprios (fundos, texto, linhas) — usados pelo tema Evernote
  neutral?: { light: Record<string, string>; dark: Record<string, string>; sideText?: string; sideActive?: string };
}

export const ACCENTS: Accent[] = [
  // Cores do Evernote: verde da marca (#00A82D), barra lateral quase preta, cinzentos neutros sem tom azulado
  {
    id: 'evernote', label: 'Verde clássico',
    light: ['#00A82D', '#00c235', '#e5f6ea'], dark: ['#00c235', '#2fd35a', '#1c3323'],
    side: '#1a1a1a', sideDark: '#121212', brand: ['#00c235', '#008a25'],
    neutral: {
      light: { bg: '#ffffff', 'bg-2': '#f8f8f8', 'bg-3': '#f0f0f0', text: '#333333', 'text-2': '#595959', muted: '#a6a6a6', border: '#e6e6e6', 'on-accent': '#ffffff' },
      dark: { bg: '#1a1a1a', 'bg-2': '#212121', 'bg-3': '#2b2b2b', text: '#e6e6e6', 'text-2': '#bfbfbf', muted: '#8c8c8c', border: '#333333', 'on-accent': '#ffffff' },
      sideText: '#cccccc', sideActive: 'rgba(255, 255, 255, 0.12)',
    },
  },
  { id: 'indigo', label: 'Índigo', light: ['#4f46e5', '#6366f1', '#eef2ff'], dark: ['#818cf8', '#a5b4fc', '#24233f'], side: '#1e1b3a', sideDark: '#111118', brand: ['#6366f1', '#3730a3'] },
  { id: 'blue', label: 'Azul', light: ['#2563eb', '#3b82f6', '#eff6ff'], dark: ['#60a5fa', '#93c5fd', '#172338'], side: '#13213b', sideDark: '#0e131c', brand: ['#3b82f6', '#1d4ed8'] },
  { id: 'sky', label: 'Céu', light: ['#0284c7', '#0ea5e9', '#e0f2fe'], dark: ['#38bdf8', '#7dd3fc', '#132a36'], side: '#0c2533', sideDark: '#0c1418', brand: ['#0ea5e9', '#0369a1'] },
  { id: 'teal', label: 'Turquesa', light: ['#0d9488', '#14b8a6', '#ccfbf1'], dark: ['#2dd4bf', '#5eead4', '#11302d'], side: '#0f2a28', sideDark: '#0c1615', brand: ['#14b8a6', '#0f766e'] },
  { id: 'green', label: 'Verde', light: ['#16a34a', '#22c55e', '#dcfce7'], dark: ['#4ade80', '#86efac', '#14301f'], side: '#132a1c', sideDark: '#0d1610', brand: ['#22c55e', '#15803d'] },
  { id: 'amber', label: 'Âmbar', light: ['#b45309', '#d97706', '#fef3c7'], dark: ['#fbbf24', '#fcd34d', '#33280f'], side: '#2b2110', sideDark: '#17130b', brand: ['#f59e0b', '#b45309'] },
  { id: 'orange', label: 'Laranja', light: ['#ea580c', '#f97316', '#ffedd5'], dark: ['#fb923c', '#fdba74', '#35220f'], side: '#2e1b10', sideDark: '#18100b', brand: ['#f97316', '#c2410c'] },
  { id: 'red', label: 'Vermelho', light: ['#dc2626', '#ef4444', '#fee2e2'], dark: ['#f87171', '#fca5a5', '#361a1a'], side: '#2d1515', sideDark: '#180e0e', brand: ['#ef4444', '#b91c1c'] },
  { id: 'bordeaux', label: 'Bordéus', light: ['#9f1239', '#be123c', '#ffe4e6'], dark: ['#fb7185', '#fda4af', '#341820'], side: '#2a1018', sideDark: '#170c10', brand: ['#be123c', '#881337'] },
  { id: 'pink', label: 'Rosa', light: ['#db2777', '#ec4899', '#fce7f3'], dark: ['#f472b6', '#f9a8d4', '#361a2a'], side: '#2d1424', sideDark: '#170d13', brand: ['#ec4899', '#be185d'] },
  { id: 'purple', label: 'Roxo', light: ['#7c3aed', '#8b5cf6', '#ede9fe'], dark: ['#a78bfa', '#c4b5fd', '#2a2140'], side: '#23173d', sideDark: '#120f1b', brand: ['#8b5cf6', '#6d28d9'] },
  { id: 'graphite', label: 'Grafite', light: ['#374151', '#4b5563', '#f3f4f6'], dark: ['#d1d5db', '#e5e7eb', '#26272b'], side: '#18191c', sideDark: '#0f0f11', brand: ['#4b5563', '#1f2937'] },
];

export const SIDEBAR_STYLES: { id: string; label: string }[] = [
  { id: 'dark', label: 'Escura' },
  { id: 'color', label: 'Colorida' },
  { id: 'black', label: 'Preta' },
  { id: 'light', label: 'Clara' },
];

function css(): string {
  let out = '';
  for (const a of ACCENTS) {
    const sel = `:root[data-accent='${a.id}']`;
    const vars = (o?: Record<string, string>) => (o ? Object.entries(o).map(([k, v]) => `--${k}:${v};`).join('') : '');
    const sideExtra = a.neutral ? `--side-text:${a.neutral.sideText};--side-active:${a.neutral.sideActive};` : '';
    const light = `--accent:${a.light[0]};--accent-2:${a.light[1]};--accent-soft:${a.light[2]};--side:${a.side};--brand-a:${a.brand[0]};--brand-b:${a.brand[1]};` + vars(a.neutral?.light) + sideExtra;
    const dark = `--accent:${a.dark[0]};--accent-2:${a.dark[1]};--accent-soft:${a.dark[2]};--side:${a.sideDark};` + vars(a.neutral?.dark) + sideExtra;
    out += `${sel}{${light}}\n`;
    out += `${sel}[data-theme='dark']{${dark}}\n`;
    out += `@media (prefers-color-scheme: dark){${sel}:not([data-theme='light']){${dark}}}\n`;
  }
  return out;
}

function read<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem('fn:' + key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}

export const DEFAULT_ACCENT = 'evernote';

export function applyAccent(id = read<string>('accent', DEFAULT_ACCENT)) {
  const a = ACCENTS.find((x) => x.id === id) || ACCENTS[0];
  document.documentElement.dataset.accent = a.id;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', a.light[0]);
}

export function installThemes() {
  if (!document.getElementById('fn-themes')) {
    const st = document.createElement('style');
    st.id = 'fn-themes';
    st.textContent = css();
    document.head.appendChild(st);
  }
  applyAccent();
}
