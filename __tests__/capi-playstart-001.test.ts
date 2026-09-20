// CAPI-PLAYSTART-001: server-side PlayStart + deduped browser twin.
import fs from 'fs'
import path from 'path'
import { metaEventName, tiktokEventName, playStartEventId, guestPlayStartEventId } from '@/lib/tracking/events'
import { buildMetaCapiPayload, buildTikTokPayload, sha256Lower } from '@/lib/tracking/capi'

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8')
const USER = 'de5671b2-a72e-4666-b09e-b4b71f2a07e2'
const SESSION = '8c1f1a2e-0000-4aaa-9bbb-1234567890ab'

describe('event ids', () => {
  it('signed-in id is deterministic from the session id alone', () => {
    expect(playStartEventId(SESSION)).toBe(`play_${SESSION}`)
    expect(playStartEventId(SESSION)).toBe(playStartEventId(SESSION))
  })
  it('never carries the raw user id (external_id is sent hashed instead)', () => {
    expect(playStartEventId(SESSION)).not.toContain(USER)
  })
  it('guest id is session-scoped (no server twin exists)', () => {
    expect(guestPlayStartEventId(SESSION)).toBe(`play_guest_${SESSION}`)
  })
  it('different sessions → different ids (a second listen is a second event)', () => {
    expect(playStartEventId('a')).not.toBe(playStartEventId('b'))
  })
  it('PlayStart is sent under its own name on both platforms (custom event)', () => {
    expect(metaEventName('PlayStart')).toBe('PlayStart')
    expect(tiktokEventName('PlayStart')).toBe('PlayStart')
  })
})

describe('CAPI payload', () => {
  const evt = {
    name: 'PlayStart' as const,
    eventId: playStartEventId(SESSION),
    email: 'Listener@Example.com ',
    externalId: USER,
    sourceUrl: 'https://app.endless-tales.com/player/story-1',
    eventTime: 1789900000,
    customData: {
      story_id: 'story-1', series_id: 'series-9', episode_number: 2,
      genre: 'Mystery', start_source: 'gesture', content_name: 'Endless Tales Story',
    },
  }
  it('meta: custom event name, shared event_id, hashed identifiers only', () => {
    const p = buildMetaCapiPayload(evt) as any
    const d = p.data[0]
    expect(d.event_name).toBe('PlayStart')
    expect(d.event_id).toBe(`play_${SESSION}`)
    expect(d.action_source).toBe('website')
    expect(d.event_source_url).toBe(evt.sourceUrl)
    // hashed, normalised (trimmed + lowercased), never raw
    expect(d.user_data.em).toEqual([sha256Lower('listener@example.com')])
    expect(d.user_data.external_id).toEqual([sha256Lower(USER)])
    expect(JSON.stringify(p)).not.toContain('Listener@Example.com')
    expect(JSON.stringify(p)).not.toContain(USER) // raw user id never leaves
    expect(d.custom_data).toMatchObject({ story_id: 'story-1', series_id: 'series-9', episode_number: 2, genre: 'Mystery' })
  })
  it('no test_event_code unless one is configured', () => {
    expect((buildMetaCapiPayload(evt) as any).test_event_code).toBeUndefined()
    expect((buildMetaCapiPayload(evt, 'TEST123') as any).test_event_code).toBe('TEST123')
  })
  it('tiktok: same id, no companion event for PlayStart', () => {
    const p = buildTikTokPayload(evt, 'pixel-1') as any
    expect(p.data).toHaveLength(1)
    expect(p.data[0].event).toBe('PlayStart')
    expect(p.data[0].event_id).toBe(evt.eventId)
  })
})

describe('wiring', () => {
  const route = read('app/api/analytics/play-event/route.ts')
  const analytics = read('lib/analytics.ts')

  it('server fires PlayStart only on the first start of a session', () => {
    expect(route).toContain("name: 'PlayStart'")
    expect(route).toContain('if (await isFirstStartForSession(supabase, sessionId)) {')
    expect(route).toContain('eventId: playStartEventId(sessionId)')
  })
  it('dedupe counts rows for the session and fails open', () => {
    expect(route).toContain(".select('id', { count: 'exact', head: true })")
    expect(route).toContain(".eq('session_id', sessionId)")
    expect(route).toMatch(/if \(error\)[\s\S]{0,180}return true/)
    expect(route).toContain('return (count ?? 1) <= 1')
  })
  it('server sends hashed identifiers + story custom data, awaited', () => {
    expect(route).toContain('await sendServerEvent({')
    expect(route).toContain('externalId: user.id')
    expect(route).toContain('email: user.email || null')
    expect(route).toContain('series_id:')
    expect(route).toContain('episode_number:')
  })
  it('client twin uses the SAME id for signed-in listens, guest id otherwise', () => {
    expect(analytics).toContain("trackClientEvent('PlayStart'")
    expect(analytics).toContain('playStartEventId(currentSessionId)')
    expect(analytics).toContain('guestPlayStartEventId(currentSessionId)')
  })
  it('existing events are untouched', () => {
    const events = read('lib/tracking/events.ts')
    expect(events).toContain("return name === 'Subscribe' ? META_PAID_CONVERSION_EVENT : name")
    expect(events).toContain("case 'Subscribe': return 'CompletePayment'")
    expect(events).toContain("return name === 'StartTrial' ? ['Subscribe'] : []")
    expect(read('app/api/webhook/route.ts')).toContain('startTrialEventId(session.id)')
    expect(read('app/api/user/create/route.ts')).toContain('registrationEventId(id)')
  })
})
