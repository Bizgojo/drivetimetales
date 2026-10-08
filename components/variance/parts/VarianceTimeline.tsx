export function VarianceTimeline({ timeline }: { timeline: any[] }) {
  return (
    <div className="card timeline-card">
      <h2>Variance Timeline</h2>
      <ul className="timeline">
        {timeline.map((event, idx) => (
          <li key={idx}>
            <span className="dot" />
            <div className="event">
              <p>{event.label}</p>
              <small>{String(event.timestamp)}</small>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
