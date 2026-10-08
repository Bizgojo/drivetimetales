export function VarianceSummaryCard({ summary }: { summary: any }) {
  return (
    <div className="card summary-card">
      <h2>Variance Summary</h2>
      <div className="summary-grid">
        {Object.entries(summary).map(([key, value]: any) => (
          <div key={key} className="summary-item">
            <h3>{key.toUpperCase()}</h3>
            <p>Forecast: {value.forecast}</p>
            <p>Actual: {value.actual}</p>
            {value.variance !== undefined && (
              <p className="variance">
                Variance: {value.variance.toFixed(1)}%
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
