jest.mock('@/lib/server/accountUser', () => ({ accountUser: jest.fn() }))
jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }))
import { createClient } from '@supabase/supabase-js'
import { accountUser } from '@/lib/server/accountUser'
import { NextRequest } from 'next/server'
import { signupName } from '@/lib/signupName'
let inserted: any
let profile: any
beforeEach(() => {
  profile = { first_name: 'Marc', last_name: 'Postlewaite' }
  inserted = null
  ;(accountUser as jest.Mock).mockResolvedValue({ id: 'signup-user', email: 'account@example.test', user_metadata: {} })
  ;(createClient as jest.Mock).mockReturnValue({ from: (table: string) => {
    const q: any = { select: () => q, eq: () => q, like: () => q, gte: () => q, order: () => q,
      single: async () => ({ data: profile, error: null }), limit: async () => ({ data: [] }),
      insert: async (value: any) => { inserted = value; return { error: null } } }
    return q
  } })
  delete process.env.RESEND_API_KEY
})
it('uses the registered name and ignores an alternate name in the submission', async () => {
  const { POST } = await import('@/app/api/suggest-story/route')
  const response = await POST(new NextRequest('https://test.example/api/suggest-story', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Pen Name', userId: 'other', genre: 'Mystery', title: 'A secret', idea: 'A letter arrives.', consent: true, consentVersion: '2026-10-27' }) }))
  expect(response.status).toBe(200)
  expect(inserted).toMatchObject({ user_id: 'signup-user', name: 'Marc Postlewaite', email: 'account@example.test' })
  expect(JSON.parse(inserted.message).creditName).toBe('Marc Postlewaite')
})
it('falls back only to signup metadata, never a display alias', () => {
  expect(signupName(null, { first_name: 'Jane', last_name: 'Doe', display_name: 'Pen Name' })).toBe('Jane Doe')
  expect(signupName(null, { display_name: 'Pen Name' })).toBe('')
})
