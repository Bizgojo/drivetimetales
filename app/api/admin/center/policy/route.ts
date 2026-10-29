import { NextRequest, NextResponse } from 'next/server'
import { adminAccess } from '@/lib/admin-center/auth'
import { db } from '@/lib/admin-center/store'
import { validPolicy } from '@/lib/admin-center/model'
import { feedbackAdmin } from '@/lib/server/feedbackAdmin'
export async function POST(req: NextRequest) {
  const denied = await adminAccess(req); if (denied) return denied
  try {
    const {policy,version,action,reference} = await req.json()
    if(action==='verify'){
      if(!Number.isInteger(version)||typeof reference!=='string'||reference.trim().length<5||reference.length>1000)return NextResponse.json({error:'Provide current policy version and reconciliation evidence reference'},{status:400})
      const user=await feedbackAdmin()
      const {error}=await db().rpc('admin_center_verify_policy',{p_actor:user!.id,p_expected_version:version,p_reference:reference.trim()})
      if(error)return NextResponse.json({error:'Attestation not saved. Reload policy and verify evidence.'},{status:409})
      return NextResponse.json({success:true,message:'Commitments attested for funding alerts. Profit and transfers remain blocked until full ledger reconciliation.'})
    }
    if (!validPolicy(policy) || !Number.isInteger(version)) return NextResponse.json({error:'Invalid policy or version'},{status:400})
    const user = await feedbackAdmin()
    const {data,error} = await db().rpc('admin_center_update_policy',{p_actor:user!.id,p_expected_version:version,p_policy:policy})
    if(error) return NextResponse.json({error:'Policy not saved. Reload to resolve concurrent changes or check migration.'},{status:409})
    return NextResponse.json({policy:data})
  } catch {return NextResponse.json({error:'Invalid request'},{status:400})}
}
