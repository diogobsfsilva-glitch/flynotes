// Motor de sincronização: local-first (IndexedDB) <-> servidor (/api/sync).
import { db, TABLE_TYPES, TYPE_TABLES, getMeta, setMeta, type SyncTable } from './db';

export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'error' | 'unauthorized';
type Listener = (s: SyncStatus, info?: string) => void;

let status: SyncStatus = 'idle';
let lastError = '';
const listeners = new Set<Listener>();
let running: Promise<void> | null = null;
let again = false;
let timer: any = null;

export function onSyncStatus(fn: Listener) {
  listeners.add(fn);
  fn(status, lastError);
  return () => {
    listeners.delete(fn);
  };
}
function setStatus(s: SyncStatus, info = '') {
  status = s;
  lastError = info;
  listeners.forEach((l) => l(s, info));
}
export const getSyncStatus = () => status;

export function scheduleSync(delay = 1500) {
  clearTimeout(timer);
  timer = setTimeout(() => syncNow(), delay);
}

export function syncNow(): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    do {
      again = false;
      await runOnce();
    } while (again);
  })().finally(() => {
    running = null;
  });
  return running;
}

const MAX_BATCH_BYTES = 2_500_000;

async function runOnce() {
  if (!navigator.onLine) return setStatus('offline');
  setStatus('syncing');
  try {
    await processUploads();
    // Primeiro recebe (para detetar conflitos com as alterações locais), depois envia
    await pull();
    await push();
    setStatus('idle');
    await setMeta('lastSyncAt', Date.now());
  } catch (e: any) {
    if (e?.status === 401) setStatus('unauthorized');
    else if (!navigator.onLine || e instanceof TypeError) setStatus('offline');
    else setStatus('error', String(e?.message || e));
  }
}

async function api(path: string, init?: RequestInit) {
  const r = await fetch(path, { credentials: 'same-origin', ...init });
  if (!r.ok) {
    const err: any = new Error((await r.text().catch(() => '')) || r.statusText);
    err.status = r.status;
    throw err;
  }
  return r.json();
}

async function push() {
  const tables = Object.keys(TABLE_TYPES) as SyncTable[];
  const dirty: { table: SyncTable; row: any }[] = [];
  for (const t of tables) {
    const rows = await (db[t] as any).where('dirty').equals(1).toArray();
    for (const row of rows) dirty.push({ table: t, row });
  }
  if (!dirty.length) return;
  let batch: typeof dirty = [];
  let bytes = 0;
  const flush = async () => {
    if (!batch.length) return;
    const docs = batch.map(({ table, row }) => {
      const { dirty: _d, deleted, syncedAt: _s, pushedAt: _p, ...data } = row;
      return { id: row.id, type: TABLE_TYPES[table], data, updatedAt: row.updatedAt, deleted: !!deleted };
    });
    // Regista o que vai ser enviado: se a resposta se perder, o eco desta versão não é tratado como conflito.
    await db.transaction('rw', tables.map((t) => db[t]), async () => {
      for (const { table, row } of batch) await (db[table] as any).update(row.id, { pushedAt: row.updatedAt });
    });
    const res = await api('/api/sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ docs }),
    });
    const rejected: any[] = Array.isArray(res?.rejected) ? res.rejected : [];
    const rejectedIds = new Set(rejected.map((d) => d.id));
    await db.transaction('rw', tables.map((t) => db[t]), async () => {
      for (const { table, row } of batch) {
        if (rejectedIds.has(row.id)) continue;
        const cur = await (db[table] as any).get(row.id);
        if (!cur) continue;
        if (cur.updatedAt !== row.updatedAt) {
          // Alterado durante o envio: continua por enviar, mas o servidor já tem esta versão.
          await (db[table] as any).update(row.id, { syncedAt: row.updatedAt });
          continue;
        }
        if (cur.deleted) await (db[table] as any).delete(row.id);
        else await (db[table] as any).update(row.id, { dirty: 0, syncedAt: row.updatedAt });
      }
    });
    // O servidor tinha uma versão mais recente: resolve como se viesse de um pull (cópia em conflito se preciso).
    if (rejected.length) await applyRemote(rejected);
    batch = [];
    bytes = 0;
  };
  for (const item of dirty) {
    const size = JSON.stringify(item.row).length;
    if (bytes + size > MAX_BATCH_BYTES) await flush();
    batch.push(item);
    bytes += size;
  }
  await flush();
}

async function pull() {
  let since = await getMeta<number>('rev', 0);
  for (let i = 0; i < 200; i++) {
    const res = await api('/api/sync?since=' + since);
    const docs: any[] = res.docs || [];
    if (docs.length) await applyRemote(docs);
    since = res.rev;
    await setMeta('rev', since);
    if (!res.more) break;
  }
}

async function applyRemote(docs: any[]) {
  const tables = [...new Set(['notes' as SyncTable, ...docs.map((d) => TYPE_TABLES[d.type]).filter(Boolean)])];
  const conflicts: string[] = [];
  const conflictCopy = async (loser: any) => {
    const stamp = new Date(loser.updatedAt).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' });
    const copyId = loser.id.slice(0, 10) + Math.random().toString(36).slice(2, 12);
    const { syncedAt: _s, deleted: _d, ...rest } = loser;
    await db.notes.put(normalize('notes', { ...rest, id: copyId, title: `${loser.title || 'Sem título'} (cópia em conflito ${stamp})`, pinned: 0, trashed: 0, updatedAt: Date.now(), dirty: 1 }) as any);
    conflicts.push(loser.title || 'Sem título');
  };
  await db.transaction('rw', tables.map((t) => db[t]), async () => {
    for (const d of docs) {
      const table = TYPE_TABLES[d.type];
      if (!table) continue;
      const local = await (db[table] as any).get(d.id);
      if (local?.dirty) {
        const remoteChanged = local.syncedAt === undefined || d.updatedAt !== local.syncedAt;
        // O servidor ainda tem a versão em que a alteração local se baseou: mantém a local (vai ser enviada)
        if (!remoteChanged) continue;
        // Eco de um envio nosso cuja resposta se perdeu: o servidor tem a nossa versão anterior
        if (local.pushedAt !== undefined && d.updatedAt === local.pushedAt) { await (db[table] as any).update(d.id, { syncedAt: d.updatedAt }); continue; }
        if (local.deleted) {
          // Apagado aqui; só volta se a versão remota for mais recente que o apagamento
          if (d.deleted || d.updatedAt <= local.updatedAt) { await (db[table] as any).update(d.id, { syncedAt: d.updatedAt }); continue; }
        } else if (d.deleted) {
          // Apagado noutro dispositivo enquanto havia edições locais: guarda-as numa cópia antes de apagar
          if (table === 'notes' && (local.content || local.title)) await conflictCopy(local);
        } else if (table === 'notes' && (local.content !== (d.data.content || '') || local.title !== (d.data.title || ''))) {
          // Conflito: a mesma nota foi alterada aqui e noutro dispositivo
          const remoteWins = d.updatedAt > local.updatedAt;
          await conflictCopy(remoteWins ? local : { ...d.data, id: d.id, updatedAt: d.updatedAt });
          if (!remoteWins) { await db.notes.update(d.id, { syncedAt: d.updatedAt, updatedAt: Math.max(local.updatedAt, d.updatedAt + 1) }); continue; }
        } else if (local.updatedAt > d.updatedAt) {
          await (db[table] as any).update(d.id, { syncedAt: d.updatedAt });
          continue;
        }
      }
      if (d.deleted) await (db[table] as any).delete(d.id);
      else await (db[table] as any).put(normalize(table, { ...d.data, id: d.id, updatedAt: d.updatedAt, dirty: 0, syncedAt: d.updatedAt }));
    }
  });
  if (conflicts.length) window.dispatchEvent(new CustomEvent('fn:conflict', { detail: conflicts }));
}

/** Garante campos obrigatórios em documentos vindos do servidor (ex.: importados por outras ferramentas). */
function normalize(table: SyncTable, row: any) {
  if (table === 'notes') {
    row.title = row.title || '';
    row.content = row.content || '';
    row.text = row.text || '';
    row.tagIds = Array.isArray(row.tagIds) ? row.tagIds : [];
    row.trashed = row.trashed ? 1 : 0;
    row.createdAt = row.createdAt || row.updatedAt;
    row.notebookId = row.notebookId || '';
  }
  if (table === 'tasks') {
    row.title = row.title || '';
    row.done = row.done ? 1 : 0;
    row.createdAt = row.createdAt || row.updatedAt;
  }
  if (table === 'notebooks') row.name = row.name || 'Caderno';
  if (table === 'tags') row.name = row.name || 'etiqueta';
  return row;
}

// ---------- Anexos pendentes (carregados quando houver rede) ----------
async function processUploads() {
  const pending = await db.uploads.toArray();
  for (const up of pending) {
    try {
      await uploadBlob(up.id, up.blob, up.mime);
      await db.uploads.delete(up.id);
      await db.files.update(up.id, { uploaded: 1 });
    } catch (e: any) {
      // Erros de rede/sessão interrompem a sincronização; outros ficam para nova tentativa
      if (e?.status === 401 || e instanceof TypeError) throw e;
      console.warn('Anexo por carregar', up.name, e);
    }
  }
}

const DIRECT_LIMIT = 4 * 1024 * 1024;

async function uploadBlob(id: string, blob: Blob, mime: string) {
  if (blob.size <= DIRECT_LIMIT) {
    const r = await fetch('/api/file?id=' + encodeURIComponent(id), {
      method: 'PUT',
      headers: { 'content-type': mime || 'application/octet-stream' },
      body: blob,
    });
    if (!r.ok) {
      const err: any = new Error('Falha ao carregar anexo');
      err.status = r.status;
      throw err;
    }
    return;
  }
  // Ficheiros grandes: carregamento direto para o Vercel Blob
  const { upload } = await import('@vercel/blob/client');
  await upload('files/' + id, blob, {
    access: 'private',
    handleUploadUrl: '/api/blob-upload',
    contentType: mime,
    multipart: blob.size > 20 * 1024 * 1024,
  });
}

export async function resetLocalData() {
  await db.delete();
  location.reload();
}

// Gatilhos automáticos
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => syncNow());
  window.addEventListener('offline', () => setStatus('offline'));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') syncNow();
  });
  setInterval(() => {
    if (document.visibilityState === 'visible') syncNow();
  }, 30000);
}
