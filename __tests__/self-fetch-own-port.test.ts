/** ZERO-DOWNTIME-001 follow-up: the app may call itself on its own port (3001/3002 slots). */
import { internalAdminFetch, ownLoopbackOrigins } from '@/lib/admin-center/internal-fetch'

test('own loopback origins come from PORT', () => {
  expect(ownLoopbackOrigins({ PORT: '3001' })).toEqual(['http://127.0.0.1:3001', 'http://localhost:3001'])
  expect(ownLoopbackOrigins({})).toEqual([])
  expect(ownLoopbackOrigins({ PORT: 'evil.com' })).toEqual([])
})

test('a self-fetch to localhost:<PORT> is allowed; another port is not', async () => {
  const saved = { ...process.env }
  process.env.PORT = '3001'
  process.env.ADMIN_INTERNAL_TOKEN = 'x'.repeat(40)
  process.env.ADMIN_INTERNAL_ORIGINS = 'https://app.endless-tales.com'
  const realFetch = global.fetch
  global.fetch = jest.fn(async () => new Response('{}')) as any
  try {
    await expect(internalAdminFetch('http://localhost:3001/api/admin/generate-voices', { method: 'POST' })).resolves.toBeTruthy()
    expect(() => internalAdminFetch('http://localhost:3999/api/admin/generate-voices', { method: 'POST' })).toThrow(/not authorized/)
  } finally {
    global.fetch = realFetch
    process.env = saved
  }
})
