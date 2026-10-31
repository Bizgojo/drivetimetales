jest.mock('server-only',()=>({}),{virtual:true})
jest.mock('../../lib/admin-center/auth',()=>({adminAccess:jest.fn().mockResolvedValue(null)}))
jest.mock('../../lib/server/feedbackAdmin',()=>({feedbackAdmin:jest.fn().mockResolvedValue({id:'owner'})}))
jest.mock('../../lib/admin-center/store',()=>({db:jest.fn(),audit:jest.fn()}))
import {POST} from '../../app/api/admin/center/reply/route'
import {NextRequest} from 'next/server'
import {db} from '../../lib/admin-center/store'
const call=(b:any)=>POST(new NextRequest('https://app.invalid/api/admin/center/reply',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)}))
beforeEach(()=>{delete process.env.RESEND_API_KEY;(db as jest.Mock).mockReset()})
test('missing email configuration cannot mark a message answered',async()=>{expect((await call({id:'00000000-0000-4000-8000-000000004201',response:'Hello'})).status).toBe(503);expect(db).not.toHaveBeenCalled()})
test('empty reply cannot be sent',async()=>{expect((await call({id:'00000000-0000-4000-8000-000000004201',response:' '})).status).toBe(400);expect(db).not.toHaveBeenCalled()})
test('malformed ID cannot reach recipient lookup',async()=>{expect((await call({id:'bad',response:'hello'})).status).toBe(400)})
