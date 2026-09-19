// REFERRAL-SIGNUP-001 Option A: referred paid at signup, referrer after the
// friend's first payment — exactly-once per side.
import { payReferrerAfterFirstPayment, loadReferralByReferred, resolveReferralOffer, payReferralSide } from '@/lib/referralPayout'

type Row = Record<string, any>

// Minimal in-memory stand-in for the supabase-js query builder surface used.
function fakeDb(tables: Record<string, Row[]>, opts: { failUserWrite?: boolean } = {}) {
  function query(table: string) {
    const filters: Array<[string, any]> = []
    let patch: Row | null = null
    const match = () => tables[table].filter(r => filters.every(([k, v]) => r[k] === v))
    const run = () => {
      if (patch) {
        if (table === 'users' && opts.failUserWrite) return { data: null, error: { message: 'boom' } }
        const rows = match()
        rows.forEach(r => Object.assign(r, patch))
        return { data: rows.map(r => ({ ...r })), error: null }
      }
      return { data: match().map(r => ({ ...r })), error: null }
    }
    const b: any = {
      select: () => b,
      update: (p: Row) => { patch = p; return b },
      eq: (k: string, v: any) => { filters.push([k, v]); return b },
      order: () => b,
      limit: () => b,
      maybeSingle: async () => { const r = run(); return { data: r.data?.[0] ?? null, error: r.error } },
      single: async () => { const r = run(); return { data: r.data?.[0] ?? null, error: r.error } },
      then: (res: any, rej: any) => Promise.resolve(run()).then(res, rej),
    }
    return b
  }
  return { from: query } as any
}

const OFFER = { id: 'o1', offer_type: 'free_days', referrer_reward: 14, referred_reward: 14, is_default: true, is_active: true }

function setup(extra: Partial<Row> = {}, dbOpts = {}) {
  const tables = {
    referral_offers: [{ ...OFFER }],
    referrals: [{ id: 'r1', referrer_id: 'A', referred_id: 'B', offer_id: 'o1', referrer_credited: false, referred_credited: false, ...extra }],
    users: [
      { id: 'A', plan: 'free', subscription_ends_at: null, subscription_type: null },
      { id: 'B', plan: 'free', subscription_ends_at: null, subscription_type: null },
    ],
  }
  return { tables, db: fakeDb(tables, dbOpts) }
}

describe('referred side (signup)', () => {
  it('grants the friend once and leaves the referrer untouched', async () => {
    const { tables, db } = setup()
    const referral = (await loadReferralByReferred(db, 'B'))!
    const offer = (await resolveReferralOffer(db, referral))!
    expect(await payReferralSide(db, referral, offer, 'referred')).toBe(14)
    expect(await payReferralSide(db, referral, offer, 'referred')).toBe(0) // exactly-once
    expect(tables.users[1].subscription_type).toBe('active')
    expect(tables.users[0].subscription_type).toBeNull()
    expect(tables.referrals[0]).toMatchObject({ referred_credited: true, referrer_credited: false })
  })
})

describe('payReferrerAfterFirstPayment (webhook)', () => {
  it('pays the referrer once, then no-ops on later invoices', async () => {
    const { tables, db } = setup({ referred_credited: true })
    expect(await payReferrerAfterFirstPayment(db, 'B')).toMatchObject({ referrerId: 'A', days: 14 })
    expect(tables.users[0]).toMatchObject({ subscription_type: 'active', plan: 'standard' })
    const endsAfterFirst = tables.users[0].subscription_ends_at
    expect(await payReferrerAfterFirstPayment(db, 'B')).toBeNull()
    expect(tables.users[0].subscription_ends_at).toBe(endsAfterFirst)
  })

  it('no-ops when the paying user was not referred', async () => {
    const { tables, db } = setup()
    expect(await payReferrerAfterFirstPayment(db, 'someone-else')).toBeNull()
    expect(tables.users[0].subscription_type).toBeNull()
  })

  it('reverts the flag when the grant fails so the next paid invoice retries', async () => {
    const { tables, db } = setup({}, { failUserWrite: true })
    await expect(payReferrerAfterFirstPayment(db, 'B')).rejects.toThrow()
    expect(tables.referrals[0].referrer_credited).toBe(false)
  })

  it('falls back to the default free_days offer and backfills offer_id', async () => {
    const { tables, db } = setup({ offer_id: null })
    expect(await payReferrerAfterFirstPayment(db, 'B')).toMatchObject({ days: 14 })
    expect(tables.referrals[0].offer_id).toBe('o1')
  })
})
