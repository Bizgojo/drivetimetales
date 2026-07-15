/**
 * ORION-ANALYTICS-GAP-001 (2026-07-15): play_events sessions only started on
 * user-gesture play. Auto-advanced and autoplay episode starts created ZERO
 * play_events rows (proven on walk account gvlwalk0715a/69c3ab3a) — Ep2/Ep3 of
 * a series listen were invisible, blinding the Ep1→Ep2 continuation metric
 * (the spine of the GVL A/B/C ad test).
 *
 * Pins:
 *   1. auto-advance playback start creates an analytics session
 *   2. autoplay playback start creates an analytics session
 *   3. start_source discriminator encoded in existing `origin` column
 *      ('gesture' keeps acquisition origin; no schema change, no migration)
 *   4. diagnostic stop_reasons (tab_hidden, playback_error) accepted + emitted
 *   5. stop_reason emitted on natural end (completed)
 *   6. spurious-ended beacon wired into every ORION-PLAYER-ENDED-001 guard path
 */
import fs from 'fs'
import path from 'path'

const player = fs.readFileSync(
  path.join(process.cwd(), 'components/player/CanonicalPlayer.tsx'),
  'utf8'
)
const analytics = fs.readFileSync(
  path.join(process.cwd(), 'lib/analytics.ts'),
  'utf8'
)
const apiRoute = fs.readFileSync(
  path.join(process.cwd(), 'app/api/analytics/play-event/route.ts'),
  'utf8'
)

describe('ORION-ANALYTICS-GAP-001: auto-started playback creates analytics sessions', () => {
  test('single session entry point exists and every start passes a start source', () => {
    expect(player).toMatch(/const startAnalyticsSession = \(startSource: PlayStartSource\)/)
    // Entry point guards double-starts exactly like the old inline block did
    const helper = player.slice(
      player.indexOf('const startAnalyticsSession'),
      player.indexOf('const startAnalyticsSession') + 700
    )
    expect(helper).toMatch(/if \(analyticsTrackedRef\.current\) return/)
    expect(helper).toMatch(/trackPlayStart\(\{/)
    expect(helper).toMatch(/startSource,/)
  })

  test('auto-advance start creates a session (seriesContinue/autoAdvance → auto_advance)', () => {
    // The autoplay effect (the previously-invisible path) derives the source…
    expect(player).toMatch(
      /params\.get\('seriesContinue'\) === '1' \|\| params\.get\('autoAdvance'\) === '1'\s*\?\s*'auto_advance'/
    )
    // …and starts the session on successful play()
    const attemptIdx = player.indexOf('const autoStartSource: PlayStartSource')
    expect(attemptIdx).toBeGreaterThan(-1)
    const attemptBlock = player.slice(attemptIdx, attemptIdx + 1200)
    expect(attemptBlock).toMatch(/startAnalyticsSession\(autoStartSource\)/)
    // Session start fires on the resolved play() promise, not on the blocked path
    expect(attemptBlock.indexOf('startAnalyticsSession(autoStartSource)')).toBeLessThan(
      attemptBlock.indexOf('setAutoplayBlocked(true)')
    )
  })

  test('autoplay start creates a session (plain autoplay intent → autoplay)', () => {
    const ternary = player.slice(
      player.indexOf('const autoStartSource: PlayStartSource'),
      player.indexOf('const autoStartSource: PlayStartSource') + 400
    )
    expect(ternary).toMatch(/:\s*'autoplay'/)
  })

  test('gesture play button still starts a session as gesture', () => {
    expect(player).toMatch(/startAnalyticsSession\('gesture'\)/)
  })
})

describe('ORION-ANALYTICS-GAP-001: start_source encoded without schema change', () => {
  test('lib/analytics maps non-gesture start source into the existing origin column', () => {
    expect(analytics).toMatch(/export type PlayStartSource = 'gesture' \| 'autoplay' \| 'auto_advance'/)
    expect(analytics).toMatch(
      /const origin = startSource === 'gesture' \? acquisitionOrigin : startSource/
    )
    // API payload carries the discriminator
    expect(analytics).toMatch(/action: 'start',[\s\S]{0,200}startSource,/)
  })

  test('API route whitelists start sources and never clobbers gesture acquisition origin', () => {
    expect(apiRoute).toMatch(/VALID_START_SOURCES = new Set\(\['gesture', 'autoplay', 'auto_advance'\]\)/)
    expect(apiRoute).toMatch(
      /startSource && startSource !== 'gesture' && VALID_START_SOURCES\.has\(startSource\)\s*\?\s*startSource\s*:\s*stringOrNull\(body\?\.origin\) \|\| 'direct'/
    )
  })

  test('no play_events schema change and no new migration (hard limit)', () => {
    const migrationsDir = path.join(process.cwd(), 'supabase/migrations')
    const migrations = fs.readdirSync(migrationsDir)
    // The play_events table is defined once; this task must not add DDL for it.
    const playEventsDdl = migrations.filter((f) => {
      const body = fs.readFileSync(path.join(migrationsDir, f), 'utf8')
      return /alter table (public\.)?play_events add column|create table.*play_events/i.test(body)
    })
    expect(playEventsDdl).toEqual(['20260527000_create_play_events.sql'])
  })
})

describe('ORION-ANALYTICS-GAP-001: diagnostic stop_reasons', () => {
  test('stop_reason emitted on natural end (completed)', () => {
    // Natural end (single-file + ASC3 queue exhaustion) routes through
    // saveProgress(…, true), which closes the analytics session as completed.
    expect(player).toMatch(/saveProgress\(duration, true\)/)
    const saveIdx = player.indexOf('const saveProgress = async')
    expect(saveIdx).toBeGreaterThan(-1)
    const saveBlock = player.slice(saveIdx, saveIdx + 600)
    expect(saveBlock).toMatch(/if \(done && analyticsTrackedRef\.current\)/)
    expect(saveBlock).toMatch(/endAnalyticsSession\('completed'\)/)
  })

  test('API accepts the new diagnostic stop reasons', () => {
    expect(apiRoute).toMatch(/'tab_hidden',/)
    expect(apiRoute).toMatch(/'playback_error',/)
  })

  test('tab_hidden emitted when a paused session goes hidden (keepalive)', () => {
    expect(player).toMatch(
      /analyticsTrackedRef\.current && audioRef\.current\?\.paused[\s\S]{0,200}endAnalyticsSession\('tab_hidden', true\)/
    )
  })

  test('terminal player errors end the session as playback_error (both paths)', () => {
    const matches = player.match(/endAnalyticsSession\('playback_error'\)/g) || []
    expect(matches.length).toBe(2) // stall-watchdog unrecovered + final-mix retries exhausted
  })

  test('existing stop reasons still emitted (pause/nav/unload/not_for_me)', () => {
    expect(player).toMatch(/endAnalyticsSession\('manual_pause'\)/)
    expect(player).toMatch(/endAnalyticsSession\('navigated_away'\)/)
    expect(player).toMatch(/endAnalyticsSession\('app_closed', true\)/)
    expect(player).toMatch(/endAnalyticsSession\('not_for_me'\)/)
  })
})

describe('ORION-ANALYTICS-GAP-001: spurious-ended beacon (ORION-PLAYER-ENDED-001 evidence)', () => {
  test('all three guard suppress paths recover AND emit the beacon', () => {
    // Beacon accompanies recoverFromStall() in each suppress path (recovery
    // first — beacon is async fire-and-forget and must never delay it).
    for (const kind of ['unknown_duration', 'early_ended', 'duration_shortfall']) {
      const kindIdx = player.indexOf(`kind: '${kind}'`)
      expect(kindIdx).toBeGreaterThan(-1)
      const before = player.slice(Math.max(0, kindIdx - 600), kindIdx)
      expect(before).toMatch(/recoverFromStall\(\)/)
      const after = player.slice(kindIdx, kindIdx + 300)
      expect(after).toMatch(/return/)
    }
  })

  test('beacon writes a marker row: spurious_ended_recovered + diagnostic_beacon origin', () => {
    expect(analytics).toMatch(/export const SPURIOUS_ENDED_STOP_REASON = 'spurious_ended_recovered'/)
    expect(analytics).toMatch(/export const DIAGNOSTIC_BEACON_ORIGIN = 'diagnostic_beacon'/)
    expect(analytics).toMatch(/export async function trackSpuriousEndedRecovered/)
    expect(analytics).toMatch(/action: 'beacon',/)
    // Diagnostic detail string preserves the truncated-stream evidence
    expect(analytics).toMatch(/spurious_ended:\$\{params\.kind\}:at=/)
    // API route persists it server-side
    expect(apiRoute).toMatch(/if \(action === 'beacon'\)/)
    expect(apiRoute).toMatch(/stop_reason: SPURIOUS_ENDED_STOP_REASON/)
    expect(apiRoute).toMatch(/origin: DIAGNOSTIC_BEACON_ORIGIN/)
  })

  test('beacon does NOT end the live session (recovery continues playback)', () => {
    // trackSpuriousEndedRecovered must not reset session state the way
    // trackPlayEnd does.
    const fnIdx = analytics.indexOf('export async function trackSpuriousEndedRecovered')
    const fnEnd = analytics.indexOf('export async function', fnIdx + 10)
    const fnBody = analytics.slice(fnIdx, fnEnd)
    expect(fnBody).not.toMatch(/currentSessionId = null/)
    expect(fnBody).not.toMatch(/analyticsTrackedRef/)
  })

  test('beacon rows are excluded from preference aggregates', () => {
    expect(analytics).toMatch(/\.neq\('origin', DIAGNOSTIC_BEACON_ORIGIN\)/)
  })
})
