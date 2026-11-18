import { useEffect, useState } from 'react';
import { loginWithPasskey, passkeyStatus, passkeysSupported } from '../lib/passkeys';
import { Icon, LogoMark } from '../ui';

export function Login({ onLogin }: { onLogin: () => void }) {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [hasPasskey, setHasPasskey] = useState(false);
  useEffect(() => { if (passkeysSupported()) passkeyStatus().then((s) => setHasPasskey(s.available)); }, []);
  const passkey = async () => {
    setErr('');
    setBusy(true);
    try { await loginWithPasskey(); onLogin(); }
    catch (e: any) { if (!/abort|cancel|NotAllowed/i.test(String(e?.name || e?.message))) setErr(e.message); }
    finally { setBusy(false); }
  };
  return (
    <div className="login">
      <form className="login-card" onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr('');
        try {
          const r = await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: pw }) });
          if (r.ok) onLogin();
          else setErr((await r.json().catch(() => ({}))).error || 'Não foi possível entrar');
        } catch {
          setErr('Sem ligação ao servidor');
        } finally {
          setBusy(false);
        }
      }}>
        <div className="login-logo"><LogoMark size={40} /></div>
        <h1>FlyNotes</h1>
        <p className="muted">As suas notas, em todo o lado.</p>
        <input className="input" type="password" autoFocus autoComplete="current-password" placeholder="Password" value={pw} onChange={(e) => setPw(e.target.value)} />
        {err && <p className="danger-text">{err}</p>}
        <button className="btn primary block" disabled={busy || !pw}>{busy ? 'A entrar…' : 'Entrar'}</button>
        {hasPasskey && <button type="button" className="btn block" disabled={busy} onClick={passkey}><Icon name="lock" size={16} /> Entrar com Face ID / impressão digital</button>}
      </form>
    </div>
  );
}
