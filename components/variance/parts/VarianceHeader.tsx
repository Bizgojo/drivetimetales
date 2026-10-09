export function VarianceHeader({ campaign }: { campaign: any }) {
  return (
    <div className="card variance-header">
      <h2>{campaign.name}</h2>
      <p>
        Platform: {campaign.platform} · Genre: {campaign.genre} · Status:{" "}
        {campaign.status}
      </p>
    </div>
  );
}
