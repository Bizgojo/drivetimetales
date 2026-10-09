"use client";

import { useEffect, useState } from "react";
import {
  VarianceHeader,
  VarianceSummaryCard,
  DiagnosticGrid,
  VarianceChartsRow,
  RootCauseCard,
  RecommendedActionsPanel,
  AgentInstructionsPanel,
  VarianceTimeline,
  RefreshButton
} from "./parts";

type Props = { campaignId: string };

export default function VarianceAnalysisPage({ campaignId }: Props) {
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchVariance = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/marketing/campaigns/${encodeURIComponent(campaignId)}/variance`, { cache: "no-store" });
      if (!res.ok) throw new Error(`Request failed (HTTP ${res.status})`);
      setData(await res.json());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to regenerate");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVariance();
  }, [campaignId]);

  if (loading && !data) return <div>Loading…</div>;
  if (!data) return <div role="alert">{error || "No analysis available"} <button onClick={fetchVariance}>Retry</button></div>;

  return (
    <div className="variance-page">
      <VarianceHeader campaign={data.campaign} />
      <RefreshButton onClick={fetchVariance} disabled={loading} />
      {error && <p role="alert">{error}. Previous analysis remains visible.</p>}
      <section aria-label="Data freshness" style={{ padding: 14, border: "1px solid #d97706", borderRadius: 8, margin: "12px 0" }}>
        <strong>{data.dataCoverage?.refreshed ? "Upstream data refreshed" : "Regenerated from stored data, not a live advertising feed"}</strong>
        <p>{data.dataCoverage?.reason || "Upstream freshness is unverified."}</p>
        <p>Latest source row: {data.dataCoverage?.latestDate || "Unavailable"} · Generated: {data.generatedAt ? new Date(data.generatedAt).toLocaleString() : "Unknown"}</p>
        {!data.dataCoverage?.isFresh && <p>Warning: metrics may be stale.</p>}
      </section>

      <VarianceSummaryCard summary={data.summary} />
      <DiagnosticGrid diagnostics={data.diagnostics} />
      <VarianceChartsRow charts={data.charts} />
      <RootCauseCard rootCause={data.rootCause} />
      <RecommendedActionsPanel actions={data.actions} />
      <AgentInstructionsPanel instructions={data.agentInstructions} />
      <VarianceTimeline timeline={data.timeline} />
    </div>
  );
}
