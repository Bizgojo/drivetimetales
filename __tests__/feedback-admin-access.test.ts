jest.mock('server-only',()=>({}),{virtual:true})
jest.mock('@/lib/server/feedbackAdmin',()=>({feedbackAdmin:jest.fn()}))
jest.mock('@/lib/server/accountUser',()=>({accountAdmin:jest.fn()}))
import {feedbackAdmin} from '@/lib/server/feedbackAdmin'
import {accountAdmin} from '@/lib/server/accountUser'
import {GET as ideas,POST as selectIdea} from '@/app/api/admin/story-ideas/route'
import {GET as trends} from '@/app/api/admin/listener-preferences/route'
import {NextRequest} from 'next/server'
beforeEach(()=>jest.clearAllMocks())
it('denies non-admin users before reading subscriber information',async()=>{(feedbackAdmin as jest.Mock).mockResolvedValue(null);expect((await ideas()).status).toBe(403);expect((await trends(new NextRequest('https://test.example/api/admin/listener-preferences'))).status).toBe(403);expect((await selectIdea(new NextRequest('https://test.example/api/admin/story-ideas',{method:'POST',body:'{}'}))).status).toBe(403);expect(accountAdmin).not.toHaveBeenCalled()})
it('blocks cross-origin selection before loading an account',async()=>{expect((await selectIdea(new NextRequest('https://test.example/api/admin/story-ideas',{method:'POST',headers:{origin:'https://other.example'},body:'{}'}))).status).toBe(403);expect(feedbackAdmin).not.toHaveBeenCalled()})
it('rejects invalid idea IDs without calling a production function',async()=>{(feedbackAdmin as jest.Mock).mockResolvedValue({id:'admin'});const rpc=jest.fn();(accountAdmin as jest.Mock).mockReturnValue({rpc});expect((await selectIdea(new NextRequest('https://test.example/api/admin/story-ideas',{method:'POST',body:JSON.stringify({id:'not-an-id',action:'select',authorized:true})}))).status).toBe(400);expect(rpc).not.toHaveBeenCalled()})
