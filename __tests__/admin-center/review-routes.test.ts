jest.mock('server-only',()=>({}),{virtual:true})
jest.mock('../../lib/admin-center/auth',()=>({adminAccess:jest.fn()}))
jest.mock('../../lib/admin-center/store',()=>({db:jest.fn()}))
jest.mock('../../lib/admin-center/providers',()=>({stripeSummary:jest.fn()}))
jest.mock('../../lib/admin-center/cost-source',()=>({storyCosts:jest.fn()}))
import {NextRequest,NextResponse} from 'next/server'
import {adminAccess} from '../../lib/admin-center/auth'
import {db} from '../../lib/admin-center/store'
import {GET as search} from '../../app/api/admin/center/customer-search/route'
import {GET as summary} from '../../app/api/admin/center/customer-summary/route'
import {GET as costs} from '../../app/api/admin/center/story-costs/route'
import {GET as performance} from '../../app/api/admin/center/story-performance/route'
import {POST as commentary} from '../../app/api/admin/center/variance-commentary/route'
const access=adminAccess as jest.Mock,client=db as jest.Mock
beforeEach(()=>{jest.clearAllMocks()})
test.each([search,summary,costs,performance])('new read endpoints deny access before database reads',async handler=>{access.mockResolvedValue(NextResponse.json({error:'Denied'},{status:403}));expect((await handler(new NextRequest('https://app.invalid/api/admin/center/test'))).status).toBe(403);expect(client).not.toHaveBeenCalled()})
test('blank search does not enumerate subscribers',async()=>{access.mockResolvedValue(null);expect(await(await search(new NextRequest('https://app.invalid/?q=a'))).json()).toEqual({subscribers:[]});expect(client).not.toHaveBeenCalled()})
test('invalid period cannot trigger an unbounded read',async()=>{access.mockResolvedValue(null);expect((await performance(new NextRequest('https://app.invalid/?days=-1'))).status).toBe(400);expect(client).not.toHaveBeenCalled()})
test('plan commentary states the missing actuals without provider call or invented causes',async()=>{access.mockResolvedValue(null);const r=await commentary(new NextRequest('https://app.invalid',{method:'POST',body:JSON.stringify({plan:true})}));const p=await r.json();expect(p.status).toBe('pending');expect(p.commentary).toContain('No AI call was made');expect(client).not.toHaveBeenCalled()})
test('AI review denies unauthorized writes',async()=>{access.mockResolvedValue(NextResponse.json({error:'Denied'},{status:403}));expect((await commentary(new NextRequest('https://app.invalid',{method:'POST'}))).status).toBe(403)})
