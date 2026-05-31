export function sanitizeSeriesTitle(name: string | null | undefined): string | null {
  if (!name) return name ?? null
  return name
    .replace(/^\[Series\]\s*/i, "")
    .replace(/\s*—\s*\d+\s*Episodes?\s*$/i, "")
    .trim() || null
}

/*
sanitizeSeriesTitle("[Series] The Ledger Room — 3 Episodes") === "The Ledger Room"
sanitizeSeriesTitle("The Ledger Room") === "The Ledger Room"
sanitizeSeriesTitle(null) === null
*/
