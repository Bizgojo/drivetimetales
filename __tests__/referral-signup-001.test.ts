// REFERRAL-SIGNUP-001: referral code capture → storage → claim.
import {
  normalizeReferralCode,
  captureReferralFromUrl,
  readStoredReferral,
  clearStoredReferral,
  claimStoredReferral,
} from '@/lib/referral'

function installBrowser(search: string) {
  const store = new Map<string, string>()
  let cookieJar: Record<string, string> = {}
  const g = globalThis as any
  g.window = { location: { search, protocol: 'http:' } }
  g.localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, v) },
    removeItem: (k: string) => { store.delete(k) },
  }
  g.document = {
    get cookie() { return Object.entries(cookieJar).map(([k, v]) => `${k}=${v}`).join('; ') },
    set cookie(v: string) {
      const [pair, ...attrs] = v.split('; ')
      const [k, val] = pair.split('=')
      if (attrs.includes('Max-Age=0')) delete cookieJar[k]
      else cookieJar[k] = val
    },
  }
  return { store, clearCookies: () => { cookieJar = {} } }
}

afterEach(() => {
  const g = globalThis as any
  delete g.window; delete g.localStorage; delete g.document; delete g.fetch
})

describe('normalizeReferralCode', () => {
  it('uppercases and strips non-alphanumerics (process_referral compares UPPER(code))', () => {
    expect(normalizeReferralCode(' marc7qx ')).toBe('MARC7QX')
    expect(normalizeReferralCode('MA-RC 7Q')).toBe('MARC7Q')
  })
  it('rejects empty / too short / too long', () => {
    expect(normalizeReferralCode(null)).toBeNull()
    expect(normalizeReferralCode('')).toBeNull()
    expect(normalizeReferralCode('ab')).toBeNull()
    expect(normalizeReferralCode('A'.repeat(21))).toBeNull()
  })
})

describe('capture / read / clear', () => {
  it('captures ?ref= into localStorage and cookie', () => {
    const { clearCookies } = installBrowser('?ref=marc7qx&utm_source=x')
    captureReferralFromUrl()
    expect(readStoredReferral()).toBe('MARC7QX')
    clearCookies()
    expect(readStoredReferral()).toBe('MARC7QX') // localStorage alone
  })
  it('falls back to the cookie when localStorage is empty (e.g. storage blocked)', () => {
    const { store } = installBrowser('?ref=MARC7QX')
    captureReferralFromUrl()
    store.clear()
    expect(readStoredReferral()).toBe('MARC7QX')
  })
  it('page loads without ?ref= do not clobber a stored code', () => {
    installBrowser('?ref=MARC7QX')
    captureReferralFromUrl()
    ;(globalThis as any).window.location.search = '?utm_source=y'
    captureReferralFromUrl()
    expect(readStoredReferral()).toBe('MARC7QX')
  })
  it('clear removes both stores', () => {
    installBrowser('?ref=MARC7QX')
    captureReferralFromUrl()
    clearStoredReferral()
    expect(readStoredReferral()).toBeNull()
  })
})

describe('claimStoredReferral', () => {
  function mockFetch(status: number, body: object) {
    const fn = jest.fn().mockResolvedValue({ ok: status < 300, status, json: async () => body })
    ;(globalThis as any).fetch = fn
    return fn
  }

  it('posts the stored code with the bearer token and clears on success', async () => {
    installBrowser('?ref=MARC7QX')
    captureReferralFromUrl()
    const fetch = mockFetch(200, { success: true })
    const r = await claimStoredReferral('tok')
    expect(r).toEqual({ done: true, success: true, error: undefined })
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe('/api/referral/claim')
    expect(init.headers.Authorization).toBe('Bearer tok')
    expect(JSON.parse(init.body)).toEqual({ code: 'MARC7QX' })
    expect(readStoredReferral()).toBeNull()
  })

  it('keeps the code when the server says retry (users row not created yet)', async () => {
    installBrowser('?ref=MARC7QX')
    captureReferralFromUrl()
    mockFetch(409, { success: false, error: 'user_row_pending', retry: true })
    const r = await claimStoredReferral('tok')
    expect(r.done).toBe(false)
    expect(readStoredReferral()).toBe('MARC7QX')
  })

  it('clears on a permanent rejection (invalid code / self-referral)', async () => {
    installBrowser('?ref=MARC7QX')
    captureReferralFromUrl()
    mockFetch(422, { success: false, error: 'Invalid referral code' })
    const r = await claimStoredReferral('tok')
    expect(r).toMatchObject({ done: true, success: false, error: 'Invalid referral code' })
    expect(readStoredReferral()).toBeNull()
  })

  it('single-flights concurrent claims (ReferralCapture + signup page)', async () => {
    installBrowser('?ref=MARC7QX')
    captureReferralFromUrl()
    const fetch = mockFetch(200, { success: true })
    await Promise.all([claimStoredReferral('tok'), claimStoredReferral('tok')])
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
