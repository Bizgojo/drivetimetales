/**
 * lib/ad/ingestion.ts — daily-metrics ingestion for variance analysis
 * (VARIANCE-MODULES-001).
 *
 * `ingestDailyMetricsForCampaign(campaignId)` ensures `campaign_metrics_daily`
 * has fresh coverage for the campaign, then returns the current coverage state.
 *
 * SOURCE STATUS (verified 2026-10-08 against the 11-table variance schema in
 * migrations/20261008_variance_bundle.sql): there is NO upstream ad-platform
 * source table in the database (no spend/impressions/clicks feed table, no
 * external API wired). The tables that exist are: campaigns,
 * campaign_forecasts, campaign_metrics_daily, campaign_variance, agent_logs,
 * creative_performance, audience_performance, funnel_performance,
 * story_signals, external_signals, timeline_events. None of them is a raw
 * metrics feed that campaign_metrics_daily could be derived/refreshed from.
 *
 * Per the ticket constraint ("derive/refresh only from tables that exist — do
 * not invent source tables"), this function is therefore a VERIFIED NO-OP on
 * the write path: it reads existing coverage, computes freshness, writes
 * nothing, and reports `refreshed: false` with the reason below. When an
 * upstream source (e.g. a Meta/Google Ads sync table or polling job) is added,
 * the refresh step belongs here, gated on that source's existence.
 */

import { db } from '@/lib/db';

export interface DailyMetricsCoverage {
  campaignId: string;
  rowCount: number;
  earliestDate: string | null;
  latestDate: string | null;
  /** True when the latest daily row is stamped today (UTC) or later. */
  isFresh: boolean;
  /** Always false until an upstream source table exists (see header). */
  refreshed: boolean;
  reason: string;
}

const NO_SOURCE_REASON =
  'NO_UPSTREAM_SOURCE: no raw ad-feed table exists in the variance schema; ' +
  'coverage is read-only until a metrics source is wired. No rows written.';

export async function ingestDailyMetricsForCampaign(
  campaignId: string
): Promise<DailyMetricsCoverage> {
  const campaign = await db.query<{ id: string }>(
    'SELECT id FROM campaigns WHERE id = $1',
    [campaignId]
  );
  if (campaign.rows.length === 0) {
    throw new Error(`[ingestion] Campaign not found: ${campaignId}`);
  }

  const metrics = await db.query<{ date: string }>(
    'SELECT date FROM campaign_metrics_daily WHERE campaign_id = $1 ORDER BY date ASC',
    [campaignId]
  );
  const dates = metrics.rows.map((r) => r.date).filter(Boolean).sort();
  const latestDate = dates.length > 0 ? dates[dates.length - 1] : null;
  const todayUtc = new Date().toISOString().slice(0, 10);

  return {
    campaignId,
    rowCount: dates.length,
    earliestDate: dates.length > 0 ? dates[0] : null,
    latestDate,
    isFresh: latestDate !== null && latestDate >= todayUtc,
    refreshed: false,
    reason: NO_SOURCE_REASON,
  };
}
