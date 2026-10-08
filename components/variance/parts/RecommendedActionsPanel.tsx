export function RecommendedActionsPanel({ actions }: { actions: any }) {
  return (
    <div className="actions-panel">
      <div className="card good-actions">
        <h3>Good Variance Actions</h3>
        <ul>{actions.good.map((a: string, i: number) => <li key={i}>{a}</li>)}</ul>
      </div>

      <div className="card bad-actions">
        <h3>Bad Variance Actions</h3>
        <ul>{actions.bad.map((a: string, i: number) => <li key={i}>{a}</li>)}</ul>
      </div>
    </div>
  );
}
