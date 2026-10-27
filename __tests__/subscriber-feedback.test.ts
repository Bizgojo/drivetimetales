jest.mock('server-only',()=>({}),{virtual:true})
import {preferenceTrends} from '@/lib/preferenceTrends'
import {deliverFeedbackEmails} from '@/lib/server/subscriberFeedback'
it('counts each subscriber once per genre or theme and aggregates listening lengths',()=>{
 const t=preferenceTrends([{genres:['Mystery','Mystery'],interests:'Small towns, space, small towns',avoid:'horror',preferred_minutes:15},{genres:['Mystery','Sci-Fi'],interests:'SMALL TOWNS',preferred_minutes:30}])
 expect(t.respondents).toBe(2);expect(t.genres.find(g=>g.name==='Mystery')?.count).toBe(2);expect(t.interests[0]).toEqual({name:'small towns',count:2});expect(t.lengths).toEqual([{name:'15',count:1},{name:'30',count:1}])
})
function db() {
 const writes:any[]=[]
 const notice={id:'notice1',user_id:'user1',subject:'Selected',message:'Your idea has been selected.'}
 const query:any={select:()=>query,in:()=>query,order:()=>query,limit:()=>query,eq:()=>query,then:(resolve:any)=>Promise.resolve({data:[notice],error:null}).then(resolve)}
 const admin:any={
  from:()=>({...query,update:(patch:any)=>({eq:async()=>{writes.push(patch);return {error:null}}})}),
  auth:{admin:{getUserById:async(id:string)=>({data:{user:{email:id+'@example.invalid'}}})}},
 }
 return {writes,admin}
}
beforeEach(()=>{delete process.env.RESEND_API_KEY;global.fetch=jest.fn() as any})
it('keeps in-app updates when email is unconfigured',async()=>{const x=db();expect(await deliverFeedbackEmails(x.admin)).toMatchObject({sent:0,error:expect.any(String)});expect(fetch).not.toHaveBeenCalled()})
it('uses a stable idempotency key, fixed recipient and records successful delivery',async()=>{process.env.RESEND_API_KEY='test-key';(fetch as jest.Mock).mockResolvedValue({ok:true});const x=db();expect(await deliverFeedbackEmails(x.admin)).toEqual({sent:1});const options=(fetch as jest.Mock).mock.calls[0][1];expect(options.headers['Idempotency-Key']).toBe('subscriber-notice-notice1');expect(JSON.parse(options.body).to).toBe('user1@example.invalid');expect(x.writes[0].email_status).toBe('sent')})
it('records a failed email for retry rather than claiming it was delivered',async()=>{process.env.RESEND_API_KEY='test-key';(fetch as jest.Mock).mockResolvedValue({ok:false,status:503});const x=db();expect(await deliverFeedbackEmails(x.admin)).toEqual({sent:0});expect(x.writes[0]).toMatchObject({email_status:'failed',email_error:'Email provider returned 503'})})
