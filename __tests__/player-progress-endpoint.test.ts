let mockRow: any
let mockUser: any
let mockRace: any = null
let mockFilters: any[] = []
const mockId = '22222222-2222-4222-8222-222222222222'
const mockDb = { from: () => {
  let op = 'read', patch: any, guard: string | null = null
  const filters: any[] = []
  const q: any = {
    select: () => q, eq: (k: string, v: any) => { filters.push([k, v]); return q },
    or: (v: string) => { guard = v; return q }, maybeSingle: () => q,
    update: (v: any) => { op = 'update'; patch = v; return q },
    insert: (v: any) => { op = 'insert'; patch = v; return q },
    then: (resolve: any, reject: any) => Promise.resolve().then(() => {
      if (op === 'read') return { data: mockRow ? { ...mockRow } : null, error: null }
      mockFilters.push({ op, filters, guard, patch })
      if (mockRace) { mockRow = { ...mockRow, ...mockRace }; mockRace = null }
      if (op === 'insert' && mockRow) return { data: null, error: { code: '23505' } }
      if (guard && mockRow?.last_played && Date.parse(mockRow.last_played) > Date.parse(guard.split('last_played.lte.')[1])) return { data: null, error: null }
      mockRow = { ...mockRow, ...patch }; return { data: { ...mockRow }, error: null }
    }).then(resolve, reject),
  }
  return q
} }
jest.mock('@supabase/supabase-js', () => ({ createClient: () => mockDb }))
jest.mock('@supabase/ssr', () => ({ createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: mockUser }, error: null }) } }) }))
jest.mock('next/headers', () => ({ cookies: () => ({ getAll: () => [] }) }))
jest.mock('next/server', () => ({ NextResponse: { json: (body: any, options?: any) => new Response(JSON.stringify(body), { status: options?.status || 200 }) } }))
import { POST } from '../app/api/user/save-progress/route'
const old = '2026-10-30T10:00:00.000Z', newer = '2026-10-30T10:01:00.000Z'
async function save(body: any) { return POST({ json: async () => ({ storyId: mockId, ...body }) } as any) }
beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.invalid'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'test'
  mockUser = { id: 'listener' }; mockFilters = []; mockRace = null
  mockRow = { story_id: mockId, progress: 400, completed: false, last_played: old, hide_from_home: true, not_for_me: true }
})
test('a newer pause after a rewind stores the lower position', async () => {
  expect((await save({ progress: 385, observedAt: newer })).status).toBe(200)
  expect(mockRow.progress).toBe(385)
  expect(mockRow.hide_from_home).toBe(true); expect(mockRow.not_for_me).toBe(true)
})
test('an explicit restart to zero survives background flush', async () => {
  await save({ progress: 0, observedAt: newer }); expect(mockRow.progress).toBe(0)
})
test('pausing near the end does not mark the episode completed', async () => {
  await save({ progress: 1190, durationSecs: 1200, observedAt: newer }); expect(mockRow.completed).toBe(false)
})
test('only an explicit completion earns completion, which stays sticky', async () => {
  await save({ progress: 1200, completed: true, observedAt: newer }); expect(mockRow.completed).toBe(true)
  await save({ progress: 0, observedAt: '2026-10-30T10:02:00Z' }); expect(mockRow.completed).toBe(true)
})
test('an older delayed save cannot overwrite a newer rewind', async () => {
  mockRow.progress = 200; mockRow.last_played = newer
  await save({ progress: 400, observedAt: old }); expect(mockRow.progress).toBe(200); expect(mockRow.last_played).toBe(newer)
})
test('atomic update guard rejects a save overtaken after SELECT', async () => {
  mockRace = { progress: 180, last_played: '2026-10-30T10:02:00Z' }
  await save({ progress: 385, observedAt: newer }); expect(mockRow.progress).toBe(180)
  expect(mockFilters[0].guard).toContain('last_played.lte.')
  expect(mockFilters[0].filters).toContainEqual(['user_id', 'listener'])
})
test('legacy lower-position saves do not make old progress look newer', async () => {
  await save({ progress: 300 }); expect(mockRow.progress).toBe(400); expect(mockRow.last_played).toBe(old)
})
test('a missing row can be created at zero without completing it', async () => {
  mockRow = null; await save({ progress: 0, observedAt: newer }); expect(mockRow.progress).toBe(0); expect(mockRow.completed).toBe(false)
})
test('a concurrent insert is recovered with a guarded update', async () => {
  mockRow = null; mockRace = { progress: 200, last_played: old }
  await save({ progress: 220, observedAt: newer }); expect(mockRow.progress).toBe(220)
})
test('sign-in is mandatory and caller cannot choose another owner', async () => {
  mockUser = null; expect((await save({ progress: 500, userId: 'other' })).status).toBe(401); expect(mockRow.progress).toBe(400)
})
test.each([{ progress: -1 }, { progress: null }, { progress: 2, observedAt: 'bad' }, { progress: 2, storyId: 'invalid' }])('rejects invalid input: %o', async body => {
  expect((await save(body)).status).toBe(400)
})
