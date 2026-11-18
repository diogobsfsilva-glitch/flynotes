// Camada de base de dados: Neon Postgres em produção, PGlite (Postgres local em WASM) em desenvolvimento.
type Row = Record<string, any>;
type Query = (text: string, params?: unknown[]) => Promise<Row[]>;
type Stmt = [text: string, params?: unknown[]];
type Tx = (stmts: Stmt[]) => Promise<void>;

let queryFn: Promise<Query> | null = null;
let txFn: Tx | null = null;

async function createQuery(): Promise<Query> {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (url) {
    const { neon } = await import('@neondatabase/serverless');
    const sql = neon(url);
    txFn = async (stmts) => { await sql.transaction(stmts.map(([t, p]) => sql.query(t, (p || []) as any[]))); };
    return async (text, params = []) => (await sql.query(text, params as any[])) as Row[];
  }
  if (process.env.VERCEL) throw new Error('Base de dados não configurada. No painel da Vercel, em Storage, crie uma base de dados Neon (Postgres), ligue-a a este projeto e volte a publicar.');
  // Instalação local: Postgres embutido (PGlite), importado dinamicamente para não entrar no bundle de produção.
  const modName = '@electric-sql/pglite';
  const { PGlite } = await import(/* @vite-ignore */ modName);
  const dir = process.env.FLYNOTES_DATA_DIR || '.data';
  const { mkdirSync } = await import('node:fs');
  mkdirSync(dir, { recursive: true });
  const db = new PGlite(`${dir}/pg`);
  txFn = async (stmts) => { await db.transaction(async (tx: any) => { for (const [t, p] of stmts) await tx.query(t, p || []); }); };
  return async (text, params = []) => (await db.query(text, params)).rows as Row[];
}

const SCHEMA = [
  `create sequence if not exists doc_rev`,
  `create table if not exists docs (
     id text primary key,
     type text not null,
     data jsonb not null,
     updated_at bigint not null,
     deleted boolean not null default false,
     rev bigint not null default nextval('doc_rev')
   )`,
  `create index if not exists docs_rev_idx on docs(rev)`,
  `create table if not exists push_subs (endpoint text primary key, data jsonb not null, created_at bigint not null)`,
  `create table if not exists push_sent (key text primary key, sent_at bigint not null)`,
  `create table if not exists auth_creds (id text primary key, data jsonb not null, created_at bigint not null)`,
  `create table if not exists app_meta (key text primary key, value jsonb not null)`,
  `create table if not exists login_fails (id bigserial primary key, ip text not null, ts bigint not null)`,
  `create index if not exists login_fails_ip_idx on login_fails(ip, ts)`,
];

export async function db(): Promise<Query> {
  if (!queryFn) {
    queryFn = (async () => {
      const q = await createQuery();
      for (const stmt of SCHEMA) await q(stmt);
      return q;
    })().catch((e) => {
      queryFn = null;
      throw e;
    });
  }
  return queryFn;
}

/** Executa várias instruções numa só transação: ou ficam todas, ou nenhuma. */
export async function transaction(stmts: Stmt[]) {
  await db();
  await txFn!(stmts);
}

/** Lê linhas em páginas; se uma página for grande demais para o servidor responder, tenta com metade. */
export async function pagedQuery(text: (limit: number) => string, params: unknown[], limit: number): Promise<Row[]> {
  const q = await db();
  for (let n = limit; ; n = Math.floor(n / 2)) {
    try { return await q(text(n), params); }
    catch (e) { if (n <= 1) throw e; }
  }
}

export interface DocIn {
  id: string;
  type: string;
  data: unknown;
  updatedAt: number;
  deleted?: boolean;
}

const MAX_RESPONSE_BYTES = 3_500_000;

export async function pullSince(since: number) {
  const LIMIT = 300;
  const rows = await pagedQuery((n) => `select id, type, data, updated_at, deleted, rev from docs where rev > $1 order by rev asc limit ${n}`, [since], LIMIT);
  const out: any[] = [];
  let bytes = 0;
  let lastRev = since;
  for (const r of rows) {
    const size = JSON.stringify(r.data).length;
    if (out.length > 0 && bytes + size > MAX_RESPONSE_BYTES) break;
    bytes += size;
    out.push({
      id: r.id,
      type: r.type,
      data: r.data,
      updatedAt: Number(r.updated_at),
      deleted: r.deleted,
    });
    lastRev = Number(r.rev);
  }
  // Há mais se ainda existir algum documento depois do último devolvido
  let more = out.length < rows.length;
  if (!more && rows.length) more = (await (await db())(`select 1 from docs where rev > $1 limit 1`, [lastRev])).length > 0;
  return { docs: out, rev: lastRev, more };
}

/**
 * Bloqueio que serializa todas as escritas em `docs` (dentro da transação implícita da instrução).
 * Assim a ordem dos `rev` coincide com a ordem de commit e um pull nunca salta documentos
 * de uma escrita mais lenta que ainda não tinha terminado. Avaliado como InitPlan, antes de qualquer nextval.
 */
export const WRITE_LOCK = `(select true from pg_advisory_xact_lock(424242))`;

export async function pushDocs(docs: DocIn[]) {
  if (!docs.length) return { accepted: 0, rejected: [] };
  const q = await db();
  // Last-write-wins: só substitui se a versão recebida for mais recente (ou igual).
  const done = await q(
    `insert into docs (id, type, data, updated_at, deleted, rev)
     select t.id, t.type, t.data, t.updated_at, t.deleted, nextval('doc_rev')
     from unnest($1::text[], $2::text[], $3::jsonb[], $4::bigint[], $5::boolean[])
       as t(id, type, data, updated_at, deleted)
     where ${WRITE_LOCK}
     on conflict (id) do update set
       type = excluded.type, data = excluded.data, updated_at = excluded.updated_at,
       deleted = excluded.deleted, rev = nextval('doc_rev')
     where docs.updated_at <= excluded.updated_at
     returning id`,
    [
      docs.map((d) => d.id),
      docs.map((d) => d.type),
      docs.map((d) => JSON.stringify(d.deleted ? {} : d.data ?? {})),
      docs.map((d) => Math.round(d.updatedAt)),
      docs.map((d) => !!d.deleted),
    ],
  );
  const ok = new Set(done.map((r) => r.id));
  const rejectedIds = docs.map((d) => d.id).filter((id) => !ok.has(id));
  // Documentos recusados (o servidor tem uma versão mais recente): devolve-a para o cliente resolver.
  let rejected: any[] = [];
  if (rejectedIds.length) {
    const rows = await q(`select id, type, data, updated_at, deleted from docs where id = any($1::text[])`, [rejectedIds]);
    rejected = rows.map((r) => ({ id: r.id, type: r.type, data: r.data, updatedAt: Number(r.updated_at), deleted: r.deleted }));
  }
  return { accepted: ok.size, rejected };
}

export async function stats() {
  const q = await db();
  const rows = await q(
    `select type, count(*)::int as n from docs where not deleted group by type order by type`,
  );
  return rows;
}

export async function getMetaValue<T = any>(key: string, fallback: T): Promise<T> {
  const q = await db();
  const r = await q(`select value from app_meta where key = $1`, [key]);
  return (r[0]?.value ?? fallback) as T;
}
export async function setMetaValue(key: string, value: unknown) {
  const q = await db();
  await q(`insert into app_meta (key, value) values ($1, $2::jsonb) on conflict (key) do update set value = excluded.value`, [key, JSON.stringify(value)]);
}
