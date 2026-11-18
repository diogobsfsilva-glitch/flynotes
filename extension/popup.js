// FlyNotes Web Clipper — janela da extensão.
const $ = (id) => document.getElementById(id);
const show = (id) => { for (const s of ['setup', 'clip', 'done', 'loading']) $(s).hidden = s !== id; };
const HINTS = {
  article: 'O texto principal da página, sem menus nem publicidade.',
  full: 'Todo o conteúdo da página, simplificado.',
  selection: 'Apenas o texto que selecionou na página.',
  bookmark: 'Só o endereço, o título e um resumo.',
  screenshot: 'Uma imagem do que está visível no ecrã.',
};
// Página de testes: popup.html?tab=<id> usa esse separador em vez do ativo
const forcedTab = Number(new URLSearchParams(location.search).get('tab')) || null;

let cfg = null; // { server, token }
let page = null; // dados extraídos da página
let tab = null;

function parseCode(raw) {
  const s = String(raw || '').trim().replace(/\s+/g, '');
  const m = s.match(/^(https?:\/\/[^#]+?)\/?#(fnc_[A-Za-z0-9]+\.[A-Za-z0-9_-]+)$/);
  return m ? { server: m[1], token: m[2] } : null;
}

async function api(path, init = {}) {
  let r;
  try {
    r = await fetch(cfg.server + path, { ...init, headers: { authorization: 'Bearer ' + cfg.token, ...(init.body ? { 'content-type': 'application/json' } : {}) } });
  } catch {
    throw new Error('Sem ligação à FlyNotes. Verifique a internet e tente de novo.');
  }
  const data = await r.json().catch(() => ({}));
  if (r.status === 401) { const e = new Error('O código de ligação já não é válido. Gere um novo nas Definições da FlyNotes.'); e.auth = true; throw e; }
  if (!r.ok) throw new Error(data.error || `A FlyNotes respondeu com um erro (${r.status}).`);
  return data;
}

function showSetup(message) {
  $('code').value = '';
  $('setup-err').hidden = !message;
  $('setup-err').textContent = message || '';
  $('disconnect').hidden = !cfg;
  $('cancel-setup').hidden = !cfg;
  show('setup');
  $('code').focus();
}

async function connect() {
  const parsed = parseCode($('code').value);
  if (!parsed) { $('setup-err').hidden = false; $('setup-err').textContent = 'Código inválido. Copie o código completo das Definições da FlyNotes (começa por https://).'; return; }
  const prev = cfg;
  cfg = parsed;
  $('connect').disabled = true;
  try {
    await api('/api/clipper');
    await chrome.storage.local.set({ flynotes: cfg });
    await startClip();
  } catch (e) {
    cfg = prev;
    $('setup-err').hidden = false;
    $('setup-err').textContent = e.message;
  } finally {
    $('connect').disabled = false;
  }
}

async function getTab() {
  if (forcedTab) return chrome.tabs.get(forcedTab);
  const [t] = await chrome.tabs.query({ active: true, currentWindow: true });
  return t;
}

async function startClip() {
  show('loading');
  tab = await getTab();
  // 1) cadernos e etiquetas
  let meta;
  try { meta = await api('/api/clipper'); }
  catch (e) { if (e.auth) { cfg = null; await chrome.storage.local.remove('flynotes'); } return showSetup(e.message); }
  // 2) conteúdo da página
  page = { url: tab?.url || '', title: tab?.title || '', excerpt: '', selection: '', article: '', full: '' };
  let restricted = !/^https?:/.test(page.url);
  if (!restricted) {
    try {
      const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['Readability.js', 'extract.js'] });
      if (res?.result) page = { ...page, ...res.result };
    } catch { restricted = true; }
  }
  // 3) formulário
  $('title').value = page.articleTitle || page.title || page.url;
  const sel = $('notebook');
  sel.innerHTML = '';
  let group = null, groupName = null;
  for (const nb of meta.notebooks) {
    const o = new Option(nb.name, nb.id);
    if (nb.stack) {
      if (groupName !== nb.stack) { group = document.createElement('optgroup'); group.label = nb.stack; sel.append(group); groupName = nb.stack; }
      group.append(o);
    } else sel.append(o);
  }
  const { lastNotebook, lastMode } = await chrome.storage.local.get(['lastNotebook', 'lastMode']);
  sel.value = meta.notebooks.some((n) => n.id === lastNotebook) ? lastNotebook : meta.defaultNotebookId || '';
  $('taglist').innerHTML = '';
  for (const t of meta.tags) $('taglist').append(new Option(t));
  const can = { article: !!page.article, full: !!page.full, selection: !!page.selection, bookmark: /^https?:/.test(page.url), screenshot: !forcedTab };
  for (const r of document.querySelectorAll('input[name=mode]')) r.disabled = !can[r.value];
  // Com texto selecionado, propõe "Seleção"; senão o último modo usado (se possível), senão o primeiro disponível
  const pick = (can.selection && 'selection') || (can[lastMode] && lastMode !== 'selection' && lastMode) || ['article', 'full', 'bookmark', 'screenshot'].find((m) => can[m]);
  if (!pick) { $('clip-err').hidden = false; $('clip-err').textContent = 'Esta página não pode ser guardada (página interna do navegador).'; $('save').disabled = true; }
  else setMode(pick);
  if (restricted && pick) { $('clip-err').hidden = false; $('clip-err').textContent = 'O navegador não permite ler o conteúdo desta página. Pode guardar uma captura de ecrã' + (can.bookmark ? ' ou um marcador.' : '.'); }
  show('clip');
  $('title').focus();
  $('title').select();
}

function setMode(m) {
  const r = document.querySelector(`input[name=mode][value=${m}]`);
  if (r) r.checked = true;
  $('mode-hint').textContent = HINTS[m] || '';
}
const mode = () => document.querySelector('input[name=mode]:checked')?.value;

async function save() {
  const m = mode();
  if (!m) return;
  $('clip-err').hidden = true;
  $('save').disabled = true;
  $('save').textContent = 'A guardar…';
  try {
    const body = {
      mode: m,
      url: page.url,
      title: $('title').value.trim() || page.title,
      notebookId: $('notebook').value,
      tags: $('tags').value.split(',').map((t) => t.trim()).filter(Boolean),
      comment: $('comment').value,
      excerpt: page.excerpt,
      author: page.author,
    };
    if (m === 'article') body.html = page.article;
    if (m === 'full') body.html = page.full;
    if (m === 'selection') body.html = page.selection;
    if (m === 'screenshot') body.screenshot = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 85 });
    const res = await api('/api/clipper', { method: 'POST', body: JSON.stringify(body) });
    await chrome.storage.local.set({ lastNotebook: body.notebookId, lastMode: m });
    $('done-title').textContent = res.title || body.title;
    $('open').href = cfg.server + '/#/note/' + res.id;
    show('done');
    $('open').focus();
  } catch (e) {
    if (e.auth) { cfg = null; await chrome.storage.local.remove('flynotes'); return showSetup(e.message); }
    $('clip-err').hidden = false;
    $('clip-err').textContent = e.message + ' A página não foi guardada.';
  } finally {
    $('save').disabled = false;
    $('save').textContent = 'Guardar na FlyNotes';
  }
}

document.addEventListener('change', (e) => { if (e.target.name === 'mode') $('mode-hint').textContent = HINTS[e.target.value] || ''; });
$('connect').onclick = connect;
$('save').onclick = save;
$('close').onclick = () => window.close();
$('gear').onclick = () => showSetup('');
$('cancel-setup').onclick = () => startClip();
$('disconnect').onclick = async () => { cfg = null; await chrome.storage.local.remove('flynotes'); showSetup(''); };
document.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !$('clip').hidden) save(); });

(async () => {
  const st = await chrome.storage.local.get('flynotes');
  cfg = st.flynotes || null;
  if (!cfg) showSetup('');
  else await startClip();
})();
