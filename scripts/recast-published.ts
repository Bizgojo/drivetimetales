/**
 * RECAST-PUBLISHED-001 — recast characters in already-mixed (even published)
 * episodes of a series, then re-mix them. Keeps a full backup.
 *
 *   npx tsx scripts/recast-published.ts <seriesId> --recast '<SPEAKER REGEX>=<voiceId>' [--recast ...] [--episodes 2,3] [--apply] [--render]
 *
 * <SPEAKER REGEX> is matched (case-insensitive) against script speaker labels
 * and roster/assignment names, so one voice can cover a character the writer
 * labelled two ways, e.g. '\bGLASS\b' covers COMMANDER GLASS, MARCUS GLASS and
 * COMMANDER MARCUS GLASS.
 *
 * Dry run by default (prints the plan). With --apply, per episode:
 *   1. copies final_mix / story_body / story_body_with_outro / outro_with_music
 *      to asc3/<story>/recast-backup-<ts>/ and MOVES the matched voice clips there;
 *   2. points character_voice_assignments (story) and series_character_roster
 *      rows that match at the new voice;
 *   3. re-records each moved clip via /api/admin/generate-voices
 *      (retryMissingOnly). Any clip that fails is restored from the backup and
 *      the episode is NOT re-mixed;
 *   4. with --render, re-mixes the episode via /api/asc3/render-final-mix
 *      (uses the server's SFX_LAYERED_MIX / SFX_OVERLAY settings). Story status
 *      and visibility are never touched.
 *
 * Rollback: copy everything in recast-backup-<ts>/ back to asc3/<story>/ and
 * restore the printed old voice ids.
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY; API_ORIGIN
 * (default http://localhost:3000).
 */
import { createClient } from '@supabase/supabase-js'
import { parseScriptPositions } from '../lib/scriptLineIndex'

const MIX_FILES = ['final_mix.mp3', 'story_body.mp3', 'story_body_with_outro.mp3', 'outro_with_music.mp3']

type Recast = { re: RegExp; source: string; voiceId: string; voiceName: string }

function arg(name: string): string[] {
  const out: string[] = []
  process.argv.forEach((v, i) => { if (v === name && process.argv[i + 1]) out.push(process.argv[i + 1]) })
  return out
}

async function main() {
  const seriesId = process.argv[2]
  const apply = process.argv.includes('--apply')
  const render = process.argv.includes('--render')
  const onlyEpisodes = (arg('--episodes')[0] || '').split(',').map(Number).filter(Boolean)
  const origin = process.env.API_ORIGIN || 'http://localhost:3000'
  if (!seriesId || !arg('--recast').length) throw new Error("usage: recast-published.ts <seriesId> --recast '<REGEX>=<voiceId>' [...] [--episodes 2,3] [--apply] [--render]")
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const recasts: Recast[] = []
  for (const spec of arg('--recast')) {
    const at = spec.lastIndexOf('=')
    const source = spec.slice(0, at)
    const voiceId = spec.slice(at + 1)
    const { data: voice } = await db.from('character_voices').select('name').eq('voice_id', voiceId).maybeSingle()
    if (!voice) throw new Error(`voice ${voiceId} not in character_voices`)
    recasts.push({ re: new RegExp(source, 'i'), source, voiceId, voiceName: voice.name })
  }
  const recastFor = (speaker: string) => recasts.find((r) => r.re.test(String(speaker || '')))

  const { data: roster } = await db.from('series_character_roster').select('id,canonical_name_normalized,voice_id,voice_name').eq('series_id', seriesId)
  for (const r of roster || []) {
    const rc = recastFor(r.canonical_name_normalized)
    if (rc) console.log(`Roster ${r.canonical_name_normalized}: ${r.voice_name} (${r.voice_id}) -> ${rc.voiceName} (${rc.voiceId})`)
  }

  const { data: episodes, error } = await db.from('stories').select('id,series_episode_number,status,script').eq('series_id', seriesId).order('series_episode_number')
  if (error) throw new Error(error.message)
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')

  for (const ep of episodes || []) {
    if (onlyEpisodes.length && !onlyEpisodes.includes(Number(ep.series_episode_number))) continue
    const lines = parseScriptPositions(String(ep.script || '')).filter((p) => p.kind === 'voice' && p.isExpected && recastFor(String(p.speaker || '')))
    const label = `EP${ep.series_episode_number}`
    if (!lines.length) { console.log(`${label}: no matching lines`); continue }
    const folder = `asc3/${ep.id}`
    const { data: files } = await db.storage.from('audio').list(folder, { limit: 2000 })
    const present = new Set((files || []).map((f) => f.name))
    const targets = lines.map((l) => ({ index: l.index, speaker: String(l.speaker), name: `segment_${String(l.index).padStart(4, '0')}.mp3` })).filter((t) => present.has(t.name))
    const { data: assigns } = await db.from('character_voice_assignments').select('id,character_name_normalized,voice_name').eq('story_id', ep.id)
    const matchedAssigns = (assigns || []).filter((a) => recastFor(a.character_name_normalized))
    console.log(`${label} (${ep.status}): ${lines.length} lines, ${targets.length} clips to re-record; assignments: ${matchedAssigns.map((a) => `${a.character_name_normalized} [${a.voice_name}]`).join(', ') || 'none'}`)
    if (!apply) continue

    const backup = `${folder}/recast-backup-${stamp}`
    for (const mix of MIX_FILES) {
      if (!present.has(mix)) continue
      const { error: cpErr } = await db.storage.from('audio').copy(`${folder}/${mix}`, `${backup}/${mix}`)
      if (cpErr) throw new Error(`${label} backup ${mix} failed: ${cpErr.message}`)
    }
    for (const t of targets) {
      const { error: mvErr } = await db.storage.from('audio').move(`${folder}/${t.name}`, `${backup}/${t.name}`)
      if (mvErr) throw new Error(`${label} move ${t.name} failed: ${mvErr.message}`)
    }
    for (const a of matchedAssigns) {
      const rc = recastFor(a.character_name_normalized)!
      const { error: aErr } = await db.from('character_voice_assignments').update({ voice_id: rc.voiceId, voice_name: rc.voiceName }).eq('id', a.id)
      if (aErr) throw new Error(`${label} assignment update failed: ${aErr.message}`)
    }
    for (const r of roster || []) {
      const rc = recastFor(r.canonical_name_normalized)
      if (rc && r.voice_id !== rc.voiceId) {
        await db.from('series_character_roster').update({ voice_id: rc.voiceId, voice_name: rc.voiceName, updated_at: new Date().toISOString() }).eq('id', r.id)
        r.voice_id = rc.voiceId
      }
    }

    let failed = 0
    for (const t of targets) {
      let ok = false
      for (let attempt = 1; attempt <= 2 && !ok; attempt += 1) {
        const res = await fetch(`${origin}/api/admin/generate-voices`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storyId: ep.id, retryMissingOnly: true, segmentNumber: t.index }),
        }).catch(() => null)
        const { data: after } = await db.storage.from('audio').list(folder, { limit: 2000, search: t.name })
        ok = Boolean(res && res.ok && (after || []).some((f) => f.name === t.name))
      }
      if (!ok) {
        failed += 1
        await db.storage.from('audio').copy(`${backup}/${t.name}`, `${folder}/${t.name}`)
        console.log(`  ${t.name} (${t.speaker}) FAILED - old clip restored`)
      } else {
        console.log(`  ${t.name} (${t.speaker}) re-recorded`)
      }
    }
    if (failed) { console.log(`${label}: ${failed} clip(s) failed; NOT re-mixed (old voice restored for those lines)`); continue }
    if (!render) { console.log(`${label}: clips re-recorded; re-mix skipped (no --render)`); continue }
    const mix = await fetch(`${origin}/api/asc3/render-final-mix`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ storyId: ep.id }),
    }).catch((e) => ({ ok: false, json: async () => ({ error: String(e) }) } as any))
    const body: any = await mix.json().catch(() => ({}))
    console.log(`${label}: re-mix ${mix.ok && body?.success !== false ? 'OK' : 'FAILED: ' + String(body?.error || '').slice(0, 200)}`)
  }
  if (!apply) console.log('DRY RUN - nothing changed. Re-run with --apply [--render].')
  else console.log(`Backups: asc3/<storyId>/recast-backup-${stamp}/`)
}

main().catch((err) => { console.error(err instanceof Error ? err.message : String(err)); process.exit(1) })
