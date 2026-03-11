#!/usr/bin/env node
/**
 * ET Story Mix Renderer
 *
 * Builds two tracks then mixes them:
 *
 * VOICE TRACK — concat with silence gaps:
 *   [3s sil] [Belle B intro] [4s sil] [story segments] [4s sil] [Belle B outro] [3s sil]
 *
 * MUSIC TRACK — three pre-positioned clips, mixed with amix (NO adelay):
 *   music_a.mp3  [io_intro]                        starts at t=0
 *   music_b.mp3  [BG_DELAY silence] + [bg_full]    starts at t=BG_DELAY
 *   music_c.mp3  [OUTRO_DELAY silence] + [io_outro] starts at t=OUTRO_DELAY
 *   → silence is pre-baked into each clip so no adelay is needed in the mix step
 *
 * FINAL = amix(voice, music) with alimiter
 */

const { spawnSync } = require('child_process')
const fs   = require('fs')
const path = require('path')
const os   = require('os')

const FF           = '/opt/homebrew/bin/ffmpeg'
const SUPABASE_URL = 'https://vmyhlfeouzslixtkmddy.supabase.co'
const ANON_KEY     = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZteWhsZmVvdXpzbGl4dGttZGR5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwODk2MTIsImV4cCI6MjA4MTY2NTYxMn0.7asAd8ctLKJLdv2AojbF8WEo-N6dVheVA3mWxjkFwkk'
const BASE         = `${SUPABASE_URL}/storage/v1/object/public/audio`

const IO_VOL    = 0.18   // intro/outro theme music — subtle, under the voice
const MUSIC_VOL = parseFloat(process.argv[3] || '0.15')  // bg story music — -12dB from 0.60
const STORY_ID  = process.argv[2] || process.env.STORY_ID

if (!STORY_ID) { console.error('Usage: node render-story-mix.js <storyId> [bgMusicVol]'); process.exit(1) }

// ── Helpers ──────────────────────────────────────────────────────────────────

async function dl(url, dest) {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`Download failed (${r.status}): ${url}`)
  fs.writeFileSync(dest, Buffer.from(await r.arrayBuffer()))
}

function getDur(f) {
  const r   = spawnSync(FF, ['-i', f, '-f', 'null', '-'])
  const out = (r.stderr || Buffer.alloc(0)).toString()
  const m   = out.match(/Duration:\s*(\d+):(\d+):([\d.]+)/)
  return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : 0
}

function ff(args, label) {
  if (label) process.stdout.write(`   ${label}... `)
  const r = spawnSync(FF, args, { stdio: ['ignore', 'ignore', 'pipe'] })
  if (r.status !== 0) {
    const err = (r.stderr || Buffer.alloc(0)).toString()
    throw new Error(`ffmpeg failed [${label || '?'}]:\n${err.slice(-600)}`)
  }
  if (label) console.log('done')
}

function concatFiles(files, out, label) {
  const lst = out + '.lst'
  fs.writeFileSync(lst, files.map(f => `file '${f}'`).join('\n'))
  ff(['-f', 'concat', '-safe', '0', '-i', lst,
    '-map', '0:a',
    '-ar', '44100', '-ac', '2', '-b:a', '192k', '-y', out], label || 'concat')
  fs.unlinkSync(lst)
}

/** Create a silent MP3 of exactly `dur` seconds */
function mkSilence(out, dur) {
  ff(['-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
    '-t', String(dur), '-ar', '44100', '-ac', '2', '-b:a', '192k', '-y', out])
  return out
}

/**
 * Pre-process a music clip from a looped source.
 * Uses -t to reliably trim looped streams (atrim has issues with looped inputs).
 * All output is audio-only (-map 0:a) to prevent embedded image streams causing issues.
 */
function mkMusicClip(src, out, { dur, vol, fadeIn = 0, fadeOutSt = null, fadeOutDur = 0 }) {
  const af = [`volume=${vol}`]
  if (fadeIn > 0)                           af.push(`afade=t=in:st=0:d=${fadeIn}`)
  if (fadeOutSt !== null && fadeOutDur > 0) af.push(`afade=t=out:st=${fadeOutSt}:d=${fadeOutDur}`)
  ff(['-stream_loop', '-1', '-i', src,
    '-t', String(dur),
    '-af', af.join(','),
    '-map', '0:a',
    '-ar', '44100', '-ac', '2', '-b:a', '192k', '-y', out])
}

/**
 * Build a full-timeline music clip: [silenceDur seconds of silence] + [music clip].
 * This pre-positions the clip without using adelay (which has max-value bugs in ffmpeg).
 */
function mkPositionedClip(src, out, tmp, { silenceDur, clipDur, vol, fadeIn, fadeOutSt, fadeOutDur }) {
  const clipFile = out + '_clip.mp3'
  mkMusicClip(src, clipFile, { dur: clipDur, vol, fadeIn, fadeOutSt, fadeOutDur })
  if (silenceDur <= 0.01) {
    fs.renameSync(clipFile, out)
    return
  }
  const silFile = out + '_sil.mp3'
  mkSilence(silFile, silenceDur)
  concatFiles([silFile, clipFile], out)
  fs.unlinkSync(silFile)
  fs.unlinkSync(clipFile)
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const { createClient } = require('@supabase/supabase-js')
  const sb = createClient(SUPABASE_URL, ANON_KEY)

  const { data: story, error } = await sb.from('stories')
    .select('id, title, intro_audio_url, story_audio_url, outro_audio_url')
    .eq('id', STORY_ID).single()
  if (error || !story) throw new Error('Story not found: ' + (error?.message || STORY_ID))

  const m = (story.story_audio_url || '').match(/asc3\/([^/]+)\//)
  if (!m) throw new Error('Cannot extract folder from story_audio_url')
  const FOLDER = m[1]
  console.log(`\n📖  "${story.title}"\n    folder: ${FOLDER}`)

  const { data: files } = await sb.storage.from('audio').list(`asc3/${FOLDER}`, { limit: 300, sortBy: { column: 'name', order: 'asc' } })
  const segs   = (files || []).filter(f => f.name.startsWith('segment_') && f.name.endsWith('.mp3')).sort((a, b) => a.name.localeCompare(b.name))
  const bgFile = (files || []).find(f => f.name === 'background_music.mp3')
  if (!segs.length) throw new Error('No segments found')
  console.log(`    ${segs.length} segments  |  BG: ${bgFile ? 'yes' : 'no (falling back to io)'}`)

  const tmp    = fs.mkdtempSync(path.join(os.tmpdir(), 'et-render-'))
  const introP = path.join(tmp, 'intro.mp3')
  const outroP = path.join(tmp, 'outro.mp3')
  const ioP    = path.join(tmp, 'io.mp3')
  const bgP    = path.join(tmp, 'bg.mp3')
  const rawP   = path.join(tmp, 'story_raw.mp3')

  console.log('\n⬇️   Downloading...')
  await dl(story.intro_audio_url, introP)
  await dl(story.outro_audio_url, outroP)
  await dl(`${BASE}/intro_outro_music.mp3`, ioP)
  if (bgFile) await dl(`${BASE}/asc3/${FOLDER}/background_music.mp3`, bgP)
  else { fs.copyFileSync(ioP, bgP); console.log('    (no BG — using io music)') }

  const segPaths = []
  for (let i = 0; i < segs.length; i++) {
    const p = path.join(tmp, `s${String(i).padStart(3, '0')}.mp3`)
    await dl(`${BASE}/asc3/${FOLDER}/${segs[i].name}`, p)
    segPaths.push(p)
    if ((i + 1) % 25 === 0) console.log(`    ${i + 1}/${segs.length}`)
  }
  console.log(`    ${segs.length}/${segs.length} ✅`)

  // ── Concat story segments ──────────────────────────────────────────────────
  console.log('\n🎵  Building tracks...')
  concatFiles(segPaths, rawP, 'concat segments')

  const introDur = getDur(introP)
  const outroDur = getDur(outroP)
  const storyDur = getDur(rawP)
  console.log(`    intro:${introDur.toFixed(2)}s  story:${(storyDur/60).toFixed(2)}min  outro:${outroDur.toFixed(2)}s`)

  // ── Timing ─────────────────────────────────────────────────────────────────
  const PRE     = 3   // io music before Belle B
  const GAP     = 4   // gap between voice sections (1s alone + 2s xfade + 1s alone)
  const POST    = 3   // io music tail after Belle B outro
  const XF      = 2   // crossfade duration

  // io_intro: t=0 → PRE+intro+1+XF, fades in 1s, fades out at PRE+intro+1 over XF seconds
  const IO_INTRO_DUR   = PRE + introDur + 1 + XF
  const IO_INTRO_FO    = PRE + introDur + 1

  // bg_full: delayed BG_DELAY, plays XF+1+story+1+XF, fades in XF, fades out XF before end
  const BG_DELAY       = PRE + introDur + 1      // = IO_INTRO_FO (crossfade starts here)
  const BG_DUR         = XF + 1 + storyDur + 1 + XF
  const BG_FO          = XF + 1 + storyDur + 1  // fade-out starts here (within clip)

  // io_outro: delayed OUTRO_DELAY, plays XF+1+outro+POST, fades in XF, fades out POST before end
  const OUTRO_DELAY    = PRE + introDur + GAP + storyDur + 1
  const IO_OUTRO_DUR   = XF + 1 + outroDur + POST
  const IO_OUTRO_FO    = XF + 1 + outroDur      // fade-out starts here (within clip)

  const TOTAL          = PRE + introDur + GAP + storyDur + GAP + outroDur + POST

  console.log(`\n⏱   Timeline: t=0 io starts | t=${PRE} Belle B | t=${(PRE+introDur).toFixed(1)} done`)
  console.log(`    t=${IO_INTRO_FO.toFixed(1)} crossfade1 | t=${(PRE+introDur+GAP).toFixed(1)} narrator`)
  console.log(`    t=${(PRE+introDur+GAP+storyDur).toFixed(1)} narrator done | t=${OUTRO_DELAY.toFixed(1)} crossfade2`)
  console.log(`    t=${(PRE+introDur+GAP+storyDur+GAP).toFixed(1)} Belle B outro | t=${TOTAL.toFixed(1)} END`)

  // ── VOICE TRACK ────────────────────────────────────────────────────────────
  // [3s sil][intro][4s sil][story][4s sil][outro][3s sil]
  const sils = [
    mkSilence(path.join(tmp, 'sil_pre.mp3'),  PRE),
    mkSilence(path.join(tmp, 'sil_gap1.mp3'), GAP),
    mkSilence(path.join(tmp, 'sil_gap2.mp3'), GAP),
    mkSilence(path.join(tmp, 'sil_post.mp3'), POST),
  ]
  const voiceP = path.join(tmp, 'voice_track.mp3')
  concatFiles([sils[0], introP, sils[1], rawP, sils[2], outroP, sils[3]], voiceP, 'voice track')

  // ── MUSIC CLIPS ────────────────────────────────────────────────────────────
  // Each clip has its silence pre-baked → no adelay needed in amix step
  const musicA = path.join(tmp, 'music_a.mp3')
  const musicB = path.join(tmp, 'music_b.mp3')
  const musicC = path.join(tmp, 'music_c.mp3')

  process.stdout.write('   music_a (io intro, t=0)... ')
  mkPositionedClip(ioP, musicA, tmp, {
    silenceDur: 0,
    clipDur:    IO_INTRO_DUR,
    vol:        IO_VOL,
    fadeIn:     1,
    fadeOutSt:  IO_INTRO_FO,
    fadeOutDur: XF,
  })
  console.log(`done (${getDur(musicA).toFixed(1)}s)`)

  process.stdout.write(`   music_b (bg, starts t=${BG_DELAY.toFixed(1)})... `)
  mkPositionedClip(bgP, musicB, tmp, {
    silenceDur: BG_DELAY,
    clipDur:    BG_DUR,
    vol:        MUSIC_VOL,
    fadeIn:     XF,
    fadeOutSt:  BG_FO,
    fadeOutDur: XF,
  })
  console.log(`done (${(getDur(musicB)/60).toFixed(2)} min)`)

  process.stdout.write(`   music_c (io outro, starts t=${OUTRO_DELAY.toFixed(1)})... `)
  mkPositionedClip(ioP, musicC, tmp, {
    silenceDur: OUTRO_DELAY,
    clipDur:    IO_OUTRO_DUR,
    vol:        IO_VOL,
    fadeIn:     XF,
    fadeOutSt:  IO_OUTRO_FO,
    fadeOutDur: POST,
  })
  console.log(`done (${(getDur(musicC)/60).toFixed(2)} min)`)

  // ── MUSIC TRACK — amix 3 full-timeline clips (no adelay) ──────────────────
  const musicP = path.join(tmp, 'music_track.mp3')
  process.stdout.write('   music track (amix 3 clips)... ')
  ff([
    '-i', musicA, '-i', musicB, '-i', musicC,
    '-filter_complex',
    '[0:a][1:a][2:a]amix=inputs=3:duration=longest:dropout_transition=0:normalize=0[out]',
    '-map', '[out]', '-ar', '44100', '-ac', '2', '-b:a', '192k', '-y', musicP,
  ])
  console.log(`done (${(getDur(musicP)/60).toFixed(2)} min)`)

  // ── FINAL MIX — voice + music ──────────────────────────────────────────────
  const output = path.join(tmp, 'final_mix.mp3')
  process.stdout.write('\n🎬  Final mix... ')
  ff([
    '-i', voiceP, '-i', musicP,
    '-filter_complex',
    '[0:a][1:a]amix=inputs=2:duration=longest:dropout_transition=0:normalize=0,' +
    'alimiter=level_in=1:level_out=0.99:limit=0.99:attack=5:release=50[out]',
    '-map', '[out]', '-ar', '44100', '-ac', '2', '-b:a', '192k', '-y', output,
  ])
  const sz  = (fs.statSync(output).size / 1024 / 1024).toFixed(1)
  const dur = getDur(output)
  console.log(`done\n\n✅  ${sz} MB  |  ${(dur / 60).toFixed(2)} min  (expected ${(TOTAL / 60).toFixed(2)} min)`)

  // ── UPLOAD ─────────────────────────────────────────────────────────────────
  console.log('\n☁️   Uploading...')
  const buf         = fs.readFileSync(output)
  // Use a versioned filename to bust Supabase CDN cache
  const version     = Date.now()
  const storagePath = `asc3/${FOLDER}/final_mix_${version}.mp3`
  const { error: upErr } = await sb.storage.from('audio').upload(storagePath, buf, { contentType: 'audio/mpeg', upsert: false })
  if (upErr) throw new Error('Upload: ' + upErr.message)
  const { data: { publicUrl } } = sb.storage.from('audio').getPublicUrl(storagePath)
  const { error: dbErr } = await sb.from('stories').update({ audio_url: publicUrl }).eq('id', STORY_ID)
  if (dbErr) throw new Error('DB: ' + dbErr.message)
  console.log(`✅  ${publicUrl}\n`)
  fs.rmSync(tmp, { recursive: true })
}

main().catch(e => { console.error('\n❌  FATAL:', e.message); process.exit(1) })
