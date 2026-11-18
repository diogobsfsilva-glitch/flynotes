// Visualizador de ficheiros dentro da app (PDF e imagens), com botão de fechar.
// Necessário no telemóvel: a app instalada abre os ficheiros na mesma janela, que não tem botão de voltar.
import { fileUrl } from './files';

/** `url` permite abrir imagens que não são anexos da FlyNotes (ex.: de páginas recortadas). */
export interface ViewFile { id: string; name: string; mime: string; url?: string }
const urlOf = (f: ViewFile) => f.url || fileUrl(f.id);

/** Telemóvel/tablet ou app instalada: os ficheiros abrem no visualizador em vez de num novo separador. */
export function prefersInAppViewer(): boolean {
  return matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true ||
    matchMedia('(pointer: coarse)').matches || matchMedia('(max-width: 820px)').matches;
}

/** Partilhar/guardar o ficheiro (folha de partilha do sistema no telemóvel; transferência no computador). */
export async function shareOrDownload(f: ViewFile) {
  const url = urlOf(f);
  try {
    const nav = navigator as any;
    if (nav.share && nav.canShare) {
      const blob = await (await fetch(url)).blob();
      const type = blob.type || f.mime;
      // Garante uma extensão no nome (as imagens das notas usam a legenda como nome)
      const ext = (type.split('/')[1] || '').replace('jpeg', 'jpg').replace(/[^a-z0-9]/gi, '');
      const fname = /\.[a-z0-9]{2,5}$/i.test(f.name) || !ext ? f.name : `${f.name}.${ext}`;
      const file = new File([blob], fname, { type });
      if (nav.canShare({ files: [file] })) { await nav.share({ files: [file], title: f.name }); return; }
    }
  } catch (e: any) {
    if (e?.name === 'AbortError') return; // o utilizador cancelou
  }
  const a = document.createElement('a');
  a.href = f.url ? url : `${url}&download=1&name=${encodeURIComponent(f.name)}`;
  if (f.url) { a.target = '_blank'; a.rel = 'noopener'; }
  a.download = f.name;
  document.body.append(a);
  a.click();
  a.remove();
}

let closeCurrent: (() => void) | null = null;

export function openFileViewer(f: ViewFile) {
  closeCurrent?.();
  const prevFocus = document.activeElement as HTMLElement | null;
  const el = document.createElement('div');
  el.className = 'fv';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', f.name);
  el.innerHTML = `
    <div class="fv-bar">
      <button type="button" class="fv-close" aria-label="Fechar"><span aria-hidden="true">‹</span> Fechar</button>
      <div class="fv-title"></div>
      <span class="fv-pages" aria-live="polite"></span>
      <button type="button" class="fv-share" aria-label="Partilhar ou guardar o ficheiro" title="Partilhar ou guardar">⬆</button>
    </div>
    <div class="fv-body" tabindex="0"><p class="fv-msg">A abrir…</p></div>`;
  (el.querySelector('.fv-title') as HTMLElement).textContent = f.name;
  const body = el.querySelector('.fv-body') as HTMLElement;
  const pages = el.querySelector('.fv-pages') as HTMLElement;
  let closed = false;
  let task: any = null;
  let pushed = false;

  const close = (fromHistory = false) => {
    if (closed) return;
    closed = true;
    closeCurrent = null;
    window.removeEventListener('popstate', onPop);
    document.removeEventListener('keydown', onKey, true);
    try { task?.destroy(); } catch { /* já terminado */ }
    el.remove();
    document.documentElement.classList.remove('fv-open');
    if (pushed && !fromHistory) history.back(); // retira a entrada criada para o botão «voltar»
    prevFocus?.focus?.();
  };
  const onPop = () => close(true);
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } };
  closeCurrent = () => close();

  (el.querySelector('.fv-close') as HTMLElement).onclick = () => close();
  (el.querySelector('.fv-share') as HTMLElement).onclick = () => shareOrDownload(f);
  document.body.append(el);
  document.documentElement.classList.add('fv-open');
  // O botão/gesto «voltar» do telemóvel fecha o visualizador em vez de sair da nota
  try { history.pushState({ fv: 1 }, '', location.href); pushed = true; } catch { /* sem histórico */ }
  window.addEventListener('popstate', onPop);
  document.addEventListener('keydown', onKey, true);
  (el.querySelector('.fv-close') as HTMLElement).focus();

  const fail = (msg: string) => {
    if (closed) return;
    body.innerHTML = '';
    const p = document.createElement('p');
    p.className = 'fv-msg';
    p.textContent = msg;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn primary';
    b.textContent = 'Partilhar ou guardar o ficheiro';
    b.onclick = () => shareOrDownload(f);
    body.append(p, b);
  };

  if (f.mime.startsWith('image/')) {
    const img = document.createElement('img');
    img.className = 'fv-img';
    img.alt = f.name;
    img.onload = () => { body.querySelector('.fv-msg')?.remove(); };
    img.onerror = () => fail('Não foi possível abrir a imagem.');
    img.src = urlOf(f);
    body.append(img);
  } else if (f.mime === 'application/pdf') {
    renderPdf().catch(() => fail('Não foi possível abrir o PDF aqui. Pode abri-lo noutra aplicação.'));
  } else {
    fail('Este tipo de ficheiro não pode ser mostrado aqui.');
  }

  async function renderPdf() {
    const { pdfjs } = await import('./pdfText');
    const lib = await pdfjs();
    const data = new Uint8Array(await (await fetch(fileUrl(f.id))).arrayBuffer());
    if (closed) return;
    task = lib.getDocument({ data, isEvalSupported: false });
    const doc = await task.promise;
    if (closed) return;
    body.innerHTML = '';
    const total = doc.numPages;
    pages.textContent = `${total} pág.`;
    const width = Math.min(body.clientWidth - 16, 1100);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    // Molduras com o tamanho certo desde o início; cada página é desenhada quando se aproxima do ecrã
    const first = await doc.getPage(1);
    const ratio = first.getViewport({ scale: 1 });
    const holders: HTMLElement[] = [];
    for (let i = 1; i <= total; i++) {
      const h = document.createElement('div');
      h.className = 'fv-page';
      h.style.width = width + 'px';
      h.style.height = Math.round((width * ratio.height) / ratio.width) + 'px';
      h.dataset.page = String(i);
      body.append(h);
      holders.push(h);
    }
    const draw = async (h: HTMLElement) => {
      if (h.dataset.done || closed) return;
      h.dataset.done = '1';
      const page = await doc.getPage(Number(h.dataset.page));
      const base = page.getViewport({ scale: 1 });
      const vp = page.getViewport({ scale: (width / base.width) * dpr });
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(vp.width);
      canvas.height = Math.floor(vp.height);
      h.style.height = Math.round(vp.height / dpr) + 'px';
      await page.render({ canvasContext: canvas.getContext('2d')!, viewport: vp, canvas } as any).promise;
      if (!closed) h.append(canvas);
    };
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        draw(e.target as HTMLElement).catch(() => {});
      }
    }, { root: body, rootMargin: '800px 0px' });
    holders.forEach((h) => io.observe(h));
    // Contador: a página que ocupa o meio do ecrã
    const count = () => {
      const mid = body.scrollTop + body.clientHeight / 2;
      const cur = holders.find((h) => h.offsetTop + h.offsetHeight >= mid) || holders[holders.length - 1];
      pages.textContent = `${cur.dataset.page} / ${total}`;
    };
    body.addEventListener('scroll', count, { passive: true });
    count();
  }
}
