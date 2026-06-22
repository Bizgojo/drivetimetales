import { createClient } from '@supabase/supabase-js'
import { resolveNameKey } from '@/lib/personalization/nameKey'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

export async function ensureNamePoolForUser(userId: string, rawFirstName: unknown) {
  if (!userId) throw new Error('userId is required')

  const resolved = await resolveNameKey(rawFirstName)
  if (!resolved) {
    const { error } = await supabaseAdmin
      .from('users')
      .update({ name_pronunciation_key: null })
      .eq('id', userId)
    if (error) throw new Error(`Failed to clear user name_pronunciation_key: ${error.message}`)
    return { pronunciationKey: null, queued: false }
  }

  const { data: existingPool, error: poolReadError } = await supabaseAdmin
    .from('name_pools')
    .select('pronunciation_key,status')
    .eq('pronunciation_key', resolved.pronunciationKey)
    .maybeSingle()
  if (poolReadError) throw new Error(`Failed to read name_pools: ${poolReadError.message}`)

  let poolStatus = existingPool?.status ? String(existingPool.status) : 'pending'
  if (!existingPool) {
    const { error: insertPoolError } = await supabaseAdmin
      .from('name_pools')
      .insert({
        pronunciation_key: resolved.pronunciationKey,
        canonical_spelling: resolved.canonicalSpelling,
        phonetic_hint: resolved.phoneticHint,
        status: 'pending',
      })
    if (insertPoolError && insertPoolError.code !== '23505') {
      throw new Error(`Failed to insert name_pools row: ${insertPoolError.message}`)
    }
  }

  let queued = false
  if (poolStatus !== 'ready') {
    const { data: existingJob, error: jobReadError } = await supabaseAdmin
      .from('name_pool_jobs')
      .select('id')
      .eq('pronunciation_key', resolved.pronunciationKey)
      .in('status', ['pending', 'processing'])
      .limit(1)
      .maybeSingle()
    if (jobReadError) throw new Error(`Failed to read name_pool_jobs: ${jobReadError.message}`)

    if (!existingJob) {
      const { error: insertJobError } = await supabaseAdmin
        .from('name_pool_jobs')
        .insert({
          pronunciation_key: resolved.pronunciationKey,
          canonical_spelling: resolved.canonicalSpelling,
          status: 'pending',
        })
      if (insertJobError && insertJobError.code !== '23505') {
        throw new Error(`Failed to insert name_pool_jobs row: ${insertJobError.message}`)
      }
      queued = !insertJobError
    }
  }

  const { error: userUpdateError } = await supabaseAdmin
    .from('users')
    .update({ name_pronunciation_key: resolved.pronunciationKey })
    .eq('id', userId)
  if (userUpdateError) throw new Error(`Failed to set user name_pronunciation_key: ${userUpdateError.message}`)

  return {
    pronunciationKey: resolved.pronunciationKey,
    canonicalSpelling: resolved.canonicalSpelling,
    queued,
  }
}
