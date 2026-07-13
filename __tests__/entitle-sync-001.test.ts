/**
 * ORION-ENTITLE-SYNC-001 — LAUNCH BLOCKER regression pins (2026-07-12)
 *
 * Incident: the 5:29 PM signup (m.postlewaite+gv10712b) was correctly
 * activated by the Stripe webhook (plan=standard, subscription_type=active)
 * yet the player bounced them to /subscribe for 8+ minutes — while /home
 * rendered fine.
 *
 * Root cause: TWO client-side supabase clients.
 *   - contexts/AuthContext + middleware use the COOKIE client
 *     (lib/supabase-browser, @supabase/ssr) — sessions from this app's own
 *     signup/signin are cookie-ONLY.
 *   - CanonicalPlayer and 40+ data components query through the PLAIN
 *     localStorage client (lib/supabase) — with a cookie-only session it ran
 *     as ANON, users-table RLS returned no row, .single() failed, and the
 *     paywall check concluded "not entitled". Same class silently emptied
 *     user_library reads and stripped subscription fields from the context
 *     user (anon-key Authorization in loadDbUser).
 *
 * Fix layers pinned here:
 *   1. AuthContext mirrors the cookie session into the data client on init
 *      and on every auth state change.
 *   2. The player paywall gate queries through the cookie client directly.
 *   3. AuthContext.loadDbUser authorizes as the user, not the anon key.
 *   4. The data client never refreshes tokens itself (rotation safety).
 */

import fs from 'fs'
import path from 'path'

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')

describe('ORION-ENTITLE-SYNC-001: session mirror (fix 1)', () => {
  const authSrc = read('contexts/AuthContext.tsx')

  test('AuthContext imports the plain data client for mirroring', () => {
    expect(authSrc).toContain("import { supabase } from '@/lib/supabase'")
  })

  test('mirror helper sets the session on the data client and clears on sign-out', () => {
    expect(authSrc).toContain('mirrorSessionToDataClient')
    expect(authSrc).toContain('supabase.auth.setSession')
    expect(authSrc).toContain("supabase.auth.signOut({ scope: 'local' })")
  })

  test('mirror runs on init AND on every auth state change', () => {
    const initIdx = authSrc.indexOf('await mirrorSessionToDataClient(session)')
    expect(initIdx).toBeGreaterThan(-1)
    const secondIdx = authSrc.indexOf('await mirrorSessionToDataClient(session)', initIdx + 1)
    expect(secondIdx).toBeGreaterThan(-1)
    // The state-change mirror must live inside onAuthStateChange.
    const onChangeIdx = authSrc.indexOf('onAuthStateChange')
    expect(secondIdx).toBeGreaterThan(onChangeIdx)
  })
})

describe('ORION-ENTITLE-SYNC-001: paywall gate on the cookie client (fix 2)', () => {
  const playerSrc = read('components/player/CanonicalPlayer.tsx')

  test('player imports the cookie client', () => {
    expect(playerSrc).toContain("import { supabaseBrowser } from '@/lib/supabase-browser'")
  })

  test('the users entitlement query goes through supabaseBrowser, not the plain client', () => {
    const gate = playerSrc.slice(playerSrc.indexOf('── Paywall check'), playerSrc.indexOf('── Paywall check') + 2000)
    expect(gate).toContain('supabaseBrowser')
    expect(gate).toContain("select('plan, subscription_type, subscription_ends_at')")
    expect(gate).not.toMatch(/await supabase\s*\n?\s*\.from\('users'\)/)
  })
})

describe('ORION-ENTITLE-SYNC-001: loadDbUser authorizes as the user (fix 3)', () => {
  const authSrc = read('contexts/AuthContext.tsx')

  test('users REST fetch uses the session access token, anon key only as fallback', () => {
    expect(authSrc).toContain('accessToken || key')
    expect(authSrc).not.toContain("'Authorization': `Bearer ${key}`")
  })

  test('loadDbUser NEVER calls authClient.auth.getSession — re-entrant call inside onAuthStateChange deadlocks GoTrue', () => {
    // The token must be PASSED IN from the session the callback already has.
    expect(authSrc).toContain('accessToken?: string | null')
    const loadDbUserBody = authSrc.slice(authSrc.indexOf('async function loadDbUser'), authSrc.indexOf('useEffect(() => {'))
    // Match actual CALLS only — the explanatory comment names the API.
    expect(loadDbUserBody).not.toMatch(/await\s+authClient\.auth\.getSession/)
    // Every call site passes the token.
    expect(authSrc.match(/loadDbUser\(session\.user, session\.access_token\)/g)?.length).toBe(3)
    expect(authSrc).not.toMatch(/loadDbUser\(session\.user\)/)
  })
})

describe('ORION-ENTITLE-SYNC-001: data client is a session follower (fix 4)', () => {
  const libSrc = read('lib/supabase.ts')

  test('data client never self-refreshes tokens (rotation-reuse safety)', () => {
    expect(libSrc).toContain('autoRefreshToken: false')
    expect(libSrc).toContain('detectSessionInUrl: false')
  })

  test('data client uses a DISTINCT storage key — shared GoTrue lock deadlocked auth init', () => {
    expect(libSrc).toContain("storageKey: 'sb-dtt-data-client'")
  })
})
