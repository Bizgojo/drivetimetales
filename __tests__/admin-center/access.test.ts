jest.mock('server-only',()=>({}),{virtual:true})
jest.mock('../../lib/server/feedbackAdmin',()=>({feedbackAdmin:jest.fn()}))
import {adminAccess} from '../../lib/admin-center/auth'
import {feedbackAdmin} from '../../lib/server/feedbackAdmin'
const admin=feedbackAdmin as jest.Mock
beforeEach(()=>admin.mockReset())
test('unavailable authorization fails closed',async()=>{admin.mockRejectedValue(new Error('timeout'));expect((await adminAccess())?.status).toBe(503)})
test('anonymous user cannot access privileged APIs',async()=>{admin.mockResolvedValue(null);expect((await adminAccess())?.status).toBe(403)})
test('authenticated admin can read',async()=>{admin.mockResolvedValue({id:'owner'});expect(await adminAccess()).toBe(null)})
test('cross-origin mutation denied before action',async()=>{admin.mockResolvedValue({id:'owner'});expect((await adminAccess(new Request('https://app.invalid/api/admin/center/policy',{method:'POST',headers:{origin:'https://evil.invalid'}})))?.status).toBe(403)})
test('same-origin owner mutation is permitted',async()=>{admin.mockResolvedValue({id:'owner'});expect(await adminAccess(new Request('https://app.invalid/api/admin/center/policy',{method:'POST',headers:{origin:'https://app.invalid'}}))).toBe(null)})
