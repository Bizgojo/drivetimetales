import { Suspense } from "react";
import VarianceAnalysisPage from "@/components/variance/VarianceAnalysisPage";

type Props = { params: { campaignId: string } };

export default function CampaignVariancePage({ params }: Props) {
  const { campaignId } = params;

  return (
    <div className="admin-layout">
      <header className="admin-header">
        <h1>Variance Analysis</h1>
        <p>Campaign ID: {campaignId}</p>
      </header>

      <main className="admin-main">
        <Suspense fallback={<div>Loading variance analysis…</div>}>
          <VarianceAnalysisPage campaignId={campaignId} />
        </Suspense>
      </main>
    </div>
  );
}
