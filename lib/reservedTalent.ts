/**
 * NICK-VOICE-001 (Marc 2026-10-28 10:01 EDT): "This should now become Nick's
 * voice and not used for any future stories unless it is for another Nick
 * Brennan story by the same author." Jack Malone's narrator is Nick's voice,
 * so Jack Malone is only used when a story asks for him by name
 * (queue item authorTarget = "Jack Malone", as Nick Brennan stories do).
 * Automatic author rotation skips him.
 */
export const RESERVED_AUTHORS: Record<string, string> = {
  'jack malone': 'Nick Brennan stories only (his narrator is Nick Brennan\'s voice)',
}

export function isReservedAuthor(name: string | null | undefined): boolean {
  return Boolean(RESERVED_AUTHORS[String(name || '').trim().toLowerCase()])
}

/** Authors available to automatic rotation: reserved ones only when requested by name. */
export function selectableAuthors<T extends { name: string }>(authors: T[], requestedAuthor: string): T[] {
  const requested = String(requestedAuthor || '').trim().toLowerCase()
  return authors.filter((a) => !isReservedAuthor(a.name) || a.name.trim().toLowerCase() === requested)
}
