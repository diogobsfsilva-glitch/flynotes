// Entrar com chave de acesso (Face ID / impressão digital / Windows Hello).
const post = async (body: unknown) => {
  const r = await fetch('/api/passkey', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || 'Erro');
  return data;
};

export const passkeysSupported = () => typeof window !== 'undefined' && !!window.PublicKeyCredential;

export async function registerPasskey(name: string) {
  const { startRegistration } = await import('@simplewebauthn/browser');
  const optionsJSON = await post({ action: 'register-options' });
  const response = await startRegistration({ optionsJSON });
  await post({ action: 'register-verify', response, name });
}

export async function loginWithPasskey() {
  const { startAuthentication } = await import('@simplewebauthn/browser');
  const optionsJSON = await post({ action: 'login-options' });
  const response = await startAuthentication({ optionsJSON });
  await post({ action: 'login-verify', response });
}

export async function passkeyStatus(): Promise<{ available: boolean; credentials?: { id: string; name: string; createdAt: number }[] }> {
  try { return await (await fetch('/api/passkey')).json(); } catch { return { available: false }; }
}

export async function deletePasskey(id: string) {
  await post({ action: 'delete', id });
}

export function deviceName() {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Android/.test(ua)) return 'Android';
  if (/Mac/.test(ua)) return 'Mac';
  if (/Windows/.test(ua)) return 'Windows';
  return 'Dispositivo';
}
