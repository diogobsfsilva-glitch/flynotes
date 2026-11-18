// Definições: cópias de segurança, notificações push e chaves de acesso (Face ID).
import { useEffect, useState } from 'react';
import { Icon, confirmDialog, toast } from '../ui';
import { formatBytes, relDate } from '../lib/util';
import { enablePush, disablePush, testPush, currentSubscription, pushSupported, isIOS, isStandalone } from '../lib/pushClient';
import { registerPasskey, passkeyStatus, deletePasskey, passkeysSupported, deviceName } from '../lib/passkeys';
import { syncNow } from '../lib/sync';
import { indexPendingPdfs } from '../lib/pdfText';

export function BackupsSection() {
  const [list, setList] = useState<{ pathname: string; size: number; uploadedAt: number }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const load = () => fetch('/api/backup').then((r) => r.json()).then((d) => setList(d.backups || [])).catch(() => setList([]));
  useEffect(() => { load(); }, []);
  const label = (p: string) => (p.includes('antes-de-restaurar') ? 'Antes de restaurar' : p.includes('manual') ? 'Manual' : 'Automática');
  return (
    <section className="settings-card">
      <h3><Icon name="history" size={16} /> Cópias de segurança</h3>
      <p className="muted">Todos os dias de manhã é feita uma cópia completa das notas, cadernos, tarefas e eventos, guardada no seu armazenamento privado. São mantidas as 30 mais recentes. Os anexos de notas eliminadas são guardados durante 35 dias, para que restaurar uma cópia os traga de volta.</p>
      <div className="row gap wrap">
        <button className="btn" disabled={busy} onClick={async () => {
          setBusy(true);
          try { const r = await (await fetch('/api/backup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'create' }) })).json(); if (r.error) throw new Error(r.error); toast(`Cópia criada (${r.count} itens)`); load(); }
          catch (e: any) { toast(e.message); } finally { setBusy(false); }
        }}><Icon name="download" size={15} /> Criar cópia agora</button>
      </div>
      {list === null ? <p className="muted">A carregar…</p> : !list.length ? <p className="muted">Ainda não há cópias. A primeira automática é feita amanhã de manhã.</p> : (
        <table className="table compact">
          <thead><tr><th>Data</th><th>Tipo</th><th className="hide-sm">Tamanho</th><th /></tr></thead>
          <tbody>
            {list.slice(0, 30).map((b) => (
              <tr key={b.pathname}>
                <td>{new Date(b.uploadedAt).toLocaleString('pt-PT', { dateStyle: 'medium', timeStyle: 'short' })}</td>
                <td className="muted">{label(b.pathname)}</td>
                <td className="muted hide-sm">{formatBytes(b.size)}</td>
                <td className="actions nowrap">
                  <a className="icon-btn small" title="Descarregar" href={`/api/backup?download=${encodeURIComponent(b.pathname)}`}><Icon name="download" size={14} /></a>
                  <button className="btn small" disabled={busy} onClick={async () => {
                    if (!(await confirmDialog(`Repor tudo como estava em ${new Date(b.uploadedAt).toLocaleString('pt-PT')}? O que foi criado depois vai para fora, mas é feita antes uma cópia do estado atual, por isso pode voltar atrás.`, { danger: true, ok: 'Restaurar' }))) return;
                    setBusy(true);
                    try {
                      const r = await (await fetch('/api/backup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'restore', name: b.pathname }) })).json();
                      if (r.error) throw new Error(r.error);
                      toast(`Restaurado: ${r.restored} itens repostos, ${r.removed} retirados`);
                      await syncNow();
                      load();
                    } catch (e: any) { toast(e.message); } finally { setBusy(false); }
                  }}>Restaurar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export function PushSection() {
  const [on, setOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { currentSubscription().then((s) => setOn(!!s)).catch(() => setOn(false)); }, []);
  return (
    <section className="settings-card">
      <h3><Icon name="bell" size={16} /> Notificações neste dispositivo</h3>
      <p className="muted">Recebe os lembretes de notas, tarefas e eventos mesmo com a FlyNotes fechada, e um resumo do dia de manhã.</p>
      {isIOS() && !isStandalone() && <p className="banner-inline">📱 No iPhone, instale primeiro a FlyNotes no ecrã principal (Partilhar → Adicionar ao ecrã principal) e ative as notificações a partir do ícone.</p>}
      {!pushSupported() ? <p className="muted">Este browser não suporta notificações push.</p> : (
        <div className="row gap wrap">
          {on ? <>
            <span className="accent-text"><Icon name="check" size={15} /> Ativas neste dispositivo</span>
            <button className="btn" disabled={busy} onClick={async () => { setBusy(true); const n = await testPush().catch(() => 0); toast(n ? 'Notificação de teste enviada' : 'Não foi possível enviar'); setBusy(false); }}>Enviar teste</button>
            <button className="btn" disabled={busy} onClick={async () => { setBusy(true); await disablePush(); setOn(false); setBusy(false); }}>Desativar</button>
          </> : (
            <button className="btn primary" disabled={busy} onClick={async () => {
              setBusy(true);
              try { await enablePush(); setOn(true); toast('Notificações ativadas'); } catch (e: any) { toast(e.message, undefined, 8000); } finally { setBusy(false); }
            }}><Icon name="bell" size={15} /> Ativar notificações</button>
          )}
        </div>
      )}
    </section>
  );
}

/** Web Clipper: extensão para Chrome/Edge que guarda páginas na FlyNotes. */
export function ClipperSection() {
  const [tokens, setTokens] = useState<{ id: string; name: string; createdAt: number; lastUsedAt?: number }[]>([]);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const load = () => fetch('/api/clipper?tokens=1').then((r) => r.json()).then((j) => setTokens(j.tokens || [])).catch(() => {});
  useEffect(() => { load(); }, []);
  const create = async () => {
    setBusy(true);
    try {
      const ua = navigator.userAgent;
      const name = `${/Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : 'Navegador'} · ${new Date().toLocaleDateString('pt-PT')}`;
      const r = await fetch('/api/clipper', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'token', name }) });
      const j = await r.json();
      if (!r.ok) return toast(j.error || 'Não foi possível gerar o código');
      setCode(`${location.origin}#${j.token}`);
      load();
    } catch { toast('Sem ligação ao servidor'); } finally { setBusy(false); }
  };
  const copy = async () => { try { await navigator.clipboard.writeText(code); toast('Código copiado'); } catch { toast('Selecione o código e copie com Ctrl+C'); } };
  const revoke = async (id: string) => {
    if (!(await confirmDialog('Revogar este código? O navegador que o usa deixa de poder guardar páginas.', { danger: true, ok: 'Revogar' }))) return;
    await fetch('/api/clipper', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'revoke', id }) });
    load();
  };
  return (
    <section className="settings-card">
      <h3><Icon name="globe" size={16} /> Web Clipper (extensão para Chrome e Edge)</h3>
      <p className="muted">Um botão na barra do navegador para guardar artigos, páginas, seleções de texto, marcadores e capturas de ecrã diretamente nas suas notas.</p>
      <ol className="clipper-steps">
        <li><a className="btn" href="/flynotes-clipper.zip" download><Icon name="download" size={15} /> Descarregar a extensão</a> e extrair o ficheiro .zip para uma pasta.</li>
        <li>No navegador, abrir <code>chrome://extensions</code> (no Edge: <code>edge://extensions</code>), ligar o <b>Modo de programador</b> e escolher <b>Carregar expandida</b> / <b>Carregar descompactada</b>, indicando essa pasta.</li>
        <li>Gerar aqui um código de ligação e colá-lo na extensão.</li>
      </ol>
      <button className="btn primary" onClick={create} disabled={busy}>{busy ? 'A gerar…' : 'Gerar código de ligação'}</button>
      {code && (
        <div className="clipper-code">
          <p><b>Copie este código agora</b> — por segurança, não volta a ser mostrado.</p>
          <textarea className="input" readOnly rows={3} value={code} onFocus={(e) => e.currentTarget.select()} aria-label="Código de ligação" />
          <button className="btn" onClick={copy}><Icon name="copy" size={15} /> Copiar código</button>
        </div>
      )}
      {tokens.length > 0 && (
        <table className="table compact">
          <thead><tr><th>Navegador ligado</th><th>Criado</th><th>Último uso</th><th></th></tr></thead>
          <tbody>
            {tokens.map((t) => (
              <tr key={t.id}>
                <td>{t.name}</td>
                <td>{new Date(t.createdAt).toLocaleDateString('pt-PT')}</td>
                <td>{t.lastUsedAt ? relDate(t.lastUsedAt) : 'nunca'}</td>
                <td><button className="btn small" onClick={() => revoke(t.id)}>Revogar</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

/** Alterar a password de acesso. */
export function PasswordSection() {
  const [open, setOpen] = useState(false);
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const mismatch = !!again && again !== next;
  const tooShort = !!next && next.length < 10;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    if (next.length < 10) return setErr('A nova password deve ter pelo menos 10 caracteres.');
    if (next !== again) return; // o aviso já aparece junto ao campo
    setBusy(true);
    try {
      const r = await fetch('/api/password', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ current: cur, next }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return setErr(j.error || 'Não foi possível alterar a password.');
      setCur(''); setNext(''); setAgain(''); setOpen(false);
      toast('Password alterada. Use a nova no próximo login.');
    } catch {
      setErr('Sem ligação ao servidor. A password não foi alterada.');
    } finally {
      setBusy(false);
    }
  };
  const type = show ? 'text' : 'password';
  return (
    <section className="settings-card">
      <h3><Icon name="lock" size={16} /> Password</h3>
      <p className="muted">A password de acesso à FlyNotes. Os dispositivos onde já tem sessão iniciada continuam ligados; a nova password é pedida no próximo login.</p>
      {!open ? <button className="btn" onClick={() => setOpen(true)}>Alterar password</button> : (
        <form className="pw-form" onSubmit={submit}>
          <label className="field-label" htmlFor="pw-cur">Password atual</label>
          <input id="pw-cur" className="input" type={type} autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} autoFocus />
          <label className="field-label" htmlFor="pw-new">Nova password (mínimo 10 caracteres)</label>
          <input id="pw-new" className="input" type={type} autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
          {tooShort && <p className="muted small">Faltam {10 - next.length} caracteres.</p>}
          <label className="field-label" htmlFor="pw-again">Repetir a nova password</label>
          <input id="pw-again" className="input" type={type} autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} />
          {mismatch && <p className="danger-text">As duas passwords novas não coincidem.</p>}
          <label className="pw-show"><input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Mostrar passwords</label>
          {err && <p className="danger-text" role="alert">{err}</p>}
          <div className="pw-actions">
            <button className="btn primary" disabled={busy || !cur || !next || !again}>{busy ? 'A alterar…' : 'Guardar nova password'}</button>
            <button type="button" className="btn" onClick={() => { setOpen(false); setErr(''); setCur(''); setNext(''); setAgain(''); }}>Cancelar</button>
          </div>
        </form>
      )}
    </section>
  );
}

export function PasskeySection() {
  const [creds, setCreds] = useState<{ id: string; name: string; createdAt: number }[]>([]);
  const [busy, setBusy] = useState(false);
  const load = () => passkeyStatus().then((s) => setCreds(s.credentials || []));
  useEffect(() => { load(); }, []);
  return (
    <section className="settings-card">
      <h3><Icon name="lock" size={16} /> Entrar com Face ID / impressão digital</h3>
      <p className="muted">Registe este dispositivo para entrar sem escrever a password (Face ID, Touch ID, impressão digital ou Windows Hello). A password continua a funcionar.</p>
      {!passkeysSupported() ? <p className="muted">Este browser não suporta chaves de acesso.</p> : (
        <button className="btn primary" disabled={busy} onClick={async () => {
          setBusy(true);
          try { await registerPasskey(deviceName()); toast('Dispositivo registado'); load(); }
          catch (e: any) { if (!/abort|cancel|NotAllowed/i.test(String(e?.name || e?.message))) toast(e.message); }
          finally { setBusy(false); }
        }}><Icon name="plus" size={15} /> Registar este dispositivo</button>
      )}
      {creds.length > 0 && (
        <table className="table compact">
          <tbody>
            {creds.map((c) => (
              <tr key={c.id}>
                <td><Icon name="lock" size={14} /> {c.name}</td>
                <td className="muted">registado {relDate(c.createdAt)}</td>
                <td className="actions"><button className="icon-btn small" title="Remover" onClick={async () => { if (await confirmDialog(`Remover “${c.name}”?`, { danger: true, ok: 'Remover' })) { await deletePasskey(c.id); load(); } }}><Icon name="trash" size={14} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export function PdfIndexButton() {
  const [state, setState] = useState('');
  return (
    <button className="btn" disabled={!!state} onClick={async () => {
      setState('A preparar…');
      const n = await indexPendingPdfs((d, t) => setState(`A ler PDFs ${d}/${t}…`));
      setState('');
      toast(n ? `${n} PDF(s) tornados pesquisáveis` : 'Todos os PDFs já estão pesquisáveis');
    }}><Icon name="search" size={15} /> {state || 'Tornar PDFs pesquisáveis'}</button>
  );
}
