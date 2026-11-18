// fetch para URLs indicados pelo utilizador (recorte web, calendários) sem permitir chegar à rede interna.
// Cada redirecionamento é seguido manualmente e o destino é verificado de novo.
import { lookup } from 'node:dns/promises';
import net from 'node:net';

export function isPrivateIp(ip: string): boolean {
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIp(mapped[1]);
    if (/^::ffff:[0-9a-f]{1,4}:[0-9a-f]{1,4}$/.test(v)) return true; // IPv4 mapeado em hexadecimal
    return v === '::' || v === '::1' || /^f[cd]/.test(v) || /^fe[89ab]/.test(v) || v.startsWith('ff') || v.startsWith('64:ff9b');
  }
  const [a, b] = ip.split('.').map(Number);
  return (
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19))
  );
}

export class BlockedUrlError extends Error {}

async function checkHost(url: URL) {
  if (!/^https?:$/.test(url.protocol)) throw new BlockedUrlError('Protocolo não permitido');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addrs = net.isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw new BlockedUrlError('Endereço não permitido');
}

export async function safeFetch(input: string | URL, init: RequestInit = {}, opts: { allowPrivate?: boolean; maxRedirects?: number } = {}) {
  let url = new URL(input);
  for (let hop = 0; hop <= (opts.maxRedirects ?? 5); hop++) {
    if (!opts.allowPrivate) await checkHost(url);
    const r = await fetch(url, { ...init, redirect: 'manual' });
    if (r.status >= 300 && r.status < 400 && r.headers.get('location')) {
      url = new URL(r.headers.get('location')!, url);
      continue;
    }
    return { response: r, url };
  }
  throw new BlockedUrlError('Demasiados redirecionamentos');
}
