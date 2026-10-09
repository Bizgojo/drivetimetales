import { SummaryEngine } from "./summaryEngine";
import { DiagnosticsEngine } from "./diagnosticsEngine";
import { RootCauseEngine } from "./rootCauseEngine";
import { ActionsEngine } from "./actionsEngine";
import { AgentInstructionEngine } from "./agentInstructionEngine";
import { buildTimeline } from "./timelineEngine";
import { ingestDailyMetricsForCampaign } from "@/lib/ad/ingestion";
import { db, getSupabaseServiceClient } from "@/lib/db";

export async function getCampaignVariance(campaignId: string) {
  await ingestDailyMetricsForCampaign(campaignId);

  const campaign = await getCampaignById(campaignId);
  const forecast = await getForecastMetrics(campaignId);
  const actual = await getActualMetrics(campaignId);

  const summary = SummaryEngine(forecast, actual);

  const diagnostics = DiagnosticsEngine({
    creative: await getCreativePerformance(campaignId),
    audience: await getAudiencePerformance(campaignId),
    funnel: await getFunnelPerformance(campaignId),
    story: await getStorySignals(campaignId),
    external: await getExternalSignals(campaignId)
  });

  const rootCause = RootCauseEngine(summary, diagnostics);
  const actions = ActionsEngine(summary, diagnostics, rootCause);
  const agentInstructions = AgentInstructionEngine(actions, rootCause);
  const timeline = await buildTimeline(campaignId);

  const payload = {
    campaign,
    summary,
    diagnostics,
    charts: {
      cacVsForecast: actual.cacSeries,
      trialsVsForecast: actual.trialsSeries,
      subsVsForecast: actual.subsSeries
    },
    rootCause,
    actions,
    agentInstructions,
    timeline
  };

  await saveVarianceSnapshot(campaignId, payload);

  return payload;
}
// DB accessors (VARIANCE-MODULES-001) — minimal reads against the real
// variance tables (migrations/20261008_variance_bundle.sql) via lib/db.
// saveVarianceSnapshot is append-only: campaign_variance has no UNIQUE
// constraint on campaign_id, so upsert-onConflict is unsafe; latest row wins.
async function getCampaignById(id: string) {
  const res = await db.query(
    `SELECT id, name, platform, genre, status, start_date, end_date, created_at
     FROM campaigns
     WHERE id = $1`,
    [id]
  );
  if (res.rows.length === 0) {
    throw new Error(`[varianceService] Campaign not found: ${id}`);
  }
  return res.rows[0];
}

async function getForecastMetrics(campaignId: string) {
  const res = await db.query(
    `SELECT trials, subs, cac
     FROM campaign_forecasts
     WHERE campaign_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [campaignId]
  );
  if (res.rows.length === 0) {
    throw new Error(`[varianceService] No forecast for campaign: ${campaignId}`);
  }
  return res.rows[0];
}

async function getActualMetrics(campaignId: string) {
  const res = await db.query(
    `SELECT date, trials, subs, cac
     FROM campaign_metrics_daily
     WHERE campaign_id = $1
     ORDER BY date ASC`,
    [campaignId]
  );
  const rows = res.rows as Array<{ date: string; trials: number; subs: number; cac: number }>;
  const num = (v: any) => (typeof v === 'number' ? v : Number(v) || 0);
  const cacValues = rows.map((r) => num(r.cac)).filter((v) => v > 0);
  return {
    trials: rows.reduce((sum, r) => sum + num(r.trials), 0),
    subs: rows.reduce((sum, r) => sum + num(r.subs), 0),
    // Average of non-zero daily CAC; 0 when no daily rows exist.
    cac: cacValues.length > 0
      ? cacValues.reduce((sum, v) => sum + v, 0) / cacValues.length
      : 0,
    cacSeries: rows.map((r) => ({ date: r.date, value: num(r.cac) })),
    trialsSeries: rows.map((r) => ({ date: r.date, value: num(r.trials) })),
    subsSeries: rows.map((r) => ({ date: r.date, value: num(r.subs) }))
  };
}

async function getCreativePerformance(campaignId: string) {
  const res = await db.query(
    `SELECT creative_id, finding, delta
     FROM creative_performance
     WHERE campaign_id = $1
     ORDER BY created_at ASC`,
    [campaignId]
  );
  return res.rows;
}

async function getAudiencePerformance(campaignId: string) {
  const res = await db.query(
    `SELECT audience_id, finding, delta
     FROM audience_performance
     WHERE campaign_id = $1
     ORDER BY created_at ASC`,
    [campaignId]
  );
  return res.rows;
}

async function getFunnelPerformance(campaignId: string) {
  const res = await db.query(
    `SELECT stage, finding, delta
     FROM funnel_performance
     WHERE campaign_id = $1
     ORDER BY created_at ASC`,
    [campaignId]
  );
  return res.rows;
}

async function getStorySignals(campaignId: string) {
  const res = await db.query(
    `SELECT signal, finding, delta
     FROM story_signals
     WHERE campaign_id = $1
     ORDER BY created_at ASC`,
    [campaignId]
  );
  return res.rows;
}

async function getExternalSignals(campaignId: string) {
  const res = await db.query(
    `SELECT signal, finding, delta
     FROM external_signals
     WHERE campaign_id = $1
     ORDER BY created_at ASC`,
    [campaignId]
  );
  return res.rows;
}

async function saveVarianceSnapshot(campaignId: string, payload: any) {
  const sb = getSupabaseServiceClient();
  const { error } = await sb.from('campaign_variance').insert({
    campaign_id: campaignId,
    summary: payload.summary ?? {},
    diagnostics: payload.diagnostics ?? {},
    charts: payload.charts ?? {},
    root_cause: payload.rootCause ?? {},
    actions: payload.actions ?? {},
    agent_instructions: payload.agentInstructions ?? {},
    timeline: payload.timeline ?? []
  });
  if (error) {
    throw new Error(`[varianceService] Snapshot insert failed: ${error.message}`);
  }
}
