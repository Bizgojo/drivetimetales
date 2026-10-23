/**
 * PUBLICATION HOLD — durable global kill-switch for every publication write
 * (PUBLICATION-HOLD-001, commission lake-marion-permanent-hold-1433, Marc 2026-10-23).
 *
 * Ground truth: a 14:22:18 hold was overtaken 14:23:08 by a run8 RFR hook
 * (~51s race) because NO publication path checked for a hold before writing.
 * Every publication writer must call isPublicationHeld() (or
 * assertPublishAllowed()) immediately before its write, and re-read the flag
 * immediately before the terminal update so a racing worker cannot publish
 * after the hold takes effect.
 *
 * Store: public.atlas_settings row key='publication_hold' (same KV table as
 * lib/publishMode.ts — no migration). Value is a JSON envelope so set/clear
 * is self-auditing (actor + reason + timestamp persisted in the row, plus
 * server-side updated_at/updated_by); legacy plain 'held' reads as held.
 *
 * Fail direction: no row → NOT held (hold is exceptional, default open);
 * read error/throw → HELD (a DB hiccup must never release a publish).
 *
 * Covered writers (all check this flag):
 *   - app/api/admin/publish-story/route.ts (series + single)
 *   - app/api/admin/content-approval/route.ts (set_workflow_state → published)
 *   - lib/storyQueue/directPublish.ts (operator direct-publish executor)
 *   - lib/directPublish.ts (autonomous RFR hooks)
 */

export const PUBLICATION_HOLD_KEY = 'publication_hold'

/** Unmissable log marker emitted on every hold set/clear (audit trail). */
export const PUBLICATION_HOLD_MARKER = 'PUBLICATION-HOLD'

export type PublicationHoldState = {
  held: boolean
  by: string | null
  reason: string | null
  at: string | null
}

function clean(value: unknown): string {
  return String(value ?? '').trim()
}

/**
 * Parse a stored atlas_settings value. Accepts the JSON envelope written by
 * setPublicationHold/clearPublicationHold and legacy plain values
 * ('held' / 'true' / '1' → held).
 */
export function parsePublicationHold(value: unknown): PublicationHoldState {
  const raw = clean(value)
  if (!raw) return { held: false, by: null, reason: null, at: null }
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (parsed && typeof parsed === 'object') {
      return {
        held: parsed.held === true || String((parsed as { state?: unknown }).state ?? '').toLowerCase() === 'held',
        by: clean((parsed as { by?: unknown }).by) || null,
        reason: clean((parsed as { reason?: unknown }).reason) || null,
        at: clean((parsed as { at?: unknown }).at) || null,
      }
    }
  } catch {
    // Not JSON — fall through to legacy plain values.
  }
  const lowered = raw.toLowerCase()
  const held = lowered === 'held' || lowered === 'true' || lowered === '1'
  return { held, by: null, reason: null, at: null }
}

type SettingsReader = {
  from: (table: string) => any
}

function settingsClient(db: SettingsReader): SettingsReader {
  return db
}

/**
 * Read the current hold state. Never throws: read errors fail CLOSED (held)
 * so a transient DB hiccup can never release a publish; a missing row reads
 * open (the hold was never set).
 */
export async function getPublicationHold(
  db: SettingsReader,
  log: (msg: string) => void = () => {}
): Promise<PublicationHoldState> {
  try {
    const { data, error } = await settingsClient(db)
      .from('atlas_settings')
      .select('value')
      .eq('key', PUBLICATION_HOLD_KEY)
      .maybeSingle()
    if (error) {
      log(`[${PUBLICATION_HOLD_MARKER}] settings read failed (${error.message}); treating as HELD (safe direction)`)
      return { held: true, by: null, reason: `read-error: ${error.message}`, at: new Date().toISOString() }
    }
    if (!data || (data as { value?: unknown }).value == null) {
      return { held: false, by: null, reason: null, at: null }
    }
    return parsePublicationHold((data as { value?: unknown }).value)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    log(`[${PUBLICATION_HOLD_MARKER}] settings read threw (${msg}); treating as HELD (safe direction)`)
    return { held: true, by: null, reason: `read-throw: ${msg}`, at: new Date().toISOString() }
  }
}

/** True when publication is currently forbidden. Convenience for writers. */
export async function isPublicationHeld(
  db: SettingsReader,
  log: (msg: string) => void = () => {}
): Promise<boolean> {
  return (await getPublicationHold(db, log)).held
}

export class PublicationHoldError extends Error {
  code = 'publication_hold'
  hold: PublicationHoldState
  constructor(hold: PublicationHoldState) {
    super(
      `publication refused: global publication hold is ACTIVE` +
      (hold.by ? ` (set by ${hold.by}` : '') +
      (hold.reason ? ` — ${hold.reason}` : hold.by ? ')' : '') +
      `. Clear the hold before publishing.`
    )
    this.hold = hold
  }
}

/**
 * Writer guard: throws PublicationHoldError when the hold is active.
 * Call immediately before the terminal publication write (after re-reading
 * the flag — never reuse a stale pre-gate read for the final decision).
 */
export async function assertPublishAllowed(
  db: SettingsReader,
  log: (msg: string) => void = () => {}
): Promise<void> {
  const hold = await getPublicationHold(db, log)
  if (hold.held) throw new PublicationHoldError(hold)
}

function holdEnvelope(held: boolean, by: string, reason: string): string {
  return JSON.stringify({
    held,
    state: held ? 'held' : 'released',
    by: clean(by) || 'unknown',
    reason: clean(reason).slice(0, 500) || null,
    at: new Date().toISOString(),
  })
}

/**
 * Set the hold. Audited: the atlas_settings row carries actor + reason +
 * timestamp (plus server-side updated_at/updated_by), and an unmissable log
 * marker is emitted. Upsert so set is idempotent.
 */
export async function setPublicationHold(
  db: SettingsReader,
  args: { by: string; reason: string }
): Promise<PublicationHoldState> {
  const value = holdEnvelope(true, args.by, args.reason)
  const { error } = await (db as any)
    .from('atlas_settings')
    .upsert({ key: PUBLICATION_HOLD_KEY, value, updated_by: clean(args.by) || 'unknown' }, { onConflict: 'key' })
  if (error) throw new Error(`setPublicationHold failed: ${error.message}`)
  // eslint-disable-next-line no-console
  console.error(`[${PUBLICATION_HOLD_MARKER}] SET by ${clean(args.by) || 'unknown'} — ${clean(args.reason).slice(0, 500) || '(no reason)'} — all publication writes now refuse until cleared`)
  return parsePublicationHold(value)
}

/**
 * Clear the hold. Audited identically to set (row keeps actor + reason +
 * timestamp of the clear). Clearing never backfills or republishes anything.
 */
export async function clearPublicationHold(
  db: SettingsReader,
  args: { by: string; reason: string }
): Promise<PublicationHoldState> {
  const value = holdEnvelope(false, args.by, args.reason)
  const { error } = await (db as any)
    .from('atlas_settings')
    .upsert({ key: PUBLICATION_HOLD_KEY, value, updated_by: clean(args.by) || 'unknown' }, { onConflict: 'key' })
  if (error) throw new Error(`clearPublicationHold failed: ${error.message}`)
  // eslint-disable-next-line no-console
  console.error(`[${PUBLICATION_HOLD_MARKER}] CLEARED by ${clean(args.by) || 'unknown'} — ${clean(args.reason).slice(0, 500) || '(no reason)'}`)
  return parsePublicationHold(value)
}
