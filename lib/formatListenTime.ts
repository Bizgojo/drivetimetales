/**
 * LISTEN-TIME-001 (Marc, Nov 12, 2026): story cards show long running times in hours and
 * minutes ("7 hr 30 min"), never as a large minute count ("450 min").
 */
export function formatListenTime(mins: number | null | undefined): string | null {
  const total = Math.round(Number(mins) || 0)
  if (total <= 0) return null
  if (total < 60) return `${total} min`
  const h = Math.floor(total / 60)
  const m = total % 60
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`
}
