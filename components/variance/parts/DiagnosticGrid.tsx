export function DiagnosticGrid({ diagnostics }: { diagnostics: any }) {
  return (
    <div className="diagnostic-grid">
      {Object.entries(diagnostics).map(([category, items]: any) => (
        <DiagnosticCard key={category} title={category} items={items} />
      ))}
    </div>
  );
}

function DiagnosticCard({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="card diagnostic-card">
      <h3>{title}</h3>
      <ul>
        {items.map((i, idx) => (
          <li key={idx}>{i}</li>
        ))}
      </ul>
    </div>
  );
}
