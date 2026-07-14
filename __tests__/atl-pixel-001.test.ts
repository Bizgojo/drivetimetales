// __tests__/atl-pixel-001.test.ts — ATL-PIXEL-001 conversion tracking
//
// Pins the tracking contract Marc's ad campaigns depend on:
//  1. Event name mapping is identical across platforms except the documented
//     TikTok differences (Subscribe→CompletePayment, PageView→Pageview).
//  2. Dedup event_ids are deterministic and shared client+server by
//     construction (reg_<userId>, st_<checkoutSessionId>, sub_<invoiceId>).
//  3. Server payloads NEVER contain raw PII — SHA-256 hashes only.
//  4. Payload shapes match Meta CAPI / TikTok Events API v1.3.

import {
  metaEventName,
  tiktokEventName,
  tiktokCompanionEventNames,
  META_PAID_CONVERSION_EVENT,
  registrationEventId,
  startTrialEventId,
  subscribeEventId,
  randomEventId,
  normalizeEmailForHash,
  normalizePhoneForHash,
} from '@/lib/tracking/events'
import {
  sha256Lower,
  hashEmail,
  hashPhone,
  buildMetaCapiPayload,
  buildTikTokPayload,
  ServerTrackingEvent,
} from '@/lib/tracking/capi'

// Known SHA-256 vectors (pinned; independently verifiable):
const EMAIL_HASH = '973dfe463ec85785f5f95af5ba3906eedb2d931c24e69824a89ea65dba4e813b' // test@example.com
const PHONE_HASH = 'd6736136ea896c1bfdc553e0e86e702c70d060d805696ca3e4e9e0961353860a' // 15551234567
const EXTID_HASH = 'a8347d5a84b1ee3d0bfc244c6e15984a60d911095147dc3ec17fcb2a7119d695' // user-uuid-123

describe('event name mapping (STANDARD events both platforms — playbook-reconciled)', () => {
  test('Meta names pass through unchanged (except paid-conversion constant)', () => {
    for (const name of ['PageView', 'ViewContent', 'CompleteRegistration', 'InitiateCheckout', 'StartTrial'] as const) {
      expect(metaEventName(name)).toBe(name)
    }
  })

  test('Meta paid conversion = Purchase (Marc decision 2026-07-13 10:46 EDT)', () => {
    expect(META_PAID_CONVERSION_EVENT).toBe('Purchase')
    expect(metaEventName('Subscribe')).toBe('Purchase')
  })

  // FINALIZED TikTok architecture (Orion 2026-07-13): CompleteRegistration
  // (standard) is the OPTIMIZATION event; StartTrial is a CUSTOM event for
  // attribution/reporting at checkout completion; CompletePayment (standard)
  // at first paid invoice. Pinned so a re-mapping edit fails loudly — the
  // campaign optimization target depends on these exact names.
  test('TikTok: CompleteRegistration unchanged (standard — the OPTIMIZATION event)', () => {
    expect(tiktokEventName('CompleteRegistration')).toBe('CompleteRegistration')
  })

  test('TikTok: StartTrial stays CUSTOM \'StartTrial\' (attribution/reporting only)', () => {
    expect(tiktokEventName('StartTrial')).toBe('StartTrial')
  })

  test('TikTok: Subscribe (first paid invoice) → CompletePayment (standard)', () => {
    expect(tiktokEventName('Subscribe')).toBe('CompletePayment')
  })

  test('TikTok: trial-start and paid-conversion map to DISTINCT TikTok events', () => {
    expect(tiktokEventName('StartTrial')).not.toBe(tiktokEventName('Subscribe'))
  })

  test('TikTok: PageView → Pageview (TikTok standard casing)', () => {
    expect(tiktokEventName('PageView')).toBe('Pageview')
  })

  test('TikTok: ViewContent/InitiateCheckout unchanged (already standard)', () => {
    expect(tiktokEventName('ViewContent')).toBe('ViewContent')
    expect(tiktokEventName('InitiateCheckout')).toBe('InitiateCheckout')
  })

  test('TikTok DUAL EMIT: StartTrial also sends standard Subscribe; no other event has companions', () => {
    expect(tiktokCompanionEventNames('StartTrial')).toEqual(['Subscribe'])
    for (const name of ['PageView', 'ViewContent', 'CompleteRegistration', 'InitiateCheckout', 'Subscribe'] as const) {
      expect(tiktokCompanionEventNames(name)).toEqual([])
    }
  })
})

describe('dedup event_ids — deterministic, shared client+server by construction', () => {
  test('CompleteRegistration keyed on user id', () => {
    expect(registrationEventId('user-uuid-123')).toBe('reg_user-uuid-123')
  })
  test('StartTrial keyed on Stripe checkout session id', () => {
    expect(startTrialEventId('cs_test_abc')).toBe('st_cs_test_abc')
  })
  test('Subscribe keyed on Stripe invoice id', () => {
    expect(subscribeEventId('in_1XYZ')).toBe('sub_in_1XYZ')
  })
  test('same entity → same id on repeat calls (webhook replay safety)', () => {
    expect(startTrialEventId('cs_1')).toBe(startTrialEventId('cs_1'))
  })
  test('randomEventId carries prefix and is unique per call', () => {
    const a = randomEventId('vc')
    const b = randomEventId('vc')
    expect(a.startsWith('vc_')).toBe(true)
    expect(a).not.toBe(b)
  })
})

describe('PII normalization + hashing (match quality without raw PII)', () => {
  test('email lowercased/trimmed before hash', () => {
    expect(normalizeEmailForHash('  Test@Example.COM ')).toBe('test@example.com')
    expect(hashEmail('  Test@Example.COM ')).toBe(EMAIL_HASH)
  })
  test('non-email rejected', () => {
    expect(normalizeEmailForHash('not-an-email')).toBeNull()
    expect(hashEmail('')).toBeNull()
    expect(hashEmail(null)).toBeNull()
  })
  test('phone stripped to digits before hash', () => {
    expect(normalizePhoneForHash('+1 (555) 123-4567')).toBe('15551234567')
    expect(hashPhone('+1 (555) 123-4567')).toBe(PHONE_HASH)
  })
  test('too-short phone rejected', () => {
    expect(normalizePhoneForHash('123')).toBeNull()
  })
  test('sha256Lower pinned vector', () => {
    expect(sha256Lower('test@example.com')).toBe(EMAIL_HASH)
  })
})

const BASE_EVENT: ServerTrackingEvent = {
  name: 'StartTrial',
  eventId: 'st_cs_test_abc',
  email: 'Test@Example.com',
  phone: '+1 (555) 123-4567',
  externalId: 'user-uuid-123',
  value: 0,
  currency: 'USD',
  sourceUrl: 'https://endless-tales.com/signup',
  customData: {
    content_name: 'Endless Tales Trial',
    utm_source: 'facebook',
    utm_medium: '',        // empty → dropped
    utm_campaign: undefined, // undefined → dropped
    promo_code: null,      // null → dropped
  },
  eventTime: 1752400000,
}

describe('Meta CAPI payload', () => {
  const payload = buildMetaCapiPayload(BASE_EVENT, 'TEST123')
  const evt = payload.data[0]

  test('shape: event_name/event_time/event_id/action_source', () => {
    expect(evt.event_name).toBe('StartTrial')
    expect(evt.event_time).toBe(1752400000)
    expect(evt.event_id).toBe('st_cs_test_abc')
    expect(evt.action_source).toBe('website')
    expect((evt as any).event_source_url).toBe('https://endless-tales.com/signup')
  })

  test('user_data carries SHA-256 hashes as arrays', () => {
    expect((evt as any).user_data.em).toEqual([EMAIL_HASH])
    expect((evt as any).user_data.ph).toEqual([PHONE_HASH])
    expect((evt as any).user_data.external_id).toEqual([EXTID_HASH])
  })

  test('NEVER contains raw PII anywhere in the serialized payload', () => {
    const json = JSON.stringify(payload).toLowerCase()
    expect(json).not.toContain('test@example.com')
    expect(json).not.toContain('example.com')
    expect(json).not.toContain('5551234567')
    expect(json).not.toContain('user-uuid-123')
  })

  test('custom_data compacted (empty/undefined/null dropped) + value/currency', () => {
    const cd = (evt as any).custom_data
    expect(cd.content_name).toBe('Endless Tales Trial')
    expect(cd.utm_source).toBe('facebook')
    expect(cd.value).toBe(0)
    expect(cd.currency).toBe('USD')
    expect('utm_medium' in cd).toBe(false)
    expect('utm_campaign' in cd).toBe(false)
    expect('promo_code' in cd).toBe(false)
  })

  test('test_event_code only when provided', () => {
    expect((payload as any).test_event_code).toBe('TEST123')
    expect('test_event_code' in buildMetaCapiPayload(BASE_EVENT)).toBe(false)
  })

  test('missing identifiers → omitted keys, payload still valid', () => {
    const p = buildMetaCapiPayload({ name: 'Subscribe', eventId: 'sub_in_1' })
    const ud = (p.data[0] as any).user_data
    expect(ud).toEqual({})
    expect(p.data[0].event_name).toBe('Purchase') // Meta wire name per Marc's decision
  })
})

describe('TikTok Events API v1.3 payload', () => {
  const payload = buildTikTokPayload(BASE_EVENT, 'TTPIXEL1', 'TTTEST1')
  const evt = payload.data[0]

  test('envelope: event_source=web, event_source_id=pixel, test code', () => {
    expect(payload.event_source).toBe('web')
    expect(payload.event_source_id).toBe('TTPIXEL1')
    expect((payload as any).test_event_code).toBe('TTTEST1')
  })

  test('event name mapped (StartTrial custom, unchanged; Subscribe→CompletePayment)', () => {
    expect(evt.event).toBe('StartTrial')
    const sub = buildTikTokPayload({ name: 'Subscribe', eventId: 'sub_in_1' }, 'TTPIXEL1')
    expect(sub.data[0].event).toBe('CompletePayment')
    expect(sub.data).toHaveLength(1) // paid conversion emits ONE TikTok event
    expect('test_event_code' in sub).toBe(false)
  })

  test('trial-start DUAL EMIT: custom StartTrial + standard Subscribe in one request, shared id/time/user', () => {
    expect(payload.data).toHaveLength(2)
    expect(payload.data.map(d => d.event)).toEqual(['StartTrial', 'Subscribe'])
    expect(payload.data[1].event_id).toBe('st_cs_test_abc')
    expect(payload.data[1].event_time).toBe(payload.data[0].event_time)
    expect((payload.data[1] as any).user.email).toBe(EMAIL_HASH)
    expect((payload.data[1] as any).properties.utm_source).toBe('facebook')
  })

  test('Meta emits exactly ONE event per tracked moment (dual emit is TikTok-only)', () => {
    expect(buildMetaCapiPayload(BASE_EVENT).data).toHaveLength(1)
  })

  test('shared event_id matches Meta twin (cross-platform consistency)', () => {
    expect(evt.event_id).toBe('st_cs_test_abc')
  })

  test('user carries SHA-256 hashes; NEVER raw PII', () => {
    expect((evt as any).user.email).toBe(EMAIL_HASH)
    expect((evt as any).user.phone).toBe(PHONE_HASH)
    expect((evt as any).user.external_id).toBe(EXTID_HASH)
    const json = JSON.stringify(payload).toLowerCase()
    expect(json).not.toContain('test@example.com')
    expect(json).not.toContain('5551234567')
    expect(json).not.toContain('user-uuid-123')
  })

  test('properties compacted + currency uppercased + page url', () => {
    const props = (evt as any).properties
    expect(props.utm_source).toBe('facebook')
    expect(props.currency).toBe('USD')
    expect('utm_medium' in props).toBe(false)
    expect((evt as any).page.url).toBe('https://endless-tales.com/signup')
  })
})

describe('cross-platform dedup contract (the acceptance-evidence item 3 invariant)', () => {
  test('client eventID and server event_id derive identically from the checkout session', () => {
    // /home fires trackClientEvent(..., startTrialEventId(cs)) with ?cs= from
    // the success_url; the webhook fires sendServerEvent with
    // startTrialEventId(session.id). Same session → same id → ONE event in
    // Events Manager.
    const checkoutSessionId = 'cs_live_a1b2c3'
    const clientSide = startTrialEventId(checkoutSessionId)
    const serverSide = buildMetaCapiPayload({
      name: 'StartTrial',
      eventId: startTrialEventId(checkoutSessionId),
    }).data[0].event_id
    expect(clientSide).toBe(serverSide)
  })
})
