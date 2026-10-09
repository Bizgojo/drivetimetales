/**
 * lib/db.ts — server-side query helper (VARIANCE-MODULES-001).
 *
 * Exposes a minimal `db.query(text, params)` interface returning `{ rows }`,
 * backed by the Supabase service-role client (server-side env only:
 * NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY). Never import this
 * module from client components — the service key must never reach the browser.
 *
 * Why supabase-js instead of `pg`: the deployment environment provides a
 * Supabase URL + service key, not a Postgres connection string, so there is
 * no pg-wire endpoint available to node-postgres. Instead this helper
 * translates a small, well-defined subset of parameterized SELECT statements
 * ($1-style placeholders) into PostgREST calls via supabase-js.
 *
 * Supported SQL subset:
 *   SELECT <col, ... | *> FROM <table>
 *     [WHERE <col> = $n [AND <col> = $m ...]]
 *     [ORDER BY <col> [ASC|DESC] [, ...]]
 *     [LIMIT <n>]
 * Anything outside this shape throws a descriptive error — extend the
 * translator deliberately, not by accident.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export interface DbQueryResult<T = any> {
  rows: T[];
}

let cachedClient: SupabaseClient | null = null;

/** Server-side Supabase service-role client (singleton). Throws if env is missing. */
export function getSupabaseServiceClient(): SupabaseClient {
  if (cachedClient) return cachedClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      '[lib/db] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars'
    );
  }
  cachedClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedClient;
}

/** Test-only hook: inject a fake client so unit tests never touch the network. */
export function __setDbClientForTests(client: SupabaseClient | null): void {
  cachedClient = client;
}

interface ParsedSelect {
  columns: string[];
  table: string;
  wheres: Array<{ column: string; paramIndex: number }>;
  orderBys: Array<{ column: string; ascending: boolean }>;
  limit: number | null;
}

/** Parse the supported SELECT subset. Throws on anything else. */
export function parseSelect(text: string): ParsedSelect {
  const normalized = text.trim().replace(/\s+/g, ' ');
  const match = normalized.match(
    /^SELECT\s+(.+?)\s+FROM\s+([A-Za-z_][A-Za-z0-9_]*)\s*(.*)$/i
  );
  if (!match) {
    throw new Error(`[lib/db] Unsupported query shape (expected SELECT ... FROM <table>): ${text}`);
  }
  const [, colsRaw, table, restRaw] = match;
  const columns = colsRaw.trim() === '*' ? ['*'] : colsRaw.split(',').map((c) => c.trim()).filter(Boolean);
  if (columns.length === 0) {
    throw new Error(`[lib/db] No columns in SELECT: ${text}`);
  }

  let rest = (restRaw || '').trim();
  const wheres: ParsedSelect['wheres'] = [];
  const orderBys: ParsedSelect['orderBys'] = [];
  let limit: number | null = null;

  const whereMatch = rest.match(/^WHERE\s+(.+?)(?=\s+ORDER\s+BY\s+|\s+LIMIT\s+\d+\s*$|$)/i);
  if (whereMatch) {
    const conds = whereMatch[1].split(/\s+AND\s+/i);
    for (const cond of conds) {
      const cm = cond.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*\$(\d+)$/);
      if (!cm) {
        throw new Error(`[lib/db] Unsupported WHERE condition (only "<col> = $n" AND-chains): ${cond}`);
      }
      const paramIndex = parseInt(cm[2], 10);
      if (paramIndex < 1) {
        throw new Error(`[lib/db] Placeholder indices start at $1: ${cond}`);
      }
      wheres.push({ column: cm[1], paramIndex });
    }
    rest = rest.slice(whereMatch[0].length).trim();
  }

  const orderMatch = rest.match(/^ORDER\s+BY\s+(.+?)(?=\s+LIMIT\s+\d+\s*$|$)/i);
  if (orderMatch) {
    const items = orderMatch[1].split(',').map((s) => s.trim()).filter(Boolean);
    for (const item of items) {
      const om = item.match(/^([A-Za-z_][A-Za-z0-9_]*)(?:\s+(ASC|DESC))?$/i);
      if (!om) {
        throw new Error(`[lib/db] Unsupported ORDER BY item: ${item}`);
      }
      orderBys.push({ column: om[1], ascending: (om[2] || 'ASC').toUpperCase() === 'ASC' });
    }
    rest = rest.slice(orderMatch[0].length).trim();
  }

  const limitMatch = rest.match(/^LIMIT\s+(\d+)$/i);
  if (limitMatch) {
    limit = parseInt(limitMatch[1], 10);
    rest = '';
  }

  if (rest !== '') {
    throw new Error(`[lib/db] Unsupported trailing clause: "${rest}" in: ${text}`);
  }

  return { columns, table, wheres, orderBys, limit };
}

/**
 * Run a parameterized SELECT and return `{ rows }`.
 * `$n` placeholders map 1:1 onto `params[n-1]` (same convention as node-postgres).
 */
export async function query<T = any>(text: string, params: any[] = []): Promise<DbQueryResult<T>> {
  const parsed = parseSelect(text);

  for (const w of parsed.wheres) {
    if (w.paramIndex > params.length) {
      throw new Error(
        `[lib/db] Missing value for placeholder $${w.paramIndex} (got ${params.length} params)`
      );
    }
  }

  const client = getSupabaseServiceClient();
  let qb: any = client
    .from(parsed.table)
    .select(parsed.columns.length === 1 && parsed.columns[0] === '*' ? '*' : parsed.columns.join(','));

  for (const w of parsed.wheres) {
    qb = qb.eq(w.column, params[w.paramIndex - 1]);
  }
  for (const o of parsed.orderBys) {
    qb = qb.order(o.column, { ascending: o.ascending });
  }
  if (parsed.limit !== null) {
    qb = qb.limit(parsed.limit);
  }

  const { data, error } = await qb;
  if (error) {
    throw new Error(`[lib/db] Query failed on ${parsed.table}: ${error.message}`);
  }
  return { rows: (data ?? []) as T[] };
}

/** Shared handle matching the `db.query(...)` call shape used across lib code. */
export const db = { query };
