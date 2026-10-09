/**
 * Tests for lib/db.ts (query helper) and lib/ad/ingestion.ts (coverage check).
 * Fully mocked — no network, no keys. Run:
 *   npx jest --config jest.config.variance.js
 */
import { __setDbClientForTests, query, parseSelect } from '../lib/db';
import { ingestDailyMetricsForCampaign } from '../lib/ad/ingestion';

// ── Fake supabase-js surface ────────────────────────────────────────────────
// Only the chainable methods lib/db.ts actually calls.

class FakeBuilder {
  public selectCols = '';
  public eqs: Array<[string, any]> = [];
  public orders: Array<[string, any]> = [];
  public limitN: number | null = null;
  constructor(
    public table: string,
    private store: Record<string, any[]>,
    private errors: Record<string, string>,
    private built: FakeBuilder[]
  ) {
    built.push(this);
  }
  select(cols: string) {
    this.selectCols = cols;
    return this;
  }
  eq(col: string, val: any) {
    this.eqs.push([col, val]);
    return this;
  }
  order(col: string, opts: any) {
    this.orders.push([col, opts]);
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }
  then(resolve: (v: any) => void) {
    if (this.errors[this.table]) {
      resolve({ data: null, error: { message: this.errors[this.table] } });
    } else {
      resolve({ data: this.store[this.table] ?? [], error: null });
    }
  }
}

function makeFakeClient(
  store: Record<string, any[]> = {},
  errors: Record<string, string> = {},
  built: FakeBuilder[] = []
): any {
  return {
    from: (table: string) => new FakeBuilder(table, store, errors, built),
    __built: built,
  };
}

function lastBuilt(client: any): FakeBuilder {
  const b = client.__built as FakeBuilder[];
  return b[b.length - 1];
}

afterEach(() => {
  __setDbClientForTests(null);
});

// ── parseSelect ─────────────────────────────────────────────────────────────

describe('lib/db parseSelect', () => {
  test('parses the timeline query shape', () => {
    const p = parseSelect(
      'SELECT agent, event_type, event, details, created_at FROM agent_logs WHERE campaign_id = $1 ORDER BY created_at ASC'
    );
    expect(p.table).toBe('agent_logs');
    expect(p.columns).toEqual(['agent', 'event_type', 'event', 'details', 'created_at']);
    expect(p.wheres).toEqual([{ column: 'campaign_id', paramIndex: 1 }]);
    expect(p.orderBys).toEqual([{ column: 'created_at', ascending: true }]);
    expect(p.limit).toBeNull();
  });

  test('rejects non-SELECT and non-equality WHERE', () => {
    expect(() => parseSelect('INSERT INTO t (a) VALUES ($1)')).toThrow(/Unsupported query shape/);
    expect(() => parseSelect('SELECT a FROM t WHERE age > $1')).toThrow(/Unsupported WHERE/);
    expect(() => parseSelect('SELECT a FROM t ORDER BY x ASC FROBNICATE')).toThrow();
  });
});

// ── query translation ───────────────────────────────────────────────────────

describe('lib/db query translation ($1-style → supabase-js)', () => {
  test('timeline query maps WHERE $1, ORDER BY, select cols; returns {rows}', async () => {
    const rows = [{ agent: 'susan', event: 'Hook rewrite' }];
    const client = makeFakeClient({ agent_logs: rows });
    __setDbClientForTests(client);

    const res = await query(
      `SELECT agent, event_type, event, details, created_at
       FROM agent_logs
       WHERE campaign_id = $1
       ORDER BY created_at ASC`,
      ['camp-123']
    );
    expect(res).toEqual({ rows });

    const b = lastBuilt(client);
    expect(b.table).toBe('agent_logs');
    expect(b.selectCols).toBe('agent,event_type,event,details,created_at');
    expect(b.eqs).toEqual([['campaign_id', 'camp-123']]);
    expect(b.orders).toEqual([['created_at', { ascending: true }]]);
  });

  test('multiple AND conditions, DESC, LIMIT, out-of-order placeholders', async () => {
    const client = makeFakeClient({ campaign_forecasts: [] });
    __setDbClientForTests(client);

    await query(
      'SELECT trials, subs FROM campaign_forecasts WHERE campaign_id = $2 AND id = $1 ORDER BY created_at DESC LIMIT 1',
      ['fc-9', 'camp-1']
    );
    const b = lastBuilt(client);
    expect(b.eqs).toEqual([
      ['campaign_id', 'camp-1'],
      ['id', 'fc-9'],
    ]);
    expect(b.orders).toEqual([['created_at', { ascending: false }]]);
    expect(b.limitN).toBe(1);
  });

  test('missing param value throws before any network call', async () => {
    const client = makeFakeClient({});
    __setDbClientForTests(client);
    await expect(query('SELECT id FROM campaigns WHERE id = $2', ['only-one'])).rejects.toThrow(
      /Missing value for placeholder \$2/
    );
    expect((client.__built as FakeBuilder[]).length).toBe(0);
  });

  test('supabase error surfaces with table name', async () => {
    const client = makeFakeClient({}, { agent_logs: 'relation does not exist' });
    __setDbClientForTests(client);
    await expect(query('SELECT agent FROM agent_logs WHERE campaign_id = $1', ['x'])).rejects.toThrow(
      /Query failed on agent_logs/
    );
  });
});

// ── ingestion ───────────────────────────────────────────────────────────────

const todayUtc = () => new Date().toISOString().slice(0, 10);

describe('lib/ad/ingestion ingestDailyMetricsForCampaign', () => {
  test('returns coverage state, writes nothing (verified no-op)', async () => {
    const client = makeFakeClient({
      campaigns: [{ id: 'camp-1' }],
      campaign_metrics_daily: [{ date: '2026-10-01' }, { date: '2026-10-05' }],
    });
    __setDbClientForTests(client);

    const cov = await ingestDailyMetricsForCampaign('camp-1');
    expect(cov.campaignId).toBe('camp-1');
    expect(cov.rowCount).toBe(2);
    expect(cov.earliestDate).toBe('2026-10-01');
    expect(cov.latestDate).toBe('2026-10-05');
    expect(cov.refreshed).toBe(false);
    expect(cov.reason).toMatch(/NO_UPSTREAM_SOURCE/);
    // latest (Oct 5) < today (Oct 8+) → stale
    expect(cov.isFresh).toBe('2026-10-05' >= todayUtc());
  });

  test('fresh when latest row is stamped today', async () => {
    const client = makeFakeClient({
      campaigns: [{ id: 'camp-1' }],
      campaign_metrics_daily: [{ date: todayUtc() }],
    });
    __setDbClientForTests(client);

    const cov = await ingestDailyMetricsForCampaign('camp-1');
    expect(cov.isFresh).toBe(true);
    expect(cov.rowCount).toBe(1);
    expect(cov.refreshed).toBe(false);
  });

  test('empty metrics table → zero coverage, not fresh', async () => {
    const client = makeFakeClient({ campaigns: [{ id: 'camp-1' }] });
    __setDbClientForTests(client);

    const cov = await ingestDailyMetricsForCampaign('camp-1');
    expect(cov.rowCount).toBe(0);
    expect(cov.earliestDate).toBeNull();
    expect(cov.latestDate).toBeNull();
    expect(cov.isFresh).toBe(false);
  });

  test('unknown campaign throws', async () => {
    const client = makeFakeClient({ campaigns: [] });
    __setDbClientForTests(client);
    await expect(ingestDailyMetricsForCampaign('nope')).rejects.toThrow(/Campaign not found/);
  });
});
