// Corre dentro da página: recolhe título, seleção, artigo (modo leitura) e página simplificada.
(() => {
  const abs = (root) => {
    root.querySelectorAll('img').forEach((img) => {
      const lazy = img.getAttribute('data-src') || img.getAttribute('data-lazy-src') || img.getAttribute('data-original');
      const src = img.currentSrc || img.src || lazy;
      if (lazy && (!img.getAttribute('src') || /^data:/.test(img.getAttribute('src')))) img.setAttribute('src', lazy);
      try { if (src) img.setAttribute('src', new URL(img.getAttribute('src') || src, location.href).href); } catch {}
      img.removeAttribute('srcset'); img.removeAttribute('loading');
    });
    root.querySelectorAll('a[href]').forEach((a) => { try { a.setAttribute('href', new URL(a.getAttribute('href'), location.href).href); } catch {} });
    return root;
  };
  const strip = (root) => { root.querySelectorAll('script,style,noscript,iframe,svg,canvas,form,nav,footer,aside,header [role=navigation],[aria-hidden=true]').forEach((e) => e.remove()); return root; };
  const cap = (s) => (s && s.length > 2500000 ? s.slice(0, 2500000) : s || '');
  const meta = (n) => document.querySelector(`meta[name="${n}"],meta[property="${n}"]`)?.getAttribute('content') || '';
  const out = { url: location.href, title: (meta('og:title') || document.title || '').trim(), excerpt: (meta('og:description') || meta('description') || '').trim(), author: meta('author'), selection: '', article: '', articleTitle: '', full: '' };
  try {
    const sel = getSelection();
    if (sel && !sel.isCollapsed && sel.toString().trim()) {
      const box = document.createElement('div');
      for (let i = 0; i < sel.rangeCount; i++) box.appendChild(sel.getRangeAt(i).cloneContents());
      out.selection = cap(strip(abs(box)).innerHTML);
    }
  } catch {}
  try {
    const doc = document.cloneNode(true);
    abs(doc);
    const art = new Readability(doc).parse();
    if (art && art.content) { out.article = cap(art.content); out.articleTitle = (art.title || '').trim(); if (!out.excerpt) out.excerpt = (art.excerpt || '').trim(); if (!out.author) out.author = art.byline || ''; }
  } catch {}
  try {
    const body = document.body.cloneNode(true);
    out.full = cap(strip(abs(body)).innerHTML);
  } catch {}
  return out;
})();
