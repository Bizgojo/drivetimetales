#!/usr/bin/env node
/**
 * recast-character.js — Targeted character voice recast (VOICE-ONLY-REPAIR-001)
 *
 * Recasts a single character's voice in a story without re-rendering the full pipeline.
 * Identifies the character's segments, repairs DB records, re-renders only those segments,
 * then rebuilds the final mix. Leaves all other character voices untouched.
 *
 * Usage:
 *   node scripts/recast-character.js <storyId> <characterName> <newVoiceId> [--dry-run]
 *
 * Options:
 *   --dry-run    Print plan only — no storage deletes, no API calls, no DB writes
 *   --voice-only Use voice-only-render.js path (no music stings) instead of full render-story-mix
 *
 * Examples:
 *   node scripts/recast-character.js 60fce080-ae81-4b13-91f2-41899a8dc025 "Gray" "0fbdXLXuDBZXm2IHek4L" --dry-run
 *   node scripts/recast-character.js 60fce080-ae81-4b13-91f2-41899a8dc025 "Gray" "0fbdXLXuDBZXm2IHek4L"
 *
 * Audit log written to: /tmp/recast-<storyId>-<ts>.json
 */

'use strict'
require('dotenv').config({ path: require('path').join(__dirname, '../.env.local') })

const { createClient } = require('@supabase/supabase-js')
const { spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const os = require('os')

// ── VOICE-FALLBACK-001 gate ────────────────────────────────────────────────────
// Loaded lazily after TypeScript compile; if the compiled JS is not present we
// use the TypeScript source via ts-node/register so the gate always runs.
let _voiceGate = null
function loadVoiceGate() {
  if (_voiceGate) return _voiceGate
  try {
    // Attempt compiled output first (next build produces .js in same location)
    _voiceGate = require('../lib/voiceFallbackGate')
  } catch (_) {
    // Fallback: run via ts-node so gate is never silently skipped
    try {
      require('ts-node').register({ transpileOnly: true })
      _voiceGate = require('../lib/voiceFallbackGate')
    } catch (e2) {
      console.error('⚠ VOICE-FALLBACK-001: could not load voiceFallbackGate — assignment BLOCKED as precaution:', e2.message)
      process.exit(1)
    }
  }
  return _voiceGate
}

// ── Config ─────────────────────────────────────────────────────────────────────
const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://vmyhlfeouzslixtkmddy.supabase.co'
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY
const BASE_STORAGE  = SUPABASE_URL + '/storage/v1/object/public/audio'
const API_ORIGIN    = process.env.RECAST_API_ORIGIN || 'http://localhost:3000'
const FF            = process.env.FFMPEG_BIN || '/opt/homebrew/bin/ffmpeg'

if (!SERVICE_KEY) { console.error('SUPABASE_SERVICE_ROLE_KEY not set'); process.exit(1) }
const sb = createClient(SUPABASE_URL, SERVICE_KEY)

// ── CLI args ───────────────────────────────────────────────────────────────────
const args     = process.argv.slice(2)
const storyId  = args[0]
const charName = args[1]
const newVoiceId = args[2]
const dryRun   = args.includes('--dry-run')
const voiceOnly = args.includes('--voice-only')

if (!storyId || !charName || !newVoiceId) {
  console.error('Usage: node scripts/recast-character.js <storyId> <characterName> <newVoiceId> [--dry-run]')
  process.exit(1)
}

// ── Helpers ─────────────────────────────────────────────────────────────────────
function normalizeCharName(n) {
  return n.toUpperCase().replace(/[^A-Z0-9\s.'-]/g, '').replace(/\s+/g, ' ').trim()
}

/** Minimal script line parser — mirrors generate-voices route parseStoryLines() logic */
function parseScriptLines(script) {
  const lines = []
  const rawLines = script.split('\n')
  const HEADER_KEYS = ['TITLE:', 'SERIES:', 'EPISODE:', 'AUTHOR:', 'GENRE:', 'DESCRIPTION:',
    'SUNO PROMPT:', 'NARRATIVE_VOICE:', 'CHARACTER GUIDE', '---', '[START AUDIO DRAMA SCRIPT]']
  const ANNOUNCER_RE = /^(ANNOUNCER|BELLE B|SANDY):/i
  const announcer_indices = rawLines.reduce((a, l, i) => {
    if (/^ANNOUNCER:\s*Belle B\s*$/i.test(l.trim())) return a
    if (ANNOUNCER_RE.test(l.trim())) a.push(i)
    return a
  }, [])
  const firstAnn = announcer_indices[0] ?? -1
  const lastAnn  = announcer_indices[announcer_indices.length - 1] ?? -1
  const explicitStart = rawLines.findIndex(l => l.includes('[START AUDIO DRAMA SCRIPT]'))
  const guideStart    = rawLines.findIndex(l => l.includes('CHARACTER GUIDE'))
  const scriptStart   = explicitStart > -1 ? explicitStart : guideStart
  const headerEnd     = scriptStart > -1 ? scriptStart : (firstAnn + 1)

  let lineIndex = 0
  rawLines.forEach((line, rawIdx) => {
    const trimmed = line.trim()
    if (!trimmed) return
    if (explicitStart > -1 && rawIdx < explicitStart && rawIdx !== firstAnn && rawIdx !== lastAnn) return
    if (HEADER_KEYS.some(k => trimmed.startsWith(k))) return
    if (rawIdx < headerEnd && rawIdx !== firstAnn && rawIdx !== lastAnn) {
      if (trimmed.startsWith('NARRATOR:') || trimmed.startsWith('ANNOUNCER:')) return
    }
    if (trimmed === '[BEAT]') { lines.push({ index: lineIndex++, speaker: 'BEAT', type: 'beat' }); return }
    if (/^\[PAUSE:\d+\]$/.test(trimmed)) { lines.push({ index: lineIndex++, speaker: 'PAUSE', type: 'pause' }); return }
    if (trimmed.startsWith('[SFX:')) { lines.push({ index: lineIndex++, speaker: 'SFX', type: 'sfx' }); return }
    if (trimmed.startsWith('[')) return
    if (trimmed.startsWith('ANNOUNCER:') && trimmed.toLowerCase().includes('endless tales presents')) return
    const dm = trimmed.match(/^([A-ZÀ-Ú][A-ZÀ-Ú\s'.()]+?):\s*(.+)$/)
    if (dm) {
      const speaker = dm[1].trim()
      const isAnn = ANNOUNCER_RE.test(speaker + ':')
      const type = isAnn ? 'announcer' : speaker === 'NARRATOR' ? 'narrator' : 'character'
      lines.push({ index: lineIndex++, speaker, type, text: dm[2].trim(), rawIdx })
    }
  })
  return lines
}

/** Segment file name for a given line index and type */
function segFile(line) {
  const idx = line.index.toString().padStart(4, '0')
  return line.type === 'sfx' ? `sfx_${idx}.mp3` : `segment_${idx}.mp3`
}

/** ffmpeg helpers for the mix rebuild */
function ff(args, label) {
  if (label) process.stdout.write(`  ${label}... `)
  const r = spawnSync(FF, args, { stdio: ['ignore', 'ignore', 'pipe'] })
  if (r.status !== 0) throw new Error(`ffmpeg [${label||'?'}]:\n${(r.stderr||Buffer.alloc(0)).toString().slice(-400)}`)
  if (label) console.log('done')
}
function norm(i, o, lbl) { ff(['-i',i,'-af','loudnorm=I=-16:TP=-1.5:LRA=11','-ar','44100','-ac','2','-b:a','192k','-y',o], lbl) }
function sil(o, secs) { ff(['-f','lavfi','-i',`anullsrc=channel_layout=stereo:sample_rate=44100`,'-t',String(secs),'-ar','44100','-ac','2','-b:a','192k','-y',o]) }
function concat(files, o, lbl) {
  const lst = o + '.lst'
  fs.writeFileSync(lst, files.map(f => `file '${f}'`).join('\n'))
  ff(['-f','concat','-safe','0','-i',lst,'-map','0:a','-ar','44100','-ac','2','-b:a','192k','-y',o], lbl)
  fs.unlinkSync(lst)
}
async function dl(url, dest) {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`Download failed (${r.status}): ${url}`)
  fs.writeFileSync(dest, Buffer.from(await r.arrayBuffer()))
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const audit = {
    tool: 'recast-character',
    version: 'VOICE-ONLY-REPAIR-001',
    storyId, characterName: charName, newVoiceId, dryRun, voiceOnly,
    startedAt: new Date().toISOString(),
    phases: {},
  }
  console.log(`\n🎙  recast-character${dryRun ? ' [DRY RUN]' : ''}`)
  console.log(`   story:     ${storyId}`)
  console.log(`   character: ${charName}`)
  console.log(`   new voice: ${newVoiceId}\n`)

  // ── Phase 1: Preflight ───────────────────────────────────────────────────────
  console.log('▶ Phase 1 — Preflight')
  const { data: story, error: storyErr } = await sb.from('stories')
    .select('id,title,series_id,script,intro_audio_url,story_audio_url,outro_audio_url,audio_url')
    .eq('id', storyId).single()
  if (storyErr || !story) { console.error('Story not found:', storyErr?.message); process.exit(1) }
  console.log(`   title: "${story.title}"`)
  if (!story.script) { console.error('Story has no script'); process.exit(1) }

  const allLines = parseScriptLines(story.script)
  const normChar = normalizeCharName(charName)
  const charLines = allLines.filter(l => l.type === 'character' && normalizeCharName(l.speaker) === normChar)
  if (charLines.length === 0) {
    console.error(`  ❌ No "${charName}" dialogue lines found. Speaker names in script: ${[...new Set(allLines.filter(l=>l.type==='character').map(l=>l.speaker))].join(', ')}`)
    process.exit(1)
  }
  const segNames = charLines.map(segFile)

  // Look up current voice assignment
  const { data: curAssign } = await sb.from('character_voice_assignments')
    .select('voice_id,voice_name').eq('story_id', storyId)
    .eq('character_name_normalized', normChar).maybeSingle()

  // ── VOICE-FALLBACK-001: Run three-gate validation before any write ──────────
  // Fetch character gender + accent from series_character_roster (if series story)
  let characterGender = null
  let characterAccent = null
  if (story.series_id) {
    const { data: rosterRow } = await sb.from('series_character_roster')
      .select('gender,accent')
      .eq('series_id', story.series_id)
      .eq('canonical_name_normalized', normChar)
      .maybeSingle()
    if (rosterRow) {
      characterGender = rosterRow.gender || null
      characterAccent = rosterRow.accent || null
    }
  }

  console.log(`   voice validation: running three-gate check (VOICE-FALLBACK-001)`)
  const { validateVoiceAssignment } = loadVoiceGate()

  // Build a minimal supabase-compatible client for the gate
  const gateClient = {
    from(table) {
      return {
        select(cols) {
          return {
            eq(col, val) {
              return sb.from(table).select(cols).eq(col, val)
            },
          }
        },
      }
    },
  }

  const gateResult = await validateVoiceAssignment({
    characterGender,
    characterAccent,
    elevenlabsVoiceId: newVoiceId,
    supabaseClient: gateClient,
  })

  if (!gateResult.valid) {
    console.error(`\n❌ VOICE-FALLBACK-001 gate blocked recast:`)
    console.error(`   ${gateResult.error}`)
    if (!dryRun) {
      audit.gateBlocked = { gate: gateResult.gate, error: gateResult.error }
      writeAuditLog(audit)
      process.exit(1)
    } else {
      console.log('   [DRY RUN] Would have been blocked by gate above.')
    }
  } else {
    console.log(`   ✓ All three gates passed — voice assignment permitted`)
  }

  // Look up new voice name
  const { data: newVoiceRow } = await sb.from('character_voices')
    .select('name').eq('voice_id', newVoiceId).maybeSingle()
  // Also fall back to narrator_voices.name if character_voices has no entry
  const newVoiceName = newVoiceRow?.name || gateResult.voice?.name || newVoiceId

  console.log(`   segments to re-render: ${charLines.length} (indices: ${charLines.map(l=>l.index).join(', ')})`)
  console.log(`   current voice: ${curAssign?.voice_name || curAssign?.voice_id || '(none)'}`)
  console.log(`   new voice:     ${newVoiceName}`)
  console.log(`   series_id:     ${story.series_id || '(standalone)'}`)
  if (dryRun) console.log('\n   [DRY RUN] Plan above — no changes made.\n')

  audit.phases.preflight = {
    title: story.title, seriesId: story.series_id,
    lineCount: charLines.length, segmentNames: segNames,
    currentVoiceId: curAssign?.voice_id, currentVoiceName: curAssign?.voice_name,
    newVoiceName,
  }

  if (dryRun) {
    audit.dryRunEndedAt = new Date().toISOString()
    writeAuditLog(audit)
    return
  }

  // ── Phase 2: Data repair ─────────────────────────────────────────────────────
  console.log('\n▶ Phase 2 — Data repair')
  // Delete old story-level assignment
  // Reason: replace stale voice_id so next generate-voices uses the correct voice
  const { error: delErr } = await sb.from('character_voice_assignments')
    .delete().eq('story_id', storyId).eq('character_name_normalized', normChar)
  if (delErr) { console.error('Delete assignment failed:', delErr.message); process.exit(1) }

  // Insert new assignment
  const { error: insErr } = await sb.from('character_voice_assignments')
    .insert({ story_id: storyId, series_id: story.series_id || null,
      character_name: charName, character_name_normalized: normChar,
      voice_id: newVoiceId, voice_name: newVoiceName,
      assigned_at: new Date().toISOString() })
  if (insErr) { console.error('Insert assignment failed:', insErr.message); process.exit(1) }
  console.log(`  ✓ character_voice_assignments updated: ${normChar} → ${newVoiceName}`)

  // Update series roster if series story
  if (story.series_id) {
    const { error: rErr } = await sb.from('series_character_roster')
      .update({ voice_id: newVoiceId, voice_name: newVoiceName, updated_at: new Date().toISOString() })
      .eq('series_id', story.series_id).eq('canonical_name_normalized', normChar)
    if (rErr) console.warn(`  ⚠ Series roster update failed (may not exist): ${rErr.message}`)
    else console.log(`  ✓ series_character_roster updated for ${normChar}`)
  }
  audit.phases.dataRepair = { deletedAssignment: true, insertedAssignment: true, rosterUpdated: !!story.series_id }

  // ── Phase 3: Segment re-render ───────────────────────────────────────────────
  console.log(`\n▶ Phase 3 — Segment re-render (${charLines.length} segments)`)
  const storyFolder = (story.story_audio_url || story.audio_url || '').match(/asc3\/([^/?]+)\//)?.[1] || storyId
  const segResults = []

  for (let i = 0; i < charLines.length; i++) {
    const line = charLines[i]
    const fname = segFile(line)
    const storagePath = `asc3/${storyFolder}/${fname}`
    process.stdout.write(`  [${i+1}/${charLines.length}] ${fname}... `)

    // Delete stale segment to force regeneration
    const { error: rmErr } = await sb.storage.from('audio').remove([storagePath])
    if (rmErr) console.warn(`(delete warn: ${rmErr.message}) `)

    // Call generate-voices API for this segment (retryMissingOnly mode)
    let success = false, attempt = 0
    while (!success && attempt < 2) {
      attempt++
      try {
        const resp = await fetch(`${API_ORIGIN}/api/admin/generate-voices`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storyId, retryMissingOnly: true, segmentNumber: line.index }),
        })
        const body = await resp.json().catch(() => ({}))
        if (resp.ok && body.success !== false) { success = true; console.log('✓') }
        else { console.log(`✗ (${resp.status}: ${body.error || JSON.stringify(body).slice(0,80)})`) }
      } catch (e) { console.log(`✗ (network: ${e.message})`) }
    }
    segResults.push({ segName: fname, lineIndex: line.index, success })
  }

  const successCount = segResults.filter(r => r.success).length
  console.log(`  ${successCount}/${charLines.length} segments re-rendered successfully`)
  audit.phases.segmentRerender = { attempted: charLines.length, succeeded: successCount, results: segResults }

  if (successCount < charLines.length) {
    console.warn(`  ⚠ ${charLines.length - successCount} segment(s) failed — mix rebuild will proceed with available segments`)
  }

  // ── Phase 4: Rebuild mix ─────────────────────────────────────────────────────
  console.log('\n▶ Phase 4 — Rebuild mix')
  const { data: files } = await sb.storage.from('audio').list(`asc3/${storyFolder}`, { limit: 400, sortBy: { column: 'name', order: 'asc' } })
  const segs = (files || []).filter(f => f.name.startsWith('segment_') && f.name.endsWith('.mp3'))
    .sort((a, b) => a.name.localeCompare(b.name))
  console.log(`  segments in storage: ${segs.length}`)

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'recast-'))
  try {
    // Download all segments + intro/outro
    console.log('  Downloading audio...')
    const introP = path.join(tmp, 'intro.mp3')
    const outroP = path.join(tmp, 'outro.mp3')
    await dl(story.intro_audio_url, introP)
    await dl(story.outro_audio_url, outroP)
    const segPaths = []
    for (let i = 0; i < segs.length; i++) {
      const p = path.join(tmp, `seg${String(i).padStart(3,'0')}.mp3`)
      await dl(`${BASE_STORAGE}/asc3/${storyFolder}/${segs[i].name}`, p)
      segPaths.push(p)
    }
    console.log(`  Downloaded ${segs.length} segments`)

    // Build mix: normalize + concat
    const introN = path.join(tmp, 'intro_n.mp3')
    const outroN = path.join(tmp, 'outro_n.mp3')
    const storyRaw = path.join(tmp, 'story_raw.mp3')
    const storyN = path.join(tmp, 'story_n.mp3')
    const sil1 = path.join(tmp, 'sil1.mp3')
    const sil2 = path.join(tmp, 'sil2.mp3')
    const finalMix = path.join(tmp, 'final_mix.mp3')

    norm(introP, introN, 'normalize intro')
    concat(segPaths, storyRaw, 'concat segments')
    norm(storyRaw, storyN, 'normalize story')
    norm(outroP, outroN, 'normalize outro')
    sil(sil1, 0.5); sil(sil2, 0.5)
    concat([introN, sil1, storyN, sil2, outroN], finalMix, 'build final mix')

    // Upload
    const mixPath = `asc3/${storyFolder}/final_mix_${Date.now()}.mp3`
    const { error: upErr } = await sb.storage.from('audio').upload(mixPath, fs.readFileSync(finalMix), { contentType: 'audio/mpeg', upsert: false })
    if (upErr) throw new Error(`Upload failed: ${upErr.message}`)
    const { data: { publicUrl } } = sb.storage.from('audio').getPublicUrl(mixPath)
    await sb.from('stories').update({ audio_url: publicUrl, story_audio_url: publicUrl }).eq('id', storyId)
    console.log(`  ✓ Mix uploaded: ${publicUrl}`)
    audit.phases.mixRebuild = { segmentsUsed: segs.length, mixUrl: publicUrl }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }

  // ── Phase 5: Summary ─────────────────────────────────────────────────────────
  console.log('\n▶ Summary')
  console.log(`  Character:    ${charName}`)
  console.log(`  Voice:        ${curAssign?.voice_name || '(unknown)'} → ${newVoiceName}`)
  console.log(`  Segments:     ${successCount}/${charLines.length} re-rendered`)
  console.log(`  Mix rebuilt:  ✓`)
  audit.completedAt = new Date().toISOString()
  audit.summary = { charName, oldVoice: curAssign?.voice_name, newVoice: newVoiceName, segmentsRerendered: successCount }

  writeAuditLog(audit)
}

function writeAuditLog(audit) {
  const ts = Date.now()
  const logPath = path.join(os.tmpdir(), `recast-${audit.storyId.slice(0,8)}-${ts}.json`)
  fs.writeFileSync(logPath, JSON.stringify(audit, null, 2))
  console.log(`\n📋 Audit log: ${logPath}`)
}

main().catch(e => { console.error('\n❌ Fatal:', e.message); process.exit(1) })
