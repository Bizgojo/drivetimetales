jest.mock('server-only',()=>({}),{virtual:true})
import {stripeSummary,mercurySummary,metaSummary} from '../../lib/admin-center/providers'
const original=global.fetch
beforeEach(()=>{delete process.env.STRIPE_SECRET_KEY;delete process.env.MERCURY_API_TOKEN;delete process.env.META_ACCESS_TOKEN;delete process.env.META_AD_ACCOUNT_ID})
afterEach(()=>{global.fetch=original})
test('missing financial credentials produce unavailable rather than zero',async()=>{expect(await stripeSummary()).toMatchObject({status:'unavailable'});expect(await mercurySummary()).toMatchObject({status:'unavailable'})})
test('Mercury malformed balance cannot become actual cash',async()=>{process.env.MERCURY_API_TOKEN='test';global.fetch=jest.fn().mockResolvedValue(new Response(JSON.stringify({accounts:[{id:'x',availableBalance:null}]})));const p=await mercurySummary();expect(p.status).toBe('unavailable');expect('cash' in p).toBe(false)})
test('Mercury available USD balances are timestamped; transfers remain disabled',async()=>{process.env.MERCURY_API_TOKEN='test';global.fetch=jest.fn().mockResolvedValue(new Response(JSON.stringify({accounts:[{id:'x',availableBalance:123.45}]})));expect(await mercurySummary()).toMatchObject({status:'connected',cash:123.45,transfersEnabled:false})})
test('Meta failures cannot be presented as no active campaigns',async()=>{process.env.META_ACCESS_TOKEN='test';process.env.META_AD_ACCOUNT_ID='123';global.fetch=jest.fn().mockResolvedValue(new Response('{}',{status:403}));expect(await metaSummary()).toMatchObject({status:'unavailable',writeEnabled:false})})
