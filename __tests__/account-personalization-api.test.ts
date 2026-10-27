jest.mock('@/lib/server/accountUser', () => ({ accountUser: jest.fn(), accountAdmin: jest.fn() }))
import { NextRequest } from 'next/server'
import { accountUser, accountAdmin } from '@/lib/server/accountUser'
import { GET as readPreferences, POST as preferences } from '@/app/api/user/preferences/route'
import { GET as photo, POST as uploadPhoto } from '@/app/api/user/photo/route'
import { POST as invite } from '@/app/api/user/invite/route'
const upsert = jest.fn(async () => ({ error: null }))
const eq = jest.fn(() => ({ maybeSingle: async () => ({data:{genres:['Mystery'],preferred_minutes:15,interests:'',avoid:''},error:null}) }))
const download = jest.fn(async () => ({ data: new Blob(['image']), error: null }))
beforeEach(() => {
  jest.clearAllMocks()
  ;(accountUser as jest.Mock).mockResolvedValue({ id: 'my-user', user_metadata: { name: 'Me', et_photo: 'aabb-1234.jpg' } })
  ;(accountAdmin as jest.Mock).mockReturnValue({ from: () => ({upsert, select: () => ({eq})}), storage: { from: () => ({ download }) } })
})
function req(path: string, body = {}, origin = 'https://test.example') { return new NextRequest(`https://test.example${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', origin }, body: JSON.stringify(body) }) }
it('requires sign-in for preferences, photo and invitation', async () => {
  ;(accountUser as jest.Mock).mockResolvedValue(null)
  expect((await preferences(req('/api/user/preferences'))).status).toBe(401)
  expect((await photo()).status).toBe(401)
  expect((await uploadPhoto(req('/api/user/photo'))).status).toBe(401)
  expect((await invite(req('/api/user/invite'))).status).toBe(401)
  expect(accountAdmin).not.toHaveBeenCalled()
})
it('saves preferences under the authenticated user, ignoring submitted user IDs', async () => {
  expect((await preferences(req('/api/user/preferences', { userId: 'other-user', genres: ['Mystery', 'bogus'], minutes: 15 }))).status).toBe(200)
  expect(upsert).toHaveBeenCalledWith(expect.objectContaining({user_id:'my-user',genres:['Mystery'],interests:'',avoid:'',preferred_minutes:15}),{onConflict:'user_id'})
})
it('blocks cross-origin writes before touching an account', async () => {
  expect((await preferences(req('/api/user/preferences', {}, 'https://other.example'))).status).toBe(403)
  expect((await invite(req('/api/user/invite', {}, 'https://other.example'))).status).toBe(403)
  expect((await uploadPhoto(req('/api/user/photo', {}, 'https://other.example'))).status).toBe(403)
  expect(accountUser).not.toHaveBeenCalled()
})
it('serves only the signed-in user’s private photo without caching', async () => {
  const response = await photo()
  expect(response.status).toBe(200)
  expect(download).toHaveBeenCalledWith('account-photos/my-user/aabb-1234.jpg')
  expect(response.headers.get('cache-control')).toBe('private, no-store')
})
it('rejects invalid photo paths from editable metadata', async () => {
  ;(accountUser as jest.Mock).mockResolvedValue({ id: 'my-user', user_metadata: { et_photo: '../other-user/photo.jpg' } })
  expect((await photo()).status).toBe(404)
  expect(download).not.toHaveBeenCalled()
})

it('reads saved preferences only for the signed-in subscriber', async () => { const res=await readPreferences();expect(res.status).toBe(200);expect(eq).toHaveBeenCalledWith('user_id','my-user');expect((await res.json()).preferences.minutes).toBe(15) })
