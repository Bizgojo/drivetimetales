jest.mock('server-only',()=>({}),{virtual:true})
jest.mock('../../lib/admin-center/auth',()=>({adminAccess:jest.fn()}))
import {NextResponse} from 'next/server'
import {adminAccess} from '../../lib/admin-center/auth'
import {GET} from '../../app/api/admin/center/information-flow/route'
const access=adminAccess as jest.Mock
beforeEach(()=>access.mockReset())
test('process reference is inaccessible without Admin authorization',async()=>{access.mockResolvedValue(NextResponse.json({error:'Denied'},{status:403}));expect((await GET(new Request('https://app.invalid/api/admin/center/information-flow'))).status).toBe(403)})
test('authorized reference uses fixed asset path, private caching and restricted document capabilities',async()=>{access.mockResolvedValue(null);const r=await GET(new Request('https://app.invalid/api/admin/center/information-flow?path=/etc/passwd'));expect(r.status).toBe(200);expect(r.headers.get('cache-control')).toContain('no-store');expect(r.headers.get('content-security-policy')).toContain("frame-ancestors 'self'");expect(r.headers.get('content-security-policy')).toContain("form-action 'none'");const body=await r.text();expect(body).toContain('Information Flow');expect(body).not.toContain('Preview credit colors');expect(body).not.toContain('DEMO ·');})
