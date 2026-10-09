import { NextRequest } from 'next/server'
import { parseExport, usageSummary } from '../lib/ai-spending/openclaw'
import { readImports, saveImport } from '../lib/ai-spending/openclaw-storage'
const mockGetUser = jest.fn(), mockClient = jest.fn()
jest.mock('@supabase/ssr', () => ({ createServerClient: () => ({ auth: { getUser: mockGetUser } }) }))
jest.mock('@supabase/supabase-js', () => ({ createClient: (...args: any[]) => mockClient(...args) }))
jest.mock('next/headers', () => ({ cookies: () => ({ getAll: () => [] }) }))
import { POST } from '../app/api/admin/ai-spending/import/route'
const row = { ts: '2026-07-10T00:30:00Z', agent: 'orion', provider: 'anthropic', model: 'claude-sonnet-4-6', api: 'anthropic-messages', run_id: 'reused', session_id: 'session1', trace_id: 'session1', seq: 5, source_seq: 5, input: 100, output: 200, cache_read: 300, cache_write: 400, total: 1000, event_id: 'orion:session1:5', record_source: 'model.completed' }
const exportText = (r: any = row) => JSON.stringify(r) + '\n'
beforeEach(() => { mockGetUser.mockReset(); mockClient.mockReset() })
test('v2 whitelist rejects prompt data, invalid counts, and conflicting identities; run ID reuse stays distinct', () => {
  expect(() => parseExport(exportText({ ...row, prompt: 'private' }))).toThrow('17 fields')
  expect(() => parseExport(exportText({ ...row, input: -1 }))).toThrow('numeric')
  expect(() => parseExport(exportText(row) + exportText({ ...row, output: 201 }))).toThrow('conflicting')
  const next = { ...row, source_seq: 12, event_id: 'orion:session1:12' }
  expect(parseExport(exportText(row) + exportText(row) + exportText(next))).toHaveLength(2)
})
test('price scenarios account for cache TTL, preserve nulls and retain anomalies without costing them', () => {
  const a = usageSummary(parseExport(exportText())).daily[0]
  expect(a.date).toBe('2026-07-09'); expect(a.low).toBeCloseTo(.00489); expect(a.high).toBeCloseTo(.00579)
  const missing = usageSummary(parseExport(exportText({ ...row, cache_read: null }))).daily[0]
  expect(missing.unpriced).toBe(1); expect(missing.low).toBe(0)
  const flagged = usageSummary(parseExport(exportText({ ...row, total: 5160712046 })))
  expect(flagged.anomalies).toHaveLength(1); expect(flagged.daily[0].flagged).toBe(1); expect(flagged.daily[0].low).toBe(0)
  const unknown = usageSummary(parseExport(exportText({ ...row, agent: 'deepseek-r1', event_id: 'deepseek-r1:session1:5', provider: 'deepseek', model: 'deepseek-reasoner' }))).daily[0]
  expect(unknown.agent).toBe('deepseek-r1'); expect(unknown.unpriced).toBe(1)
})
function storageMock() {
  const objects = new Map<string, string>()
  const upload = jest.fn(async (name: string, content: string) => { if (objects.has(name)) return { error: { statusCode: '409' } }; objects.set(name, content); return { error: null } })
  const bucket = { list: async () => ({ data: [...objects.keys()].map(name => ({ name: name.split('/')[1] })), error: null }), upload, download: async (key: string) => ({ data: new Blob([objects.get(key)!]), error: null }) }
  const db: any = { storage: { getBucket: jest.fn(async () => ({ data: { public: false }, error: null })), from: () => bucket } }
  return { db, upload, objects }
}
test('immutable private snapshots merge overlapping history and never multiply runs on re-import', async () => {
  const { db, upload } = storageMock()
  expect((await saveImport(db, exportText())).repeated).toBe(false)
  expect((await saveImport(db, exportText())).repeated).toBe(true)
  await saveImport(db, exportText() + exportText({ ...row, source_seq: 12, event_id: 'orion:session1:12' }))
  const result = await readImports(db)
  expect(upload).toHaveBeenCalledTimes(2); expect(result.runs).toBe(2); expect(result.status).toBe('connected')
  db.storage.getBucket.mockResolvedValue({ data: { public: true }, error: null })
  expect((await readImports(db)).status).toBe('unavailable')
  await expect(saveImport(db, exportText())).rejects.toThrow('private')
})
test('conflicting cross-snapshot events are excluded and reported, not summed', async () => {
  const { db } = storageMock(); await saveImport(db, exportText()); await saveImport(db, exportText({ ...row, output: 201, total: 1001 }))
  const result = await readImports(db); expect(result.conflicts).toBe(1); expect(result.runs).toBe(0); expect(result.status).toBe('partial')
})
test('import requires an admin and same origin, and rejects invalid exports before storage access', async () => {
  const url = 'https://app.endless-tales.com/api/admin/ai-spending/import'
  const req = (origin = 'https://app.endless-tales.com', body = exportText()) => new NextRequest(url, { method: 'POST', headers: { origin, 'content-type': 'application/x-ndjson' }, body })
  mockGetUser.mockResolvedValue({ data: { user: { email: 'listener@example.com' } } })
  expect((await POST(req())).status).toBe(401)
  mockGetUser.mockResolvedValue({ data: { user: { email: 'marc@endless-tales.com' } } })
  expect((await POST(req('https://other.example'))).status).toBe(403)
  expect((await POST(req('https://app.endless-tales.com', '{}'))).status).toBe(400)
  expect(mockClient).not.toHaveBeenCalled()
  const { db } = storageMock(); mockClient.mockReturnValue(db)
  expect((await POST(req())).status).toBe(200)
})
