// FlyNotes para computador (Windows, Mac, Linux): uma janela com a aplicação e, dentro dela,
// o mesmo servidor da instalação local, com a base de dados guardada na pasta de dados do utilizador.
import { app, BrowserWindow, Menu, dialog, shell, session, clipboard, nativeTheme } from 'electron';
import path from 'node:path';
import os from 'node:os';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import net from 'node:net';

const REPO = 'diogobsfsilva-glitch/flynotes';
const PORT = 47615; // fixo: os dados guardados no navegador interno ficam associados a este endereço
const userData = app.getPath('userData');
const envFile = path.join(userData, 'flynotes.env');
const prefsFile = path.join(userData, 'desktop.json');

type Prefs = { lan?: boolean; skipVersion?: string; bounds?: { width: number; height: number; x?: number; y?: number; maximized?: boolean } };
const readPrefs = (): Prefs => { try { return JSON.parse(readFileSync(prefsFile, 'utf8')); } catch { return {}; } };
const writePrefs = (p: Prefs) => { try { writeFileSync(prefsFile, JSON.stringify(p, null, 2)); } catch { /* sem permissão */ } };

let win: BrowserWindow | null = null;
let baseUrl = '';
let firstRun = false;

// Uma só cópia aberta: abrir de novo traz a janela existente para a frente
if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

function portFree(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.createServer().once('error', () => resolve(false)).once('listening', () => s.close(() => resolve(true)));
    s.listen(port, host);
  });
}

async function startBackend() {
  process.env.FLYNOTES_DATA_DIR = path.join(userData, 'data');
  delete process.env.DATABASE_URL; delete process.env.POSTGRES_URL; delete process.env.BLOB_READ_WRITE_TOKEN; delete process.env.VERCEL;
  const { loadConfig, startServer } = await import('../../server/app.js');
  ({ firstRun } = loadConfig(envFile));
  const prefs = readPrefs();
  const host = prefs.lan ? '0.0.0.0' : '127.0.0.1';
  let port = PORT;
  if (!(await portFree(port, host))) port = 0; // porta ocupada por outro programa: usa uma livre
  const server = await startServer({ port, host, webDir: path.join(__dirname, '..', 'web') });
  const real = (server.address() as net.AddressInfo).port;
  baseUrl = `http://127.0.0.1:${real}`;
  return real;
}

/** Entra automaticamente: a janela do computador não pede a password (só o telemóvel, se o acesso na rede estiver ligado). */
async function signIn() {
  const { sessionCookie } = await import('../../api/_lib/auth.js');
  const [pair] = sessionCookie().split(';');
  const [name, value] = pair.split('=');
  await session.defaultSession.cookies.set({ url: baseUrl, name, value, httpOnly: true, sameSite: 'lax', expirationDate: Date.now() / 1000 + 180 * 86400 });
}

function lanAddress() {
  return Object.values(os.networkInterfaces()).flat().find((i) => i && i.family === 'IPv4' && !i.internal)?.address;
}

function createWindow() {
  const prefs = readPrefs();
  const b = prefs.bounds || { width: 1280, height: 840 };
  win = new BrowserWindow({
    width: b.width, height: b.height, x: b.x, y: b.y,
    minWidth: 380, minHeight: 500,
    title: 'FlyNotes',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1a1a1a' : '#ffffff',
    autoHideMenuBar: process.platform !== 'darwin',
    show: false,
    icon: path.join(__dirname, '..', 'resources', 'icon.png'),
    webPreferences: { contextIsolation: true, sandbox: true, spellcheck: true },
  });
  if (prefs.bounds?.maximized) win.maximize();
  win.once('ready-to-show', () => win?.show());
  win.loadURL(baseUrl + '/');
  // Ligações externas abrem no navegador do sistema; as da própria app abrem numa janela nova
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(baseUrl)) return { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true, icon: path.join(__dirname, '..', 'resources', 'icon.png') } };
    if (/^(https?|mailto|tel):/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(baseUrl)) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); } });
  // Microfone (gravações e ditado) e câmara (fotografias): só para a própria app
  session.defaultSession.setPermissionRequestHandler((wc, permission, cb) => cb(wc.getURL().startsWith(baseUrl) && ['media', 'notifications', 'clipboard-read', 'clipboard-sanitized-write', 'fullscreen'].includes(permission)));
  win.on('close', () => {
    if (!win) return;
    const p = readPrefs();
    p.bounds = { ...win.getNormalBounds(), maximized: win.isMaximized() };
    writePrefs(p);
  });
  win.on('closed', () => { win = null; });
}

function buildMenu() {
  const prefs = readPrefs();
  const isMac = process.platform === 'darwin';
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: 'appMenu' as const }] : []),
    { label: 'Ficheiro', submenu: [isMac ? { role: 'close', label: 'Fechar janela' } : { role: 'quit', label: 'Sair' }] },
    { label: 'Editar', submenu: [
      { role: 'undo', label: 'Anular' }, { role: 'redo', label: 'Refazer' }, { type: 'separator' },
      { role: 'cut', label: 'Cortar' }, { role: 'copy', label: 'Copiar' }, { role: 'paste', label: 'Colar' }, { role: 'selectAll', label: 'Selecionar tudo' },
    ] },
    { label: 'Ver', submenu: [
      { role: 'reload', label: 'Recarregar' }, { type: 'separator' },
      { role: 'zoomIn', label: 'Aumentar' }, { role: 'zoomOut', label: 'Diminuir' }, { role: 'resetZoom', label: 'Tamanho normal' },
      { type: 'separator' }, { role: 'togglefullscreen', label: 'Ecrã inteiro' },
    ] },
    { label: 'Telemóvel', submenu: [
      { label: 'Permitir acesso a partir do telemóvel (mesma rede Wi-Fi)', type: 'checkbox', checked: !!prefs.lan, click: (item) => toggleLan(item.checked) },
      { label: 'Como ligar o telemóvel…', click: showPhoneInfo },
    ] },
    { label: 'Ajuda', submenu: [
      { label: 'Abrir a pasta dos dados', click: () => shell.openPath(userData) },
      { label: 'Procurar atualizações', click: () => checkUpdates(true) },
      { label: 'Guia de instalação e ajuda', click: () => shell.openExternal(`https://github.com/${REPO}/blob/main/docs/INSTALAR.md`) },
      { label: 'Apoiar a FlyNotes (Ko-fi)', click: () => shell.openExternal('https://ko-fi.com/dfs78035') },
      { type: 'separator' },
      { label: 'Ferramentas de programador', role: 'toggleDevTools' },
      { label: `Versão ${app.getVersion()}`, enabled: false },
    ] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function toggleLan(on: boolean) {
  const p = readPrefs(); p.lan = on; writePrefs(p);
  const r = await dialog.showMessageBox(win!, {
    type: 'info', buttons: ['Reiniciar agora', 'Mais tarde'], defaultId: 0,
    message: on ? 'Acesso a partir do telemóvel ligado' : 'Acesso a partir do telemóvel desligado',
    detail: on ? 'Depois de reiniciar, o telemóvel pode abrir a FlyNotes enquanto estiver na mesma rede Wi-Fi e esta janela estiver aberta. Use o menu Telemóvel → Como ligar o telemóvel.' : 'Depois de reiniciar, só este computador acede à FlyNotes.',
  });
  if (r.response === 0) { app.relaunch(); app.exit(0); }
}

async function showPhoneInfo() {
  const prefs = readPrefs();
  const ip = lanAddress();
  const port = new URL(baseUrl).port;
  if (!prefs.lan) {
    const r = await dialog.showMessageBox(win!, { type: 'info', buttons: ['Ligar agora', 'Cancelar'], message: 'O acesso a partir do telemóvel está desligado', detail: 'Ligue-o para abrir a FlyNotes no telemóvel quando estiver na mesma rede Wi-Fi que este computador.' });
    if (r.response === 0) toggleLan(true);
    return;
  }
  const url = ip ? `http://${ip}:${port}` : '(sem rede)';
  const r = await dialog.showMessageBox(win!, {
    type: 'info', buttons: ['Copiar endereço', 'Copiar password', 'Fechar'], defaultId: 2,
    message: 'Abrir a FlyNotes no telemóvel',
    detail: `1. Ligue o telemóvel à mesma rede Wi-Fi.\n2. No navegador do telemóvel, abra:\n     ${url}\n3. Entre com a password:\n     ${process.env.FLYNOTES_PASSWORD}\n   (ou a que escolheu em Definições → Password, se a mudou)\n\nSó funciona com esta janela aberta. Para ter a FlyNotes no telemóvel em qualquer lugar, use a instalação na nuvem (ver Ajuda → Guia de instalação).`,
  });
  if (r.response === 0) clipboard.writeText(url);
  if (r.response === 1) clipboard.writeText(process.env.FLYNOTES_PASSWORD || '');
}

/** Avisa quando há uma versão nova no GitHub (sem a descarregar sozinha). */
async function checkUpdates(manual: boolean) {
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { accept: 'application/vnd.github+json', 'user-agent': 'FlyNotes-Desktop' } });
    if (!r.ok) throw new Error(String(r.status));
    const rel = await r.json() as { tag_name: string; html_url: string };
    const latest = String(rel.tag_name || '').replace(/^v/, '');
    const newer = latest.split('.').map(Number).some((n, i, a) => {
      const cur = app.getVersion().split('.').map(Number);
      for (let k = 0; k < Math.max(a.length, cur.length); k++) { if ((a[k] || 0) !== (cur[k] || 0)) return (a[k] || 0) > (cur[k] || 0); }
      return false;
    });
    const prefs = readPrefs();
    if (!newer) { if (manual) dialog.showMessageBox(win!, { type: 'info', message: 'Tem a versão mais recente', detail: `FlyNotes ${app.getVersion()}` }); return; }
    if (!manual && prefs.skipVersion === latest) return;
    const res = await dialog.showMessageBox(win!, {
      type: 'info', buttons: ['Descarregar', 'Mais tarde', 'Ignorar esta versão'], defaultId: 0, cancelId: 1,
      message: `Está disponível a FlyNotes ${latest}`,
      detail: `Tem a versão ${app.getVersion()}. Descarregue e instale a nova por cima desta; as suas notas mantêm-se.`,
    });
    if (res.response === 0) shell.openExternal(rel.html_url);
    if (res.response === 2) writePrefs({ ...prefs, skipVersion: latest });
  } catch {
    if (manual) dialog.showMessageBox(win!, { type: 'warning', message: 'Não foi possível procurar atualizações', detail: 'Verifique a ligação à internet e tente de novo.' });
  }
}

app.whenReady().then(async () => {
  try {
    await startBackend();
    await signIn();
  } catch (e: any) {
    dialog.showErrorBox('A FlyNotes não conseguiu arrancar', `${e?.message || e}\n\nOs seus dados estão em:\n${userData}`);
    app.exit(1);
    return;
  }
  buildMenu();
  createWindow();
  if (firstRun) {
    win!.webContents.once('did-finish-load', () => dialog.showMessageBox(win!, {
      type: 'info', message: 'Bem-vindo à FlyNotes',
      detail: `As suas notas ficam guardadas neste computador, em:\n${userData}\n\nNeste computador entra sem password. A password abaixo só é precisa para abrir a FlyNotes no telemóvel (menu Telemóvel):\n\n${process.env.FLYNOTES_PASSWORD}\n\nPode mudá-la em Definições → Password.`,
    }));
  }
  setTimeout(() => checkUpdates(false), 8000);
  app.on('activate', () => { if (!win) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
