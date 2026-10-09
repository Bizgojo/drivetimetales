export function RefreshButton({ onClick, disabled = false }: { onClick: () => void; disabled?: boolean }) {
  return <button className="refresh-button" onClick={onClick} disabled={disabled}>
    {disabled ? "Regenerating…" : "Regenerate Analysis"}
  </button>;
}
