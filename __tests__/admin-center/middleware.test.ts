jest.mock('@supabase/ssr',()=>({createServerClient:jest.fn()}))
import {createServerClient} from '@supabase/ssr'
import {middleware,config} from '../../middleware'
import {NextRequest} from 'next/server'
const create=createServerClient as jest.Mock
beforeEach(()=>create.mockReset())
test('API-wide matcher includes every admin endpoint',()=>expect(config.matcher).toContain('/api/admin/:path*'))
test('admin API denies anonymous user before legacy handler',async()=>{create.mockReturnValue({auth:{getUser:async()=>({data:{user:null},error:null})}});expect((await middleware(new NextRequest('https://app.invalid/api/admin/mercury'))).status).toBe(403)})
test('admin API denies ordinary subscriber',async()=>{create.mockReturnValue({auth:{getUser:async()=>({data:{user:{email:'reader@example.invalid'}},error:null})}});expect((await middleware(new NextRequest('https://app.invalid/api/admin/payments'))).status).toBe(403)})
test('admin API allows verified owner',async()=>{create.mockReturnValue({auth:{getUser:async()=>({data:{user:{email:'marc@endless-tales.com'}},error:null})}});expect((await middleware(new NextRequest('https://app.invalid/api/admin/mercury'))).headers.get('x-middleware-next')).toBe('1')})
test('scoped machine token permits production advance without browser cookies',async()=>{process.env.ADMIN_INTERNAL_TOKEN='x'.repeat(40);try{const r=await middleware(new NextRequest('https://app.invalid/api/admin/production-jobs/run-next',{method:'POST',headers:{'x-et-internal-key':'x'.repeat(40)}}));expect(r.headers.get('x-middleware-next')).toBe('1');expect(create).not.toHaveBeenCalled()}finally{delete process.env.ADMIN_INTERNAL_TOKEN}})
test('machine token cannot access financial endpoint',async()=>{process.env.ADMIN_INTERNAL_TOKEN='x'.repeat(40);create.mockReturnValue({auth:{getUser:async()=>({data:{user:null},error:null})}});try{const r=await middleware(new NextRequest('https://app.invalid/api/admin/refund',{method:'POST',headers:{'x-et-internal-key':'x'.repeat(40)}}));expect(r.status).toBe(403)}finally{delete process.env.ADMIN_INTERNAL_TOKEN}})
