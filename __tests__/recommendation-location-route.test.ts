jest.mock('@supabase/ssr', () => ({ createServerClient: jest.fn() }))
jest.mock('next/headers', () => ({ cookies: () => ({ getAll: () => [] }) }))

import { createServerClient } from '@supabase/ssr'
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/user/recommendation-location/route'

const storyId = '11111111-1111-4111-8111-111111111111'
const userId = '22222222-2222-4222-8222-222222222222'
let profile: any
let stories: any[]
let signedIn: boolean
let queryError: any
let calls: any[]

function request(body: unknown) {
  return new NextRequest('https://app.example/api/user/recommendation-location', {
    method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  profile = { state: 'South Carolina' }
  stories = [{ id: storyId, title: 'A mystery', script: 'Greenville, South Carolina.', description: '' }]
  signedIn = true
  queryError = null
  calls = []
  ;(createServerClient as jest.Mock).mockImplementation(() => ({
    auth: { getUser: async () => ({ data: { user: signedIn ? { id: userId, user_metadata: { city: 'Greenville' } } : null } }) },
    from: (table: string) => {
      calls.push(['from', table])
      const query: any = {
        select: (...args: any[]) => { calls.push(['select', ...args]); return query },
        eq: (...args: any[]) => { calls.push(['eq', ...args]); return query },
        in: (...args: any[]) => { calls.push(['in', ...args]); return query },
        maybeSingle: async () => ({ data: profile, error: queryError }),
        then: (resolve: any) => Promise.resolve({ data: stories, error: queryError }).then(resolve),
      }
      return query
    },
  }))
})

test('unauthenticated request reads no profile or stories', async () => {
  signedIn = false
  expect((await POST(request({ storyIds: [storyId] }))).status).toBe(401)
  expect(calls).toEqual([])
})

test.each([{ storyIds: ['bad'] }, { storyIds: Array(101).fill(storyId) }, {}])('rejects invalid candidate input', async body => {
  expect((await POST(request(body))).status).toBe(400)
  expect(calls).toEqual([])
})

test('uses authenticated identity, filters published visible stories, returns scores only', async () => {
  const response = await POST(request({ storyIds: [storyId], userId: 'someone-else', state: 'NY' }))
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ matches: { [storyId]: 2 } })
  expect(calls).toContainEqual(['eq', 'id', userId])
  expect(calls).toContainEqual(['eq', 'status', 'published'])
  expect(calls).toContainEqual(['eq', 'is_hidden', false])
  expect(calls).toContainEqual(['in', 'id', [storyId]])
  expect(response.headers.get('cache-control')).toBe('private, no-store')
})

test('missing location avoids fetching scripts and leaves ordinary recommendations available', async () => {
  profile = { state: null }
  const response = await POST(request({ storyIds: [storyId] }))
  expect(await response.json()).toEqual({ matches: {} })
  expect(calls).not.toContainEqual(['from', 'stories'])
})

test('database failure returns a non-success so Home falls back to its usual ranking', async () => {
  queryError = { message: 'unavailable' }
  expect((await POST(request({ storyIds: [storyId] }))).status).toBe(503)
})
