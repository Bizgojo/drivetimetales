/**
 * ATLAS PUBLISH-MODE SWITCH — Rule 4 build tests (2026-10-11).
 *
 * Covers: default direct seeds correctly (parse + read fallback), direct
 * auto-promotes, rfr holds with ZERO writes, manual path payload parity,
 * guard failures hold, transition-matrix legality.
 *
 * NOTE: the manual admin paths (content-approval set_workflow_state,
 * publish-story POST) are intentionally NOT imported or modified here —
 * parity is asserted against their documented column sets.
 */

import {
  PUBLISH_MODE_KEY,
  PUBLISH_MODE_DEFAULT,
  FIRST_PUBLISH_MARKER,
  DIRECT_PUBLISH_REASON_PREFIX,
  parsePublishMode,
  getPublishMode,
} from '@/lib/publishMode'
import {
  DIRECT_PUBLISH_UPDATE_KEYS,
  buildDirectPublishUpdate,
  decidePostRfrAction,
  evaluateSingleDirectReadiness,
  evaluateSeriesDirectReadiness,
  maybeDirectPublishStandalone,
  maybeDirectPublishSeries,
} from '@/lib/directPublish'
import { transitionAllowed } from '@/lib/workflowTransitions'

// ── Minimal supabase-js mock (thenable builders for the exact chains used) ──

type Row = Record<string, unknown>

function makeDb(opts: {
  settingsValue?: string | null
  settingsError?: string | null
  stories?: Row[]
  auditHasDirect?: boolean
  failUpdateOn?: string[]
}) {
  const writes: Array<{ table: string; op: string; payload?: unknown; filter?: unknown }> = []
  const stories = (opts.stories ?? []).map((r) => ({ ...r }))
  const failOn = new Set(opts.failUpdateOn ?? [])

  const table = (name: string) => {
    const builder: any = {
      _filters: [] as Array<[string, unknown]>,
      _like: null as [string, string] | null,
      _limit: null as number | null,
      select(_cols: string) { return builder },
      eq(col: string, val: unknown) { builder._filters.push([col, val]); return builder },
      in(col: string, vals: unknown[]) { builder._filters.push([col, vals]); return builder },
      like(col: string, pattern: string) { builder._like = [col, pattern]; return builder },
      limit(n: number) { builder._limit = n; return builder },
      update(payload: Row) {
        return {
          eq: (col: string, val: unknown) => {
            const target = col === 'id' ? String(val) : null
            if (target && failOn.has(target)) {
              return Promise.resolve({ data: null, error: { message: 'boom' } })
            }
            writes.push({ table: name, op: 'update', payload, filter: { [col]: val } })
            for (const s of stories) {
              if (target && String(s.id) === target) Object.assign(s, payload)
              if (col === 'series_id') {
                // series-wide update applies to every matching episode
                if (String(s.series_id) === String(val)) Object.assign(s, payload)
              }
            }
            return Promise.resolve({ data: null, error: null })
          },
        }
      },
      insert(row: Row | Row[]) {
        writes.push({ table: name, op: 'insert', payload: row })
        return Promise.resolve({ data: null, error: null })
      },
      maybeSingle: async () => {
        if (name === 'atlas_settings') {
          if (opts.settingsError) return { data: null, error: { message: opts.settingsError } }
          if (opts.settingsValue == null) return { data: null, error: null }
          return { data: { value: opts.settingsValue }, error: null }
        }
        const rows = applyFilters(name)
        return { data: rows[0] ?? null, error: null }
      },
      single: async () => {
        const rows = applyFilters(name)
        return { data: rows[0] ?? null, error: null }
      },
      // thenable: `await db.from(...).select(...).eq(...)` resolves {data,error}
      then(resolve: any, reject: any) {
        return Promise.resolve({ data: applyFilters(name), error: null }).then(resolve, reject)
      },
    }
    function applyFilters(t: string): Row[] {
      if (t === 'story_workflow_audit') {
        if (builder._like && builder._like[0] === 'reason') {
          const prefix = builder._like[1].replace(/%$/, '')
          return (opts.auditHasDirect ? [{ id: 'prior' }] : []).filter(() =>
            DIRECT_PUBLISH_REASON_PREFIX.startsWith(prefix) || prefix.startsWith('PUBLISH-MODE')
          )
        }
        return []
      }
      if (t !== 'stories') return []
      return stories.filter((s) =>
        builder._filters.every(([col, val]) => {
          if (Array.isArray(val)) return val.map(String).includes(String(s[col]))
          return String(s[col] ?? '') === String(val ?? '')
        })
      )
    }
    return builder
  }

  return { db: { from: table }, writes, stories }
}

function readyStory(overrides: Row = {}): Row {
  return {
    id: 'story-1',
    title: 'The Night Ferry',
    author: 'Test Author',
    genre: 'mystery',
    audio_url: 'https://cdn.example/final_mix.mp3',
    cover_url: 'https://cdn.example/cover.jpg',
    description: 'A ferry captain notices one passenger too many.',
    duration_mins: 15,
    status: 'audio_ready',
    is_hidden: true,
    review_status: 'pending',
    workflow_state: 'ready_for_review',
    published_on: null,
    series_id: null,
    episode_number: null,
    series_number: null,
    announcement_url: 'https://cdn.example/ann.mp3',
    announcement_text: 'Welcome back to the night ferry.',
    script: 'NARRATOR: The ferry left at midnight.',
    ...overrides,
  }
}

// ── 1. Default seeds direct ─────────────────────────────────────────────────

describe('publish_mode default (Canon Rule 4 initial = direct)', () => {
  test('PUBLISH_MODE_DEFAULT is direct', () => {
    expect(PUBLISH_MODE_DEFAULT).toBe('direct')
  })

  test('parsePublishMode: rfr parses, everything else falls back to direct', () => {
    expect(parsePublishMode('rfr')).toBe('rfr')
    expect(parsePublishMode('RFR')).toBe('rfr')
    expect(parsePublishMode('direct')).toBe('direct')
    expect(parsePublishMode(undefined)).toBe('direct')
    expect(parsePublishMode(null)).toBe('direct')
    expect(parsePublishMode('')).toBe('direct')
    expect(parsePublishMode('banana')).toBe('direct')
  })

  test('getPublishMode reads the single setting row', async () => {
    const { db } = makeDb({ settingsValue: 'rfr' })
    await expect(getPublishMode(db as never)).resolves.toBe('rfr')
  })

  test('getPublishMode falls back to direct when the row is absent (pre-migration)', async () => {
    const missing = makeDb({ settingsValue: null })
    await expect(getPublishMode(missing.db as never)).resolves.toBe('direct')
  })

  // 3-fix N1: a real read error holds at RFR — a transient DB hiccup must
  // never trigger an unreviewed publish.
  test('getPublishMode holds at rfr on query error', async () => {
    const errored = makeDb({ settingsError: 'connection reset by peer' })
    await expect(getPublishMode(errored.db as never)).resolves.toBe('rfr')
  })

  test('getPublishMode holds at rfr when the read throws', async () => {
    const throwing = { from: () => { throw new Error('conn reset') } }
    await expect(getPublishMode(throwing as never)).resolves.toBe('rfr')
  })
})

// ── 2. rfr holds with ZERO writes ───────────────────────────────────────────

describe('rfr mode holds exactly as today', () => {
  test('standalone: no stories/audit writes under rfr', async () => {
    const { db, writes } = makeDb({ settingsValue: 'rfr', stories: [readyStory()] })
    const report = await maybeDirectPublishStandalone(db as never, { storyId: 'story-1', jobId: 'job-1' })
    expect(report.mode).toBe('rfr')
    expect(report.action).toBe('held')
    expect(writes.filter((w) => w.table === 'stories')).toHaveLength(0)
    expect(writes.filter((w) => w.table === 'story_workflow_audit')).toHaveLength(0)
  })

  test('series: no writes under rfr', async () => {
    const { db, writes } = makeDb({ settingsValue: 'rfr', stories: [readyStory({ id: 's1' })] })
    const report = await maybeDirectPublishSeries(db as never, { seriesId: 'ser-1', episodeIds: ['s1'], jobId: 'job-1' })
    expect(report.mode).toBe('rfr')
    expect(report.action).toBe('held')
    expect(writes).toHaveLength(0)
  })

  test('decidePostRfrAction holds in rfr even when readiness passes', () => {
    expect(decidePostRfrAction('rfr', { ok: true })).toBe('hold')
  })
})

// ── 3. direct auto-promotes ─────────────────────────────────────────────────

describe('direct mode auto-promotes after all gates pass', () => {
  test('standalone publishes via the legal two-step with parity payload', async () => {
    const { db, writes, stories } = makeDb({ settingsValue: 'direct', stories: [readyStory()] })
    const report = await maybeDirectPublishStandalone(db as never, { storyId: 'story-1', jobId: 'job-9' })
    expect(report.mode).toBe('direct')
    expect(report.action).toBe('published')
    expect(report.transitions).toEqual(['ready_for_review→approved_ready', 'approved_ready→published'])
    expect(report.firstAutoPublish).toBe(true)

    const storyWrites = writes.filter((w) => w.table === 'stories' && w.op === 'update')
    expect(storyWrites).toHaveLength(2)
    // Terminal payload sets the public-live columns exactly as the manual writer.
    const terminal = storyWrites[1].payload as Row
    expect(terminal.status).toBe('published')
    expect(terminal.workflow_state).toBe('published')
    expect(terminal.is_hidden).toBe(false)
    expect(typeof terminal.published_on).toBe('string')

    // ORION-GOV-006: one audit row per transition.
    const audits = writes.filter((w) => w.table === 'story_workflow_audit')
    expect(audits.map((a) => (a.payload as Row).to_state)).toEqual(['approved_ready', 'published'])
    expect(String((audits[1].payload as Row).reason)).toContain(FIRST_PUBLISH_MARKER)

    // Row actually flipped live.
    expect(stories[0].status).toBe('published')
    expect(stories[0].is_hidden).toBe(false)
  })

  test('first-publish marker fires only once', async () => {
    const first = makeDb({ settingsValue: 'direct', stories: [readyStory()], auditHasDirect: false })
    const r1 = await maybeDirectPublishStandalone(first.db as never, { storyId: 'story-1', jobId: 'job-1' })
    expect(r1.firstAutoPublish).toBe(true)
    const second = makeDb({ settingsValue: 'direct', stories: [readyStory({ id: 'story-2' })], auditHasDirect: true })
    const r2 = await maybeDirectPublishStandalone(second.db as never, { storyId: 'story-2', jobId: 'job-2' })
    expect(r2.firstAutoPublish).toBe(false)
  })

  test('series publishes as a unit; never split across modes', async () => {
    const eps = [1, 2, 3].map((n) =>
      readyStory({ id: `ep-${n}`, series_id: 'ser-9', episode_number: n })
    )
    const { db, writes } = makeDb({ settingsValue: 'direct', stories: eps })
    const report = await maybeDirectPublishSeries(db as never, {
      seriesId: 'ser-9',
      episodeIds: ['ep-1', 'ep-2', 'ep-3'],
      jobId: 'job-s',
    })
    expect(report.action).toBe('published')
    expect(report.transitions).toHaveLength(3)
    const terminals = writes.filter((w) => w.table === 'stories' && w.op === 'update' && (w.payload as Row).workflow_state === 'published')
    expect(terminals).toHaveLength(3)
  })
})

// ── 4. Guard failures hold at RFR (mode never rescues a blocked story) ──────

describe('direct-publish guards hold instead of publishing', () => {
  test('missing announcement_url (personalization guard) holds', async () => {
    const { db, writes } = makeDb({
      settingsValue: 'direct',
      stories: [readyStory({ announcement_url: null })],
    })
    const report = await maybeDirectPublishStandalone(db as never, { storyId: 'story-1', jobId: 'job-1' })
    expect(report.action).toBe('held_blocked')
    expect(report.blockers?.join(' ')).toMatch(/announcement_url/)
    expect(writes.filter((w) => w.table === 'stories')).toHaveLength(0)
  })

  test('series with an episode gap holds the whole unit', () => {
    const eps = [
      readyStory({ id: 'ep-1', series_id: 'ser-g', episode_number: 1 }),
      readyStory({ id: 'ep-3', series_id: 'ser-g', episode_number: 3 }),
    ]
    const readiness = evaluateSeriesDirectReadiness(eps)
    expect(readiness.ok).toBe(false)
    expect(decidePostRfrAction('direct', readiness)).toBe('hold')
  })

  test('standalone series member blocked by earlier unpublished episode holds', () => {
    const ep2 = readyStory({ id: 'ep-2', series_id: 'ser-o', episode_number: 2 });
    (ep2 as Row).workflow_state = 'ready_for_review'
    const ep1 = readyStory({ id: 'ep-1', series_id: 'ser-o', episode_number: 1 });
    (ep1 as Row).workflow_state = 'ready_for_review'
    const readiness = evaluateSingleDirectReadiness(ep2, [ep1, ep2])
    expect(readiness.ok).toBe(false)
    expect(decidePostRfrAction('direct', readiness)).toBe('hold')
  })

  test('write failure mid-promotion reports held_blocked, never partial-live silently', async () => {
    const { db } = makeDb({
      settingsValue: 'direct',
      stories: [readyStory()],
      failUpdateOn: ['story-1'],
    })
    const report = await maybeDirectPublishStandalone(db as never, { storyId: 'story-1', jobId: 'job-1' })
    expect(report.action).toBe('held_blocked')
    expect(report.blockers?.[0]).toMatch(/boom|failed/)
  })
})

// ── 5. Manual path unchanged + payload parity ───────────────────────────────

describe('manual path contract (prove we did not diverge)', () => {
  test('terminal payload keys match the manual publish-story writer column set', () => {
    // Manual writer sets exactly these columns on publish (single + series):
    // status, workflow_state, is_hidden, published_on,
    // workflow_state_changed_by/_at/_reason.
    expect([...DIRECT_PUBLISH_UPDATE_KEYS].sort()).toEqual(
      [
        'status',
        'workflow_state',
        'is_hidden',
        'published_on',
        'workflow_state_changed_by',
        'workflow_state_changed_at',
        'workflow_state_change_reason',
      ].sort()
    )
    const payload = buildDirectPublishUpdate({ reason: `${DIRECT_PUBLISH_REASON_PREFIX}: test` })
    expect(Object.keys(payload).sort()).toEqual([...DIRECT_PUBLISH_UPDATE_KEYS].sort())
    expect(payload.status).toBe('published')
    expect(payload.is_hidden).toBe(false)
    expect(payload.workflow_state_changed_by).toBe('autonomous-runner')
  })

  test('both auto edges are legal in the canonical matrix', () => {
    expect(transitionAllowed('ready_for_review', 'approved_ready')).toBe(true)
    expect(transitionAllowed('approved_ready', 'published')).toBe(true)
    // And the shortcut we must never take stays illegal:
    expect(transitionAllowed('ready_for_review', 'published')).toBe(false)
  })

  test('setting key constant matches the migration seed', () => {
    expect(PUBLISH_MODE_KEY).toBe('publish_mode')
  })
})

// ── 6. 3-fix N2: series mid-loop guard (Rule 3, partial-write safety) ───────

describe('series mid-loop re-verify guard (3-fix N2)', () => {
  test('pre-published episode is skipped, rest still promote as a unit', async () => {
    // ep-1 went live via a prior partial run (or a manual publish); ep-2/3
    // are freshly at RFR. The loop must NOT re-promote ep-1.
    const eps = [
      readyStory({ id: 'ep-1', series_id: 'ser-9', episode_number: 1, workflow_state: 'published', status: 'published', is_hidden: false }),
      readyStory({ id: 'ep-2', series_id: 'ser-9', episode_number: 2 }),
      readyStory({ id: 'ep-3', series_id: 'ser-9', episode_number: 3 }),
    ]
    const { db, writes, stories } = makeDb({ settingsValue: 'direct', stories: eps })
    const report = await maybeDirectPublishSeries(db as never, {
      seriesId: 'ser-9',
      episodeIds: ['ep-1', 'ep-2', 'ep-3'],
      jobId: 'job-n2',
    })
    expect(report.action).toBe('published')
    // ep-1 skipped, ep-2 + ep-3 each promoted through the legal two-step.
    expect(report.transitions).toContain('ep-1:skipped_already_published')
    expect(report.transitions?.filter((t) => t.startsWith('ep-1:'))).toHaveLength(1)
    const ep1Writes = writes.filter(
      (w) => w.table === 'stories' && (w.filter as Row)?.id === 'ep-1'
    )
    expect(ep1Writes).toHaveLength(0)
    const terminals = writes.filter(
      (w) => w.table === 'stories' && w.op === 'update' && (w.payload as Row).workflow_state === 'published'
    )
    expect(terminals).toHaveLength(2)
    // Whole unit ends live.
    for (const s of stories) expect(s.workflow_state).toBe('published')
  })
})

// ── 7. 3-fix N3: standalone refuses series members (defense-in-depth) ───────

describe('standalone series-member guard (3-fix N3)', () => {
  test('series member routed to the standalone hook holds at RFR with zero writes', async () => {
    const { db, writes } = makeDb({
      settingsValue: 'direct',
      stories: [readyStory({ id: 'ep-2', series_id: 'ser-x', episode_number: 2 })],
    })
    const report = await maybeDirectPublishStandalone(db as never, { storyId: 'ep-2', jobId: 'job-n3' })
    expect(report.mode).toBe('direct')
    expect(report.action).toBe('held_blocked')
    expect(report.blockers?.join(' ')).toMatch(/series member|series hook/)
    expect(writes.filter((w) => w.table === 'stories')).toHaveLength(0)
    expect(writes.filter((w) => w.table === 'story_workflow_audit')).toHaveLength(0)
  })
})
