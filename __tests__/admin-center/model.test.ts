import { allocation, DEFAULT_POLICY, forecast, validPolicy, safeActionPath, isQuiet, pendingVoice } from '../../lib/admin-center/model'
import {validInternalToken} from '../../lib/admin-center/access-policy'
import {internalAdminFetch} from '../../lib/admin-center/internal-fetch'

describe('Admin financial and authorization boundaries',()=>{
 test('protect essential expenses, taxes, reserves and commitments before surplus',()=>{
  expect(allocation(10000,20000,{...DEFAULT_POLICY,essential:1000,taxes:2000,reserve:5000})).toEqual({protectedFunds:8000,eligible:7000,target:5250,marketing:5250,shortfall:0,distributable:6750})
 })
 test('no negative funds or fabricated cash when commitments exceed cash',()=>{
  const p=allocation(1000,100,{...DEFAULT_POLICY,essential:200,reserve:500})
  expect(p.marketing).toBe(0);expect(p.distributable).toBe(0);expect(p.shortfall).toBe(4600)
 })
 test('reject invalid policy values',()=>{expect(validPolicy({...DEFAULT_POLICY,marketingPercent:101})).toBe(false);expect(validPolicy({...DEFAULT_POLICY,reserve:NaN})).toBe(false);expect(validPolicy(DEFAULT_POLICY)).toBe(true)})
 test('twelve explicitly projected months and invalid assumptions',()=>{expect(forecast({subscribers:100,cash:1000,arpu:10,cac:30,churn:.05,growth:0,monthlyCost:100,percent:75})).toHaveLength(12);expect(()=>forecast({subscribers:0,cash:0,arpu:10,cac:0,churn:0,growth:0,monthlyCost:0,percent:75})).toThrow()})
 test.each(['https://evil.invalid/admin','//evil.invalid','/admin\\evil','/administrator','/admin\n'])('reject unsafe deep link %s',v=>expect(safeActionPath(v)).toBe(false))
 test('allow exact Admin action route',()=>expect(safeActionPath('/admin?section=stories#story-123')).toBe(true))
 test('quiet hours span midnight; urgent handling belongs to caller',()=>{expect(isQuiet(23,21,8)).toBe(true);expect(isQuiet(7,21,8)).toBe(true);expect(isQuiet(8,21,8)).toBe(false);expect(isQuiet(10,8,8)).toBe(false)})
 test('only actual parked voice review creates approval alert',()=>{expect(pendingVoice({state_json:{castReview:{requestedAt:'now'}}})).toBe(false);expect(pendingVoice({status:'waiting_for_external',error_json:{kind:'awaiting_cast_approval'},state_json:{castReview:{requestedAt:'now',approvedAt:null}}})).toBe(true)})
 test('machine secret has exact path and minimum strength restrictions',()=>{const token='a'.repeat(40);expect(validInternalToken(token,token,'/api/admin/production-jobs/run-next')).toBe(true);expect(validInternalToken(token,token,'/api/admin/refund')).toBe(false);expect(validInternalToken('',undefined,'/api/admin/production-jobs/run-next')).toBe(false);expect(validInternalToken('short','short','/api/admin/production-jobs/run-next')).toBe(false)})
 test('internal transport never leaks token to an unapproved origin',async()=>{
  const original=global.fetch;global.fetch=jest.fn().mockResolvedValue(new Response('{}'))
  process.env.ADMIN_INTERNAL_TOKEN='a'.repeat(40);process.env.ADMIN_INTERNAL_ORIGINS='https://approved.invalid'
  try{
   expect(()=>internalAdminFetch('https://evil.invalid/api/admin/generate-voices')).toThrow('origin')
   await internalAdminFetch('https://approved.invalid/api/admin/generate-voices',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})
   expect(new Headers((global.fetch as jest.Mock).mock.calls[0][1].headers).get('x-et-internal-key')).toBe('a'.repeat(40))
   await internalAdminFetch('https://provider.invalid/audio',{headers:{hello:'world'}})
   expect((global.fetch as jest.Mock).mock.calls[1][1]).toEqual({headers:{hello:'world'}})
  }finally{global.fetch=original;delete process.env.ADMIN_INTERNAL_TOKEN;delete process.env.ADMIN_INTERNAL_ORIGINS}
 })
})
