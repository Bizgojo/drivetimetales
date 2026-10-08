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

  const fetchVariance = async () => {
    setLoading(true);
    const res = await fetch(`/api/marketing/campaigns/${campaignId}/variance`);
    const json = await res.json();
    setData(json);
    setLoading(false);
  };

  useEffect(() => {
    fetchVariance();
  }, [campaignId]);

  if (loading || !data) return <div>Loading…</div>;

  return (
    <div className="variance-page">
      <VarianceHeader campaign={data.campaign} />
      <RefreshButton onClick={fetchVariance} />

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
