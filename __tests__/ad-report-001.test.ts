import { buildAdReport, adKey, NO_TAG, AdUserRow, AdPlayRow } from '@/lib/adReport'

const u = (id: string, over: Partial<AdUserRow> = {}): AdUserRow => ({
  id, created_at: '2026-11-15T00:00:00Z', utm_source: 'facebook', utm_medium: 'paid', utm_campaign: 'c1', utm_term: 's1', utm_content: 'ad1',
  trial_started_at: null, first_paid_date: null, is_test_account: false, ...over,
})
const p = (user_id: string, episode_number: number, seconds_played: number, progress_pct: number, series_id = 'S'): AdPlayRow =>
  ({ user_id, series_id, episode_number, seconds_played, progress_pct })

describe('AD-REPORT-001', () => {
  test('ad key uses source, campaign, ad set and ad; untagged users group together', () => {
    expect(adKey(u('a'))).toBe('facebook | c1 | s1 | ad1')
    expect(adKey(u('b', { utm_source: null, utm_medium: null, utm_campaign: null, utm_term: null, utm_content: null }))).toBe(NO_TAG)
  })

  test('counts the listening milestones, trials and paid per ad', () => {
    const users = [
      u('a', { trial_started_at: '2026-11-15', first_paid_date: '2026-11-22' }),
      u('b', { trial_started_at: '2026-11-15' }),
      u('c'),
      u('d', { utm_content: 'ad2' }),
      u('t', { is_test_account: true }),
      u('o', { utm_source: null, utm_medium: null, utm_campaign: null, utm_term: null, utm_content: null }),
    ]
    const plays = [
      p('a', 1, 900, 100), p('a', 2, 900, 100), p('a', 3, 900, 100), p('a', 7, 900, 95), // finished series
      p('b', 1, 120, 40),                                                                // listened 60s only
      p('c', 1, 20, 2),                                                                  // bounced
      p('d', 1, 900, 92), p('d', 3, 30, 3),                                              // EP1 finished, reached EP3
      p('t', 1, 900, 100),                                                               // test account: ignored
    ]
    const rows = buildAdReport(users, plays, { S: 7 }, { S: 'The Widow Who Watched' })
    const ad1 = rows.find((r) => r.ad === 'ad1')!
    expect(ad1).toMatchObject({ signups: 3, listened60: 2, finishedEp1: 1, reachedEp3: 1, finishedSeries: 1, trials: 2, paid: 1, topSeries: 'The Widow Who Watched' })
    const ad2 = rows.find((r) => r.ad === 'ad2')!
    expect(ad2).toMatchObject({ signups: 1, listened60: 1, finishedEp1: 1, reachedEp3: 1, finishedSeries: 0 })
    expect(rows[rows.length - 1].key).toBe(NO_TAG)
    expect(rows.reduce((n, r) => n + r.signups, 0)).toBe(5)
  })

  test('finishing a middle episode is not finishing the series', () => {
    const rows = buildAdReport([u('a')], [p('a', 6, 900, 100)], { S: 7 })
    expect(rows[0].finishedSeries).toBe(0)
  })
})

describe('AD-REPORT-001 signup tags', () => {
  const fs = require('fs')
  const path = require('path')
  const read = (f: string) => fs.readFileSync(path.join(process.cwd(), f), 'utf8')
  test('server keeps short ad tags only', () => {
    const { adTagFields } = require('@/lib/adReport')
    expect(adTagFields({ utmMedium: 'paid', utmTerm: '120210', utmContent: '120211' })).toEqual({ utmMedium: 'paid', utmTerm: '120210', utmContent: '120211' })
    expect(adTagFields({ utmTerm: 'x'.repeat(201), utmContent: 5 })).toEqual({ utmMedium: null, utmTerm: null, utmContent: null })
  })
  test('both ad landing signups save ad set and ad on every user write', () => {
    for (const f of ['app/api/go/invite-signup/route.ts', 'app/api/listen/signup/route.ts']) {
      const s = read(f)
      const campaigns = (s.match(/utm_campaign: utmCampaign \?\? null/g) || []).length
      expect(campaigns).toBeGreaterThan(0)
      expect((s.match(/utm_term: utmTerm \?\? null/g) || []).length).toBe(campaigns)
      expect((s.match(/utm_content: utmContent \?\? null/g) || []).length).toBe(campaigns)
    }
    expect(read('app/go/GoInvitationContent.tsx')).toContain('...adTagExtras(searchParams)')
    expect(read('app/listen/EavesdropClient.tsx')).toContain('...adTagExtras(')
  })
})
