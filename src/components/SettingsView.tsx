import { useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, TABLE_TYPES, type SyncTable, type Note } from '../lib/db';
import { useNotebooks, useSettings, useLocalPref, useSyncStatus } from '../hooks';
import { setSetting, alive } from '../lib/store';
import { importEnex, exportEnex } from '../lib/enex';
import { download, relDate } from '../lib/util';
import { syncNow, resetLocalData } from '../lib/sync';
import { SUPPORT_URL } from './MenuBar';
import { ACCENTS, SIDEBAR_STYLES, applyAccent, DEFAULT_ACCENT } from '../lib/themes';
import { Icon, confirmDialog, toast } from '../ui';
import { syncTitle } from './Sidebar';
import { importStructure } from './stacks';
import { BackupsSection, PushSection, PasskeySection, PasswordSection, ClipperSection, PdfIndexButton } from './SettingsExtras';

export function SettingsView({ onLogout }: { onLogout: () => void }) {
  const notebooks = useNotebooks();
  const settings = useSettings();
  const [theme, setTheme] = useLocalPref<'system' | 'light' | 'dark'>('theme', 'system');
  const [fontSize, setFontSize] = useLocalPref<number>('fontSize', 16);
  const [sideTheme, setSideTheme] = useLocalPref<string>('sidebarTheme', 'dark');
  const [accent, setAccent] = useLocalPref<string>('accent', DEFAULT_ACCENT);
  const sync = useSyncStatus();
  const lastSync = useLiveQuery(() => db.meta.get('lastSyncAt'), []);
  const counts = useLiveQuery(async () => ({
    notes: alive(await db.notes.toArray()).filter((n) => !n.trashed).length,
    notebooks: alive(await db.notebooks.toArray()).length,
    tags: alive(await db.tags.toArray()).length,
    tasks: alive(await db.tasks.toArray()).length,
    files: alive(await db.files.toArray()).length,
    pending: (await db.uploads.count()) + (await Promise.all((Object.keys(TABLE_TYPES) as SyncTable[]).map((t) => (db[t] as any).where('dirty').equals(1).count()))).reduce((a: number, b: number) => a + b, 0),
  }), []);
  const enexInput = useRef<HTMLInputElement>(null);
  const jsonInput = useRef<HTMLInputElement>(null);
  const structInput = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<string>('');
  const [notif, setNotif] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'unsupported');

  const applyTheme = (t: typeof theme) => {
    setTheme(t);
    document.documentElement.dataset.theme = t === 'system' ? '' : t;
  };
  const applyFont = (n: number) => {
    setFontSize(n);
    document.documentElement.style.setProperty('--editor-font', n + 'px');
  };

  const exportAll = async () => {
    const notes = alive(await db.notes.toArray()).filter((n) => !n.trashed);
    setProgress('A preparar exportação…');
    download(`flynotes-${new Date().toISOString().slice(0, 10)}.enex`, await exportEnex(notes), 'application/xml');
    setProgress('');
  };
  const backupJson = async () => {
    const out: Record<string, any[]> = {};
    for (const t of Object.keys(TABLE_TYPES) as SyncTable[]) out[t] = alive(await (db[t] as any).toArray());
    download(`flynotes-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ app: 'FlyNotes', version: 1, exportedAt: Date.now(), data: out }), 'application/json');
  };
  const restoreJson = async (file: File) => {
    const data = JSON.parse(await file.text());
    if (data?.app !== 'FlyNotes') return toast('Ficheiro de cópia inválido');
    if (!(await confirmDialog('Restaurar esta cópia de segurança? Os itens existentes com o mesmo identificador são substituídos.', { ok: 'Restaurar' }))) return;
    let n = 0;
    for (const t of Object.keys(TABLE_TYPES) as SyncTable[]) {
      for (const row of data.data[t] || []) { await (db[t] as any).put({ ...row, dirty: 1, updatedAt: Date.now() }); n++; }
    }
    syncNow();
    toast(`${n} itens restaurados`);
  };

  return (
    <div className="page settings-page">
      <header className="page-head"><h1>Definições</h1></header>

      <section className="settings-card">
        <h3><Icon name="sync" size={16} /> Sincronização</h3>
        <p>{syncTitle(sync.status, lastSync?.value)}{sync.info ? ` — ${sync.info}` : ''}</p>
        {counts && <p className="muted">{counts.notes} notas · {counts.notebooks} cadernos · {counts.tags} etiquetas · {counts.tasks} tarefas · {counts.files} anexos{counts.pending ? ` · ${counts.pending} alterações por enviar` : ''}</p>}
        <div className="row gap wrap">
          <button className="btn" onClick={() => syncNow().then(() => toast('Sincronizado'))}><Icon name="sync" size={15} /> Sincronizar agora</button>
          <button className="btn" onClick={async () => { if (await confirmDialog('Apagar os dados guardados neste dispositivo e voltar a descarregar tudo do servidor? Alterações por enviar perdem-se.', { danger: true, ok: 'Repor' })) resetLocalData(); }}>Repor dados locais</button>
        </div>
      </section>

      <PushSection />
      <PasswordSection />
      <PasskeySection />
      <ClipperSection />
      <BackupsSection />

      <section className="settings-card">
        <h3><Icon name="sun" size={16} /> Aspeto</h3>
        <div className="seg">
          <button className={theme === 'system' ? 'on' : ''} onClick={() => applyTheme('system')}>Automático</button>
          <button className={theme === 'light' ? 'on' : ''} onClick={() => applyTheme('light')}>Claro</button>
          <button className={theme === 'dark' ? 'on' : ''} onClick={() => applyTheme('dark')}>Escuro</button>
        </div>
        <label className="field-label">Cor da aplicação</label>
        <div className="accent-grid" role="radiogroup" aria-label="Cor da aplicação">
          {ACCENTS.map((a) => (
            <button key={a.id} role="radio" aria-checked={accent === a.id} className={'accent-opt' + (accent === a.id ? ' on' : '')}
              onClick={() => { setAccent(a.id); applyAccent(a.id); }}>
              <span className="accent-dot" style={{ background: `linear-gradient(135deg, ${a.brand[0]}, ${a.brand[1]})` }}>{accent === a.id && <Icon name="check" size={15} />}</span>
              {a.label}
            </button>
          ))}
        </div>
        <label className="field-label">Barra lateral</label>
        <div className="seg">
          {SIDEBAR_STYLES.map((st) => (
            <button key={st.id} className={sideTheme === st.id ? 'on' : ''} onClick={() => setSideTheme(st.id)}>{st.label}</button>
          ))}
        </div>
        <label className="field-label">O seu nome (aparece no fundo da barra lateral)</label>
        <input className="input" defaultValue={settings.userName || ''} placeholder="Ex.: Maria" onBlur={(e) => setSetting('userName', e.target.value.trim())} />
        <label className="field-label">Tamanho do texto no editor: {fontSize}px</label>
        <input type="range" min={13} max={22} value={fontSize} onChange={(e) => applyFont(Number(e.target.value))} />
      </section>

      <section className="settings-card">
        <h3><Icon name="note" size={16} /> Notas</h3>
        <label className="field-label">Caderno predefinido</label>
        <select className="input" value={settings.defaultNotebookId || ''} onChange={(e) => setSetting('defaultNotebookId', e.target.value)}>
          {notebooks.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
        </select>
        <label className="check"><input type="checkbox" checked={settings.ocr !== false} onChange={(e) => setSetting('ocr', e.target.checked)} />
          Reconhecer texto em imagens e digitalizações (OCR), para as tornar pesquisáveis</label>
        <label className="check"><input type="checkbox" checked={notif === 'granted'} disabled={notif === 'unsupported' || notif === 'denied'}
          onChange={async () => setNotif(await Notification.requestPermission())} />
          Notificações de lembretes e tarefas {notif === 'denied' && <span className="muted">(bloqueadas no browser)</span>}</label>
      </section>

      <section className="settings-card">
        <h3><Icon name="upload" size={16} /> Importar e exportar</h3>
        <p className="muted">Importe ficheiros <strong>.enex</strong> exportados do Evernote (Ficheiro → Exportar notas). Cada ficheiro dá origem a um caderno.</p>
        <div className="row gap wrap">
          <button className="btn" onClick={() => enexInput.current?.click()}><Icon name="upload" size={15} /> Importar ENEX</button>
          <button className="btn" onClick={exportAll}><Icon name="download" size={15} /> Exportar tudo (ENEX)</button>
          <button className="btn" onClick={backupJson}><Icon name="download" size={15} /> Cópia de segurança (JSON)</button>
          <button className="btn" onClick={() => jsonInput.current?.click()}><Icon name="upload" size={15} /> Restaurar cópia</button>
          <button className="btn" onClick={() => structInput.current?.click()}><Icon name="stack" size={15} /> Importar estrutura de cadernos e stacks</button>
          <PdfIndexButton />
        </div>
        <p className="muted small">Dica: importe primeiro a estrutura de cadernos e stacks e depois os ficheiros .enex (com o mesmo nome de cada caderno). As notas vão parar ao caderno certo, dentro da stack certa.</p>
        <input ref={structInput} type="file" accept=".json,application/json" hidden onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          try { const r = await importStructure(f); toast(`${r.created} cadernos criados, ${r.updated} movidos para stacks`); }
          catch (err: any) { toast(err.message || 'Ficheiro inválido'); }
        }} />
        {progress && <p className="accent-text">{progress}</p>}
        <input ref={enexInput} type="file" accept=".enex,application/xml,text/xml" multiple hidden onChange={async (e) => {
          const files = Array.from(e.target.files || []);
          e.target.value = '';
          let total = 0;
          for (const f of files) {
            try {
              total += await importEnex(f, (p) => setProgress(`A importar ${f.name}: ${p.done}/${p.total}${p.current ? ' — ' + p.current : ''}`));
            } catch (err: any) {
              toast(`${f.name}: ${err.message}`);
            }
          }
          setProgress('');
          toast(`${total} notas importadas`);
        }} />
        <input ref={jsonInput} type="file" accept=".json,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) restoreJson(f); }} />
      </section>

      <section className="settings-card">
        <h3><Icon name="search" size={16} /> Sintaxe de pesquisa</h3>
        <table className="table compact">
          <tbody>
            {[
              ['reunião orçamento', 'Notas com as duas palavras'],
              ['"plano de ação"', 'Frase exata'],
              ['-rascunho  ·  -"versão antiga"', 'Excluir uma palavra / frase'],
              ['any: lisboa porto', 'Qualquer uma das palavras'],
              ['intitle:relatório  ·  -intitle:cópia', 'Com / sem palavra no título'],
              ['notebook:Hotéis  ·  caderno:Hotéis', 'Num caderno (ou stack)'],
              ['tag:urgente  ·  -tag:arquivo', 'Com / sem etiqueta (aceita *)'],
              ['todo:false  ·  todo:true  ·  todo:*', 'Com caixas por marcar / marcadas / quaisquer (como no Evernote)'],
              ['created:day-7  ·  updated:month', 'Criadas nos últimos 7 dias / atualizadas este mês'],
              ['created:2026-01-01  ·  -created:2026-01-01', 'Criadas desde / antes de uma data'],
              ['resource:image  ·  resource:application/pdf', 'Com imagens / PDFs'],
              ['reminder:true', 'Com lembrete'],
              ['source:booking.com', 'Recortadas de um site'],
            ].map(([a, b]) => <tr key={a}><td><code>{a}</code></td><td>{b}</td></tr>)}
          </tbody>
        </table>
      </section>

      <section className="settings-card">
        <h3><Icon name="type" size={16} /> Atalhos de teclado</h3>
        <table className="table compact">
          <tbody>
            {[
              ['Ctrl + Alt + N', 'Nova nota'],
              ['Ctrl + K  ·  /', 'Pesquisar'],
              ['Ctrl + B / I / U', 'Negrito / itálico / sublinhado'],
              ['Ctrl + Shift + 8 / 7 / 9', 'Lista com marcas / numerada / de verificação'],
              ['Tab / Shift + Tab', 'Aumentar / diminuir avanço em listas'],
              ['# , ## , ###  + espaço', 'Títulos (Markdown)'],
              ['[ ]  + espaço', 'Caixa de verificação'],
              ['Ctrl + clique numa ligação', 'Abrir ligação'],
            ].map(([a, b]) => <tr key={a}><td><kbd>{a}</kbd></td><td>{b}</td></tr>)}
          </tbody>
        </table>
      </section>

      <section className="settings-card">
        <h3><Icon name="logout" size={16} /> Conta</h3>
        <p className="muted">A FlyNotes é de utilizador único. Pode alterar a password na secção <b>Password</b>, acima.</p>
        <button className="btn danger" onClick={onLogout}><Icon name="logout" size={15} /> Terminar sessão</button>
      </section>
      <p className="muted center small">A FlyNotes é gratuita e de código aberto. <a href={SUPPORT_URL} target="_blank" rel="noopener noreferrer">Apoiar o desenvolvimento</a></p>
      <p className="muted center small">FlyNotes 1.0 · {lastSync?.value ? 'última sincronização ' + relDate(lastSync.value) : ''}</p>
    </div>
  );
}

export type { Note };
