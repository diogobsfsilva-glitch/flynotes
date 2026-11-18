// Encriptação de notas com frase-passe (AES-GCM 256 + PBKDF2). A frase-passe nunca sai do dispositivo.
const enc = new TextEncoder();
const dec = new TextDecoder();

const b64 = (buf: ArrayBuffer | Uint8Array) => {
  // Em blocos: String.fromCharCode(...bytes) rebenta acima de ~64 KB (limite de argumentos no Safari).
  const bytes = new Uint8Array(buf as ArrayBuffer);
  let out = '';
  for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(out);
};
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function deriveKey(pass: string, salt: Uint8Array) {
  const base = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: 250000, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptText(plain: string, pass: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(pass, salt);
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plain));
  return { salt: b64(salt), iv: b64(iv), data: b64(data) };
}

export async function decryptText(locked: { salt: string; iv: string; data: string }, pass: string): Promise<string> {
  const key = await deriveKey(pass, unb64(locked.salt));
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(locked.iv) as BufferSource }, key, unb64(locked.data) as BufferSource);
  return dec.decode(plain);
}

// Frases-passe desbloqueadas nesta sessão (apenas em memória)
export const unlocked = new Map<string, string>();
