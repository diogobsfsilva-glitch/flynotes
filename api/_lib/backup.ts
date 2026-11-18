// Cópias de segurança: exportação completa da base de dados para o armazenamento privado (comprimida).
import { gzipSync, gunzipSync } from 'node:zlib';
import { db, WRITE_LOCK, getMetaValue, setMetaValue, transaction, pagedQuery } from './db.js';
import { putObject, getObject, listObjects, deleteObject, deleteFile } from './storage.js';

const PREFIX = 'backups/';
const KEEP = 30;

export async function createBackup(label = 'auto') {
  // Lê em páginas (uma base de dados grande não cabe numa só resposta)
  const rows: any[] = [];
  for (let after = ''; ; ) {
    const page = await pagedQuery((n) => `select id, type, data, updated_at from docs where not deleted and id > $1 order by id limit ${n}`, [after], 200);
    if (!page.length) break;
    rows.push(...page);
    after = page[page.length - 1].id;
  }
  const payload = {
    app: 'FlyNotes',
    version: 1,
    createdAt: Date.now(),
    count: rows.length,
    docs: rows.map((r) => ({ id: r.id, type: r.type, data: r.data, updatedAt: Number(r.updated_at) })),
  };
  const stamp = new Date().toISOString().replace(/[:]/g, '-').slice(0, 19);
  const name = `${PREFIX}flynotes-${stamp}-${label.replace(/[^a-z0-9-]/gi, '')}.json.gz`;
  const gz = gzipSync(Buffer.from(JSON.stringify(payload)));
  await putObject(name, new Uint8Array(gz), 'application/gzip');
  await prune();
  return { name, count: rows.length, size: gz.length };
}

export async function listBackups() {
  const all = await listObjects(PREFIX);
  return all.filter((b) => b.pathname.endsWith('.json.gz')).sort((a, b) => b.uploadedAt - a.uploadedAt);
}

async function prune() {
  const all = await listBackups();
  // Mantém as 30 mais recentes (as cópias "antes de restaurar" e manuais contam também)
  for (const b of all.slice(KEEP)) await deleteObject(b.pathname).catch(() => {});
}

export async function readBackup(name: string) {
  if (!name.startsWith(PREFIX)) throw new Error('invalid');
  const gz = await getObject(name);
  if (!gz) return null;
  return JSON.parse(gunzipSync(Buffer.from(gz)).toString('utf8'));
}

/** Repõe o estado de uma cópia: documentos da cópia voltam e o que foi criado depois vai para o lixo do sistema. */
export async function restoreBackup(name: string) {
  const data = await readBackup(name);
  if (!data?.docs) throw new Error('Cópia inválida');
  const safety = await createBackup('antes-de-restaurar');
  const now = Date.now();
  const docs: any[] = data.docs;
  // Tudo numa só transação: se algo falhar a meio, a base de dados fica como estava.
  const stmts: [string, unknown[]][] = [];
  for (let i = 0; i < docs.length; i += 200) {
    const chunk = docs.slice(i, i + 200);
    stmts.push([
      `insert into docs (id, type, data, updated_at, deleted, rev)
       select t.id, t.type, t.data, $4, false, nextval('doc_rev') from unnest($1::text[], $2::text[], $3::jsonb[]) as t(id, type, data) where ${WRITE_LOCK}
       on conflict (id) do update set type = excluded.type, data = excluded.data, updated_at = excluded.updated_at, deleted = false, rev = nextval('doc_rev')`,
      [chunk.map((d) => d.id), chunk.map((d) => d.type), chunk.map((d) => JSON.stringify(d.data)), now],
    ]);
  }
  const ids = docs.map((d) => d.id);
  const q = await db();
  const before = await q(`select count(*)::int as n from docs where not deleted and not (id = any($1::text[]))`, [ids]);
  stmts.push([
    `update docs set deleted = true, data = '{}'::jsonb, updated_at = $2, rev = nextval('doc_rev') where not deleted and not (id = any($1::text[])) and ${WRITE_LOCK}`,
    [ids, now],
  ]);
  await transaction(stmts);
  const removed = { length: before[0]?.n || 0 };
  return { restored: docs.length, removed: removed.length, safety: safety.name };
}

/**
 * Apaga do armazenamento os anexos eliminados há mais de 35 dias.
 * Até lá continuam disponíveis para as cópias de segurança (que guardam 30 dias).
 */
export async function purgeDeletedFiles(limit = 300) {
  const q = await db();
  const cutoff = Date.now() - 35 * 86400000;
  const since = await getMetaValue<number>('files_purged_until', 0);
  const rows = await q(
    `select id, updated_at from docs where type = 'file' and deleted and updated_at > $1 and updated_at <= $2 order by updated_at asc limit $3`,
    [since, cutoff, limit],
  );
  let purged = 0;
  let until = since;
  for (const r of rows) {
    // Ainda usado por alguma nota (duplicada, cópia em conflito ou restaurada)? Então fica.
    const used = await q(`select 1 from docs where type = 'note' and not deleted and data->>'content' like $1 limit 1`, ['%' + r.id + '%']);
    if (!used.length) {
      try { await deleteFile(r.id); purged++; }
      catch { break; } // falhou: fica para a próxima execução
    }
    until = Number(r.updated_at);
  }
  if (until !== since) await setMetaValue('files_purged_until', until);
  return { purged };
}
