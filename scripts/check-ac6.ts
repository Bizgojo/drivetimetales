/**
 * AC-6 Verification: Check job c5e531da status
 * 
 * Run with: npx ts-node scripts/check-ac6.ts
 */

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
)

async function checkAC6() {
  const jobId = 'c5e531da-03d8-4f1f-b9a2-faf505dbb890'

  try {
    const { data, error } = await supabase
      .from('production_jobs')
      .select('id, status, current_step, updated_at')
      .eq('id', jobId)
      .single()

    if (error) {
      console.error('❌ Query error:', error)
      process.exit(1)
    }

    console.log('\n✅ AC-6 Verification: Job Status Check')
    console.log('=====================================')
    console.log(`Job ID: ${data.id}`)
    console.log(`Status: ${data.status}`)
    console.log(`Current Step: ${data.current_step}`)
    console.log(`Last Updated: ${data.updated_at}`)
    console.log('')

    const isQueued = data.status === 'queued'
    const isGenerateVoices = data.current_step === 'generate_voices'
    const passes = isQueued && isGenerateVoices

    if (passes) {
      console.log('✅ AC-6 PASS: Job is queued at generate_voices step')
      console.log('   Autonomous runner will proceed with fresh segment generation')
      console.log('   Story #2 will auto-regenerate stale segments on next produce run')
    } else {
      console.log('❌ AC-6 FAIL')
      console.log(`   Expected: status=queued, current_step=generate_voices`)
      console.log(`   Got: status=${data.status}, current_step=${data.current_step}`)
    }

    process.exit(passes ? 0 : 1)
  } catch (err) {
    console.error('❌ Error:', err)
    process.exit(1)
  }
}

checkAC6()
