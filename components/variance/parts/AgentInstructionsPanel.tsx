export function AgentInstructionsPanel({ instructions }: { instructions: any }) {
  return (
    <div className="card agent-instructions">
      <h2>Agent Instructions</h2>
      {Object.entries(instructions).map(([agent, items]: any) => (
        <div key={agent} className="agent-block">
          <h3>{agent.toUpperCase()}</h3>
          <ul>{items.map((i: string, idx: number) => <li key={idx}>{i}</li>)}</ul>
        </div>
      ))}
    </div>
  );
}
