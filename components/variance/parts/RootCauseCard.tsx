export function RootCauseCard({ rootCause }: { rootCause: any }) {
  return (
    <div className="card root-cause-card">
      <h2>Root Cause Analysis</h2>
      <p><strong>Primary:</strong> {rootCause.primary}</p>
      <p><strong>Secondary:</strong> {rootCause.secondary}</p>
      <p><strong>Tertiary:</strong> {rootCause.tertiary}</p>
    </div>
  );
}
