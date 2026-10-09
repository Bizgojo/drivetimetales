/**
 * Tests for lib/variance/* wiring (service getters + timeline + snapshot).
 * Mocks '../lib/db' (same resolved module as '@/lib/db') so no network/keys.
 * Run: npx jest --config jest.config.variance.js
 */

jest.mock('../lib/db', () => {
  const q = jest.fn();
  const svc = jest.fn();
  return { db: { query: q }, getSupabaseServiceClient: svc };
});

const mockedDb = jest.requireMock('../lib/db') as any;
const mockQuery: jest.Mock = mockedDb.db.query;
const mockGetSvc: jest.Mock = mockedDb.getSupabaseServiceClient;

import { getCampaignVariance } from '../lib/variance/varianceService';
import { buildTimeline } from '../lib/variance/timelineEngine';

const insertedSnapshots: any[] = [];

beforeEach(() => {
  jest.clearAllMocks();
  insertedSnapshots.length = 0;

  mockGetSvc.mockReturnValue({
    from: (table: string) => ({
      insert: async (row: any) => {
        insertedSnapshots.push({ table, row });
        return { error: null };
      },
    }),
  });

  // Route canned rows by table name found in the SQL text.
  mockQuery.mockImplementation(async (text: string, params: any[]) => {
    const t = text as string;
    if (t.includes('FROM campaigns')) return { rows: [{ id: params[0], name: 'Test Campaign' }] };
    if (t.includes('FROM campaign_forecasts'))
      return { rows: [{ trials: 100, subs: 10, cac: 5 }] };
    if (t.includes('FROM campaign_metrics_daily'))
      return {
        rows: [
          { date: '2026-10-06', trials: 20, subs: 2, cac: 6 },
          { date: '2026-10-07', trials: 10, subs: 1, cac: 4 },
        ],
      };
    if (t.includes('FROM creative_performance'))
      return { rows: [{ creative_id: 'c1', finding: 'Hook weak', delta: -12 }] };
    if (t.includes('FROM audience_performance'))
      return { rows: [{ audience_id: 'a1', finding: 'Audience fatigued', delta: -8 }] };
    if (t.includes('FROM funnel_performance'))
      return { rows: [{ stage: 'trial', finding: 'Drop at paywall', delta: -5 }] };
    if (t.includes('FROM story_signals'))
      return { rows: [{ signal: 's1', finding: 'Episode 1 hook', delta: 3 }] };
    if (t.includes('FROM external_signals'))
      return { rows: [{ signal: 'e1', finding: 'Holiday noise', delta: -2 }] };
    if (t.includes('FROM agent_logs'))
      return {
        rows: [
          {
            agent: 'susan',
            event_type: 'creative',
            event: 'Hook rewrite',
            details: {},
            created_at: '2026-10-07T12:00:00Z',
          },
        ],
      };
    throw new Error(`unexpected table in query: ${t}`);
  });
});

describe('timelineEngine.buildTimeline', () => {
  test('maps agent_logs rows to {label, timestamp}', async () => {
    const tl = await buildTimeline('camp-1');
    expect(tl).toEqual([{ label: 'susan: Hook rewrite', timestamp: '2026-10-07T12:00:00Z' }]);
    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('FROM agent_logs'), ['camp-1']);
  });
});

describe('varianceService.getCampaignVariance', () => {
  test('full pipeline returns shaped payload and appends a snapshot', async () => {
    const payload = await getCampaignVariance('camp-1');

    // summary: forecast 100/10/5 vs actual 30/3/5(avg of 6,4)
    expect(payload.campaign).toMatchObject({ id: 'camp-1', name: 'Test Campaign' });
    expect(payload.summary.trials).toMatchObject({ forecast: 100, actual: 30, variance: -70 });
    expect(payload.summary.subs).toMatchObject({ forecast: 10, actual: 3, variance: -70 });
    expect(payload.summary.cac.actual).toBe(5);

    // charts series from daily rows
    expect(payload.charts.trialsVsForecast).toHaveLength(2);
    expect(payload.charts.cacVsForecast[0]).toEqual({ date: '2026-10-06', value: 6 });

    // diagnostics formatted from performance tables
    expect(payload.diagnostics.creative).toEqual(['Hook weak (-12%)']);

    // root cause / actions / instructions present
    expect(payload.rootCause.primary).toBe('Hook weak (-12%)');
    expect(payload.actions).toHaveProperty('good');
    expect(payload.agentInstructions).toHaveProperty('susan');

    // timeline from agent_logs
    expect(payload.timeline).toEqual([
      { label: 'susan: Hook rewrite', timestamp: '2026-10-07T12:00:00Z' },
    ]);

    // snapshot insert (append-only) carries all sections
    expect(insertedSnapshots).toHaveLength(1);
    expect(insertedSnapshots[0].table).toBe('campaign_variance');
    expect(insertedSnapshots[0].row.campaign_id).toBe('camp-1');
    for (const k of [
      'summary',
      'diagnostics',
      'charts',
      'root_cause',
      'actions',
      'agent_instructions',
      'timeline',
    ]) {
      expect(insertedSnapshots[0].row).toHaveProperty(k);
    }
  });

  test('missing campaign aborts with a clear error', async () => {
    mockQuery.mockImplementation(async (text: string) => {
      if (text.includes('FROM campaigns')) return { rows: [] };
      throw new Error('should not get here');
    });
    await expect(getCampaignVariance('ghost')).rejects.toThrow(/Campaign not found/);
  });

  test('missing forecast aborts with a clear error', async () => {
    mockQuery.mockImplementation(async (text: string, params: any[]) => {
      if (text.includes('FROM campaigns')) return { rows: [{ id: params[0] }] };
      if (text.includes('FROM campaign_metrics_daily')) return { rows: [] };
      if (text.includes('FROM campaign_forecasts')) return { rows: [] };
      throw new Error('should not get here');
    });
    await expect(getCampaignVariance('camp-1')).rejects.toThrow(/No forecast/);
  });
});
