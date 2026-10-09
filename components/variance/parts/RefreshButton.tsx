export function RefreshButton({ onClick }: { onClick: () => void }) {
  return (
    <button className="refresh-button" onClick={onClick}>
      Refresh Variance Data
    </button>
  );
}
