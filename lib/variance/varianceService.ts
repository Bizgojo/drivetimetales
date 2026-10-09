import { SummaryEngine } from "./summaryEngine";
import { DiagnosticsEngine } from "./diagnosticsEngine";
import { RootCauseEngine } from "./rootCauseEngine";
import { ActionsEngine } from "./actionsEngine";
import { AgentInstructionEngine } from "./agentInstructionEngine";
import { buildTimeline } from "./timelineEngine";
import { ingestDailyMetricsForCampaign } from "@/lib/ad/ingestion";

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
// DB stubs
async function getCampaignById(id: string) { /* ... */ }
async function getForecastMetrics(campaignId: string) { /* ... */ }
async function getActualMetrics(campaignId: string) { /* ... */ }
async function getCreativePerformance(campaignId: string) { /* ... */ }
async function getAudiencePerformance(campaignId: string) { /* ... */ }
async function getFunnelPerformance(campaignId: string) { /* ... */ }
async function getStorySignals(campaignId: string) { /* ... */ }
async function getExternalSignals(campaignId: string) { /* ... */ }
async function saveVarianceSnapshot(campaignId: string, payload: any) { /* ... */ }
