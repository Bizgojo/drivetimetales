/**
 * PERS-FIX-002 — signup hooks, user/create early-return, fallback telemetry,
 * publish-time personalization guard.
 *
 * Work-order scope (PERS-DIAG-001 / PERS-BACKFILL-001):
 *  1. Every signup path must key the account + ensure the name pool
 *     (GVL promo path never called ensureNamePoolForUser; all real signups
 *     since Jun 23 had NULL name_pronunciation_key).
 *  2. /api/user/create returned for existing rows BEFORE its ensure call.
 *  4. story-playlist silently served generic final_mix — fallbacks must be
 *     countable (personalization_fallbacks row + structured log).
 *  5. A story cannot be published with [LISTENER_NAME] in its intro/script
 *     or with NULL announcement_url (WotW slipped through exactly this way).
 */
import { readFileSync } from 'fs'
import path from 'path'

// ─── Shared supabase mock ────────────────────────────────────────────────────
// Chainable query-builder mock: each terminal (.single/.maybeSingle/await)
// consumes the next queued response for that table.

type MockResponse = { data: any; error: any; count?: number | null }
type TableResponses = Record<string, MockResponse[]>
type CallRecord = { table: string; ops: Array<[string, any[]]> }

function createSupabaseMock(responses: TableResponses) {
  const calls: CallRecord[] = []
  const next = (table: string): MockResponse => {
    const queue = responses[table]
    return queue && queue.length ? queue.shift()! : { data: null, error: null }
  }
  return {
    calls,
    from(table: string) {
      const record: CallRecord = { table, ops: [] }
      calls.push(record)
      const builder: any = {}
      for (const m of ['select', 'insert', 'update', 'upsert', 'delete', 'eq', 'neq', 'in', 'is', 'not', 'ilike', 'gte', 'order', 'limit']) {
        builder[m] = (...args: any[]) => { record.ops.push([m, args]); return builder }
      }
      builder.single = () => { record.ops.push(['single', []]); return Promise.resolve(next(table)) }
      builder.maybeSingle = () => { record.ops.push(['maybeSingle', []]); return Promise.resolve(next(table)) }
      builder.then = (onFulfilled: any, onRejected: any) => Promise.resolve(next(table)).then(onFulfilled, onRejected)
      return builder
    },
  }
}

let currentSupabase: ReturnType<typeof createSupabaseMock> | null = null

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => new Proxy({}, {
    get: (_target, prop) => {
      if (!currentSupabase) throw new Error('mock supabase not initialized')
      return (currentSupabase as any)[prop]
    },
  })),
}))

jest.mock('resend', () => ({
  Resend: class {
    emails = { send: jest.fn().mockResolvedValue({ id: 'mock' }) }
  },
}))

const mockEnsureNamePoolForUser = jest.fn()
jest.mock('@/lib/personalization/ensureNamePool', () => ({
  ensureNamePoolForUser: (...args: any[]) => mockEnsureNamePoolForUser(...args),
}))

function jsonRequest(body: any) {
  return { json: async () => body } as any
}

const repoRoot = path.resolve(__dirname, '..')
const src = (rel: string) => readFileSync(path.join(repoRoot, rel), 'utf8')

beforeEach(() => {
  mockEnsureNamePoolForUser.mockReset()
  mockEnsureNamePoolForUser.mockResolvedValue({ pronunciationKey: 'MRK', queued: false })
  currentSupabase = null
})

// ─── Item 1/2 helper: planSignupNameEnsure ───────────────────────────────────

import { planSignupNameEnsure } from '@/lib/personalization/signupEnsure'

describe('planSignupNameEnsure (never clear an existing key with an empty name)', () => {
  test('prefers the first candidate (DB first_name) over later guesses', () => {
    expect(planSignupNameEnsure(['Marion', 'happy6nana'])).toEqual({ run: true, firstName: 'Marion' })
  })

  test('falls back to the request name when DB first_name is empty', () => {
    expect(planSignupNameEnsure(['', 'Liam'])).toEqual({ run: true, firstName: 'Liam' })
    expect(planSignupNameEnsure([null, 'Liam'])).toEqual({ run: true, firstName: 'Liam' })
  })

  test('refuses to run with no usable name (ensure would clear an existing key)', () => {
    expect(planSignupNameEnsure(['', null, undefined, '   '])).toEqual({ run: false, firstName: '' })
    expect(planSignupNameEnsure([])).toEqual({ run: false, firstName: '' })
  })

  test('trims whitespace', () => {
    expect(planSignupNameEnsure(['  Ryan  '])).toEqual({ run: true, firstName: 'Ryan' })
  })
})

// ─── Item 2: /api/user/create early-return reorder ───────────────────────────

describe('/api/user/create — ensure runs for EXISTING rows before the early return', () => {
  async function callCreate(body: any, responses: TableResponses) {
    currentSupabase = createSupabaseMock(responses)
    const { POST } = require('@/app/api/user/create/route')
    const res = await POST(jsonRequest(body))
    return { res, body: await res.json() }
  }

  test('existing user: ensureNamePoolForUser runs with the DB first_name, then exists:true', async () => {
    const { res, body } = await callCreate(
      { userId: 'u-1', email: 'happy6nana@gmail.com', firstName: 'happy6nana' },
      { users: [{ data: { id: 'u-1', first_name: 'Marion', name_pronunciation_key: null }, error: null }] }
    )
    expect(res.status).toBe(200)
    expect(body).toEqual({ success: true, exists: true })
    // The bug: this call never happened for existing rows (early return at line ~32).
    expect(mockEnsureNamePoolForUser).toHaveBeenCalledTimes(1)
    expect(mockEnsureNamePoolForUser).toHaveBeenCalledWith('u-1', 'Marion')
  })

  test('existing user with no usable name anywhere: ensure is NOT called (never clears a key)', async () => {
    const { body } = await callCreate(
      { userId: 'u-2', email: 'x@y.com', firstName: '' },
      { users: [{ data: { id: 'u-2', first_name: null, name_pronunciation_key: 'MRK' }, error: null }] }
    )
    expect(body).toEqual({ success: true, exists: true })
    expect(mockEnsureNamePoolForUser).not.toHaveBeenCalled()
  })

  test('existing user: ensure failure is non-fatal (still returns exists:true)', async () => {
    mockEnsureNamePoolForUser.mockRejectedValueOnce(new Error('boom'))
    const { res, body } = await callCreate(
      { userId: 'u-3', email: 'a@b.com', firstName: 'Kim' },
      { users: [{ data: { id: 'u-3', first_name: 'Kim', name_pronunciation_key: null }, error: null }] }
    )
    expect(res.status).toBe(200)
    expect(body).toEqual({ success: true, exists: true })
  })

  test('new user: insert still runs and ensure is called with the signup name', async () => {
    const { res, body } = await callCreate(
      { userId: 'u-4', email: 'zelda@example.com', firstName: 'Zelda' },
      {
        users: [
          { data: null, error: { code: 'PGRST116', message: 'no rows' } }, // existence check
          { data: { id: 'u-4', email: 'zelda@example.com' }, error: null }, // insert
        ],
      }
    )
    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(mockEnsureNamePoolForUser).toHaveBeenCalledWith('u-4', 'Zelda')
  })
})

// ─── Item 1: promo/GVL redemption path keys the account ──────────────────────

describe('/api/promo/redeem — redemption ensures the name pool', () => {
  async function callRedeem(body: any, responses: TableResponses) {
    currentSupabase = createSupabaseMock(responses)
    const { POST } = require('@/app/api/promo/redeem/route')
    const res = await POST(jsonRequest(body))
    return { res, body: await res.json() }
  }

  const promoRow = {
    data: {
      id: 'p-1', code: 'GVL30', is_active: true, max_uses: null, uses_count: 0,
      subscription_days: 30, campaign: 'gvl', label: 'GVL', redeemed_at: null, redeemed_by_email: null,
    },
    error: null,
  }

  test('calls ensureNamePoolForUser with users.first_name after applying the promo', async () => {
    const { res, body } = await callRedeem(
      { code: 'GVL30', userId: 'u-9', email: 'rdbishop83@gmail.com' },
      {
        promo_codes: [promoRow, { data: null, error: null }],
        promo_redemptions: [
          { data: null, error: null }, // already-redeemed check (single)
          { data: null, error: null }, // insert
        ],
        users: [
          { data: { subscription_ends_at: null, subscription_type: null, plan: 'free', first_name: 'Ryan', name_pronunciation_key: null }, error: null },
          { data: null, error: null }, // subscription update
        ],
      }
    )
    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(mockEnsureNamePoolForUser).toHaveBeenCalledTimes(1)
    expect(mockEnsureNamePoolForUser).toHaveBeenCalledWith('u-9', 'Ryan')
  })

  test('does NOT call ensure when users.first_name is empty (never clears a key)', async () => {
    const { body } = await callRedeem(
      { code: 'GVL30', userId: 'u-10', email: 'noname@example.com' },
      {
        promo_codes: [promoRow, { data: null, error: null }],
        promo_redemptions: [
          { data: null, error: null },
          { data: null, error: null },
        ],
        users: [
          { data: { subscription_ends_at: null, subscription_type: null, plan: 'free', first_name: '', name_pronunciation_key: 'RN' }, error: null },
          { data: null, error: null },
        ],
      }
    )
    expect(body.success).toBe(true)
    expect(mockEnsureNamePoolForUser).not.toHaveBeenCalled()
  })
})

// ─── Item 1: promo/send-magic-link structural guarantee ──────────────────────
// (Full route execution needs twilio/resend/auth.admin plumbing; the wiring
// guarantee that matters — the GVL path calls the ensure hook after the
// profile write and before redemption logging — is asserted structurally.)

describe('/api/promo/send-magic-link — signup hook wiring', () => {
  const source = src('app/api/promo/send-magic-link/route.ts')

  test('imports ensureNamePoolForUser', () => {
    expect(source).toMatch(/import \{ ensureNamePoolForUser \} from '@\/lib\/personalization\/ensureNamePool'/)
  })

  test('calls ensureNamePoolForUser(userId, trimmedName) after the profile write, before redemption logging', () => {
    const ensureIdx = source.indexOf('await ensureNamePoolForUser(userId, trimmedName)')
    expect(ensureIdx).toBeGreaterThan(-1)
    const profileWriteIdx = source.indexOf("upsert(insertPayload, { onConflict: 'id' })")
    const redemptionIdx = source.indexOf("from('promo_redemptions')")
    expect(profileWriteIdx).toBeGreaterThan(-1)
    expect(redemptionIdx).toBeGreaterThan(-1)
    expect(ensureIdx).toBeGreaterThan(profileWriteIdx)
    expect(ensureIdx).toBeLessThan(redemptionIdx)
  })

  test('the ensure call is non-fatal (wrapped in try/catch)', () => {
    expect(source).toMatch(/try \{\s*\n\s*await ensureNamePoolForUser\(userId, trimmedName\)\s*\n\s*\} catch/)
  })
})

// ─── Item 4: fallback telemetry ──────────────────────────────────────────────

import {
  personalizedAssetGateReason,
  fallbackTelemetryRow,
  recordPersonalizationFallback,
} from '@/lib/personalization/fallbackTelemetry'

describe('personalizedAssetGateReason (mirrors buildPersonalizedQueue gates, in order)', () => {
  const fullStory = {
    announcement_url: 'https://x/announcement.mp3',
    story_audio_url: 'https://x/story_body.mp3',
    outro_with_music_url: null,
    outro_audio_url: 'https://x/outro.mp3',
  }

  test('passes when all asset gates are satisfied', () => {
    expect(personalizedAssetGateReason(fullStory, 'MRK')).toBeNull()
  })

  test('missing pronunciation key', () => {
    expect(personalizedAssetGateReason(fullStory, '')).toBe('missing_pronunciation_key')
    expect(personalizedAssetGateReason(fullStory, '   ')).toBe('missing_pronunciation_key')
  })

  test('WotW case: announcement_url NULL is the reported gate', () => {
    expect(personalizedAssetGateReason({ ...fullStory, announcement_url: null }, 'MRK'))
      .toBe('missing_announcement_url')
  })

  test('missing story audio (Keenan Notch case)', () => {
    expect(personalizedAssetGateReason({ ...fullStory, story_audio_url: '' }, 'MRK'))
      .toBe('missing_story_audio_url')
  })

  test('missing both outro urls', () => {
    expect(personalizedAssetGateReason({ ...fullStory, outro_audio_url: null }, 'MRK'))
      .toBe('missing_outro_url')
  })

  test('outro_with_music_url alone satisfies the outro gate', () => {
    expect(personalizedAssetGateReason(
      { ...fullStory, outro_audio_url: null, outro_with_music_url: 'https://x/outro_music.mp3' },
      'MRK'
    )).toBeNull()
  })
})

describe('recordPersonalizationFallback (countable, best-effort, never throws)', () => {
  test('row shape carries story_id + user_id + reason', () => {
    expect(fallbackTelemetryRow({
      storyId: '934b82f3', userId: '8b05e916', pronunciationKey: 'MRK', reason: 'missing_announcement_url',
    })).toEqual({
      story_id: '934b82f3',
      user_id: '8b05e916',
      pronunciation_key: 'MRK',
      reason: 'missing_announcement_url',
    })
  })

  test('inserts a personalization_fallbacks row and emits the structured log line', async () => {
    const inserted: any[] = []
    const client = {
      from: (table: string) => ({
        insert: (row: any) => { inserted.push({ table, row }); return Promise.resolve({ error: null }) },
      }),
    }
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    await recordPersonalizationFallback(client as any, {
      storyId: 's-1', userId: 'u-1', pronunciationKey: 'MRK', reason: 'name_pool_not_ready',
    })
    expect(inserted).toEqual([{
      table: 'personalization_fallbacks',
      row: { story_id: 's-1', user_id: 'u-1', pronunciation_key: 'MRK', reason: 'name_pool_not_ready' },
    }])
    expect(warn).toHaveBeenCalledWith(
      '[story-playlist] personalization_fallback',
      expect.stringContaining('name_pool_not_ready')
    )
    warn.mockRestore()
  })

  test('never throws when the insert fails (signal survives via the log line)', async () => {
    const client = {
      from: () => ({ insert: () => Promise.reject(new Error('table missing')) }),
    }
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(recordPersonalizationFallback(client as any, {
      storyId: 's-1', userId: 'u-1', reason: 'missing_announcement_url',
    })).resolves.toBeUndefined()
    warn.mockRestore()
  })

  test('story-playlist route is wired to the recorder for authenticated fallbacks', () => {
    const source = src('app/api/asc3/story-playlist/route.ts')
    expect(source).toContain('recordPersonalizationFallback(supabase')
    expect(source).toContain("fallbackReason = 'missing_pronunciation_key'")
    expect(source).toContain("fallbackReason = 'personalized_queue_error'")
    expect(source).toContain("return { payload: null, fallbackReason: 'name_pool_not_ready' }")
  })
})

// ─── Item 5: publish-time personalization guard ──────────────────────────────

import { personalizationPublishBlockers, LISTENER_NAME_TOKEN } from '@/lib/personalization/publishGuard'

describe('personalizationPublishBlockers', () => {
  const cleanStory = {
    announcement_url: 'https://x/announcement_0000.mp3',
    announcement_text: '"The Same Dead Man" begins tonight.',
    script: 'BELLE: "The Same Dead Man" begins tonight.\nNARRATOR: It was raining.',
  }

  test('clean story publishes (no blockers)', () => {
    expect(personalizationPublishBlockers(cleanStory)).toEqual([])
  })

  test('NULL announcement_url blocks', () => {
    const blockers = personalizationPublishBlockers({ ...cleanStory, announcement_url: null })
    expect(blockers).toHaveLength(1)
    expect(blockers[0]).toContain('announcement_url is missing')
  })

  test('[LISTENER_NAME] in announcement_text blocks (WotW regression)', () => {
    const blockers = personalizationPublishBlockers({
      ...cleanStory,
      announcement_text: '"Weight of the Water" begins on a riverbed... , [LISTENER_NAME], where someone...',
    })
    expect(blockers).toHaveLength(1)
    expect(blockers[0]).toContain('announcement_text')
    expect(blockers[0]).toContain(LISTENER_NAME_TOKEN)
  })

  test('[LISTENER_NAME] in script blocks', () => {
    const blockers = personalizationPublishBlockers({
      ...cleanStory,
      script: 'BELLE: Welcome, [LISTENER_NAME]. Tonight...',
    })
    expect(blockers).toHaveLength(1)
    expect(blockers[0]).toContain('script')
  })

  test('WotW as published: legacy token AND null announcement_url = two blockers', () => {
    const blockers = personalizationPublishBlockers({
      announcement_url: null,
      announcement_text: '..., [LISTENER_NAME], where someone is putting things in...',
      script: null,
    })
    expect(blockers).toHaveLength(2)
  })

  test('missing/undefined fields on a minimal row: only the announcement_url blocker fires', () => {
    expect(personalizationPublishBlockers({})).toHaveLength(1)
  })
})

describe('/api/admin/publish-story — guard is blocking in the publish flow', () => {
  async function callPublish(body: any, responses: TableResponses) {
    currentSupabase = createSupabaseMock(responses)
    const { POST } = require('@/app/api/admin/publish-story/route')
    const res = await POST(jsonRequest(body))
    return { res, body: await res.json() }
  }

  const publishableStory = {
    id: 's-1', title: 'The Same Dead Man', author: 'A. Writer', genre: 'Mystery',
    audio_url: 'https://x/final_mix.mp3', cover_url: 'https://x/cover.jpg',
    description: 'A mystery.', duration_mins: 12,
    announcement_url: 'https://x/announcement_0000.mp3',
    announcement_text: '"The Same Dead Man" begins tonight.',
    script: 'BELLE: "The Same Dead Man" begins tonight.',
  }

  test('single story with NULL announcement_url is blocked with 400 + personalizationBlockers', async () => {
    const { res, body } = await callPublish(
      { storyId: 's-1' },
      { stories: [{ data: { ...publishableStory, announcement_url: null }, error: null }] }
    )
    expect(res.status).toBe(400)
    expect(body.success).toBe(false)
    expect(body.error).toContain('Personalization publish guard')
    expect(body.personalizationBlockers).toHaveLength(1)
  })

  test('single story with legacy [LISTENER_NAME] script is blocked', async () => {
    const { res, body } = await callPublish(
      { storyId: 's-1' },
      { stories: [{ data: { ...publishableStory, script: 'BELLE: Hello [LISTENER_NAME].' }, error: null }] }
    )
    expect(res.status).toBe(400)
    expect(body.personalizationBlockers[0]).toContain('script')
  })

  test('clean story still publishes', async () => {
    const { res, body } = await callPublish(
      { storyId: 's-1' },
      {
        stories: [
          { data: publishableStory, error: null }, // pre-publish read
          { data: { id: 's-1', title: publishableStory.title, status: 'published' }, error: null }, // update
        ],
      }
    )
    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
  })

  test('series publish reports personalization blockers per episode', async () => {
    const { res, body } = await callPublish(
      { seriesId: 'ser-1' },
      {
        stories: [{
          data: null,
          error: null,
          ...{ data: [
            { ...publishableStory, id: 'e-1', workflow_state: 'approved_ready', status: 'audio_ready', is_hidden: true, review_status: 'approved', episode_number: 1 },
            { ...publishableStory, id: 'e-2', announcement_url: null, workflow_state: 'approved_ready', status: 'audio_ready', is_hidden: true, review_status: 'approved', episode_number: 2 },
          ] },
        }],
      }
    )
    expect(res.status).toBe(400)
    expect(body.blocked).toHaveLength(1)
    expect(body.blocked[0].storyId).toBe('e-2')
    expect(body.blocked[0].reasons.join(' ')).toContain('announcement_url is missing')
  })
})

describe('content-approval workflow transition to published — same guard', () => {
  test('route wires personalizationPublishBlockers into both single and series transitions', () => {
    const source = src('app/api/admin/content-approval/route.ts')
    expect(source).toMatch(/import \{ personalizationPublishBlockers \} from '@\/lib\/personalization\/publishGuard'/)
    // Both the series mapper and the single-story transition consult the guard
    // only when the target state is 'published'.
    expect((source.match(/state === 'published'\s*\n?\s*\? personalizationPublishBlockers|if \(state === 'published'\) \{/g) || []).length)
      .toBeGreaterThanOrEqual(2)
  })
})
