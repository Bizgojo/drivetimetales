/**
 * RECAST-SERIES-001 — recast one character across a series that is still in
 * production (voices not final-mixed yet), keeping a restorable backup.
 *
 *   npx tsx scripts/recast-series-character.ts <seriesId> "<CANONICAL NAME>" <newVoiceId> [--job <productionJobId>] [--apply]
 *
 * Without --apply: prints what it would do (dry run), changes nothing.
 * With --apply:
 *   1. series_character_roster: the character's row gets the new voice_id and
 *      voice_name (old values printed for rollback).
 *   2. Every existing segment_NNNN.mp3 spoken by that character, in every
 *      episode of the series, is MOVED (not deleted) to
 *      asc3/<storyId>/recast-backup-<timestamp>/ so the series voice step sees
 *      it as missing and records it again with the new voice.
 *   3. With --job: the (stopped) series job's voice progress is pointed back
 *      at the first moved line of each episode (complete=false), keeping its
 *      progress record so the step does NOT purge the episode's other clips.
 * Nothing else changes: other characters, SFX, Belle, scripts untouched.
 *
 * Rollback: move the files back from recast-backup-<timestamp>/ and restore
 * the printed voice_id/voice_name on the roster row.
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the env.
 */
import { createClient } from '@supabase/supabase-js'
import { parseScriptPositions } from '../lib/scriptLineIndex'
import { isBelleBVoiceId } from '../lib/voiceConstants'
import { isReservedHeroVoice } from '../lib/voiceEq'

export function speakerMatchesCharacter(speaker: string, canonicalName: string): boolean {
  const sp = String(speaker || '').trim().toUpperCase().replace(/\s+/g, ' ')
  const canon = String(canonicalName || '').trim().toUpperCase().replace(/\s+/g, ' ')
  if (!sp || !canon) return false
  if (sp === canon) return true
  const first = canon.split(' ')[0]
  return sp === first || canon.startsWith(sp + ' ')
}

async function main() {
  const [seriesId, characterName, newVoiceId] = process.argv.slice(2)
  const apply = process.argv.includes('--apply')
  const jobFlag = process.argv.indexOf('--job')
  const jobId = jobFlag > 0 ? process.argv[jobFlag + 1] : ''
  if (!seriesId || !characterName || !newVoiceId) throw new Error('usage: recast-series-character.ts <seriesId> "<CANONICAL NAME>" <newVoiceId> [--apply]')
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const { data: roster, error: rosterErr } = await db
    .from('series_character_roster')
    .select('id,canonical_name,voice_id,voice_name')
    .eq('series_id', seriesId)
    .eq('canonical_name_normalized', characterName.trim().toUpperCase())
    .maybeSingle()
  if (rosterErr || !roster) throw new Error(`roster row for ${characterName} not found: ${rosterErr?.message || ''}`)
  if (isBelleBVoiceId(newVoiceId) || isReservedHeroVoice(newVoiceId)) throw new Error(`voice ${newVoiceId} is reserved (Belle B or recurring hero) and cannot be used for a character`)
  const { data: voice } = await db.from('character_voices').select('voice_id,name').eq('voice_id', newVoiceId).maybeSingle()
  if (!voice) throw new Error(`voice ${newVoiceId} not in character_voices`)
  console.log(`Roster ${roster.canonical_name}: ${roster.voice_name} (${roster.voice_id}) -> ${voice.name} (${voice.voice_id})`)

  const { data: episodes, error: epErr } = await db
    .from('stories')
    .select('id,series_episode_number,status,script')
    .eq('series_id', seriesId)
    .order('series_episode_number')
  if (epErr) throw new Error(epErr.message)

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  let moved = 0
  const firstMovedByEpisode: Record<string, number> = {}
  for (const ep of episodes || []) {
    if (['published', 'audio_ready'].includes(String(ep.status))) {
      console.log(`EP${ep.series_episode_number}: status ${ep.status} - skipped (already finished; use recast-character.js)`)
      continue
    }
    const indices = parseScriptPositions(String(ep.script || ''))
      .filter((p) => p.kind === 'voice' && p.isExpected && speakerMatchesCharacter(String(p.speaker || ''), roster.canonical_name))
      .map((p) => p.index)
    const folder = `asc3/${ep.id}`
    const { data: files } = await db.storage.from('audio').list(folder, { limit: 2000 })
    const present = new Set((files || []).map((f) => f.name))
    const targets = indices.map((i) => `segment_${String(i).padStart(4, '0')}.mp3`).filter((name) => present.has(name))
    console.log(`EP${ep.series_episode_number}: ${indices.length} ${roster.canonical_name} lines, ${targets.length} recorded files to re-record`)
    if (targets.length) firstMovedByEpisode[String(ep.series_episode_number)] = Math.min(...targets.map((n) => Number(n.slice(8, 12))))
    if (!apply) continue
    for (const name of targets) {
      const { error } = await db.storage.from('audio').move(`${folder}/${name}`, `${folder}/recast-backup-${stamp}/${name}`)
      if (error) throw new Error(`move ${folder}/${name} failed: ${error.message}`)
      moved += 1
    }
  }

  let job: any = null
  if (jobId) {
    const { data, error } = await db.from('production_jobs').select('id,status,state_json').eq('id', jobId).single()
    if (error || !data) throw new Error(`job ${jobId} not found`)
    if (data.status === 'running') throw new Error(`job ${jobId} is running - stop it first`)
    job = data
  }
  if (!apply) {
    console.log(`Job progress reset (dry run): ${JSON.stringify(firstMovedByEpisode)}`)
    console.log('DRY RUN - nothing changed. Re-run with --apply.')
    return
  }
  const { error: updErr } = await db
    .from('series_character_roster')
    .update({ voice_id: voice.voice_id, voice_name: voice.name, updated_at: new Date().toISOString() })
    .eq('id', roster.id)
  if (updErr) throw new Error(`roster update failed (files already moved to recast-backup-${stamp}): ${updErr.message}`)
  if (job) {
    const state = job.state_json && typeof job.state_json === 'object' ? job.state_json : {}
    const gen = state.seriesVoiceGeneration && typeof state.seriesVoiceGeneration === 'object' ? state.seriesVoiceGeneration : {}
    const progress = { ...(gen.progressByEpisode || {}) }
    for (const [ep, first] of Object.entries(firstMovedByEpisode)) {
      const prior = progress[ep]
      if (!prior || typeof prior !== 'object') continue // not started yet: nothing recorded to protect
      progress[ep] = { ...prior, complete: false, nextSegmentNumber: first, lastUpdatedAt: prior.lastUpdatedAt || new Date().toISOString() }
    }
    const nextState = { ...state, seriesVoiceGeneration: { ...gen, progressByEpisode: progress } }
    const { error } = await db.from('production_jobs').update({ state_json: nextState }).eq('id', job.id)
    if (error) throw new Error(`job state update failed: ${error.message}`)
    console.log(`Job ${job.id} voice progress pointed at: ${JSON.stringify(firstMovedByEpisode)}`)
  }
  console.log(`APPLIED: roster updated; ${moved} files moved to recast-backup-${stamp}/`)
  console.log(`ROLLBACK: voice_id=${roster.voice_id} voice_name=${roster.voice_name}; move files back from recast-backup-${stamp}/`)
}

if (require.main === module) {
  main().catch((err) => { console.error(err instanceof Error ? err.message : String(err)); process.exit(1) })
}
