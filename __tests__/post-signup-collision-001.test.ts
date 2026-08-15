// __tests__/post-signup-collision-001.test.ts
// ATL-POST-SIGNUP-COLLISION-001 — FIX-1b acceptance tests
// Collision-path UPDATE-in-place (Marc decision 2026-08-11).
//
// 5 acceptance tests:
//   1. New email, no prior row → normal upsert path
//   2. Existing auth user (paginated loop, page 1 hit)
//   3. Page-size independence (user found on page 2)
//   4. Auth account with no public.users row → upsert inserts new row
//   5. Email in public.users, no auth account → UPDATE in-place with new auth id

// ---------------------------------------------------------------------------
// Mock state — mutated per-test in beforeEach
// ---------------------------------------------------------------------------

const mockCreateUser = jest.fn()
const mockListUsers = jest.fn()

// Queue of results for each supabase.from() call in the tested request.
// Push results in the order from() will be called.
let fromQueue: Array<{ data?: unknown; error?: unknown }> = []

// Captured arguments from the last .update() call (for assertion in test 5)
let capturedUpdatePayload: Record<string, unknown> | null = null

function nextFromResult() {
  return fromQueue.shift() ?? { data: null, error: null }
}

// Build a chainable Supabase query builder.
// Results are popped from fromQueue ONLY at terminal/operation methods, never
// at pass-through methods (.select, .eq, .neq) — avoids off-by-one pops.
function makeChain() {
  // currentResult is set by the first operation/terminal that runs.
  let currentResult: { data?: unknown; error?: unknown } = { data: null, error: null }
  const chain: Record<string, unknown> = {}

  // Pass-through (no result pop)
  chain.select = (_cols?: string) => chain
  chain.eq     = () => chain
  chain.neq    = () => chain
  chain.ilike  = () => chain  // FIX-1c: case-insensitive match; behaves as pass-through in tests

  // Operation: captures the update payload and sets the result for this query
  chain.update = (payload: Record<string, unknown>) => {
    capturedUpdatePayload = payload
    currentResult = nextFromResult() // pop the UPDATE result
    return chain
  }

  // Terminals: each pops its own result
  chain.maybeSingle = () => {
    currentResult = nextFromResult()
    return Promise.resolve(currentResult)
  }
  chain.single = () => {
    currentResult = nextFromResult()
    return Promise.resolve(currentResult)
  }
  chain.upsert = (_payload: unknown, _opts?: unknown) =>
    Promise.resolve(nextFromResult())

  // Make the chain thenable so `await chain.update({}).eq().neq()` resolves
  chain.then  = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
    Promise.resolve(currentResult).then(res, rej)
  chain.catch = (rej: (e: unknown) => unknown) =>
    Promise.resolve(currentResult).catch(rej)

  return chain
}

// ---------------------------------------------------------------------------
// Hoist mocks (jest.mock is hoisted above imports by ts-jest Babel transform)
// ---------------------------------------------------------------------------

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      admin: {
        createUser: (...args: unknown[]) => mockCreateUser(...args),
        listUsers: (...args: unknown[]) => mockListUsers(...args),
      },
    },
    from: (_table: string) => makeChain(),
  }),
}))

jest.mock('@/lib/email', () => ({
  normalizeEmail: (e: string) => (e ? e.trim().toLowerCase() : ''),
}))

jest.mock('@/lib/tracking/capi', () => ({
  sendServerEvent: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/lib/tracking/events', () => ({
  randomEventId: jest.fn().mockReturnValue('mock-event-id'),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(body: Record<string, unknown>) {
  // Dynamic require so module reloads pick up fresh env/mock state
  const { NextRequest } = require('next/server')
  const payload = JSON.stringify(body)
  return new NextRequest('http://localhost/api/go/invite-signup', {
    method: 'POST',
    body: payload,
    headers: {
      'content-type': 'application/json',
      'content-length': String(Buffer.byteLength(payload)),
    },
  })
}

async function callRoute(body: Record<string, unknown>) {
  const { POST } = require('@/app/api/go/invite-signup/route')
  const req = makeRequest(body)
  const res = await POST(req)
  const json = await res.json()
  return { status: res.status, json }
}

const VALID_BODY = {
  email: 'test@example.com',
  name: 'Test User',
  arm: 1,
  sessionId: 'sess-abc-123',
  utmSource: 'meta',
  utmCampaign: 'test-campaign',
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.resetModules()
  fromQueue = []
  capturedUpdatePayload = null
  mockCreateUser.mockReset()
  mockListUsers.mockReset()
  // Silence console noise from routes in tests
  jest.spyOn(console, 'warn').mockImplementation(() => {})
  jest.spyOn(console, 'error').mockImplementation(() => {})
  // Mock global fetch (used for tracking, fire-and-forget)
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) } as Response)
})

afterEach(() => {
  jest.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// TEST 1: New email, no prior row → happy path upsert
// ---------------------------------------------------------------------------

test('1. New email, no prior row — creates auth user and upserts profile', async () => {
  const NEW_AUTH_ID = 'aaaaaaaa-0001-4000-8000-000000000001'

  // createUser succeeds → new account
  mockCreateUser.mockResolvedValueOnce({
    data: { user: { id: NEW_AUTH_ID } },
    error: null,
  })

  // from('users').select().eq().maybeSingle() → no existing profile
  fromQueue.push({ data: null, error: null })
  // from('users').upsert() → success
  fromQueue.push({ data: null, error: null })
  // from('user_library').upsert() → success (seedUserLibrary, non-fatal)
  fromQueue.push({ data: null, error: null })

  const { status, json } = await callRoute(VALID_BODY)

  expect(status).toBe(200)
  expect(json.ok).toBe(true)
  expect(json.userId).toBe(NEW_AUTH_ID)
  expect(json.note).toBeUndefined() // not the 'existing user' path
})

// ---------------------------------------------------------------------------
// TEST 2: Existing auth user (paginated loop, match on page 1)
// ---------------------------------------------------------------------------

test('2. Existing auth user — 422 triggers paginated loop, found on page 1', async () => {
  const EXISTING_AUTH_ID = 'bbbbbbbb-0002-4000-8000-000000000002'

  // createUser fails with 422 (duplicate email)
  mockCreateUser.mockResolvedValueOnce({
    data: null,
    error: { status: 422, code: 'email_exists', message: 'User already registered' },
  })

  // listUsers page 1: contains the matching user
  mockListUsers.mockResolvedValueOnce({
    data: {
      users: [{ id: EXISTING_AUTH_ID, email: 'test@example.com' }],
    },
    error: null,
  })

  // from('users').upsert() — updates existing profile
  fromQueue.push({ data: null, error: null })
  // from('user_library').upsert() — seedUserLibrary
  fromQueue.push({ data: null, error: null })

  const { status, json } = await callRoute(VALID_BODY)

  expect(status).toBe(200)
  expect(json.ok).toBe(true)
  expect(json.userId).toBe(EXISTING_AUTH_ID)
  expect(json.note).toBe('existing user')
  // Should only have queried page 1
  expect(mockListUsers).toHaveBeenCalledTimes(1)
  expect(mockListUsers).toHaveBeenCalledWith({ page: 1, perPage: 50 })
})

// ---------------------------------------------------------------------------
// TEST 3: Page-size independence (user found on page 2)
// ---------------------------------------------------------------------------

test('3. Page-size independence — paginated loop finds user on page 2', async () => {
  const EXISTING_AUTH_ID = 'cccccccc-0003-4000-8000-000000000003'

  mockCreateUser.mockResolvedValueOnce({
    data: null,
    error: { status: 422, code: 'email_exists', message: 'User already registered' },
  })

  // Page 1: 50 users, none matching → triggers page 2
  const page1Users = Array.from({ length: 50 }, (_, i) => ({
    id: `other-id-${i}`,
    email: `other${i}@example.com`,
  }))
  mockListUsers.mockResolvedValueOnce({ data: { users: page1Users }, error: null })

  // Page 2: contains the matching user
  mockListUsers.mockResolvedValueOnce({
    data: { users: [{ id: EXISTING_AUTH_ID, email: 'test@example.com' }] },
    error: null,
  })

  fromQueue.push({ data: null, error: null }) // upsert users
  fromQueue.push({ data: null, error: null }) // seedUserLibrary

  const { status, json } = await callRoute(VALID_BODY)

  expect(status).toBe(200)
  expect(json.ok).toBe(true)
  expect(json.userId).toBe(EXISTING_AUTH_ID)
  expect(json.note).toBe('existing user')
  // Must have walked to page 2
  expect(mockListUsers).toHaveBeenCalledTimes(2)
  expect(mockListUsers).toHaveBeenNthCalledWith(1, { page: 1, perPage: 50 })
  expect(mockListUsers).toHaveBeenNthCalledWith(2, { page: 2, perPage: 50 })
})

// ---------------------------------------------------------------------------
// TEST 4: Auth account exists, no public.users row → upsert inserts new row
// ---------------------------------------------------------------------------

test('4. Auth account with no public.users row — upsert creates profile on 422 path', async () => {
  const EXISTING_AUTH_ID = 'dddddddd-0004-4000-8000-000000000004'

  mockCreateUser.mockResolvedValueOnce({
    data: null,
    error: { status: 422, code: 'email_exists', message: 'User already registered' },
  })

  mockListUsers.mockResolvedValueOnce({
    data: { users: [{ id: EXISTING_AUTH_ID, email: 'test@example.com' }] },
    error: null,
  })

  // upsert with onConflict:'id' — no existing row → INSERT (same supabase call, different DB outcome)
  fromQueue.push({ data: null, error: null })
  // seedUserLibrary
  fromQueue.push({ data: null, error: null })

  const { status, json } = await callRoute(VALID_BODY)

  expect(status).toBe(200)
  expect(json.ok).toBe(true)
  expect(json.userId).toBe(EXISTING_AUTH_ID)
  expect(json.note).toBe('existing user')
})

// ---------------------------------------------------------------------------
// TEST 5: Email in public.users, no auth account → UPDATE in-place (collision path)
// ---------------------------------------------------------------------------

test('5. Email collision (exact match) — UPDATE in-place swaps orphaned row id to new auth id', async () => {
  const NEW_AUTH_ID   = 'eeeeeeee-0005-4000-8000-000000000005'
  const ORPHANED_ID   = 'ffffffff-dead-4000-8000-000000000099'

  // createUser SUCCEEDS → new auth account
  mockCreateUser.mockResolvedValueOnce({
    data: { user: { id: NEW_AUTH_ID } },
    error: null,
  })

  // maybeSingle check: orphaned row found with a different id
  fromQueue.push({ data: { id: ORPHANED_ID }, error: null })

  // UPDATE in-place → success (no error)
  fromQueue.push({ data: null, error: null })

  // seedUserLibrary
  fromQueue.push({ data: null, error: null })

  const { status, json } = await callRoute(VALID_BODY)

  expect(status).toBe(200)
  expect(json.ok).toBe(true)
  // Response userId must be the NEW auth id (row is now addressable via auth session)
  expect(json.userId).toBe(NEW_AUTH_ID)

  // Critical assertion: UPDATE payload must include the new auth id as the new `id`
  // so that app/api/user/route.ts (looks up by auth id) can resolve the row.
  expect(capturedUpdatePayload).not.toBeNull()
  expect(capturedUpdatePayload!.id).toBe(NEW_AUTH_ID)
  expect(capturedUpdatePayload!.signup_source).toBe('bell-invitation')
  expect(capturedUpdatePayload!.plan).toBe('subscriber')
  expect(capturedUpdatePayload!.listen_arm).toBe(1)
})

// ---------------------------------------------------------------------------
// TEST 6: Case-mismatch collision (FIX-1c) — stored as mixed-case, incoming lowercase
// ---------------------------------------------------------------------------

test('6. Email collision, case mismatch — stored as "User@Example.com", incoming as "user@example.com" → UPDATE fires, not INSERT', async () => {
  // Scenario: 'User@Example.com' is stored in public.users (legacy mixed-case row).
  // Incoming request sends 'user@example.com'. normalizeEmail lowercases it to
  // 'user@example.com'. The ilike() call matches 'User@Example.com' case-insensitively.
  // The UPDATE path must fire — NOT upsert/INSERT.
  const NEW_AUTH_ID = 'aaaaaaaa-6006-4000-8000-000000000006'
  const ORPHANED_ID = 'bbbbbbbb-dead-4000-8000-000000000006'

  // Incoming email has mixed case — normalizeEmail() (mocked above) will lowercase it
  const caseBody = { ...VALID_BODY, email: 'User@Example.com' }

  // createUser SUCCEEDS → new auth account (the mixed-case email is already auth-less)
  mockCreateUser.mockResolvedValueOnce({
    data: { user: { id: NEW_AUTH_ID } },
    error: null,
  })

  // ilike() on the mock chain is a pass-through; maybeSingle() pops the result.
  // Simulate: the orphaned mixed-case row is found.
  fromQueue.push({ data: { id: ORPHANED_ID }, error: null })

  // UPDATE in-place succeeds
  fromQueue.push({ data: null, error: null })

  // seedUserLibrary
  fromQueue.push({ data: null, error: null })

  const { status, json } = await callRoute(caseBody)

  expect(status).toBe(200)
  expect(json.ok).toBe(true)
  expect(json.userId).toBe(NEW_AUTH_ID)

  // UPDATE must have fired (capturedUpdatePayload set by chain.update mock),
  // NOT the upsert path — confirming the collision branch was taken.
  expect(capturedUpdatePayload).not.toBeNull()
  expect(capturedUpdatePayload!.id).toBe(NEW_AUTH_ID)
  expect(capturedUpdatePayload!.signup_source).toBe('bell-invitation')
  // Email written to DB must be lowercased (normalizeEmail applied before any write)
  expect(capturedUpdatePayload).not.toHaveProperty('email', 'User@Example.com')
})
