export function VarianceChartsRow({ charts }: { charts: any }) {
  return (
    <div className="charts-row">
      <div className="card chart-card"><h3>CAC vs Forecast</h3></div>
      <div className="card chart-card"><h3>Trials vs Forecast</h3></div>
      <div className="card chart-card"><h3>Subs vs Forecast</h3></div>
    </div>
  );
}
